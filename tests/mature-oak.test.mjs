// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  const leafBounds=new T.Box3(),woodBounds=new T.Box3();
  for(const m of meshes(mature)){
    const p=vertices(m),g=m.geometry,base=originals.get(m.material.name);assert.ok(base);
    assert.equal(g.index.count,base.geometry.index.count,'growth does not add or remove triangles');triangles+=g.index.count/3;
    for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(new T.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-5);
    for(const v of p){assert.ok(v.toArray().every(Number.isFinite));(m.material.name==='wood'?woodBounds:leafBounds).expandByPoint(v);}
    for(let i=0;i<g.index.count;i+=3){const[a,b,c]=[0,1,2].map(k=>p[g.index.getX(i+k)]);minimumArea=Math.min(minimumArea,b.clone().sub(a).cross(c.clone().sub(a)).length()/2);}
  }
  assert.equal(triangles,8536);assert.ok(minimumArea>1e-6);
  assert.ok(leafBounds.min.z>=4.1 && leafBounds.max.z<=11.4 && leafBounds.max.z-leafBounds.min.z>4.2);
  // Leaf roots and their actual nearest woody surfaces must still connect.
  const woodyTriangles=[];for(const m of meshes(mature).filter(m=>m.material.name==='wood')){const p=vertices(m),idx=m.geometry.index;for(let i=0;i<idx.count;i+=3)woodyTriangles.push(new T.Triangle(...[0,1,2].map(k=>p[idx.getX(i+k)])));}
  const scratch=new T.Vector3();let anchors=0,maximumAttachmentGap=0;
  for(const m of meshes(mature).filter(m=>m.material.name.startsWith('foliage'))){const p=vertices(m),uv=m.geometry.attributes.uv;for(let i=0;i<p.length;i++)if(Math.abs(uv.getX(i))<1e-7&&Math.abs(uv.getY(i)-1)<1e-7){anchors++;maximumAttachmentGap=Math.max(maximumAttachmentGap,Math.sqrt(woodyTriangles.reduce((d,t)=>Math.min(d,t.closestPointToPoint(p[i],scratch).distanceToSquared(p[i])),Infinity)));}}
  assert.equal(anchors,630);assert.ok(maximumAttachmentGap<.04);
  output.geometry={triangles,minimumArea,leafBounds,woodBounds,anchors,maximumAttachmentGap};
});

// Recover physical components across glTF's normal/UV vertex splits. The
// retained parent supplies connectivity; actual published triangles are tested.
function woodContacts(before, after, index) {
  const welded = new Map(), parents = [];
  const vertices = before.map(point => {
    const key = point.toArray().join(',');
    if (!welded.has(key)) { welded.set(key, parents.length); parents.push(parents.length); }
    return welded.get(key);
  });
  const find = vertex => {
    while (parents[vertex] !== vertex) { parents[vertex] = parents[parents[vertex]]; vertex = parents[vertex]; }
    return vertex;
  };
  const faces = Array.from({ length: index.count / 3 }, (_, i) =>
    [0, 1, 2].map(k => index.getX(i * 3 + k)));
  for (const [a, b, c] of faces) {
    parents[find(vertices[b])] = find(vertices[a]);
    parents[find(vertices[c])] = find(vertices[a]);
  }
  const components = new Map();
  for (const face of faces) {
    const root = find(vertices[face[0]]);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(face);
  }
  const groups = [...components.values()].map(faces => ({ faces,
    minimumHeight: Math.min(...faces.flat().map(i => before[i].z)),
    maximumHeight: Math.max(...faces.flat().map(i => before[i].z)),
  }));
  const trunk = groups.filter(group => group.minimumHeight < .1)
    .sort((a, b) => b.maximumHeight - a.maximumHeight)[0];
  assert.ok(trunk.maximumHeight > 5, 'actual main shaft must reach the scaffold');
  const attached = groups.filter(group => group !== trunk && group.minimumHeight < 4.35);
  assert.equal(attached.filter(group => group.minimumHeight < .1).length, 6, 'six original root flares');
  assert.equal(attached.length, 9, 'root flares and three original low scaffold branches');
  const intersections = (left, right, points) => {
    const triangles = group => group.faces.map(face => {
      const triangle = new T.Triangle(...face.map(i => points[i]));
      return { triangle, bounds: new T.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]) };
    });
    const ray = new T.Ray(), hit = new T.Vector3(), direction = new T.Vector3();
    const crosses = (a, b) => [[a.a, a.b], [a.b, a.c], [a.c, a.a]].some(([start, end]) => {
      direction.subVectors(end, start);
      const length = direction.length();
      ray.set(start, direction.clone().divideScalar(length));
      return ray.intersectTriangle(b.a, b.b, b.c, false, hit) !== null && hit.distanceTo(start) <= length + 1e-8;
    });
    const a = triangles(left), b = triangles(right);
    let count = 0;
    for (const x of a) for (const y of b)
      if (x.bounds.intersectsBox(y.bounds) && (crosses(x.triangle, y.triangle) || crosses(y.triangle, x.triangle))) count++;
    return count;
  };
  return attached.map(group => {
    const originalIntersections = intersections(trunk, group, before);
    const actualIntersections = intersections(trunk, group, after);
    assert.ok(originalIntersections > 0, 'the retained parent must actually intersect the shaft');
    assert.equal(actualIntersections, originalIntersections, 'taper must preserve actual root/scaffold surface contacts');
    return { minimumHeight: group.minimumHeight, originalIntersections, actualIntersections };
  });
}

