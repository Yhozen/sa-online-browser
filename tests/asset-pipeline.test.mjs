// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
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
    '  console.log("Blender ' + (mode === "unsupported" ? "3.6.0" : mode === "legacy" ? "4.5.13" : "5.2.1") + '\\n  build hash: native-test"); process.exit(0);',
    "}",
    'const args = process.argv.slice(process.argv.indexOf("--") + 1);',
    'const stage = args[args.indexOf("--output-root") + 1];',
    'fs.writeFileSync(path.join(__dirname, "stage.txt"), stage);',
    'const models = args[args.indexOf("--models") + 1].split(",");',
    'fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify({script:process.argv[process.argv.indexOf("--python")+1],models})+"\\n");',
    'if (process.argv.some(arg => arg.endsWith("canopy-visibility.py"))) {',
    '  const crypto=require("node:crypto"),hash=b=>crypto.createHash("sha256").update(b).digest("hex");',
    '  const raw=process.env.CANOPY_TEST_SOURCE || "assets/source/canopy",out=path.join(stage,"assets/source/canopy");fs.mkdirSync(out,{recursive:true});',
    '  const rows=models.map(model=>{const glb=fs.readFileSync(path.join(raw,model+".glb")),blend=fs.readFileSync(path.join(process.env.CANOPY_TEST_SOURCE || "assets/source",model+".blend"));fs.writeFileSync(path.join(out,model+".glb"),glb);fs.writeFileSync(path.join(out,model+".blend"),blend);return{model,samples:256,glbSha256:hash(glb),sourceSha256:hash(blend)};});',
    '  const files=["assets/source/canopy-base/base.json","tools/assets/canopy-visibility.py","assets/textures/arroyo-foliage.webp",...models.flatMap(name=>["assets/source/canopy-base/"+name+".blend","assets/source/canopy-base/"+name+".glb"])];',
    '  fs.writeFileSync(path.join(out,"native.json"),JSON.stringify({blender:"5.2.1",rows,inputs:Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(file))]))}));process.exit(0);',
    '}',
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

test("mixed native builds route activity models to their own staged exporter", t => {
  const f = fixture(t);
  const result = f.run("--models", "mailbox,activity-board,activity-board");
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(path.join(f.scratch, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls.map(call => [path.basename(call.script), call.models]), [
    ["build.py", ["mailbox"]], ["activity-kit.py", ["activity-board"]],
  ]);
  const directory = path.join(f.output, "apps/browser/public/assets");
  assert.deepEqual(readdirSync(directory).filter(name => name.endsWith(".glb")).sort(), ["activity-board.glb", "mailbox.glb"]);
  const record = JSON.parse(readFileSync(path.join(f.output, "assets/source/asset-build.json")));
  assert.equal(record.models["activity-board"].recipes["tools/assets/activity-kit.py"], digest(readFileSync("tools/assets/activity-kit.py")));
  assert.equal(record.models["activity-board"].glb.sha256, digest(readFileSync(path.join(directory, "activity-board.glb"))));
});

test("oak delivery compression preserves exact authored models and both inventory hashes", t => {
  const f = fixture(t), result = f.run("--models", "tree,roadside-oak");
  assert.equal(result.status, 0, result.stderr);
  const directory = path.join(f.output, "apps/browser/public/assets");
  const inventory = JSON.parse(readFileSync(path.join(directory, "inventory.json"), "utf8"));
  const record = JSON.parse(readFileSync(path.join(f.output, "assets/source/asset-build.json"), "utf8"));
  for (const name of ["tree", "roadside-oak"]) {
    const model = readFileSync(path.join(directory, `${name}.glb`));
    const delivery = readFileSync(path.join(directory, `${name}.glb.gz`));
    assert.deepEqual(gunzipSync(delivery), model);
    assert.equal(inventory.files[`${name}.glb.gz`].sha256, digest(delivery));
    assert.deepEqual(record.models[name].gzip, inventory.files[`${name}.glb.gz`]);
    assert.deepEqual(record.models[name].glb, inventory.files[`${name}.glb`]);
    assert.equal(record.models[name].canopy.originalGeometryPreserved, true);
    assert.equal(record.models[name].canopy.nativeUvEchoOmitted, true);
    assert.match(record.models[name].canopy.base.glb.path, /^assets\/source\/canopy-base\//);
  }
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

test("verified oak version requirement fails before export while selective legacy models still build", t => {
  const f=fixture(t,"legacy");
  const oak=f.run("--models","tree");
  assert.notEqual(oak.status,0);assert.match(oak.stderr,/compatibility with 4.5.13 is unverified/);
  assert.match(oak.stderr,/--blender \/path\/to\/blender-5.2.1/);
  assert.equal(existsSync(path.join(f.scratch,"stage.txt")),false);
  const ordinary=f.run("--models","mailbox");assert.equal(ordinary.status,0,ordinary.stderr);
});
