// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { ChallengeReplica, formatRaceTime } from "../apps/browser/src/challenge-state.ts";
import { loadScene } from "../packages/shared/scene.mjs";
import { CollisionIndex, findSafeExitPosition } from "../apps/browser/src/collision.ts";

const state = overrides => ({ type: "challenge", version: 1, generation: 1, phase: "countdown",
  driverId: 0, passengerId: 1, vehicleId: 1, checkpointIndex: 0, checkpointCount: 9,
  elapsedMs: 0, countdownMs: 3000, bestMs: 0, serverTick: 100, reason: "none", ...overrides });

test("presentation cannot start, advance or finish without an upstream notice", () => {
  const replica = new ChallengeReplica();
  assert.equal(replica.accept(state(), 1000), "countdown");
  assert.equal(replica.accept(state({ countdownMs: 2900 }), 1100), undefined);
  assert.equal(replica.accept(state({ countdownMs: 1900 }), 2100), "countdown");
  assert.equal(replica.display(8000).stale, true);
  assert.equal(replica.state.phase, "countdown");
  assert.equal(replica.accept(state({ phase: "running", countdownMs: 0 }), 9000), "start");
  assert.equal(replica.display(20000).elapsedMs, 1500);
  assert.equal(replica.state.checkpointIndex, 0);
  assert.equal(replica.state.phase, "running");
  assert.equal(replica.accept(state({ phase: "running", checkpointIndex: 1, elapsedMs: 6000 }), 21000), "checkpoint");
  assert.equal(replica.accept(state({ phase: "finished", checkpointIndex: 9, elapsedMs: 60000 }), 22000), "finish");
  assert.equal(replica.accept(state({ phase: "finished", checkpointIndex: 9, elapsedMs: 60000 }), 23000), undefined);
  assert.equal(replica.display(100000).elapsedMs, 60000);
});

test("bad notices, stale runs and incomplete score batches cannot replace confirmed state", () => {
  const replica = new ChallengeReplica(); replica.accept(state({ generation: 5, phase: "running" }), 0);
  for (const corrupt of [{ generation: 4 }, { phase: "invented" }, { elapsedMs: NaN }, { driverId: -1 },
    { checkpointCount: 0 }, { checkpointIndex: 10 }, { countdownMs: Infinity }, { version: 2 }]) {
    replica.accept(state(corrupt), 50); assert.equal(replica.state.generation, 5); assert.equal(replica.state.phase, "running");
  }
  replica.accept({ type: "challengeScoresClear", generation: 5, count: 2 }, 0);
  const score = { type: "challengeScore", generation: 5, rank: 1, timeMs: 70000, driverName: "Arroyo_A", passengerName: "Arroyo_B" };
  replica.accept(score, 0); assert.equal(replica.scores.length, 0);
  replica.accept({ ...score, rank: 2, driverName: "<script>" }, 0); assert.equal(replica.scores.length, 0);
  replica.accept({ ...score, generation: 4, rank: 2 }, 0); assert.equal(replica.scores.length, 0);
  replica.accept({ ...score, rank: 2, timeMs: 80000, passengerName: "" }, 0);
  assert.deepEqual(replica.scores.map(s => s.timeMs), [70000, 80000]);
});

test("checkpoint data is bounded, finishes clear markers, reconnect clears the entire replica", () => {
  const replica = new ChallengeReplica(); replica.accept(state({ phase: "running" }), 0);
  const checkpoint = { type: "raceCheckpoint", position: [0,12,10], nextPosition: [30,12,10], radius: 4.5, checkpointType: 0 };
  replica.accept(checkpoint, 0); assert.deepEqual(replica.checkpoint.position, [0,12,10]);
  for (const invalid of [{radius:-1}, {radius:Infinity}, {position:[0,NaN,10]}, {position:[0,12]}, {checkpointType:90}]) {
    replica.accept({...checkpoint,...invalid},0); assert.equal(replica.checkpoint.radius,4.5);
  }
  replica.accept(state({phase:"finished",checkpointIndex:9,elapsedMs:13001}),20);
  assert.equal(replica.checkpoint,null); assert.equal(formatRaceTime(13001),"0:13.00");
  replica.clear(); assert.equal(replica.state,null); assert.deepEqual(replica.scores,[]);
  assert.equal(replica.display(1000).stale,false);
});

test("the shared course stays on clear roads and new solid props have collision-safe exits", () => {
  const scene=loadScene("neighborhood"), yard=loadScene("yard"), index=new CollisionIndex(scene.barriers);
  assert.equal(yard.challenge,undefined); assert.equal(scene.challenge.checkpoints.length,9);
  assert.deepEqual(scene.challenge.start,scene.vehicle.position);
  const points=[scene.challenge.start,...scene.challenge.checkpoints];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=0;d<=length;d+=.5) {
      const x=a[0]+(b[0]-a[0])*d/length,y=a[1]+(b[1]-a[1])*d/length;
      assert.equal(index.collides(x,y,2),false,`Course obstructed at ${x},${y}`);
      const road=scene.roads.some(road=>road.points.slice(1).some((end,j)=> {
        const begin=road.points[j];
        return x>=Math.min(begin[0],end[0])-road.width/2 && x<=Math.max(begin[0],end[0])+road.width/2 &&
          y>=Math.min(begin[1],end[1])-road.width/2 && y<=Math.max(begin[1],end[1])+road.width/2;
      })); assert.ok(road,`Course left the street at ${x},${y}`);
    }
  }
  for(const prop of scene.props.filter(p=>p.asset.startsWith("activity-"))) {
    assert.ok(scene.barriers.some(b=>b.id===prop.id),`${prop.id} has no collider`);
  }
  for(const seat of [0,1]) {
    const exit=findSafeExitPosition(scene.vehicle.position,0,seat,scene,index);
    assert.equal(index.collides(exit[0],exit[1],.45),false);
  }
});
