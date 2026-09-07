// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage } from '../services/gateway/server.mjs';

const state = () => ({ type: 'state', epoch: 1, seq: 1, controlRevision: 0, position: [0, 0, 10], rotation: [1, 0, 0, 0], velocity: [0, 0, 0], mode: 'onFoot', vehicleId: 0, seat: 0, keys: 0 });
test('valid browser commands and both vehicle roles cross the boundary', () => {
  for (const m of [{ type: 'join', name: 'Browser_1', version: 1 }, { type: 'chat', epoch: 1, text: 'hello' }, { type: 'command', epoch: 1, text: '/drive' }, { type: 'disconnect', epoch: 1 }, state(), { ...state(), mode: 'driver', vehicleId: 1 }, { ...state(), mode: 'passenger', vehicleId: 1, seat: 1 }]) assert.equal(validateMessage(m), true, JSON.stringify(m));
});
test('reject malformed text, malformed shapes and incompatible versions', () => {
  for (const m of [null, [], {}, { type: 'join', name: '../x' }, { type: 'join', name: 'Alice', version: 2 }, { type: 'chat', epoch: 1, text: 'a\0b' }, { type: 'chat', epoch: 1, text: '🎉'.repeat(40) }, { type: 'chat', epoch: 0, text: 'hello' }, { type: 'connect', host: '192.168.0.1', port: 53 }]) assert.equal(validateMessage(m), false, JSON.stringify(m));
});
test('reject dangerous motion values before entering native code', () => {
  for (const patch of [{ position: [NaN, 0, 0] }, { position: [Infinity, 0, 0] }, { position: [0, 0] }, { velocity: [0, -1001, 0] }, { rotation: [0, 0, 0, 0] }, { rotation: [1, 1, 1, 1] }, { keys: -1 }, { vehicleId: 2000 }, { seat: 9 }, { mode: 'npc' }, { seq: -1 }, { controlRevision: -1 }, { epoch: 1.5 }]) assert.equal(validateMessage({ ...state(), ...patch }), false, JSON.stringify(patch));
});
