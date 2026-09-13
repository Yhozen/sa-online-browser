// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { deriveSurfacePixels } from "../apps/browser/src/surface-pixels.ts";

// Retain the original implementation as a compatibility oracle. Comparing
// complete images catches wrapped seams, Y orientation and byte-rounding changes.
function originalSurfacePixels(source, size) {
  const normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const height = (x, y) => {
    const p = (((y + size) % size) * size + (x + size) % size) * 4;
    return (source[p] + source[p + 1] + source[p + 2]) / 765;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    const v = new Vector3((height(x - 1, y) - height(x + 1, y)) * 2,
      (height(x, y - 1) - height(x, y + 1)) * 2, 1).normalize();
    normal.set([(v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255,
      (v.z * .5 + .5) * 255, 255], p);
    const value = 185 + height(x, y) * 65;
    rough.set([value, value, value, 255], p);
  }
  return { normal, rough };
}

for (const size of [1, 2, 3, 17, 512, 1254]) {
  test("surface derivation is byte-identical to original Vector3 algorithm at " + size + "²", () => {
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
    const expected = originalSurfacePixels(source, size);
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
