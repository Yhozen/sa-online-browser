// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
function verifyActualPlanting(scene,ground,includeEdges=false){
  scene.updateMatrixWorld(true);
  const exclusions=rectangles(fixture),world=new THREE.Matrix4(),instance=new THREE.Matrix4();
  let vertices=0,clumps=0,grassTriangles=0,soilTriangles=0,minRoadClearance=Infinity,maxHeight=-Infinity;
  for(const mesh of scene.children){
    if(!mesh.name.startsWith('Arroyo yard grass')&&!(includeEdges&&mesh.name.startsWith('Arroyo grass clumps'))&&mesh.name!=='Arroyo original soil transitions')continue;
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
    assert.equal(n.count,p.count);
    for(let i=0;i<n.count;i++)assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i))&&Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
    const count=mesh.isInstancedMesh?mesh.count:1;assert.ok(Number.isSafeInteger(count)&&count>0);
    if(mesh.isInstancedMesh){if(mesh.name.startsWith('Arroyo yard grass'))clumps+=count;grassTriangles+=count*g.index.count/3;}
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
  assert.ok(vertices>10000&&clumps>=16000&&clumps<=26000&&soilTriangles>100,'substantial actual geometry must be inspected');
  assert.ok(grassTriangles<=740000,'wider turf coverage must stay inside the curved-blade triangle budget');
  assert.ok(maxHeight>.15&&minRoadClearance>.05,'preserve physically visible clumps with a measured sidewalk gap');
  return {vertices,clumps,grassTriangles,soilTriangles,minRoadClearance,maxHeight};
}
test('actual yard grass and soil geometry stays low and clear of travel surfaces and fixture obstacles',()=>{
  const scene=new THREE.Scene(),ground=new THREE.MeshStandardMaterial({map:new THREE.Texture()});
  plantVerges(scene,fixture,ground);verifyActualPlanting(scene,ground);
});
test('fine turf covers the lawns without increasing grass draw calls or removing blade curvature',()=>{
  const scene=new THREE.Scene();plantVerges(scene,fixture);scene.updateMatrixWorld(true);
  const grass=scene.children.filter(mesh=>mesh.isInstancedMesh);
  const yard=grass.filter(mesh=>mesh.name.startsWith('Arroyo yard grass'));
  const occupied=new Set(),materials=new Set(),matrix=new THREE.Matrix4();
  let triangles=0;
  for(const mesh of grass){
    materials.add(mesh.material);triangles+=mesh.count*mesh.geometry.index.count/3;
    const blades=mesh.geometry.attributes.position.count/8;
    assert.ok(blades>=4&&blades<=6,'tufts must spread a few blades instead of recreating dense islands');
    assert.equal(mesh.geometry.index.count,blades*3*6,'each blade retains three curved ribbon segments');
    const normals=mesh.geometry.attributes.normal;
    for(let i=0;i<normals.count;i++)assert.ok(normals.getZ(i)>.95,'thin turf retains an upward canopy lighting field');
  }
  for(const mesh of yard){
    const bounds=mesh.boundingBox.getSize(new THREE.Vector3());
    assert.ok(bounds.x<24.65&&bounds.y<24.65,'grass batches retain tight 24 m spatial culling');
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      occupied.add(`${Math.floor(matrix.elements[12]/.25)},${Math.floor(matrix.elements[13]/.25)}`);
    }
  }
  // The previous islands occupied 3,540 quarter-metre cells on this fixture.
  // This independent world-space count requires at least three times that area.
  assert.ok(occupied.size>=10620,'continuous planting must reach substantially more lawn area');
  assert.equal(materials.size,1,'all turf must share one material pass');
  assert.ok(grass.length<=87&&triangles<=800000,'wider planting must fit the previous mesh and triangle envelope');
});
test('yard planting can build without global browser assets or an optional grass texture',()=>{
  const scene=new THREE.Scene();plantVerges(scene,fixture);
  assert.ok(scene.children.some(o=>o.name==='Arroyo original soil transitions'));
  assert.ok(scene.children.every(o=>o.geometry&&o.material));
  assert.ok(!scene.children.some(o=>o.name.startsWith('Arroyo mown access turf ')), 'optional no-atlas path remains unchanged');
});

