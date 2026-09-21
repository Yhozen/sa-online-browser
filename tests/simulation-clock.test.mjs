// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock } from '../apps/browser/src/simulation-clock.ts';
import { InterpolatedPose } from '../apps/browser/src/interpolated-pose.ts';
test('five seconds of input covers the same distance through long render stalls',()=>{
  for(const cadence of [1000/144,1000/60,250,1700]) {
    let x=0,held=false,steps=0;
    const clock=new SimulationClock(0,dt=>{assert.equal(dt,1/60);if(held)x+=5*dt;steps++;});
    clock.advance(800);held=true;
    for(let now=800+cadence;now<5800;now+=cadence)clock.advance(now);
    clock.advance(5800);held=false;
    clock.advance(5700); // stale rAF must not rewind elapsed time
    clock.advance(6500);
    assert.ok(Math.abs(x-25)<1e-7,`${cadence}ms rendering: ${x}m`);
    assert.equal(steps,390);
  }
});
test('corrections reset debt and frozen clocks reject unbounded catch-up',()=>{
  let ticks=0;const clock=new SimulationClock(0,()=>ticks++);
  clock.advance(10);clock.reset(500);clock.advance(510);assert.equal(ticks,0);
  assert.equal(clock.advance(20000),false);assert.equal(ticks,0);
  assert.equal(clock.advance(20100),true);assert.equal(ticks,6);
});

test('interpolation alpha stays bounded across epsilon ticks, stale frames and resets', () => {
  const clock = new SimulationClock(0, () => {});
  assert.equal(clock.alpha, 0);
  clock.advance(1000 / 120);
  assert.ok(Math.abs(clock.alpha - .5) < 1e-10);
  // A tick accepted by the accumulator epsilon leaves a tiny negative remainder.
  clock.advance(1000 / 60 - 1e-8);
  assert.equal(clock.alpha, 0);
  clock.advance(25);
  const alpha = clock.alpha;
  clock.advance(24);
  assert.equal(clock.alpha, alpha, 'stale rAF cannot rewind interpolation');
  clock.reset(100);
  assert.equal(clock.alpha, 0);
  clock.advance(1000 / 120 + 100);
  assert.ok(Math.abs(clock.alpha - .5) < 1e-10);
  assert.equal(clock.advance(20000), false);
  assert.equal(clock.alpha, 0);
});

test('120Hz, 144Hz and uneven rendering produce continuous motion from unchanged 60Hz steps', () => {
  for (const cadence of [[1000 / 120], [1000 / 144], [1000 / 90], [6, 18, 4, 12, 24]]) {
    const state = { position: [0, 0, 10], rotation: [1, 0, 0, 0] };
    const pose = new InterpolatedPose(state);
    let steps = 0;
    const clock = new SimulationClock(0, dt => {
      pose.capture(state);
      state.position[0] += 5 * dt;
      steps++;
    });
    let now = 0, previousTime = 0, previousX = 0;
    for (let frame = 0; now < 1000; frame++) {
      now += cadence[frame % cadence.length];
      clock.advance(now);
      pose.sample(state, clock.alpha);
      if (previousTime > 1000 / 60) {
        const expectedDistance = 5 * (now - previousTime) / 1000;
        assert.ok(Math.abs(pose.position.x - previousX - expectedDistance) < 1e-8,
          `${cadence} frame ${frame}: motion must fill every display frame`);
      }
      previousX = pose.position.x;
      previousTime = now;
    }
    assert.equal(steps, Math.floor((now + 1e-7) * 60 / 1000));
    assert.ok(Math.abs(state.position[0] - steps * 5 / 60) < 1e-8,
      'render interpolation must never feed back into simulation');
  }
});

test('catch-up uses the last two ticks and corrections cut at every interpolation phase', () => {
  const state = { position: [0, 0, 10], rotation: [1, 0, 0, 0] };
  const pose = new InterpolatedPose(state);
  const clock = new SimulationClock(0, dt => {
    pose.capture(state);
    state.position[0] += 5 * dt;
  });
  clock.advance(250);
  pose.sample(state, clock.alpha);
  assert.ok(Math.abs(pose.position.x - 14 * 5 / 60) < 1e-8);
  // A server teleport replaces history, including when no new tick has run.
  state.position = [100, -80, 12];
  state.rotation = [0, 0, 0, -1];
  clock.reset(250);
  pose.reset(state);
  for (const alpha of [0, .25, .5, .99, 1]) {
    pose.sample(state, alpha);
    assert.deepEqual(pose.position.toArray(), state.position);
    assert.ok(Math.abs(pose.quaternion.z - 1) < 1e-10);
  }
  clock.advance(275);
  pose.sample(state, clock.alpha);
  assert.ok(Math.abs(pose.position.x - 100 - 5 / 120) < 1e-8);
});

test('rotation interpolation takes the short arc and snapshots do not alias mutable state', () => {
  const rotation = degrees => [Math.cos(degrees * Math.PI / 360), 0, 0, -Math.sin(degrees * Math.PI / 360)];
  const state = { position: [0, 0, 10], rotation: rotation(179) };
  const pose = new InterpolatedPose(state);
  pose.capture(state);
  state.position[0] = 2;
  state.rotation = rotation(-179);
  pose.sample(state, .5);
  assert.equal(pose.position.x, 1);
  assert.ok(Math.abs(pose.quaternion.w) < 1e-10, 'turn across ±180 must face backward at its midpoint');
  assert.ok(Math.abs(Math.abs(pose.quaternion.z) - 1) < 1e-10);
  assert.deepEqual(state.position, [2, 0, 10]);
  assert.deepEqual(state.rotation, rotation(-179));
});

test('input timers ahead of queued rAF timestamps do not change presentation velocity', () => {
  const state = { position: [0, 0, 10], rotation: [1, 0, 0, 0] };
  const pose = new InterpolatedPose(state);
  const clock = new SimulationClock(0, dt => {
    pose.capture(state);
    state.position[0] += 5 * dt;
  });
  let rendered = 0, negativeAlpha = 0;
  for (let frame = 1; frame <= 120; frame++) {
    const now = frame * 1000 / 120;
    // Real browser timers sometimes run several milliseconds after the display
    // timestamp, before its queued rAF callback is invoked.
    if (frame % 3 === 0) clock.advance(now + 12);
    clock.advance(now);
    const alpha = clock.alphaAt(now);
    if (alpha < -.001) negativeAlpha++;
    pose.sample(state, alpha);
    if (frame > 2)
      assert.ok(Math.abs(pose.position.x - rendered - 5 / 120) < 1e-8,
        `frame ${frame} accelerated because a timer advanced ahead of its timestamp`);
    rendered = pose.position.x;
  }
  assert.ok(negativeAlpha > 0, 'test must cross a fixed-step boundary ahead of rAF');
  state.position = [60, -20, 10];
  clock.reset(1007);
  pose.reset(state);
  pose.sample(state, clock.alphaAt(1000));
  assert.deepEqual(pose.position.toArray(), state.position,
    'a correction must invalidate the older interval as well');
});
