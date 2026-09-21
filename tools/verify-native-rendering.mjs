// SPDX-License-Identifier: GPL-3.0-or-later
// Native Chrome performance audit. Owns only newly created contexts/windows.
// Run after the served build and asset inventory are final, with other audits idle:
//   node tools/verify-native-rendering.mjs
// Optionally freeze one explicitly caller-selected, disconnected game page:
//   POC_NATIVE_REFERENCE_TARGET=<existing-target-id> node tools/verify-native-rendering.mjs
// Pure rAF timestamps are independent of the game's frame history. The immutable
// __poc getter is expensive, so observation happens no more than once per second.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTextureAudit } from './texture-audit.mjs';
import { visualBudgets } from './visual-budgets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debugURL = process.env.POC_CHROME_DEBUG || process.env.POC_CHROME_DEBUG_URL || 'http://127.0.0.1:9333';
const gameURL = process.env.POC_URL || 'http://127.0.0.1:3000';
const referenceTargetId = process.env.POC_NATIVE_REFERENCE_TARGET;
if (referenceTargetId !== undefined)
  assert.ok(referenceTargetId.length > 0 && referenceTargetId.trim() === referenceTargetId,
    'POC_NATIVE_REFERENCE_TARGET must be an explicit nonempty target ID');
const dir = path.resolve(root, process.env.POC_NATIVE_RENDER_ARTIFACTS || '.dream-loop/native-render-audit');
const cases = [1280, 1672].flatMap(width => ['standard', 'low'].map(preset => ({
  width, height: width === 1280 ? 720 : 941, preset,
})));
const warmupMs = 5000, idleMs = 20000, walkingMs = 4000, expectedDPR = 2;
const expectedRenderer = process.env.POC_NATIVE_EXPECTED_RENDERER || 'Apple M5 Pro';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const address of [debugURL, gameURL]) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname),
    'Native rendering audit requires loopback game and Chrome endpoints');
}
mkdirSync(dir, { recursive: true });

function localInputs() {
  const files = ['apps/browser/index.html', 'apps/browser/vite.config.ts', 'assets/horizon-relief.json', 'package.json', 'package-lock.json',
    'tools/verify-native-rendering.mjs',
    'tools/build-assets.mjs', 'tools/assets/horizon.py', 'tools/assets/horizon-envelope-v3.py',
    'tools/assets/horizon-bake.mjs', 'tools/assets/horizon-save.py'];
  for (const directory of ['apps/browser/src', 'packages/shared', 'assets/source']) {
    for (const entry of readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.(?:ts|mjs|json|blend)$/.test(entry.name))
        files.push(path.relative(root, path.join(entry.parentPath, entry.name)));
    }
  }
  const sources = Object.fromEntries(files.sort().map(file => {
    const location = path.join(root, file), bytes = readFileSync(location);
    return [file, { bytes: bytes.length, sha256: hash(bytes), modifiedAt: statSync(location).mtime.toISOString() }];
  }));
  const inventoryBytes = readFileSync(path.join(root, 'apps/browser/public/assets/inventory.json'));
  const inventory = JSON.parse(inventoryBytes);
  const assets = Object.fromEntries(Object.entries(inventory.files).map(([name, expected]) => {
    assert.ok(/^[a-zA-Z0-9_.-]+$/.test(name), `Unsafe inventory path: ${name}`);
    const bytes = readFileSync(path.join(root, 'apps/browser/public/assets', name));
    return [name, { ...expected, matchesLocalFile: bytes.length === expected.bytes && hash(bytes) === expected.sha256 }];
  }));
  assert.ok(Object.values(assets).every(asset => asset.matchesLocalFile), 'Exported assets differ from their inventory');
  return { sources, inventorySha256: hash(inventoryBytes), assets };
}

