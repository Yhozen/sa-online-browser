// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';

const sculpt = JSON.parse(readFileSync('assets/horizon-relief.json', 'utf8'));
const stride = sculpt.segments + 1, vertices = stride * (sculpt.rings + 1);

test('exported terrain closes every angular row and retains hashed native provenance', () => {
  const provenance = JSON.parse(readFileSync('assets/source/horizon-build.json', 'utf8'));
  for (const [file, expected] of [
    [provenance.recipe, provenance.recipeSha256],
    [provenance.relief, provenance.reliefSha256],
    ['assets/source/horizon.blend', provenance.sourceSha256],
  ]) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), expected, file);
  assert.equal(sculpt.version, 3);
  assert.equal(sculpt.layers.length, 3);
  assert.equal(provenance.triangles, 172800);
  for (const layer of sculpt.layers) {
    for (const key of ['elevation', 'mineral', 'vegetation']) {
      assert.equal(layer[key].length, vertices);
      assert.ok(layer[key].every(Number.isFinite));
      for (let j = 0; j <= sculpt.rings; j++) {
        const first = j * stride, last = first + sculpt.segments;
        assert.equal(layer[key][first], layer[key][last], `${key}: open terrain seam on radial row ${j}`);
      }
    }
    for (const key of ['mineral', 'vegetation'])
      assert.ok(layer[key].every(x => Number.isInteger(x) && x >= 0 && x <= 255));
  }
});

test('actual runtime terrain uses authored heights with continuous seam normals and color', () => {
  // Execute the real builder with only its asset-loading boundary replaced.
  // No duplicated terrain formula can accidentally agree with a broken export.
  let source = stripTypeScriptTypes(readFileSync('apps/browser/src/horizon.ts', 'utf8'));
  source = source.replace(/^import .*;$/gm, '').replace('export function buildHorizon', 'function buildHorizon');
  const maps = new Map([
    ['grass', new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture() })],
    ['concrete', new THREE.MeshStandardMaterial({ map: new THREE.Texture() })],
  ]);
  let placements;
  const build = new Function('THREE', 'sculpt', 'surfaceMaterials', 'instantiateStatic', `${source}\nreturn buildHorizon;`)(
    THREE, sculpt, maps, (_scene, props) => { placements = props; });
  const scene = new THREE.Scene(), ground = 19;
  build(scene, ground);
  assert.equal(scene.children.length, 3);
  for (const [layer, mesh] of scene.children.entries()) {
    const geometry = mesh.geometry, p = geometry.attributes.position, n = geometry.attributes.normal;
    assert.equal(p.count, vertices);
    assert.equal(geometry.index.count / 3, 57600);
    for (let k = 0; k < p.count; k++) {
      assert.equal(p.getZ(k), Math.fround(ground + sculpt.layers[layer].elevation[k]));
      assert.ok(Math.hypot(p.getX(k), p.getY(k)) > 200, 'decorative terrain stays beyond the playable boundary');
      assert.ok(Math.abs(Math.hypot(n.getX(k), n.getY(k), n.getZ(k)) - 1) < 1e-5);
    }
    for (let j = 0; j <= sculpt.rings; j++) {
      const first = j * stride, last = first + sculpt.segments;
      for (const name of ['position', 'normal', 'color', 'terrainMix', 'uv']) {
        const attribute = geometry.attributes[name];
        for (let component = 0; component < attribute.itemSize; component++) {
          const a = attribute.array[first * attribute.itemSize + component];
          const b = attribute.array[last * attribute.itemSize + component];
          assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-5,
            `${name}: visible discontinuity at layer ${layer}, radial row ${j}`);
        }
      }
    }
  }
  assert.equal(placements.length, 218);
  assert.ok(placements.every(p => Math.max(Math.abs(p.position[0]), Math.abs(p.position[1])) > 90));
});
