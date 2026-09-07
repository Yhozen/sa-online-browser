// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (!existsSync('native/build/poc-worker') || !existsSync('.runtime/Server/gamemodes/poc.amx')) throw new Error('Run npm run setup:poc first.');
const built = spawnSync('npm', ['run', 'build:browser'], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status || 1);
mkdirSync('.runtime/logs', { recursive: true });
const children = []; let stopping = false;
function launch(name, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: [name === 'server' ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: process.env });
  child.pocName = name;
  child.stdin?.on('error', error => { if (!stopping) console.error(`${name} input: ${error.message}`); });
  const log = createWriteStream(`.runtime/logs/${name}.log`, { flags: 'a' });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.stdout.on('data', chunk => { if (name === 'gateway') process.stdout.write(chunk); });
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  child.on('error', e => { console.error(name, e); shutdown(1); });
  child.on('exit', (code, signal) => { log.end(); if (!stopping) { console.error(`${name} exited: ${code ?? signal}`); shutdown(code || 1); } });
  children.push(child); return child;
}
function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) if (child.exitCode === null) {
    if (child.pocName === 'server' && child.stdin?.writable) child.stdin.write('exit\n');
    else child.kill('SIGTERM');
  }
  const timeout = setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 8000);
  Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('close', resolve))))
    .then(() => { clearTimeout(timeout); rmSync('.runtime/poc-processes.json', { force: true }); process.exit(code); });
}
const server = launch('server', 'python3', ['tools/run-server.py']);
const gateway = launch('gateway', process.execPath, ['services/gateway/server.mjs']);
writeFileSync('.runtime/poc-processes.json', JSON.stringify({ supervisor: process.pid, server: server.pid, gateway: gateway.pid }, null, 2));
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
console.log('Cloud-local PoC: http://127.0.0.1:3000 — open two browser sessions.');
