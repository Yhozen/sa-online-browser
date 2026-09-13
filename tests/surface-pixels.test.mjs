// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import * as THREE from "three";
import { Vector3 } from "three";
import { deriveSurfacePixels } from "../apps/browser/src/surface-pixels.ts";
import { weatherSurface, weatheredDisk } from "../apps/browser/src/surface-weathering.ts";
import { applyQuality } from "../apps/browser/src/graphics.ts";

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

function weatheredEnvironment() {
  const manifest = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  const maps = new Map(['asphalt', 'concrete', 'grass'].map(name => [name,
    new THREE.MeshStandardMaterial({ name: name === 'concrete' ? '' : name,
      color: 0xb0ada1, roughness: .9, map: new THREE.Texture(),
      normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() })]));
  // Exercise the real environment builder, replacing only unrelated asset/DOM
  // boundaries. Concrete is unnamed in createMaterials; matching by name hides bugs.
  const source = stripTypeScriptTypes(readFileSync('apps/browser/src/environment.ts', 'utf8'))
    .replace(/^import .*;$/gm, '').replace('export function buildEnvironment', 'function buildEnvironment');
  const noop = () => {}, empty = () => [];
  const document = { createElement() { return { getContext() { return { fillRect() {}, fillText() {} }; } }; } };
  const build = new Function('THREE', 'surfaceMaterials', 'assetStats', 'instantiateStatic', 'plantVerges',
    'buildHorizon', 'gardenPlacements', 'vergeGardenPlacements', 'frontageGardenPlacements',
    'roadDetail', 'document', 'weatherSurface', 'weatheredDisk', source + ';return buildEnvironment;')(
    THREE, maps, { textureBytes: 0 }, noop, noop, noop, empty, empty, empty, noop, document, weatherSurface, weatheredDisk);
  const scene = new THREE.Scene(); build(scene, manifest); scene.updateMatrixWorld(true);
  return { scene, maps, manifest, surfaces: scene.children.filter(m => m.isMesh && m.material.userData.surfaceAlbedoKind) };
}

test('actual road and cul-de-sac weather geometry stays continuous, finite and upward-facing', () => {
  const { surfaces, manifest } = weatheredEnvironment();
  assert.equal(surfaces.length, 10);
  let triangles = 0, vertices = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of surfaces) {
    const { position, normal, uv, color } = mesh.geometry.attributes, index = mesh.geometry.index;
    assert.equal(color.itemSize, 3); assert.equal(color.count, position.count);
    vertices += position.count; triangles += index.count / 3;
    for (let i = 0; i < position.count; i++) {
      assert.equal(position.getZ(i), 0);
      assert.ok(normal.getZ(i) > .99999);
      assert.ok(Math.abs(uv.getX(i) - (position.getX(i) + mesh.position.x) / 4) < 2e-6);
      assert.ok(Math.abs(uv.getY(i) - (position.getY(i) + mesh.position.y) / 4) < 2e-6);
      for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(color.getComponent(i, k)));
    }
    const g = Array.from(color.array).filter((_, i) => i % 3 === 1).sort((x, y) => x - y);
    assert.ok(g[Math.floor(g.length * .9)] - g[Math.floor(g.length * .1)] > .1, 'connected metre-scale pigment variation remains present');
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
      const cross = b.sub(a).cross(c.sub(a));
      assert.ok(cross.z > 1e-8, 'real triangle area must remain positive, including the disk center');
    }
  }
  assert.equal(vertices, 24944); assert.equal(triangles, 47532);
  for (const radius of [manifest.culdesac.radius, manifest.culdesac.radius + 2.5]) {
    const disk = weatheredDisk(radius), p = disk.attributes.position;
    const edges = new Map();
    for (let i = 0; i < disk.index.count; i += 3) for (let side = 0; side < 3; side++) {
      const edge = [disk.index.getX(i + side), disk.index.getX(i + (side + 1) % 3)].sort((x, y) => x - y).join(',');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    const boundary = [...edges].filter(([, count]) => count === 1);
    assert.equal(boundary.length, 128); assert.ok([...edges.values()].every(count => count === 1 || count === 2));
    for (const [edge] of boundary) for (const i of edge.split(',').map(Number))
      assert.ok(Math.abs(Math.hypot(p.getX(i), p.getY(i)) - radius) < 2e-6, 'only the real circular perimeter may be open');
  }
  const left = new THREE.BufferGeometry(), right = new THREE.BufferGeometry();
  left.setAttribute('position', new THREE.Float32BufferAttribute([12, -7, 0], 3));
  right.setAttribute('position', new THREE.Float32BufferAttribute([-3, 2, 0], 3));
  for (const kind of ['asphalt', 'concrete']) {
    weatherSurface(left, 0, 0, kind); weatherSurface(right, 15, -9, kind);
    assert.deepEqual(left.attributes.color.array, right.attributes.color.array, 'overlapping surfaces must sample the same world pigment');
  }
});

