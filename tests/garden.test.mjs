// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gardenPlacements, vergeGardenPlacements } from '../apps/browser/src/garden.ts';

async function exportedGeometry(name) {
  const bytes = readFileSync(`apps/browser/public/assets/${name}.glb`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const normalized = new THREE.Group(); gltf.scene.rotation.x = Math.PI / 2; normalized.add(gltf.scene); normalized.updateMatrixWorld(true);
  const vertices = [], triangles = [];
  normalized.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position, offset = vertices.length;
    for (let i = 0; i < positions.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
    const indices = object.geometry.index?.array ?? Array.from({ length: positions.count }, (_, i) => i);
    for (let i = 0; i < indices.length; i += 3) triangles.push([offset + indices[i], offset + indices[i + 1], offset + indices[i + 2]]);
  });
  return { vertices, triangles };
}
const gardenModel = exportedGeometry('garden-low');
const placementMatrix = placement => new THREE.Matrix4().compose(new THREE.Vector3(...placement.position),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), placement.rotation),
  new THREE.Vector3(...(placement.scale ?? [1, 1, 1])));

test('exported garden specimens fit existing beds without entering porch, drive or walls', async () => {
  const manifest = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  const authoredPoints = (await gardenModel).vertices;
  assert.ok(authoredPoints.length > 1000);
  const placements = gardenPlacements(manifest);
  assert.equal(placements.length, manifest.houses.length * 3);
  for (const [index, placement] of placements.entries()) {
    const house = manifest.houses[Math.floor(index / 3)];
    const parent = new THREE.Matrix4().compose(new THREE.Vector3(...house.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), house.rotation), new THREE.Vector3(...(house.scale ?? [1, 1, 1]))).invert();
    const world = new THREE.Matrix4().compose(new THREE.Vector3(...placement.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), placement.rotation), new THREE.Vector3(...placement.scale));
    for (const source of authoredPoints) {
      const p = source.clone().applyMatrix4(world).applyMatrix4(parent);
      // These boundaries are the authored physical bed dimensions in the house,
      // independent of the placement routine's chosen specimen positions.
      const insideLeft = p.x >= -7.75 && p.x <= -6.35;
      const insideRight = p.x >= -.275 && p.x <= 3.275;
      assert.ok((insideLeft || insideRight) && p.y >= -7.31 && p.y <= -6.10, `garden vertex leaves its existing bed: ${p.toArray()}`);
      assert.ok(p.z >= .045 && p.z <= .70);
    }
  }
});

