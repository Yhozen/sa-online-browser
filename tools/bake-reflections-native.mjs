// SPDX-License-Identifier: GPL-3.0-or-later
// Bake the running local fixture on the host GPU. Uses a dedicated Chrome target;
// it neither joins the server nor reads or closes any existing browser tabs.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene } from '../packages/shared/scene.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debugURL = process.env.POC_CHROME_DEBUG_URL || 'http://127.0.0.1:9333';
const gameURL = process.env.POC_BAKE_URL || 'http://127.0.0.1:3000';
for (const address of [debugURL, gameURL]) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname))
    throw Error('Native asset baking requires loopback game and Chrome endpoints.');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Include the complete browser entry graph, scene loader, and build configuration.
// New rendering helpers must be listed here and in the provisioned bake tool.
const sourceFiles = [
  'apps/browser/index.html', 'apps/browser/vite.config.ts',
  'apps/browser/src/bootstrap.ts', 'apps/browser/src/style.css',
  'apps/browser/src/main.ts', 'apps/browser/src/graphics.ts',
  'apps/browser/src/antialias.ts', 'apps/browser/src/assets.ts',
  'apps/browser/src/lighting.ts', 'apps/browser/src/environment.ts',
  'apps/browser/src/surface-textures.ts', 'apps/browser/src/surface-pixels.ts',
  'apps/browser/src/surface-lighting.ts',
  'apps/browser/src/foliage-mips.ts', 'apps/browser/src/reflection-storage.ts',
  'apps/browser/src/garden.ts', 'apps/browser/src/horizon.ts',
  'assets/horizon-relief.json',
  'apps/browser/src/road-detail.ts', 'apps/browser/src/verges.ts',
  'apps/browser/src/ground-cover.ts',
  'apps/browser/src/warmup.ts', 'apps/browser/src/characters.ts',
  'apps/browser/src/character-animation.ts', 'apps/browser/src/shadows.ts',
  'apps/browser/src/camera.ts', 'apps/browser/src/collision.ts',
  'apps/browser/src/gateway.ts', 'apps/browser/src/hud.ts',
  'apps/browser/src/simulation-clock.ts', 'apps/browser/src/interpolated-pose.ts',
  'apps/browser/src/snapshot-pose.ts', 'packages/shared/protocol.ts',
  'packages/shared/scene.ts', 'packages/shared/scene.mjs',
  'packages/shared/scenes/neighborhood.json', 'packages/shared/scenes/yard.json',
  'services/gateway/server.mjs', 'tools/asset-inventory.mjs',
  'tools/bake-reflections-native.mjs', 'package.json', 'package-lock.json',
];
const inventoryFile = 'apps/browser/public/assets/inventory.json';
function snapshotLocalInputs() {
  const inventoryBytes = readFileSync(path.join(root, inventoryFile));
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  if (inventory.version !== 1 || !inventory.files)
    throw Error('Unrecognized asset inventory; rebuild assets before baking.');
  const sources = Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(path.join(root, file)))]));
  const inputs = Object.fromEntries(Object.entries(inventory.files)
    .filter(([name]) => name !== 'arroyo-reflections.pmrem.gz')
    .sort(([a], [b]) => a.localeCompare(b)));
  for (const [name, expected] of Object.entries(inputs)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw Error('Invalid asset inventory filename: ' + name);
    const bytes = readFileSync(path.join(root, 'apps/browser/public/assets', name));
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256)
      throw Error('Asset differs from its inventory before publication: ' + name + '. Rebuild inventory and restart the gateway.');
    Object.freeze(expected);
  }
  return Object.freeze({
    inventorySha256: hash(inventoryBytes),
    sources: Object.freeze(sources),
    inputs: Object.freeze(inputs),
  });
}
function assertLocalInputsUnchanged(frozen) {
  const current = snapshotLocalInputs();
  if (current.inventorySha256 !== frozen.inventorySha256)
    throw Error('Asset inventory changed during reflection capture; repeat with stable inputs.');
  for (const [file, expected] of Object.entries(frozen.sources))
    if (current.sources[file] !== expected)
      throw Error('Bake source changed during reflection capture: ' + file);
}
async function readServedScene() {
  const response = await fetch(gameURL + '/scene', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Scene metadata unavailable for reflection provenance (HTTP ' + response.status + ').');
  const serialized = await response.text();
  const scene = JSON.parse(serialized);
  if (scene.id !== 'neighborhood') throw Error('Static neighborhood reflection baking requires the neighborhood fixture.');
  return Object.freeze({
    scene: Object.freeze({ id: scene.id, revision: scene.revision }),
    sha256: hash(serialized),
  });
}
async function snapshotServedBuild() {
  const files = {}, pending = ['/'];
  while (pending.length) {
    const file = pending.pop();
    if (files[file]) continue;
    const response = await fetch(new URL(file, gameURL), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Browser build unavailable: ' + file);
    const bytes = Buffer.from(await response.arrayBuffer());
    files[file] = { bytes: bytes.length, sha256: hash(bytes) };
    // Docker development keeps dist in the container; record its actual HTTP
    // payloads. A native build also permits checking the local products.
    const localFile = path.join(root, 'apps/browser/dist', file === '/' ? 'index.html' : file.replace(/^\//, ''));
    if (existsSync(path.join(root, 'apps/browser/dist')) && hash(readFileSync(localFile)) !== files[file].sha256)
      throw Error('The served browser bundle differs from local dist: ' + file);
    for (const match of bytes.toString('utf8').matchAll(/["'\x60]((?:\/assets\/|\.\/)[^"'\x60]+\.(?:js|css))["'\x60]/g)) {
      const dependency = new URL(match[1], new URL(file, gameURL)).pathname;
      if (!files[dependency]) pending.push(dependency);
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
// Snapshot before creating the Chrome target: opening that URL starts the bake.
const frozenInputs = snapshotLocalInputs();
const frozenScene = await readServedScene();
const frozenBuild = await snapshotServedBuild();
if (hash(JSON.stringify(loadScene(frozenScene.scene.id))) !== frozenScene.sha256)
  throw Error('The running gateway scene/inventory differs from this checkout. Rebuild the browser and restart the gateway before baking.');
assertLocalInputsUnchanged(frozenInputs);
const inputSnapshot = Object.freeze({
  capturedAt: new Date().toISOString(),
  sceneSha256: frozenScene.sha256,
  inventorySha256: frozenInputs.inventorySha256,
});
async function assertInputsUnchanged(stage) {
  const served = await readServedScene();
  if (served.sha256 !== frozenScene.sha256)
    throw Error('Served scene changed ' + stage + '; repeat the reflection bake.');
  if (JSON.stringify(await snapshotServedBuild()) !== JSON.stringify(frozenBuild))
    throw Error('Served browser bundle changed ' + stage + '; repeat the reflection bake.');
  // Re-read local inputs after the awaited HTTP check, immediately before
  // publication when called below. Untracked asset edits also fail their hashes.
  assertLocalInputsUnchanged(frozenInputs);
}
const health = () => fetch(`${gameURL}/health`).then(r => r.json());
const before = await health();
if (before.workers || before.sessions) throw Error('Leave all local game sessions before baking the static environment.');
const url = new URL(gameURL); url.searchParams.set('bake-reflections', '1');
const target = await (await fetch(`${debugURL}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map(), errors = [], temporary = [];
let next = 0;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message); pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Chrome timeout: ${method}`)); }, 60000);
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  await call('Runtime.enable'); await call('Log.enable');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Page.bringToFront');
  // Query completion without serializing the multi-megabyte atlas on each poll.
  const deadline = Date.now() + 240000;
  while (!await evaluate('typeof window.__reflectionBake === "string"')) {
    if (errors.length) throw Error(errors.join('\n'));
    if (Date.now() > deadline) throw Error(`Reflection capture timed out: ${await evaluate('document.body.innerText')}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const encoded = await evaluate('window.__reflectionBake');
  const renderedScene = await evaluate('window.__poc?.scene');
  if (renderedScene?.id !== frozenScene.scene.id || renderedScene?.revision !== frozenScene.scene.revision)
    throw Error('The capture page rendered a different scene revision than the frozen gateway inputs.');
  await assertInputsUnchanged('during capture');
  const maximum = 32 * 1024 * 1024;
  if (encoded.length > Math.ceil(maximum / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
    throw Error('Reflection capture returned malformed or oversized base64.');
  const compressed = Buffer.from(encoded, 'base64');
  if (compressed.toString('base64') !== encoded || compressed.length > maximum) throw Error('Noncanonical reflection payload.');
  const raw = gunzipSync(compressed, { maxOutputLength: maximum });
  if (raw.length < 12 || raw.readUInt32LE(0) !== 0x31524d50) throw Error('Missing PMR1 header.');
  const width = raw.readUInt32LE(4), height = raw.readUInt32LE(8);
  if (height < 64 || height > 2048 || height & (height - 1) || width !== height / 4 * 3 || raw.length !== 12 + width * height * 8)
    throw Error('Invalid reflection atlas dimensions.');
  let lit = 0, peak = 0;
  for (let i = 12; i < raw.length; i += 2) {
    const half = raw.readUInt16LE(i), exponent = half >> 10 & 31, mantissa = half & 1023;
    if (exponent === 31 || (half & 0x8000 && half & 0x7fff)) throw Error('Invalid reflection radiance.');
    if ((i - 12) % 8 < 6) {
      const value = exponent ? (1 + mantissa / 1024) * 2 ** (exponent - 15) : mantissa * 2 ** -24;
      peak = Math.max(peak, value); if (value > 0) lit++;
    }
  }
  if (lit < width * height || peak > 32) throw Error(`Implausible static reflection energy: ${peak}`);
  const after = await health();
  if (after.workers || after.sessions) throw Error('A player joined during the static capture; repeat with an empty fixture.');
  if (errors.length) throw Error(errors.join('\n'));
  const renderer = await evaluate(`(()=>{const gl=document.querySelector('#viewport canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()`);
  const browser = await call('Browser.getVersion');
  const metadata = {
    version: 1, generatedAt: new Date().toISOString(), format: 'PMR1: uint32-le magic,width,height; RGBA16F PMREM atlas; gzip',
    width, height, compressedBytes: compressed.length, uncompressedBytes: raw.length,
    sha256: hash(compressed), uncompressedSha256: hash(raw), browser: browser.product, renderer, peakRadiance: peak,
    scene: { id: frozenScene.scene.id, revision: frozenScene.scene.revision },
    inputSnapshot,
    sources: frozenInputs.sources,
    servedBuild: frozenBuild,
    inputs: frozenInputs.inputs,
    network: { playerJoins: 0, workers: after.workers, sessions: after.sessions },
  };
  const products = [
    ['apps/browser/public/assets/arroyo-reflections.pmrem.gz', compressed],
    ['assets/source/reflection-bake.json', JSON.stringify(metadata, null, 2) + '\n'],
  ].map(([file, bytes]) => ({ file: path.join(root, file), bytes }));
  // Finish both temporary products before the last guard. No output is replaced
  // if any authoring input, asset, inventory, or served scene changed mid-capture.
  for (const { file, bytes } of products) {
    mkdirSync(path.dirname(file), { recursive: true });
    const staged = file + '.' + process.pid + '.tmp'; temporary.push(staged); writeFileSync(staged, bytes);
  }
  await assertInputsUnchanged('before publication');
  for (let i = 0; i < products.length; i++) renameSync(temporary[i], products[i].file);
  const result = spawnSync(process.execPath, ['tools/asset-inventory.mjs'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Asset inventory update failed.');
  console.log(JSON.stringify({ width, height, compressedBytes: compressed.length, peakRadiance: peak, renderer }, null, 2));
  console.log('Rebuild the browser and restart the gateway to serve the updated asset revision.');
} finally {
  socket.close();
  await fetch(`${debugURL}/json/close/${target.id}`).catch(() => {});
  for (const path of temporary) rmSync(path, { force: true });
}
