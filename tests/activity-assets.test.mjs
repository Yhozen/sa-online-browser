// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const assets = [
  ["activity-board", [2.8, .52, 2.6395]],
  ["activity-pylon", [.66, .66, 1.065]],
  ["activity-bench", [2.06, .755647, .924275]],
  ["activity-planter", [1.381354, 1.344052, 1.575012]],
  ["activity-yucca", [.876769, .903443, .649674]],
];

async function load(name) {
  const bytes = readFileSync(new URL(`../apps/browser/public/assets/${name}.glb`, import.meta.url));
  const loader = new GLTFLoader();
  // Node has no browser image decoder. Geometry tests preserve texture/material
  // identity with a placeholder; the embedded PNG itself is validated below and
  // the actual image is exercised by the live Chromium capture.
  loader.register(() => ({
    name: "activity-test-texture-loader",
    loadTexture() { return Promise.resolve(new THREE.Texture({ width: 1024, height: 512 })); },
  }));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "",
  );
  const normalized = new THREE.Group();
  gltf.scene.rotation.x = Math.PI / 2;
  normalized.add(gltf.scene);
  normalized.updateMatrixWorld(true);
  return normalized;
}

test("activity assets preserve meter-scale collision envelopes and ground contact", async () => {
  for (const [name, expected] of assets) {
    const scene = await load(name);
    const bounds = new THREE.Box3().setFromObject(scene, true);
    const size = bounds.getSize(new THREE.Vector3());
    for (const [i, value] of size.toArray().entries()) {
      assert.ok(Math.abs(value - expected[i]) < .003, `${name} axis ${i}: ${value} vs ${expected[i]}`);
    }
    assert.ok(Math.abs(bounds.min.z) < .001, `${name} must meet ground at its origin, got ${bounds.min.z}`);
  }
});

test("activity GLBs have finite geometry, normals, UVs and neutral uncorrupted baked colors", async () => {
  for (const [name] of assets) {
    const scene = await load(name);
    let primitives = 0;
    scene.traverse((mesh) => {
      if (!(mesh instanceof THREE.Mesh)) return;
      primitives++;
      const geometry = mesh.geometry;
      const positions = geometry.getAttribute("position");
      for (const key of ["position", "normal", "uv", "color"]) {
        const attribute = geometry.getAttribute(key);
        assert.ok(attribute, `${name}/${mesh.name} missing ${key}`);
        assert.equal(attribute.count, positions.count, `${name}/${mesh.name} ${key} count`);
        for (let i = 0; i < attribute.count; i++) {
          const values = [attribute.getX(i), attribute.getY(i)];
          if (attribute.itemSize >= 3) values.push(attribute.getZ(i));
          assert.ok(values.every(Number.isFinite), `${name}/${mesh.name} ${key} has nonfinite data`);
          if (key === "color") {
            // A stale Blender UV RNA handle previously wrote signed world UVs
            // into COLOR_0, giving green/magenta faces. Check actual exported data.
            assert.ok(values.every((value) => value >= .68 && value <= 1.001), `${name}/${mesh.name} color ${values}`);
            assert.ok(Math.max(...values) - Math.min(...values) < .035, `${name}/${mesh.name} unexpected baked color tint`);
          }
          if (key === "normal") {
            assert.ok(Math.abs(Math.hypot(...values) - 1) < .003, `${name}/${mesh.name} nonunit normal`);
          }
        }
      }
    });
    assert.ok(primitives > 0 && primitives <= 8, `${name} should share its material geometry, got ${primitives} primitives`);
  }
});

