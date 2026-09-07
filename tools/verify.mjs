// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
mkdirSync("artifacts/verification", { recursive: true });
rmSync("artifacts/verification/summary.json", { force: true });
function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status || 1);
}
run("npm", ["run", "typecheck"]);
run("npm", ["run", "test:gateway"]);
run(process.execPath, [
  "--experimental-transform-types",
  "--test",
  "tests/scene.test.mjs",
]);
run("ctest", ["--test-dir", "native/build", "--output-on-failure"]);
run("npm", ["run", "build:browser"]);
if (process.env.POC_HEADLESS === "1")
  run("npx", ["playwright", "test", ...process.argv.slice(2)]);
else
  run("xvfb-run", [
    "-a",
    "--server-args=-screen 0 1600x1000x24",
    "npx",
    "playwright",
    "test",
    ...process.argv.slice(2),
  ]);
// A filtered diagnostic run cannot overwrite the full acceptance summary.
if (process.argv.length === 2) {
  run("python3", ["tools/verify-supervisor.py"]);
  run("python3", ["tools/verify-supervisor.py", "--interrupt-group"]);
  run("node", ["tools/summarize-verification.mjs"]);
}
