// SPDX-License-Identifier: GPL-3.0-or-later

/** Derive wrapped relief/roughness without per-pixel objects; normals use image-flipped V. */
export function deriveSurfacePixels(source: Uint8Array | Uint8ClampedArray, size: number) {
  if (!Number.isInteger(size) || size < 1 || source.length !== size * size * 4)
    throw Error("Invalid surface image dimensions.");
  const normal = new Uint8Array(source.length), rough = new Uint8Array(source.length);
  const rowBytes = size * 4;
  for (let y = 0; y < size; y++) {
    const row = y * rowBytes;
    const above = (y === 0 ? size - 1 : y - 1) * rowBytes;
    const below = (y + 1 === size ? 0 : y + 1) * rowBytes;
    for (let x = 0; x < size; x++) {
      const column = x * 4, p = row + column;
      const left = row + (x === 0 ? size - 1 : x - 1) * 4;
      const right = row + (x + 1 === size ? 0 : x + 1) * 4;
      const up = above + column, down = below + column;
      const dx = ((source[left] + source[left + 1] + source[left + 2]) / 765 -
        (source[right] + source[right + 1] + source[right + 2]) / 765) * 2;
      // flipY aligns the maps with the canvas: +V points toward the image
      // above. A raised +V neighbor must tilt the surface normal toward -V.
      const dy = ((source[down] + source[down + 1] + source[down + 2]) / 765 -
        (source[up] + source[up + 1] + source[up + 2]) / 765) * 2;
      // Match Vector3.normalize's arithmetic order exactly. Math.hypot or
      // Float32 intermediates can round a component across a byte boundary.
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      normal[p] = (dx * inverseLength * .5 + .5) * 255;
      normal[p + 1] = (dy * inverseLength * .5 + .5) * 255;
      normal[p + 2] = (inverseLength * .5 + .5) * 255;
      normal[p + 3] = 255;
      const value = 185 + (source[p] + source[p + 1] + source[p + 2]) / 765 * 65;
      rough[p] = value;
      rough[p + 1] = value;
      rough[p + 2] = value;
      rough[p + 3] = 255;
    }
  }
  return { normal, rough };
}
