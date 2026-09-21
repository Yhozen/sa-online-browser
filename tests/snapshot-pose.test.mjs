// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotPose } from '../apps/browser/src/snapshot-pose.ts';

const pose = (x, velocity = 5, angle = 0) => ({
  position: [x, 0, 10], velocity: [velocity, 0, 0],
  rotation: [Math.cos(angle / 2), 0, 0, -Math.sin(angle / 2)],
});

test('100ms buffered samples move continuously across 120Hz frames and packet gaps', () => {
  const buffer = new SnapshotPose();
  const packets = [0, 30, 60, 120, 150, 180, 250, 280, 310, 340, 370, 400];
  let next = 0, last = 0;
  for (let frame = 0; frame <= 60; frame++) {
    const now = frame * 1000 / 120;
    while (next < packets.length && packets[next] <= now) {
      const time = packets[next++];
      buffer.push(pose(time * .005), time);
    }
    buffer.sample(now);
    assert.ok(Math.abs(buffer.position.x - Math.max(0, now - 100) * .005) < 1e-8);
    if (now > 110) assert.ok(buffer.position.x > last, 'render must fill packet gaps');
    last = buffer.position.x;
  }
  assert.equal(buffer.delayMs, 100);
});

test('extrapolation stops after 100ms and never changes authoritative input', () => {
  const buffer = new SnapshotPose(), state = pose(2);
  buffer.push(state, 1000);
  buffer.sample(1150);
  assert.equal(buffer.position.x, 2.25);
  buffer.sample(1500);
  assert.equal(buffer.position.x, 2.5);
  buffer.sample(10000);
  assert.equal(buffer.position.x, 2.5);
  assert.deepEqual(state, pose(2));
});

test('teleports, explicit corrections and stream resets discard old history immediately', () => {
  const buffer = new SnapshotPose();
  buffer.push(pose(0), 0);
  buffer.push(pose(.15), 30);
  buffer.push(pose(80, 0), 60);
  buffer.sample(60);
  assert.equal(buffer.position.x, 80, 'large teleport must not interpolate from the old street');
  buffer.reset(pose(-20, 0, Math.PI), 75);
  buffer.sample(75);
  assert.equal(buffer.position.x, -20);
  assert.ok(Math.abs(buffer.quaternion.z - 1) < 1e-10);
  buffer.push(pose(999), 74);
  buffer.sample(80);
  assert.equal(buffer.position.x, -20, 'out-of-order receipts cannot replace a correction');
});

test('velocity-assisted interpolation does not overshoot a stop or turn the long way', () => {
  const buffer = new SnapshotPose();
  buffer.push(pose(0, 5, 179 * Math.PI / 180), 0);
  buffer.push(pose(.1, 0, -179 * Math.PI / 180), 100);
  let previous = 0;
  for (let now = 100; now <= 200; now++) {
    buffer.sample(now);
    assert.ok(buffer.position.x >= previous - 1e-10);
    assert.ok(buffer.position.x <= .1 + 1e-10);
    previous = buffer.position.x;
  }
  buffer.sample(150);
  assert.ok(Math.abs(buffer.quaternion.w) < 1e-10);
});

test('batched receipts retain a finite interpolation interval', () => {
  const buffer = new SnapshotPose();
  buffer.push(pose(0), 0);
  buffer.push(pose(.1), 30);
  buffer.push(pose(.15), 30);
  buffer.sample(130);
  assert.ok(Number.isFinite(buffer.position.x));
  assert.equal(buffer.position.x, .15);
});

test('reported velocity removes arrival jitter without increasing the 100ms view delay', () => {
  const buffer = new SnapshotPose();
  const jitter = [0, 12, 3, 18, 0, 6];
  const packets = Array.from({ length: 151 }, (_, i) => ({
    time: i * 1000 / 30 + jitter[i % jitter.length], position: i / 6,
  }));
  let next = 0, previous = 0;
  for (let frame = 0; frame < 600; frame++) {
    const now = frame * 1000 / 120;
    while (next < packets.length && packets[next].time <= now) {
      const packet = packets[next++];
      buffer.push(pose(packet.position), packet.time);
    }
    buffer.sample(now);
    if (now > 1000) {
      assert.ok(Math.abs((buffer.position.x - previous) * 120 - 5) < 1e-7,
        'network delivery cadence must not become visible acceleration');
      assert.ok(Math.abs(buffer.position.x - (now - 100) * .005) < 1e-7,
        'the buffer may not hide jitter by adding more view delay');
    }
    previous = buffer.position.x;
  }
});
