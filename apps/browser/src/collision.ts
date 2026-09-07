// SPDX-License-Identifier: GPL-3.0-or-later
import type { Barrier, SceneManifest } from "../../../packages/shared/scene";
export class CollisionIndex {
  private cells = new Map<string, Set<Barrier>>();
  constructor(
    readonly barriers: Barrier[],
    readonly cellSize = 12,
  ) {
    for (const b of barriers)
      for (
        let x = Math.floor((b.position[0] - b.size[0] / 2) / cellSize);
        x <= Math.floor((b.position[0] + b.size[0] / 2) / cellSize);
        x++
      )
        for (
          let y = Math.floor((b.position[1] - b.size[1] / 2) / cellSize);
          y <= Math.floor((b.position[1] + b.size[1] / 2) / cellSize);
          y++
        ) {
          const key = `${x},${y}`;
          if (!this.cells.has(key)) this.cells.set(key, new Set());
          this.cells.get(key)!.add(b);
        }
  }
  collides(x: number, y: number, radius: number, z?: number) {
    const checked = new Set<Barrier>();
    for (
      let cx = Math.floor((x - radius) / this.cellSize);
      cx <= Math.floor((x + radius) / this.cellSize);
      cx++
    )
      for (
        let cy = Math.floor((y - radius) / this.cellSize);
        cy <= Math.floor((y + radius) / this.cellSize);
        cy++
      )
        for (const b of this.cells.get(`${cx},${cy}`) || []) {
          if (checked.has(b)) continue;
          checked.add(b);
          if (
            z !== undefined &&
            (z > b.position[2] + b.size[2] / 2 + 0.2 ||
              z < b.position[2] - b.size[2] / 2 - 0.2)
          )
            continue;
          if (
            Math.abs(x - b.position[0]) < b.size[0] / 2 + radius &&
            Math.abs(y - b.position[1]) < b.size[1] / 2 + radius
          )
            return true;
        }
    return false;
  }
  // Swept camera sphere, sampled more finely than the smallest blocking fence.
  fraction(from: number[], to: number[], radius = 0.25) {
    const length = Math.hypot(...to.map((v, i) => v - from[i]));
    const steps = Math.max(1, Math.ceil(length / 0.08));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (
        this.collides(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
          radius,
          from[2] + (to[2] - from[2]) * t,
        )
      )
        return Math.max(0, (i - 1) / steps);
    }
    return 1;
  }
}

import type { Vec3 } from "../../../packages/shared/protocol";

export function findSafeExitPosition(
  origin: Vec3,
  angle: number,
  seat: number,
  arena: SceneManifest,
  index: CollisionIndex,
): Vec3 {
  const side = seat === 0 ? -1 : 1;
  // Try the requested door, the opposite door, then the rear/front of the car.
  const offsets = [
    [side * 2, 0],
    [-side * 2, 0],
    [0, -3],
    [0, 3],
  ];
  for (const radius of [3, 4, 6]) {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      offsets.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  }
  for (const [x, y] of offsets) {
    const position: Vec3 = [
      origin[0] + x * Math.cos(angle) - y * Math.sin(angle),
      origin[1] + x * Math.sin(angle) + y * Math.cos(angle),
      arena.groundZ + 1,
    ];
    if (
      Math.abs(position[0]) < arena.halfSize &&
      Math.abs(position[1]) < arena.halfSize &&
      !index.collides(position[0], position[1], 0.45)
    )
      return position;
  }
  // The fixed fixture always has clear spawns, including after a server vehicle correction.
  return [
    ...arena.spawns.find((p) => !index.collides(p[0], p[1], 0.45))!,
  ] as Vec3;
}
