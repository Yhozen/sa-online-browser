// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type { SceneManifest } from '../../../packages/shared/scene';
import { surfaceMaterials } from './assets';

/** Broad, feathered asphalt wear shares the street's world-space aggregate. */
export function roadDetail(scene: THREE.Scene, manifest: SceneManifest) {
  let seed = 71;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const onRoad = (x: number, y: number) => manifest.roads.some(road =>
    road.points.slice(1).some((b, i) => {
      const a = road.points[i];
      return x >= Math.min(a[0], b[0]) - road.width / 2 + .5 &&
        x <= Math.max(a[0], b[0]) + road.width / 2 - .5 &&
        y >= Math.min(a[1], b[1]) - road.width / 2 + .5 &&
        y <= Math.max(a[1], b[1]) + road.width / 2 - .5;
    })) || (!!manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0],
      y - manifest.culdesac.center[1]) < manifest.culdesac.radius - 1);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const footprints: { x: number; y: number; radius: number }[] = [];
  const sectors = 12;
  for (let i = 0; i < 1100; i++) {
    const x = random() * 145 - 50, y = random() * 150 - 78;
    if (!onRoad(x, y)) continue;
    const broad = i % 3 === 0;
    const width = broad ? 1.1 + random() * 1.8 : .24 + random() * .55;
    const depth = broad ? .7 + random() * 1.1 : .25 + random() * .7;
    const radius = Math.max(width, depth);
    if (footprints.some(p => Math.hypot(x - p.x, y - p.y) < radius + p.radius)) continue;
    const angle = random() * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
    const outline = Array.from({ length: sectors }, (_, j) => {
      const theta = j / sectors * Math.PI * 2, radius = .78 + random() * .22;
      const px = Math.cos(theta) * width * radius, py = Math.sin(theta) * depth * radius;
      return [px * ca - py * sa, px * sa + py * ca];
    });
    if (!outline.every(([dx, dy]) => onRoad(x + dx, y + dy))) continue;
    footprints.push({ x, y, radius });
    // Low-frequency faded binder and lightly warm aggregate, not dark crack decals.
    // The outer ring is exactly the base material; the texture phase never jumps.
    const faded = i % 2 === 0, amount = .18 + random() * .30;
    const tint = faded ? [1 + amount * .85, 1 + amount, 1 + amount * 1.08]
      : [1 - amount, 1 - amount * .92, 1 - amount * .8];
    const base = positions.length / 3;
    const vertex = (px: number, py: number, strength: number) => {
      positions.push(px, py, manifest.groundZ + .059);
      uvs.push(px / 4, py / 4);
      colors.push(...tint.map(value => 1 + (value - 1) * strength));
    };
    vertex(x, y, 1);
    for (const radius of [.58, 1]) for (const [dx, dy] of outline)
      vertex(x + dx * radius, y + dy * radius, radius === 1 ? 0 : .8);
    for (let j = 0; j < sectors; j++) {
      const next = (j + 1) % sectors;
      const a = base + 1 + j, b = base + 1 + next;
      const c = a + sectors, d = b + sectors;
      indices.push(base, a, b, a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = surfaceMaterials.get('asphalt')!.clone();
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'asphalt-wear';
  mesh.receiveShadow = true;
  scene.add(mesh);

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