function rectangle(name, center, half, angle = 0) {
  const axes = [new THREE.Vector2(Math.cos(angle), Math.sin(angle)), new THREE.Vector2(-Math.sin(angle), Math.cos(angle))];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => center.clone().addScaledVector(axes[0], x * half.x).addScaledVector(axes[1], y * half.y));
  return { name, axes, corners, bounds: new THREE.Box2().setFromPoints(corners) };
}
function triangleOverlapsRectangle(points, rect) {
  const axes = [...rect.axes];
  for (let i = 0; i < 3; i++) {
    const a = points[i], b = points[(i + 1) % 3], normal = new THREE.Vector2(a.y - b.y, b.x - a.x);
    if (normal.lengthSq() > 1e-12) axes.push(normal.normalize());
  }
  return axes.every(axis => {
    const a = points.map(p => p.dot(axis)), b = rect.corners.map(p => p.dot(axis));
    return Math.max(...a) > Math.min(...b) + 1e-6 && Math.max(...b) > Math.min(...a) + 1e-6;
  });
}
function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function insideTriangle(p, [a, b, c]) {
  if (Math.abs(cross(a, b, c)) < 1e-12) return false;
  const sides = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
  return sides.every(x => x >= 0) || sides.every(x => x <= 0);
}
function segmentDistance(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
function triangleSegmentDistance(points, a, b) {
  if (insideTriangle(a, points) || insideTriangle(b, points)) return 0;
  return Math.min(...points.map((p, i) => segmentDistance(p, points[(i + 1) % 3], a, b)));
}

test('actual verge garden triangles remain low and clear of roads, access paths and existing fixtures', async t => {
  const manifest = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  const original = structuredClone(manifest), placements = vergeGardenPlacements(manifest);
  assert.deepEqual(manifest, original, 'decorative placement must not alter the authoritative fixture');
  assert.ok(placements.length >= 10, 'retain substantial low verge planting');
  const authored = await gardenModel;
  assert.ok(authored.vertices.length > 1000 && authored.triangles.length > 1000, 'inspect the actual exported specimen');
  const exclusions = manifest.barriers.map(b => rectangle(b.id, new THREE.Vector2(...b.position), new THREE.Vector2(b.size[0] / 2, b.size[1] / 2)));
  for (const house of manifest.houses) {
    const transform = placementMatrix(house), sx = house.scale?.[0] ?? 1, sy = house.scale?.[1] ?? 1;
    // Measured physical foundation, porch roof and steps from the native house
    // kit; driveway/door strips are traversable clearances, not plant radii.
    for (const [name, x, y, width, depth] of [
      ['house foundation', 0, 0, 16.4, 12.4], ['covered porch', -3, -7, 6.7, 2.9],
      ['lower porch step', -3, -8.8, 3, .5], ['upper porch step', -3, -8.45, 3, .5],
      ['drive access', 6, -13.35, 4, 14.7], ['door access', -3, -14.6, 2.8, 12.2],
    ]) {
      const center = new THREE.Vector3(x, y, 0).applyMatrix4(transform);
      exclusions.push(rectangle(`${house.id} ${name}`, new THREE.Vector2(center.x, center.y), new THREE.Vector2(width * sx / 2, depth * sy / 2), house.rotation));
    }
  }
  // Some visible fixed props intentionally have no collision barrier. Use
  // their actual exported low vertices so plant leaves cannot enter a pole,
  // mailbox post or bin even though the server fixture remains unchanged.
  const propModels = new Map(await Promise.all(['pole', 'lamp', 'mailbox', 'bin'].map(async name => [name, await exportedGeometry(name)])));
  for (const [index, prop] of manifest.props.entries()) {
    const model = propModels.get(prop.asset); if (!model) continue;
    const transform = placementMatrix(prop), low = model.vertices.map(p => p.clone().applyMatrix4(transform)).filter(p => p.z <= manifest.groundZ + .65 && p.z >= manifest.groundZ - .05);
    assert.ok(low.length, `${prop.asset} must expose its ground footprint`);
    const bounds = new THREE.Box2().setFromPoints(low.map(p => new THREE.Vector2(p.x, p.y)));
    exclusions.push(rectangle(`${prop.asset} prop ${index}`, bounds.getCenter(new THREE.Vector2()), bounds.getSize(new THREE.Vector2()).multiplyScalar(.5)));
  }
  const roads = manifest.roads.flatMap(road => road.points.slice(1).map((end, i) => {
    const a = new THREE.Vector2(...road.points[i]), b = new THREE.Vector2(...end), radius = road.width / 2 + 2.5;
    return { a, b, radius, bounds: new THREE.Box2().setFromPoints([a, b]).expandByScalar(radius) };
  }));
  const circle = manifest.culdesac && { center: new THREE.Vector2(...manifest.culdesac.center), radius: manifest.culdesac.radius + 2.5 };
  let inspectedTriangles = 0, maxHeight = -Infinity, minimumRoadGap = Infinity;
  for (const [index, placement] of placements.entries()) {
    assert.equal(placement.asset, 'garden-low');
    const world = placementMatrix(placement); assert.ok(world.elements.every(Number.isFinite));
    const points = authored.vertices.map(p => p.clone().applyMatrix4(world));
    for (const point of points) {
      const height = point.z - manifest.groundZ; maxHeight = Math.max(maxHeight, height);
      assert.ok(height >= -.005 && height <= .65, `plant ${index} height ${height}`);
      assert.ok(Math.abs(point.x) < manifest.halfSize && Math.abs(point.y) < manifest.halfSize);
      for (const road of roads) minimumRoadGap = Math.min(minimumRoadGap, pointSegmentDistance(point, road.a, road.b) - road.radius);
    }
    const horizontal = points.map(p => new THREE.Vector2(p.x, p.y)), bounds = new THREE.Box2().setFromPoints(horizontal);
    const nearby = exclusions.filter(rect => rect.bounds.intersectsBox(bounds)), nearbyRoads = roads.filter(road => road.bounds.intersectsBox(bounds));
    for (const face of authored.triangles) {
      const triangle = face.map(i => horizontal[i]); inspectedTriangles++;
      for (const rect of nearby) assert.ok(!triangleOverlapsRectangle(triangle, rect), `plant ${index} triangle enters ${rect.name}`);
      for (const road of nearbyRoads) assert.ok(triangleSegmentDistance(triangle, road.a, road.b) >= road.radius - 1e-6, `plant ${index} triangle enters road/2.5m sidewalk`);
      if (circle) {
        const distance = insideTriangle(circle.center, triangle) ? 0 : Math.min(...triangle.map((p, i) => pointSegmentDistance(circle.center, p, triangle[(i + 1) % 3])));
        assert.ok(distance >= circle.radius - 1e-6, `plant ${index} triangle enters cul-de-sac/sidewalk`);
      }
    }
  }
  assert.ok(inspectedTriangles > 10000 && maxHeight > .3 && minimumRoadGap > 0);
  t.diagnostic(`${placements.length} plants; ${inspectedTriangles} actual triangles; maximum height ${maxHeight.toFixed(3)}m; minimum vertex sidewalk gap ${minimumRoadGap.toFixed(3)}m`);
});
