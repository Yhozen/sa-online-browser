// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {prepareCanopyGeometry,installCanopyAccessibility} from '../apps/browser/src/canopy-lighting.ts';
import {transportCanopyVisibility} from '../tools/assets/canopy-visibility.mjs';

test('oak data must be finite and present; shared nonoak foliage gets identity without changing existing arrays',()=>{
  const geometry=new THREE.PlaneGeometry(),original=Object.fromEntries(Object.entries(geometry.attributes).map(([key,value])=>[key,value.array]));
  assert.throws(()=>prepareCanopyGeometry(geometry,true),/missing or invalid/);
  prepareCanopyGeometry(geometry,false);
  assert.ok(geometry.attributes._canopy_visibility.array.every(value=>value===1));
  for(const[key,array]of Object.entries(original))assert.equal(geometry.attributes[key].array,array);
  const field=geometry.attributes._canopy_visibility;prepareCanopyGeometry(geometry,true);assert.equal(geometry.attributes._canopy_visibility,field);
  field.setX(0,NaN);assert.throws(()=>prepareCanopyGeometry(geometry,true),/missing or invalid/);
  field.setX(0,-.1);assert.throws(()=>prepareCanopyGeometry(geometry,true),/missing or invalid/);
});

test('canopy shader preserves original lighting source and installs once per shared Standard material',()=>{
  const material=new THREE.MeshStandardMaterial({name:'foliage'});let beforeCalls=0;
  material.onBeforeCompile=shader=>{beforeCalls++;shader.fragmentShader+='\n// original direct, specular, emissive and surface code';};
  const before={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(before,{});
  installCanopyAccessibility(material);const hook=material.onBeforeCompile;installCanopyAccessibility(material);assert.equal(material.onBeforeCompile,hook);
  const after={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(after,{});assert.equal(beforeCalls,2);
  const start=after.fragmentShader.indexOf('\n      // Match the existing foliage macro-normal'),end=after.fragmentShader.indexOf('\n    ',after.fragmentShader.indexOf('reflectedLight.indirectDiffuse *= canopyAccessibility;',start))+5;
  assert.ok(start>after.fragmentShader.indexOf('#include <lights_fragment_end>'));
  assert.equal((after.fragmentShader.slice(0,start)+after.fragmentShader.slice(end)).replace('varying vec2 vCanopyVisibility;\n',''),before.fragmentShader);
  assert.equal(after.vertexShader.replace('attribute vec2 _canopy_visibility;\nvarying vec2 vCanopyVisibility;\n','').replace('\nvCanopyVisibility = _canopy_visibility;',''),before.vertexShader);
  assert.match(after.fragmentShader,/dot\(normalize\(vNormal\), vViewPosition\) < 0/);
  const basic=new THREE.MeshBasicMaterial({name:'foliage'}),basicHook=basic.onBeforeCompile;installCanopyAccessibility(basic);assert.equal(basic.onBeforeCompile,basicHook);
});

test('native field transport preserves base geometry and rejects using its published output as the base',async()=>{
  for(const name of ['tree','roadside-oak']) {
    const base=readFileSync(`assets/source/canopy-base/${name}.glb`);
    const raw=readFileSync(path.join(process.env.CANOPY_TEST_SOURCE||'assets/source/canopy',name+'.glb'));
    const result=await transportCanopyVisibility(base,raw);
    assert.equal(result.verification.originalGeometryPreserved,true);assert.equal(result.verification.originalVertexOrderPreserved,true);
    assert.equal(result.verification.nativeUvEchoOmitted,true);assert.equal(result.verification.fields.length,2);
    assert.ok(result.verification.fields.every(field=>field.bytes===field.vertices*8));
    await assert.rejects(()=>transportCanopyVisibility(result.bytes,raw));
  }
});
