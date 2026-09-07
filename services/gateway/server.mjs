// SPDX-License-Identifier: GPL-3.0-or-later
import http from 'node:http';
import { loadScene } from '../../packages/shared/scene.mjs';
import { spawn } from 'node:child_process';
import { createReadStream, mkdirSync, appendFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'apps/browser/dist');
const LOG = path.join(ROOT, '.runtime/logs/gateway.jsonl');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
export function validateMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  if (m.type === 'join') return (m.version === undefined || m.version === 1) && typeof m.name === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(m.name);
  if (!Number.isSafeInteger(m.epoch) || m.epoch < 1) return false;
  if (m.type === 'disconnect') return true;
  if (m.type === 'chat' || m.type === 'command') return typeof m.text === 'string' && Buffer.byteLength(m.text) > 0 && Buffer.byteLength(m.text) <= 128 && !/[\x00-\x1f]/.test(m.text);
  if (m.type !== 'state') return false;
  const vector = (v, n, bound) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= bound);
  return Number.isSafeInteger(m.seq) && m.seq >= 0 && Number.isSafeInteger(m.controlRevision) && m.controlRevision >= 0 && vector(m.position, 3, 20000) && vector(m.velocity, 3, 1000) && vector(m.rotation, 4, 1.01)
    && Math.abs(m.rotation.reduce((a, x) => a + x * x, 0) - 1) < 0.1
    && ['onFoot', 'driver', 'passenger'].includes(m.mode) && Number.isInteger(m.keys) && m.keys >= 0 && m.keys <= 65535
    && Number.isInteger(m.vehicleId) && m.vehicleId >= 0 && m.vehicleId <= 1999 && Number.isInteger(m.seat) && m.seat >= -1 && m.seat <= 7;
}
export function createGateway({ port = 3000, host = '127.0.0.1', gameHost = '127.0.0.1', gamePort = 7777, sceneId = process.env.POC_SCENE || 'neighborhood', workerPath = path.join(ROOT, 'native/build/poc-worker') } = {}) {
  const scene = loadScene(sceneId);
  mkdirSync(path.dirname(LOG), { recursive: true });
  let epochCounter = Date.now();
  const sessions = new Map(), workers = new Set();
  function log(type, details = {}) { const line = JSON.stringify({ time: new Date().toISOString(), type, ...details }); appendFileSync(LOG, line + '\n'); console.log(line); }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/scene') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(scene)); return; }
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, sessions: sessions.size, workers: workers.size })); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(DIST, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(DIST + path.sep)) { res.writeHead(403); res.end(); return; }
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not file');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('Not found. Build the browser with npm run build:browser.'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let allowed = req.url === '/ws';
    if (req.headers.origin) { try { const origin = new URL(req.headers.origin); allowed &&= origin.host === req.headers.host; } catch { allowed = false; } }
    if (!allowed || sessions.size >= 8) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const epoch = ++epochCounter;
    let child, output = '', seq = 0, lastInputSeq = -1, cleaned = false, count = 0, windowStart = Date.now();
    let joinTimer = setTimeout(() => finish('Join request timed out.'), 10000);
    function send(m) {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 1024 * 1024) { finish('Browser is too slow; reconnect to resynchronize.'); return; }
      ws.send(JSON.stringify({ ...m, epoch, seq: seq++ }));
    }
    function stopWorker() {
      if (!child || child.exitCode !== null) return;
      child.stdin.end(JSON.stringify({ type: 'disconnect' }) + '\n');
      const timer = setTimeout(() => child.kill('SIGTERM'), 750); timer.unref();
      const force = setTimeout(() => child.kill('SIGKILL'), 2500); force.unref();
      child.once('exit', () => { clearTimeout(timer); clearTimeout(force); });
    }
    function finish(reason) {
      if (cleaned) return;
      cleaned = true; clearTimeout(joinTimer);
      send({ type: 'disconnected', reason });
      stopWorker(); sessions.delete(epoch);
      log('sessionClosed', { epoch, reason });
      ws.close(1000, reason.slice(0, 100));
    }
    sessions.set(epoch, { finish });
    send({ type: 'session', version: 1, scene: {id:scene.id, revision:scene.revision} });
    ws.on('message', raw => {
      if (cleaned) return;
      if (Date.now() - windowStart >= 1000) { count = 0; windowStart = Date.now(); }
      if (++count > 150) { finish('Message rate exceeded.'); return; }
      let m;
      try { m = JSON.parse(raw.toString()); } catch { finish('Invalid JSON.'); return; }
      if (!validateMessage(m)) { finish('Invalid message.'); return; }
      if (m.type === 'join') {
        if (child) { finish('Already joined.'); return; }
        if (m.scene?.id !== scene.id || m.scene?.revision !== scene.revision) { finish('Scene mismatch. Reload this page to load the server neighborhood.'); return; }
        clearTimeout(joinTimer);
        child = spawn(workerPath, ['--host', gameHost, '--port', String(gamePort), '--name', m.name], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        workers.add(child);
        child.once('close', () => workers.delete(child));
        log('workerStarted', { epoch, pid: child.pid, name: m.name });
        send({ type: 'connecting' });
        joinTimer = setTimeout(() => finish('Server did not complete admission.'), 15000);
        child.stdout.on('data', chunk => {
          output += chunk.toString();
          if (output.length > 1024 * 1024) { finish('Invalid worker output.'); return; }
          let end;
          while ((end = output.indexOf('\n')) >= 0) {
            const line = output.slice(0, end); output = output.slice(end + 1);
            let event;
            try { event = JSON.parse(line); } catch { if (line.trim()) log('workerDiagnostic', { epoch, text: line.slice(0, 1024) }); continue; }
            if (event.type === 'spawn') clearTimeout(joinTimer);
            if (event.type === 'error' || event.type === 'disconnected') log('workerStatus', { epoch, event });
            send(event);
            if (event.type === 'disconnected') finish(event.reason || 'Server disconnected.');
          }
        });
        child.stderr.on('data', chunk => log('workerDiagnostic', { epoch, text: chunk.toString().slice(0, 4096) }));
        child.stdin.on('error', () => finish('Worker input closed.'));
        child.once('error', error => finish('Cannot start protocol worker: ' + error.message));
        child.once('exit', (code, signal) => { log('workerExited', { epoch, pid: child.pid, code, signal }); finish('Protocol worker stopped.'); });
        return;
      }
      if (m.epoch !== epoch) return;
      if (m.type === 'disconnect') { finish('Disconnected.'); return; }
      if (!child || !child.stdin.writable) { finish('Join before sending gameplay.'); return; }
      if (m.type === 'state') { if (m.seq <= lastInputSeq) return; lastInputSeq = m.seq; }
      if (child.stdin.writableLength > 256 * 1024) { finish('Protocol worker is too slow.'); return; }
      child.stdin.write(JSON.stringify(m) + '\n');
    });
    ws.on('close', () => finish('Browser connection closed.'));
    ws.on('error', () => finish('Browser connection failed.'));
  });
  return {
    server,
    start: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { log('gatewayReady', { host, port: server.address().port }); resolve(server.address()); }); }),
    close: async () => {
      for (const session of sessions.values()) session.finish('Gateway stopped.');
      const exited = [...workers].map(child => new Promise(resolve => child.once('close', resolve)));
      wss.close(); await new Promise(resolve => server.close(resolve)); await Promise.all(exited);
    },
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gateway = createGateway({ port: Number(process.env.POC_PORT || 3000), gamePort: Number(process.env.POC_GAME_PORT || 7777) });
  await gateway.start();
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await gateway.close(); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
