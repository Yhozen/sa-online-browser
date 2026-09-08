// SPDX-License-Identifier: GPL-3.0-or-later
// Run against a live dev:poc on the actual cloud desktop (not xvfb-run).
import { visualBudgets as budget } from "./visual-budgets.mjs";
import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { softwareGraphicsArgs } from "./browser-options.mjs";
import { installTextureAudit } from "./texture-audit.mjs";
const display =
  process.env.DISPLAY || (existsSync("/tmp/.X11-unix/X1") ? ":1" : undefined);
if (!display) throw Error("Start the cloud desktop or set DISPLAY first.");
const url = "http://127.0.0.1:3000",
  dir = process.env.POC_DESKTOP_ARTIFACTS || "artifacts/desktop";
const scene = await (await fetch(`${url}/scene`)).json();
if (scene.id !== "neighborhood")
  throw Error("Start dev:poc with the default neighborhood scene.");
mkdirSync(dir, { recursive: true });
const logPath = ".runtime/logs/server.log",
  logStart = readFileSync(logPath).length;
const browser = await chromium.launch({
  headless: false,
  executablePath: "/usr/bin/google-chrome",
  env: { ...process.env, DISPLAY: display },
  args: [
    ...softwareGraphicsArgs,
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const errors = [],
  contexts = [],
  records = [];
const snap = (p) => p.evaluate(() => window.__poc);
async function player(name) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  contexts.push(context);
  await context.addInitScript(() => localStorage.setItem("poc-quality", "low"));
  await context.addInitScript(installTextureAudit);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push({ name, message: e.message }));
  page.on("console", message => { if(message.type() === "error" && /THREE|WebGL|shader/i.test(message.text())) errors.push({name,message:message.text()}); });
  await page.goto(url);
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("join").click();
  await page.waitForFunction(() => window.__poc.self.spawned);
  return page;
}
async function key(p, key, duration = 0) {
  await p.bringToFront();
  await p.locator("#viewport canvas").focus();
  await p.keyboard.down(key);
  if (duration) await p.waitForTimeout(duration);
  await p.keyboard.up(key);
}
async function capture(p, name, quality = "standard") {
  await p.bringToFront();
  await p.locator("#quality").selectOption(quality);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${dir}/${name}.png` });
  const s = await snap(p);
  const { frameTimes, ...graphics } = s.graphics;
  const textures = await p.evaluate(() => window.__textureAudit);
  expect(textures.flatMap((t) => t.unsupported)).toEqual([]);
  expect(textures.reduce((n, t) => n + t.bytes, 0)).toBeLessThan(
    budget.textureStorageBytes,
  );
  records.push({
    name,
    scene: s.scene,
    graphics,
    textures,
    self: s.self,
    presentation: s.presentation,
  });
  expect(graphics.triangles).toBeLessThanOrEqual(budget.renderedTriangles);
  expect(graphics.calls).toBeLessThanOrEqual(budget.drawCalls);
  await p.locator("#quality").selectOption("low");
}
try {
  const a = await player("Desktop_A"),
    b = await player("Desktop_B");
  const aId = (await snap(a)).self.id,
    bId = (await snap(b)).self.id;
  expect(aId).not.toBe(bId);
  await a.getByTestId("chat-input").fill("Afternoon in Arroyo");
  await a.getByTestId("chat-input").press("Enter");
  await expect
    .poll(
      async () =>
        (await snap(b)).chat.filter((m) => m.text === "Afternoon in Arroyo")
          .length,
    )
    .toBe(1);
  await a.locator("#chat-toggle").click();
  await b.locator("#chat-toggle").click();
  await capture(a, "street");
  await key(a, "w", 650);
  await a.waitForTimeout(1000);
  await expect
    .poll(
      async () => (await snap(b)).peers.find((p) => p.id === aId)?.position[1],
    )
    .toBeGreaterThan(1);
  await capture(a, "pedestrian");
  await key(a, "e");
  await a.waitForFunction(() => window.__poc.self.mode === "driver");
  await key(b, "g");
  await b.waitForFunction(() => window.__poc.self.mode === "passenger");
  await key(a, "w", 1000);
  await a.waitForTimeout(1500);
  await capture(a, "driving");
  await capture(b, "passenger");
  for (const p of [a, b]) {
    const s = await snap(p);
    expect(s.presentation.self.animation).toBe("seated");
    expect(
      s.presentation.peers.some((p) => p.visible && p.animation === "seated"),
    ).toBe(true);
  }
  await capture(a, "low", "low");
  const renderer = await a.evaluate(() => {
    const gl = document.querySelector("#viewport canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  await key(a, "f");
  await key(b, "f");
  for (const p of [a, b]) {
    await p.waitForFunction(() => window.__poc.self.mode === "onFoot");
    await p.getByTestId("disconnect").click();
  }
  await expect
    .poll(async () => (await (await fetch(`${url}/health`)).json()).workers)
    .toBe(0);
  expect(errors).toEqual([]);
  const observations = readFileSync(logPath)
    .subarray(logStart)
    .toString()
    .split("\n")
    .flatMap((line) => {
      const i = line.indexOf("POC {");
      if (i < 0) return [];
      try {
        return [JSON.parse(line.slice(i + 4))];
      } catch {
        return [];
      }
    });
  const connected = observations.filter(
    (e) => e.event === "connect" && ["Desktop_A", "Desktop_B"].includes(e.name),
  );
  expect(connected).toHaveLength(2);
  expect(connected.every((e) => e.npc === 0)).toBe(true);
  expect(observations.some((e) => e.event === "player" && e.state === 2)).toBe(
    true,
  );
  expect(observations.some((e) => e.event === "player" && e.state === 3)).toBe(
    true,
  );
  writeFileSync(
    `${dir}/observations.json`,
    JSON.stringify(observations, null, 2),
  );
  writeFileSync(
    `${dir}/summary.json`,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        display,
        browser: browser.version(),
        renderer,
        viewport: [1280, 720],
        scene: { id: scene.id, revision: scene.revision },
        records,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Actual desktop ${display}: two players, chat, walking, both occupants, driving, exits and worker cleanup passed. Evidence: ${dir}`,
  );
} finally {
  for (const [i, context] of contexts.entries()) {
    await context.tracing.stop({ path: `${dir}/player-${i}.zip` });
    await context.close();
  }
  await browser.close();
}
