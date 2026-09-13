// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';import * as THREE from 'three';
import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import {CharacterAnimation}from'../apps/browser/src/character-animation.ts';
import {SimulationClock}from'../apps/browser/src/simulation-clock.ts';
test('actual exported rig plays transient jump and seated poses between sparse render frames',async()=>{
 const bytes=readFileSync(`${process.env.ASSET_TEST_DIR || 'apps/browser/public/assets'}/neighbor.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const actor=new CharacterAnimation(gltf.scene,gltf.animations),seen=new Set();let elapsed=0,peakBoneDelta=0;
 const bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o)});assert.ok(bones.length>5);
 const initial=bones.map(b=>b.quaternion.clone());
 const clock=new SimulationClock(0,dt=>{
  elapsed+=dt;const t=elapsed-.2,z=t>=0&&t<.78?10+Math.max(0,5.8*t-7.5*t*t):10;
  actor.advance({mode:elapsed>1.6?'passenger':'onFoot',position:[0,0,z],velocity:[0,0,0]},dt,9);
  seen.add(actor.current);
  if(actor.current==='jump')for(let i=0;i<bones.length;i++)peakBoneDelta=Math.max(peakBoneDelta,bones[i].quaternion.angleTo(initial[i]));
 });
 // A 1.4-second presentation gap contains an entire jump. Animation must still
 // enter its real clip, affect bones and consume real elapsed time.
 clock.advance(1400);clock.advance(2100);
 assert.ok(seen.has('jump'));assert.ok(seen.has('idle'));assert.ok(seen.has('seated'));
 assert.ok(peakBoneDelta>.05,'jump clip must move the actual skeleton');
 assert.ok(Math.abs(actor.mixer.time-2.1)<1e-8,'animation must not slow with rendering');
 assert.equal(actor.current,'seated');actor.dispose();
});


test('actual seated garment keeps its hem intact and shoulder deformation continuous',async()=>{
 const bytes=readFileSync(`${process.env.ASSET_TEST_DIR || 'apps/browser/public/assets'}/neighbor.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const shirt=[];
 gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&o.material.name==='outfit')shirt.push(o)});
 assert.ok(shirt.length,'inspect the exported garment, not a synthetic rig');
 const clip=gltf.animations.find(c=>c.name==='seated');assert.ok(clip);
 const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(clip).play();
 const regions={hem:{samples:0,peak:0},shoulder:{samples:0,peak:0}};
 let peakMotion=0;
 // Exercise early, middle and late poses of the actual exported seated clip.
 for(const fraction of [.1,.5,.9]){
  mixer.setTime(clip.duration*fraction);gltf.scene.updateMatrixWorld(true);
  for(const mesh of shirt){
   mesh.skeleton.update();
   const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
   const bind=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i));
   const posed=bind.map((p,i)=>mesh.applyBoneTransform(i,p.clone()));
   const visited=new Set();
   for(let triangle=0;triangle<index.count;triangle+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
    const i=index.getX(triangle+a),j=index.getX(triangle+b);
    const key=i<j?`${i}:${j}`:`${j}:${i}`;if(visited.has(key))continue;visited.add(key);
    const midpoint=bind[i].clone().add(bind[j]).multiplyScalar(.5);
    // glTF is Y-up. These broad anatomical regions are independent of the
    // recipe's mesh resolution, vertex groups and skin-weight calculation.
    const x=Math.abs(midpoint.x),height=midpoint.y;
    const region=height<.98&&x<.26?'hem':
      height>1.19&&height<1.32&&x>.16&&x<.30?'shoulder':null;
    const length=bind[i].distanceTo(bind[j]);if(!region||length<.001)continue;
    const stretch=posed[i].distanceTo(posed[j])/length;
    assert.ok(Number.isFinite(stretch),'posed cloth edges must stay finite');
    regions[region].samples++;regions[region].peak=Math.max(regions[region].peak,stretch);
    peakMotion=Math.max(peakMotion,bind[i].distanceTo(posed[i]));
   }
  }
 }
 assert.ok(peakMotion>.15,'the check must evaluate an actual deformed seated pose');
 assert.ok(regions.hem.samples>100&&regions.shoulder.samples>100,'sample both garment regions');
 // The original discontinuity stretched shoulder edges32x and dragged hem
 // edges10x when forearm influence caught the shirt tail. Broad tolerances
 // allow normal armpit compression and future topology changes while rejecting
 // that visible tear and the forearm-grab regression.
 assert.ok(regions.hem.peak<1.5,`seated shirt hem tears: ${regions.hem.peak.toFixed(2)}x`);
 assert.ok(regions.shoulder.peak<6,`seated shoulder tears: ${regions.shoulder.peak.toFixed(2)}x`);
 mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
});
