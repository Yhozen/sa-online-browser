// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { createGateway } from "../../services/gateway/server.mjs";
import { loadScene } from "../../packages/shared/scene.mjs";
import { installTextureAudit } from "../../tools/texture-audit.mjs";
const URL = "http://127.0.0.1:3300",
  manifest = loadScene("neighborhood"),
  dir = "artifacts/neighborhood";
let gateway,
  server,
  observations = [],
  agreements = [],
  errors = [],
  ready = false;
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
    env: { ...process.env, POC_SCENE: "neighborhood", POC_GAME_PORT: "7779" },
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
    port: 3300,
    gamePort: 7779,
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
  if (recording)
    await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  await context.addInitScript(installTextureAudit);
  page.on("pageerror", (e) => errors.push({ name, message: e.message }));
  await page.goto(URL);
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("join").click();
  await expect.poll(async () => (await snap(page)).self.spawned).toBe(true);
  return {
    page,
    context,
    async close() {
      if (recording) await context.tracing.stop({ path: `${dir}/${name}.zip` });
      await context.close();
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
async function driveLoop(driver, passenger) {
  await focus(driver);
  const waypoints = [
      [0, 9],
      [5, 12],
      [53, 12],
      [58, 7],
      [58, -43],
      [53, -48],
      [5, -48],
      [0, -43],
      [0, 6],
    ],
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
        const s = (await snap(driver)).self,
          dx = goal[0] - s.position[0],
          dy = goal[1] - s.position[1],
          d = Math.hypot(dx, dy);
        if (d < 3) {
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
          Math.abs(error) > 0.3 ? 3.2 : Math.min(8, Math.max(3, d * 0.65));
        const next = new Set();
        if (speed < target) next.add("w");
        if (error > 0.07) next.add("a");
        if (error < -0.07) next.add("d");
        await controls(next);
        await sleep(100);
      }
    }
  } finally {
    await controls(new Set());
  }
  await sleep(1800);
  await agreement(driver, passenger);
  return visited;
}

test("neighborhood: failed assets and scene mismatch never simulate a joined player", async ({
  page,
}) => {
  await page.route("**/assets/house-0.glb", (r) => r.abort());
  await page.goto(URL);
  await expect(page.locator("#retry-assets")).toBeVisible();
  await expect(page.getByTestId("join")).toBeDisabled();
  expect((await snap(page)).self.spawned).toBe(false);
  await page.unroute("**/assets/house-0.glb");
  await page.locator("#retry-assets").click();
  await expect(page.getByTestId("join")).toBeEnabled();
  await page.route("**/scene", async (r) => {
    const response = await r.fetch(),
      json = await response.json();
    json.revision = "old-revision";
    await r.fulfill({ response, json });
  });
  await page.reload();
  await page.getByTestId("nickname").fill("WrongScene");
  await page.getByTestId("join").click();
  await expect(page.getByTestId("status")).toContainText("Scene mismatch");
  expect((await snap(page)).self.spawned).toBe(false);
  expect((await (await fetch(`${URL}/health`)).json()).workers).toBe(0);
});

