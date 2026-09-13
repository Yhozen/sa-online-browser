// SPDX-License-Identifier: GPL-3.0-or-later
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {prepareHorizon,completeHorizonProvenance,decodeFieldLE,encodeFieldLE,validatePacked,
  decodeHorizonGeometry,validateGeometry,verifyLightingSource} from '../tools/assets/horizon-bake.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context=path.resolve(process.env.TERRAIN_CONTEXT_ROOT||root);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sculpt=JSON.parse(readFileSync(path.join(root,'assets/horizon-relief.json')));
const stride=sculpt.segments+1,vertices=stride*(sculpt.rings+1);
let scratch,prepared;
before(()=>{scratch=mkdtempSync(path.join(root,'.terrain-tests-'));prepared=prepareHorizon({outputRoot:scratch,contextRoot:context});});
after(()=>rmSync(scratch,{recursive:true,force:true}));

// Adapts original exported-data/provenance test: retains the native source chain,
// byte-valid fields, seam guarantees, and counts under the v4 representation.
test('packed terrain preserves retained source hashes, exact byte encoding and angular seams',()=>{
  assert.equal(prepared.status,'native-source-pending');
  for(const entry of Object.values(prepared.inputs))assert.equal(sha(readFileSync(path.join(root,entry.path))),entry.sha256,entry.path);
  for(const [file,entry]of Object.entries(prepared.dependencies))assert.equal(sha(readFileSync(path.join(context,file))),entry.sha256,file);
  const decoded=validatePacked(sculpt);
  assert.equal(prepared.metrics.triangles,172800);assert.equal(prepared.metrics.vertices,90783);
  assert.equal(sculpt.layers.length,3);
  for(const layer of decoded){
    assert.equal(layer.elevation.length,vertices);assert.equal(layer.irradiance.length,vertices*3);assert.equal(layer.geology.length,vertices*2);
    assert.ok(layer.elevation.every(Number.isFinite));
  }
  // Byte order is independently known, including signed values above 0x7fff.
  assert.deepEqual([...Buffer.from(encodeFieldLE(new Int16Array([-256,1,32767,-32768])),'base64')],[0,255,1,0,255,127,0,128]);
  assert.deepEqual([...decodeFieldLE('AP8BAP9/AIA=',Int16Array,4)],[-256,1,32767,-32768]);
});

// This is mandatory in production. Staging must explicitly mark its one pending
// native source check; missing provenance never silently passes by file absence.
test('published v4 terrain retains complete hashed native provenance',{
  skip:process.env.TERRAIN_ALLOW_PENDING_NATIVE==='1'?'Native source save deliberately pending in isolated staging':false,
},()=>{
  const record=JSON.parse(readFileSync(path.join(root,'assets/source/horizon-build.json')));
  assert.equal(record.status,'complete');assert.equal(record.version,2);
  for(const entry of [...Object.values(record.inputs),...Object.values(record.dependencies),record.runtime,record.nativeSource]) {
    const bytes=readFileSync(path.join(root,entry.path));
    assert.equal(sha(bytes),entry.sha256,entry.path);assert.equal(bytes.length,entry.bytes,entry.path);
  }
  assert.deepEqual(record.geometry,prepared.geometry);
  assert.equal(record.metrics.triangles,172800);
  assert.ok(['4.5.13','5.2.1'].includes(record.native.version));
  assert.match(record.native.executableSha256,/^[a-f0-9]{64}$/);
});

test('retained v3 input regenerates the exact staged v4 candidate',()=>{
  const bytes=readFileSync(path.join(scratch,'assets/horizon-relief.json'));
  assert.deepEqual(bytes,readFileSync(path.join(root,'assets/horizon-relief.json')));
  assert.equal(sha(bytes),'94e2c411dacb524e2ee90c4cf5bd312fbf0c7b3e4355b2ba8f11c6bacf1c9b56');
  assert.equal(bytes.length,859283);
  assert.ok(prepared.metrics.layers.every(layer=>!layer.lighting.clipped));
});

