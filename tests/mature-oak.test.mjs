// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const dir = 'artifacts/verification';
mkdirSync(dir,{recursive:true});
const fixture = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json'));
const candidatePath = 'apps/browser/public/assets/roadside-oak.glb';
const placement = fixture.props.find(p => p.asset === 'roadside-oak');
assert.ok(placement, 'the authored mature oak must be placed in the neighborhood');
const output = { candidatePath, placement, generatedAt: new Date().toISOString() };
async function model(path,position=[0,0,0],rotation=0) {
  const b=readFileSync(path),scene=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;
  scene.rotation.x=Math.PI/2;const group=new T.Group();group.add(scene);
  group.position.fromArray(position);group.rotation.z=rotation;group.updateMatrixWorld(true);
  group.traverse(o=>{if(o.isMesh)o.material.side=T.DoubleSide;});return group;
}
const mature=await model(candidatePath),canonical=await model('apps/browser/public/assets/tree.glb');
const meshes = group => {const result=[];group.traverse(o=>{if(o.isMesh)result.push(o)});return result;};
const vertices = mesh => Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));

test('native mature oak retains connected real geometry, low trunk and pedestrian-height crown',()=>{
  const originals=new Map(meshes(canonical).map(m=>[m.material.name,m]));let triangles=0,minimumArea=Infinity;
  const leafBounds=new T.Box3(),woodBounds=new T.Box3();let maximumLowWoodDifference=0;
  for(const m of meshes(mature)){
    const p=vertices(m),g=m.geometry,base=originals.get(m.material.name);assert.ok(base);
    assert.equal(g.index.count,base.geometry.index.count,'growth does not add or remove triangles');triangles+=g.index.count/3;
    for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(new T.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-5);
    for(const v of p){assert.ok(v.toArray().every(Number.isFinite));(m.material.name==='wood'?woodBounds:leafBounds).expandByPoint(v);}
    for(let i=0;i<g.index.count;i+=3){const[a,b,c]=[0,1,2].map(k=>p[g.index.getX(i+k)]);minimumArea=Math.min(minimumArea,b.clone().sub(a).cross(c.clone().sub(a)).length()/2);}
    if(m.material.name==='wood'){
      const low=vertices(base).filter(v=>v.z<=2.1);
      for(const v of p.filter(v=>v.z<=2.1))maximumLowWoodDifference=Math.max(maximumLowWoodDifference,Math.sqrt(low.reduce((d,b)=>Math.min(d,b.distanceToSquared(v)),Infinity)));
    }
  }
  assert.equal(triangles,8536);assert.ok(minimumArea>1e-6);assert.ok(maximumLowWoodDifference<1e-6);
  assert.ok(leafBounds.min.z>=4.1 && leafBounds.max.z<=11.4 && leafBounds.max.z-leafBounds.min.z>4.2);
  // Leaf roots and their actual nearest woody surfaces must still connect.
  const woodyTriangles=[];for(const m of meshes(mature).filter(m=>m.material.name==='wood')){const p=vertices(m),idx=m.geometry.index;for(let i=0;i<idx.count;i+=3)woodyTriangles.push(new T.Triangle(...[0,1,2].map(k=>p[idx.getX(i+k)])));}
  const scratch=new T.Vector3();let anchors=0,maximumAttachmentGap=0;
  for(const m of meshes(mature).filter(m=>m.material.name.startsWith('foliage'))){const p=vertices(m),uv=m.geometry.attributes.uv;for(let i=0;i<p.length;i++)if(Math.abs(uv.getX(i))<1e-7&&Math.abs(uv.getY(i)-1)<1e-7){anchors++;maximumAttachmentGap=Math.max(maximumAttachmentGap,Math.sqrt(woodyTriangles.reduce((d,t)=>Math.min(d,t.closestPointToPoint(p[i],scratch).distanceToSquared(p[i])),Infinity)));}}
  assert.equal(anchors,630);assert.ok(maximumAttachmentGap<.04);
  output.geometry={triangles,minimumArea,maximumLowWoodDifference,leafBounds,woodBounds,anchors,maximumAttachmentGap};
});

