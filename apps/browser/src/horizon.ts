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

function decodeTerrainField(encoded: string, expectedBytes: number) {
  const binary = atob(encoded);
  if (binary.length !== expectedBytes) throw new Error("Invalid packed terrain field length");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function decodeTerrain16(encoded: string, count: number, signed: boolean) {
  const bytes = decodeTerrainField(encoded, count * 2), view = new DataView(bytes.buffer);
  const values = signed ? new Int16Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) values[i] = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
  return values;
}

/** Original remeshed upper ridges with one static, linear irradiance bake.
 * Sun direction is fixed in this neighborhood; the player only moves its
 * shadow-camera target. Neither quality preset relights this diffuse bake.
 * Texture identity, shared map sampling and distance fog stay unchanged. */
export function buildHorizon(scene: THREE.Scene, groundZ: number) {
  const { segments, rings } = sculpt, stride = segments + 1;
  const count = stride * (rings + 1);
  if (sculpt.version !== 4 || sculpt.layers.length !== 3) throw new Error("Unsupported packed terrain");
  for (let layer = 0; layer < 3; layer++) {
    const data = sculpt.layers[layer];
    const crownRadius = decodeTerrain16(data.crownRadius, stride, false);
    const elevation = decodeTerrain16(data.elevation, count, true);
    const irradiance = decodeTerrainField(data.irradiance, count * 3);
    const geology = decodeTerrainField(data.geology, count * 2);
    const width = 90 + layer * 50, inner = 250 + layer * 125 - width * .47;
    const positions = new Float32Array(stride * (rings + 1) * 3);
    const uv = new Float32Array(stride * (rings + 1) * 2), indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      const crest = inner + crownRadius[i] / sculpt.crownRadiusScale;
      const radius = j < sculpt.innerFractions.length
        ? THREE.MathUtils.lerp(inner, crest, sculpt.innerFractions[j])
        : THREE.MathUtils.lerp(crest, inner + width, sculpt.outerFractions[j - sculpt.innerFractions.length]);
      const a = i / segments * Math.PI * 2, k = j * stride + i;
      positions[k * 3] = Math.cos(a) * radius;
      positions[k * 3 + 1] = i === segments ? 0 : Math.sin(a) * radius;
      positions[k * 3 + 2] = groundZ + elevation[k] / sculpt.elevationScale;
      uv[k * 2] = positions[k * 3] / 8; uv[k * 2 + 1] = positions[k * 3 + 1] / 8;
      if (j < rings && i < segments) indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(irradiance, 3, true));
    geometry.setAttribute("terrainMix", new THREE.BufferAttribute(geology, 2, true));
    geometry.setIndex(indices);
    // A Basic material deliberately bypasses both the Standard light stack and
    // applyQuality's Standard-to-Basic conversion, preserving its shader in Low.
    const grass = surfaceMaterials.get("grass"), concrete = surfaceMaterials.get("concrete");
    const material = new THREE.MeshBasicMaterial({ name: `Arroyo baked ridge ${layer}`,
      vertexColors: true, map: grass?.map, fog: true });
    material.onBeforeCompile = shader => {
      shader.uniforms.arroyoRock = { value: concrete?.map ?? grass?.map };
      shader.uniforms.arroyoDry = { value: new THREE.Color(0xbda174) };
      shader.uniforms.arroyoMineral = { value: new THREE.Color(0xdec6a0) };
      shader.uniforms.arroyoScrub = { value: new THREE.Color(0x535b3c) };
      shader.uniforms.arroyoIrradianceScale = { value: sculpt.irradianceScale };
      shader.vertexShader = `attribute vec2 terrainMix; varying vec2 vTerrainMix;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTerrainMix = terrainMix;");
      shader.fragmentShader = `uniform sampler2D arroyoRock;
        uniform vec3 arroyoDry, arroyoMineral, arroyoScrub;
        uniform float arroyoIrradianceScale; varying vec2 vTerrainMix;\n${shader.fragmentShader}`
        .replace("#include <map_fragment>", `
          vec3 pigment = mix(arroyoDry, arroyoMineral, vTerrainMix.x * .9);
          pigment = mix(pigment, arroyoScrub, vTerrainMix.y * .9);
          diffuseColor.rgb *= pigment * arroyoIrradianceScale;
          #ifdef USE_MAP
            vec3 dryCover = texture2D(map, vMapUv).rgb;
            vec3 mineral = texture2D(arroyoRock, vMapUv * .41 + vec2(.17,.31)).rgb;
            mineral = mix(vec3(dot(mineral, vec3(.3,.59,.11))), mineral, .22);
            mineral *= vec3(1.06,1.00,.88);
            vec3 cover = mix(dryCover, mineral, vTerrainMix.x * .95);
            cover = mix(cover, dryCover * vec3(.64,.75,.47), vTerrainMix.y * .70);
            diffuseColor.rgb *= cover;
          #endif
        `)
        .replace("#include <fog_fragment>", THREE.ShaderChunk.fog_fragment.replace("fogColor, fogFactor", "fogColor, fogFactor * .7"));
    };
    material.customProgramCacheKey = () => "arroyo-remeshed-baked-irradiance-v1";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Arroyo eroded ridge ${layer}`; scene.add(mesh);
  }

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
