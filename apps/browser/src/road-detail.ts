// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type { SceneManifest } from '../../../packages/shared/scene';
import { surfaceMaterials } from './assets';
/** Deterministic original repair shapes, laid over the physical albedo street surface. */
export function roadDetail(scene:THREE.Scene,m:SceneManifest) {
  let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const onRoad=(x:number,y:number)=>m.roads.some(r=>r.points.slice(1).some((b,i)=>{
    const a=r.points[i];return x>=Math.min(a[0],b[0])-r.width/2+.5 && x<=Math.max(a[0],b[0])+r.width/2-.5 && y>=Math.min(a[1],b[1])-r.width/2+.5 && y<=Math.max(a[1],b[1])+r.width/2-.5;
  })) || (!!m.culdesac && Math.hypot(x-m.culdesac.center[0],y-m.culdesac.center[1])<m.culdesac.radius-1);
  const verts:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<900;i++) {
    const x=random()*145-50,y=random()*150-78;if(!onRoad(x,y))continue;
    if(i%2===0) {
      const w=.3+random()*.65,d=.4+random()*.8;
      const points=Array.from({length:11},(_,j)=>{const a=j/11*Math.PI*2,r=.78+random()*.22;return [x+Math.cos(a)*w*r,y+Math.sin(a)*d*r];});
      if(points.every(([px,py])=>onRoad(px,py))) {
        const base=verts.length/3;for(const [px,py]of points){verts.push(px,py,m.groundZ+.059);uv.push(px/3,py/3);}
        for(let j=1;j<points.length-1;j++) indices.push(base,base+j,base+j+1);
      }
    }
  }
  const patch=new THREE.BufferGeometry();patch.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));patch.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));patch.setIndex(indices);patch.computeVertexNormals();
  const material=surfaceMaterials.get('asphalt')!.clone();material.color.set(0xa8aaa3);material.roughness=.98;
  const mesh=new THREE.Mesh(patch,material);mesh.receiveShadow=true;scene.add(mesh);
}
