// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';
import playwright from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { createGateway } from '../../services/gateway/server.mjs';

const URL = 'http://127.0.0.1:3000';
let gateway, server, observations = [], agreements = [], browserErrors = [], traceCounter = 0, serverReady = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = page => page.evaluate(() => window.__poc);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
function last(event, player) { return observations.findLast(x => x.event === event && (player === undefined || x.player === player)); }
async function startServer() {
  serverReady = false;
  server = spawn('python3', ['tools/run-server.py'], { stdio: ['pipe', 'pipe', 'pipe'], env:{...process.env,POC_SCENE:'yard'} });
  const log = createWriteStream('artifacts/verification/server.log', { flags: 'a' });
  server.stdout.pipe(log); server.stderr.pipe(log);
  let buffer = '';
  server.stdout.on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (line.includes('Legacy Network started on')) serverReady = true;
      const i = line.indexOf('POC {');
      if (i !== -1) { try { observations.push({ ...JSON.parse(line.slice(i + 4)), receivedAt: Date.now() }); } catch {} }
    }
  });
  await expect.poll(() => serverReady, { timeout: 20000, message: 'unchanged server must start its real UDP endpoint' }).toBe(true);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise(resolve => server.once('exit', resolve)); server.stdin.write('exit\n');
  await Promise.race([stopped, sleep(3000).then(() => { if (server.exitCode === null) server.kill('SIGKILL'); })]);
  serverReady = false;
}
test.beforeAll(async () => {
  mkdirSync('artifacts/verification', { recursive: true });
  await startServer(); gateway = createGateway({sceneId:'yard'}); await gateway.start();
});
test.afterAll(async () => {
  await gateway?.close(); await stopServer();
  writeFileSync('artifacts/verification/server-observations.json', JSON.stringify(observations, null, 2));
  writeFileSync('artifacts/verification/position-agreements.json', JSON.stringify(agreements, null, 2));
  writeFileSync('artifacts/verification/browser-errors.json', JSON.stringify(browserErrors, null, 2));
});
async function session(browser, name, testInfo) {
  const traceId = ++traceCounter;
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, recordVideo: { dir: 'artifacts/verification/videos', size: { width: 960, height: 640 } } });
  // Network/lifecycle fixtures use the explicit Low fallback at full native size.
  // Standard and both DPRs are exercised independently by graphics/desktop cases.
  await context.addInitScript(() => localStorage.setItem('poc-quality', 'low'));
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL); await page.getByTestId('nickname').fill(name); await page.getByTestId('join').click();
  return { context, page, errors, name, async close() { browserErrors.push({ name, traceId, errors: [...errors] }); await context.tracing.stop({ path: `artifacts/verification/${name}-${traceId}-${testInfo.retry}.zip` }); await context.close(); } };
}
async function spawned(s) { await expect.poll(async () => (await snapshot(s.page)).self.spawned).toBe(true); return (await snapshot(s.page)).self.id; }
async function focus(page) { await page.bringToFront(); await page.mouse.click(720, 400); }
async function move(page, key, ms) { await focus(page); await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }
async function key(page, k) { await focus(page); await page.keyboard.press(k); }
async function chat(page, text) { await page.getByTestId('chat-input').fill(text); await page.getByTestId('chat-input').press('Enter'); }
async function mode(page, value) { await expect.poll(async () => (await snapshot(page)).self.mode).toBe(value); }
async function positionAgrees(page, id) {
  // Repeated independent server samples prevent an old pre-movement sample from passing.
  try {
    await expect.poll(async () => {
      const s = (await snapshot(page)).self.position, o = last('player', id);
      if (!o || Date.now() - o.receivedAt >= 1000) return 1000;
      const delta = distance(s, [o.x, o.y, o.z]);
      if (delta < 0.5) agreements.push({ player: id, checkedAt: Date.now(), browser: s, server: [o.x, o.y, o.z], serverSampleAt: o.receivedAt, distance: delta });
      return delta;
    }, { timeout: 1000, intervals: [100, 100, 200] }).toBeLessThan(0.5);
  } catch (error) {
    writeFileSync(`artifacts/verification/divergence-${id}.json`, JSON.stringify({ browser: await snapshot(page), server: last('player', id), vehicle: last('vehicle') }, null, 2));
    throw error;
  }
}
async function reset(page) {
  const count = observations.filter(x => x.event === 'reset').length;
  await chat(page, '/reset');
  await expect.poll(() => observations.filter(x => x.event === 'reset').length).toBeGreaterThan(count);
  await mode(page, 'onFoot');
  await expect.poll(() => { const v = last('vehicle'); return v ? distance([v.x, v.y, v.z], [0, 6, 10]) : 1000; }, { timeout: 1000 }).toBeLessThan(0.5);
  await expect.poll(async () => { const v = (await snapshot(page)).vehicles[0]; return v ? distance(v.position, [0, 6, 10]) : 1000; }, { timeout: 1000 }).toBeLessThan(0.5);
}

