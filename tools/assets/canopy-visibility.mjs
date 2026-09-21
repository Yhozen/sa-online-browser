// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identify = file => { const bytes=readFileSync(file); return {bytes:bytes.length,sha256:sha(bytes)}; };
const bytesOf = attribute => Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);
const field = attribute => ({itemSize:attribute.itemSize,count:attribute.count,normalized:attribute.normalized,type:attribute.array.constructor.name,sha256:sha(bytesOf(attribute))});

function decodeGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'Binary glTF required');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12), binHeader=20+jsonLength;
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  assert.equal(bytes.readUInt32LE(binHeader+4),0x004e4942);
  const binLength=bytes.readUInt32LE(binHeader);
  assert.equal(binHeader+8+binLength,bytes.length,'One JSON and one BIN chunk');
  const json=JSON.parse(bytes.subarray(20,binHeader).toString());
  assert.equal(json.buffers.length,1);
  assert.equal(json.buffers[0].uri,undefined);
  assert.ok(json.buffers[0].byteLength<=binLength);
  assert.ok(json.meshes.every(mesh=>mesh.primitives.length===1),'One material primitive per retained mesh');
  return {json,bin:bytes.subarray(binHeader+8)};
}
async function load(bytes) {
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meshes=[];gltf.scene.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh)});
  return meshes;
}
function encodeGlb(json, bin) {
  const text=Buffer.from(JSON.stringify(json));
  const padded=Buffer.alloc((text.length+3)&~3,0x20);text.copy(padded);
  assert.equal(bin.length%4,0);
  const header=Buffer.alloc(20), binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+bin.length,8);
  header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,padded,binHeader,bin]);
}

/** Transport only the native field. Original buffers, accessors, indices,
 * surfaces and scene structure stay exact; raw export UV echoes are omitted. */
export async function transportCanopyVisibility(baseBytes,nativeBytes) {
  const base=decodeGlb(baseBytes),native=decodeGlb(nativeBytes);
  for(const key of ['materials','nodes','scenes','scene','animations','skins','textures','images','samplers'])
    assert.deepEqual(native.json[key],base.json[key],'Original native '+key+' semantics');
  const before=await load(baseBytes),after=await load(nativeBytes);
  assert.equal(before.length,after.length);
  assert.equal(before.length,base.json.meshes.length);
  const additions=[];
  for(let meshIndex=0;meshIndex<before.length;meshIndex++) {
    const old=before[meshIndex],next=after[meshIndex],a=old.geometry,b=next.geometry;
    assert.equal(old.material.name,next.material.name);
    const keys=Object.keys(a.attributes).sort();
    for(const key of keys) {
      const x=field(a.attributes[key]),y=field(b.attributes[key]);
      delete x.sha256;delete y.sha256;assert.deepEqual(y,x,'Original vertex schema');
    }
    const tuple=(geometry,i)=>keys.map(key=>{
      const attr=geometry.attributes[key],size=attr.array.BYTES_PER_ELEMENT*attr.itemSize;
      return Buffer.from(attr.array.buffer,attr.array.byteOffset+i*size,size).toString('hex');
    }).join('/');
    const lookup=new Map();
    for(let i=0;i<a.attributes.position.count;i++) {
      const key=tuple(a,i);if(!lookup.has(key))lookup.set(key,[]);lookup.get(key).push(i);
    }
    const remap=[];
    for(let i=0;i<b.attributes.position.count;i++) {
      const matches=lookup.get(tuple(b,i));assert.ok(matches?.length,'Native vertex must have byte-exact original tuple');remap[i]=matches.pop();
    }
    assert.ok([...lookup.values()].every(matches=>matches.length===0),'Original vertex bijection');
    assert.equal(a.index.count,b.index.count);
    for(let i=0;i<a.index.count;i++)assert.equal(remap[b.index.getX(i)],a.index.getX(i),'Mapped triangle index sequence must stay exact');
    const added=Object.keys(b.attributes).filter(key=>!a.attributes[key]).sort();
    if(!old.material.name.startsWith('foliage')) { assert.deepEqual(added,[]);continue; }
    assert.deepEqual(added,['_canopy_visibility','uv1']);
    const raw=b.attributes._canopy_visibility,echo=b.attributes.uv1;
    assert.equal(raw.itemSize,2);assert.equal(raw.count,a.attributes.position.count);
    assert.equal(raw.normalized,false);assert.ok(raw.array instanceof Float32Array);
    assert.equal(echo.count,raw.count);assert.equal(echo.itemSize,2);
    const values=new Float32Array(raw.count*2);
    for(let i=0;i<raw.count;i++) {
      const x=raw.getX(i),y=raw.getY(i);
      assert.ok(Number.isFinite(x)&&x>=0&&x<=1&&Number.isFinite(y)&&y>=0&&y<=1,'Raw finite accessibility');
      assert.equal(echo.getX(i),x,'Redundant native UV echo x');
      assert.equal(echo.getY(i),Math.fround(1-y),'Redundant native UV echo y');
      values[remap[i]*2]=x;values[remap[i]*2+1]=y;
    }
    additions.push({meshIndex,material:old.material.name,values});
  }
  assert.equal(additions.length,2,'Both original oak foliage materials');
  const json=structuredClone(base.json),bins=[base.bin];let offset=base.bin.length;
  for(const row of additions) {
    const bytes=Buffer.from(row.values.buffer,row.values.byteOffset,row.values.byteLength);
    const view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962})-1;
    const accessor=json.accessors.push({bufferView:view,componentType:5126,count:row.values.length/2,type:'VEC2'})-1;
    assert.equal(json.meshes[row.meshIndex].primitives[0].attributes._CANOPY_VISIBILITY,undefined);
    json.meshes[row.meshIndex].primitives[0].attributes._CANOPY_VISIBILITY=accessor;
    bins.push(bytes);offset+=bytes.length;
  }
  json.buffers[0].byteLength=offset;
  const bytes=encodeGlb(json,Buffer.concat(bins));
  const final=await load(bytes);
  for(let i=0;i<before.length;i++) {
    const a=before[i].geometry,b=final[i].geometry,row=additions.find(row=>row.meshIndex===i);
    assert.deepEqual(field(b.index),field(a.index));
    for(const key of Object.keys(a.attributes))assert.deepEqual(field(b.attributes[key]),field(a.attributes[key]),'Published original field remains byte-exact');
    assert.deepEqual(Object.keys(b.attributes).filter(key=>!a.attributes[key]),row?['_canopy_visibility']:[]);
    if(row)assert.equal(sha(bytesOf(b.attributes._canopy_visibility)),sha(Buffer.from(row.values.buffer)));
  }
  assert.ok(decodeGlb(bytes).bin.subarray(0,base.bin.length).equals(base.bin),'Original full BIN chunk remains byte-exact');
  return {bytes,verification:{originalGeometryPreserved:true,originalVertexOrderPreserved:true,originalSceneAndMaterialsPreserved:true,nativeUvEchoOmitted:true,
    fields:additions.map(row=>({material:row.material,vertices:row.values.length/2,bytes:row.values.byteLength,sha256:sha(Buffer.from(row.values.buffer))}))}};
}

