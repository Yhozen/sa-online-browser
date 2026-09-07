# Accepted browser multiplayer PoC

Accepted 2026-09-07. Implementation began at 21:22 UTC. This document records the user-approved contract; completed evidence belongs in the status/results records.

## Outcome and scope

Two browser players join unchanged open.mp v1.5.8.3079 as normal SA-MP 0.3.7 players, walk, exchange server-routed chat, share one arcade car, swap seats, and reconnect. Run locally in this cloud workspace with original placeholder geometry. No accounts, externally hosted URL, imported GTA assets, combat, original SA-MP server, or native GTA reference client is required for this PoC. Native-client interoperability remains unverified until separately tested.

Original implementation code is GPL-3.0-or-later. Preserve independent upstream licenses/notices for skills, server distributions, libraries and adapted transport sources.

## Implementation contract

- TypeScript/Vite/Three.js browser with generated capsule players, box-and-wheel car, flat course, fixed 60 Hz simulation, basic collision and remote interpolation.
- Node 24 / ws gateway on localhost, one C++17 native process per browser, JSON-line IPC. Gateway never broadcasts peer gameplay locally.
- Pinned open.mp RakNet client adaptation: directional datagram transform, cookies/auth, bounded reassembly, guard server-only timers/core dependencies, directional RPC and sync codecs. No server networking modifications or NPC bypass.
- Browser messages: join, chat, command, state and disconnect. Native output supplies lifecycle, entities, corrections, chat and failures. Session epochs/sequences and bounded queues prevent stale state.
- Controls: WASD walking/driving, Space jump, Enter chat, E driver request, G passenger request, F exit. Seat requests use ordinary Pawn commands with proximity/reservation checks and normal placement RPCs; only the driver controls vehicle motion.
- Apply server corrections immediately. Release reservations on exit/disconnect/reset. Reset car/reconcile occupants when driver disconnects.
- Reproducible setup/dev/verification scripts; ignored runtime binaries and large evidence artifacts.

## Execution milestones

1. Record plan/glossary/decision; install build/display dependencies; establish unchanged server with isolated i386 loader/libraries. Check release/package hashes. Fallback is pristine same-release x86_64 source build.
2. Compile minimal Pawn fixture: two spawns, one car, chat, seat commands, reset/teleport, structured independent server observations.
3. Demonstrate two native normal-player sessions through join, initialization, class selection, spawn, chat, walking and disconnect. Honor server sync rates and separate packet directions.
4. Connect browser UI/rendering to real worker events; implement walking/chat/corrections/reconnect.
5. Implement stream/placement/removal/driver/passenger/exit and correction vehicle messages; complete route both ways with swapped roles.
6. Automate two isolated Chromium sessions, then headed Chromium under Xvfb, retaining screenshots/video/traces and server/worker evidence.

Implementation annotation: the cloud denied native i386 socket calls. The unchanged official release now runs through checksum-pinned QEMU with isolated Debian libraries. A pristine x86_64 source fallback was investigated but not completed once this release-binary path worked; see [the runtime record](../test-server/README.md).

## Acceptance

Both server player IDs must be distinct and non-NPC. Movement must appear in server observations and the other browser's incoming state. Unique chat arrives exactly once. Server must report driver/passenger in the same vehicle, vehicle movement must follow driver input, and passenger controls must not move it. Simultaneous seat requests yield one driver. Exit/swap, server corrections, duplicate name, unavailable server, worker crash, server restart, close/reopen all behave visibly without fake success.

Settled server/browser positions agree within 0.5 world units within one second on this local fixture. Complete a ten-minute active walk/chat/drive session and twenty sequential connection cycles. Test invalid/truncated payloads, direction-specific fixtures and fragmented initialization. Screenshots alone are insufficient evidence. SwiftShader verifies functionality, not hardware GPU performance.

## Persistence and commits

Use incremental Conventional Commits for docs, runtime, protocol, browser, vehicles, verification and results. Update status on milestones and material failed experiments. Spend at least two hours actively attempting/troubleshooting before declaring an unresolved technical blocker; success can finish sooner. Raise missing credentials/permissions/infrastructure promptly with the exact human action, and continue independent work. AgentMail is optional only if a necessary external service requires email verification.