function runtime(data=sculpt) {
  let source=stripTypeScriptTypes(readFileSync(path.join(root,'apps/browser/src/horizon.ts'),'utf8'));
  source=source.replace(/^import .*;$/gm,'').replace('export function buildHorizon','function buildHorizon');
  const maps=new Map([
    ['grass',new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture()})],
    ['concrete',new THREE.MeshStandardMaterial({map:new THREE.Texture()})],
  ]);
  let placements;
  const build=new Function('THREE','sculpt','surfaceMaterials','instantiateStatic',`${source}\nreturn buildHorizon;`)(
    THREE,data,maps,(_scene,props)=>{placements=props});
  const scene=new THREE.Scene();build(scene,19);
  return {scene,maps,placements};
}
// Adapts original real-runtime height/seam test. Normals are deliberately absent
// on Basic terrain; actual face topology/orientation replaces the obsolete check.
test('actual runtime uses quantized elevations with continuous geometry, color, UV and unchanged planting',()=>{
  const {scene,placements}=runtime(),fields=validatePacked(sculpt),decoded=decodeHorizonGeometry(sculpt,19);
  assert.equal(scene.children.length,3);
  for(const [layer,mesh]of scene.children.entries()){
    const geometry=mesh.geometry,p=geometry.attributes.position;
    assert.equal(p.count,vertices);assert.equal(geometry.index.count/3,57600);
    assert.equal(geometry.attributes.normal,undefined);
    assert.deepEqual(p.array,decoded[layer].position);
    assert.deepEqual(geometry.index.array,decoded[layer].index);
    assert.deepEqual(geometry.attributes.uv.array,decoded[layer].uv);
    assert.deepEqual(geometry.attributes.color.array,fields[layer].irradiance);
    assert.deepEqual(geometry.attributes.terrainMix.array,fields[layer].geology);
    assert.equal(geometry.attributes.color.normalized,true);assert.equal(geometry.attributes.terrainMix.normalized,true);
    const width=90+layer*50,inner=250+layer*125-width*.47;
    for(let k=0;k<p.count;k++){
      assert.equal(p.getZ(k),Math.fround(19+fields[layer].elevation[k]/256));
      const radius=Math.hypot(p.getX(k),p.getY(k));
      assert.ok(radius>=inner-1e-4&&radius<=inner+width+1e-4&&radius>200);
    }
    for(let j=0;j<=sculpt.rings;j++)for(const name of ['position','color','terrainMix','uv']){
      const attribute=geometry.attributes[name];
      for(let c=0;c<attribute.itemSize;c++)assert.equal(attribute.array[j*stride*attribute.itemSize+c],attribute.array[(j*stride+sculpt.segments)*attribute.itemSize+c],`${name} seam`);
    }
  }
  assert.ok(validateGeometry(decoded).every(layer=>layer.minTriangleArea>.17));
  assert.equal(placements.length,218);
  assert.ok(placements.every(p=>Math.max(Math.abs(p.position[0]),Math.abs(p.position[1]))>90));
  // Retain actual authored placement sequence, not merely its count.
  if(process.env.TERRAIN_CONTEXT_ROOT){
    const original=readFileSync(path.join(context,'apps/browser/src/horizon.ts'),'utf8');
    const candidate=readFileSync(path.join(root,'apps/browser/src/horizon.ts'),'utf8');
    assert.equal(candidate.slice(candidate.indexOf('  const placements:')),original.slice(original.indexOf('  const placements:')));
  }
});

test('actual Basic shader keeps original maps, one irradiance scale and fog across Standard/Low/Standard',()=>{
  const {scene,maps}=runtime();
  let graphics=stripTypeScriptTypes(readFileSync(path.join(context,'apps/browser/src/graphics.ts'),'utf8'));
  graphics=graphics.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/g,'').replace(/export /g,'');
  const quality=new Function(...Object.keys(THREE),`${graphics}\nreturn applyQuality;`)(...Object.values(THREE));
  const identities=scene.children.map(mesh=>({geometry:mesh.geometry,material:mesh.material,map:mesh.material.map,color:mesh.geometry.attributes.color}));
  for(const low of [false,true,false]){
    quality(scene,low);
    for(const [i,mesh]of scene.children.entries()){
      const material=mesh.material,prior=identities[i];
      assert.ok(material instanceof THREE.MeshBasicMaterial);
      assert.equal(material,prior.material);assert.equal(mesh.geometry,prior.geometry);assert.equal(material.map,prior.map);
      assert.equal(mesh.geometry.attributes.color,prior.color);assert.equal(material.map,maps.get('grass').map);
      assert.equal(material.vertexColors,true);assert.equal(material.fog,true);
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
      material.onBeforeCompile(shader,{});
      assert.equal(shader.uniforms.arroyoRock.value,maps.get('concrete').map);
      assert.equal(shader.uniforms.arroyoIrradianceScale.value,4);
      assert.equal((shader.fragmentShader.match(/diffuseColor\.rgb \*= pigment \* arroyoIrradianceScale;/g)||[]).length,1);
      assert.ok(shader.fragmentShader.includes('#include <color_fragment>'));
      assert.ok(shader.fragmentShader.includes('fogColor, fogFactor * .7'));
      assert.ok(!shader.fragmentShader.includes('lights_fragment_begin'));
      assert.equal(material.customProgramCacheKey(),'arroyo-remeshed-baked-irradiance-v1');
    }
  }
});