/** Called while build-assets still owns unpublished staging. Every declared
 * base/native input is checked before the ordinary atomic publication phase. */
export async function completeCanopy({root,staging,models,generator}) {
  const directory=path.join(staging,'assets/source/canopy');
  const native=JSON.parse(readFileSync(path.join(directory,'native.json')));
  const base=JSON.parse(readFileSync(path.join(root,'assets/source/canopy-base/base.json')));
  assert.equal(base.version,1);assert.equal(generator.version,base.blenderVersion);
  const dependencies=['tools/assets/canopy-visibility.mjs',...Object.keys(native.inputs)];
  for(const [file,expected]of Object.entries(native.inputs)) {
    const resolved=path.resolve(root,file);assert.ok(resolved.startsWith(path.resolve(root)+path.sep));
    assert.equal(identify(resolved).sha256,expected,'Canopy input changed during native bake: '+file);
  }
  const records={};
  for(const name of models) {
    assert.ok(['tree','roadside-oak'].includes(name));
    const row=native.rows.find(row=>row.model===name);assert.ok(row);
    assert.equal(row.samples,256);
    const declared=base.models[name];
    for(const kind of ['blend','glb']) {
      assert.equal(declared[kind].path,`assets/source/canopy-base/${name}.${kind}`);
      const {path:file,...expected}=declared[kind];assert.deepEqual(identify(path.join(root,file)),expected);
    }
    const rawFile=path.join(directory,name+'.glb'),blendFile=path.join(directory,name+'.blend');
    assert.equal(identify(rawFile).sha256,row.glbSha256);assert.equal(identify(blendFile).sha256,row.sourceSha256);
    const transported=await transportCanopyVisibility(readFileSync(path.join(root,declared.glb.path)),readFileSync(rawFile));
    const output=path.join(staging,'apps/browser/public/assets');mkdirSync(output,{recursive:true});
    writeFileSync(path.join(output,name+'.glb'),transported.bytes);
    copyFileSync(blendFile,path.join(staging,'assets/source',name+'.blend'));
    const record={version:1,method:'Raw256-ray alpha-aware same-specimen isotropic diffuse accessibility; forward/back authored-normal hemispheres; no gain or clamp',
      base:declared,inputs:Object.fromEntries(dependencies.map(file=>[file,identify(path.join(root,file))])),
      native:{...row,blender:generator,rawExport:{path:`assets/source/canopy/${name}.glb`,...identify(rawFile)},source:{path:`assets/source/${name}.blend`,...identify(blendFile)}},
      ...transported.verification,output:{path:`apps/browser/public/assets/${name}.glb`,bytes:transported.bytes.length,sha256:sha(transported.bytes)}};
    writeFileSync(path.join(directory,name+'.json'),JSON.stringify(record,null,2)+'\n');records[name]=record;
  }
  return records;
}
