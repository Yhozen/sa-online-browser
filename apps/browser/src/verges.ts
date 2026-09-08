// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type { SceneManifest } from '../../../packages/shared/scene';

/** Original bent grass blades along the outside of sidewalks, below ankle height. */
export function plantVerges(scene: THREE.Scene, manifest: SceneManifest) {
  let seed=918; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const positions:number[]=[],colors:number[]=[];
  for(let blade=0;blade<7;blade++) {
    const angle=random()*Math.PI*2,h=.04+random()*.13,w=.002+random()*.004;
    const dx=Math.cos(angle),dy=Math.sin(angle),bend=.025+random()*.065;
    const vertices=[[-dy*w,dx*w,0],[dy*w,-dx*w,0],[dx*bend,dy*bend,h*.65],[-dy*w,dx*w,0],[dx*bend,dy*bend,h*.65],[dx*bend*.5,dy*bend*.5,h]];
    for(const [x,y,z] of vertices) {
      positions.push(x,y,z);
      const c=new THREE.Color(blade%3===0?0x9e8b49:0x636c38).multiplyScalar(.65+z/h*.35);
      colors.push(c.r,c.g,c.b);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const matrices:THREE.Matrix4[]=[],dummy=new THREE.Object3D();
  for(const road of manifest.roads) for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),vertical=a[0]===b[0];
    for(let t=0;t<length;t+=.13) for(const side of [-1,1]) {
      if(random()<.3)continue;
      const offset=side*(road.width/2+2.5+random()*.45);
      const x=a[0]+(b[0]-a[0])*t/length+(vertical?offset:0),y=a[1]+(b[1]-a[1])*t/length+(vertical?0:offset);
      if(manifest.culdesac && Math.hypot(x-manifest.culdesac.center[0],y-manifest.culdesac.center[1])<manifest.culdesac.radius+2.6)continue;
      if(manifest.roads.some(r=>r!==road && r.points.slice(1).some((end,j)=>x>=Math.min(end[0],r.points[j][0])-r.width/2-2.5 && x<=Math.max(end[0],r.points[j][0])+r.width/2+2.5 && y>=Math.min(end[1],r.points[j][1])-r.width/2-2.5 && y<=Math.max(end[1],r.points[j][1])+r.width/2+2.5)))continue;
      dummy.position.set(x,y,manifest.groundZ-.015);dummy.rotation.z=random()*Math.PI*2;dummy.updateMatrix();matrices.push(dummy.matrix.clone());
    }
  }
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1}),matrices.length);
  matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
}
