// SPDX-License-Identifier: GPL-3.0-or-later
import { visualBudgets as budget } from "./visual-budgets.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const dir = "artifacts/verification";
const read = (name) => JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
const results = read("results.json"),
  soak = read("soak.json"),
  observations = read("server-observations.json"),
  agreements = read("position-agreements.json"),
  errors = read("browser-errors.json");
const supervisor = read("supervisor.json");
if (
  !supervisor.normalWorkerSpawn ||
  !supervisor.allSupervisedProcessesExited ||
  supervisor.exitCode !== 0
)
  throw new Error("Demo supervisor verification did not pass.");
const interrupt = read("supervisor-sigint.json");
if (
  !interrupt.normalWorkerSpawn ||
  !interrupt.allSupervisedProcessesExited ||
  interrupt.exitCode !== 0
)
  throw new Error("Demo Ctrl+C verification did not pass.");
if (
  results.stats.unexpected ||
  results.stats.interrupted ||
  results.stats.skipped ||
  soak.durationMs < 600000 ||
  !agreements.length ||
  errors.some((x) => x.errors.length)
)
  throw new Error("Acceptance evidence is incomplete or failing.");
const cases = [];
function visit(suite) {
  for (const spec of suite.specs || [])
    for (const test of spec.tests || [])
      cases.push({
        title: spec.title,
        status: test.status,
        durationMs: test.results.reduce((n, x) => n + x.duration, 0),
      });
  for (const child of suite.suites || []) visit(child);
}
for (const suite of results.suites) visit(suite);
if (cases.length !== 15 || cases.some((x) => x.status !== "expected"))
  throw new Error("All yard, graphics and neighborhood scenarios must pass.");
const active = new Map(),
  cycles = [];
for (const event of observations) {
  if (event.event === "connect") active.set(event.player, event.name);
  if (event.event === "disconnect") {
    const name = active.get(event.player);
    if (name?.startsWith("BrowserCycle_")) cycles.push(name);
    active.delete(event.player);
  }
}
if (new Set(cycles).size !== 20)
  throw new Error("Twenty observed server slot releases are required.");
const neighborhoodPerformance = JSON.parse(
  readFileSync("artifacts/neighborhood/performance.json"),
);
const residentRejoins = JSON.parse(
  readFileSync("artifacts/neighborhood/resident-rejoins.json"),
);
if (
  neighborhoodPerformance.recording !== false ||
  neighborhoodPerformance.metrics.some(
    (m) =>
      m.renderScale !== 1 ||
      m.renderSize[0] !== m.viewport[0] ||
      m.renderSize[1] !== m.viewport[1] ||
      !Number.isFinite(m.medianFPS) || m.medianFPS <= 0 ||
      !Number.isFinite(m.p95FrameMs) ||
      !Number.isFinite(m.textureStorageBytes) ||
      m.textureStorageBytes >= budget.textureStorageBytes,
  ) ||
  residentRejoins.length !== 20
)
  throw Error(
    "Neighborhood performance or resident lifecycle evidence incomplete",
  );
const neighborhoodSoak = JSON.parse(
  readFileSync("artifacts/neighborhood/soak.json"),
);
const neighborhoodRoutes = JSON.parse(
  readFileSync("artifacts/neighborhood/routes.json"),
);
const neighborhoodCycles = JSON.parse(
  readFileSync("artifacts/neighborhood/cycles.json"),
);
const neighborhoodAgreements = JSON.parse(
  readFileSync("artifacts/neighborhood/agreements.json"),
);
const neighborhoodErrors = JSON.parse(
  readFileSync("artifacts/neighborhood/errors.json"),
);
if (
  neighborhoodSoak.durationMs < 600000 ||
  neighborhoodRoutes.length !== 2 ||
  neighborhoodCycles.cycles !== 20 ||
  !neighborhoodAgreements.length ||
  neighborhoodErrors.length
)
  throw Error("Neighborhood acceptance evidence incomplete");