test("neighborhood: walking, fences, camera, occupants, loop and role swap", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const a = await session(browser, "Arroyo_A"),
    b = await session(browser, "Arroyo_B");
  try {
    await a.page.locator("#quality").selectOption("standard");
    await a.page.screenshot({ path: `${dir}/standard-street.png` });
    await a.page.locator("#quality").selectOption("low");
    await a.page.screenshot({ path: `${dir}/street.png` });
    await move(a.page, "w", 1100);
    const start = (await snap(a.page)).self.position;
    await move(a.page, "a", 5000);
    expect((await snap(a.page)).self.position[0]).toBeLessThan(start[0] - 5);
    expect((await snap(a.page)).self.position[0]).toBeGreaterThan(-16.8);
    await agreement(a.page, b.page);
    // From the front sidewalk, orbit behind the adjacent house; camera must stop at geometry.
    await focus(a.page);
    await a.page.mouse.move(650, 280);
    await a.page.mouse.down({ button: "right" });
    await a.page.mouse.move(960, 280, { steps: 12 });
    await a.page.mouse.up({ button: "right" });
    await a.page.mouse.wheel(0, 1000);
    await sleep(1000);
    expect((await snap(a.page)).graphics.camera.obstruction).toBeLessThan(1);
    await a.page.screenshot({ path: `${dir}/camera-obstruction.png` });
    await reset(a.page);
    await key(a.page, "Space");
    await expect
      .poll(async () => (await snap(a.page)).presentation.self.animation)
      .toBe("jump");
    await sleep(700);
    await a.page.screenshot({ path: `${dir}/pedestrian.png` });
    await chat(a.page, "Arroyo hello");
    await expect
      .poll(
        async () =>
          (await snap(b.page)).chat.filter((m) => m.text === "Arroyo hello")
            .length,
      )
      .toBe(1);
    expect(
      observations.filter(
        (e) => e.event === "chat" && e.text === "Arroyo hello",
      ),
    ).toHaveLength(1);
    await seats(a.page, b.page);
    await expect
      .poll(async () => {
        const s = await snap(b.page);
        return (
          s.presentation.self.visible &&
          s.presentation.self.animation === "seated" &&
          s.presentation.peers.some(
            (p) => p.visible && p.animation === "seated",
          )
        );
      })
      .toBe(true);
    const before = (await snap(a.page)).self.position;
    await move(b.page, "w", 700);
    expect(distance(before, (await snap(a.page)).self.position)).toBeLessThan(
      0.2,
    );
    await a.page.locator("#quality").selectOption("standard");
    await a.page.screenshot({ path: `${dir}/standard-driver.png` });
    await a.page.locator("#quality").selectOption("low");
    await a.page.screenshot({ path: `${dir}/driver.png` });
    await b.page.locator("#quality").selectOption("standard");
    await b.page.screenshot({ path: `${dir}/standard-passenger.png` });
    await b.page.locator("#quality").selectOption("low");
    await b.page.screenshot({ path: `${dir}/passenger.png` });
    const routes = [await driveLoop(a.page, b.page)];
    await key(a.page, "f");
    await key(b.page, "f");
    await mode(a.page, "onFoot");
    await mode(b.page, "onFoot");
    const exit = (await snap(a.page)).self.position;
    await move(a.page, "w", 400);
    expect(distance(exit, (await snap(a.page)).self.position)).toBeGreaterThan(
      0.4,
    );
    await reset(a.page);
    await seats(b.page, a.page);
    routes.push(await driveLoop(b.page, a.page));
    await reset(b.page);
    await agreement(a.page, b.page);
    await agreement(b.page, a.page);
    writeFileSync(`${dir}/routes.json`, JSON.stringify(routes, null, 2));
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test("neighborhood: twenty reconnects release browser workers and server slots", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const s = await session(browser, "ArroyoCycle");
    ids.push((await snap(s.page)).self.id);
    const at = observations.length;
    await s.close();
    await expect
      .poll(async () => {
        const h = await (await fetch(`${URL}/health`)).json();
        return h.workers + h.sessions;
      })
      .toBe(0);
    await expect
      .poll(() =>
        observations
          .slice(at)
          .some((e) => e.event === "disconnect" && e.player === ids.at(-1)),
      )
      .toBe(true);
  }
  writeFileSync(
    `${dir}/cycles.json`,
    JSON.stringify({ cycles: ids.length, ids }),
  );
});

