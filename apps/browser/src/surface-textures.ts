// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";

/** Derive aligned surface relief and roughness from the accepted original albedo inputs. */
export function surfaceTexture(bitmap: ImageBitmap, quadrant: number, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, (quadrant % 2) * bitmap.width / 2, Math.floor(quadrant / 2) * bitmap.height / 2, bitmap.width / 2, bitmap.height / 2, 0, 0, size, size);
  const albedo = new THREE.CanvasTexture(canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  const source = context.getImageData(0, 0, size, size).data;
  const normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const height = (x: number, y: number) => {
    const p = (((y + size) % size) * size + (x + size) % size) * 4;
    return (source[p] + source[p + 1] + source[p + 2]) / 765;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    const v = new THREE.Vector3((height(x - 1, y) - height(x + 1, y)) * 2, (height(x, y - 1) - height(x, y + 1)) * 2, 1).normalize();
    normal.set([(v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255, (v.z * .5 + .5) * 255, 255], p);
    const value = 185 + height(x, y) * 65;
    rough.set([value, value, value, 255], p);
  }
  const normalMap = new THREE.DataTexture(normal, size, size), roughnessMap = new THREE.DataTexture(rough, size, size);
  for (const t of [albedo, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
  }
  // Canvas textures and DataTextures must agree on the vertical UV convention.
  normalMap.flipY = roughnessMap.flipY = true;
  return { map: albedo, normalMap, roughnessMap };
}
