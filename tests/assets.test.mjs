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
