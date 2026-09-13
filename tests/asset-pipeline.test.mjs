// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t, mode = "ok") {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "arroyo-asset-pipeline-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const binary = path.join(scratch, "blender");
  const output = path.join(scratch, "output");
  // Exercise the real CLI/process/file pipeline without requiring a GPU for
  // orchestration regression checks. Geometry contracts use actual GLBs.
  writeFileSync(binary, [
    "#!/usr/bin/env node",
    'const fs = require("node:fs"); const path = require("node:path");',
    'if (process.argv.includes("--version")) {',
    '  console.log("Blender ' + (mode === "unsupported" ? "3.6.0" : "5.2.1") + '\\n  build hash: native-test"); process.exit(0);',
    "}",
    'const args = process.argv.slice(process.argv.indexOf("--") + 1);',
    'const stage = args[args.indexOf("--output-root") + 1];',
    'fs.writeFileSync(path.join(__dirname, "stage.txt"), stage);',
    'const models = args[args.indexOf("--models") + 1].split(",");',
    'for (const name of models) for (const [folder, suffix] of [["apps/browser/public/assets", ".glb"], ["assets/source", ".blend"]]) {',
    '  fs.mkdirSync(path.join(stage, folder), {recursive:true});',
    '  fs.writeFileSync(path.join(stage, folder, name + suffix), "generated " + name + suffix);',
    "}",
    'process.exit(' + (mode === "fail" ? "7" : "0") + ");",
  ].join("\n"), { mode: 0o755 });
  const run = (...args) => spawnSync(process.execPath, [
    "tools/build-assets.mjs", "--blender", binary, "--output-root", output,
    "--skip-reflections", ...args,
  ], { encoding: "utf8", timeout: 30000 });
  return { binary, output, run, scratch };
}

test("explicit native builds publish selected models with exact generator and output identities", t => {
  const f = fixture(t);
  const first = f.run("--models", "mailbox");
  assert.equal(first.status, 0, first.stderr);
  const second = f.run("--models", "bin,bin");
  assert.equal(second.status, 0, second.stderr);
  const record = JSON.parse(readFileSync(path.join(f.output, "assets/source/asset-build.json"), "utf8"));
  assert.deepEqual(Object.keys(record.models).sort(), ["bin", "mailbox"]);
  for (const name of ["bin", "mailbox"]) {
    const entry = record.models[name];
    assert.equal(entry.blender.version, "5.2.1");
    assert.equal(entry.blender.distribution, "explicit");
    assert.equal(entry.blender.buildHash, "native-test");
    assert.equal(entry.blender.executableSha256, digest(readFileSync(f.binary)));
    assert.equal(entry.glb.sha256, digest(readFileSync(path.join(f.output, "apps/browser/public/assets", name + ".glb"))));
    assert.equal(entry.recipes["tools/assets/heroes.py"], digest(readFileSync("tools/assets/heroes.py")));
  }
  const files = readdirSync(path.join(f.output, "apps/browser/public/assets"));
  assert.deepEqual(files.filter(name => name.endsWith(".glb")).sort(), ["bin.glb", "mailbox.glb"]);
  for (const name of ["surfaces", "details", "foliage", "sky", "asphalt", "grass", "grass-clumps"]) {
    assert.ok(files.includes(`arroyo-${name}.webp`));
    assert.ok(!files.includes(`arroyo-${name}.png`));
    assert.equal(digest(readFileSync(path.join(f.output, "apps/browser/public/assets", `arroyo-${name}.webp`))),
      digest(readFileSync(`assets/textures/arroyo-${name}.webp`)));
  }
  const inventory = JSON.parse(readFileSync(path.join(f.output, "apps/browser/public/assets/inventory.json"), "utf8"));
  assert.equal(inventory.files["bin.glb"].sha256, record.models.bin.glb.sha256);
});

test("a failing native exporter cannot replace a previously working asset", t => {
  const f = fixture(t, "fail");
  const directory = path.join(f.output, "apps/browser/public/assets");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "mailbox.glb"), "accepted model");
  const result = f.run("--models", "mailbox");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed \(7\)/);
  assert.equal(readFileSync(path.join(directory, "mailbox.glb"), "utf8"), "accepted model");
  assert.equal(existsSync(readFileSync(path.join(f.scratch, "stage.txt"), "utf8")), false);
});

test("unsupported Blender and misspelled model names fail before publishing", t => {
  const f = fixture(t, "unsupported");
  const version = f.run("--models", "mailbox");
  assert.notEqual(version.status, 0);
  assert.match(version.stderr, /Unsupported Blender 3.6.0/);
  const selection = f.run("--models", "mailbxo");
  assert.notEqual(selection.status, 0);
  assert.match(selection.stderr, /Unknown model selection/);
});