async function fetchBytes(address) {
  const response = await fetch(address, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `HTTP ${response.status}: ${address}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, metadata: { bytes: bytes.length, sha256: hash(bytes),
    lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag') } };
}

async function servedInputs() {
  const build = {}, pending = ['/'];
  while (pending.length) {
    const route = pending.pop();
    if (build[route]) continue;
    const { bytes, metadata } = await fetchBytes(new URL(route, gameURL));
    const local = path.join(root, 'apps/browser/dist', route === '/' ? 'index.html' : route.slice(1));
    const localExists = existsSync(local);
    build[route] = { ...metadata,
      matchesLocalDist: localExists ? hash(readFileSync(local)) === metadata.sha256 : null,
      localDistModifiedAt: localExists ? statSync(local).mtime.toISOString() : null,
      localDistStatus: localExists ? 'Available for exact hash comparison' : 'Not present on host; build may reside in the fixture container',
    };
    if (localExists) assert.ok(build[route].matchesLocalDist, `Served browser differs from local dist: ${route}`);
    for (const match of bytes.toString().matchAll(/["'\x60]((?:\/assets\/|\.\/)[^"'\x60]+\.(?:js|css))["'\x60]/g)) {
      const dependency = new URL(match[1], new URL(route, gameURL)).pathname;
      if (!build[dependency]) pending.push(dependency);
    }
  }
  const { bytes, metadata } = await fetchBytes(new URL('/scene', gameURL));
  const scene = JSON.parse(bytes);
  const localInventory = JSON.parse(readFileSync(path.join(root, 'apps/browser/public/assets/inventory.json')));
  assert.deepEqual(scene.assets, localInventory, 'Served scene asset inventory differs from local inventory');
  assert.equal(scene.id, 'neighborhood', 'Native street audit requires the neighborhood fixture');
  const assetEntries = await Promise.all(Object.entries(scene.assets.files).map(async ([name, expected]) => {
    assert.ok(/^[a-zA-Z0-9_.-]+$/.test(name), `Unsafe served inventory path: ${name}`);
    const asset = await fetchBytes(new URL(`/assets/${name}`, gameURL));
    assert.equal(asset.metadata.bytes, expected.bytes, `Served asset size differs from inventory: ${name}`);
    assert.equal(asset.metadata.sha256, expected.sha256, `Served asset hash differs from inventory: ${name}`);
    return [name, asset.metadata];
  }));
  return { build, assets: Object.fromEntries(assetEntries),
    scene: { ...metadata, id: scene.id, revision: scene.revision, assets: scene.assets } };
}

async function connect(address) {
  const socket = new WebSocket(address), pending = new Map(), listeners = new Set();
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (request) {
      pending.delete(message.id); clearTimeout(request.timeout);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  socket.onclose = () => {
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(Error('CDP socket closed')); }
    pending.clear();
  };
  return {
    onEvent(listener) { listeners.add(listener); },
    send(method, params = {}, timeoutMs = 60000) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression, timeoutMs = 60000) {
      const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    },
    close() { socket.close(); },
  };
}

async function openReferenceGuard(targetId) {
  // Exact caller selection only: no title matching, fallback discovery, focus,
  // navigation, context ownership or target closure is allowed for this page.
  const pages = await (await fetch(`${debugURL}/json/list`)).json();
  const target = pages.find(entry => entry.id === targetId);
  assert.ok(target && target.type === 'page', 'Selected reference target must be an existing page');
  assert.equal(new URL(target.url).origin, new URL(gameURL).origin, 'Reference target must be at the game origin');
  const cdp = await connect(target.webSocketDebuggerUrl);
  const read = async () => {
    const state = await cdp.evaluate(`(() => {
      const s = window.__poc;
      return { url: location.href, origin: location.origin, timeOrigin: performance.timeOrigin,
        frameCount: s?.graphics?.frameCount, spawned: s?.self?.spawned,
        playerId: s?.self?.id, status: s?.status,
        connected: document.querySelector('#connection')?.dataset.connected,
        playing: document.body.classList.contains('playing') };
    })()`);
    assert.equal(state?.origin, new URL(gameURL).origin, 'Reference page navigated away from the game origin');
    assert.ok(Number.isFinite(state.frameCount) && Number.isFinite(state.timeOrigin), 'Reference page must expose a finite game frame counter');
    assert.equal(state.spawned, false, 'A joined reference player must not be frozen');
    assert.equal(state.playerId, null, 'An active reference session must not be frozen');
    assert.notEqual(state.connected, 'true', 'A connected reference page must not be frozen');
    assert.equal(state.playing, false, 'A playing reference page must not be frozen');
    assert.notEqual(state.status, 'Connecting…', 'A joining reference page must not be frozen');
    return state;
  };
  try {
    const initial = await read();
    const readSamePage = async () => {
      const state = await read();
      assert.equal(state.timeOrigin, initial.timeOrigin, 'Reference document changed during the audit');
      return state;
    };
    return {
      targetId, initial,
      async freeze() {
        await readSamePage();
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        return await readSamePage();
      },
      async check(proof, label) {
        const after = await readSamePage();
        proof[label] = { ...after, unchanged: after.frameCount === proof.beforeWarmup.frameCount };
        assert.equal(after.frameCount, proof.beforeWarmup.frameCount, 'Reference page rendered during the audited warmup/measurement');
      },
      close() { cdp.close(); },
    };
  } catch (error) { cdp.close(); throw error; }
}

// Runs before the app; observes the real admission-ready UI without repeatedly
// serializing __poc during shader compilation and asset loading.
function installReadinessObserver(preset) {
  localStorage.setItem('poc-quality', preset);
  performance.setResourceTimingBufferSize(10000);
  const timing = window.__nativeAuditTiming = { installedAtMs: performance.now(), graphicsReadyAtMs: null };
  const observer = new MutationObserver(() => {
    const join = document.querySelector('#join');
    if (join && !join.disabled && timing.graphicsReadyAtMs === null) {
      timing.graphicsReadyAtMs = performance.now(); observer.disconnect();
    }
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
  addEventListener('DOMContentLoaded', () => { timing.domContentLoadedAtMs = performance.now(); }, { once: true });
  addEventListener('load', () => { timing.loadAtMs = performance.now(); }, { once: true });
}

// Invoked at boundaries and at most once per second during rAF sampling.
function readMetadata() {
  const started = performance.now(), state = window.__poc;
  const { frameTimes, ...graphics } = state.graphics;
  const textures = window.__textureAudit;
  const canvas = document.querySelector('#viewport canvas');
  const result = {
    t: started, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    visibility: document.visibilityState, focused: document.hasFocus(),
    canvasSize: [canvas.width, canvas.height], graphics, scene: state.scene,
    self: { spawned: state.self.spawned, mode: state.self.mode, position: state.self.position },
    peers: state.peers.length,
    textureStorageBytes: textures.reduce((sum, context) => sum + context.bytes, 0),
    textureCount: textures.reduce((sum, context) => sum + context.textures.length, 0),
    textureUnsupported: textures.flatMap(context => context.unsupported),
  };
  result.observationCostMs = performance.now() - started;
  return result;
}

function sampleFrames(durationMs) {
  return new Promise((resolve, reject) => {
    const timestamps = [], metadata = [], read = window.__nativeAuditReadMetadata;
    let active = true, frameRequest, first;
    const timeout = setTimeout(() => { active = false; clearInterval(interval); cancelAnimationFrame(frameRequest); reject(Error('rAF sampling timeout')); }, durationMs + 30000);
    const interval = setInterval(() => { if (active) metadata.push(read()); }, 1000);
    // No state getters, layout reads, GL readbacks, or frame-history writes here.
    function frame(t) {
      if (!active) return;
      first ??= t; timestamps.push(t);
      if (t - first >= durationMs) {
        active = false; clearTimeout(timeout); clearInterval(interval);
        resolve({ timestamps, metadata });
      } else frameRequest = requestAnimationFrame(frame);
    }
    frameRequest = requestAnimationFrame(frame);
  });
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
function summarize(sample, boundaries) {
  const intervals = sample.timestamps.slice(1).map((value, i) => value - sample.timestamps[i]);
  assert.ok(intervals.length > 20, 'Not enough display frames to summarize');
  const sorted = [...intervals].sort((a, b) => a - b), all = [...boundaries, ...sample.metadata];
  const durationMs = sample.timestamps.at(-1) - sample.timestamps[0];
  const medianFrameMs = quantile(sorted, .5), p95FrameMs = quantile(sorted, .95);
  return {
    frameIntervals: intervals.length, durationMs, medianFPS: 1000 / medianFrameMs,
    averageFPS: intervals.length * 1000 / durationMs, medianFrameMs, p95FrameMs,
    p99FrameMs: quantile(sorted, .99), maxFrameMs: sorted.at(-1),
    stallsOver33_34Ms: intervals.filter(value => value > 1000 / 30 + .01).length,
    stallsOver50Ms: intervals.filter(value => value > 50).length,
    stallsOver100Ms: intervals.filter(value => value > 100).length,
    target: { medianFPS: 60, achieved: 1000 / medianFrameMs >= 59, toleranceFPS: 1 },
    metadataSamples: all.length,
    maxSampledTriangles: Math.max(...all.map(row => row.graphics.triangles)),
    maxSampledCalls: Math.max(...all.map(row => row.graphics.calls)),
    maxSampledDownloadBytes: Math.max(...all.map(row => row.graphics.sceneDownloadBytes)),
    maxSampledTextureStorageBytes: Math.max(...all.map(row => row.textureStorageBytes)),
    maxObservationCostMs: Math.max(...all.map(row => row.observationCostMs)),
    summedObservationCostMs: sample.metadata.reduce((sum, row) => sum + row.observationCostMs, 0),
    nativeResolutionThroughoutObservedSamples: true,
  };
}

function verifyMetadata(row, test) {
  assert.deepEqual(row.viewport, [test.width, test.height], 'CSS viewport changed');
  assert.equal(row.dpr, expectedDPR, 'Native device pixel ratio changed');
  const expected = [test.width * row.dpr, test.height * row.dpr];
  assert.deepEqual(row.graphics.renderSize, expected, 'Game render size is not CSS viewport × DPR');
  assert.deepEqual(row.canvasSize, expected, 'Canvas drawing buffer is not CSS viewport × DPR');
  assert.equal(row.graphics.renderScale, expectedDPR, 'Game render scale changed');
  assert.equal(row.graphics.preset, test.preset, 'Quality preset changed');
  assert.equal(row.visibility, 'visible', 'The sampled page was hidden');
  assert.deepEqual(row.textureUnsupported, [], 'Texture audit encountered unsupported storage');
}

const records = {
  startedAt: new Date().toISOString(), complete: false, gameURL,
  protocol: { warmupMs, idleMs, walkingMs, expectedDPR, expectedRenderer, metadataIntervalMs: 1000,
    timing: 'Independent requestAnimationFrame timestamps; game frame history is neither read for metrics nor changed',
    cache: 'Separate new incognito context per case; target HTTP cache disabled',
    memory: 'Logical WebGL texture storage only, excluding driver overhead and renderbuffers',
    maxima: 'Maximum of sparse metadata observations, not an instrumented maximum over every frame',
    textureBudget: 'The existing 320 MiB reference ceiling is reported unchanged; these DPR-2 views may exceed it',
    referenceIsolation: referenceTargetId === undefined ? { enabled: false } : {
      enabled: true, targetId: referenceTargetId,
      method: 'Freeze the explicitly selected disconnected game page before each warmup; require unchanged frame count after idle and walking',
    },
  },
  budgets: { downloadBytes: visualBudgets.sceneDownloadBytes, triangles: visualBudgets.renderedTriangles,
    drawCalls: visualBudgets.drawCalls, textureStorageBytes: visualBudgets.textureStorageBytes, targetMedianFPS: 60 },
  cases: [], errors: [],
};
let browser, referenceGuard;
const owned = [];
const save = () => writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(records, null, 2));

async function closeOwned(target) {
  if (target.closed) return;
  // Release real input before closing, including on sampling/assertion failure.
  if (target.cdp) await target.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 }).catch(() => {});
  if (target.id) await browser.send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  target.cdp?.close();
  if (target.contextId) await browser.send('Target.disposeBrowserContext', { browserContextId: target.contextId }).catch(() => {});
  target.closed = true;
}

async function runCase(test) {
  const name = `${test.preset}-${test.width}x${test.height}-dpr${expectedDPR}`;
  const record = { name, ...test, errors: [], requests: [], complete: false };
  records.cases.push(record); save();
  const target = {}; owned.push(target);
  try {
    const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
    target.contextId = browserContextId;
    const { targetId } = await browser.send('Target.createTarget', {
      url: 'about:blank', browserContextId, newWindow: true, width: test.width, height: test.height + 87,
    });
    target.id = targetId; record.targetId = targetId;
    console.log(`Native audit ${name}: owned window ${targetId}`);
    const pages = await (await fetch(`${debugURL}/json/list`)).json();
    const page = pages.find(entry => entry.id === targetId);
    assert.ok(page, 'Owned Chrome target missing');
    const cdp = target.cdp = await connect(page.webSocketDebuggerUrl);
    const requests = new Map();
    cdp.onEvent(message => {
      const event = message.params;
      if (message.method === 'Runtime.exceptionThrown') record.errors.push({ type: 'exception', message: event.exceptionDetails.exception?.description || event.exceptionDetails.text });
      if (message.method === 'Log.entryAdded' && event.entry.level === 'error') record.errors.push({ type: 'log', message: event.entry.text });
      if (message.method === 'Runtime.consoleAPICalled' && event.type === 'error')
        record.errors.push({ type: 'console', message: event.args.map(arg => arg.value ?? arg.description).join(' ') });
      if (message.method === 'Network.responseReceived') requests.set(event.requestId, {
        url: event.response.url, status: event.response.status, mimeType: event.response.mimeType,
        fromDiskCache: event.response.fromDiskCache || false, fromServiceWorker: event.response.fromServiceWorker || false,
      });
      if (message.method === 'Network.loadingFinished') {
        const request = requests.get(event.requestId);
        if (request) { request.encodedDataLength = event.encodedDataLength; record.requests.push(request); requests.delete(event.requestId); }
      }
      if (message.method === 'Network.loadingFailed' && !event.canceled)
        record.errors.push({ type: 'network', message: event.errorText, requestId: event.requestId });
    });
    for (const method of ['Runtime.enable', 'Page.enable', 'Log.enable', 'Network.enable', 'Performance.enable']) await cdp.send(method);
    record.nativeScreenBeforeEmulation = await cdp.evaluate('({dpr:devicePixelRatio,screen:[screen.width,screen.height],viewport:[innerWidth,innerHeight]})');
    assert.equal(record.nativeScreenBeforeEmulation.dpr, expectedDPR, 'Host Chrome must already use actual DPR 2 before emulation');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: test.width, height: test.height, deviceScaleFactor: record.nativeScreenBeforeEmulation.dpr, mobile: false,
    });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Page.bringToFront');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installTextureAudit.toString()})();(${installReadinessObserver.toString()})(${JSON.stringify(test.preset)});window.__nativeAuditReadMetadata=${readMetadata.toString()};`,
    });
    const navigationStarted = Date.now();
    await cdp.send('Page.navigate', { url: gameURL });
    async function waitFor(expression, timeoutMs = 240000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await cdp.evaluate(expression)) return;
        if (record.errors.some(error => error.type === 'exception')) throw Error(JSON.stringify(record.errors));
        await sleep(500);
      }
      throw Error(`Timed out: ${expression}; UI: ${await cdp.evaluate('document.body.innerText.slice(0,1000)')}`);
    }
    await waitFor('window.__nativeAuditTiming?.graphicsReadyAtMs !== null && window.__nativeAuditTiming?.graphicsReadyAtMs !== undefined');
    record.startup = await cdp.evaluate('({...window.__nativeAuditTiming,timeOrigin:performance.timeOrigin})');
    record.startup.navigationToObservedReadyWallMs = Date.now() - navigationStarted;
    record.renderer = await cdp.evaluate(`(()=>{const gl=document.querySelector('#viewport canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION)}})()`);
    assert.ok(!/swiftshader|llvmpipe|software rasterizer/i.test(record.renderer.renderer), 'Software rendering is not a native GPU audit');
    assert.ok(record.renderer.renderer.toLowerCase().includes(expectedRenderer.toLowerCase()), `Expected native renderer containing: ${expectedRenderer}`);
    console.log(`${name} graphics ready after ${(record.startup.graphicsReadyAtMs / 1000).toFixed(2)} s; ${record.renderer.renderer}`);
    record.ready = await cdp.evaluate('window.__nativeAuditReadMetadata()'); verifyMetadata(record.ready, test);
    await cdp.evaluate(`document.querySelector('#nickname').value=${JSON.stringify(`Native${test.preset[0]}${test.width}${Date.now() % 100000}`)};document.querySelector('#join').click()`);
    await waitFor('document.querySelector("#disconnect") && !document.querySelector("#disconnect").disabled', 30000);
    // Observe spawn once per second at most; this getter deep-copies game state.
    const spawnDeadline = Date.now() + 30000;
    while (true) {
      await sleep(1000);
      const spawned = await cdp.evaluate('window.__poc.self.spawned');
      if (spawned) break;
      assert.ok(Date.now() < spawnDeadline, 'Player did not spawn');
    }
    await cdp.evaluate('document.querySelector("#viewport canvas").focus()');
    if (referenceGuard) {
      record.referenceIsolation = { targetId: referenceGuard.targetId, beforeWarmup: await referenceGuard.freeze() };
      save();
    }
    await sleep(warmupMs);
    async function phase(label, durationMs, walking = false) {
      const before = await cdp.evaluate('window.__nativeAuditReadMetadata()'); verifyMetadata(before, test);
      const metricsBefore = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
      if (walking) await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
      let sample;
      try { sample = await cdp.evaluate(`(${sampleFrames.toString()})(${durationMs})`, durationMs + 45000); }
      finally {
        if (walking) await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
      }
      const metricsAfter = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
      // Keep boundary metadata spaced from the final periodic observation.
      await sleep(1000);
      const after = await cdp.evaluate('window.__nativeAuditReadMetadata()'); verifyMetadata(after, test);
      sample.metadata.forEach(row => verifyMetadata(row, test));
      const summary = summarize(sample, [before, after]);
      summary.browserPerformance = {
        elapsedSeconds: metricsAfter.Timestamp - metricsBefore.Timestamp,
        cumulativeSeconds: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']
          .map(name => [name, metricsAfter[name] - metricsBefore[name]])),
        jsHeapUsedBytesAfter: metricsAfter.JSHeapUsedSize,
        interpretation: 'Main-thread counters bracket sampling; they are not direct GPU timings',
      };
      if (walking) summary.distanceMetres = Math.hypot(...after.self.position.map((value, i) => value - before.self.position[i]));
      record[label] = { ...summary, before, after, samples: sample };
      console.log(`${name} ${label}: ${summary.medianFPS.toFixed(2)} median FPS; p95 ${summary.p95FrameMs.toFixed(2)} ms; ${summary.stallsOver50Ms} stalls >50 ms; ${(summary.maxSampledTextureStorageBytes / 1048576).toFixed(2)} MiB textures`);
      save();
      return after;
    }
    const afterIdle = await phase('idle', idleMs);
    if (referenceGuard) await referenceGuard.check(record.referenceIsolation, 'afterIdle');
    // A short real walk down the spawn street uses regular input only. Avoid
    // walking if another server controller put this new player into a vehicle.
    if (afterIdle.self.mode === 'onFoot' && Math.abs(afterIdle.self.position[0]) < 12 && Math.abs(afterIdle.self.position[1]) < 35) {
      await sleep(1000);
      await phase('walking', walkingMs, true);
      if (referenceGuard) await referenceGuard.check(record.referenceIsolation, 'afterWalking');
      assert.ok(record.walking.distanceMetres > 1, 'Real walking input must move the player');
    } else record.walking = { skipped: true, reason: 'New player was outside the safe spawn street or was not on foot', self: afterIdle.self };
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, 180000);
    writeFileSync(path.join(dir, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
    record.screenshot = `${name}.png`;
    record.textureAllocations = await cdp.evaluate('window.__textureAudit');
    record.networkEncodedDataLength = record.requests.reduce((sum, request) => sum + (request.encodedDataLength || 0), 0);
    const summaries = [record.idle, record.walking].filter(summary => !summary.skipped);
    record.budgetResults = {
      downloads: summaries.every(summary => summary.maxSampledDownloadBytes <= records.budgets.downloadBytes),
      triangles: summaries.every(summary => summary.maxSampledTriangles <= records.budgets.triangles),
      drawCalls: summaries.every(summary => summary.maxSampledCalls <= records.budgets.drawCalls),
      existing320MiBTextureReference: summaries.every(summary => summary.maxSampledTextureStorageBytes <= records.budgets.textureStorageBytes),
      target60FPS: record.walking.skipped ? null : summaries.every(summary => summary.target.achieved),
      browserErrors: record.errors.length === 0,
    };
    record.complete = true;
  } catch (error) {
    record.failure = error.stack || String(error); records.errors.push({ case: name, error: record.failure });
    console.error(`${name}: ${error.message}`);
  } finally { await closeOwned(target); save(); }
}

