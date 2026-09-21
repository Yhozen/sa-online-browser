// Transport native-authored wood fields into original vertex order, then declare
// that no-accessibility base. Geometry is authored by Blender, never this script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const root=process.cwd(),dir=path.resolve('.dream-loop/roadside-trunk-taper'),mirror=path.join(dir,'mirror'),base='assets/source/canopy-base/roadside-oak.glb';
const sha=b=>createHash('sha256').update(b).digest('hex'),identify=f=>{const b=fs.readFileSync(f);return{bytes:b.length,sha256:sha(b)};};
const oldBytes=fs.readFileSync(base),rawPath=path.join(dir,'native-export/roadside-oak.glb');
fs.mkdirSync(path.dirname(rawPath),{recursive:true});if(!fs.existsSync(rawPath))fs.copyFileSync(path.join(mirror,base),rawPath);
const rawBytes=fs.readFileSync(rawPath),native=JSON.parse(fs.readFileSync(path.join(mirror,'assets/source/canopy-base/native-authoring.json')));
assert.equal(sha(rawBytes),native.glb.sha256);assert.equal(sha(oldBytes),native.oldSource.glb.sha256);
function decode(b){const n=b.readUInt32LE(12);return{json:JSON.parse(b.subarray(20,20+n)),bin:28+n};}
const old=decode(oldBytes),raw=decode(rawBytes);
for(const key of ['materials','nodes','scenes','scene','animations','skins','textures','images','samplers'])assert.deepEqual(raw.json[key],old.json[key],key);
async function load(b){const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');const meshes=[];g.scene.traverse(m=>{if(m.isMesh)meshes.push(m)});return meshes;}
const before=await load(oldBytes),authored=await load(rawBytes),out=Buffer.from(oldBytes),bytes=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),records=[];
assert.equal(before.length,3);assert.equal(authored.length,3);
for(let mi=0;mi<before.length;mi++){
 const a=before[mi],b=authored[mi];assert.equal(a.material.name,b.material.name);assert.deepEqual(a.matrix.toArray(),b.matrix.toArray());
 const ag=a.geometry,bg=b.geometry;assert.equal(ag.index.count,bg.index.count);assert.equal(ag.attributes.position.count,bg.attributes.position.count);
 const keys=Object.keys(ag.attributes);assert.deepEqual(Object.keys(bg.attributes),keys);
 if(a.material.name!=='wood'){
  assert.ok(bytes(ag.index).equals(bytes(bg.index)));for(const k of keys)assert.ok(bytes(ag.attributes[k]).equals(bytes(bg.attributes[k])),a.material.name+' '+k);
  records.push({material:a.material.name,vertices:ag.attributes.position.count,triangles:ag.index.count/3,allFieldsAndIndexBytesExact:true});continue;
 }
 const forward=new Map(),reverse=new Map();
 for(let corner=0;corner<ag.index.count;corner++){
  const i=ag.index.getX(corner),j=bg.index.getX(corner);if(forward.has(i))assert.equal(forward.get(i),j);if(reverse.has(j))assert.equal(reverse.get(j),i);forward.set(i,j);reverse.set(j,i);
 }
 assert.equal(forward.size,ag.attributes.position.count);assert.equal(reverse.size,bg.attributes.position.count);
 let changedPositions=0,changedNormals=0,maxRadius=0;const lowMin=[Infinity,Infinity,Infinity],lowMax=lowMin.map(()=>-Infinity);
 for(const [i,j]of forward){
  for(const k of keys.filter(k=>!['position','normal'].includes(k))){const x=ag.attributes[k],y=bg.attributes[k];assert.equal(x.itemSize,y.itemSize);const size=x.array.BYTES_PER_ELEMENT*x.itemSize;assert.ok(bytes(x).subarray(i*size,(i+1)*size).equals(bytes(y).subarray(j*size,(j+1)*size)),k);}
  const p=ag.attributes.position,q=bg.attributes.position,n=bg.attributes.normal;assert.equal(p.getY(i),q.getY(j),'Every actual exported height exact');
  const posChanged=[0,1,2].some(k=>p.array[i*3+k]!==q.array[j*3+k]);const normChanged=[0,1,2].some(k=>ag.attributes.normal.array[i*3+k]!==n.array[j*3+k]);changedPositions+=+posChanged;changedNormals+=+normChanged;
  if(p.getY(i)>=3.55)assert.equal(posChanged,false,'Upper wood positions exact');
  assert.ok(Math.abs(Math.hypot(n.getX(j),n.getY(j),n.getZ(j))-1)<2e-5,'Actual native wood normal is finite/unit');
  if(q.getY(j)<2.1){const v=[q.getX(j),-q.getZ(j),q.getY(j)];maxRadius=Math.max(maxRadius,Math.hypot(v[0],v[1]));for(let k=0;k<3;k++){lowMin[k]=Math.min(lowMin[k],v[k]);lowMax[k]=Math.max(lowMax[k],v[k]);}}
 }
 assert.ok(changedPositions>0&&changedNormals>0);assert.ok(maxRadius<.28);assert.ok(lowMin[0]>=-.35&&lowMin[1]>=-.35&&lowMax[0]<=.35&&lowMax[1]<=.35);
 const primitive=old.json.meshes[mi].primitives[0];assert.equal(old.json.materials[primitive.material].name,'wood');
 for(const [key,semantic]of[['position','POSITION'],['normal','NORMAL']]){
  const accessor=old.json.accessors[primitive.attributes[semantic]],view=old.json.bufferViews[accessor.bufferView];assert.equal(accessor.type,'VEC3');assert.equal(accessor.componentType,5126);assert.ok(!view.byteStride||view.byteStride===12);
  const offset=old.bin+(view.byteOffset??0)+(accessor.byteOffset??0),array=bg.attributes[key],input=bytes(array);
  for(const [i,j]of forward)input.copy(out,offset+i*12,j*12,j*12+12);
  if(key==='position'){const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);for(let j=0;j<array.count;j++)for(let k=0;k<3;k++){min[k]=Math.min(min[k],array.array[j*3+k]);max[k]=Math.max(max[k],array.array[j*3+k]);}assert.deepEqual(min,accessor.min);assert.deepEqual(max,accessor.max);}
 }
 records.push({material:'wood',vertices:ag.attributes.position.count,triangles:ag.index.count/3,nativeCornerSequenceBijection:true,changedPositions,changedNormals,allHeightsExact:true,upperPositionsExactAbove:3.55,lowBounds:{min:lowMin,max:lowMax},maximumLowRadius:maxRadius,colliderHalfWidth:.35,UVColorIndicesOriginalBytesPreserved:true});
}
const final=await load(out);for(let i=0;i<before.length;i++){const a=before[i].geometry,b=final[i].geometry;assert.ok(bytes(a.index).equals(bytes(b.index)));for(const k of Object.keys(a.attributes))if(before[i].material.name!=='wood'||!['position','normal'].includes(k))assert.ok(bytes(a.attributes[k]).equals(bytes(b.attributes[k])));}
fs.writeFileSync(path.join(mirror,base),out);
const oldRecord=JSON.parse(fs.readFileSync('assets/source/canopy-base/base.json'));
const derived={version:1,purpose:'Derived original-native55%low-wood taper base; no accessibility present. Original canonicalbase remains immutable.',blenderVersion:'5.2.1',models:{'roadside-oak':{blend:{path:'assets/source/canopy-base/roadside-oak.blend',...identify(path.join(mirror,'assets/source/canopy-base/roadside-oak.blend'))},glb:{path:base,...identify(path.join(mirror,base))},originalBuild:oldRecord.models['roadside-oak'].originalBuild,derivation:{parent:oldRecord.models['roadside-oak'],nativeAuthorRecipe:{path:'tools/assets/author-taper.py',...identify(path.join(dir,'author-taper.py'))},nativeRawExport:identify(rawPath),transportRecipe:{path:'tools/assets/prepare-taper-base.mjs',...identify(import.meta.filename)},change:'Only native wood POSITION/NORMAL transported back to original vertex order; all other BIN bytes/JSON/indices/leaf fields exact.'}}}};
fs.writeFileSync(path.join(mirror,'assets/source/canopy-base/base.json'),JSON.stringify(derived,null,2)+'\n');
for(const [from,to]of[['tools/assets/canopy-visibility.py','tools/assets/canopy-visibility.py'],['tools/assets/canopy-visibility.mjs','tools/assets/canopy-visibility.mjs'],['assets/textures/arroyo-foliage.webp','assets/textures/arroyo-foliage.webp'],[path.join(dir,'author-taper.py'),'tools/assets/author-taper.py'],[import.meta.filename,'tools/assets/prepare-taper-base.mjs']]){const target=path.join(mirror,to);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(from,target);}
const proof={passed:true,rawNative:identify(rawPath),declaredBase:identify(path.join(mirror,base)),declaredBaseGzipBytes:gzipSync(out,{level:9}).length,records,allNonWoodStreamsExact:true,sourceNativeReport:'mirror/assets/source/canopy-base/native-authoring.json',canonicalOriginalBaseUnchanged:sha(fs.readFileSync(base))===native.oldSource.glb.sha256};
assert.equal(proof.canonicalOriginalBaseUnchanged,true);fs.writeFileSync(path.join(dir,'base-verification.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
