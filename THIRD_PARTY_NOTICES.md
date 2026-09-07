# Third-party source and artifacts

The root GPL-3.0 license applies to original PoC implementation code, with the option of any later GPL version. It does not replace upstream licensing or relicense the installed skills.

- **open.mp server v1.5.8.3079**: unchanged release artifact, MPL-2.0 project source with separately licensed dependencies. Downloaded into the ignored runtime directory; source/release hashes are in the fixture manifest.
- **openmultiplayer/RakNet**: pinned legacy 2.52 variant with per-file original notices describing GPL-2.0-or-later and other historical licensing arrangements. Adapted client files retain their notices. The GPL-compatible route is used for this PoC. Download and patch recipe, source pin and provenance are retained; no FlexodMR source is used.
- **nlohmann/json**: MIT, downloaded by the native setup recipe with its source header and notice.
- **Three.js, ws, TypeScript, Vite and their dependencies**: retain package licenses in the installed dependency tree; exact versions/integrity are recorded in package-lock.json. Playwright is Apache-2.0.
- **Debian runtime packages**: the isolated runtime retains downloaded package metadata and included copyright/license files. Exact versions and package hashes are recorded by the setup manifest.
- **QEMU user-mode emulator**: the Debian `qemu-user-static` package supplies `qemu-i386-static` under QEMU's upstream GPL and per-file terms. The package's copyright file and source-package metadata are retained in the isolated runtime. This runs the unchanged official server binary on the cloud host.
- **Installed agent skills**: third-party material under `.agents/skills`, with origins in skills-lock.json; the original PoC license does not change their terms.

No GTA executable, model, texture, audio or native SA-MP client is included. Browser geometry is created by the original implementation.

## Bundled imagegen skill

`.agents/skills/imagegen` is copied from the supplied Codex system skill for this milestone's reproducible authoring workflow. Its upstream license is preserved in `.agents/skills/imagegen/LICENSE.txt`. Actual image generation used the built-in tool; the bundled optional API scripts were not used and are not required by setup or asset builds.
