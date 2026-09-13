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

/** Connected low shrubs soften the fence edge while keeping doors and drives open. */
export function frontageGardenPlacements(manifest: SceneManifest): Placement[] {
  const result: Placement[] = [];
  const rows: Placement[][] = [];
  for (const [index, house] of manifest.houses.entries()) {
    const rowPlacements: Placement[] = []; rows.push(rowPlacements);
    const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
    const sx = house.scale?.[0] ?? 1, sy = house.scale?.[1] ?? 1;
    // Two loose drifts sit on the street side of the fence. The previous row
    // was inside the lot, where the fence concealed nearly all of its volume.
    for (let specimen = 0; specimen < 36; specimen++) {
      const row = Math.floor(specimen / 6), along = specimen % 6;
      let lx = row < 2 ? -9.6 + along * .79 + row * .26 : .15 + (along % 3) * 1.05;
      let ly = -(row < 2 ? 13.7 + row * 1.03 : 14.3 + Math.floor(along / 3) * 1.12)
        - .23 * Math.sin(index * 1.9 + specimen * 1.7);
      if (specimen >= 18) {
        const drift = Math.floor((specimen - 18) / 6), along = (specimen - 18) % 6;
        lx = drift === 0 ? -10.8 + along * .70 : drift === 1 ? -9.6 + along * .71 : .1 + (along % 3) * .6;
        ly = drift === 0 ? -16.3 : drift === 1 ? -18.1 : -16.5 - Math.floor(along / 3) * 1.08;
        ly += .18 * Math.sin(index * 1.9 + specimen * 1.7);
      }
      const x = house.position[0] + lx * sx * c - ly * sy * s;
      const y = house.position[1] + lx * sx * s + ly * sy * c;
      const scale = .89 + ((index * 3 + specimen) % 4) * .05;
      const spread = scale * 1.19;
      if (!yardPlantFits(manifest, x, y, .65 * spread)) continue;
      const placement: Placement = { asset: "garden-shrub", position: [x, y, manifest.groundZ + .01],
        rotation: house.rotation + specimen * 2.399,
        scale: [spread, spread, scale * (.93 + (specimen % 3) * .035)] };
      result.push(placement); rowPlacements.push(placement);
    }
  }
  if (!manifest.culdesac) return result;
  // The curved street reaches the generic outer rows of its three facing lots.
  // Place their shrubs in the remaining real garden strips inside the fence,
  // wrapping the front corner where the turning circle leaves no front strip.
  // Transfer specimens from the fullest other rows; total geometry stays fixed.
  const additions: Placement[] = [], recipients = new Set<number>();
  for (const [index, house] of manifest.houses.entries()) {
    if (rows[index].length || Math.hypot(house.position[0] - manifest.culdesac.center[0],
      house.position[1] - manifest.culdesac.center[1]) > manifest.culdesac.radius + 16) continue;
    recipients.add(index);
    const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
    const sx = house.scale?.[0] ?? 1, sy = house.scale?.[1] ?? 1;
    const candidates: [number, number][] = [];
    for (const ly of [-9.9, -8.95, -8.0]) for (let lx = -10.1; lx <= 10.2; lx += .88) candidates.push([lx, ly]);
    for (const lx of [-9.55, 9.55]) for (let ly = -7.05; ly <= -.5; ly += .95) candidates.push([lx, ly]);
    let accepted = 0;
    for (const [specimen, [lx, ly]] of candidates.entries()) {
      if (accepted >= 12 || additions.length >= 36) break;
      const x = house.position[0] + lx * sx * c - ly * sy * s;
      const y = house.position[1] + lx * sx * s + ly * sy * c;
      const spread = .96 + (specimen % 3) * .035;
      if (!yardPlantFits(manifest, x, y, .65 * spread)) continue;
      if ([...result, ...additions].some(p => Math.hypot(x - p.position[0], y - p.position[1]) < .82)) continue;
      additions.push({ asset: "garden-shrub", position: [x, y, manifest.groundZ + .01],
        rotation: house.rotation + specimen * 2.399,
        scale: [spread, spread, .91 + (specimen % 4) * .08] });
      accepted++;
    }
  }
  const removed = new Set<Placement>();
  for (const _ of additions) {
    const donors = rows.filter((row, i) => !recipients.has(i) && row.length > 3);
    donors.sort((a, b) => b.length - a.length);
    const donor = donors[0]?.pop();
    if (!donor) break;
    removed.add(donor);
  }
  return [...result.filter(p => !removed.has(p)), ...additions.slice(0, removed.size)];
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
