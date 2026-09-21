# Arroyo Loop: implementation and verification record

**Draft, 2026-09-20 — final browser, regression and visual reruns are pending.** The [accepted activity plan](working-game-plan.md) adds a server-scored driving activity, original community props, original sound and vehicle feedback to the existing neighborhood. The evidence below records completed milestones; it does not certify subsequent working-tree changes. The earlier [visual upgrade record](visual-upgrade-results.md) remains historical evidence for its own tested revision.

## Implemented scope

Arroyo Loop uses the existing coupe, a three-second stationary countdown and nine ordered checkpoints around the neighborhood streets. A driver can bring a passenger, finish together, compare the five fastest runs from this server session, cancel, rematch or swap seats. The Pawn gamemode owns run generation, checkpoint progression, elapsed time, cancellation and records. Driver/passenger departures, reset, teleport, seat changes, disconnect and the three-minute timeout terminate an active attempt without awarding a finish.

The unchanged pinned open.mp server sends ordinary race-checkpoint RPCs and bounded, versioned server ClientMessage notices. Each gateway session still forwards only its own native worker's upstream events. Player chat cannot award a finish. The browser replica displays received state and briefly interpolates its timer; it cannot advance checkpoints or invent a result, and shows a waiting state when notices stop. Browser-simulated movement remains trusted input, so this is not an anti-cheat implementation.

The scene manifest defines the course and prop placement, and the runtime recipe generates the corresponding Pawn constants. Five original editable Blender assets add a club board, formed pylons, wood/metal benches, hollow planted concrete containers and field yuccas, with matching collision. The runtime adds an original textured checkered start marking, checkpoint ring and direction indicator, radar route, activity panel and records. Sign lettering is baked into one original enamel texture, with editable vector glyphs retained; no separate letter geometry remains to cause depth artifacts. The original characters, two outfits, animated occupants and existing neighborhood assets remain.

Sixteen original mono sound exports cover engine idle/load, tires, alternating footsteps, jump/landing, vehicle entry/exit, countdown/start/checkpoint/finish/reset, horn and ambience. Sound starts after a user gesture, verifies the asset inventory, supports saved mute/volume settings, spatializes received peer activity and bounds voices. Hidden/frozen sessions suspend audio; disconnect, stale integration updates and disposal retire active voices. The horn travels as an ordinary driver key bit. Vehicle presentation adds signed wheel rolling, front-wheel steering and brake/reverse lamps with per-vehicle material ownership. Space operates the handbrake while driving.

Ordinary setup uses committed GLBs and WAVs. Asset authoring uses `tools/assets/activity-kit.py` and the existing Blender build pipeline; sound exports reproduce from `tools/audio/synthesize.mjs` through `npm run build:audio`. A new Docker image or remote deployment has not yet been validated for this milestone.

## Completed evidence

| Check | Observed result | Local evidence |
| --- | --- | --- |
| Extended native protocol/state machine | All 15 checks passed against unchanged open.mp v1.5.8.3079, with 2,914 independent server observations. Covers rejected starts, horn press/release, false starts, late join, spectator cancellation rejection, chat spoof rejection, checkpoint order/passenger exclusion, crew finish, role swaps, exits, teleport/reset/disconnect, server restart, the actual 180-second timeout and six solo rematches retaining a sorted top five. | `artifacts/challenge-native-extended/summary.json`, player JSONL files and fixture/server logs |
| Browser driving activity | Two normal browser players completed all nine gates using ordinary keyboard driving. Server, driver and passenger agreed on **60,486 ms** and **50,300 ms**, with driver/passenger roles exchanged for the second lap. The artifact records 12 scenario assertions and zero captured errors. | `artifacts/activity/results.json`, `observations.json`, two traces, videos and finish/countdown screenshots |
| Position agreement | Three samples met the existing 0.5-unit criterion: maximum browser/server distance **0.006114 units**, maximum browser/peer distance **0.000479 units**, maximum server sample age **133 ms**. These are sampled agreements, not a continuous latency bound. | `artifacts/activity/agreements.json` |
| Focused units and exported assets | **21 tests passed** across challenge replica/course validation, original sound reproduction/event derivation, vehicle geometry/material lifecycle and activity exports. | `tests/challenge-state.test.mjs`, `audio.test.mjs`, `vehicle-presentation.test.mjs`, `activity-assets.test.mjs` |
| Activity DOM/accessibility lifecycle | **One isolated Chromium test passed** after the accessibility fix. A MutationObserver confirms unchanged refreshes and moving distance do not rewrite the polite live region; actual DOM/accessibility checks cover phase/gate/reason/staleness changes, collapsed-panel announcements, disconnect/rejoin and disposal. Typecheck also passed. No screen-reader speech output was tested. | `tests/activity-browser.test.mjs` |
| Real Chromium Web Audio | Sixteen assets decoded; stereo energy followed the source from right to left. Mute and disconnect produced measured RMS 0. Engine allocation stopped at eight, the update watchdog stopped loops, corrupt-asset verification failed safely and retry succeeded with one AudioContext. Zero captured errors. | `artifacts/audio/observations.json`, `trace.zip`, `verified.png` |
| Exported coupe presentation | Actual GLB renders show steering, brake and reverse states in Standard/Low at native 1280×800, DPR 1, with zero captured errors. This isolated diagnostic is separate from multiplayer proof. | `artifacts/vehicle-presentation/observations.json` and four captures |

