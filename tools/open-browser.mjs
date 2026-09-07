// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { softwareGraphicsArgs } from './browser-options.mjs';

const url = 'http://127.0.0.1:3000';
try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok || (await response.json()).ok !== true) throw new Error('Gateway is not ready');
} catch {
    console.error('Start npm run dev:poc in another terminal, then run npm run open:poc again.');
    process.exit(1);
}
// The supplied cloud desktop uses :1; honor an explicitly selected display.
const display = process.env.DISPLAY || (existsSync('/tmp/.X11-unix/X1') ? ':1' : undefined);
if (!display) {
    console.error('No cloud desktop found. Start the desktop or set DISPLAY before running npm run open:poc.');
    process.exit(1);
}
const profile = fileURLToPath(new URL('../.runtime/playground-chrome/', import.meta.url));
mkdirSync(profile, { recursive: true });
const logPath = fileURLToPath(new URL('../.runtime/playground-chrome.log', import.meta.url));
const log = openSync(logPath, 'a');
// A separate user-data-dir prevents an already-running Chrome (possibly started
// with --disable-gpu) from swallowing this launch and ignoring its GPU flags.
const browser = spawn('google-chrome', [
    `--user-data-dir=${profile}`, ...softwareGraphicsArgs,
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--new-window', url,
], { detached: true, stdio: ['ignore', log, log], env: { ...process.env, DISPLAY: display } });
closeSync(log);
browser.on('error', error => {
    console.error(`Could not open google-chrome: ${error.message}`);
    process.exitCode = 1;
});
browser.on('spawn', () => {
    console.log(`Opened ${url} in the cloud desktop using software WebGL. Browser log: ${logPath}`);
});
browser.unref();