test("activity planter is hollow concrete with recessed soil and solid succulent leaves", async () => {
  const scene = await load("activity-planter");
  const concrete = [];
  const leafMaterials = new Set();
  scene.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => material.name === "concrete")) concrete.push(mesh);
    for (const material of materials) if (material.name.startsWith("activity-agave")) leafMaterials.add(material.name);
  });
  assert.deepEqual([...leafMaterials].sort(), ["activity-agave", "activity-agave-edge"]);
  const center = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1)).intersectObjects(concrete);
  const rim = new THREE.Raycaster(new THREE.Vector3(.615, 0, 2), new THREE.Vector3(0, 0, -1)).intersectObjects(concrete);
  assert.ok(center.length && center[0].point.z < .17, "planter center must expose the hollow, not a concrete lid");
  assert.ok(rim.length && rim[0].point.z > .66, "raised rounded rim must surround the opening");
});

test("field yucca keeps its solid-leaf silhouette in a small shared-material export", async () => {
  const bytes = readFileSync(new URL("../apps/browser/public/assets/activity-yucca.glb", import.meta.url));
  assert.ok(bytes.byteLength < 600_000, "field plant must remain below its standalone download budget");
  const scene = await load("activity-yucca");
  let triangles = 0;
  const materials = new Set();
  scene.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      assert.ok(Math.hypot(point.x, point.y) < .49, "arbitrary planted rotation must remain within the full-envelope collider");
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      materials.add(material.name);
      assert.equal(material.transparent, false, "solid rosette should not depend on transparency sorting");
      assert.equal(material.map, null, "field plant should reuse existing material definitions without an additional texture");
    }
  });
  assert.ok(triangles >= 7_000 && triangles < 10_000, `expected detailed solid leaves below the asset budget, got ${triangles}`);
  assert.deepEqual([...materials].sort(), ["activity-agave", "activity-agave-edge", "wood"]);
  // Separate upper green blades and low woody litter/crown prevent an exported
  // stump alone, empty alpha card or accidentally missing heart from passing.
  const green = [];
  scene.traverse((mesh) => {
    if (mesh instanceof THREE.Mesh && mesh.material.name === "activity-agave") green.push(mesh);
  });
  const heart = new THREE.Raycaster(new THREE.Vector3(.09, 0, .8), new THREE.Vector3(0, 0, -1)).intersectObjects(green);
  assert.ok(heart.length && heart[0].point.z > .30, "upright center leaves must form a real rosette heart");
});

test("club sign bakes original readable lettering into one UV-mapped enamel face", async () => {
  const bytes = readFileSync(new URL("../apps/browser/public/assets/activity-board.glb", import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const face = gltf.materials.find(material => material.name === "activity-sign-face");
  const texture = gltf.textures[face.pbrMetallicRoughness.baseColorTexture.index];
  const image = gltf.images[texture.source];
  assert.equal(image.mimeType, "image/png");
  assert.ok(image.bufferView !== undefined, "face texture must be embedded in checksummed GLB");
  const view = gltf.bufferViews[image.bufferView];
  const start = 28 + jsonLength + (view.byteOffset ?? 0);
  const embedded = bytes.subarray(start, start + view.byteLength);
  const input = readFileSync(new URL("../assets/textures/arroyo-club-sign.png", import.meta.url));
  assert.deepEqual(embedded, input, "runtime embeds the exact committed original paint input");
  assert.equal(input.readUInt32BE(16), 1024);
  assert.equal(input.readUInt32BE(20), 512);
  const vector = readFileSync(new URL("../assets/source/activity-sign.svg", import.meta.url), "utf8");
  assert.ok(vector.includes('aria-label="ARROYO"') && vector.includes('aria-label="TIME TRIAL"'));
  assert.ok(!vector.includes("<text"), "original glyph polygons must not depend on an external font");
  const scene = await load("activity-board");
  // Ray through the left leg of the first A, away from hardware/frame outlines.
  const ray = new THREE.Raycaster(new THREE.Vector3(-.744, -1, 1.975), new THREE.Vector3(0, 1, 0));
  const hits = ray.intersectObject(scene, true);
  assert.equal(hits[0].object.material.name, "activity-sign-face", "no floating glyph geometry may remain above the face");
  assert.ok(hits[0].uv.x > 0 && hits[0].uv.x < 1 && hits[0].uv.y > 0 && hits[0].uv.y < 1);
});