test("neighborhood: ten minute recorded active session", async ({
  browser,
}) => {
  test.setTimeout(680000);
  const a = await session(browser, "ArroyoSoak_A"),
    b = await session(browser, "ArroyoSoak_B"),
    start = Date.now();
  let rounds = 0;
  const perf = [];
  try {
    while (Date.now() - start < 600000) {
      const driver = rounds % 2 ? a.page : b.page,
        passenger = rounds % 2 ? b.page : a.page;
      await reset(driver);
      await move(driver, "w", 300);
      await chat(driver, `Arroyo soak ${rounds}`);
      await seats(driver, passenger);
      await move(driver, "w", 800);
      await sleep(1500);
      await agreement(driver, passenger);
      await agreement(passenger, driver);
      await key(driver, "f");
      await key(passenger, "f");
      rounds++;
      await sleep(3000);
      if (rounds % 5 === 0)
        for (const p of [a.page, b.page]) {
          const s = await snap(p);
          perf.push({
            round: rounds,
            ...s.graphics,
            frameTimes: s.graphics.frameTimes.slice(-60),
          });
        }
    }
    const textureAudits = await Promise.all(
      [a.page, b.page].map((p) => p.evaluate(() => window.__textureAudit)),
    );
    expect(
      textureAudits.flatMap((contexts) =>
        contexts.flatMap((c) => c.unsupported),
      ),
    ).toEqual([]);
    const metrics = [await snap(a.page), await snap(b.page)].map((s, i) => {
      const times = s.graphics.frameTimes.slice(-300).sort((a, b) => a - b);
      return {
        preset: s.graphics.preset,
        viewport: [1280, 720],
        renderScale: s.graphics.renderScale,
        renderSize: s.graphics.renderSize,
        medianFrameMs: times[Math.floor(times.length * 0.5)],
        medianFPS: Number(
          (1000 / times[Math.floor(times.length * 0.5)]).toFixed(1),
        ),
        p95FrameMs: times[Math.floor(times.length * 0.95)],
        triangles: s.graphics.triangles,
        calls: s.graphics.calls,
        ...s.graphics.assets,
        sceneDownloadBytes: s.graphics.sceneDownloadBytes,
        textureStorageBytes: textureAudits[i].reduce((n, c) => n + c.bytes, 0),
      };
    });
    writeFileSync(
      `${dir}/soak.json`,
      JSON.stringify(
        { durationMs: Date.now() - start, rounds, metrics, perf },
        null,
        2,
      ),
    );
    for (const m of metrics) {
      expect(m.triangles).toBeLessThanOrEqual(300000);
      expect(m.calls).toBeLessThanOrEqual(250);
      expect(m.bytes).toBeLessThanOrEqual(15e6);
      expect(m.textureBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    }
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

// Performance is measured without the instrumentation overhead of video and tracing.
// The recorded soak above retains its own metrics, including capture overhead.
test("neighborhood: two active cloud views meet the low graphics budget", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const a = await session(browser, "Bench_A", false),
    b = await session(browser, "Bench_B", false);
  try {
    await sleep(10000);
    const started = Date.now();
    let rounds = 0;
    while (Date.now() - started < 30000) {
      const driver = rounds % 2 ? a.page : b.page,
        passenger = rounds % 2 ? b.page : a.page;
      await reset(driver);
      await seats(driver, passenger);
      await move(driver, "w", 900);
      await sleep(1300);
      await agreement(driver, passenger);
      rounds++;
    }
    const textureAudits = await Promise.all(
      [a.page, b.page].map((p) => p.evaluate(() => window.__textureAudit)),
    );
    expect(
      textureAudits.flatMap((contexts) =>
        contexts.flatMap((c) => c.unsupported),
      ),
    ).toEqual([]);
    const metrics = [await snap(a.page), await snap(b.page)].map((s, i) => {
      const times = s.graphics.frameTimes.slice(-300).sort((a, b) => a - b);
      return {
        preset: s.graphics.preset,
        viewport: [1280, 720],
        renderScale: s.graphics.renderScale,
        renderSize: s.graphics.renderSize,
        medianFrameMs: times[Math.floor(times.length * 0.5)],
        medianFPS: Number(
          (1000 / times[Math.floor(times.length * 0.5)]).toFixed(1),
        ),
        p95FrameMs: times[Math.floor(times.length * 0.95)],
        triangles: s.graphics.triangles,
        calls: s.graphics.calls,
        ...s.graphics.assets,
        sceneDownloadBytes: s.graphics.sceneDownloadBytes,
        textureStorageBytes: textureAudits[i].reduce((n, c) => n + c.bytes, 0),
      };
    });
    writeFileSync(
      `${dir}/performance.json`,
      JSON.stringify(
        {
          recording: false,
          warmupMs: 10000,
          durationMs: Date.now() - started,
          rounds,
          metrics,
        },
        null,
        2,
      ),
    );
    for (const m of metrics) {
      expect(m.medianFPS).toBeGreaterThanOrEqual(20);
      expect(m.p95FrameMs).toBeLessThan(100);
      expect(m.triangles).toBeLessThanOrEqual(300000);
      expect(m.calls).toBeLessThanOrEqual(250);
      expect(m.sceneDownloadBytes).toBeLessThan(15e6);
      expect(m.textureBytes).toBeLessThan(96 * 1024 * 1024);
      expect(m.textureStorageBytes).toBeLessThan(96 * 1024 * 1024);
    }
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test("neighborhood: rejoining the same tab releases skeleton textures", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const s = await session(browser, "ResidentTab"),
    samples = [];
  try {
    for (let i = 0; i < 20; i++) {
      if (i) {
        await s.page.getByTestId("join").click();
        await expect
          .poll(async () => (await snap(s.page)).self.spawned)
          .toBe(true);
      }
      await sleep(i === 0 ? 1500 : 300);
      samples.push((await snap(s.page)).graphics.memory);
      const at = observations.length,
        id = (await snap(s.page)).self.id;
      await s.page.getByTestId("disconnect").click();
      await expect
        .poll(async () => (await (await fetch(`${URL}/health`)).json()).workers)
        .toBe(0);
      await expect
        .poll(() =>
          observations
            .slice(at)
            .some((e) => e.event === "disconnect" && e.player === id),
        )
        .toBe(true);
    }
    writeFileSync(
      `${dir}/resident-rejoins.json`,
      JSON.stringify(samples, null, 2),
    );
    for (const sample of samples)
      expect(sample.textures).toBeLessThanOrEqual(samples[0].textures);
    expect(samples.at(-1).textures).toBeLessThanOrEqual(samples[0].textures);
    expect(samples.at(-1).geometries).toBeLessThanOrEqual(
      samples[0].geometries + 2, // At most two one-time uploads as the join-preview camera settles.
    );
    expect(errors).toEqual([]);
  } finally {
    await s.close();
  }
});
