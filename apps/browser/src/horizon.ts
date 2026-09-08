// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { instantiateStatic, surfaceMaterials } from "./assets";
import type { Placement } from "../../../packages/shared/scene";

const fract = (v: number) => v - Math.floor(v);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = fract(x), v = fract(y);
  const sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}

/** Eroded ridge networks beyond the closed, level playable fixture. */
export function buildHorizon(scene: THREE.Scene, groundZ: number) {
  const dry = new THREE.Color(0xb5a184), rock = new THREE.Color(0xcbb495), scrub = new THREE.Color(0x626d45);
  for (let layer = 0; layer < 3; layer++) {
    const segments = 480, rings = 60;
    const acceptedHeights: number[] = [];
    const vertices: number[] = [], colors: number[] = [], uv: number[] = [], mix: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      // Preserve the skyline's angular size and crest distance, but give each
      // ridge a narrower physical apron. Broad low dunes could not catch a
      // directional sun; steeper valley walls reveal separate lit/shaded faces.
      const width = 90 + layer * 50;
      const a = i / segments * Math.PI * 2, r = 250 + layer * 125 - width * .47 + j / rings * width;
      const t = j / rings, x = Math.cos(a) * r, y = Math.sin(a) * r;
      // Preserve the broad accepted skyline, then shape individual watersheds beneath it.
      const broad = (34 + layer * 13 + 22 * Math.sin(a * 3 + layer) + 15 * Math.sin(a * 7 + 1.2)) * .45;
      const crest = .47 + (noise(Math.cos(a) * 4 + layer, Math.sin(a) * 4) - .5) * .15;
      const slope = Math.max(0, 1 - Math.abs((t - crest) / (t < crest ? crest : 1 - crest)));
      const profile = Math.pow(Math.sin(slope * Math.PI / 2), 1.15);
      // Meandering drainage cuts converge toward the lower apron; their shoulders form spurs.
      const basin = a * 13 + noise(x / 62, y / 62) * .73 + t * .22;
      const channel = Math.abs(fract(basin) - .5);
      const gully = Math.exp(-channel * channel * (36 + 110 * t));
      const tributary = Math.abs(fract(basin * 2.07 + noise(x / 28, y / 28) * .45) - .5);
      const rill = Math.exp(-tributary * tributary * 140);
      const shoulder = Math.pow(Math.min(1, channel * 2), .55);
      const coarse = noise(x / 11, y / 11), fine = noise(x / 3.1, y / 3.1);
      const ridgeBreak = (coarse - .5) * 3.4 + (fine - .5) * 1.0;
      // Broad rounded ridge shoulders retain drainage detail on their flanks;
      // suppress channel relief at the crest so it cannot form isolated conic peaks.
      const erosionMask = Math.pow(profile, .7) * (1 - .8 * Math.pow(slope, 6));
      // Broad weathered outcrops descend into connected vegetated washes. The
      // relief is only a subtractive flank cut: the accepted crest and apron
      // stay fixed, while a few 20–50m rock shoulders replace uniform pillows.
      const watershed = noise(x / 47 + 9.2, y / 47 - 3.1);
      const bedding = noise(x / 31 + noise(x / 75, y / 75) * 1.7, y / 56 + layer * 2);
      const flankCut = THREE.MathUtils.smoothstep(watershed, .33, .71) * 1.65 *
        Math.sin(slope * Math.PI) ** 2 * profile * (1 - THREE.MathUtils.smoothstep(slope, .55, .78));
      const accepted = Math.max(-3, broad * profile + (shoulder * 2.8 - gully * 3 - rill * 1.4 + ridgeBreak * .55) * erosionMask - 6);
      const z = Math.max(-3, accepted - flankCut);
      acceptedHeights.push(groundZ + accepted * .84);
      vertices.push(x, y, groundZ + z * .84);
      uv.push(x / 8, y / 8);
      const exposed = THREE.MathUtils.smoothstep(bedding + shoulder * .16 - gully * .12, .39, .63);
      const stony = THREE.MathUtils.clamp(exposed * .88 + shoulder * .12, 0, 1);
      const vegetation = THREE.MathUtils.clamp(
        THREE.MathUtils.smoothstep(watershed + gully * .18, .35, .61) * (1 - exposed * .83), 0, 1);
      mix.push(stony, vegetation);
      const color = dry.clone().lerp(rock, stony * .82).lerp(scrub, vegetation * .88);
      color.multiplyScalar(.95 + shoulder * .12 - gully * .09);
      if (layer) color.lerp(new THREE.Color(layer === 1 ? 0xb7b2a0 : 0xc0c2b6), layer * .14);
      colors.push(color.r, color.g, color.b);
      if (j < rings && i < segments) {
        const k = j * (segments + 1) + i;
        indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
      }
    }
    // Lock the upper one-metre crest band on each azimuth, including unusually
    // low saddles: the new geology cannot change the accepted skyline.
    for (let i = 0; i <= segments; i++) {
      let crestHeight = -Infinity;
      for (let j = 0; j <= rings; j++) crestHeight = Math.max(crestHeight, acceptedHeights[j * (segments + 1) + i]);
      for (let j = 0; j <= rings; j++) {
        const k = j * (segments + 1) + i;
        if (acceptedHeights[k] >= crestHeight - 1) vertices[k * 3 + 2] = acceptedHeights[k];
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute("terrainMix", new THREE.Float32BufferAttribute(mix, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // Subtle warm mineral faces and cooler sheltered plant regions reinforce
    // the real normal/sun lighting, without baking a dark fake shadow mask.
    // This static ridge material keeps contrast broad; grain stays in maps.
    const normals = geometry.getAttribute("normal"), colorAttribute = geometry.getAttribute("color");
    const sunward = new THREE.Vector3(-48, -35, 0).normalize();
    for (let k = 0; k < normals.count; k++) {
      const aspect = THREE.MathUtils.clamp((normals.getX(k) * sunward.x + normals.getY(k) * sunward.y) * 2.5, -1, 1);
      const warm = Math.max(0, aspect), cool = Math.max(0, -aspect);
      colorAttribute.setXYZ(k,
        colorAttribute.getX(k) * (1 + .10 * warm - .045 * cool),
        colorAttribute.getY(k) * (1 + .025 * warm + .012 * cool),
        colorAttribute.getZ(k) * (1 - .055 * warm + .10 * cool));
    }
    const grass = surfaceMaterials.get("grass"), concrete = surfaceMaterials.get("concrete");
    const material = new THREE.MeshStandardMaterial({ color: 0xf1e9d9, vertexColors: true, roughness: 1,
      map: grass?.map, normalMap: grass?.normalMap, normalScale: new THREE.Vector2(.24, .24) });
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
              mineral *= vec3(.98,.90,.77);
              vec3 terrain = mix(dryCover, mineral, vTerrainMix.x * .95);
              terrain = mix(terrain, dryCover * vec3(.64,.75,.47), vTerrainMix.y * .70);
              diffuseColor.rgb *= terrain;
            #endif
          `);
      };
      material.customProgramCacheKey = () => "arroyo-watershed-terrain-v2";
    }
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Arroyo eroded ridge ${layer}`;
    mesh.receiveShadow = true; scene.add(mesh);
  }

  const placements: Placement[] = [];
  let seed = 6303;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function point(side: number, along: number, edge: number): [number, number] {
    return side === 0 ? [-edge, along] : side === 1 ? [edge, along] : side === 2 ? [along, -edge] : [along, edge];
  }
  for (let side = 0; side < 4; side++) {
    // Tree foliage occupies local Z≈4.15–8.46m and ±4m horizontally. Derive
    // buried-root heights from those actual bounds: upper leaves span 0.7–6.7m,
    // lower leaves span −0.25–4.4m. Both tiers extend across the wall's inner ±89m
    // face, while every root stays outside ±90m. This masks the full 4m wall,
    // rather than placing small shrubs entirely behind its opaque face.
    for (let along = -99; along < 105; along += 9.5 + random() * 3.5) {
      const [x, y] = point(side, along, 91.2 + random() * .55);
      const width = 2.15 + random() * .6, height = 1.15 + random() * .22;
      const upperRootDepth = height * 4.15 - .7;
      placements.push({ asset: "tree", position: [x, y, groundZ - upperRootDepth],
        rotation: random() * Math.PI * 2, scale: [width, width * (.92 + random() * .13), height] });
      const [bx, by] = point(side, along + 3.2 + random() * 1.5, 92.2 + random() * .8);
      const lowerWidth = 2.1 + random() * .65, lowerHeight = .88 + random() * .18;
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
  instantiateStatic(scene, placements);
}
