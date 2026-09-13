// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { keepAcceptanceTransportAlive } from '../tools/acceptance-browser-heartbeat.mjs';

function fixture() {
  const socket = new EventEmitter();
  Object.assign(socket, { OPEN: 1, readyState: 1, pings: [], ping(callback) { this.pings.push(callback); } });
  const timers = new Set();
  let unreferenced = false;
  const context = vm.createContext({ socket,
    setInterval(callback, delay) {
      assert.equal(delay, 5000);
      const timer = { callback, unref() { unreferenced = true; } }; timers.add(timer); return timer;
    },
    clearInterval(timer) { timers.delete(timer); },
  });
  const stop = vm.runInContext(`(${keepAcceptanceTransportAlive.toString()})(socket)`, context);
  const tick = () => { for (const timer of [...timers]) timer.callback(); };
  const clean = () => { assert.equal(timers.size, 0); assert.equal(socket.listenerCount('close'), 0); assert.equal(socket.listenerCount('error'), 0); };
  return { socket, timers, stop, tick, clean, get unreferenced() { return unreferenced; } };
}

test('heartbeat uses only ping control frames and an unreferenced five-second timer', () => {
  const f = fixture(); assert.equal(f.unreferenced, true);
  f.tick(); f.tick(); assert.equal(f.socket.pings.length, 2);
  for (const callback of f.socket.pings) callback();
  assert.equal(f.timers.size, 1); f.stop(); f.stop(); f.clean();
});

test('socket close/error clears heartbeat and its listeners without closing the socket', () => {
  for (const event of ['close', 'error']) {
    const f = fixture(); f.socket.emit(event); f.clean(); f.tick(); assert.equal(f.socket.pings.length, 0);
  }
});

test('a closing socket or failed ping stops traffic without adding a liveness timeout', () => {
  const closing = fixture(); closing.socket.readyState = 2; closing.tick(); closing.clean(); assert.equal(closing.socket.pings.length, 0);
  const failed = fixture(); failed.tick(); failed.socket.pings[0](new Error('closed during write')); failed.clean();
  failed.tick(); assert.equal(failed.socket.pings.length, 1);
});

test('pinned real WebSocket peer automatically returns pong and closes cleanly', { timeout: 10000 }, async () => {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('playwright-core/package.json');
  assert.equal(require(packagePath).version, '1.59.1');
  const { ws: WebSocket, wsServer: WebSocketServer } = require(join(dirname(packagePath), 'lib/utilsBundle.js'));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  let client, peer, stop;
  try {
    await once(server, 'listening');
    const incoming = once(server, 'connection');
    client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    [peer] = await incoming;
    const ping = once(client, 'ping'), pong = once(peer, 'pong');
    stop = keepAcceptanceTransportAlive(peer);
    const [[sent], [returned]] = await Promise.all([ping, pong]);
    assert.equal(sent.length, 0); assert.deepEqual(returned, sent);
    const closed = Promise.all([once(client, 'close'), once(peer, 'close')]);
    client.close(); await closed;
    assert.equal(client.readyState, client.CLOSED); assert.equal(peer.readyState, peer.CLOSED);
  } finally {
    stop?.(); client?.terminate(); peer?.terminate();
    await new Promise(resolve => server.close(resolve));
  }
});