test('weathered material isolation preserves pigment, curb appearance and shared maps through quality roundtrips', () => {
  const { scene, maps, surfaces } = weatheredEnvironment();
  assert.equal(new Set(surfaces.map(m => m.material)).size, 2);
  assert.equal(maps.get('concrete').name, '');
  assert.equal(maps.get('concrete').vertexColors, false);
  const curb = scene.children.find(m => m.isInstancedMesh && m.material === maps.get('concrete'));
  assert.ok(curb);
  const linear = (mesh, i = 0) => mesh.material.color.toArray().map((x, k) =>
    x * (mesh.material.vertexColors && mesh.geometry.attributes.color ? mesh.geometry.attributes.color.getComponent(i, k) : 1));
  const hash = attribute => createHash('sha256').update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)).digest('hex');
  const original = surfaces.map(mesh => ({ mesh, material: mesh.material, color: mesh.material.color.toArray(),
    colorHash: hash(mesh.geometry.attributes.color), map: mesh.material.map, normalMap: mesh.material.normalMap,
    roughnessMap: mesh.material.roughnessMap, roughness: mesh.material.roughness }));
  const curbMaterial = curb.material, curbBefore = linear(curb);
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  applyQuality(reference, true);
  const oldHorizontalFactor = linear(reference);
  const converted = new Map();
  const baked = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x887744, vertexColors: true }));
  baked.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(.7), 3));
  const bakedMaterial = baked.material; scene.add(baked);
  for (let cycle = 0; cycle < 3; cycle++) {
    applyQuality(scene, true);
    assert.equal(baked.material, bakedMaterial, 'already baked Basic terrain stays unchanged');
    for (const s of original) {
      assert.ok(s.mesh.material.isMeshBasicMaterial); assert.equal(s.mesh.material.map, s.map);
      assert.equal(hash(s.mesh.geometry.attributes.color), s.colorHash);
      if (converted.has(s.material)) assert.equal(s.mesh.material, converted.get(s.material));
      else converted.set(s.material, s.mesh.material);
      const colors = s.mesh.geometry.attributes.color;
      for (let i = 0; i < colors.count; i++) for (let k = 0; k < 3; k++)
        assert.ok(Math.abs(linear(s.mesh, i)[k] - s.color[k] * colors.getComponent(i, k) * oldHorizontalFactor[k]) < 2e-8);
    }
    applyQuality(scene, false);
    assert.equal(curb.material, curbMaterial); assert.equal(curb.material.vertexColors, false); assert.deepEqual(linear(curb), curbBefore);
    assert.equal(baked.material, bakedMaterial);
    for (const s of original) {
      assert.equal(s.mesh.material, s.material); assert.deepEqual(s.mesh.material.color.toArray(), s.color);
      assert.equal(hash(s.mesh.geometry.attributes.color), s.colorHash);
      assert.equal(s.mesh.material.map, s.map); assert.equal(s.mesh.material.normalMap, s.normalMap);
      assert.equal(s.mesh.material.roughnessMap, s.roughnessMap); assert.equal(s.mesh.material.roughness, s.roughness);
    }
  }
});

test('removing asphalt overlay preserves the original neighborhood sidewalk dirt byte-for-byte', () => {
  const manifest = JSON.parse(readFileSync('packages/shared/scenes/neighborhood.json', 'utf8'));
  const source = stripTypeScriptTypes(readFileSync('apps/browser/src/road-detail.ts', 'utf8'))
    .replace(/^import .*;$/gm, '').replace('export function roadDetail', 'function roadDetail');
  const maps = new Map(['asphalt', 'concrete'].map(name => [name, new THREE.MeshStandardMaterial()]));
  const detail = new Function('THREE', 'surfaceMaterials', source + ';return roadDetail;')(THREE, maps);
  const scene = new THREE.Scene(); detail(scene, manifest);
  assert.equal(scene.children.length, 1); assert.equal(scene.getObjectByName('asphalt-wear'), undefined);
  const mesh = scene.getObjectByName('sidewalk-joint-weathering');
  assert.ok(mesh); assert.equal(mesh.geometry.index.count / 3, 2960);
  // Hashes of the actual original neighborhood joint arrays, before splitting
  // the RNG stream. Keep those authored patterns when replacing asphalt wear.
  const original = {
    position: 'ae337c9920d1d7987fedda46ae5157db57a213e244a1f7cca986caaf3dfbe2ac',
    uv: '4b8ab059c53336755ab2aa6588ff1c33dc922fb082ffdabe6fcd7d6618f09839',
    color: '5a2b90b68e621c13dd20d8816058e63d41f50f81bd697027fb80041053ff57dd',
    normal: '50881360c5a2a5cd612307cdea11716a449001e09532c0c95e7d346102e013f4',
    index: 'd044176bfe3b36cd2ddc54ee50e5f1f3c3e2892a3c0304873dc6d2fffc853a68',
  };
  for (const [name, digest] of Object.entries(original)) {
    const values = (name === 'index' ? mesh.geometry.index : mesh.geometry.attributes[name]).array;
    assert.equal(createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex'), digest);
  }
});