try {
  records.localBefore = localInputs(); records.servedBefore = await servedInputs(); save();
  const version = await (await fetch(`${debugURL}/json/version`)).json();
  records.browserEndpointVersion = version;
  browser = await connect(version.webSocketDebuggerUrl);
  records.browserVersion = await browser.send('Browser.getVersion');
  records.systemInfo = await browser.send('SystemInfo.getInfo').catch(error => ({ unavailable: error.message }));
  if (referenceTargetId !== undefined) {
    referenceGuard = await openReferenceGuard(referenceTargetId);
    records.referenceInitial = referenceGuard.initial; save();
  }
  for (const test of cases) await runCase(test);
  records.localAfter = localInputs(); records.servedAfter = await servedInputs();
  assert.deepEqual(records.localAfter, records.localBefore, 'Local source or assets changed during the audit');
  assert.deepEqual(records.servedAfter, records.servedBefore, 'Served browser or scene changed during the audit');
  records.complete = records.cases.every(record => record.complete);
  records.walkingSamplesCompleted = records.cases.filter(record => record.walking && !record.walking.skipped).length;
  records.allTargets60FPS = records.complete && records.cases.every(record => record.budgetResults.target60FPS === true);
  records.finishedAt = new Date().toISOString();
  console.log(`Native rendering audit ${records.complete ? 'complete' : 'incomplete'}; 60 FPS target ${records.allTargets60FPS ? 'met' : 'not met'}; evidence: ${dir}`);
  if (!records.complete || records.cases.some(record => !record.budgetResults.browserErrors || !record.budgetResults.downloads || !record.budgetResults.triangles || !record.budgetResults.drawCalls)) process.exitCode = 1;
} catch (error) {
  records.errors.push({ error: error.stack || String(error) }); process.exitCode = 1; console.error(error);
} finally {
  for (const target of owned) await closeOwned(target);
  // Closing an owned window can reactivate the reference. Freeze it after all
  // owned windows have gone, and detach only this guard's CDP connection.
  if (referenceGuard) {
    try { records.referenceFinalFrozen = await referenceGuard.freeze(); }
    catch (error) {
      records.errors.push({ referenceCleanup: error.stack || String(error) });
      records.complete = false; records.allTargets60FPS = false; process.exitCode = 1;
    } finally { referenceGuard.close(); }
  }
  browser?.close(); save();
}
