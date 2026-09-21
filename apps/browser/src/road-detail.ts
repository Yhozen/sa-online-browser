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
  addSurfaceWear(scene, manifest);
}

/** Sparse connected fissures and edge deposits, independent of aggregate scale. */
function addSurfaceWear(scene: THREE.Scene, manifest: SceneManifest) {
  type Point = [number, number];
  const roads = manifest.roads.flatMap(road => road.points.slice(1).map((b, i) => {
    const a = road.points[i], vertical = a[0] === b[0];
    return { a, b, vertical, width: road.width,
      minX: Math.min(a[0], b[0]) - road.width / 2,
      maxX: Math.max(a[0], b[0]) + road.width / 2,
      minY: Math.min(a[1], b[1]) - road.width / 2,
      maxY: Math.max(a[1], b[1]) + road.width / 2 };
  }));
  const circle = manifest.culdesac;
  const insideRoad = (p: Point, road: typeof roads[number], margin = 0) =>
    p[0] >= road.minX + margin && p[0] <= road.maxX - margin &&
    p[1] >= road.minY + margin && p[1] <= road.maxY - margin;
  const radius = (p: Point) => circle ? Math.hypot(p[0] - circle.center[0], p[1] - circle.center[1]) : Infinity;
  let seed = 61483;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function batch(name: string, kind: 'asphalt' | 'concrete') {
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    function ribbon(points: Point[], width: number, opacity: number, shade: number, allowed: (quad: Point[]) => number | undefined) {
      const rows = points.map((p, i) => {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return [-1, -.30, .30, 1].map(side => [p[0] - (b[1] - a[1]) / length * width * side / 2,
          p[1] + (b[0] - a[0]) / length * width * side / 2] as Point);
      });
      for (let i = 1; i < rows.length; i++) {
        const quad = [rows[i - 1][0], rows[i - 1][3], rows[i][0], rows[i][3]];
        const height = allowed(quad); if (height === undefined) continue;
        const base = positions.length / 3;
        for (const row of [rows[i - 1], rows[i]]) for (const [j, p] of row.entries()) {
          positions.push(...p, manifest.groundZ + height); uvs.push(p[0] / 4, p[1] / 4);
          colors.push(shade, shade * .96, shade * .88, j === 0 || j === 3 ? 0 : opacity);
        }
        for (let band = 0; band < 3; band++) indices.push(base + band, base + band + 4, base + band + 1,
          base + band + 1, base + band + 4, base + band + 5);
      }
    }
    function finish() {
      if (!indices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const material = surfaceMaterials.get(kind)!.clone();
      material.vertexColors = true; material.transparent = true; material.depthWrite = false;
      material.userData.surfaceAlbedoKind = kind;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name; mesh.receiveShadow = true; scene.add(mesh);
    }
    return { ribbon, finish };
  }
  const cracks = batch('asphalt-connected-fissures', 'asphalt');
  const roadHeight = (quad: Point[]) => {
    // A whole quad must fit one convex footprint. This clips crossings and the
    // turning circle without letting a triangle bridge an outside corner.
    if (roads.some(road => quad.every(p => insideRoad(p, road, .02)))) return .059;
    if (circle && quad.every(p => radius(p) < circle.radius - .02)) return .054;
    return undefined;
  };
  function fissure(x: number, y: number, angle: number, length: number) {
    const points: Point[] = [[x, y]], steps = Math.ceil(length / .42);
    for (let i = 0; i < steps; i++) {
      angle += (random() - .5) * .9;
      x += Math.cos(angle) * length / steps; y += Math.sin(angle) * length / steps;
      points.push([x, y]);
    }
    // Dark core 8–20mm; the faint, irregularly eroded shoulders are wider.
    const width = .028 + random() * .036;
    cracks.ribbon(points, width, .48 + random() * .16, .43, roadHeight);
    if (points.length > 5) {
      const p = points[Math.floor(points.length * .55)], turn = angle + (random() < .5 ? -1 : 1) * .8;
      cracks.ribbon([p, [p[0] + Math.cos(turn) * .35, p[1] + Math.sin(turn) * .35],
        [p[0] + Math.cos(turn + .2) * .70, p[1] + Math.sin(turn + .2) * .70]], width * .6, .42, .43, roadHeight);
    }
  }
  for (const road of roads) {
    const dx = road.b[0] - road.a[0], dy = road.b[1] - road.a[1], length = Math.hypot(dx, dy);
    for (let along = 3; along < length; along += 8 + random() * 5) {
      const across = (random() - .5) * (road.width - 1);
      fissure(road.a[0] + dx / length * along - dy / length * across,
        road.a[1] + dy / length * along + dx / length * across,
        Math.atan2(dy, dx) + .6 + random() * 1.8, 1.6 + random() * 2.4);
    }
  }
  if (circle) for (let i = 0; i < 13; i++) {
    const angle = i * 2.399, r = 3 + random() * (circle.radius - 5);
    fissure(circle.center[0] + Math.cos(angle) * r, circle.center[1] + Math.sin(angle) * r,
      angle + random(), 1.8 + random() * 2.2);
  }
  cracks.finish();

  const deposits = batch('curb-and-circle-weathering', 'concrete');
  if (circle) {
    const circularSidewalk = (quad: Point[]) => {
      if (quad.some(p => radius(p) > circle.radius + 2.48 || radius(p) < circle.radius + .035 ||
        roads.some(road => insideRoad(p, road, -.08)))) return undefined;
      return .029;
    };
    // Radial joints sit above the circular concrete, unlike the old straight
    // joint layer below it. Short rim deposits leave most of the curb clean.
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const radial = (r: number, a = angle): Point => [circle.center[0] + Math.cos(a) * r, circle.center[1] + Math.sin(a) * r];
      deposits.ribbon([radial(circle.radius + .10), radial(circle.radius + 1.25), radial(circle.radius + 2.42)],
        .055 + random() * .06, .19 + random() * .13, .56, circularSidewalk);
      if (i % 3 !== 0) deposits.ribbon([radial(circle.radius + .12), radial(circle.radius + .13, angle + .022),
        radial(circle.radius + .11, angle + .055)], .10 + random() * .09, .22, .57, circularSidewalk);
    }
  }
  for (const road of roads) {
    const dx = road.b[0] - road.a[0], dy = road.b[1] - road.a[1], length = Math.hypot(dx, dy);
    for (let along = 1; along < length; along += 4.5 + random() * 3) for (const side of [-1, 1]) {
      const x = road.a[0] + dx / length * along - dy / length * side * (road.width / 2 + .35);
      const y = road.a[1] + dy / length * along + dx / length * side * (road.width / 2 + .35);
      const points: Point[] = [[x, y], [x + dx / length * .42, y + dy / length * .42],
        [x + dx / length * (.8 + random() * .8), y + dy / length * (.8 + random() * .8)]];
      deposits.ribbon(points, .09 + random() * .12, .22 + random() * .14, .58, quad => {
        if (quad.some(p => radius(p) < (circle?.radius ?? 0) + 2.55 ||
          roads.some(other => insideRoad(p, other, -.19)))) return undefined;
        return .014;
      });
    }
  }
  deposits.finish();
}
