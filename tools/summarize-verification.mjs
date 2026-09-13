// SPDX-License-Identifier: GPL-3.0-or-later
import { visualBudgets as budget } from "./visual-budgets.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { acceptanceConnectOptions } from "./browser-options.mjs";
const dir = "artifacts/verification";
const read = (name) => JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
const results = read("results.json"),
  soak = read("soak.json"),
  observations = read("server-observations.json"),
  agreements = read("position-agreements.json"),
  resetAgreements = read("reset-agreements.json"),
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
const soakTitle = cases.find(x => x.title.startsWith("soak:"))?.title;
const resultStart = Date.parse(results.stats.startTime), resultEnd = resultStart + results.stats.duration;
const resetDistance = position => Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)
  ? Math.hypot(position[0], position[1] - 6, position[2] - 10) : Infinity;
if (!Array.isArray(resetAgreements) || !Number.isInteger(soak.rounds) || soak.rounds < 1 ||
  resetAgreements.length !== soak.rounds + 3 ||
  resetAgreements.filter(x => x.scenario === soakTitle).length !== soak.rounds ||
  new Set(resetAgreements.map(x => x.token)).size !== resetAgreements.length ||
  resetAgreements.some(check => {
    const b = check.browser, s = b?.last;
    const reset = observations[check.serverResetIndex], vehicle = observations[check.serverVehicleIndex];
    return check.error || check.cleanupError || typeof check.token !== "string" || !check.token.startsWith("__acceptance_reset_") ||
      !(check.requestedAt >= resultStart && check.retrievedAt >= check.requestedAt && check.retrievedAt <= resultEnd) ||
      check.serverDeadlineMs !== 1000 ||
      !Number.isInteger(check.serverResetIndex) || !Number.isInteger(check.serverVehicleIndex) ||
      check.serverResetIndex < 0 || check.serverVehicleIndex <= check.serverResetIndex ||
      reset?.event !== "reset" || vehicle?.event !== "vehicle" ||
      observations.slice(0, check.serverResetIndex).filter(x => x.event === "reset").length !== check.priorResetCount ||
      JSON.stringify(reset) !== JSON.stringify(check.serverReset) || JSON.stringify(vehicle) !== JSON.stringify(check.serverVehicle) ||
      !(check.serverDistance < 0.5) || check.serverDistance !== resetDistance([vehicle.x, vehicle.y, vehicle.z]) ||
      b?.passed !== true || b.reason !== "fresh-correction-within-deadline" || b.limitMs !== 1000 || b.tolerance !== 0.5 ||
      !Number.isFinite(b.startedAt) || !Number.isFinite(b.epoch) || !Number.isInteger(b.playerId) || !Number.isInteger(b.vehicleId) ||
      !Number.isFinite(b.elapsedMs) || b.elapsedMs < 0 || b.elapsedMs > 1000 ||
      !Number.isInteger(b.sampleCount) || b.sampleCount < 1 ||
      s?.elapsedMs !== b.elapsedMs || s.mode !== "onFoot" || s.fresh !== true ||
      !(s.distance < 0.5) || s.distance !== resetDistance(s.vehiclePosition) ||
      ["selfPosition", "selfHeading", "vehicleState"].some(name =>
        !Number.isInteger(b.baseline?.[name]) || !Number.isInteger(s.counters?.[name]) || s.counters[name] <= b.baseline[name]);
  })) throw new Error("Every reset requires fresh server evidence and browser-local command convergence within 1000 ms and 0.5 m.");
const remoteBrowser = acceptanceConnectOptions() ? read("browser-environment.json") : undefined;
if (remoteBrowser && (
  remoteBrowser.transport !== "remote-playwright-loopback" ||
  !remoteBrowser.chromium || !remoteBrowser.renderer ||
  !(Date.parse(remoteBrowser.capturedAt) >= Date.parse(results.stats.startTime)) ||
  !(Date.parse(remoteBrowser.capturedAt) <= Date.parse(results.stats.startTime) + results.stats.duration)
)) throw new Error("Current remote browser version and WebGL renderer evidence is required.");
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
  "tests/browser/reset-observer.mjs",
  "tests/reset-observer.test.mjs",
  "tools/verify.mjs",
  "tools/summarize-verification.mjs",
  "tests/browser/graphics.spec.mjs",
  "tools/browser-options.mjs",
  "tools/acceptance-browser-server.mjs",
  "tools/acceptance-browser-heartbeat.mjs",
  "tests/acceptance-browser-heartbeat.test.mjs",
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
  "apps/browser/src/interpolated-pose.ts",
  "apps/browser/src/snapshot-pose.ts",
  "tests/simulation-clock.test.mjs",
  "tests/snapshot-pose.test.mjs",
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
  "apps/browser/src/ground-cover.ts",
  "apps/browser/src/surface-weathering.ts",
  "apps/browser/src/garden.ts",
  "apps/browser/src/surface-textures.ts",
  "apps/browser/src/surface-pixels.ts",
  "apps/browser/src/surface-lighting.ts",
  "tests/surface-pixels.test.mjs",
  "tools/assets/environment-kit.py",
  "tools/assets/heroes.py",
  "tools/assets/garden-kit.py",
  "tools/assets/horizon.py",
  "tools/assets/horizon-envelope-v3.py", "tools/assets/horizon-bake.mjs", "tools/assets/horizon-save.py",
  "assets/source/horizon-envelope-v3.json", "assets/source/horizon-envelope-v3.blend",
  "assets/source/horizon-envelope-v3-build.json", "assets/source/horizon-lighting.json", "assets/source/horizon-build.json",
  "assets/horizon-relief.json",
  "assets/source/asset-build.json",
  "tests/assets.test.mjs", "tests/verges.test.mjs",
  "tests/garden.test.mjs", "tests/asset-pipeline.test.mjs",
  "tests/terrain.test.mjs",
  "tests/street-oaks.test.mjs",
  "tests/mature-oak.test.mjs",
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
    chromium: remoteBrowser?.chromium || execFileSync(chromium.executablePath(), ["--version"], {
      encoding: "utf8",
    }).trim(),
    headed: process.env.POC_HEADLESS !== "1",
    rendering: remoteBrowser
      ? `${remoteBrowser.renderer}; remote browser with Linux loopback fixture; functional acceptance only, separate from native FPS audit`
      : "SwiftShader under Xvfb; functional rendering only",
    ...(remoteBrowser ? { browser: remoteBrowser } : {}),
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
  resetChecks: {
    count: resetAgreements.length,
    clock: "browser performance.now from actual trusted reset Enter; immutable verdict retrieved afterward",
    maxElapsedMs: Math.max(...resetAgreements.map(x => x.browser.elapsedMs)),
    maxBrowserDistance: Math.max(...resetAgreements.map(x => x.browser.last.distance)),
    maxServerDistance: Math.max(...resetAgreements.map(x => x.serverDistance)),
    requiredDistance: 0.5,
    deadlineMs: 1000,
    freshness: "same epoch/player/vehicle; fresh selfPosition/selfHeading and generic vehicleState counters; independent fresh server reset/car sample",
  },
  uncaughtBrowserErrors: errors.flatMap((x) => x.errors),
  testedSourceSha256: Object.fromEntries(
    sourceFiles.map((file) => [file, hash(file)]),
  ),
  nativeWorkerSha256: hash("native/build/poc-worker"),
  evidence: [
    "results.json",
    ...(remoteBrowser ? ["browser-environment.json"] : []),
    "server-observations.json",
    "position-agreements.json",
    "reset-agreements.json",
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
