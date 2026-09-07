// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
const models=new Map<string,GLTF>();
export const surfaceMaterials=new Map<string,THREE.MeshStandardMaterial>();
export const assetStats={bytes:0,textureBytes:0,files:0};
const names=['house-0','house-1','house-2','house-3','palm','tree','fence','fence-low','mailbox','bin','pole','lamp','coupe','neighbor'];
export async function loadAssets(progress:(text:string)=>void,inventory?:{files:Record<string,{bytes:number;sha256:string}>}){
 const loader=new GLTFLoader();let count=0;
 async function verify(name:string,bytes:ArrayBuffer){const expected=inventory?.files[name];if(!expected)throw Error('Asset inventory is missing '+name+'. Rebuild assets and restart the gateway.');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==expected.sha256||bytes.byteLength!==expected.bytes)throw Error('Asset revision mismatch: '+name+'. Reload after restarting the gateway.');}

 const canonical=new Map<string,THREE.Material>();
 // Sequential loading keeps peak decode memory predictable and provides useful progress.
 for(const name of names){
  progress(`Loading ${name} · ${count+1}/${names.length+1}`);
  const response=await fetch(`/assets/${name}.glb`);if(!response.ok)throw Error(`${name}.glb could not load (HTTP ${response.status}). Check the asset build and retry.`);
  const bytes=await response.arrayBuffer();await verify(`${name}.glb`,bytes);assetStats.bytes+=bytes.byteLength;
  const gltf=await loader.parseAsync(bytes,'/assets/');
  gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;const list=Array.isArray(o.material)?o.material:[o.material];o.material=list.map(m=>{if(m.name.startsWith('foliage'))m.side=THREE.DoubleSide;if(!canonical.has(m.name))canonical.set(m.name,m);else if(canonical.get(m.name)!==m)m.dispose();return canonical.get(m.name)!;});if(o.material.length===1)o.material=o.material[0];}});
  models.set(name,gltf);assetStats.files=++count;
 }
 const response=await fetch('/assets/neighborhood-atlas.png');if(!response.ok)throw Error('Surface textures are missing. Run npm run build:assets and retry.');
 const blob=await response.blob();await verify('neighborhood-atlas.png',await blob.arrayBuffer());assetStats.bytes+=blob.size;const bitmap=await createImageBitmap(blob);
 const size=512;
 for(const [i,name] of ['stucco','asphalt','concrete','grass'].entries()){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;
  ctx.drawImage(bitmap,(i%2)*bitmap.width/2,Math.floor(i/2)*bitmap.height/2,bitmap.width/2,bitmap.height/2,0,0,size,size);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1,1);texture.anisotropy=2;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.95,color:name==='grass'?0xb6b78c:0xffffff});surfaceMaterials.set(name,material);
  if(name==='stucco'||name==='concrete'){const existing=canonical.get(name);if(existing instanceof THREE.MeshStandardMaterial){existing.map=texture;existing.color.set(0xffffff);existing.needsUpdate=true;}}
 }
 bitmap.close();assetStats.textureBytes=4*size*size*4*4/3;assetStats.files=++count;
}
export function asset(name:string):THREE.Group{
 const gltf=models.get(name);if(!gltf)throw Error(`Asset not loaded: ${name}`);
 // Blender meters/Z-up/+Y -> glTF Y-up/-Z -> world Z-up/+Y, once per imported root.
 const root=new THREE.Group(), normalized=clone(gltf.scene);normalized.rotation.x=Math.PI/2;root.add(normalized);root.userData.asset=name;return root;
}
export function clips(){return models.get('neighbor')!.animations;}
export function instantiateStatic(scene:THREE.Scene,placements:{asset:string;position:number[];rotation:number;scale?:number[]}[]){
 const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[]}>();
 for(const p of placements){const root=asset(p.asset==='fence'&&localStorage.getItem('poc-quality')!=='standard'?'fence-low':p.asset);root.position.set(...p.position as [number,number,number]);root.rotation.z=p.rotation;if(p.scale)root.scale.set(...p.scale as [number,number,number]);root.updateMatrixWorld(true);
  root.traverse(o=>{if(o instanceof THREE.Mesh){const key=o.geometry.uuid+JSON.stringify((Array.isArray(o.material)?o.material:[o.material]).map(m=>m.uuid));let b=batches.get(key);if(!b){b={geometry:o.geometry,material:o.material,matrices:[]};batches.set(key,b);}b.matrices.push(o.matrixWorld.clone());}});
 }
 for(const b of batches.values()){const inst=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>inst.setMatrixAt(i,m));inst.castShadow=true;inst.receiveShadow=true;inst.computeBoundingSphere();scene.add(inst);}
}
