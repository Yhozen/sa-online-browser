// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type { SceneManifest } from '../../../packages/shared/scene';

/** Short walkable turf fills unpaved approaches without blocking doors or drives. */
export function plantMownAccess(scene: THREE.Scene, manifest: SceneManifest,
  geometry: THREE.BufferGeometry, material: THREE.Material) {
  geometry.computeBoundingBox();
  const nativeHeight = geometry.boundingBox!.max.z;
  const bladeRadius = Math.max(...Array.from({ length: geometry.attributes.position.count }, (_, index) =>
    Math.hypot(geometry.attributes.position.getX(index), geometry.attributes.position.getY(index))));
  const batches = new Map<string, THREE.Matrix4[]>(), placement = new THREE.Object3D();
  let randomState = 7721;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  // Some visible fixtures have no server barrier. These conservative radii
  // enclose their native ground footprints: lamp/pole cylinders, mailbox post,
  // and bin body/wheels. The planting test checks the actual exported vertices.
  const fixtureRadii: Record<string, number> = {
    lamp: .075, pole: .16, mailbox: Math.hypot(.045, .045), bin: Math.hypot(.32, .32),
  };
  const fixtures = manifest.props.filter(prop => fixtureRadii[prop.asset] !== undefined).map(prop => ({
    x: prop.position[0], y: prop.position[1],
    radius: fixtureRadii[prop.asset] * Math.max(Math.abs(prop.scale?.[0] ?? 1), Math.abs(prop.scale?.[1] ?? 1)),
  }));
  let count = 0;
  for (const house of manifest.houses) {
    const cosine = Math.cos(house.rotation), sine = Math.sin(house.rotation);
    const scaleX = house.scale?.[0] ?? 1, scaleY = house.scale?.[1] ?? 1;
    // The native driveway ends at y=-12; covered porch/steps end at -9.05.
    // Only unpaved ground is planted, including the door approach and outer drive.
    for (const [left, right, back, front] of [[-4.4, -1.6, -20.7, -9.2], [4, 8, -20.7, -12.25]]) {
      for (let row = back + .22; row < front - .22; row += .15) {
        for (let column = left + .22; column < right - .22; column += .15) {
          const localX = column + (random() - .5) * .15, localY = row + (random() - .5) * .15;
          const x = house.position[0] + localX * scaleX * cosine - localY * scaleY * sine;
          const y = house.position[1] + localX * scaleX * sine + localY * scaleY * cosine;
          const width = .80 + random() * .25, footprint = bladeRadius * width + .01;
          if (Math.abs(x) + footprint >= manifest.halfSize || Math.abs(y) + footprint >= manifest.halfSize) continue;
          if (manifest.barriers.some(barrier => Math.abs(x - barrier.position[0]) < barrier.size[0] / 2 + footprint &&
            Math.abs(y - barrier.position[1]) < barrier.size[1] / 2 + footprint)) continue;
          if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) <
            manifest.culdesac.radius + 2.5 + footprint) continue;
          if (manifest.roads.some(road => road.points.slice(1).some((end, index) => {
            const start = road.points[index], dx = end[0] - start[0], dy = end[1] - start[1];
            const progress = Math.max(0, Math.min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - start[0] - progress * dx, y - start[1] - progress * dy) < road.width / 2 + 2.5 + footprint;
          }))) continue;
          const height = .035 + random() * .025, angle = random() * Math.PI * 2;
          // Consume the original height and rotation samples before this new
          // exclusion, keeping every surviving accepted-preview tuft unchanged.
          if (fixtures.some(fixture => Math.hypot(x - fixture.x, y - fixture.y) < fixture.radius + footprint)) continue;
          placement.position.set(x, y, manifest.groundZ - .006);
          placement.rotation.set(0, 0, angle);
          placement.scale.set(width, width, height / nativeHeight);
          placement.updateMatrix();
          const cell = Math.floor(x / 24) + ',' + Math.floor(y / 24);
          if (!batches.has(cell)) batches.set(cell, []);
          batches.get(cell)!.push(placement.matrix.clone()); count++;
        }
      }
    }
  }
  if (count > 12000) throw Error('Mown turf instance budget exceeded');
  for (const [cell, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = 'Arroyo mown access turf ' + cell;
    matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, new THREE.Color(.28, .40, .15));
    });
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); scene.add(mesh);
  }
}
