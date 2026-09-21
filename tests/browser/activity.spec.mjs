// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { createGateway } from "../../services/gateway/server.mjs";
import { loadScene } from "../../packages/shared/scene.mjs";
const URL = "http://127.0.0.1:3340",
  manifest = loadScene("neighborhood"),
  dir = process.env.POC_ACTIVITY_ARTIFACTS || "artifacts/activity";
let gateway,
  server,
  observations = [],
  agreements = [],
  errors = [],
  ready = false;
const sessionTransitions = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (p) => p.evaluate(() => window.__poc);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const latest = (event, id) =>
  observations.findLast(
    (e) => e.event === event && (id === undefined || e.player === id),
  );
test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  server = spawn("python3", ["tools/run-server.py"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, POC_SCENE: "neighborhood", POC_GAME_PORT: "7781" },
  });
  const log = createWriteStream(`${dir}/server.log`);
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let buffer = "";
  server.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.includes("Legacy Network started on")) ready = true;
      const i = line.indexOf("POC {");
      if (i >= 0) {
        try {
          observations.push({
            ...JSON.parse(line.slice(i + 4)),
            receivedAt: Date.now(),
          });
        } catch {}
      }
    }
  });
  await expect.poll(() => ready, { timeout: 20000 }).toBe(true);
  gateway = createGateway({
    port: 3340,
    gamePort: 7781,
    sceneId: "neighborhood",
  });
  await gateway.start();
});
test.afterAll(async () => {
  await gateway?.close();
  if (server?.exitCode === null) {
    const exit = new Promise((r) => server.once("exit", r));
    server.stdin.write("exit\n");
    await Promise.race([
      exit,
      sleep(4000).then(() => {
        if (server.exitCode === null) server.kill("SIGKILL");
      }),
    ]);
  }
  writeFileSync(`${dir}/observations.json`, JSON.stringify(observations));
  writeFileSync(`${dir}/agreements.json`, JSON.stringify(agreements, null, 2));
  writeFileSync(`${dir}/errors.json`, JSON.stringify(errors));
  writeFileSync(`${dir}/session-transitions.json`, JSON.stringify(sessionTransitions, null, 2));
});
async function session(browser, name, recording = true) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...(recording
      ? {
          recordVideo: {
            dir: `${dir}/videos`,
            size: { width: 640, height: 360 },
          },
        }
      : {}),
  });
  await context.addInitScript(() => localStorage.setItem("poc-quality", "low"));
  if (recording)
    await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push({ name, message: e.message }));
  page.on("console", message => {
    if (message.text().startsWith("Arroyo session ended:")) {
      const event = {name, at:Date.now(), reason:message.text()};
      sessionTransitions.push(event);console.log(JSON.stringify(event));
    }
  });
  await page.goto(URL);
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("join").click();
  await expect.poll(async () => (await snap(page)).self.spawned).toBe(true);
  return {
    page,
    context,
    async close() {
      let timer;
      try {
        if (recording) await Promise.race([
          context.tracing.stop({ path: `${dir}/${name}.zip` }),
          new Promise((_, reject) => {timer=setTimeout(() => reject(Error(`Trace flush timed out for ${name}`)),30000);}),
        ]);
      } finally { clearTimeout(timer);await context.close(); }
    },
  };
}
async function focus(p) {
  await p.bringToFront();
  await p.locator("#viewport canvas").focus();
}
async function key(p, k) {
  await focus(p);
  await p.keyboard.press(k);
}
async function move(p, k, ms) {
  await focus(p);
  await p.keyboard.down(k);
  await sleep(ms);
  await p.keyboard.up(k);
}
async function chat(p, text) {
  await p.getByTestId("chat-input").fill(text);
  await p.getByTestId("chat-input").press("Enter");
}
async function mode(p, value) {
  await expect.poll(async () => (await snap(p)).self.mode).toBe(value);
}
async function reset(p) {
  const at = observations.length;
  await chat(p, "/reset");
  await expect
    .poll(() => observations.slice(at).some((e) => e.event === "reset"))
    .toBe(true);
  await mode(p, "onFoot");
  await expect
    .poll(async () =>
      distance(
        (await snap(p)).self.position,
        manifest.spawns[(await snap(p)).self.id % 2],
      ),
    )
    .toBeLessThan(0.5);
}
async function agreement(a, b) {
  const id = (await snap(a)).self.id;
  await expect
    .poll(
      async () => {
        const own = (await snap(a)).self.position,
          other = (await snap(b)).peers.find((p) => p.id === id),
          o = latest("player", id);
        if (!o || !other || Date.now() - o.receivedAt > 1000) return 999;
        const serverDistance = distance(own, [o.x, o.y, o.z]),
          peerDistance = distance(own, other.position);
        if (Math.max(serverDistance, peerDistance) < 0.5)
          agreements.push({
            id,
            at: Date.now(),
            serverSampleAt: o.receivedAt,
            browser: own,
            server: [o.x, o.y, o.z],
            peer: other.position,
            serverDistance,
            peerDistance,
          });
        return Math.max(serverDistance, peerDistance);
      },
      { timeout: 1000, intervals: [100, 100, 200] },
    )
    .toBeLessThan(0.5);
}
async function seats(a, b) {
  await key(a, "e");
  await mode(a, "driver");
  await key(b, "g");
  await mode(b, "passenger");
  await expect
    .poll(
      () =>
        latest(
          "player",
          observations.findLast(
            (e) => e.event === "seatGranted" && e.seat === 0,
          )?.player,
        )?.state,
    )
    .toBe(2);
}

