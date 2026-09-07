// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(cmd, args) { const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }); if (result.status !== 0) throw new Error(`${cmd} failed (${result.status}): ${result.error || ''}`); }
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This PoC setup targets Linux x86_64.');
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 (see .nvmrc).');
run('sudo', ['dnf', 'install', '-y', 'gcc', 'gcc-c++', 'clang', 'cmake', 'ninja-build', 'make', 'xorg-x11-server-Xvfb', 'xorg-x11-xauth']);
run('npm', ['ci']);
run('python3', ['tools/setup-runtime.py']);
run('python3', ['tools/setup-protocol.py']);
run('cmake', ['-S', 'native', '-B', 'native/build', '-DCMAKE_BUILD_TYPE=RelWithDebInfo']);
run('cmake', ['--build', 'native/build', '-j', '4']);
run('npx', ['playwright', 'install', 'chromium']);
run('npm', ['run', 'build:browser']);
console.log('PoC ready. Run npm run dev:poc.');
