# Project status and continuation

Last updated: 2026-09-07.

## Current result

Research and initial planning are complete. Select **SA-MP 0.3.7 via a native gateway**, using pinned open.mp as the first test server. The [decision](decisions/0001-protocol-and-scope.md), [architecture](architecture.md) and [roadmap](roadmap.md) are the durable project record.

Three parallel research agents investigated MTA, SA-MP/open.mp, and browser/engine feasibility. The primary agent cross-checked decisive claims against official documentation and repository code and consolidated the plan. No server was run, no native player was connected, no browser runtime was built, and no interoperability or performance claim has been validated.

## Milestone ledger

| Milestone | Status | Evidence / next gate |
| --- | --- | --- |
| R0: compare protocols and write plan | Complete | Three research reports; ADR 0001; architecture and roadmap |
| M0: reproducible lab | Pending | Release hash, config, gamemode, dependency/license inventory, native fixture |
| M1: native replacement client | Pending | Client-direction RakNet/SA-MP join, spawn and idle sync |
| M2: browser gateway | Pending | Independent browser sessions and tested delivery behavior |
| Runtime experiment / ADR 0002 | Pending | Measured small scene and engine tradeoff |
| M3: on-foot mixed clients | Pending | Native and browser observe the same movement |
| M4: world/assets | Pending | Local import, collision, bounded streaming |
| M5: friends driving MVP | Pending | Driver/passenger interoperability |
| M6–M8: coverage, hardening, hosted alpha | Pending | See milestone exit criteria |

## Assumptions and unresolved preferences

- Begin with a controlled server, then expand compatibility. The user was asked this preference during research; no answer had arrived when this plan was written. This assumption does not justify replacing the legacy wire protocol with a custom server API.
- First platform: desktop browsers with keyboard/mouse, initially Chromium plus a second browser engine. Mobile is deferred until runtime budgets and controls are understood.
- Browser performs gameplay/rendering locally; a hosted gateway is acceptable as the practical transport architecture. No plugin/native helper on the browser user's device.
- Supported GTA data can eventually be selected locally by the player. Exact data variant, availability of a native reference installation and distribution terms remain unresolved.
- Product code license, renderer, physics library and final web transport library remain undecided; narrow spikes should resolve them with evidence.

## Risk register

| ID | Risk and present evidence | Experiment / response | Gate |
| --- | --- | --- | --- |
| R1 | open.mp RakNet code is server-oriented; independent client admission unproven | Adapt client direction/auth and compare a normal player session; separate query from join | M1 |
| R2 | open.mp success may not reproduce original SA-MP behavior | Maintain an independent original-server fixture and label results by server/build | M1, M7 |
| R3 | Legacy RakNet and other code have separate license/provenance constraints | Record exact terms per dependency before vendoring; choose a documented reuse/independent implementation path | M0 |
| R4 | Rendering can work while collision, animation or vehicle behavior diverges from native GTA | Measured shared world slice, native observation, one vehicle before broader content | Runtime, M3–M5 |
| R5 | Assets/format variants and local reference installation may be unavailable | Use synthetic fixtures initially; record native and asset-dependent tests as pending | M0, M4 |
| R6 | Public server gamemodes/custom-client checks exceed supported behavior | Feature/admission ledger and per-server testing; narrow supported set | M6–M7 |
| R7 | Browser transport delay, loss or throttling causes stale state | Compare WSS/WebRTC, bounded buffers, epochs, tab and impairment tests | M2–M3 |
| R8 | Shared gateway IPs/global native state cause admission or session isolation problems | Two-session test first, separate workers initially, measured connection limits | M2 |
| R9 | MTA transport/anti-cheat and Lua loading rely on unavailable module internals | Defer MTA; require new evidence before revisiting | ADR review |
| R10 | Gateway per-session cost or browser memory makes deployment impractical | Benchmark 8-player load and real asset slice before public alpha | M4, M7 |

## Next concrete task

**Execute M0, then begin the native M1 admission spike.** The first implementation PR should contain:

1. A reproducible pinned open.mp server recipe, generated configuration and tiny Pawn test gamemode.
2. A dependency/source manifest, with exact release artifact hashes and the licensing decision for any imported transport code.
3. A headless native probe that clearly distinguishes UDP discovery, transport acceptance, player join and spawn. It may initially prove only the first stage; report the others as pending.
4. A fixture/capture format and updated status with exact commands, outputs and failure state. Native comparison is required before declaring full M1 success.

Keep native protocol investigation focused before writing a production gateway or importing a full city. The next acceptance objective is a **normal player session visible to a native client**, not a polished landing page.

## How to resume after a new session

1. Read this file and ADR 0001, then the next milestone in the roadmap.
2. Read the research report relevant to the next uncertainty; use pinned links to reproduce findings. `.context/research/` clones are disposable and may not survive a new workspace.
3. Check working-tree changes and existing test results before editing. Do not infer a milestone passed from code presence.
4. Append a dated entry below with outcome, evidence location, remaining blocker and next action. Move resolved assumptions into decisions and update the risk/compatibility ledgers.

## Work log

### 2026-09-07 — Initial research

Inspected all four user-provided sources plus official open.mp, MTA and browser documentation. Found decisive MTA closed-module dependencies, SA-MP's inspectable server-side reference and client adaptation gap, and SanAndreasUnity's separate multiplayer and browser portability limitations. Selected SA-MP and wrote staged acceptance gates. Reviewed the architecture and roadmap with the protocol and runtime research agents. Checked all 8 Markdown files for balanced code fences, all 17 local links and 43 unique pinned source paths against the research checkouts; all passed. Implementation tests are not applicable yet.
