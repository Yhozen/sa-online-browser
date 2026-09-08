// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';import * as THREE from 'three';
import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import {CharacterAnimation}from'../apps/browser/src/character-animation.ts';
import {SimulationClock}from'../apps/browser/src/simulation-clock.ts';
test('actual exported rig plays transient jump and seated poses between sparse render frames',async()=>{
 const bytes=readFileSync('apps/browser/public/assets/neighbor.glb');
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
