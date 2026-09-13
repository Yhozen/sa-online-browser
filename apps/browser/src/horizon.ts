// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { instantiateStatic, surfaceMaterials } from "./assets";
import type { Placement } from "../../../packages/shared/scene";
import sculpt from "../../../assets/horizon-relief.json";

const fract = (v: number) => v - Math.floor(v);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = fract(x), v = fract(y);
  const sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}

/** Static terrain sits beyond the player's shadow map. Bake geological cover
 * and missing self-visibility into colors; the live sun supplies plane shading.
 * Samples follow the authored radial heightfields, including adjacent layers.
 * This adds no textures, draw calls, shader branches, or per-frame work. */
function bakeTerrainVisibility(geometries: THREE.BufferGeometry[]) {
  const { segments, rings } = sculpt, stride = segments + 1;
  const fields = geometries.map((geometry, layer) => ({
    positions: geometry.getAttribute("position"),
    width: 90 + layer * 50,
    inner: 250 + layer * 125 - (90 + layer * 50) * .47,
  }));
  function heightAt(x: number, y: number) {
    const radius = Math.hypot(x, y);
    const angle = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1 * segments;
    const i = Math.floor(angle), u = angle - i;
    let height = -Infinity;
    for (const field of fields) {
      const radial = (radius - field.inner) / field.width * rings;
      if (radial < 0 || radial > rings) continue;
      const j = Math.min(rings - 1, Math.floor(radial)), v = radial - j;
      const k = j * stride + i, p = field.positions;
      // Match the mesh's triangle diagonal rather than averaging over a wash.
      const z = u + v <= 1
        ? p.getZ(k) + (p.getZ(k + 1) - p.getZ(k)) * u + (p.getZ(k + stride) - p.getZ(k)) * v
        : p.getZ(k + stride + 1) + (p.getZ(k + stride) - p.getZ(k + stride + 1)) * (1 - u)
          + (p.getZ(k + 1) - p.getZ(k + stride + 1)) * (1 - v);
      height = Math.max(height, z);
    }
    return height;
  }
  // Keep this direction aligned with installAtmosphere's fixed sun offset.
  const sun = new THREE.Vector3(-58, 12, 47).normalize();
  const horizontal = Math.hypot(sun.x, sun.y), sx = sun.x / horizontal, sy = sun.y / horizontal;
  const sunSlope = sun.z / horizontal;
  const sunSteps = [2, 4, 7, 11, 16, 23, 32, 44, 60, 82, 112];
  const skySteps = [2, 5, 11, 23, 47, 95];
  const skyDirections = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const luminance = (c: THREE.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
  const color = new THREE.Color(), cool = new THREE.Color(0x6b94c1), tint = new THREE.Color();
  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    const colors = geometry.getAttribute("color"), areas = new Float32Array(positions.count);
    const crowns = new Uint8Array(stride), drainage = new Float32Array(stride);
    const depth = (i: number, j: number) => {
      const at = (offset: number) => positions.getZ(j * stride + (i + offset + segments) % segments);
      // Connected broad washes and smaller tributaries come from the sculpt,
      // rather than world-space noise painted across unrelated rock planes.
      return Math.max(0, (at(-1) + at(1)) * .5 - at(0)) * .45
        + Math.max(0, (at(-3) + at(3)) * .5 - at(0)) * .4
        + Math.max(0, (at(-7) + at(7)) * .5 - at(0)) * .15;
    };
    for (let i = 0; i <= segments; i++) {
      for (let j = 1; j <= rings; j++)
        if (positions.getZ(j * stride + i) > positions.getZ(crowns[i] * stride + i)) crowns[i] = j;
      // Weathered darker bedrock follows each existing drainage up to the
      // rounded crown. Its upper paint need not create another jagged summit.
      drainage[i] = depth(i, Math.max(0, crowns[i] - 5)) * .5
        + depth(i, Math.max(0, crowns[i] - 9)) * .3
        + depth(i, Math.max(0, crowns[i] - 13)) * .2;
    }
    const indices = geometry.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const ia = indices.getX(triangle), ib = indices.getX(triangle + 1), ic = indices.getX(triangle + 2);
      a.fromBufferAttribute(positions, ia); b.fromBufferAttribute(positions, ib); c.fromBufferAttribute(positions, ic);
      const area = b.sub(a).cross(c.sub(a)).length();
      areas[ia] += area; areas[ib] += area; areas[ic] += area;
    }
    // Visibility varies across metre-scale folds, so a two-cell bake grid is
    // enough; interpolate it over the unchanged full-resolution render mesh.
    const sampleColumns = Math.ceil(segments / 2) + 1, sampleRows = Math.ceil(rings / 2) + 1;
    const sunSamples = new Float32Array(sampleColumns * sampleRows), skySamples = new Float32Array(sunSamples.length);
    for (let row = 0; row < sampleRows; row++) for (let column = 0; column < sampleColumns; column++) {
      const k = Math.min(rings, row * 2) * stride + Math.min(segments, column * 2);
      const x = positions.getX(k), y = positions.getY(k), z = positions.getZ(k) + .18;
      const nx = normals.getX(k), ny = normals.getY(k), nz = normals.getZ(k);
      let sunHorizon = -Infinity;
      for (const distance of sunSteps)
        sunHorizon = Math.max(sunHorizon, (heightAt(x + sx * distance, y + sy * distance) - z) / distance);
      const visibleSun = THREE.MathUtils.smoothstep(sunSlope - sunHorizon, -.025, .025);
      let openSky = 0, visibleSky = 0;
      for (const [dx, dy] of skyDirections) {
        let horizon = 0;
        for (const distance of skySteps)
          horizon = Math.max(horizon, (heightAt(x + dx * distance, y + dy * distance) - z) / distance);
        const facing = nx * dx + ny * dy;
        // Integrate cosine-weighted sky above the horizon in this azimuth.
        // A surface cannot receive sky behind its own tangent plane.
        const tangent = Math.max(0, Math.atan2(-facing, Math.max(.001, nz)));
        const integral = (low: number) => facing * (Math.PI / 4 - low / 2 - Math.sin(2 * low) / 4)
          + nz * Math.cos(low) ** 2 / 2;
        openSky += integral(tangent);
        visibleSky += integral(Math.max(tangent, Math.atan(horizon)));
      }
      const skyVisibility = THREE.MathUtils.clamp(visibleSky / Math.max(.001, openSky), 0, 1);
      sunSamples[row * sampleColumns + column] = visibleSun;
      skySamples[row * sampleColumns + column] = skyVisibility;
    }
    const sample = (values: Float32Array, i: number, j: number) => {
      const column = Math.min(sampleColumns - 2, Math.floor(i / 2)), row = Math.min(sampleRows - 2, Math.floor(j / 2));
      const u = (i - column * 2) / Math.min(2, segments - column * 2), v = (j - row * 2) / Math.min(2, rings - row * 2);
      const k = row * sampleColumns + column;
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(values[k], values[k + 1], u),
        THREE.MathUtils.lerp(values[k + sampleColumns], values[k + sampleColumns + 1], u), v);
    };
    let beforeEnergy = 0, afterEnergy = 0;
    for (let k = 0; k < positions.count; k++) {
      const i = k % stride, j = Math.floor(k / stride);
      const visibleSun = sample(sunSamples, i, j), skyVisibility = sample(skySamples, i, j);
      const nx = normals.getX(k), ny = normals.getY(k), nz = normals.getZ(k);
      const direct = 6.2 * Math.max(0, nx * sun.x + ny * sun.y + nz * sun.z);
      const sky = 1.55 * (.5 + .5 * Math.max(0, nz)) + .34, bounce = .2;
      const transmitted = (direct * visibleSun + sky * skyVisibility + bounce) / (direct + sky + bounce);
      color.fromBufferAttribute(colors, k);
      const energy = luminance(color);
      beforeEnergy += energy * areas[k];
      const wash = THREE.MathUtils.smoothstep(drainage[i] * .7 + depth(i, j) * .3, .04, .7);
      // Occluded sunlight leaves blue sky fill. Preserve tint luminance before
      // applying the energy loss, so cool valleys do not acquire bright paint.
      tint.copy(cool).multiplyScalar(energy / luminance(cool));
      color.lerp(tint, Math.min(.94, wash * .82 + (1 - visibleSun) * .72 + (1 - skyVisibility) * .18))
        .multiplyScalar(transmitted * (1.22 - wash * .88));
      colors.setXYZ(k, color.r, color.g, color.b);
      afterEnergy += luminance(color) * areas[k];
    }
    // Preserve each layer's area-weighted mean linear albedo while moving
    // contrast from occluded, weathered washes to exposed mineral ridgelines.
    const exposure = beforeEnergy / Math.max(.001, afterEnergy);
    for (let k = 0; k < colors.count; k++)
      colors.setXYZ(k, colors.getX(k) * exposure, colors.getY(k) * exposure, colors.getZ(k) * exposure);
  }
}

