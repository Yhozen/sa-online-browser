// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export function loadScene(id = process.env.POC_SCENE || "neighborhood") {
  if (!["yard", "neighborhood"].includes(id))
    throw new Error("POC_SCENE must be yard or neighborhood");
  const scene = JSON.parse(
    readFileSync(new URL(`./scenes/${id}.json`, import.meta.url)),
  );
  const assets = JSON.parse(
    readFileSync(
      new URL(
        "../../apps/browser/public/assets/inventory.json",
        import.meta.url,
      ),
    ),
  );
  scene.assets = assets;
  scene.revision = createHash("sha256")
    .update(JSON.stringify(scene))
    .digest("hex")
    .slice(0, 16);
  return scene;
}
