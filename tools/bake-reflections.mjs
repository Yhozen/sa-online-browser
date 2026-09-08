// SPDX-License-Identifier: GPL-3.0-or-later
// Bake the static neighborhood probe once; ordinary clients load its committed PMREM.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createGateway } from "../services/gateway/server.mjs";
import { softwareGraphicsArgs } from "./browser-options.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "apps/browser/public/assets/arroyo-reflections.pmrem.gz");
const sidecar = path.join(root, "assets/source/reflection-bake.json");
const port = 3391;
const maxCompressedBytes = 32 * 1024 * 1024;
const maxRawBytes = 32 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${command} ${args.join(" ")} failed (${result.signal || result.status}).`);
}

let browser;
let gateway;
let cleanupPromise;
let interruptedSignal;
const temporaryFiles = [];
async function cleanup() {
  if (!cleanupPromise) cleanupPromise = (async () => {
    // Closing Chromium first releases any HTTP connections before server.close().
    try { await browser?.close(); }
    finally {
      try { if (gateway?.server.listening) await gateway.close(); }
      finally { for (const file of temporaryFiles) rmSync(file, { force: true }); }
    }
  })();
  return cleanupPromise;
}
function interrupted(signal) {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  interruptedSignal = signal;
  // Wake pending page operations; finally cleans the gateway after any in-flight launch.
  void browser?.close().catch(error => console.error("Reflection bake interrupt:", error));
}
function throwIfInterrupted() {
  if (interruptedSignal) throw Error(`Reflection bake interrupted by ${interruptedSignal}.`);
}
const onInterrupt = () => interrupted("SIGINT");
const onTerminate = () => interrupted("SIGTERM");
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);

try {
  // Deliberately do not call build:assets here: that pipeline invokes this script.
  run("npm", ["run", "build:browser"]);
  throwIfInterrupted();
  gateway = createGateway({ port, host: "127.0.0.1", sceneId: "neighborhood" });
  await gateway.start();
  throwIfInterrupted();
  browser = await chromium.launch({
    headless: true,
    args: softwareGraphicsArgs,
    handleSIGINT: false,
    handleSIGTERM: false,
  });
  throwIfInterrupted();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /THREE|WebGL|shader/i.test(message.text()))
      pageErrors.push(message.text());
  });
  // No join clicks or native clients: capture only the static environment.
  await page.goto(`http://127.0.0.1:${port}/?bake-reflections=1`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  try {
    await page.waitForFunction(
      () => typeof window.__reflectionBake === "string" && window.__reflectionBake.length > 0,
      undefined,
      { timeout: 180000, polling: 250 },
    );
  } catch (error) {
    throw Error(`Reflection export did not complete. Browser errors: ${pageErrors.join("; ") || "none recorded"}`, { cause: error });
  }
  if (pageErrors.length) throw Error(`Reflection bake browser errors: ${pageErrors.join("; ")}`);
  const encoded = await page.evaluate(() => window.__reflectionBake);
  if (encoded.length > Math.ceil(maxCompressedBytes / 3) * 4 ||
      encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
    throw Error("Reflection export is not bounded, canonical base64.");
  const compressed = Buffer.from(encoded, "base64");
  if (compressed.length > maxCompressedBytes || compressed.toString("base64") !== encoded ||
      compressed[0] !== 0x1f || compressed[1] !== 0x8b || compressed[2] !== 8)
    throw Error("Reflection export is not a valid bounded gzip payload.");
  const raw = gunzipSync(compressed, { maxOutputLength: maxRawBytes });
  if (raw.length < 12 || raw.readUInt32LE(0) !== 0x31524d50)
    throw Error("Reflection atlas is missing its PMR1 header.");
  const width = raw.readUInt32LE(4), height = raw.readUInt32LE(8);
  if (height < 64 || height > 2048 || (height & (height - 1)) !== 0 || width !== height / 4 * 3 ||
      12 + width * height * 8 > maxRawBytes || raw.length !== 12 + width * height * 8)
    throw Error(`Reflection atlas has invalid RGBA16F dimensions/length: ${width}×${height}, ${raw.length} bytes.`);
  let nonzero = 0;
  for (let i = 12; i < raw.length; i += 2) {
    const half = raw.readUInt16LE(i);
    if ((half & 0x7c00) === 0x7c00) throw Error("Non-finite reflection texel.");
    if ((i - 12) % 8 < 6 && (half & 0x7fff)) nonzero++;
  }
  if (nonzero < width * height) throw Error("Reflection readback has insufficient nonzero color data.");
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  if (health.workers !== 0 || health.sessions !== 0)
    throw Error("Static reflection baking unexpectedly created a multiplayer session.");
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport canvas");
    const gl = canvas?.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable";
  });
  const scene = await (await fetch(`http://127.0.0.1:${port}/scene`)).json();
  const inventory = JSON.parse(readFileSync(path.join(root, "apps/browser/public/assets/inventory.json"), "utf8"));
  const inputs = Object.fromEntries(Object.entries(inventory.files)
    .filter(([name]) => name !== "arroyo-reflections.pmrem.gz")
    .sort(([a], [b]) => a.localeCompare(b)));
  const sources = [
    "apps/browser/src/lighting.ts", "apps/browser/src/environment.ts",
    "apps/browser/src/assets.ts", "apps/browser/src/main.ts",
    "apps/browser/src/reflection-storage.ts", "apps/browser/src/warmup.ts", "apps/browser/src/foliage-mips.ts", "apps/browser/src/character-animation.ts", "apps/browser/src/horizon.ts",
    "apps/browser/src/road-detail.ts", "apps/browser/src/verges.ts",
    "packages/shared/scenes/neighborhood.json", "tools/bake-reflections.mjs", "package-lock.json",
  ];
  throwIfInterrupted();
  const metadata = {
    version: 1,
    generatedAt: new Date().toISOString(),
    format: "PMR1: uint32-le magic,width,height; RGBA16F PMREM atlas; gzip",
    width, height,
    compressedBytes: compressed.length,
    uncompressedBytes: raw.length,
    sha256: hash(compressed),
    uncompressedSha256: hash(raw),
    browser: browser.version(),
    renderer,
    scene: { id: scene.id, revision: scene.revision },
    sources: Object.fromEntries(sources.map(file => [file, hash(readFileSync(path.join(root, file)))])),
    inputs,
    network: { playerJoins: 0, workers: health.workers, sessions: health.sessions },
  };
  for (const [file, bytes] of [[output, compressed], [sidecar, JSON.stringify(metadata, null, 2) + "\n"]]) {
    mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    temporaryFiles.push(temporary);
    writeFileSync(temporary, bytes);
    renameSync(temporary, file);
  }
  run(process.execPath, ["tools/asset-inventory.mjs"]);
  // Refresh static dist with the new cache and inventory produced after capture.
  run("npm", ["run", "build:browser"]);
  console.log(`Baked ${width}×${height} RGBA16F reflection atlas: ${compressed.length} gzip bytes; no player sessions.`);
} finally {
  await cleanup();
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
}
