// SPDX-License-Identifier: GPL-3.0-or-later
// Real DOM/accessibility lifecycle for the activity instrument in an isolated
// scene. Multiplayer and rendering acceptance use separate browser tests.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { chromium } from "@playwright/test";

const state = (overrides = {}) => ({ type: "challenge", version: 1, generation: 1,
  phase: "countdown", driverId: 0, passengerId: 1, vehicleId: 1,
  checkpointIndex: 0, checkpointCount: 9, elapsedMs: 0, countdownMs: 3000,
  bestMs: 0, serverTick: 100, reason: "none", ...overrides });
const html = `<!doctype html><meta charset="utf-8"><style>.hidden{display:none}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three'; import {DrivingActivity} from '/challenge.js';
window.scene = new THREE.Scene(); window.commands = [];
window.activity = new DrivingActivity(scene, command => commands.push(command));
window.actor = {id:0,spawned:true,mode:'driver',position:[0,6,10],vehicleId:1};
window.names = new Map([[0,'Driver'],[1,'Passenger']]);
window.render = now => activity.update(actor,names,now);
window.ready = true;
</script>`;

test("activity announces server transitions once, keeps distance non-live, and resets its DOM lifecycle", { timeout: 30000 }, async () => {
  const modules = new Map([["/", html],
    ...["three.module.js", "three.core.js"].map(file => [`/${file}`, readFileSync(`node_modules/three/build/${file}`)]),
    ...[["/challenge.js", "challenge.ts"], ["/challenge-state", "challenge-state.ts"]].map(([url, file]) => [url,
      ts.transpileModule(readFileSync(`apps/browser/src/${file}`, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText]),
  ]);
  const server = createServer((request, response) => {
    const content = modules.get(request.url);
    response.writeHead(content ? 200 : 404, { "content-type": request.url === "/" ? "text/html" : "application/javascript" });
    response.end(content ?? "Not found");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.ready);
    const manifest = JSON.parse(readFileSync("packages/shared/scenes/neighborhood.json", "utf8"));
    await page.evaluate(manifest => { activity.configure(manifest); render(0); }, manifest);
    const live = page.getByRole("status"), visible = page.getByTestId("race-status");
    assert.equal(await visible.getAttribute("aria-live"), "off");
    assert.equal(await live.getAttribute("aria-live"), "polite");
    assert.equal(await live.getAttribute("aria-atomic"), "true");
    await page.evaluate(() => {
      window.announcements = []; window.navigationChanges = 0;
      const liveRegion = document.querySelector('[role=status]');
      new MutationObserver(records => announcements.push(...records.map(() => liveRegion.textContent)))
        .observe(document.querySelector('[role=status]'), { childList: true, subtree: true, characterData: true });
      new MutationObserver(records => navigationChanges += records.length)
        .observe(document.querySelector('#activity-status'), { childList: true, subtree: true, characterData: true });
      for (let i = 1; i <= 10; i++) render(i * 100);
    });
    assert.deepEqual(await page.evaluate(() => ({ announcements, navigationChanges })), { announcements: [], navigationChanges: 0 });
    const accept = async (event, now) => page.evaluate(({ event, now }) => { activity.accept(event, now); render(now); }, { event, now });
    await accept(state(), 1100);
    assert.match(await live.textContent(), /Countdown started/);
    for (let i = 1; i <= 3; i++) await accept(state({ countdownMs: 3000 - i * 200 }), 1100 + i * 200);
    assert.equal(await page.evaluate(() => announcements.length), 1, "countdown refreshes must not repeat the phase announcement");
    const running = state({ phase: "running", countdownMs: 0 });
    await accept(running, 4200);
    await accept({ type: "raceCheckpoint", position: [0, 12, 10], nextPosition: [30, 12, 10], radius: 4.5, checkpointType: 0 }, 4200);
    assert.match(await live.textContent(), /Run in progress\. Gate 1 of 9/);
    const beforeMoving = await page.evaluate(() => announcements.length);
    await page.evaluate(() => { for (let i = 1; i <= 10; i++) { actor.position = [i * 2, 6, 10]; render(4200 + i * 100); } });
    assert.match(await visible.textContent(), /Gate 1 · 21 m/);
    assert.equal(await page.evaluate(() => announcements.length), beforeMoving, "distance and timer changes must not enter the live region");
    assert.ok(await page.evaluate(() => navigationChanges) > 5, "visible navigation must still update while moving");
    const gateTwo = state({ phase: "running", checkpointIndex: 1, countdownMs: 0, elapsedMs: 2000 });
    await accept(gateTwo, 6200);
    assert.match(await live.textContent(), /Run in progress\. Gate 2 of 9/);
    await page.locator("#activity-toggle").click();
    assert.equal(await page.locator("#activity-content").isVisible(), false);
    await page.evaluate(() => render(9000));
    assert.match(await live.textContent(), /Waiting for the server/);
    assert.match(await page.locator(".activity").ariaSnapshot(), /Waiting for the server/, "announcements remain exposed when the instrument is collapsed");
    const staleCount = await page.evaluate(() => announcements.length);
    await page.evaluate(() => { render(9100); render(9200); });
    assert.equal(await page.evaluate(() => announcements.length), staleCount);
    await accept({ ...gateTwo, elapsedMs: 5000 }, 9300);
    assert.match(await live.textContent(), /Gate 2 of 9/);
    await accept(state({ phase: "cancelled", countdownMs: 0, reason: "driver_exit" }), 9400);
    assert.match(await live.textContent(), /driver left the car/);
    await accept(state({ phase: "cancelled", countdownMs: 0, reason: "reset" }), 9500);
    assert.match(await live.textContent(), /neighborhood was reset/);
    const finished = state({ generation: 2, phase: "finished", checkpointIndex: 9, countdownMs: 0, elapsedMs: 12345 });
    await accept(finished, 9600);
    assert.match(await live.textContent(), /Finished in 0:12.34/);
    await page.evaluate(() => activity.clear());
    assert.equal(await page.locator(".activity").isVisible(), false);
    assert.equal(await page.locator("#activity-announcement").textContent(), "");
    await accept(finished, 9700);
    assert.match(await live.textContent(), /Finished in 0:12.34/, "rejoining must announce the received state again");
    await page.evaluate(() => {
      activity.dispose();
      // pagehide may precede socket close and the final presentation timer.
      activity.clear(); render(9800); activity.dispose();
      activity.accept({ type: "challengeScoresClear" });
    });
    assert.equal(await page.locator(".activity").count(), 0);
    assert.equal(await page.evaluate(() => scene.getObjectByName("driving-activity") === undefined), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
