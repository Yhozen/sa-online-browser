// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type { SceneManifest } from '../../../packages/shared/scene';
import { surfaceMaterials } from './assets';

/** Mineral dirt follows the concrete slab joints with feathered edges. */
export function roadDetail(scene: THREE.Scene, manifest: SceneManifest) {
  // Give joint dirt its own seed, preserving the original neighborhood dirt
  // byte-for-byte after removing the old asphalt overlay's RNG consumption.
  let seed = 1301203775;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Accumulated mineral dirt fans out from slab joints instead of giving every
  // sidewalk a perfectly clean, equally sharp ruled line. It reuses the real
  // concrete grain and adds one small batch with transparent feathered edges.
  const dirtPositions: number[] = [], dirtUVs: number[] = [], dirtColors: number[] = [], dirtIndices: number[] = [];
  for (const road of manifest.roads) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], vertical = a[0] === b[0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 1.5; t < length; t += 1.5) for (const side of [-1, 1]) {
      const x = a[0] + (b[0] - a[0]) * t / length + (vertical ? side * (road.width / 2 + 1.25) : 0);
      const y = a[1] + (b[1] - a[1]) * t / length + (vertical ? 0 : side * (road.width / 2 + 1.25));
      const base = dirtPositions.length / 3, stain = .18 + random() * .16, width = .18 + random() * .20;
      for (const band of [-1, -.4, 0, .4, 1]) for (const end of [-1, 1]) {
        const across = end * 1.2, along = band * width * (end < 0 ? .78 : 1.15);
        const px = x + (vertical ? across : along), py = y + (vertical ? along : across);
        dirtPositions.push(px, py, manifest.groundZ + .013);
        dirtUVs.push(px / 4, py / 4);
        dirtColors.push(.42, .39, .31, Math.abs(band) === 1 ? 0 : stain * (1 - Math.abs(band) * .3));
      }
      for (let band = 0; band < 4; band++) {
        const k = base + band * 2;
        if (vertical) dirtIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        else dirtIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  const dirtGeometry = new THREE.BufferGeometry();
  dirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dirtPositions, 3));
  dirtGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(dirtUVs, 2));
  dirtGeometry.setAttribute('color', new THREE.Float32BufferAttribute(dirtColors, 4));
  dirtGeometry.setIndex(dirtIndices); dirtGeometry.computeVertexNormals();
  const dirtMaterial = surfaceMaterials.get('concrete')!.clone();
  dirtMaterial.vertexColors = true; dirtMaterial.transparent = true; dirtMaterial.depthWrite = false;
  const dirt = new THREE.Mesh(dirtGeometry, dirtMaterial);
  dirt.name = 'sidewalk-joint-weathering'; dirt.receiveShadow = true; scene.add(dirt);
}
