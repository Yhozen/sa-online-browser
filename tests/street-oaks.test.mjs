// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function vertices(name, materialFilter = () => true) {
  const bytes = readFileSync(`apps/browser/public/assets/${name}.glb`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.rotation.x = Math.PI / 2;
  gltf.scene.updateMatrixWorld(true);
  const points = [];
  gltf.scene.traverse(object => {
    if (!object.isMesh || !materialFilter(object.material.name)) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
  });
  return points;
}

test('street oaks cast onto the road while physical trunks and crowns clear travel and roofs', async () => {
  const scene = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  assert.equal(scene.props.filter(p => p.asset === 'tree').length, 10, 'relocation must retain the existing oak count');
  const foliage = await vertices('tree', name => name.startsWith('foliage'));
  const lowWood = (await vertices('tree', name => name === 'wood')).filter(p => p.z < 2.1);
  const roofModels = await Promise.all([0, 1, 2, 3].map(i => vertices(`house-${i}`, name => ['shingle', 'roof-edge'].includes(name))));
  const transform = p => new THREE.Matrix4().compose(new THREE.Vector3(...p.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rotation), new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
  const houses = scene.houses.map(house => {
    const matrix = transform(house);
    const roof = roofModels[Number(house.asset.at(-1))];
    return { inverse: matrix.clone().invert(), roof: roof.length ? new THREE.Box3().setFromPoints(roof.map(p => p.clone().applyMatrix4(matrix))) : null };
  });
  const distanceToSegment = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(p.x - a[0] - dx * t, p.y - a[1] - dy * t);
  };
  for (const id of ['tree-1', 'tree-2', 'tree-3']) {
    const barrier = scene.barriers.find(b => b.id === id);
    const placement = scene.props.find(p => p.asset === 'tree' && p.position[0] === barrier.position[0] && p.position[1] === barrier.position[1]);
    assert.ok(placement, `${id}: visible tree and authoritative collider must coincide`);
    assert.deepEqual(barrier.size, [.7, .7, 8], 'retain the existing trunk collision envelope');
    const matrix = transform(placement);
    const points = lowWood.map(p => p.clone().applyMatrix4(matrix));
    for (const dx of [-.35, 0, .35]) for (const dy of [-.35, 0, .35])
      points.push(new THREE.Vector3(placement.position[0] + dx, placement.position[1] + dy, scene.groundZ));
    for (const p of points) {
      for (const road of scene.roads) for (let i = 1; i < road.points.length; i++)
        assert.ok(distanceToSegment(p, road.points[i - 1], road.points[i]) > road.width / 2 + 2.5, `${id}: trunk enters road or sidewalk`);
      assert.ok(Math.hypot(p.x - scene.culdesac.center[0], p.y - scene.culdesac.center[1]) > scene.culdesac.radius + 2.5, `${id}: trunk enters turning-circle sidewalk`);
      for (const house of houses) {
        const local = p.clone().applyMatrix4(house.inverse);
        for (const [x, y, width, depth] of [[0, 0, 16.4, 12.4], [-3, -7, 6.7, 2.9], [6, -13.35, 4, 14.7], [-3, -14.6, 2.8, 12.2]])
          assert.ok(Math.abs(local.x - x) >= width / 2 || Math.abs(local.y - y) >= depth / 2, `${id}: trunk blocks house, porch, driveway or door access`);
      }
    }
    const crown = foliage.map(p => p.clone().applyMatrix4(matrix));
    const bounds = new THREE.Box3().setFromPoints(crown);
    assert.ok(bounds.min.z > scene.groundZ + 4.1, 'overhanging leaves preserve pedestrian and vehicle clearance');
    for (const house of houses) if (house.roof)
      assert.equal(bounds.intersectsBox(house.roof), false, `${id}: crown intersects a roof envelope`);
    const onRoad = crown.filter(p => {
      const h = p.z - scene.groundZ - .055, x = p.x + h * 58 / 47, y = p.y - h * 12 / 47;
      return (Math.abs(x) < 6 && y > 2 && y < 40) || Math.hypot(x, y - 40) < 18;
    });
    assert.ok(onRoad.length > 100, `${id}: actual foliage must project onto the street under the fixed sun`);
  }
});

test('the middle oak leaves the actual foreground lamp head visible from the spawn camera', async () => {
  const scene = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  const barrier = scene.barriers.find(b => b.id === 'tree-2');
  const placement = scene.props.find(p => p.asset === 'tree' && p.position[0] === barrier.position[0] && p.position[1] === barrier.position[1]);
  const lamp = scene.props.find(p => p.asset === 'lamp' && p.position[0] < 0 && p.position[1] === 22);
  assert.ok(placement && lamp, 'the tree and landmark must both be present');
  const bytes = readFileSync('apps/browser/public/assets/tree.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.rotation.x = Math.PI / 2;
  gltf.scene.traverse(object => {
    if (object.isMesh) object.material.side = THREE.DoubleSide;
  });
  const oak = new THREE.Group(); oak.add(gltf.scene);
  oak.position.set(...placement.position); oak.rotation.z = placement.rotation;
  oak.scale.set(...(placement.scale ?? [1, 1, 1])); oak.updateMatrixWorld(true);
  const lampMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...lamp.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lamp.rotation), new THREE.Vector3(...(lamp.scale ?? [1, 1, 1])));
  // These samples come from the exported housing and lens, rather than a
  // guessed image rectangle. Conservatively treat leaf cards as fully opaque.
  const head = (await vertices('lamp', name => ['chrome', 'ivory'].includes(name))).map(p => p.applyMatrix4(lampMatrix));
  assert.ok(head.length > 20, 'sample the actual lamp surfaces');
  head.push(new THREE.Box3().setFromPoints(head).getCenter(new THREE.Vector3()));
  const target = new THREE.Vector3(...scene.spawns[0]).add(new THREE.Vector3(0, 0, .75));
  const eye = target.add(new THREE.Vector3(0, -6 * Math.cos(.25), 6 * Math.sin(.25)));
  const ray = new THREE.Raycaster();
  for (const sample of head) {
    const direction = sample.clone().sub(eye);
    ray.set(eye, direction.clone().normalize()); ray.far = direction.length() - .01;
    assert.equal(ray.intersectObject(oak, true).length, 0, 'oak occludes the foreground lamp head');
  }
});
