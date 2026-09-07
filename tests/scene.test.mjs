// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { WebSocket } from "ws";
import { loadScene } from "../packages/shared/scene.mjs";
import { createGateway } from "../services/gateway/server.mjs";
import {
  CollisionIndex,
  findSafeExitPosition,
} from "../apps/browser/src/collision.ts";
test("manifest geometry, clear spawn/exit areas and bounded camera obstruction", () => {
  const n = loadScene();
  assert.equal(n.houses.length, 10);
  assert.equal(new Set(n.houses.map((p) => p.asset)).size, 4);
  assert.equal(n.halfSize, 90);
  const index = new CollisionIndex(n.barriers);
  for (const spawn of n.spawns)
    assert.equal(index.collides(spawn[0], spawn[1], 0.45), false);
  for (const b of n.barriers) {
    assert.equal(index.collides(b.position[0], b.position[1], 0.1), true);
  }
  assert.equal(index.collides(0, 6, 2), false);
  assert.equal(index.fraction([-4, 0, 11], [-4, -7, 13]), 1);
  assert.ok(index.fraction([-15, -18, 11], [-30, -18, 11]) < 1);
  assert.equal(index.fraction([-15, -18, 30], [-30, -18, 30]), 1);
});
test("grid collision matches exhaustive reference on deterministic neighborhood samples", () => {
  const scene = loadScene(),
    grid = new CollisionIndex(scene.barriers);
  for (let x = -93; x < 93; x += 1.3)
    for (let y = -93; y < 93; y += 1.7)
      for (const r of [0.36, 2]) {
        const expected = scene.barriers.some(
          (b) =>
            Math.abs(x - b.position[0]) < b.size[0] / 2 + r &&
            Math.abs(y - b.position[1]) < b.size[1] / 2 + r,
        );
        assert.equal(grid.collides(x, y, r), expected);
      }
});
test("scene metadata and join mismatch reject before any native worker starts", async () => {
  const gateway = createGateway({ port: 0, sceneId: "neighborhood" }),
    address = await gateway.start();
  let ws;
  try {
    const scene = await (
      await fetch(`http://127.0.0.1:${address.port}/scene`)
    ).json();
    assert.deepEqual(scene, loadScene());
    ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const events = [];
    ws.on("message", (data) => events.push(JSON.parse(data)));
    await once(ws, "open");
    const closed = once(ws, "close");
    ws.send(
      JSON.stringify({
        type: "join",
        version: 1,
        name: "Mismatch",
        scene: { id: "yard", revision: scene.revision },
      }),
    );
    await closed;
    assert.match(
      events.find((e) => e.type === "disconnected").reason,
      /Scene mismatch/,
    );
    assert.equal(events[0].scene.revision, scene.revision);
    const health = await (
      await fetch(`http://127.0.0.1:${address.port}/health`)
    ).json();
    assert.equal(health.workers, 0);
    assert.equal(health.sessions, 0);
  } finally {
    ws?.close();
    await gateway.close();
  }
});
test("committed human has skin and four clips; coupe contains both seat anchors", () => {
  function glb(name) {
    const b = readFileSync(`apps/browser/public/assets/${name}.glb`);
    assert.equal(b.subarray(0, 4).toString(), "glTF");
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
  }
  const human = glb("neighbor");
  assert.equal(human.skins.length, 1);
  assert.deepEqual(human.animations.map((a) => a.name).sort(), [
    "idle",
    "jump",
    "seated",
    "walk",
  ]);
  const car = glb("coupe");
  for (const name of ["seat_driver", "seat_passenger"])
    assert.ok(car.nodes.some((n) => n.name === name));
});

test("animated occupants fit under the coupe roof and above its floor", async () => {
  const THREE = await import("three"),
    { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  async function model(name) {
    const b = readFileSync(`apps/browser/public/assets/${name}.glb`);
    return new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      "",
    );
  }
  const car = await model("coupe");
  car.scene.rotation.x = Math.PI / 2;
  car.scene.updateMatrixWorld(true);
  const ceiling = new THREE.Vector3(),
    floor = new THREE.Vector3();
  car.scene.getObjectByName("cabin_ceiling").getWorldPosition(ceiling);
  car.scene.getObjectByName("cabin_floor").getWorldPosition(floor);
  for (const seat of ["seat_driver", "seat_passenger"]) {
    const human = await model("neighbor"),
      actor = new THREE.Group();
    human.scene.rotation.x = Math.PI / 2;
    human.scene.position.z = -1;
    actor.add(human.scene);
    car.scene.getObjectByName(seat).getWorldPosition(actor.position);
    const mixer = new THREE.AnimationMixer(actor);
    mixer.clipAction(human.animations.find((a) => a.name === "seated")).play();
    mixer.update(0.5);
    actor.updateMatrixWorld(true);
    actor.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    });
    const bounds = new THREE.Box3().setFromObject(actor, true);
    assert.ok(bounds.max.z < ceiling.z, `${seat}: head protrudes through roof`);
    assert.ok(bounds.min.z > floor.z, `${seat}: feet protrude through floor`);
    assert.ok(
      bounds.min.x > -0.8 && bounds.max.x < 0.8,
      `${seat}: shoulders outside cabin`,
    );
  }
});

test("neighborhood exits choose the clear door beside a fence and boundary", () => {
  const scene = loadScene("neighborhood"),
    index = new CollisionIndex(scene.barriers);
  for (const origin of [
    [14.9, -18, 10],
    [87, -80, 10],
  ]) {
    assert.equal(index.collides(origin[0], origin[1], 2), false);
    assert.equal(index.collides(origin[0] + 2, origin[1], 0.45), true);
    const exit = findSafeExitPosition(origin, 0, 1, scene, index);
    assert.ok(exit[0] < origin[0]);
    assert.equal(index.collides(exit[0], exit[1], 0.45), false);
    assert.equal(exit[2], scene.groundZ + 1);
  }
});
