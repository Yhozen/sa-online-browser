// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSounds, encodeWav, sampleRate } from './audio/synthesize.mjs';
const directory = fileURLToPath(new URL('../apps/browser/public/audio/', import.meta.url));
mkdirSync(directory, { recursive: true });
const entries = createSounds().map(({ id, samples, description, loop = false }) => {
  const file = `${id}.wav`, bytes = encodeWav(samples);
  writeFileSync(`${directory}${file}`, bytes);
  return { id, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), duration: samples.length / sampleRate, loop, description };
});
writeFileSync(`${directory}inventory.json`, JSON.stringify({ version: 1, license: 'GPL-3.0-or-later', creator: 'Arroyo project', source: 'tools/audio/synthesize.mjs', format: 'PCM signed 16-bit little-endian mono', sampleRate, entries, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) }, null, 2) + '\n');
console.log(`Exported ${entries.length} original audio assets (${(entries.reduce((sum, entry) => sum + entry.bytes, 0) / 1024 / 1024).toFixed(2)} MiB).`);
