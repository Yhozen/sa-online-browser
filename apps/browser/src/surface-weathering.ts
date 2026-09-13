// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import { groundCover } from './ground-cover.ts';

// The existing original image remains the fine albedo/normal/roughness source.
// Shared world-space vertex colors add connected metre-scale mineral wear,
// including the cul-de-sac and road intersections, in both graphics presets.
export function weatherSurface(geometry: THREE.BufferGeometry, originX: number, originY: number, kind: 'asphalt' | 'concrete') {
  const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + originX, y = positions.getY(i) + originY;
    const cover = groundCover(x * 2.4 + 34, y * 2.4 - 19) * .65 + groundCover(x * .82 - 72, y * .82 + 11) * .35;
    const weather = THREE.MathUtils.smoothstep(cover, .22, .76);
    const strength = kind === 'asphalt' ? .67 + weather * .58 : .88 + weather * .24;
    const warmth = kind === 'asphalt' ? (weather - .5) * .055 : (weather - .5) * .02;
    colors[i * 3] = strength * (1 - warmth * .3);
    colors[i * 3 + 1] = strength;
    colors[i * 3 + 2] = strength * (1 + warmth);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Concentric rings preserve the curved street footprint with enough real
// vertices for weathering. The center fan avoids zero-area duplicate-center
// triangles, and radial seams share positions and material coordinates.
export function weatheredDisk(radius: number) {
  const sectors = 128, rings = Math.ceil(radius / .75), positions = [0, 0, 0], indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) for (let sector = 0; sector < sectors; sector++) {
    const angle = sector / sectors * Math.PI * 2, r = radius * ring / rings;
    positions.push(Math.cos(angle) * r, Math.sin(angle) * r, 0);
  }
  for (let sector = 0; sector < sectors; sector++) indices.push(0, 1 + sector, 1 + (sector + 1) % sectors);
  for (let ring = 1; ring < rings; ring++) for (let sector = 0; sector < sectors; sector++) {
    const a = 1 + (ring - 1) * sectors + sector, b = 1 + (ring - 1) * sectors + (sector + 1) % sectors;
    const c = a + sectors, d = b + sectors;
    indices.push(a, c, d, a, d, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