test('malformed packing and lighting drift fail before constructing valid-looking geometry',()=>{
  const invalid=structuredClone(sculpt);invalid.layers[0].elevation='AA==';
  assert.throws(()=>validatePacked(invalid),/byte length/);
  assert.throws(()=>runtime(invalid),/field length/);
  assert.throws(()=>decodeFieldLE('AAAA!',Uint8Array,3),/base64/);
  const lighting=JSON.parse(readFileSync(path.join(root,'assets/source/horizon-lighting.json')));
  const source=readFileSync(path.join(context,'apps/browser/src/lighting.ts'),'utf8');
  verifyLightingSource(lighting,source);
  lighting.sun.intensity+=.1;
  assert.throws(()=>verifyLightingSource(lighting,source));
});

test('exact native sidecar matches decoded runtime fields; native provenance cannot be claimed before save',()=>{
  const sidecar=JSON.parse(readFileSync(path.join(scratch,'assets/source/horizon-decoded.json')));
  assert.equal(sidecar.runtimeSha256,prepared.runtime.sha256);assert.equal(sidecar.ground,9);
  const decoded=decodeHorizonGeometry(sculpt);
  for(const [i,layer]of decoded.entries())for(const [name,field]of Object.entries(layer)){
    assert.equal(sidecar.layers[i][name],encodeFieldLE(field));
    assert.equal(sha(Buffer.from(sidecar.layers[i][name],'base64')),prepared.geometry[i].fields[name].sha256);
  }
  assert.throws(()=>completeHorizonProvenance(scratch,{version:'5.2.1'}),/horizon-native.json/);
  // A native report for a different runtime must also fail, even if present.
  writeFileSync(path.join(scratch,'assets/source/horizon-native.json'),JSON.stringify({runtimeSha256:'0'.repeat(64)}));
  assert.throws(()=>completeHorizonProvenance(scratch,{version:'5.2.1'}),/Expected values to be strictly equal/);

});

test('invalid source preparation leaves prior output bytes intact',()=>{
  const output=path.join(scratch,'assets/horizon-relief.json'),prior=readFileSync(output);
  const invalid=path.join(scratch,'invalid-envelope.json');writeFileSync(invalid,'{"version":4}\n');
  assert.throws(()=>prepareHorizon({input:invalid,outputRoot:scratch,contextRoot:context}),/Retained envelope changed/);
  assert.deepEqual(readFileSync(output),prior);
});

test('normal pipeline rejects model and terrain native failures before publishing prior products',()=>{
  const fixture=path.join(scratch,'failed-build');
  const write=(file,bytes,options)=>{mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});writeFileSync(path.join(fixture,file),bytes,options)};
  write('tools/build-assets.mjs',readFileSync(path.join(root,'tools/build-assets.mjs')));
  write('tools/assets/horizon-bake.mjs',readFileSync(path.join(root,'tools/assets/horizon-bake.mjs')));
  for(const file of ['build.py','environment-kit.py','heroes.py','garden-kit.py'])write('tools/assets/'+file,'# failure fixture\n');
  const priorFiles=['apps/browser/public/assets/tree.glb','assets/source/tree.blend','assets/source/asset-build.json','assets/horizon-relief.json','assets/source/horizon.blend','assets/source/horizon-build.json'];
  for(const file of priorFiles)write(file,'unchanged '+file);
  const fake=path.join(fixture,'fake-blender');
  write('fake-blender',`#!/usr/bin/env node\nif(process.argv.includes('--version'))console.log('Blender 5.2.1\\nbuild hash: fixture');else process.exit(41);\n`,{mode:0o755});
  for(const file of ['tools/assets/horizon-save.py','tools/assets/horizon-envelope-v3.py',
    'assets/source/horizon-envelope-v3.json','assets/source/horizon-envelope-v3.blend',
    'assets/source/horizon-envelope-v3-build.json','assets/source/horizon-lighting.json','apps/browser/src/horizon.ts'])write(file,readFileSync(path.join(root,file)));
  for(const file of Object.keys(prepared.dependencies))write(file,readFileSync(path.join(context,file)));
  for(const mode of [['--models','tree','--terrain'],['--terrain-only']]){
    const result=spawnSync(process.execPath,[path.join(fixture,'tools/build-assets.mjs'),'--blender',fake,...mode,'--skip-reflections'],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/failed \(41\)/);
    for(const file of priorFiles)assert.equal(readFileSync(path.join(fixture,file),'utf8'),'unchanged '+file);
  }
});
