// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VehiclePresentation } from '../apps/browser/src/vehicle-presentation.ts';
import { applyQuality, disposeQualityMaterial } from '../apps/browser/src/graphics.ts';

async function car() {
  const bytes = readFileSync('apps/browser/public/assets/coupe.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = new THREE.Group(); gltf.scene.rotation.x = Math.PI / 2; root.add(gltf.scene); root.updateMatrixWorld(true);
  return root;
}
const rotation = heading => [Math.cos(heading / 2), 0, 0, -Math.sin(heading / 2)];
const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const point = object => object.getWorldPosition(new THREE.Vector3());
function wheels(root) { const result = []; root.traverse(object => { if (/^wheel_(left|right)_\d+$/.test(object.name)) result.push(object); }); return result; }

test('actual coupe wheels roll with signed forward/reverse distance and keep all axle/seat positions', async () => {
  const root = await car(), wheelObjects = wheels(root), anchors = ['seat_driver', 'seat_passenger'].map(name => root.getObjectByName(name));
  const before = [...wheelObjects, ...anchors].map(point), neutral = wheelObjects.map(wheel => wheel.quaternion.clone());
  const presentation = new VehiclePresentation(root);
  for (let i = 0; i < 30; i++) presentation.advance([0, 5, 0], 1 / 60, { rotation: rotation(0) });
  close(presentation.state.rolling, (2.5 / .41) % (Math.PI * 2));
  assert.ok(wheelObjects.every((wheel, i) => wheel.quaternion.angleTo(neutral[i]) > .1));
  for (let i = 0; i < 30; i++) presentation.advance([0, -5, 0], 1 / 60, { rotation: rotation(0) });
  close(presentation.state.rolling, 0);
  for (let i = 0; i < wheelObjects.length; i++) close(wheelObjects[i].quaternion.angleTo(neutral[i]), 0, .00001);
  root.updateMatrixWorld(true);
  [...wheelObjects, ...anchors].forEach((object, i) => close(point(object).distanceTo(before[i]), 0));
  presentation.advance([-4, 0, 0], .1, { rotation: rotation(Math.PI / 2) });
  close(presentation.state.signedSpeed, 4);
  presentation.advance([4, 0, 0], .1, { rotation: rotation(Math.PI / 2) });
  close(presentation.state.signedSpeed, -4);
  presentation.dispose();
});

test('front axles steer from replicated heading, reverse correctly and return straight at rest', async () => {
  const root = await car(), before = wheels(root).map(point), presentation = new VehiclePresentation(root);
  for (let i = 0; i < 100; i++) {
    const heading = i / 60 * .8;
    presentation.advance([-Math.sin(heading) * 6, Math.cos(heading) * 6, 0], 1 / 60, { rotation: rotation(heading) });
  }
  assert.ok(presentation.state.steering > .25 && presentation.state.steering < .4);
  root.updateMatrixWorld(true);
  for (const [i, wheel] of wheels(root).entries()) {
    const axle = new THREE.Vector3(0, 0, 1).transformDirection(wheel.matrixWorld);
    if (wheel.name.endsWith('_1')) assert.ok(axle.y < -.2, 'front axle steers about the car vertical axis');
    else close(axle.y, 0, .00001);
    close(point(wheel).distanceTo(before[i]), 0);
  }
  for (let i = 0; i < 90; i++) presentation.advance([0, 0, 0], 1 / 60, { rotation: rotation(99 / 60 * .8) });
  assert.ok(Math.abs(presentation.state.steering) < .0001);
  presentation.dispose();
  const reversing = new VehiclePresentation(root);
  for (let i = 0; i < 100; i++) {
    const heading = i / 60 * .8;
    reversing.advance([Math.sin(heading) * 6, -Math.cos(heading) * 6, 0], 1 / 60, { rotation: rotation(heading) });
  }
  assert.ok(reversing.state.steering < -.25, 'same world yaw while reversing requires opposite front-wheel steering');
  reversing.dispose();
});

test('reverse extraction partitions actual authored ivory triangles without moving plates or anchors', async () => {
  const root = await car(), ivory = root.getObjectByName('ivory'), original = ivory.geometry;
  const originalTriangles = (original.index?.count ?? original.getAttribute('position').count) / 3;
  const presentation = new VehiclePresentation(root), lamps = root.getObjectByName('reverse-lamps');
  assert.ok(lamps, 'existing reverse lenses must be found');
  assert.equal((ivory.geometry.index.count + lamps.geometry.index.count) / 3, originalTriangles);
  root.updateMatrixWorld(true);
  const positions = lamps.geometry.getAttribute('position'), occupied = new Set(), location = new THREE.Vector3();
  for (const index of lamps.geometry.index.array) {
    location.fromBufferAttribute(positions, index).applyMatrix4(lamps.matrixWorld);
    occupied.add(Math.sign(location.x));
    assert.ok(Math.abs(Math.abs(location.x) - .42) < .034);
    assert.ok(Math.abs(location.y + 2.222) < .006);
    assert.ok(Math.abs(location.z + .327) < .0095);
  }
  assert.deepEqual([...occupied].sort(), [-1, 1]);
  assert.ok(lamps.geometry.index.count > 60, 'both bevelled lamps retain real geometry');
  presentation.dispose();
  assert.equal(ivory.geometry, original); assert.equal(root.getObjectByName('reverse-lamps'), undefined);
});

test('brake/handbrake/reverse indicators affect only owned lamp materials in Standard and Low', async () => {
  const root = await car(), tail = root.getObjectByName('tail'), sharedTail = tail.material, sharedColor = sharedTail.color.clone();
  const presentation = new VehiclePresentation(root, disposeQualityMaterial), reverse = root.getObjectByName('reverse-lamps');
  assert.notEqual(tail.material, sharedTail);
  const standardTail = tail.material, standardReverse = reverse.material;
  for (let i = 0; i < 20; i++) presentation.advance([0, 8, 0], 1 / 60, { keys: 32 });
  assert.ok(standardTail.emissiveIntensity > .75);
  assert.equal(sharedTail.emissiveIntensity, 1); // Unlit export has black emission at this scalar.
  assert.ok(sharedTail.color.equals(sharedColor));
  assert.equal(standardReverse.emissiveIntensity, 0);
  applyQuality(root, true);
  assert.ok(tail.material instanceof THREE.MeshBasicMaterial);
  for (let i = 0; i < 20; i++) presentation.advance([0, -3, 0], 1 / 60, { keys: 128 });
  assert.ok(presentation.state.braking > .99, 'handbrake also lights rear brakes while reversing');
  assert.ok(presentation.state.reversing > .99);
  assert.ok(tail.material.color.r > .95);
  assert.ok(reverse.material.color.r > .95);
  applyQuality(root, false);
  assert.equal(tail.material, standardTail); assert.equal(reverse.material, standardReverse);
  assert.ok(standardTail.emissiveIntensity > .75 && standardReverse.emissiveIntensity > 1.9);
  for (let i = 0; i < 90; i++) presentation.advance([0, 0, 0], 1 / 60, { keys: 0 });
  assert.ok(standardTail.emissiveIntensity < .0001 && standardReverse.emissiveIntensity < .0001);
  let ownedDisposals = 0, sharedDisposals = 0;
  standardTail.addEventListener('dispose', () => ownedDisposals++);
  standardReverse.addEventListener('dispose', () => ownedDisposals++);
  sharedTail.addEventListener('dispose', () => sharedDisposals++);
  applyQuality(root, true);
  const lowTail = tail.material, lowReverse = reverse.material;
  lowTail.addEventListener('dispose', () => ownedDisposals++); lowReverse.addEventListener('dispose', () => ownedDisposals++);
  presentation.dispose(); presentation.dispose();
  assert.equal(ownedDisposals, 4); assert.equal(sharedDisposals, 0); assert.equal(tail.material, sharedTail);
});

test('large corrections and invalid samples cannot spin wheels or disturb the car root', async () => {
  const root = await car(), presentation = new VehiclePresentation(root), orientation = root.quaternion.clone();
  presentation.advance([0, 5, 0], 1 / 60, { rotation: rotation(0) });
  presentation.advance([0, -5, 0], 1 / 60, { rotation: rotation(Math.PI) });
  close(presentation.state.steering, 0);
  const snapshot = { ...presentation.state };
  presentation.advance([NaN, 0, 0], .1); presentation.advance([0, 5, 0], Infinity); presentation.advance([0, 5, 0], 2);
  assert.deepEqual(presentation.state, snapshot); assert.ok(root.quaternion.equals(orientation));
  presentation.dispose();
});
