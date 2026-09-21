# Arroyo Loop: implementation and verification record

**Draft, 2026-09-20 — final browser, regression and visual reruns are pending.** The [accepted activity plan](working-game-plan.md) adds a server-scored driving activity, original community props, original sound and vehicle feedback to the existing neighborhood. The evidence below records completed milestones; it does not certify subsequent working-tree changes. The earlier [visual upgrade record](visual-upgrade-results.md) remains historical evidence for its own tested revision.

## Implemented scope

Arroyo Loop uses the existing coupe, a three-second stationary countdown and nine ordered checkpoints around the neighborhood streets. A driver can bring a passenger, finish together, compare the five fastest runs from this server session, cancel, rematch or swap seats. The Pawn gamemode owns run generation, checkpoint progression, elapsed time, cancellation and records. Driver/passenger departures, reset, teleport, seat changes, disconnect and the three-minute timeout terminate an active attempt without awarding a finish.

The unchanged pinned open.mp server sends ordinary race-checkpoint RPCs and bounded, versioned server ClientMessage notices. Each gateway session still forwards only its own native worker's upstream events. Player chat cannot award a finish. The browser replica displays received state and briefly interpolates its timer; it cannot advance checkpoints or invent a result, and shows a waiting state when notices stop. Browser-simulated movement remains trusted input, so this is not an anti-cheat implementation.

The scene manifest defines the course and prop placement, and the runtime recipe generates the corresponding Pawn constants. Five original editable Blender assets add a club board, formed pylons, wood/metal benches, hollow planted concrete containers and field yuccas, with matching collision. The runtime adds an original textured checkered start marking, checkpoint ring and direction indicator, radar route, activity panel and records. Sign lettering is baked into one original enamel texture, with editable vector glyphs retained; no separate letter geometry remains to cause depth artifacts. The original characters, two outfits, animated occupants and existing neighborhood assets remain.

Sixteen original mono sound exports cover engine idle/load, tires, alternating footsteps, jump/landing, vehicle entry/exit, countdown/start/checkpoint/finish/reset, horn and ambience. Sound starts after a user gesture, verifies the asset inventory, supports saved mute/volume settings, spatializes received peer activity and bounds voices. Hidden/frozen sessions suspend audio; disconnect, stale integration updates and disposal retire active voices. The horn travels as an ordinary driver key bit. Vehicle presentation adds signed wheel rolling, front-wheel steering and brake/reverse lamps with per-vehicle material ownership. Space operates the handbrake while driving.

Ordinary setup uses committed GLBs and WAVs. Asset authoring uses `tools/assets/activity-kit.py` and the existing Blender build pipeline; sound exports reproduce from `tools/audio/synthesize.mjs` through `npm run build:audio`. A new Docker image or remote deployment has not yet been validated for this milestone.

## Delivery verification — September 21

Latest `origin/main` (`07653ef`) was merged into `bridgetown` at the user's request to finish. Its refined neighborhood, character/coupe, canopy, native-resolution rendering and simulation interpolation are retained. New activity, sound, UI and prop changes are integrated around them. Historical native-Mac results in this repository describe their recorded source revisions, not this combined build.

The merge exposed and repaired concrete integration issues: reverse-lamp extraction now matches the remodeled coupe, parked-car cleanup resets interpolated pose, the surface test includes both plaza pads, and 26 old shrubs yield to solid yucca collision envelopes. Terrain was regenerated through the supported Blender 4.5.13 pipeline with exact provenance; runtime terrain bytes remain unchanged. The combined scene reflection probe was rebaked. Four software-filtered channels out of the 1536×2048 RGBA atlas undershot zero (minimum −0.01014); export now rejects nonfinite values and clamps negative radiance only, preserving positive HDR values.

- **Extended native protocol:** all 15 gates passed; 2,916 independent server observations, actual 180-second timeout, six rematches/top-five ordering, crew lifecycle, horn replication, spoof rejection and server restart. `artifacts/challenge-native-final/summary.json` records source/executable hashes. The native test positions protocol samples deliberately; it is not a keyboard-driven lap.
- **Earlier browser activity run:** two keyboard-driven laps completed in 56,962 ms and 50,151 ms with exchanged roles; sampled maximum browser/server disagreement was 0.007288 units. This run predates the final main merge and is retained as historical evidence only.
- **Merged-build browser and unit results:** see the committed [delivery evidence](working-game-verification.json) for the final run's exact outcomes, source hashes and artifact identities.
- **Headed Chromium audio:** passed under Xvfb after the merge. Sixteen decoded assets, spatial left/right energy, silent mute/disconnect, bounded engines, update watchdog, actual hidden-tab suspension, corrupt-checksum rejection and retry were exercised. Zero captured errors. `artifacts/audio/observations.json` and trace retain raw evidence.

Local logs and large recordings remain ignored under `artifacts/` and `.context/`. The retained full yard/neighborhood suite, twenty reconnects and both ten-minute sessions have **not been rerun on this combined feature revision**. Docker redeployment and native-Mac verification of the combined build are also unverified. Earlier complete native acceptance is not substituted for these missing runs.

A late page-close callback in historical browser artifacts accessed the removed activity panel. Disposal is now idempotent; clear/update/accept/configure ignore late work. A real-DOM Chromium regression passes the dispose → clear → update → dispose sequence. The focused multiplayer run began before this final teardown-only fix; its exact tested revision is recorded separately. Future multiplayer runs also assert errors after closing both contexts.

## Visual judgement and resolution

Dream-loop working targets, exact-composition image-generation prompts, actual screenshots and assessments are retained in ignored `.dream-loop/gameplay-2026-09-20/`. The first independent activity-frame review scored **4.1/10, Tier 1**: layout passed, while lighting/reflections/atmosphere blocked the next gate. Subsequent work replaced floating board lettering with a baked original enamel face, authored start-paint transparency and added 25 original yuccas. An intermediate candidate showed a blank scene followed by a dark sign and was withheld from scoring; fresh-profile diagnosis did not confirm WebGL context loss.

The final merge deliberately retains main's newer lighting and refined hero/environment assets over earlier experimental material settings. The combined scene has **not received a fresh 8/10 art verdict**. The user requested delivery now; this feature milestone does not claim completion of every earlier visual ambition. Generated targets are never presented as gameplay evidence.

Both presets preserve viewport dimensions multiplied by native DPR. FPS optimization remains out of scope: the user reports 120 FPS on their hardware, and cloud software-renderer timing is diagnostic only. No resolution reduction was introduced. The activity plan's earlier resource estimate is superseded by main's larger refined scene; final inventory totals are recorded with delivery evidence and are not presented as satisfying the original 15 MB/300,000-triangle budget.

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

Local traces, videos and raw observations are ignored artifacts. Persistent progression, traffic/pedestrians, interiors, combat, additional vehicle classes, remote invitations/WAN validation and original GTA/SA-MP-client interoperability remain separate milestones.