/** Eroded ridge networks beyond the closed, level playable fixture. */
export function buildHorizon(scene: THREE.Scene, groundZ: number) {
  const dry = new THREE.Color(0xbda174), rock = new THREE.Color(0xdec6a0), scrub = new THREE.Color(0x535b3c);
  const terrain: THREE.BufferGeometry[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const { segments, rings } = sculpt, geology = sculpt.layers[layer];
    const vertices: number[] = [], colors: number[] = [], uv: number[] = [], mix: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      // Blender exports the complete sculpt, including connected cuts across
      // the visible upper faces. Keep its geometry authoritative at runtime.
      const width = 90 + layer * 50;
      const a = i / segments * Math.PI * 2, r = 250 + layer * 125 - width * .47 + j / rings * width;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const sample = j * (segments + 1) + i;
      vertices.push(x, y, groundZ + geology.elevation[sample]);
      uv.push(x / 8, y / 8);
      const stony = geology.mineral[sample] / 255;
      const vegetation = geology.vegetation[sample] / 255;
      mix.push(stony, vegetation);
      const color = dry.clone().lerp(rock, stony * .9).lerp(scrub, vegetation * .9);
      color.multiplyScalar(.95 + stony * .09 - vegetation * .06);
      if (layer) color.lerp(new THREE.Color(layer === 1 ? 0xb7b2a0 : 0xc0c2b6), layer * .14);
      colors.push(color.r, color.g, color.b);
      if (j < rings && i < segments) {
        const k = j * (segments + 1) + i;
        indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute("terrainMix", new THREE.Float32BufferAttribute(mix, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // UVs retain separate angular endpoints, but the closed sculpt is one
    // continuous surface. Share its two half-neighborhood shading normals so
    // the authoring seam cannot reappear as a hard lighting edge.
    const seamNormal = new THREE.Vector3(), otherNormal = new THREE.Vector3();
    const terrainNormals = geometry.getAttribute("normal");
    for (let j = 0; j <= rings; j++) {
      const first = j * (segments + 1), last = first + segments;
      seamNormal.fromBufferAttribute(terrainNormals, first)
        .add(otherNormal.fromBufferAttribute(terrainNormals, last)).normalize();
      terrainNormals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
      terrainNormals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
    }
    terrain.push(geometry);
    // Mineral hue follows the actual newly sculpted planes. Cool, sheltered
    // folds expose darker stone; sunward shoulders retain ochre. The overall
    // albedo compensates for the larger area of exposed rock instead of
    // increasing the horizon's brightness with its new surface definition.
    const normals = geometry.getAttribute("normal"), colorAttribute = geometry.getAttribute("color");
    const sunward = new THREE.Vector3(-58, 12, 0).normalize();
    const ochre = new THREE.Color(0xbfa16d), shadedRock = new THREE.Color(0x8798a1);
    const luminance = (c: THREE.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
    const faceColor = new THREE.Color(), tint = new THREE.Color();
    for (let k = 0; k < normals.count; k++) {
      const aspect = THREE.MathUtils.clamp((normals.getX(k) * sunward.x + normals.getY(k) * sunward.y) * 2.5, -1, 1);
      faceColor.fromBufferAttribute(colorAttribute, k);
      tint.copy(aspect >= 0 ? ochre : shadedRock).multiplyScalar(luminance(faceColor) / luminance(aspect >= 0 ? ochre : shadedRock));
      faceColor.lerp(tint, Math.abs(aspect) * .78);
      faceColor.multiplyScalar(.69 * (1 + .10 * Math.max(0, aspect) - .45 * Math.max(0, -aspect)));
      colorAttribute.setXYZ(k, faceColor.r, faceColor.g, faceColor.b);
    }
    const grass = surfaceMaterials.get("grass"), concrete = surfaceMaterials.get("concrete");
    const material = new THREE.MeshStandardMaterial({ color: 0xf1e9d9, vertexColors: true, roughness: 1,
      map: grass?.map, normalMap: grass?.normalMap, normalScale: new THREE.Vector2(.16, .16) });
    if (grass?.map && concrete?.map) {
      material.onBeforeCompile = shader => {
        shader.uniforms.arroyoRock = { value: concrete.map };
        shader.vertexShader = `attribute vec2 terrainMix; varying vec2 vTerrainMix;\n${shader.vertexShader}`
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTerrainMix = terrainMix;");
        shader.fragmentShader = `uniform sampler2D arroyoRock; varying vec2 vTerrainMix;\n${shader.fragmentShader}`
          .replace("#include <map_fragment>", `
            #ifdef USE_MAP
              vec3 dryCover = texture2D(map, vMapUv).rgb;
              vec3 mineral = texture2D(arroyoRock, vMapUv * .41 + vec2(.17,.31)).rgb;
              // Original concrete supplies exposed mineral grain; grass supplies dry scrub.
              mineral = mix(vec3(dot(mineral, vec3(.3,.59,.11))), mineral, .22);
              mineral *= vec3(1.06,1.00,.88);
              vec3 terrain = mix(dryCover, mineral, vTerrainMix.x * .95);
              terrain = mix(terrain, dryCover * vec3(.64,.75,.47), vTerrainMix.y * .70);
              diffuseColor.rgb *= terrain;
            #endif
          `)
          // Elevated distant terrain retains more clear-air contrast than the
          // ground haze through the neighborhood; sky/background stay untouched.
          .replace("#include <fog_fragment>", THREE.ShaderChunk.fog_fragment.replace("fogColor, fogFactor", "fogColor, fogFactor * .7"));
      };
      material.customProgramCacheKey = () => "arroyo-watershed-terrain-v5";
    }
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Arroyo eroded ridge ${layer}`;
    mesh.receiveShadow = true; scene.add(mesh);
  }
  bakeTerrainVisibility(terrain);

  const placements: Placement[] = [];
  let seed = 6303;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function point(side: number, along: number, edge: number): [number, number] {
    return side === 0 ? [-edge, along] : side === 1 ? [edge, along] : side === 2 ? [along, -edge] : [along, edge];
  }
  for (let side = 0; side < 4; side++) {
    // Tree foliage occupies local Z≈4.15–8.46m and ±4m horizontally. Derive
    // buried-root heights from those actual bounds: upper leaves span 0.7–9.7m,
    // lower leaves span −0.25–7.3m. Both tiers extend across the wall's inner ±89m
    // face, while every root stays outside ±90m. This masks the full 4m wall,
    // rather than placing small shrubs entirely behind its opaque face.
    for (let along = -99; along < 105; along += 9.5 + random() * 3.5) {
      const [x, y] = point(side, along, 90.15 + random() * .55);
      // Keep the existing instance count, but restore individual upright
      // crowns instead of stretching every tree into a low horizontal strip.
      const width = 1.68 + random() * .44, height = 1.12 + random() * .96;
      const upperRootDepth = height * 4.15 - .7;
      placements.push({ asset: "tree", position: [x, y, groundZ - upperRootDepth],
        rotation: random() * Math.PI * 2, scale: [width, width * (.92 + random() * .13), height] });
      const [bx, by] = point(side, along + 3.2 + random() * 1.5, 90.25 + random() * .65);
      const lowerWidth = 1.95 + random() * .55, lowerHeight = 1.35 + random() * .40;
      placements.push({ asset: "tree", position: [bx, by, groundZ - lowerHeight * 4.15 - .25],
        rotation: random() * Math.PI * 2, scale: [lowerWidth, lowerWidth * (.95 + random() * .12), lowerHeight] });
    }
    // Taller trees are clustered well behind the scrub, rather than a fence-height row.
    for (let group = 0; group < 7; group++) {
      const along = -95 + group * 29 + (random() - .5) * 10;
      for (let member = 0; member < (group % 3 === 0 ? 3 : 2); member++) {
        const [x, y] = point(side, along + member * 6 + random() * 3, 102 + random() * 13);
        const scale = 1.02 + random() * .72;
        placements.push({ asset: "tree", position: [x, y, groundZ - .4], rotation: random() * Math.PI * 2,
          scale: [scale * (.85 + random() * .2), scale, scale] });
      }
    }
  }
  const firstTreeBatch = scene.children.length;
  instantiateStatic(scene, placements);
  const matrix = new THREE.Matrix4(), foliage = new THREE.Color();
  const olive = new THREE.Color().setRGB(.81, .89, .76), gold = new THREE.Color().setRGB(1.06, .98, .80);
  for (const mesh of scene.children.slice(firstTreeBatch)) {
    if (!(mesh instanceof THREE.InstancedMesh)) continue;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(material => material.name.startsWith("foliage"))) continue;
    // Stable per-crown cover variation shares the existing batched meshes and
    // material textures. It adds only instance colors, never cloned materials.
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      foliage.copy(gold).lerp(olive, noise(matrix.elements[12] * .13, matrix.elements[13] * .13));
      mesh.setColorAt(i, foliage);
    }
  }
}
