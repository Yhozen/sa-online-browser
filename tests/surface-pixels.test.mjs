// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { deriveSurfacePixels } from "../apps/browser/src/surface-pixels.ts";

// Retain the Vector3 implementation as a compatibility oracle, with the
// intentional image-V correction. Full images catch wrap/byte-rounding changes;
// the independent geometric ramp test below determines the physical orientation.
function referenceSurfacePixels(source, size) {
  const normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const height = (x, y) => {
    const p = (((y + size) % size) * size + (x + size) % size) * 4;
    return (source[p] + source[p + 1] + source[p + 2]) / 765;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    const v = new Vector3((height(x - 1, y) - height(x + 1, y)) * 2,
      (height(x, y + 1) - height(x, y - 1)) * 2, 1).normalize();
    normal.set([(v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255,
      (v.z * .5 + .5) * 255, 255], p);
    const value = 185 + height(x, y) * 65;
    rough.set([value, value, value, 255], p);
  }
  return { normal, rough };
}

for (const size of [1, 2, 3, 17, 512, 1254]) {
  test("surface derivation is byte-identical to the corrected Vector3 reference at " + size + "²", () => {
    let seed = 9173;
    const source = new Uint8ClampedArray(size * size * 4);
    for (let p = 0; p < source.length; p++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      source[p] = seed >>> 24;
    }
    // Asymmetric dark/light edge texels expose seam and orientation regressions.
    source.set([0, 0, 0, 19], 0);
    if (size > 1) source.set([255, 255, 255, 0], source.length - 4);
    const original = source.slice();
    const expected = referenceSurfacePixels(source, size);
    const actual = deriveSurfacePixels(source, size);
    assert.deepEqual(actual.normal, expected.normal);
    assert.deepEqual(actual.rough, expected.rough);
    assert.deepEqual(source, original, "derivation must not alter albedo bytes");
  });
}

test("uniform surfaces retain neutral normals and exact roughness independently of alpha", () => {
  for (const value of [0, 1, 127, 128, 254, 255]) {
    const source = new Uint8Array(7 * 7 * 4).fill(value);
    for (let p = 3; p < source.length; p += 4) source[p] = p % 256;
    const { normal, rough } = deriveSurfacePixels(source, 7);
    for (let p = 0; p < source.length; p += 4) {
      assert.deepEqual([...normal.subarray(p, p + 4)], [127, 127, 255, 255]);
      const expected = Math.trunc(185 + value / 255 * 65);
      assert.deepEqual([...rough.subarray(p, p + 4)], [expected, expected, expected, 255]);
    }
  }
});

test("surface derivation rejects inconsistent image sizes", () => {
  for (const size of [0, -1, 2.5, NaN, Infinity])
    assert.throws(() => deriveSurfacePixels(new Uint8Array(4), size), /dimensions/);
  assert.throws(() => deriveSurfacePixels(new Uint8Array(15), 2), /dimensions/);
});

test("height ramps tilt normals away from rising U and flipped-image V", () => {
  // Canvas and derived DataTextures both use flipY=true. Increasing texture V
  // therefore walks toward smaller source-image row indices, unlike U/X.
  for (const [uSlope, vSlope] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) {
    const size = 5, source = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      source[p] = source[p + 1] = source[p + 2] = 110 + 20 * (uSlope * (x - 2) - vSlope * (y - 2));
      source[p + 3] = 255;
    }
    const { normal } = deriveSurfacePixels(source, size), center = (2 * size + 2) * 4;
    const actual = new Vector3(...normal.subarray(center, center + 3)).multiplyScalar(2 / 255).subScalar(1).normalize();
    // Independent geometry oracle: the cross product of the two rising surface
    // tangents faces away from each slope. Four is the established relief gain.
    const rise = 4 * 20 / 255;
    const expected = new Vector3(1, 0, uSlope * rise).cross(new Vector3(0, 1, vSlope * rise)).normalize();
    assert.ok(actual.dot(expected) > .99995,
      `normal must oppose height gradient (${uSlope}, ${vSlope}): ${actual.toArray()}`);
  }
});
