// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import type { SceneManifest } from "../../../packages/shared/scene";

/** Small curved grass clumps, with bare gaps and varied depth outside the sidewalks. */
export function plantVerges(scene: THREE.Scene, manifest: SceneManifest) {
  let seed = 918;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  const geometries = Array.from({ length: 3 }, (_, variant) => {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const count = 8 + variant * 2;
    for (let blade = 0; blade < count; blade++) {
      const angle = random() * Math.PI * 2, h = .055 + random() * (.105 + variant * .024);
      const width = .0015 + random() * .002, bend = .026 + random() * .07;
      const dx = Math.cos(angle), dy = Math.sin(angle), root = random() * .05;
      const start = positions.length / 3;
      const baseColor = new THREE.Color(blade % 4 === 0 ? 0x80774e : blade % 3 === 0 ? 0x565f3d : 0x647348);
      // Five ribbon segments give each blade an arch and taper; no giant triangular fans.
      for (let segment = 0; segment <= 5; segment++) {
        const t = segment / 5, lean = bend * t * t;
        const z = h * (1.18 * t - .18 * t * t), halfWidth = width * Math.pow(1 - t, .7);
        for (const side of [-1, 1]) {
          positions.push(dx * (root + lean) - dy * halfWidth * side,
            dy * (root + lean) + dx * halfWidth * side, z);
          const c = baseColor.clone().multiplyScalar(.65 + .35 * t);
          colors.push(c.r, c.g, c.b);
        }
        if (segment < 5) {
          const k = start + segment * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  });
  const matrices: THREE.Matrix4[][] = [[], [], []], dummy = new THREE.Object3D();
  function clearGround(x: number, y: number) {
    if (Math.abs(x) > manifest.halfSize - .5 || Math.abs(y) > manifest.halfSize - .5) return false;
    if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) < manifest.culdesac.radius + 2.55) return false;
    return !manifest.roads.some(road => road.points.slice(1).some((end, i) => {
      const start = road.points[i], margin = road.width / 2 + 2.5;
      return x >= Math.min(start[0], end[0]) - margin && x <= Math.max(start[0], end[0]) + margin &&
        y >= Math.min(start[1], end[1]) - margin && y <= Math.max(start[1], end[1]) + margin;
    }));
  }
  function tuft(x: number, y: number) {
    if (!clearGround(x, y)) return;
    dummy.position.set(x, y, manifest.groundZ - .006);
    dummy.rotation.set(0, 0, random() * Math.PI * 2);
    const s = .60 + random() * .73;
    dummy.scale.set(s * (.7 + random() * .6), s, Math.min(1.16, s * (.7 + random() * .4)));
    dummy.updateMatrix(); matrices[Math.floor(random() * 3)].push(dummy.matrix.clone());
  }
  for (const road of manifest.roads) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    for (const side of [-1, 1]) for (let t = random(); t < length; t += .9 + random() * 2.1) {
      if (random() < .30) continue; // Deliberate bare soil between separate plants.
      const depth = .15 + random() * .85, patchLength = .25 + random() * 1.2;
      const count = 4 + Math.floor(random() * 9);
      for (let n = 0; n < count; n++) {
        const along = t + (random() - .5) * patchLength;
        const offset = side * (road.width / 2 + 2.55 + depth * random());
        tuft(a[0] + dx * along - dy * offset, a[1] + dy * along + dx * offset);
      }
    }
  }
  if (manifest.culdesac) {
    const { center, radius } = manifest.culdesac;
    for (let angle = 0; angle < Math.PI * 2; angle += .075 + random() * .085) {
      if (random() < .35) continue;
      for (let n = 0; n < 5; n++) {
        const a = angle + (random() - .5) * .025, r = radius + 2.60 + random() * .65;
        tuft(center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r);
      }
    }
  }
  geometries.forEach((geometry, variant) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices[variant].length);
    mesh.name = `Arroyo grass clumps ${variant}`;
    matrices[variant].forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  });
}
