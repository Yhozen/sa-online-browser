# Browser/open.mp PoC verification

**Accepted on 2026-09-07:** all five headed browser scenarios passed. The sustained session completed **79 active rounds over 602.817 seconds**, with **zero uncaught browser errors**. Twenty browser connection cycles released their server slots and native workers. All **167 position checks** passed; maximum observed browser/server distance was **0.189 world units**, using server samples at most **200 ms** old.

The gateway's three validation tests and all three native CTests pass. The native tests also pass under AddressSanitizer with leak detection and no suppressions. These are local fixture results, not broader GTA compatibility claims.

## Scope of the evidence

Two independent Chromium contexts control original placeholder characters and a shared car through keyboard/mouse input. Each owns a separate native worker and normal SA-MP 0.3.7 connection to the unchanged official open.mp v1.5.8.3079 release. The gateway does not broadcast peer gameplay. Server-side Pawn observations independently verify IDs, non-NPC status, player state, position, vehicle state, chat, and slot release.

The cloud uses software WebGL2 through SwiftShader, with headed Chromium under Xvfb. This establishes functional rendering, not hardware GPU performance. The native worker contains no GTA executable or renderer.

## Acceptance coverage

| Requirement | Verification |
| --- | --- |
| Two normal players join and spawn | Distinct server IDs and server `npc: 0` observations |
| Bidirectional walking | Keyboard movement, independent server positions, and opposite browser incoming snapshots |
| Chat | Unique messages observed at the server and other browser exactly once |
| Shared car | Server driver/passenger states, same vehicle, and vehicle movement following driver input |
| Passenger cannot drive | Passenger throttle does not move the settled vehicle |
| Exit and role swap | Both players exit, exchange seats, and drive again |
| Seat contention | Simultaneous command requests produce one driver and an occupied-seat rejection |
| Corrections | Reset/teleport positions agree with the server; driver disconnect reconciles the passenger |
| Failure visibility | Duplicate name, real worker SIGKILL, server unavailable, and server restart |
| Lifecycle | Twenty browser sessions close; server slot release and zero gateway workers are observed each time |
| Edge behavior | Jump, collision at the east wall, safe passenger exit, actual hidden-tab disconnect and rejoin |
| Sustained session | 79 alternating walk/chat/drive rounds over 602.817 seconds; both IDs remained connected |
| Malformed inputs | Directional codec fixtures, truncation, invalid values, bounded/reordered fragmented initialization, and sanitizer regressions |

Position assertions require a fresh independent server sample and agreement within **0.5 world units within one second**. Screenshots cannot satisfy those assertions. The soak alternates roles, walks, sends unique chat, drives, checks both positions, and exits on every round.

## Reproduce and inspect

```sh
npm run setup:poc
npm run verify:poc
npm run dev:poc
```

Stop the demo before verification; both use loopback ports 3000 and 7777. Setup was run successfully in the supplied Amazon Linux x86_64 workspace. It verifies pinned downloads, provisions isolated Debian/QEMU runtime files, and builds the client and fixture. The release executable and all 22 server component files were independently compared with the verified archive.

A successful full verification writes `artifacts/verification/summary.json`. The [committed machine summary](poc-verification.json) records measured results, versions, source hashes, and remaining unverified targets. Generated evidence remains in the workspace:

- `artifacts/verification/server-observations.json`, `position-agreements.json`, `browser-errors.json`, `results.json`, and `soak.json`
- `artifacts/verification/walking-chat.png`, `driver-passenger.png`, `wall-exit.png`, and `soak-complete.png`
- `artifacts/verification/*.zip` Playwright traces; `videos/` recordings; `report/` HTML results
- `.runtime/logs/gateway.jsonl` worker lifecycle and decoded control-message diagnostics
- `native/build/Testing/Temporary/LastTest.log` native checks
- `native/build-review/asan-ctest.log` and `asan-codecs.log` sanitizer results
- `artifacts/verification/supervisor.json`, `supervisor-sigint.json`, and associated logs verify normal demo startup/admission and process cleanup

Large generated artifacts are ignored and must be reproduced in a new workspace. [The committed screenshot](images/poc.png) provides a small visual reference. Trace inspection: `npx playwright show-trace artifacts/verification/<trace>.zip`.

## Meaningful failed experiments and fixes

1. Native i386 socket calls were denied by the cloud. The verified, isolated QEMU runtime runs the unchanged server successfully; the x86_64 source fallback was not completed. See [ADR 0003](decisions/0003-isolated-server-runtime.md).
2. Immediate vehicle reset raced an in-flight driver packet. The fixture now waits for observed on-foot state before final corrections and rejects seat requests during reset.
3. Passenger self position stalled while incoming vehicle snapshots continued. Passenger pose and network publication now follow received state independently of rendering, with received velocity and a nonnegative frame delta.
4. Fragment rejection exposed use-after-free, missing-channel lookup, non-byte-aligned concatenation overflow, and a legacy queue deletion-type mismatch. Worker-only patches and real RakNet regressions now pass Release and AddressSanitizer/leak detection without suppressions.
5. Fixed crash-recovery sleeps raced server slot expiry. Verification now waits for the observed upstream disconnect. Playwright's focus override hid natural tab visibility changes; a pinned test-only adapter disables that override before switching real tabs.
6. Direct signals to the official server could hang or abort during shutdown under QEMU. The demo keeps its console input open and requests `exit`, with a bounded forced-stop fallback. Console shutdown passed repeated probes; the supervisor checks cover termination and a Ctrl+C-style process-group interrupt. A hung bootstrap process from the initial experiment was explicitly removed before the final demo run.

The native initialization fixture is independently packed from the pinned upstream schema and passed through actual RakNet reassembly and the worker decoder. It is not a native GTA packet capture or a full captured RakPeer RPC-envelope fixture. See [native validation details](../native/README.md).

## Remaining compatibility gaps

Original GTA clients, original SA-MP servers, public servers, complete RPC coverage, GTA assets, combat, realistic physics/collision, WAN deployment, accounts, browsers other than Chromium, and hardware GPU performance remain unverified. This local subset is not a production gateway security audit or a claim of general SA-MP compatibility.

The next separately scoped milestone should establish one native-reference interoperability slice and its asset provenance, then expand a recorded RPC/packet compatibility matrix. Keep the current local acceptance suite as a regression gate.