test('original grass atlas forms rooted curved volumes with safe UVs and full travel clearance',()=>{
  // A browser-independent alpha atlas makes incorrect quadrants, flipped V,
  // floating root margins and an opaque rectangular fallback observable.
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const quadrant=(x>=size/2?1:0)+(y>=size/2?2:0),u=(x%(size/2))/(size/2),v=(y%(size/2))/(size/2);
    const root=quadrant<2?.886:.826,half=.12+.30*Math.min(1,v/root);
    const offset=(y*size+x)*4;data.set([95+quadrant*20,140-quadrant*8,50+quadrant*9,0],offset);
    if(v>.08&&v<=root+.015&&Math.abs(u-.5)<half)data[offset+3]=255;
  }
  const atlas=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);atlas.flipY=false;
  const scene=new THREE.Scene(),ground=new THREE.MeshStandardMaterial({map:new THREE.Texture()});
  plantVerges(scene,fixture,ground,atlas);
  const metrics=verifyActualPlanting(scene,ground,true);
  const grass=scene.children.filter(mesh=>mesh.isInstancedMesh),cards=grass.filter(mesh=>mesh.material.map===atlas);
  assert.ok(cards.length>10,'original alpha volumes must cover many spatial lawn batches');
  assert.equal(new Set(grass.map(mesh=>mesh.material)).size,2,'retain only ribbon and card materials');
  // Count every grass batch, including the short access turf, in the old cap.
  const totalGrassTriangles=grass.reduce((sum,mesh)=>sum+mesh.count*mesh.geometry.index.count/3,0);
  assert.ok(grass.length<=87&&totalGrassTriangles<=760000,'all atlas-path turf stays within the existing draw and triangle budgets');
  const geometries=new Set(cards.map(mesh=>mesh.geometry));assert.equal(geometries.size,1,'one shared card geometry must service all batches');
  for(const mesh of cards){
    assert.equal(mesh.material.alphaTest,.45);assert.equal(mesh.material.side,THREE.DoubleSide);
    assert.ok(!mesh.material.transparent&&mesh.material.depthWrite,'alpha-tested blades retain real depth');
    if(mesh.name.startsWith('Arroyo yard grass'))assert.ok(mesh.castShadow&&mesh.receiveShadow,'alpha canopy keeps actual sun shadows');
  }
  for(const geometry of geometries){
    const p=geometry.attributes.position,uv=geometry.attributes.uv,n=geometry.attributes.normal,index=geometry.index.array;
    assert.equal(uv.count,p.count);const quadrants=new Set(),directions=[];
    const parent=Array.from({length:p.count},(_,i)=>i);
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
    for(let i=0;i<index.length;i+=3){
      const triangle=Array.from(index.slice(i,i+3));for(const j of triangle.slice(1))parent[find(j)]=find(triangle[0]);
      const vertices=triangle.map(i=>new THREE.Vector3().fromBufferAttribute(p,i));
      const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
      assert.ok(normal.length()>1e-7&&Math.abs(normal.z/normal.length())<.4,'cards form upright nondegenerate faces, never a ground rectangle');
      const ids=triangle.map(i=>Math.floor(uv.getX(i)*2)+2*Math.floor(uv.getY(i)*2));
      assert.ok(ids.every(id=>id===ids[0]),'each triangle samples only one isolated atlas quadrant');quadrants.add(ids[0]);
    }
    const components=new Map();for(let i=0;i<p.count;i++){const key=find(i);if(!components.has(key))components.set(key,[]);components.get(key).push(i)}
    assert.ok(components.size>=2&&components.size<=3&&quadrants.size>=2,'cross a few distinct original grass silhouettes');
    for(const ids of components.values()){
      const min=Math.min(...ids.map(i=>p.getZ(i))),max=Math.max(...ids.map(i=>p.getZ(i)));
      assert.ok(Math.abs(min)<1e-7&&max>.18&&max<=.215,'rooted card height retains the player-scale grass contract');
      const bottom=ids.filter(i=>Math.abs(p.getZ(i)-min)<1e-7),top=ids.filter(i=>Math.abs(p.getZ(i)-max)<1e-7);
      assert.equal(bottom.length,2);assert.equal(top.length,2);
      const base=bottom.map(i=>new THREE.Vector3().fromBufferAttribute(p,i)),tip=top.map(i=>new THREE.Vector3().fromBufferAttribute(p,i));
      const width=base[0].distanceTo(base[1]);assert.ok(width>=.30&&width<=.37,'replace needles with genuinely broad clump silhouettes');
      directions.push(base[1].clone().sub(base[0]).normalize());
      assert.ok(base[0].clone().add(base[1]).sub(tip[0]).sub(tip[1]).setZ(0).length()>.03,'vertical strips must retain a curved lean');
      const rootUV=new THREE.Vector2((uv.getX(bottom[0])+uv.getX(bottom[1]))/2,(uv.getY(bottom[0])+uv.getY(bottom[1]))/2);
      const pixel=(Math.floor(rootUV.y*size)*size+Math.floor(rootUV.x*size))*4;
      assert.ok(data[pixel+3]>.45*255,'visible sampled roots reach the geometric ground edge');
      assert.ok(top.every(i=>uv.getY(i)<rootUV.y),'DataTexture V maps root-to-tip in the correct PNG direction');
    }
    assert.ok(directions.some((a,i)=>directions.slice(i+1).some(b=>Math.abs(a.dot(b))<.8)),'crossed faces retain volume from different view directions');
    for(let i=0;i<p.count;i++){
      assert.ok(uv.getX(i)>0&&uv.getX(i)<1&&uv.getY(i)>0&&uv.getY(i)<1,'crop inside the atlas without wrapping');
      assert.ok(n.getZ(i)>.95,'alpha canopy retains view-safe upward shading');
    }
  }
});