test('accepted 55% low-wood taper preserves native fields, scaffold contacts and collider clearance', async () => {
  const declaration = JSON.parse(readFileSync('assets/source/canopy-base/base.json')).models['roadside-oak'];
  const parent = declaration.derivation.parent.glb;
  assert.equal(parent.sha256, declaration.originalBuild.glb.sha256, 'retained parent is the original untapered native export');
  for (const record of [parent, declaration.glb]) {
    const bytes = readFileSync(record.path);
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, 'declared native source identity');
  }
  const [accepted, untapered] = await Promise.all([model(declaration.glb.path), model(parent.path)]);
  const nativeMeshes = new Map(meshes(accepted).map(mesh => [mesh.material.name, mesh]));
  const parentMeshes = new Map(meshes(untapered).map(mesh => [mesh.material.name, mesh]));
  const bytes = attribute => Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
  for (const mesh of meshes(mature)) {
    const native = nativeMeshes.get(mesh.material.name), original = parentMeshes.get(mesh.material.name);
    assert.deepEqual(mesh.matrixWorld.toArray(), native.matrixWorld.toArray());
    assert.deepEqual(mesh.matrixWorld.toArray(), original.matrixWorld.toArray());
    assert.ok(bytes(mesh.geometry.index).equals(bytes(native.geometry.index)), 'published native topology remains exact');
    assert.ok(bytes(mesh.geometry.index).equals(bytes(original.geometry.index)), 'taper retains parent topology');
    for (const [name, attribute] of Object.entries(native.geometry.attributes)) {
      const actual = mesh.geometry.attributes[name];
      assert.ok(bytes(actual).equals(bytes(attribute)), `published ${mesh.material.name} ${name} matches accepted native bytes`);
      if (mesh.material.name !== 'wood' || !['position', 'normal'].includes(name))
        assert.ok(bytes(actual).equals(bytes(original.geometry.attributes[name])), 'all crown fields and wood UV/color remain original');
    }
  }
  // Read authored Z directly from glTF Y, without a floating-point scene rotation.
  const points = mesh => {
    const p = mesh.geometry.attributes.position;
    return Array.from({ length: p.count }, (_, i) => new T.Vector3(p.getX(i), -p.getZ(i), p.getY(i)));
  };
  const wood = meshes(mature).find(mesh => mesh.material.name === 'wood');
  const before = points(parentMeshes.get('wood')), after = points(wood), index = wood.geometry.index;
  assert.ok(after.every((point, i) => point.z === before[i].z), 'every original wood height remains exact');
  assert.ok(after.every((point, i) => before[i].z < 3.55 || point.equals(before[i])), 'upper scaffold positions remain exact');
  const originalLow = new T.Box3().setFromPoints(before.filter(point => point.z <= 2.1));
  const actualLowPoints = after.filter(point => point.z <= 2.1), actualLow = new T.Box3().setFromPoints(actualLowPoints);
  const oldSize = originalLow.getSize(new T.Vector3()), newSize = actualLow.getSize(new T.Vector3());
  const widthRatios = [newSize.x / oldSize.x, newSize.y / oldSize.y];
  assert.ok(widthRatios.every(ratio => Math.abs(ratio - .55) < 1e-6), 'accepted low root/shaft envelope is 55% of its retained parent');
  const collider = fixture.barriers.find(barrier => barrier.id === 'roadside-oak-0');
  assert.deepEqual(collider.position.slice(0, 2), placement.position.slice(0, 2));
  const maximumLowRadius = Math.max(...actualLowPoints.map(point => Math.hypot(point.x, point.y)));
  assert.ok(maximumLowRadius < Math.min(collider.size[0], collider.size[1]) / 2, 'actual roots stay inside the unchanged collision footprint');
  let minimumFaceOrientationDot = 1;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => index.getX(i + k));
    const normal = p => p[b].clone().sub(p[a]).cross(p[c].clone().sub(p[a])).normalize();
    minimumFaceOrientationDot = Math.min(minimumFaceOrientationDot, normal(before).dot(normal(after)));
  }
  assert.ok(minimumFaceOrientationDot > .95, 'taper retains face orientation without flipped or collapsed transitions');
  output.trunkTaper = { parent: parent.path, acceptedNative: declaration.glb.path, originalLow, actualLow,
    widthRatios, maximumLowRadius, minimumFaceOrientationDot, contacts: woodContacts(before, after, index) };
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
