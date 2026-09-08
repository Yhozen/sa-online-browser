// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
async function load(name) {
  const bytes=readFileSync(`apps/browser/public/assets/${name}.glb`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root=new THREE.Group();gltf.scene.rotation.x=Math.PI/2;root.add(gltf.scene);root.updateMatrixWorld(true);
  return {root,gltf};
}
test('exported coupe axles roll without steering or moving their centers',async()=>{
  const {root}=await load('coupe');const wheels=[];
  root.traverse(o=>{if(/^wheel_(left|right)_\d+$/.test(o.name))wheels.push(o)});
  assert.equal(wheels.length,4);
  for(const wheel of wheels){
    const center=wheel.getWorldPosition(new THREE.Vector3());
    const axle=new THREE.Vector3(0,0,1).transformDirection(wheel.matrixWorld);
    assert.ok(Math.abs(axle.x)>.999,'glTF local Z must be the world X axle');
    const before=new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3());
    wheel.rotateZ(Math.PI/2);root.updateMatrixWorld(true);
    assert.ok(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(center)<1e-6);
    const after=new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3());
    assert.ok(Math.abs(after.x-before.x)<.002,'rolling must not rotate wheel thickness into its diameter');
    assert.ok(Math.abs(after.y-before.y)<.025 && Math.abs(after.z-before.z)<.025);
  }
  for(const [name,x]of [['seat_driver',-.42],['seat_passenger',.42]]) {
    const p=root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
    assert.ok(p.distanceTo(new THREE.Vector3(x,-.12,-.45))<.001);
  }
});
test('character retains four animated states and an actual skinned mesh',async()=>{
  const {root,gltf}=await load('neighbor');
  const names=new Set(gltf.animations.map(a=>a.name.split('|').at(-1)));
  for(const name of ['idle','walk','jump','seated'])assert.ok(names.has(name),name);
  const skins=[];root.traverse(o=>{if(o.isSkinnedMesh)skins.push(o)});
  assert.ok(skins.length);assert.ok(skins.every(s=>s.geometry.getAttribute('skinWeight').count>100));
});
test('all four houses expose actual recessed glazing through front and side masonry openings',async()=>{
  for(let variant=0;variant<4;variant++){
    const {root}=await load(`house-${variant}`);
    const cast=(origin,direction,material)=>{
      const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,3);
      return ray.intersectObject(root,true).find(hit=>!material||hit.object.material.name===material);
    };
    // Offset from center mullions: rays must see the actual exported glass first.
    const front=cast([-5.7,-7,2],[0,1,0]);
    assert.equal(front?.object.material.name,'window-glazing',`house-${variant}: front opening occluded`);
    assert.ok(front.point.y+6>.10&&front.point.y+6<.22,'front glass must sit 10–22cm behind exterior wall');
    const back=cast([-5.7,-7,2],[0,1,0],variant===2?'ivory':'stucco');
    assert.ok(back&&back.point.y+6>.32&&back.point.y+6<.46,'actual masonry cavity must remain behind glazing');
    for(const [origin,direction,depth]of [
      [[-9,3.8,2],[1,0,0],p=>p.x+8],
      [[9,-3.2,2],[-1,0,0],p=>8-p.x],
    ]){
      const side=cast(origin,direction);
      assert.equal(side?.object.material.name,'window-glazing',`house-${variant}: side opening occluded`);
      assert.ok(depth(side.point)>.15&&depth(side.point)<.25,'side glazing must be physically recessed 15–25cm');
    }
  }
});
test('oak normals follow its measured crown volume while original leaf UVs cover the alpha atlas',async()=>{
  const {root}=await load('tree'),center=new THREE.Vector3(0,0,6.05),radii=new THREE.Vector3(3.85,3.75,2.25);
  const bounds=new THREE.Box3(),samples=[],uvBounds=new THREE.Box2();
  root.traverse(o=>{
    if(!o.isMesh||!o.material.name.startsWith('foliage'))return;
    const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),uv=o.geometry.getAttribute('uv');
    assert.equal(n.count,p.count);assert.equal(uv.count,p.count);
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for(let i=0;i<p.count;i++){
      const position=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
      // Do not normalize before this assertion: malformed exported normals must fail.
      const normal=new THREE.Vector3().fromBufferAttribute(n,i);
      assert.ok(Number.isFinite(normal.length())&&Math.abs(normal.length()-1)<1e-5,'authored normal must be unit length');
      normal.applyMatrix3(normalMatrix).normalize();
      assert.ok(Number.isFinite(position.x+position.y+position.z+normal.x+normal.y+normal.z));
      const texel=new THREE.Vector2().fromBufferAttribute(uv,i);uvBounds.expandByPoint(texel);
      assert.ok(Number.isFinite(texel.x+texel.y)&&texel.x>=-1e-6&&texel.x<=1.000001&&texel.y>=-1e-6&&texel.y<=1.000001);
      bounds.expandByPoint(position);samples.push({position,normal});
    }
  });
  assert.ok(samples.length>1000);
  const height=bounds.max.z-bounds.min.z,midpoint=bounds.getCenter(new THREE.Vector3());
  assert.ok(height>4&&height<4.6,'preserve authored volumetric crown height');
  assert.ok(Math.abs(center.z-midpoint.z)<height*.10,'normal center must remain within 10% of measured crown height from its midpoint');
  assert.ok(Math.abs(center.x-midpoint.x)<.4&&Math.abs(center.y-midpoint.y)<.4);
  let alignment=0,lower=0;
  for(const {position,normal}of samples){
    const radial=position.clone().sub(center).divide(new THREE.Vector3(radii.x**2,radii.y**2,radii.z**2)).normalize();
    alignment+=normal.dot(radial);if(normal.z<0)lower++;
  }
  assert.ok(alignment/samples.length>.90,'canopy light must follow crown volume rather than arbitrary card planes');
  // Measured candidate is 41–43% downward-facing: both hemispheres exist around
  // the actual crown center. The old 5.15m center incorrectly forced >91% upward.
  assert.ok(lower/samples.length>.25&&lower/samples.length<.55,'retain a substantial shaded lower hemisphere without inverting the crown');
  assert.ok(uvBounds.min.x<.001&&uvBounds.min.y<.001&&uvBounds.max.x>.999&&uvBounds.max.y>.999,'leaf cards must retain complete original atlas UV coverage');
});
