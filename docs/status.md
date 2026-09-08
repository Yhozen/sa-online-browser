# Project status and continuation

Updated 2026-09-07. The current accepted scope is [the Arroyo neighborhood plan](neighborhood-plan.md), preserving the working [browser PoC subset](poc-plan.md). Full neighborhood and retained-yard acceptance is running; preliminary route, collision, loading and lifecycle checks have passed. SA-MP 0.3.7 through separate native workers remains the selected protocol architecture.

## Current implementation

The unchanged official open.mp release runs locally. Two ordinary, non-NPC protocol workers and two independent browser sessions have joined, spawned, exchanged server-routed walking/chat, and shared a car with driver/passenger synchronization. The browser now loads original Blender GLB houses, props, a rigged human and a sports coupe, with shared scene geometry and arcade collision/handling. Commands allocate seats through the Pawn fixture and standard placement RPCs.

The cloud desktop WebGL startup failure is fixed with `npm run open:poc`, which launches a separate Chrome profile with the same SwiftShader graphics flags used by verification. The failing desktop Chrome was running with `--disable-gpu`; the earlier acceptance results only covered explicitly enabled software WebGL. Unavailable graphics now produce a recovery screen before networking starts. See [run and recovery instructions](../README.md#webgl-startup-errors).

Validation of this fix: three headed graphics regressions passed (software WebGL, browser-disabled WebGL, context exception/retry), plus type checking, production build, three gateway tests, and three native CTests. The unchanged headed multiplayer end-to-end scenario passed against an isolated fixture on HTTP 3200 / UDP 7778, with only test paths and ports adapted. An initial run missed the timed car-distance threshold while an extra software-rendered game window was open; the next attempt encountered a concurrently restarted demo on port 3000, so verification moved to the isolated fixture. The launcher was also visually checked on the actual cloud desktop. The historical full acceptance/soak results below were not rerun for this fix; future full verification includes all eight browser scenarios.

| Milestone | Status | Evidence |
| --- | --- | --- |
| Accepted plan and glossary | Complete | ADR 0002, poc-plan.md, CONTEXT.md |
| Reproducible runtime | Complete for cloud fixture | Pinned release/package hashes; isolated Debian/QEMU recipe; unchanged server listens on UDP 7777 |
| Native legacy sessions | Complete for PoC subset | Normal-player admission, ten-minute connected session, directional/fragment/invalid-input tests and ASan |
| Browser walking/chat/driving | Passed | Both directions, shared vehicle, seat contention, exit/swap, reset/teleport, screenshots and decoded state |
| Headed failures/lifecycle | Passed | Duplicate nickname, crash, unavailable server/restart; twenty browser connect/disconnect cycles |
| Full headed acceptance and ten-minute soak | Passed | Five scenarios; 79 active rounds / 602.817 seconds; zero uncaught browser errors |
| Native GTA / original SA-MP / public servers | Deferred, unverified | Separate compatibility work; not implied by this PoC |

## Experiments and decisions

- **Runtime:** native execution of the official 32-bit binary reached denied socket syscalls (`EACCES`) under this cloud's syscall restrictions. An x86_64 source fallback was investigated but not completed. Running the unchanged release with a checksum-pinned `qemu-i386-static` and isolated Debian bookworm i386 libraries successfully translates the calls. Host libraries remain untouched.
- **Client transport:** the pinned RakNet server fork needs client-direction transformation, cookie/auth handling, guarded server-only behavior, and bounded fragment acceptance. These adaptations affect only the worker dependency. The upstream binary is unchanged.
- **Corrections:** browser state echoes worker `controlRevision`; delayed snapshots cannot undo server teleports, heading changes, or seat transitions. The worker waits for an acknowledged placement before transmitting vehicle state.
- **Headed reset failure, corrected:** a final in-flight driver packet could overwrite an immediate fixture vehicle reset. The fixture now waits for confirmed on-foot state before finalizing reset, and acceptance explicitly checks the vehicle reset position. The next headed end-to-end run passed.
- **Soak divergence, corrected:** the first active round found a passenger browser position lagging the server by two units. The trace proved that 70 incoming vehicle updates reached the browser while its own passenger position waited on animation-frame simulation. Passenger state now updates and publishes directly from received vehicle snapshots at the server interval, using received velocity. Frame deltas are also clamped nonnegative. The full ten-minute gate subsequently passed.
- **Review fixes:** collision-free exit selection prevents becoming trapped beside barriers. Hidden or frozen tabs explicitly disconnect and clear entities/input; ordinary window blur only clears input. Disconnect reasons survive WebSocket closure. Malformed fragment review exposed memory ownership/alignment hazards in the adapted dependency; all three native CTests now pass AddressSanitizer with leak detection and no suppressions.
- **Automation corrections:** a fixed eleven-second wait after worker crash raced actual server slot expiry; the test now waits for the observed disconnect before rejoining. Playwright 1.59.1 forces focus/visibility on its internal CDP session. The hidden-tab regression disables that override through a pinned test-only adapter, then switches real Chromium tabs; it does not inject document visibility or gameplay state.
- **Verification hardening:** native checks remain active with `-DNDEBUG`, with a deliberate failing-fixture negative control. Initialization bytes are independently packed from the pinned upstream schema, fragmented/reordered, and decoded. Lifecycle checks observe worker exit and server slot release, not only gateway session-map deletion.

## Continuing work

The approved local PoC is complete. See [the result record](poc-results.md) and [machine summary](poc-verification.json). Run `npm run setup:poc`, then `npm run verify:poc` with ports 3000/7777 free to reproduce acceptance. Start the demo with `npm run dev:poc`. Keep generated runtime downloads and recordings ignored; committed summaries and source hashes identify the tested implementation.

The accepted continuation is Arroyo, then a server-scored checkpoint challenge and private remote play, followed by a native-reference interoperability slice with user-provided assets and an original/native comparison fixture. Public-server admission, broader RPC coverage, cross-browser behavior, network impairment, realistic GTA collision/handling, asset streaming, and deployment remain separate gates in the long-horizon roadmap.

## History

Research compared MTA, SA-MP/open.mp, and browser/runtime feasibility with parallel agents. MTA's unavailable transport/anti-cheat internals made SA-MP the more inspectable initial target. The user then approved the narrower placeholder PoC and its local two-browser acceptance criteria. Parallel implementation covered the runtime fixture, native protocol, and browser; the primary agent integrated the gateway, verification, and durable project record.

## Active: Arroyo neighborhood

Accepted neighborhood implementation is underway. The existing yard remains the multiplayer regression fixture. Art direction and gates: [neighborhood plan](neighborhood-plan.md). Original concept and texture inputs generated with the imagegen skill; official Blender download returned a Cloudflare challenge, and the official mirror supplies the pinned release/checksum.

Scene contract and first asset kit are implemented. The original Blender rig exports all four requested clips. Initial desktop inspection caught a minimap covering the join button at 720p and competing old/new camera updates; both are fixed before acceptance testing. Imported geometry and materials are shared rather than disposed on player reconnect.

Cloud graphics tuning: first two-view PBR run was below the FPS target. Low mode now uses shared baked vertex shading, reduced internal resolution, simplified fence wires and merged coupe body materials. Geometry remains under budget. Camera test initially aimed through the gap between houses; move to an actual facade before asserting obstruction. Scene mismatch/asset retry and four scene unit checks pass.

Final review caught head/roof clipping after the coupe's cabin was lowered. Seat anchors and the seated pose now fit a measured ceiling/floor envelope, checked from the exported skin and animation. Same-tab reconnects explicitly dispose skeleton textures. An initial recorded ten-minute neighborhood session completed 92 active rounds / 603.756 seconds without networking divergence, but missed the FPS target with capture overhead (~15 FPS). Ordinary-play performance is now measured separately from the recorded soak; both measurements will be retained. The first unrecorded benchmark reached about 20 FPS / 67 ms p95. Initial warm-up geometry uploads are excluded from the resident-tab leak check.

September 8: the complete 14-scenario run passed, including both ten-minute soaks and both supervisor shutdown probes. Final placement review then moved poles/lamps off the turning circle and road edges, attached wires to actual pole placements, added the missing four decorative palm colliders and grounded the street sign. Geometry checks now enforce those constraints. Actual desktop automation passed after removing a leftover packet-handler flag that briefly marked seated peers hidden between frames. Its Standard captures submitted at most 143,870 triangles / 126 calls, and a test-only WebGL storage audit measured 13.7 MiB including bones and shadow textures. The final source revision is being rerun through full acceptance before publishing the result record.