// Feedback controls only ordinary keyboard input; snapshots are read-only observations.
async function driveLoop(driver, passenger, generation) {
  await focus(driver);
  const waypoints = manifest.challenge.checkpoints.map(point => point.slice(0, 2)),
    visited = [];
  const held = new Set();
  async function controls(next) {
    for (const k of held)
      if (!next.has(k)) {
        await driver.keyboard.up(k);
        held.delete(k);
      }
    for (const k of next)
      if (!held.has(k)) {
        await driver.keyboard.down(k);
        held.add(k);
      }
  }
  try {
    for (const goal of waypoints) {
      const deadline = Date.now() + 90000;
      while (true) {
        const current = await snap(driver);
        if (current.activity.state?.phase === "cancelled") throw Error(`Run ${generation} cancelled: ${JSON.stringify(current.activity.state)}`);
        const s = current.self,
          dx = goal[0] - s.position[0],
          dy = goal[1] - s.position[1],
          d = Math.hypot(dx, dy);
        if (d < 1.8) {
          visited.push({
            goal,
            position: s.position,
            server: latest("vehicle"),
          });
          break;
        }
        if (Date.now() > deadline)
          throw Error(
            `Route stalled at ${JSON.stringify(goal)}: ${JSON.stringify(s)}`,
          );
        const desired = Math.atan2(-dx, dy),
          error = Math.atan2(
            Math.sin(desired - s.heading),
            Math.cos(desired - s.heading),
          ),
          speed = Math.hypot(...s.velocity.slice(0, 2));
        const target =
          Math.abs(error) > 0.3 ? 2.6 : Math.min(7, Math.max(2.4, d * 0.65));
        const next = new Set();
        if (speed < target) next.add("w");
        if (error > 0.07) next.add("a");
        if (error < -0.07) next.add("d");
        await controls(next);
        await sleep(100);
      }
      await expect.poll(async () => (await snap(driver)).activity.state?.checkpointIndex, {timeout:5000}).toBe(visited.length);
    }
  } finally {
    await controls(new Set());
  }
  await sleep(1800);
  await agreement(driver, passenger);
  return visited;
}


async function phase(page, value, generation) {
  await expect.poll(async () => {
    const state = (await snap(page)).activity.state;
    return state?.phase === value && (generation === undefined || state.generation === generation);
  }).toBe(true);
  return (await snap(page)).activity.state;
}
async function startRace(driver, passenger, keyboard = false) {
  const generation = (await snap(driver)).activity.state.generation + 1;
  if (keyboard) await key(driver, "r");
  else await driver.getByTestId("race-start").click();
  await phase(driver, "countdown", generation);
  await phase(passenger, "countdown", generation);
  await phase(driver, "running", generation);
  await phase(passenger, "running", generation);
  return generation;
}
async function confirmFinish(a, b, generation) {
  const aState = await phase(a, "finished", generation);
  const bState = await phase(b, "finished", generation);
  const finished = observations.filter(event => event.event === "challengeFinished" && event.generation === generation);
  expect(finished).toHaveLength(1);
  expect(aState.elapsedMs).toBe(finished[0].elapsedMs);
  expect(bState.elapsedMs).toBe(finished[0].elapsedMs);
  const checkpoints = observations.filter(event => event.event === "challengeCheckpoint" && event.generation === generation);
  expect(checkpoints.map(event => event.checkpoint)).toEqual(manifest.challenge.checkpoints.map((_, index) => index + 1));
  expect(checkpoints.every(event => event.player === finished[0].driver)).toBe(true);
  await expect.poll(async () => (await snap(a)).activity.checkpoint).toBe(null);
  await expect.poll(async () => (await snap(b)).activity.checkpoint).toBe(null);
  await expect.poll(async () => (await snap(a)).activity.scores.some(score => score.timeMs === aState.elapsedMs)).toBe(true);
  await expect.poll(async () => (await snap(b)).activity.scores.some(score => score.timeMs === aState.elapsedMs)).toBe(true);
  await expect(a.getByTestId("race-time")).toHaveText(await b.getByTestId("race-time").textContent());
  return { generation, state: aState, observation: finished[0], checkpoints };
}

