# Project status and continuation

Updated 2026-09-07. The accepted implementation scope is [the browser PoC plan](poc-plan.md), which supersedes the broader roadmap's immediate native-GTA comparison gate. SA-MP 0.3.7 through separate native workers remains the selected protocol architecture.

## Current implementation

The unchanged official open.mp release runs locally. Two ordinary, non-NPC protocol workers and two independent browser sessions have joined, spawned, exchanged server-routed walking/chat, and shared a car with driver/passenger synchronization. The browser uses original Three.js geometry and arcade collision/handling. Commands allocate seats through the Pawn fixture and standard placement RPCs.

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

The durable next stage after this PoC is a separately agreed native-reference interoperability slice, with legal user-provided assets and an original/native comparison fixture. Public-server admission, broader RPC coverage, cross-browser behavior, network impairment, realistic GTA collision/handling, asset streaming, and deployment remain separate gates in the long-horizon roadmap.

## History

Research compared MTA, SA-MP/open.mp, and browser/runtime feasibility with parallel agents. MTA's unavailable transport/anti-cheat internals made SA-MP the more inspectable initial target. The user then approved the narrower placeholder PoC and its local two-browser acceptance criteria. Parallel implementation covered the runtime fixture, native protocol, and browser; the primary agent integrated the gateway, verification, and durable project record.
