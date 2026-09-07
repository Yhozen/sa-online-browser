// SPDX-License-Identifier: GPL-3.0-or-later
import type { Vec3 } from "./protocol";
export interface Placement {
  asset: string;
  position: Vec3;
  rotation: number;
  scale?: Vec3;
  id?: string;
}
export interface Barrier {
  id?: string;
  position: Vec3;
  size: Vec3;
}
export interface SceneManifest {
  assets?: {
    version: number;
    files: Record<string, { bytes: number; sha256: string }>;
  };
  id: "yard" | "neighborhood";
  name: string;
  revision: string;
  groundZ: number;
  halfSize: number;
  spawns: Vec3[];
  teleport: Vec3;
  vehicle: { model: number; position: Vec3; heading: number };
  barriers: Barrier[];
  houses: Placement[];
  props: Placement[];
  roads: { points: [number, number][]; width: number }[];
  culdesac?: { center: [number, number]; radius: number };
  route: [number, number][];
}