test("activity: two server-scored laps, crew swap, false starts, corrections and rejoin", async ({ browser }) => {
  test.setTimeout(900000);
  const a = await session(browser, "Loop_A"), b = await session(browser, "Loop_B");
  const results = [];
  try {
    const ids = [(await snap(a.page)).self.id, (await snap(b.page)).self.id];
    expect(new Set(ids).size).toBe(2);
    expect(observations.filter(event => event.event === "connect").every(event => event.npc === 0)).toBe(true);
    // UI activation must keep Enter/Space, instead of leaking into chat/jump.
    const initialZ = (await snap(a.page)).self.position[2];
    await a.page.locator("#race-scores").focus(); await a.page.keyboard.press("Enter");
    await expect(a.page.locator("#race-scores")).toHaveAttribute("aria-expanded", "true");
    await a.page.keyboard.press("Space");
    await expect(a.page.locator("#race-scores")).toHaveAttribute("aria-expanded", "false");
    await a.page.locator("#audio-toggle").focus(); await a.page.keyboard.press("Enter");
    await expect.poll(async () => (await snap(a.page)).audio.preferences.muted).toBe(true);
    await a.page.keyboard.press("Space");
    await expect.poll(async () => (await snap(a.page)).audio.preferences.muted).toBe(false);
    expect((await snap(a.page)).self.position[2]).toBe(initialZ);
    await seats(a.page, b.page);
    // Driver key bit 2 arrives through UDP and produces a normal peer key state.
    await focus(a.page);
    await a.page.keyboard.down("h");
    try {
      await expect.poll(async () => Boolean((await snap(b.page)).peers.find(peer => peer.id === ids[0])?.keys & 2)).toBe(true);
    } finally { await a.page.keyboard.up("h"); }
    await expect.poll(async () => Boolean((await snap(b.page)).peers.find(peer => peer.id === ids[0])?.keys & 2)).toBe(false);
    const stationary = (await snap(a.page)).self.position;
    await move(b.page, "w", 800);
    await move(b.page, "a", 500);
    expect(distance((await snap(a.page)).self.position, stationary)).toBeLessThan(.2);
    expect(latest("vehicle").driver).toBe(ids[0]);
    expect(latest("vehicle").passenger).toBe(ids[1]);
    const first = await startRace(a.page, b.page);
    await a.page.screenshot({ path: `${dir}/countdown-to-first-gate.png` });
    const firstRoute = await driveLoop(a.page, b.page, first);
    results.push({ ...(await confirmFinish(a.page, b.page, first)), route: firstRoute });
    await a.page.screenshot({ path: `${dir}/first-finish.png` });
    await b.page.screenshot({ path: `${dir}/passenger-finish.png` });
    await key(a.page, "f"); await mode(a.page, "onFoot");
    await key(b.page, "f"); await mode(b.page, "onFoot");
    await reset(a.page);
    await seats(b.page, a.page);
    const second = await startRace(b.page, a.page, true);
    const secondRoute = await driveLoop(b.page, a.page, second);
    results.push({ ...(await confirmFinish(b.page, a.page, second)), route: secondRoute });
    await b.page.screenshot({ path: `${dir}/swapped-crew-finish.png` });
    // A fresh attempt must remain stationary until server green.
    await reset(a.page); await seats(a.page, b.page);
    const falseStart = (await snap(a.page)).activity.state.generation + 1;
    await a.page.getByTestId("race-start").click();
    await phase(a.page, "countdown", falseStart);
    await move(a.page, "w", 900);
    expect((await phase(a.page, "cancelled", falseStart)).reason).toBe("left_start");
    await phase(b.page, "cancelled", falseStart);
    expect(observations.some(event => event.event === "challengeFinished" && event.generation === falseStart)).toBe(false);
    await expect(a.page.getByTestId("race-status")).toContainText("before the green light");
    await reset(a.page); await seats(a.page, b.page);
    const exiting = await startRace(a.page, b.page);
    await move(a.page, "s", 900);
    expect((await snap(a.page)).presentation.vehicles[0].reversing).toBeGreaterThan(.5);
    await key(a.page, "f"); await mode(a.page, "onFoot");
    expect((await phase(a.page, "cancelled", exiting)).reason).toBe("driver_exit");
    await phase(b.page, "cancelled", exiting);
    for (const page of [a.page, b.page]) {
      await expect.poll(async () => Math.hypot(...(await snap(page)).vehicles[0].velocity)).toBe(0);
      await expect.poll(async () => (await snap(page)).presentation.vehicles[0].reversing).toBeLessThan(.01);
      await expect.poll(async () => Math.abs((await snap(page)).presentation.vehicles[0].signedSpeed)).toBeLessThan(.01);
    }
    expect(observations.some(event => event.event === "challengeFinished" && event.generation === exiting)).toBe(false);
    // A solo driver's direct G transition has no exitVehicle RPC in between.
    await reset(a.page); await key(a.page, "e"); await mode(a.page, "driver");
    await move(a.page, "s", 900);
    await key(a.page, "g"); await mode(a.page, "passenger");
    for (const page of [a.page, b.page]) {
      await expect.poll(async () => Math.hypot(...(await snap(page)).vehicles[0].velocity)).toBe(0);
      await expect.poll(async () => Math.abs((await snap(page)).presentation.vehicles[0].signedSpeed)).toBeLessThan(.01);
    }
    await reset(a.page); await seats(a.page, b.page);
    const resetting = await startRace(a.page, b.page);
    await reset(b.page);
    expect((await phase(a.page, "cancelled", resetting)).reason).toBe("reset");
    await mode(a.page, "onFoot"); await mode(b.page, "onFoot");
    await agreement(a.page, b.page);
    expect((await snap(a.page)).activity.checkpoint).toBe(null);
    expect((await snap(b.page)).activity.checkpoint).toBe(null);
    expect(distance((await snap(a.page)).self.position, manifest.spawns[ids[0] % 2])).toBeLessThan(.5);
    expect(distance((await snap(b.page)).self.position, manifest.spawns[ids[1] % 2])).toBeLessThan(.5);
    // Explicit disconnect clears local result/marker state, then the new session
    // receives the current server result and session scores through fresh RPCs.
    const disconnectCount = observations.filter(event => event.event === "disconnect").length;
    await a.page.getByTestId("disconnect").click();
    await expect.poll(async () => (await snap(a.page)).self.spawned).toBe(false);
    expect((await snap(a.page)).activity.state).toBe(null);
    expect((await snap(a.page)).activity.checkpoint).toBe(null);
    expect((await snap(a.page)).activity.scores).toEqual([]);
    await expect.poll(() => observations.filter(event => event.event === "disconnect").length).toBe(disconnectCount + 1);
    await a.page.getByTestId("nickname").fill("Loop_Rejoin");
    await a.page.getByTestId("join").click();
    await expect.poll(async () => (await snap(a.page)).self.spawned).toBe(true);
    await phase(a.page, "cancelled", resetting);
    await expect.poll(async () => (await snap(a.page)).activity.scores.length).toBe(2);
    await a.page.locator("#quality").selectOption("standard");
    await a.page.screenshot({ path: `${dir}/standard-activity-plaza.png` });
    const graphics = (await snap(a.page)).graphics;
    writeFileSync(`${dir}/results.json`, JSON.stringify({ results, graphics, tests: ["two normal players", "keyboard activation of records and audio controls", "server-routed horn press/release", "passenger input cannot move car", "two complete ordered laps", "equal server/driver/passenger elapsed result", "driver/passenger role swap", "keyboard race shortcut", "stationary countdown", "false start rejection", "moving driver exit cancellation and parked vehicle feedback", "server reset and .5-unit agreement", "disconnect clears stale activity", "fresh join receives server scores"], errors }, null, 2));
    expect(errors).toEqual([]);
  } finally {
    await a.close(); await b.close();
  }
  await expect.poll(async () => (await (await fetch(`${URL}/health`)).json()).workers).toBe(0);
});
