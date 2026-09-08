// SPDX-License-Identifier: GPL-3.0-or-later
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = "apps/browser/public/assets";
const files = Object.fromEntries(
  readdirSync(dir)
    .filter((n) => /\.(glb|png|webp|jpg|ktx2)$/.test(n))
    .sort()
    .map((name) => {
      const bytes = readFileSync(`${dir}/${name}`);
      return [
        name,
        {
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
);
writeFileSync(
  `${dir}/inventory.json`,
  JSON.stringify({ version: 1, files }, null, 2) + "\n",
);