test('actual mature oak roots preserve roads, turning sidewalk, house access and roof clearance',async()=>{
  const placed=await model(candidatePath,placement.position,placement.rotation);const rootPoints=meshes(placed).filter(m=>m.material.name==='wood').flatMap(vertices).filter(p=>p.z-fixture.groundZ<=2.1);
  const crown=new T.Box3().setFromPoints(meshes(placed).filter(m=>m.material.name.startsWith('foliage')).flatMap(vertices));
  let minimumRoadGap=Infinity,minimumTurningGap=Infinity;
  for(const p of rootPoints){
    for(const road of fixture.roads)for(let i=1;i<road.points.length;i++){
      const a=new T.Vector3(...road.points[i-1],0),b=new T.Vector3(...road.points[i],0),sample=new T.Vector3(p.x,p.y,0);
      const gap=new T.Line3(a,b).closestPointToPoint(sample,true,new T.Vector3()).distanceTo(sample)-road.width/2-2.5;
      minimumRoadGap=Math.min(minimumRoadGap,gap);assert.ok(gap>0);
    }
    const gap=Math.hypot(p.x-fixture.culdesac.center[0],p.y-fixture.culdesac.center[1])-fixture.culdesac.radius-2.5;
    minimumTurningGap=Math.min(minimumTurningGap,gap);assert.ok(gap>0);
    for(const h of fixture.houses){const c=Math.cos(h.rotation),s=Math.sin(h.rotation),dx=p.x-h.position[0],dy=p.y-h.position[1],x=(dx*c+dy*s)/(h.scale?.[0]??1),y=(-dx*s+dy*c)/(h.scale?.[1]??1);
      for(const[cx,cy,w,d]of[[0,0,16.4,12.4],[-3,-7,6.7,2.9],[6,-13.35,4,14.7],[-3,-14.6,2.8,12.2]])assert.ok(Math.abs(x-cx)>=w/2||Math.abs(y-cy)>=d/2,`Root enters ${h.id} access`);
    }
  }
  for(const h of fixture.houses){const g=await model(`apps/browser/public/assets/${h.asset}.glb`,h.position,h.rotation);if(h.scale){g.scale.fromArray(h.scale);g.updateMatrixWorld(true);}const roof=meshes(g).filter(m=>['shingle','roof-edge'].includes(m.material.name)).flatMap(vertices);if(roof.length)assert.ok(!crown.intersectsBox(new T.Box3().setFromPoints(roof)),`Crown enters ${h.id} roof`);}
  output.clearance={minimumRoadGap,minimumTurningGap};
});

test('actual GLB clears required lamp and center landmarks; left-palm overlap is reported honestly',async t=>{
  const oak=await model(candidatePath,placement.position,placement.rotation);
  const cam=new T.PerspectiveCamera(48,1672/941,.1,1000);cam.up.set(0,0,1);cam.position.set(-4,-5.813474530263867,12.234423755527137);cam.lookAt(-4,0,10.75);cam.updateMatrixWorld(true);
  // Test conservative opaque leaf cards; required landmarks must stay clear
  // even before the real cutout alpha discards transparent texels.
  const sign=new T.Mesh(new T.PlaneGeometry(2.7,.65),new T.MeshBasicMaterial({side:T.DoubleSide}));sign.rotation.x=Math.PI/2;sign.position.set(-8,14,12);sign.updateMatrixWorld(true);
  const h=fixture.houses.find(h=>h.id==='house-4');
  const targets=[['street-sign',sign],['center-house',await model(`apps/browser/public/assets/${h.asset}.glb`,h.position,h.rotation)],['center-palm',await model('apps/browser/public/assets/palm.glb',[-8,64,9])],['lamp',await model('apps/browser/public/assets/lamp.glb',[-11.7,22,9])],['left-palm',await model('apps/browser/public/assets/palm.glb',[-21,35,9])]];
  const ray=new T.Raycaster(),rows=[];
  for(const[name,target]of targets){
    const bounds=new T.Box2();for(const m of meshes(target))for(const p of vertices(m)){const v=p.project(cam);bounds.expandByPoint(new T.Vector2((v.x+1)*836,(1-v.y)*470.5));}
    let sampled=0,occluded=0;
    for(let y=Math.max(0,Math.floor(bounds.min.y));y<=Math.min(940,Math.ceil(bounds.max.y));y+=2)for(let x=Math.max(0,Math.floor(bounds.min.x));x<=Math.min(1671,Math.ceil(bounds.max.x));x+=2){ray.setFromCamera(new T.Vector2((x+.5)/836-1,1-(y+.5)/470.5),cam);ray.far=1000;const hit=ray.intersectObject(target,true)[0];if(!hit)continue;sampled++;ray.far=hit.distance-.01;if(ray.intersectObject(oak,true).length > 0)occluded++;}
    assert.ok(sampled>100,`${name} must be actually sampled`);
    if(name!=='left-palm')assert.equal(occluded,0,`${name} must remain clear`);
    const row={name,sampled,occluded,occludedPercent:100*occluded/sampled};rows.push(row);
    if(name==='left-palm')t.diagnostic(`Conservative opaque-card overlap, not a clearance pass: ${occluded}/${sampled} left-palm pixels occluded (${row.occludedPercent.toFixed(3)}%). Native visual review accepts this overlap within the existing tree cluster.`);
  }
  output.landmarks=rows;writeFileSync(`${dir}/mature-oak-geometry.json`,JSON.stringify(output,null,2)+'\n');
});
