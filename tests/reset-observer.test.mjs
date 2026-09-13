// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { armResetObservation, collectResetObservation, disposeResetObservation } from './browser/reset-observer.mjs';

function fixture() {
  let now = 0, nextId = 0;
  const timers = new Map(), listeners = new Set();
  const input = { value: '/reset' };
  const state = { epoch: 42, self: { id: 7, spawned: true, mode: 'onFoot', position: [-4, 0, 10] }, vehicles: [{ id: 1, position: [0, 16, 10] }], received: { selfPosition: 10, selfHeading: 10, vehicleState: 100 } };
  const window = { __poc: state,
    addEventListener(type, handler, capture) { assert.equal(type, 'keydown'); assert.equal(capture, true); listeners.add(handler); },
    removeEventListener(type, handler, capture) { assert.equal(type, 'keydown'); assert.equal(capture, true); listeners.delete(handler); },
  };
  const context = vm.createContext({ window, document: { querySelector(selector) { assert.equal(selector, '[data-testid="chat-input"]'); return input; } },
    performance: { now: () => now }, setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; }, clearTimeout(id) { timers.delete(id); },
  });
  const invoke = (fn, arg) => { context.argument = arg; return vm.runInContext(`(${fn.toString()})(argument)`, context); };
  const key = '__acceptance_reset_cpu_unique';
  const start = () => invoke(armResetObservation, { key });
  const enter = (overrides = {}) => { for (const handler of [...listeners]) handler({ target: input, code: 'Enter', repeat: false, isTrusted: true, ...overrides }); };
  const advance = (time, starved = false) => {
    if (starved) now = time;
    while (true) {
      const due = [...timers].filter(([, t]) => t.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); if (!starved) now = due[1].at; due[1].callback();
    }
    now = time;
  };
  const correct = () => { state.vehicles[0].position = [0, 6, 10]; for (const name of ['selfPosition', 'selfHeading', 'vehicleState']) state.received[name]++; };
  const result = () => invoke(collectResetObservation, { key });
  const close = () => { invoke(disposeResetObservation, { key }); assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert.equal(Object.hasOwn(window, key), false); };
  return { state, window, key, start, enter, advance, correct, result, close, listeners, timers };
}

test('fresh correction at 128 ms passes; result collected at 5 s remains immutable', async () => {
  const f = fixture(); f.start(); f.enter(); f.advance(120); f.correct(); f.advance(128);
  f.advance(5000); const r = await f.result(); assert.equal(r.passed, true); assert.equal(r.elapsedMs, 128);
  assert.equal(Object.isFrozen(r), true); assert.equal(Object.isFrozen(r.last.vehiclePosition), true);
  assert.throws(() => { r.last.vehiclePosition[0] = 4; }, TypeError); f.close();
});
test('correction first arriving after 1 s fails even with delayed collection', async () => {
  const f = fixture(); f.start(); f.enter(); f.advance(1000); f.correct(); f.advance(5000);
  const r = await f.result(); assert.equal(r.passed, false); assert.equal(r.reason, 'deadline'); assert.equal(r.elapsedMs, 1000); f.close();
});
test('browser callback starved until 1200 ms cannot accept then-correct state', async () => {
  const f = fixture(); f.start(); f.enter(); f.correct(); f.advance(1200, true);
  const r = await f.result(); assert.equal(r.passed, false); assert.equal(r.elapsedMs, 1200); f.close();
});
test('already-correct position without fresh counters fails', async () => {
  const f = fixture(); f.state.vehicles[0].position = [0, 6, 10]; f.start(); f.enter(); f.advance(1000);
  const r = await f.result(); assert.equal(r.passed, false); assert.equal(r.last.distance, 0); assert.equal(r.last.fresh, false); f.close();
});
test('arm-to-Enter delay excluded; counter baseline sampled at real Enter', async () => {
  const f = fixture(); f.start(); f.advance(5000); f.correct(); f.enter(); f.advance(6000);
  const r = await f.result(); assert.equal(r.passed, false); assert.equal(r.startedAt, 5000); assert.equal(r.baseline.selfPosition, 11); f.close();
});
test('epoch/player changes cannot pass with fresh counters and correct car', async () => {
  for (const field of ['epoch', 'player']) {
    const f = fixture(); f.start(); f.enter(); f.correct(); if (field === 'epoch') f.state.epoch++; else f.state.self.id++;
    f.advance(16); const r = await f.result(); assert.equal(r.passed, false); assert.equal(r.reason, 'session-changed'); f.close();
  }
});
test('exact .5 m remains failure; 1000 ms boundary still permits <.5 m', async () => {
  const f = fixture(); f.start(); f.enter(); f.correct(); f.state.vehicles[0].position = [0.5, 6, 10]; f.advance(999);
  f.state.vehicles[0].position = [0.499, 6, 10]; f.advance(1000); const r = await f.result(); assert.equal(r.passed, true); assert.equal(r.elapsedMs, 1000); f.close();
});
test('untrusted/repeated/unrelated key does not start; cancellation cleans every observer resource', async () => {
  const f = fixture(); f.start(); assert.throws(f.start, /already exists/); f.enter({ isTrusted: false }); f.enter({ repeat: true }); f.enter({ code: 'Space' });
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 1); const result = f.result(); f.close(); const r = await result; assert.equal(r.passed, false); assert.equal(r.reason, 'cancelled');
});
