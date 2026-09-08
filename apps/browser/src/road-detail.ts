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
  const cracks:number[]=[];
  for(let i=0;i<400;i++) {
    const x=random()*145-50,y=random()*150-78;if(!onRoad(x,y))continue;
    if(i%4===0) {
      const w=.8+random()*2.3,d=.7+random()*2.2;
      const points=[[x-w,y-d],[x+w*.8,y-d*.8],[x+w,y+d],[x-w*.7,y+d*.9]];
      if(points.every(([px,py])=>onRoad(px,py))) {
        const base=verts.length/3;for(const [px,py]of points){verts.push(px,py,m.groundZ+.059);uv.push(px/3,py/3);}
        indices.push(base,base+1,base+2,base,base+2,base+3);
      }
    }
    let px=x,py=y;const a=random()*Math.PI*2;
    for(let j=0;j<7;j++) {
      const nx=px+Math.cos(a+(random()-.5)*1.2)*.5,ny=py+Math.sin(a+(random()-.5)*1.2)*.5;
      if(!onRoad(nx,ny))break;
      // Irregular 1–3cm sealed cracks, actual world geometry, no screen-space overlay.
      const width=.009+random()*.016,dx=ny-py,dy=px-nx,length=Math.hypot(dx,dy);
      const ox=dx/length*width,oy=dy/length*width,z=m.groundZ+.063;
      cracks.push(px-ox,py-oy,z,nx-ox,ny-oy,z,nx+ox,ny+oy,z,px-ox,py-oy,z,nx+ox,ny+oy,z,px+ox,py+oy,z);
      px=nx;py=ny;
    }
  }
  const patch=new THREE.BufferGeometry();patch.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));patch.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));patch.setIndex(indices);patch.computeVertexNormals();
  const material=surfaceMaterials.get('asphalt')!.clone();material.color.set(0x757875);material.roughness=.98;
  const mesh=new THREE.Mesh(patch,material);mesh.receiveShadow=true;scene.add(mesh);
  const crackGeometry=new THREE.BufferGeometry();crackGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cracks,3));crackGeometry.computeVertexNormals();
  const crack=new THREE.Mesh(crackGeometry,new THREE.MeshStandardMaterial({color:0x292b28,roughness:.96,side:THREE.DoubleSide}));crack.receiveShadow=true;scene.add(crack);
}
