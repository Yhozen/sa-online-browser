// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const dir = 'artifacts/verification';
const read = name => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
const results = read('results.json'), soak = read('soak.json'), observations = read('server-observations.json'), agreements = read('position-agreements.json'), errors = read('browser-errors.json');
const supervisor = read('supervisor.json');
if (!supervisor.normalWorkerSpawn || !supervisor.allSupervisedProcessesExited || supervisor.exitCode !== 0) throw new Error('Demo supervisor verification did not pass.');
const interrupt = read('supervisor-sigint.json');
if (!interrupt.normalWorkerSpawn || !interrupt.allSupervisedProcessesExited || interrupt.exitCode !== 0) throw new Error('Demo Ctrl+C verification did not pass.');
if (results.stats.unexpected || results.stats.interrupted || results.stats.skipped || soak.durationMs < 600000 || !agreements.length || errors.some(x => x.errors.length)) throw new Error('Acceptance evidence is incomplete or failing.');
const cases = [];
function visit(suite) {
  for (const spec of suite.specs || []) for (const test of spec.tests || []) cases.push({ title: spec.title, status: test.status, durationMs: test.results.reduce((n, x) => n + x.duration, 0) });
  for (const child of suite.suites || []) visit(child);
}
for (const suite of results.suites) visit(suite);
if (cases.length !== 8 || cases.some(x => x.status !== 'expected')) throw new Error('All five multiplayer and three graphics scenarios must pass.');
const active = new Map(), cycles = [];
for (const event of observations) {
  if (event.event === 'connect') active.set(event.player, event.name);
  if (event.event === 'disconnect') { const name = active.get(event.player); if (name?.startsWith('BrowserCycle_')) cycles.push(name); active.delete(event.player); }
}
if (new Set(cycles).size !== 20) throw new Error('Twenty observed server slot releases are required.');
const sourceFiles = ['apps/browser/src/main.ts', 'apps/browser/src/bootstrap.ts', 'apps/browser/src/graphics.ts', 'services/gateway/server.mjs', 'native/worker.cpp', 'tools/setup-protocol.py', 'test-server/poc.pwn', 'test-server/arena.json', 'tests/browser/poc.spec.mjs', 'tests/browser/graphics.spec.mjs', 'tools/browser-options.mjs', 'tools/open-browser.mjs', 'playwright.config.mjs', 'tools/dev.mjs', 'tools/verify-supervisor.py', 'package-lock.json'];
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const summary = {
  verifiedAt: new Date().toISOString(), command: 'npm run verify:poc',
  environment: { node: process.version, platform: process.platform, architecture: process.arch, chromium: execFileSync(chromium.executablePath(), ['--version'], { encoding: 'utf8' }).trim(), headed: process.env.POC_HEADLESS !== '1', rendering: 'SwiftShader under Xvfb; functional rendering only' },
  upstream: JSON.parse(readFileSync('test-server/manifest.json')).openmp,
  browserScenarios: cases, durationMs: results.stats.duration,
  normalPlayers: observations.filter(x => x.event === 'connect' && ['Proof_A', 'Proof_B'].includes(x.name)).map(({ name, player, npc }) => ({ name, player, npc })),
  browserCyclesReleased: [...new Set(cycles)].length,
  sustainedSession: soak,
  demoSupervisor: { termination: supervisor, keyboardInterrupt: interrupt },
  positionChecks: { count: agreements.length, maxDistance: Math.max(...agreements.map(x => x.distance)), maxSampleAgeMs: Math.max(...agreements.map(x => x.checkedAt - x.serverSampleAt)), requiredDistance: 0.5, deadlineMs: 1000 },
  uncaughtBrowserErrors: errors.flatMap(x => x.errors),
  testedSourceSha256: Object.fromEntries(sourceFiles.map(file => [file, hash(file)])),
  nativeWorkerSha256: hash('native/build/poc-worker'),
  evidence: ['results.json', 'server-observations.json', 'position-agreements.json', 'browser-errors.json', 'soak.json', 'walking-chat.png', 'driver-passenger.png', 'wall-exit.png', 'soak-complete.png', 'report/', 'videos/', '*.zip'],
  unverified: ['original GTA clients', 'original SA-MP servers', 'public servers', 'non-Chromium browsers', 'hardware GPU performance', 'WAN behavior', 'GTA assets and realistic physics', 'full legacy protocol coverage'],
};
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(`Acceptance recorded: ${cases.length} scenarios, ${cycles.length} reconnects, ${soak.rounds} active rounds over ${(soak.durationMs / 1000).toFixed(1)} seconds.`);