test('end-to-end: normal players walk, chat, share a car and recover', async ({ browser }, info) => {
  const a = await session(browser, 'Proof_A', info), b = await session(browser, 'Proof_B', info);
  try {
    const aid = await spawned(a), bid = await spawned(b); expect(aid).not.toBe(bid);
    expect(observations.find(x => x.event === 'connect' && x.name === a.name)?.npc).toBe(0);
    expect(observations.find(x => x.event === 'connect' && x.name === b.name)?.npc).toBe(0);
    await expect.poll(async () => (await snapshot(b.page)).peers.some(x => x.id === aid)).toBe(true);
    const before = (await snapshot(a.page)).self.position;
    await move(a.page, 'w', 1000);
    await expect.poll(async () => distance(before, (await snapshot(a.page)).self.position)).toBeGreaterThan(1);
    await positionAgrees(a.page, aid);
    await expect.poll(async () => { const s = await snapshot(a.page), remote = (await snapshot(b.page)).peers.find(p => p.id === aid); return remote ? distance(s.self.position, remote.position) : 1000; }, { timeout: 1000 }).toBeLessThan(0.5);
    await move(b.page, 'a', 650); await positionAgrees(b.page, bid);
    await expect.poll(async () => { const s = await snapshot(b.page), remote = (await snapshot(a.page)).peers.find(p => p.id === bid); return remote ? distance(s.self.position, remote.position) : 1000; }, { timeout: 1000 }).toBeLessThan(0.5);
    await chat(a.page, 'Proof hello A'); await chat(b.page, 'Proof hello B');
    await expect.poll(async () => (await snapshot(b.page)).chat.filter(m => m.text === 'Proof hello A').length).toBe(1);
    await expect.poll(async () => (await snapshot(a.page)).chat.filter(m => m.text === 'Proof hello B').length).toBe(1);
    expect(observations.filter(x => x.event === 'chat' && x.text === 'Proof hello A')).toHaveLength(1);
    await a.page.screenshot({ path: 'artifacts/verification/walking-chat.png' });
    await reset(a.page);
    await key(a.page, 'e'); await mode(a.page, 'driver');
    await key(b.page, 'g'); await mode(b.page, 'passenger');
    await expect.poll(() => last('player', aid)?.state).toBe(2);
    await expect.poll(() => last('player', bid)?.state).toBe(3);
    const carBefore = (await snapshot(a.page)).vehicles[0].position;
    await move(a.page, 'w', 1200); await sleep(700);
    await expect.poll(() => { const v = last('vehicle'); return v ? distance(carBefore, [v.x, v.y, v.z]) : 0; }).toBeGreaterThan(2);
    await expect.poll(async () => distance((await snapshot(a.page)).self.position, (await snapshot(b.page)).self.position), { timeout: 1000 }).toBeLessThan(0.5);
    await positionAgrees(a.page, aid); await positionAgrees(b.page, bid);
    await sleep(2200); // Let the driver's arcade drag settle before passenger-input assertion.
    const parked = (await snapshot(a.page)).self.position;
    await move(b.page, 'w', 700); await sleep(300);
    expect(distance(parked, (await snapshot(a.page)).self.position)).toBeLessThan(0.5);
    await b.page.screenshot({ path: 'artifacts/verification/driver-passenger.png' });
    await key(a.page, 'f'); await mode(a.page, 'onFoot'); await key(b.page, 'f'); await mode(b.page, 'onFoot');
    await key(b.page, 'e'); await mode(b.page, 'driver'); await key(a.page, 'g'); await mode(a.page, 'passenger');
    const swapped = (await snapshot(b.page)).self.position;
    await move(b.page, 'w', 1100); await sleep(700);
    expect(distance(swapped, (await snapshot(a.page)).self.position)).toBeGreaterThan(1);
    await positionAgrees(a.page, aid); await positionAgrees(b.page, bid);
    await reset(a.page); await mode(b.page, 'onFoot');
    // Requests travel through command RPC and are serialized by the Pawn fixture.
    await Promise.all([chat(a.page, '/drive'), chat(b.page, '/drive')]);
    await expect.poll(async () => [(await snapshot(a.page)).self.mode, (await snapshot(b.page)).self.mode].filter(x => x === 'driver').length).toBe(1);
    await expect.poll(() => observations.some(x => x.event === 'seatRejected' && x.reason === 'occupied')).toBe(true);
    await reset(a.page); await chat(a.page, '/teleport');
    await expect.poll(async () => distance((await snapshot(a.page)).self.position, [-4, -4, 10]), { timeout: 1000 }).toBeLessThan(0.5);
    await positionAgrees(a.page, aid);
    await key(b.page, 'e'); await mode(b.page, 'driver'); await key(a.page, 'g'); await mode(a.page, 'passenger');
    await b.page.getByTestId('disconnect').click();
    await mode(a.page, 'onFoot');
    await expect.poll(async () => (await snapshot(a.page)).peers.some(x => x.id === bid)).toBe(false);
    await b.page.getByTestId('join').click(); await spawned(b);
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test('failures: duplicate name, worker crash, unavailable server and restart', async ({ browser }, info) => {
  const a = await session(browser, 'Failure_A', info);
  try {
    const aid = await spawned(a);
    const duplicate = await session(browser, 'Failure_A', info);
    try { await expect.poll(async () => (await snapshot(duplicate.page)).status).toMatch(/Error|Disconnected/); expect((await snapshot(duplicate.page)).self.spawned).toBe(false); } finally { await duplicate.close(); }
    const log = readFileSync('.runtime/logs/gateway.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x));
    const worker = log.findLast(x => x.type === 'workerStarted' && x.name === a.name && !log.some(y => y.type === 'workerExited' && y.pid === x.pid));
    expect(worker?.pid).toBeTruthy(); const crashedAt = Date.now(); process.kill(worker.pid, 'SIGKILL');
    await expect.poll(async () => (await snapshot(a.page)).self.spawned).toBe(false);
    await expect.poll(async () => (await snapshot(a.page)).status).toMatch(/worker|protocol/i);
    // Observe the actual upstream timeout; a fixed sleep can race server cleanup.
    await expect.poll(() => last('disconnect', aid)?.receivedAt ?? 0, { timeout: 45000 }).toBeGreaterThan(crashedAt);
    await a.page.getByTestId('join').click(); await spawned(a);
    await stopServer();
    await expect.poll(async () => (await snapshot(a.page)).self.spawned, { timeout: 20000 }).toBe(false);
    const unavailable = await session(browser, 'Unavailable', info);
    try { await expect.poll(async () => (await snapshot(unavailable.page)).status, { timeout: 25000 }).toMatch(/Error|Disconnected/); expect((await snapshot(unavailable.page)).self.spawned).toBe(false); } finally { await unavailable.close(); }
    await startServer(); await a.page.getByTestId('join').click(); await spawned(a);
    expect(a.errors).toEqual([]);
  } finally { await a.close(); }
});

test('lifecycle: twenty browser connection cycles release sessions', async ({ browser }, info) => {
  for (let i = 0; i < 20; i++) {
    const s = await session(browser, `BrowserCycle_${i}`, info);
    const id = await spawned(s), connectedAt = last('connect', id)?.receivedAt;
    await s.close();
    await expect.poll(() => last('disconnect', id)?.receivedAt ?? 0).toBeGreaterThan(connectedAt);
    await expect.poll(async () => (await (await fetch(URL + '/health')).json()).sessions).toBe(0);
    await expect.poll(async () => (await (await fetch(URL + '/health')).json()).workers).toBe(0);
  }
});

test('edges: jump, wall collision, safe passenger exit and hidden-tab cleanup', async ({ browser }, info) => {
  const a = await session(browser, 'Edges_A', info), b = await session(browser, 'Edges_B', info);
  try {
    const aid = await spawned(a), bid = await spawned(b);
    await key(a.page, 'Space');
    await expect.poll(async () => (await snapshot(a.page)).self.position[2], { intervals: [30] }).toBeGreaterThan(10.1);
    await expect.poll(async () => (await snapshot(a.page)).self.position[2]).toBe(10);
    await key(a.page, 'e'); await mode(a.page, 'driver');
    await key(b.page, 'g'); await mode(b.page, 'passenger');
    await focus(a.page); await a.page.keyboard.down('w'); await a.page.keyboard.down('d');
    await expect.poll(async () => (await snapshot(a.page)).self.heading, { intervals: [30], timeout: 7000 }).toBeLessThan(-1.45);
    await a.page.keyboard.up('d');
    await expect.poll(async () => (await snapshot(a.page)).self.position[0], { timeout: 12000 }).toBeGreaterThan(36.7);
    await sleep(400); await a.page.keyboard.up('w');
    expect((await snapshot(a.page)).self.position[0]).toBeLessThanOrEqual(37);
    await positionAgrees(a.page, aid);
    await key(b.page, 'f'); await mode(b.page, 'onFoot');
    const exited = (await snapshot(b.page)).self.position;
    expect(exited[0]).toBeLessThan(38.64);
    await focus(b.page); await b.page.keyboard.down('w');
    await expect.poll(async () => distance(exited, (await snapshot(b.page)).self.position), { timeout: 5000 }).toBeGreaterThan(1);
    await b.page.keyboard.up('w');
    await positionAgrees(b.page, bid);
    await b.page.screenshot({ path: 'artifacts/verification/wall-exit.png' });
    // Pinned Playwright 1.59.1 enables focus emulation on its own CDP
    // session; another CDP session cannot disable it. This test-only adapter
    // removes that override, then switches actual Chrome tabs. No app state
    // or document visibility properties are injected.
    const implementation = playwright._connection.toImpl(b.page);
    const cdp = implementation.delegate._mainFrameSession._client;
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: targetInfo.browserContextId, newWindow: false, background: false, forTab: true });
    await cdp.send('Target.activateTarget', { targetId });
    await expect.poll(() => b.page.evaluate(() => document.hidden)).toBe(true);
    await expect.poll(() => last('disconnect', bid)?.receivedAt ?? 0).toBeGreaterThan(last('connect', bid).receivedAt);
    await cdp.send('Target.closeTarget', { targetId }); await b.page.bringToFront();
    await expect.poll(async () => (await snapshot(b.page)).self.spawned).toBe(false);
    expect((await snapshot(b.page)).peers).toEqual([]);
    expect((await snapshot(b.page)).vehicles).toEqual([]);
    await expect.poll(async () => (await snapshot(b.page)).status).toMatch(/hidden/i);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await b.page.getByTestId('join').click(); await spawned(b);
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test('soak: ten minutes of active two-player walking chat and driving', async ({ browser }, info) => {
  test.setTimeout(720000);
  const a = await session(browser, 'Soak_A', info), b = await session(browser, 'Soak_B', info);
  const aid = await spawned(a), bid = await spawned(b), start = Date.now(); let round = 0;
  try {
    while (Date.now() - start < 600000) {
      const driver = round % 2 ? b : a, passenger = round % 2 ? a : b;
      await reset(driver.page);
      const walkStart = (await snapshot(driver.page)).self.position;
      await move(driver.page, 'w', 350);
      expect(distance(walkStart, (await snapshot(driver.page)).self.position)).toBeGreaterThan(0.25);
      const phrase = `Soak round ${round}`;
      await chat(driver.page, phrase);
      await expect.poll(async () => (await snapshot(passenger.page)).chat.filter(m => m.text === phrase).length).toBe(1);
      await key(driver.page, 'e'); await mode(driver.page, 'driver');
      await key(passenger.page, 'g'); await mode(passenger.page, 'passenger');
      const carStart = last('vehicle');
      await move(driver.page, 'w', 700); await sleep(500);
      await expect.poll(() => { const current = last('vehicle'); return distance([carStart.x, carStart.y, carStart.z], [current.x, current.y, current.z]); }).toBeGreaterThan(0.5);
      await positionAgrees(a.page, aid); await positionAgrees(b.page, bid);
      await key(driver.page, 'f'); await key(passenger.page, 'f');
      await mode(driver.page, 'onFoot'); await mode(passenger.page, 'onFoot');
      expect((await snapshot(a.page)).self.spawned).toBe(true); expect((await snapshot(b.page)).self.spawned).toBe(true);
      if (++round % 5 === 0) console.log(`soak: ${round} rounds, ${Math.round((Date.now() - start) / 1000)}s`);
      await sleep(5000);
    }
    await a.page.screenshot({ path: 'artifacts/verification/soak-complete.png' });
    writeFileSync('artifacts/verification/soak.json', JSON.stringify({ durationMs: Date.now() - start, rounds: round, playerIds: [aid, bid], errors: [...a.errors, ...b.errors] }, null, 2));
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});
