// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { instantiateStatic, surfaceMaterials } from "./assets";

/** Continuous ridgelines beyond the closed fixture; no change to playable terrain. */
export function buildHorizon(scene: THREE.Scene, groundZ: number) {
  const noise=(x:number,y:number)=> {
    const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
    const hash=(a:number,b:number)=>{const q=Math.sin(a*127.1+b*311.7)*43758.5453;return q-Math.floor(q);};
    const sx=u*u*(3-2*u),sy=v*v*(3-2*v);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
  };
  for (let layer = 0; layer < 3; layer++) {
    const segments = 480, rings = 60, vertices: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2, r = 130 + layer * 125 + j * 4;
      const ridge = 34 + layer * 13 + 22 * Math.sin(a * 3 + layer) + 15 * Math.sin(a * 7 + 1.2) + 8 * Math.sin(a * 13 + j * .026);
      const envelope = Math.sin(j / rings * Math.PI);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const erosion=1-Math.abs(noise(x/22+noise(x/55,y/55)*3,y/22)*2-1);
      const detail=erosion*10+(noise(x/7,y/7)-.5)*3+(noise(x/3,y/3)-.5)*1.3;
      const z = Math.max(-3, (ridge * .45 + detail - 3) * envelope - 6);
      vertices.push(x, y, groundZ + z);
      uv.push(x / 8, y / 8);
      const shade = .87 + erosion * .22;
      const c = new THREE.Color(layer === 0 ? 0xb6a383 : layer === 1 ? 0xb3b09b : 0xb6bdb1).multiplyScalar(shade);
      const scrub=noise(x/9,y/9);
      if(scrub>.55) c.lerp(new THREE.Color(0x858b66),Math.min(.52,(scrub-.55)*2));
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
    placements.push({asset:'tree',position:[side===0 ? -92 : side===1 ? 92 : t,side===2 ? -92 : side===3 ? 92 : t,groundZ-4.2],rotation:i*1.7,scale:[2.7,2.7,1.3]});
  }
  // The lower scrub tier fills the trunk void beneath the upper hedge crowns.
  for (const p of placements.filter((_,i)=>i%2===1))
    placements.push({...p,position:[p.position[0],p.position[1],p.position[2]-1.7],rotation:p.rotation+1});
  instantiateStatic(scene,placements);
}