// Mown turf is allowed on the unpaved door/drive approach, unlike tall plants.
// These are the native house kit's physical slabs, foundation, roof and steps;
// they deliberately do not repeat the turf generator's sampling rectangles.
function mownPavementRectangles() {
  const manifest = structuredClone(fixture);
  manifest.houses = [];
  const result = rectangles(manifest);
  for (const house of fixture.houses) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...house.position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), house.rotation),
      new THREE.Vector3(...(house.scale ?? [1, 1, 1])));
    for (const [name, x, y, width, depth] of [
      ['foundation', 0, 0, 16.4, 12.4], ['covered porch', -3, -7, 6.7, 2.9],
      ['lower step', -3, -8.8, 3, .5], ['upper step', -3, -8.45, 3, .5],
      ['outer driveway slab', 6, -10.5, 3.97, 2.98], ['inner driveway slab', 6, -7.5, 3.97, 2.98],
    ]) {
      const center = new THREE.Vector3(x, y, 0).applyMatrix4(transform);
      const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
      const axes = [new THREE.Vector2(c, s), new THREE.Vector2(-s, c)];
      const half = new THREE.Vector2(width * (house.scale?.[0] ?? 1) / 2, depth * (house.scale?.[1] ?? 1) / 2);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        new THREE.Vector2(center.x, center.y).addScaledVector(axes[0], u * half.x).addScaledVector(axes[1], v * half.y));
      result.push({ name: `${house.id} ${name}`, axes, corners, bounds: new THREE.Box2().setFromPoints(corners) });
    }
  }
  return result;
}

const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function pointInTriangle(point, [a, b, c]) {
  if (Math.abs(cross2(a, b, c)) < 1e-12) return false;
  const sides = [cross2(a, b, point), cross2(b, c, point), cross2(c, a, point)];
  return sides.every(n => n >= 0) || sides.every(n => n <= 0);
}
function segmentGap(a, b, c, d) {
  if (cross2(a, b, c) * cross2(a, b, d) < 0 && cross2(c, d, a) * cross2(c, d, b) < 0) return 0;
  return Math.min(distanceToSegment(a, c.toArray(), d.toArray()), distanceToSegment(b, c.toArray(), d.toArray()),
    distanceToSegment(c, a.toArray(), b.toArray()), distanceToSegment(d, a.toArray(), b.toArray()));
}

