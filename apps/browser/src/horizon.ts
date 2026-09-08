// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { instantiateStatic, surfaceMaterials } from "./assets";

/** Continuous ridgelines beyond the closed fixture; no change to playable terrain. */
export function buildHorizon(scene: THREE.Scene, groundZ: number) {
  for (let layer = 0; layer < 3; layer++) {
    const segments = 240, rings = 12, vertices: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2, r = 130 + layer * 125 + j * 20;
      const ridge = 34 + layer * 13 + 22 * Math.sin(a * 3 + layer) + 15 * Math.sin(a * 7 + 1.2) + 8 * Math.sin(a * 13 + j * .13);
      const envelope = Math.sin(j / rings * Math.PI);
      const detail = Math.sin(a * 31 + j * 1.2) * 2.8 + Math.cos(a * 57 - j) * 1.5;
      const z = Math.max(-3, ridge * envelope + detail * envelope - 9);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      vertices.push(x, y, groundZ + z);
      uv.push(x / 8, y / 8);
      const shade = .88 + Math.sin(a * 23 + j * 2.3) * .055;
      const c = new THREE.Color(layer === 0 ? 0x8e886d : layer === 1 ? 0x939a8e : 0x9eaaa2).multiplyScalar(shade);
      colors.push(c.r,c.g,c.b);
      if (j < rings && i < segments) { const k = j * (segments + 1) + i; indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({color:0xe9dfc0, vertexColors:true, roughness:1, map:surfaceMaterials.get('grass')?.map});
    const mesh = new THREE.Mesh(geometry,material); scene.add(mesh);
  }
  // Vegetated edges conceal the boundary walls. These are outside the playable envelope.
  const placements = [];
  // Square perimeter: all roots remain outside the +/-90m playable footprint.
  for(let i=0;i<64;i++) {
    const side=Math.floor(i/16), t=(i%16)/15*202-101;
    const edge=96+Math.sin(i*4.7)*2;
    const x=side===0 ? -edge : side===1 ? edge : t;
    const y=side===2 ? -edge : side===3 ? edge : t;
    const height=1.2+(Math.sin(i*2.9)+1)*.55;
    placements.push({asset:'tree',position:[x,y,groundZ],rotation:i*2.4,scale:[height,height,height]});
    // Layered low scrub masks the wall face while keeping the boundary visibly closed.
    placements.push({asset:'tree',position:[x,y,groundZ-4.7],rotation:i*1.7,scale:[1.9,1.9,1.25]});
  }
  instantiateStatic(scene,placements);
}
