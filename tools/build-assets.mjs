// SPDX-License-Identifier: GPL-3.0-or-later
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync,
  copyFileSync, rmSync, realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinnedVersion = "4.5.13";
const archive = "blender-" + pinnedVersion + "-linux-x64.tar.xz";
const archiveHash = "da4e69b06b75b9e642d106496c50e7e240218b411d2f6e18271c1d1d819cef91";
const binaryHash = "e3ce4e960a2fd3beb1f9d2299e38b3804475ccd395193013aec239a4b75bfbfe";
const pinnedBinary = path.join(root, ".runtime/blender-" + pinnedVersion + "-linux-x64/blender");
const macBinary = "/Applications/Blender.app/Contents/MacOS/Blender";
const models = ["house-0", "house-1", "house-2", "house-3", "palm", "tree", "fence", "fence-low", "mailbox", "bin", "pole", "lamp", "coupe", "neighbor", "garden-low", "garden-shrub"];
const recipes = ["tools/build-assets.mjs", "tools/assets/build.py", "tools/assets/environment-kit.py", "tools/assets/heroes.py", "tools/assets/garden-kit.py"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const identify = filename => {
  const bytes = readFileSync(filename);
  return { bytes: bytes.length, sha256: hash(bytes) };
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(command + " failed (" + (result.signal || result.status) + ").");
  return result;
}

const { values } = parseArgs({ options: {
  blender: { type: "string" },
  models: { type: "string" },
  "output-root": { type: "string" },
  "skip-reflections": { type: "boolean", default: false },
  help: { type: "boolean", short: "h" },
} });
if (values.help) {
  console.log([
    "Build original Arroyo assets.",
    "",
    "  --blender PATH       Explicit native executable (or BLENDER_BIN).",
    "                       macOS defaults to /Applications/Blender.app;",
    "                       Linux x64 defaults to checksum-pinned Blender " + pinnedVersion + ".",
    "  --models NAMES       Comma-separated models; dependencies may be constructed,",
    "                       but only selected final exports are replaced.",
    "  --output-root PATH   Write selected exports to a separate folder tree.",
    "                       Requires --skip-reflections.",
    "  --skip-reflections   Rebuild models/textures/inventory without the browser bake.",
    "                       Run node tools/bake-reflections.mjs after final scene edits.",
    "",
    "Models: " + models.join(", "),
    "Supported Blender versions: 4.5.13, 5.2.1.",
  ].join("\n"));
  process.exit(0);
}
const selected = values.models !== undefined ? [...new Set(values.models.split(",").map(name => name.trim()))] : models;
if (selected.some(name => !models.includes(name)))
  throw Error("Unknown model selection. Available models: " + models.join(", ") + ".");
const outputRoot = values["output-root"] ? path.resolve(values["output-root"]) : root;
if (outputRoot !== root && !values["skip-reflections"])
  throw Error("--output-root requires --skip-reflections; reflection baking reads the project scene.");

let binary = values.blender || process.env.BLENDER_BIN;
let distribution = binary ? "explicit" : "pinned-linux-x64";
if (!binary && process.platform === "darwin" && existsSync(macBinary)) {
  binary = macBinary;
  distribution = "native-macos";
}
if (!binary) {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw Error("Install native Blender 4.5.13 or 5.2.1 and pass --blender PATH (or BLENDER_BIN). The pinned Linux x64 executable cannot run on this host.");
  binary = pinnedBinary;
  if (!existsSync(binary)) {
    mkdirSync(path.join(root, ".runtime/downloads"), { recursive: true });
    const file = path.join(root, ".runtime/downloads", archive);
    if (!existsSync(file)) {
      const response = await fetch("https://mirror.blender.org/release/Blender4.5/" + archive);
      if (!response.ok) throw Error("Blender download: " + response.status);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
    if (identify(file).sha256 !== archiveHash) throw Error("Blender SHA256 mismatch");
    run("tar", ["-xf", file, "-C", path.join(root, ".runtime")]);
  }
}
binary = realpathSync(path.resolve(binary));
const executable = identify(binary);
// Selecting the pinned runtime explicitly must retain its checksum check.
if (binary === pinnedBinary && executable.sha256 !== binaryHash)
  throw Error("Cached Blender executable changed; remove .runtime/blender-4.5.13-linux-x64 and rebuild.");
const versionOutput = run(binary, ["--version"], { encoding: "utf8", stdio: "pipe" }).stdout;
const version = versionOutput.match(/^Blender (\d+\.\d+\.\d+)/m)?.[1];
if (!["4.5.13", "5.2.1"].includes(version))
  throw Error("Unsupported Blender " + (version || "version") + "; verified recipes support 4.5.13 and 5.2.1.");
const generator = {
  version,
  buildHash: versionOutput.match(/build hash:\s*(\S+)/)?.[1] ?? null,
  distribution,
  platform: process.platform,
  architecture: process.arch,
  executableSha256: executable.sha256,
};
console.log("Building " + selected.length + " models with Blender " + version + " (" + distribution + ", " + process.arch + ").");

// Export into scratch space first. A Blender/API failure leaves all committed
// meshes and editable sources intact; publish only a complete successful run.
mkdirSync(path.join(root, ".runtime"), { recursive: true });
const staging = mkdtempSync(path.join(root, ".runtime/asset-build-"));
try {
  const inputs = Object.fromEntries(recipes.map(file => [file, identify(path.join(root, file)).sha256]));
  run(binary, ["--background", "--factory-startup", "--python-exit-code", "1", "--python",
    path.join(root, "tools/assets/build.py"), "--", "--output-root", staging,
    "--models", selected.join(","), "--blender-version", version]);
  const output = path.join(outputRoot, "apps/browser/public/assets");
  const source = path.join(outputRoot, "assets/source");
  const recordPath = path.join(source, "asset-build.json");
  const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : { version: 1, models: {} };
  if (record.version !== 1 || !record.models) throw Error("Unrecognized asset-build provenance format.");
  for (const [file, fingerprint] of Object.entries(inputs))
    if (identify(path.join(root, file)).sha256 !== fingerprint)
      throw Error("Asset recipe changed during generation: " + file + ". Rebuild once authoring edits are complete.");
  const generatedAt = new Date().toISOString();
  // Check every product before copying any of them, including editable sources.
  for (const name of selected) {
    record.models[name] = {
      generatedAt, blender: generator, recipes: inputs,
      glb: identify(path.join(staging, "apps/browser/public/assets", name + ".glb")),
      blend: identify(path.join(staging, "assets/source", name + ".blend")),
    };
  }
  mkdirSync(output, { recursive: true });
  mkdirSync(source, { recursive: true });
  for (const name of selected) {
    copyFileSync(path.join(staging, "apps/browser/public/assets", name + ".glb"), path.join(output, name + ".glb"));
    copyFileSync(path.join(staging, "assets/source", name + ".blend"), path.join(source, name + ".blend"));
  }
  copyFileSync(path.join(root, "assets/textures/neighborhood-atlas.png"), path.join(output, "neighborhood-atlas.png"));
  // Original imagegen PNGs remain editable inputs. Committed lossless encodings
  // need no encoder dependency at build time and retain the same texel data.
  for (const name of ["surfaces", "details", "foliage", "sky", "asphalt", "grass", "grass-clumps"]) {
    copyFileSync(path.join(root, `assets/textures/arroyo-${name}.webp`), path.join(output, `arroyo-${name}.webp`));
    rmSync(path.join(output, `arroyo-${name}.png`), { force: true });
  }
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
  run(process.execPath, ["tools/asset-inventory.mjs", output]);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
if (values["skip-reflections"]) {
  console.log("Models, textures, provenance and inventory rebuilt. Reflection bake skipped; refresh it after final scene changes, then restart the gateway.");
} else {
  // Capture static scene lighting once; normal setup consumes the committed cache.
  run(process.execPath, ["tools/bake-reflections.mjs"]);
}