test('actual short turf stays below six centimetres and outside pavement and fixture footprints', async t => {
  const original = structuredClone(fixture), scene = new THREE.Scene(), atlas = new THREE.Texture();
  plantVerges(scene, fixture, undefined, atlas); scene.updateMatrixWorld(true);
  assert.deepEqual(fixture, original, 'decorative turf cannot change authoritative collision or layout');
  const mown = scene.children.filter(mesh => mesh.name.startsWith('Arroyo mown access turf '));
  const existing = scene.children.filter(mesh => mesh.isInstancedMesh && !mown.includes(mesh));
  const count = mown.reduce((sum, mesh) => sum + mesh.count, 0);
  assert.ok(count >= 8000 && count <= 12000, 'inspect substantial short turf without unbounded density');
  const exclusions = mownPavementRectangles(), modelCache = new Map();
  // Match existing garden tests: some visible props have no server barrier.
  // Their actual exported ground-level vertices still exclude grass blades.
  for (const [i, prop] of fixture.props.entries()) {
    if (!['pole', 'lamp', 'mailbox', 'bin'].includes(prop.asset)) continue;
    if (!modelCache.has(prop.asset)) {
      const bytes = readFileSync(`apps/browser/public/assets/${prop.asset}.glb`);
      const model = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
      model.rotation.x = Math.PI / 2; model.updateMatrixWorld(true);
      const vertices = []; model.traverse(mesh => {
        if (mesh.isMesh) for (let j = 0; j < mesh.geometry.attributes.position.count; j++)
          vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(mesh.matrixWorld));
      }); modelCache.set(prop.asset, vertices);
    }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...prop.position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), prop.rotation),
      new THREE.Vector3(...(prop.scale ?? [1, 1, 1])));
    const low = modelCache.get(prop.asset).map(point => point.clone().applyMatrix4(transform))
      .filter(point => point.z >= fixture.groundZ - .05 && point.z <= fixture.groundZ + .07);
    assert.ok(low.length, `${prop.asset} exposes its actual ground footprint`);
    const bounds = new THREE.Box2().setFromPoints(low.map(point => new THREE.Vector2(point.x, point.y)));
    const { min, max } = bounds;
    exclusions.push({ name: `${prop.asset} ${i}`, bounds, axes: [new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)],
      corners: [min.clone(), new THREE.Vector2(max.x, min.y), max.clone(), new THREE.Vector2(min.x, max.y)] });
  }
  const roads = fixture.roads.flatMap(road => road.points.slice(1).map((end, i) => {
    const a = new THREE.Vector2(...road.points[i]), b = new THREE.Vector2(...end), radius = road.width / 2 + 2.5;
    return { a, b, radius, bounds: new THREE.Box2().setFromPoints([a, b]).expandByScalar(radius) };
  }));
  const circle = fixture.culdesac && { center: new THREE.Vector2(...fixture.culdesac.center), radius: fixture.culdesac.radius + 2.5 };
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  let vertices = 0, triangles = 0, maximumHeight = -Infinity, minimumPavementGap = Infinity;
  for (const mesh of mown) {
    assert.ok(existing.some(old => old.geometry === mesh.geometry && old.material === mesh.material), 'reuse the original ribbon geometry and material');
    assert.equal(mesh.material.map, null, 'short turf uses curved geometry, not a new texture');
    assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
    const size = mesh.boundingBox.getSize(new THREE.Vector3()); assert.ok(size.x < 24.65 && size.y < 24.65);
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, instance); world.multiplyMatrices(mesh.matrixWorld, instance);
      assert.ok(world.elements.every(Number.isFinite));
      const horizontal = [];
      for (let j = 0; j < p.count; j++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, j).applyMatrix4(world), height = point.z - fixture.groundZ;
        assert.ok(height >= -.007 && height <= .06, `mown blade height ${height} must remain walkable`);
        assert.ok(Math.abs(point.x) < fixture.halfSize && Math.abs(point.y) < fixture.halfSize);
        maximumHeight = Math.max(maximumHeight, height); vertices++; horizontal.push(new THREE.Vector2(point.x, point.y));
        for (const road of roads) minimumPavementGap = Math.min(minimumPavementGap, distanceToSegment(point, road.a.toArray(), road.b.toArray()) - road.radius);
      }
      const bounds = new THREE.Box2().setFromPoints(horizontal), nearby = exclusions.filter(rect => bounds.intersectsBox(rect.bounds));
      const nearbyRoads = roads.filter(road => bounds.intersectsBox(road.bounds));
      for (let j = 0; j < index.count; j += 3) {
        const triangle = [0, 1, 2].map(k => horizontal[index.getX(j + k)]); triangles++;
        for (const rect of nearby) assert.ok(!intersectsTriangle(triangle, rect), `mown triangle enters ${rect.name}`);
        for (const road of nearbyRoads) {
          const gap = pointInTriangle(road.a, triangle) || pointInTriangle(road.b, triangle) ? 0
            : Math.min(...triangle.map((point, k) => segmentGap(point, triangle[(k + 1) % 3], road.a, road.b)));
          assert.ok(gap >= road.radius - 1e-6, 'full mown triangle enters road or 2.5m sidewalk');
        }
        if (circle) {
          const gap = pointInTriangle(circle.center, triangle) ? 0 : Math.min(...triangle.map((point, k) =>
            distanceToSegment(circle.center, point.toArray(), triangle[(k + 1) % 3].toArray())));
          assert.ok(gap >= circle.radius - 1e-6, 'full mown triangle enters the turning circle or sidewalk');
        }
      }
    }
  }
  assert.ok(vertices > 200000 && triangles > 150000 && maximumHeight > .045 && minimumPavementGap > 0);
  t.diagnostic(`${count} short tufts; ${vertices} actual vertices; ${triangles} triangles; maximum height ${maximumHeight.toFixed(6)}m; minimum pavement vertex gap ${minimumPavementGap.toFixed(6)}m`);
});
