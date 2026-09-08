// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { plantVerges } from '../apps/browser/src/verges.ts';

const fixture=JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json','utf8'));
const distanceToSegment=(p,a,b)=>{
  const segment=new THREE.Line3(new THREE.Vector3(...a,0),new THREE.Vector3(...b,0));
  const sample=new THREE.Vector3(p.x,p.y,0);
  return segment.closestPointToPoint(sample,true,new THREE.Vector3()).distanceTo(sample);
};
function rectangles(manifest){
  const result=manifest.barriers.map(b=>({name:b.id,center:new THREE.Vector2(b.position[0],b.position[1]),angle:0,half:new THREE.Vector2(b.size[0]/2,b.size[1]/2)}));
  for(const h of manifest.houses){
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(...h.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),h.rotation),new THREE.Vector3(...(h.scale??[1,1,1])));
    // Physical porch-roof footprint and required driveway / front-door access
    // strips, independently expressed as measured rectangles, not clearYard's
    // acceptance predicate or its padded rejection extents.
    for(const [name,cx,cy,width,depth]of [['porch',-3,-7,6.7,2.9],['drive access',6,-13.35,4,14.7],['door access',-3,-14.6,2.8,12.2]]){
      const center=new THREE.Vector3(cx,cy,0).applyMatrix4(transform);
      result.push({name:`${h.id} ${name}`,center:new THREE.Vector2(center.x,center.y),angle:h.rotation,half:new THREE.Vector2(width*(h.scale?.[0]??1)/2,depth*(h.scale?.[1]??1)/2)});
    }
  }
  for(const r of result){
    const c=Math.cos(r.angle),s=Math.sin(r.angle);r.axes=[new THREE.Vector2(c,s),new THREE.Vector2(-s,c)];
    r.corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>r.center.clone().addScaledVector(r.axes[0],x*r.half.x).addScaledVector(r.axes[1],y*r.half.y));
    r.bounds=new THREE.Box2().setFromPoints(r.corners);
  }
  return result;
}
function intersectsTriangle(triangle,rectangle){
  const triangleBounds=new THREE.Box2().setFromPoints(triangle);
  if(!triangleBounds.intersectsBox(rectangle.bounds))return false;
  const axes=[...rectangle.axes];
  for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],edge=new THREE.Vector2(-(b.y-a.y),b.x-a.x);if(edge.lengthSq()>1e-12)axes.push(edge.normalize());}
  for(const axis of axes){
    const a=triangle.map(v=>v.dot(axis)),b=rectangle.corners.map(v=>v.dot(axis));
    if(Math.max(...a)<=Math.min(...b)+1e-6||Math.max(...b)<=Math.min(...a)+1e-6)return false;
  }
  return true;
}
test('actual yard grass and soil geometry stays low and clear of travel surfaces and fixture obstacles',()=>{
  const scene=new THREE.Scene(),ground=new THREE.MeshStandardMaterial({map:new THREE.Texture()});
  plantVerges(scene,fixture,ground);scene.updateMatrixWorld(true);
  const exclusions=rectangles(fixture),world=new THREE.Matrix4(),instance=new THREE.Matrix4();
  let vertices=0,clumps=0,soilTriangles=0,minRoadClearance=Infinity,maxHeight=-Infinity;
  for(const mesh of scene.children){
    if(!mesh.name.startsWith('Arroyo yard grass')&&mesh.name!=='Arroyo original soil transitions')continue;
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
    assert.equal(n.count,p.count);
    for(let i=0;i<n.count;i++)assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i))&&Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
    const count=mesh.isInstancedMesh?mesh.count:1;assert.ok(Number.isSafeInteger(count)&&count>0);
    if(mesh.isInstancedMesh)clumps+=count;
    else{assert.equal(mesh.material.map,ground.map,'soil must reuse the existing original map');assert.equal(g.attributes.color.itemSize,4);assert.ok(mesh.material.transparent&&!mesh.material.depthWrite);}
    for(let i=0;i<count;i++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
      assert.ok(world.elements.every(Number.isFinite));const points=[];
      for(let v=0;v<p.count;v++){
        const sample=new THREE.Vector3().fromBufferAttribute(p,v).applyMatrix4(world);points.push(new THREE.Vector2(sample.x,sample.y));vertices++;
        const height=sample.z-fixture.groundZ;maxHeight=Math.max(maxHeight,height);assert.ok(height>=-.007&&height<=.25);
        assert.ok(Math.abs(sample.x)<fixture.halfSize&&Math.abs(sample.y)<fixture.halfSize);
        for(const road of fixture.roads)for(let s=1;s<road.points.length;s++){
          const clearance=distanceToSegment(sample,road.points[s-1],road.points[s])-road.width/2-2.5;
          minRoadClearance=Math.min(minRoadClearance,clearance);assert.ok(clearance>=-1e-5,'actual blade or soil vertex enters road/sidewalk');
        }
        if(fixture.culdesac)assert.ok(Math.hypot(sample.x-fixture.culdesac.center[0],sample.y-fixture.culdesac.center[1])>=fixture.culdesac.radius+2.5);
      }
      // SAT checks full triangles rather than only vertices: a soil patch whose
      // corners straddle a narrow fence or path must also fail.
      const indices=g.index?.array??Array.from({length:p.count},(_,j)=>j);
      for(let t=0;t<indices.length;t+=3){
        const triangle=[points[indices[t]],points[indices[t+1]],points[indices[t+2]]];
        const signedArea=(triangle[1].x-triangle[0].x)*(triangle[2].y-triangle[0].y)-(triangle[1].y-triangle[0].y)*(triangle[2].x-triangle[0].x);
        if(Math.abs(signedArea)<1e-10)continue;
        if(!mesh.isInstancedMesh)soilTriangles++;
        for(const rectangle of exclusions)assert.ok(!intersectsTriangle(triangle,rectangle),`${mesh.name} triangle enters ${rectangle.name}`);
      }
    }
  }
  assert.ok(vertices>10000&&clumps>=2000&&clumps<=3400&&soilTriangles>100,'substantial actual geometry must be inspected');
  assert.ok(maxHeight>.15&&minRoadClearance>.05,'preserve physically visible clumps with a measured sidewalk gap');
});
test('yard planting can build without global browser assets or an optional grass texture',()=>{
  const scene=new THREE.Scene();plantVerges(scene,fixture);
  assert.ok(scene.children.some(o=>o.name==='Arroyo original soil transitions'));
  assert.ok(scene.children.every(o=>o.geometry&&o.material));
});