The native test deliberately positions protocol synchronization samples; its short finish time is a state-machine check, not a driven lap. The browser activity run provides the separate keyboard-driving evidence and records 5,245 independent server events. It drives in Low and captures the final plaza in Standard. Both use a native 1280×720 drawing buffer; the 640×360 video encoding does not change rendering resolution.

The current audio artifact is a headless run and explicitly leaves real tab-visibility suspension for a separate headed run. It must not be cited as completed visibility/freeze verification.

## Evidence identity and remaining reruns

The native summary was written at 18:06:48 UTC and records source and executable SHA-256 values with no sources changed during its run. Its six recorded source hashes still matched the reviewed working tree when this draft was prepared. The activity result was written at 18:13:23 UTC; it predates the latest input, vehicle-lifecycle and visual fixes and does not contain a complete browser-source hash manifest.

| Artifact at draft time | SHA-256 |
| --- | --- |
| `artifacts/challenge-native-extended/summary.json` | `3439f9d84784156ddd507fdd55b14aa54923d094e2dc0ca110da606df77f7b7d` |
| `artifacts/activity/results.json` | `79b38e415fcb1788b899339017506cd1dc3713ec4c504dfeaa56f49532c7c409` |
| `artifacts/audio/observations.json` | `b6f105c488db3355f605820f85bb5221107ec6d32c6f256669d974d104d186d9` |
| `artifacts/vehicle-presentation/observations.json` | `80974f3628776e055c80970e223897d11dd0fd0caa0780ff96ac0f3190e89ddf` |

Independent review found that button Enter/Space activation was intercepted by gameplay shortcuts and that leaving a moving car retained stale vehicle speed. Fixes and browser regressions now cover focused activity/audio controls, driver exit with a passenger and direct driver-to-passenger seat changes. An isolated Chromium replay confirms the updated keyboard handlers activate buttons without jumping and retain canvas shortcuts. Activity announcements now describe phase, gate, cancellation reason and stale-server status separately from the frequently changing visible distance, and their DOM lifecycle test passes. The full activity regression must still rerun after these edits.

Final acceptance still requires the completed activity rerun, the retained yard/neighborhood suite including twenty reconnects and both ten-minute sessions, headed audio lifecycle verification, fresh actual-desktop captures, and a final source/artifact manifest. Preserve failed attempts and their reasons alongside the final result; do not replace these pending items with passes from an earlier revision. The accepted minimum active-work duration is tracked in the plan and has not been closed by this draft.

## Visual judgement and resolution

The first integrated actual-desktop inspection used native 1672×941 Standard rendering and server-confirmed activity state. Its assessment at `.dream-loop/gameplay-2026-09-20/round-1/assessment.md` explicitly marked the frame **not judge-ready**. It identified a darkened neighborhood/black original street sign after activity presentation, an overly prominent checkpoint wall, crowded HUD placement, initial sign depth issues and overly uniform start paint. Visual fixes and material isolation are in progress; the retained capture cannot establish that they landed.

The first generated driving target misplaced the checkpoint as a distant arch and was superseded by a new edit of the actual current composition. The corrected target preserves the horizontal ring, real radius and six-meter distance. The first independent review of this activity slice scored **4.1/10, Tier 1**: layout passed, while lighting, reflections and atmospheric color blocked the next gate. It also requested denser planting and finer paint/road wear. These scores use a new target and are not directly comparable to the earlier visual milestone's 5/10 result.

The next source pass sharpens the physically based car coat/glass reflection lobes, preserves their intended environment intensities, adjusts direct/fill light, reduces asphalt texture scale, replaces large square paint chips with an original alpha texture, and adds 25 original yuccas in clear garden beds. New planting exposed a pre-existing grass/porch clearance gap; enlarging the actual exclusion margin restored the geometry test without weakening it. A subsequent headed capture briefly showed a blank world/radar and then a black street-sign texture. This candidate was withheld from art scoring. Passive fresh-profile diagnosis is distinguishing long paint stalls from actual context loss; the root cause is not yet confirmed. Final live capture, art verdict and regression remain pending.

Both presets preserve viewport dimensions multiplied by native DPR. **FPS optimization is out of scope:** the user reports 120 FPS on their hardware, and cloud software-renderer timing is diagnostic only. This milestone does not reduce resolution, asset detail or quality to meet a cloud timing target.

## Reproduce

```sh
npm run setup:poc
npm run dev:poc
```

With fixture ports free, run the focused or complete verification commands:

```sh
npm run verify:activity
POC_CHALLENGE_EXTENDED=1 POC_CHALLENGE_ARTIFACTS=artifacts/challenge-native-extended python3 native/challenge-integration.py
npm run test:audio
node --test tests/activity-browser.test.mjs
POC_HEADLESS=0 xvfb-run -a node --test tests/audio-browser.test.mjs
node tools/verify-vehicle-visual.mjs
npm run verify:poc
```

Local traces, videos and raw observations are ignored artifacts. This record will need final evidence updates before delivery. Persistent progression, traffic/pedestrians, interiors, combat, additional vehicle classes, remote invitations/WAN validation and original GTA/SA-MP-client interoperability remain separate milestones.