const sourceFiles = [
  "apps/browser/src/main.ts",
  "apps/browser/src/bootstrap.ts",
  "apps/browser/src/graphics.ts",
  "services/gateway/server.mjs",
  "native/worker.cpp",
  "tools/setup-protocol.py",
  "test-server/poc.pwn",
  "test-server/arena.json",
  "tests/browser/poc.spec.mjs",
  "tests/browser/graphics.spec.mjs",
  "tools/browser-options.mjs",
  "tools/open-browser.mjs",
  "playwright.config.mjs",
  "tools/dev.mjs",
  "tools/verify-supervisor.py",
  "package-lock.json",
  "apps/browser/src/assets.ts",
  "apps/browser/src/environment.ts",
  "apps/browser/src/characters.ts",
  "apps/browser/src/collision.ts",
  "apps/browser/src/camera.ts",
  "apps/browser/src/hud.ts",
  "apps/browser/src/shadows.ts",
  "apps/browser/src/antialias.ts",
  "apps/browser/src/simulation-clock.ts",
  "tests/simulation-clock.test.mjs",
  "tests/character-animation.test.mjs",
  "tests/foliage-mips.test.mjs",
  "apps/browser/src/lighting.ts",
  "apps/browser/src/warmup.ts", "apps/browser/src/foliage-mips.ts", "apps/browser/src/character-animation.ts",
  "apps/browser/src/reflection-storage.ts",
  "tools/bake-reflections.mjs",
  "tests/reflection.test.mjs",
  "apps/browser/src/horizon.ts",
  "apps/browser/src/road-detail.ts",
  "apps/browser/src/verges.ts",
  "apps/browser/src/surface-textures.ts",
  "tools/assets/environment-kit.py",
  "tools/assets/heroes.py",
  "tests/assets.test.mjs", "tests/verges.test.mjs",
  "tools/visual-budgets.mjs",
  "packages/shared/scenes/neighborhood.json",
  "apps/browser/public/assets/inventory.json",
  "tests/browser/neighborhood.spec.mjs",
  "tools/texture-audit.mjs",
  "tools/verify-desktop.mjs",
  "tools/create-scenes.mjs",
  "tools/build-assets.mjs",
  "tools/assets/build.py",
  "packages/shared/scene.mjs",
  "tools/setup-runtime.py",
  "packages/shared/scenes/yard.json",
  "apps/browser/src/style.css",
  "package.json",
];
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const summary = {
  verifiedAt: new Date().toISOString(),
  command: "npm run verify:poc",
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    chromium: execFileSync(chromium.executablePath(), ["--version"], {
      encoding: "utf8",
    }).trim(),
    headed: process.env.POC_HEADLESS !== "1",
    rendering: "SwiftShader under Xvfb; functional rendering only",
  },
  upstream: JSON.parse(readFileSync("test-server/manifest.json")).openmp,
  browserScenarios: cases,
  durationMs: results.stats.duration,
  normalPlayers: observations
    .filter(
      (x) => x.event === "connect" && ["Proof_A", "Proof_B"].includes(x.name),
    )
    .map(({ name, player, npc }) => ({ name, player, npc })),
  browserCyclesReleased: [...new Set(cycles)].length,
  sustainedSession: soak,
  neighborhood: {
    performance: neighborhoodPerformance,
    residentRejoins,
    sustainedSession: {
      durationMs: neighborhoodSoak.durationMs,
      rounds: neighborhoodSoak.rounds,
      metrics: neighborhoodSoak.metrics,
    },
    routes: neighborhoodRoutes,
    cycles: neighborhoodCycles,
    positionChecks: {
      count: neighborhoodAgreements.length,
      maxServerDistance: Math.max(
        ...neighborhoodAgreements.map((x) => x.serverDistance),
      ),
      maxPeerDistance: Math.max(
        ...neighborhoodAgreements.map((x) => x.peerDistance),
      ),
    },
    errors: neighborhoodErrors,
  },
  demoSupervisor: { termination: supervisor, keyboardInterrupt: interrupt },
  positionChecks: {
    count: agreements.length,
    maxDistance: Math.max(...agreements.map((x) => x.distance)),
    maxSampleAgeMs: Math.max(
      ...agreements.map((x) => x.checkedAt - x.serverSampleAt),
    ),
    requiredDistance: 0.5,
    deadlineMs: 1000,
  },
  uncaughtBrowserErrors: errors.flatMap((x) => x.errors),
  testedSourceSha256: Object.fromEntries(
    sourceFiles.map((file) => [file, hash(file)]),
  ),
  nativeWorkerSha256: hash("native/build/poc-worker"),
  evidence: [
    "results.json",
    "server-observations.json",
    "position-agreements.json",
    "browser-errors.json",
    "soak.json",
    "walking-chat.png",
    "driver-passenger.png",
    "wall-exit.png",
    "soak-complete.png",
    "report/",
    "videos/",
    "*.zip",
  ],
  unverified: [
    "original GTA clients",
    "original SA-MP servers",
    "public servers",
    "non-Chromium browsers",
    "hardware GPU performance",
    "WAN behavior",
    "GTA assets and realistic physics",
    "full legacy protocol coverage",
  ],
};
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(
  `Acceptance recorded: ${cases.length} scenarios, ${cycles.length} reconnects, ${soak.rounds} active rounds over ${(soak.durationMs / 1000).toFixed(1)} seconds.`,
);
