// SPDX-License-Identifier: GPL-3.0-or-later
import type { Placement, SceneManifest } from "../../../packages/shared/scene";

/** Add original succulent/shrub specimens inside the existing masonry beds.
 * These are decorative plantings, below knee height, outside every access path.
 */
export function gardenPlacements(manifest: SceneManifest): Placement[] {
  return manifest.houses.flatMap((house, index) => {
    const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
    const sx = house.scale?.[0] ?? 1, sy = house.scale?.[1] ?? 1;
    return [-7.05, .95, 2.50].map((x, specimen) => ({
      asset: "garden-low",
      position: [house.position[0] + x * sx * c + 6.72 * sy * s,
        house.position[1] + x * sx * s - 6.72 * sy * c,
        house.position[2] + .05],
      rotation: house.rotation + ((index + specimen) % 2 ? .10 : -.10),
      scale: [sx, sy, house.scale?.[2] ?? 1],
    }));
  });
}

/** Low drought planting gathers around existing trees and utility poles. */
export function vergeGardenPlacements(manifest: SceneManifest): Placement[] {
  const result: Placement[] = [];
  for (const [index, prop] of manifest.props.entries()) {
    if (!["palm", "pole"].includes(prop.asset)) continue;
    for (let specimen = 0; specimen < 3; specimen++) {
      const angle = index * 2.399 + specimen * 2.12;
      const distance = 1.1 + specimen * .38;
      const x = prop.position[0] + Math.cos(angle) * distance;
      const y = prop.position[1] + Math.sin(angle) * distance;
      const scale = .86 + (index + specimen) % 3 * .08;
      // The actual Blender specimen has a 0.607m horizontal radius.
      if (!yardPlantFits(manifest, x, y, .65 * scale)) continue;
      result.push({ asset: "garden-low", position: [x, y, manifest.groundZ + .01],
        rotation: angle, scale: [scale, scale, scale] });
    }
  }
  return result;
}

/** Keep the entire decorative plant footprint outside paths and solid fixtures. */
function yardPlantFits(manifest: SceneManifest, x: number, y: number, radius: number) {
  if (Math.abs(x) + radius >= manifest.halfSize || Math.abs(y) + radius >= manifest.halfSize) return false;
  if (manifest.barriers.some(b => Math.abs(x - b.position[0]) < b.size[0] / 2 + radius &&
    Math.abs(y - b.position[1]) < b.size[1] / 2 + radius)) return false;
  // Utility poles have a 0.16m modeled base but no gameplay barrier. A plant
  // chosen around a neighboring palm must still remain outside that trunk.
  if (manifest.props.some(prop => prop.asset === "pole" &&
    Math.hypot(x - prop.position[0], y - prop.position[1]) < radius +
      .16 * Math.max(prop.scale?.[0] ?? 1, prop.scale?.[1] ?? 1))) return false;
  if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) <
    manifest.culdesac.radius + 2.5 + radius) return false;
  if (manifest.roads.some(road => road.points.slice(1).some((end, i) => {
    const start = road.points[i], margin = road.width / 2 + 2.5 + radius;
    return x >= Math.min(start[0], end[0]) - margin && x <= Math.max(start[0], end[0]) + margin &&
      y >= Math.min(start[1], end[1]) - margin && y <= Math.max(start[1], end[1]) + margin;
  }))) return false;
  return !manifest.houses.some(h => {
    const c = Math.cos(h.rotation), s = Math.sin(h.rotation), sx = h.scale?.[0] ?? 1, sy = h.scale?.[1] ?? 1;
    const dx = x - h.position[0], dy = y - h.position[1];
    const lx = (dx * c + dy * s) / sx, ly = (-dx * s + dy * c) / sy;
    const rx = radius / sx, ry = radius / sy;
    return (Math.abs(lx) < 8.55 + rx && Math.abs(ly) < 6.6 + ry) ||
      (lx > -6.35 - rx && lx < .35 + rx && ly > -8.45 - ry && ly < -5.55 + ry) ||
      (lx > 4 - rx && lx < 8 + rx && ly > -20.7 - ry && ly < -6 + ry) ||
      (lx > -4.4 - rx && lx < -1.6 + rx && ly > -20.7 - ry && ly < -8.5 + ry);
  });
}
