# Arroyo: activities and missing game assets

Accepted implementation slice, 2026-09-20. The user asked for the missing assets and game features, with at least three hours of active work. `origin/main` was pulled successfully before implementation (`50963d1`). Work began at 17:37:45 UTC; earliest wrap-up is 20:37:45 UTC. The supplied screenshot restates the original browser multiplayer goal; it adds no new geographic or asset requirement.

## Playable outcome

Turn the existing shared-car neighborhood into a place with an activity: **Arroyo Loop**, a server-scored time trial around the existing streets. A driver may bring a passenger, start a three-second countdown, complete nine checkpoints in order, see the server's finish time, compare session records, and rematch or swap seats. Walking, chat, free driving, reset and reconnect remain available. The retained yard stays a regression fixture.

The server owns countdown, run generation, checkpoint order, elapsed time, completion and scores. Ordinary SA-MP race-checkpoint RPCs supply course markers; bounded versioned fixture notices travel through ordinary server ClientMessage RPCs. The gateway continues to forward each worker's upstream events without sharing gameplay between browsers. Browser-simulated motion is still trusted input: this is not an anti-cheat implementation or new proof of original GTA-client compatibility.

## Missing assets and feedback

- Original editable Blender assets: a community time-trial board, formed race pylons, wood/metal park benches and planted concrete planters. Place them beside the streets with matching collision, preserving the driving route and spawn/reset coordinates.
- Native 3D checkpoint markers, next-checkpoint direction, a minimap route and supported activity state. Add a compact challenge panel, session results and contextual action hints.
- Original engine, tire, footsteps, landing, vehicle-entry and activity audio. Audio unlocks on a user gesture, follows mute/volume preferences, uses spatial peer state, and suspends/cleans up with the session. No copyrighted game audio.
- Improve immediately relevant vehicle presentation and player affordances where the integration audit identifies gaps. Keep all existing original assets, two outfits, animated occupants and physical materials.

## Course and lifecycle

Start at the existing vehicle reset `[0,6,10]`, facing north. Ordered checkpoints are `[0,12]`, `[30,12]`, `[58,12]`, `[58,-18]`, `[58,-48]`, `[28,-48]`, `[0,-48]`, `[0,-18]`, `[0,6]`, all at Z=10 with 4.5-unit radii. These follow the existing manifest roads. Countdown movement cancels the attempt, preventing a head start. Leaving the driver seat, reset, disconnect, timeout or server restart ends the active run honestly; the UI never invents a finish. Scores are session records and disappear with a server restart.

The scene manifest is authoritative for course coordinates and asset placements. The runtime recipe generates Pawn constants from it. New scene/inventory hashes invalidate stale browsers before joining. Ordinary setup consumes committed exports and sound assets; Blender/image services are authoring dependencies only.

## Verification and delivery

Use real browser keyboard/mouse input and independent server observations for countdown, out-of-order progress, finish, passenger visibility, cancellation, role swaps and rematch. Add meaningful protocol/manifest/audio tests, then run retained yard/neighborhood regressions including twenty reconnects and ten-minute sessions. Capture actual headed/cloud-desktop screenshots and traces. Exercise loading, mute, reset and reconnect without hidden state injection.

Follow the existing dream-loop inspection discipline for asset presentation: inspect baseline and live captures, compare useful matched views and obtain an independent fresh review. Generated concepts remain targets, never gameplay evidence. Record unmet visual criteria honestly; the earlier 5/10 visual verdict is not retroactively upgraded by adding features.

Render at full viewport resolution multiplied by native DPR in both presets. **FPS optimization is out of scope.** The user reports 120 FPS on their real computer; software-renderer timing is only diagnostic. Do not lower visual quality, resolution or asset detail to satisfy a cloud target.

Use incremental Conventional Commits and push completed milestones under the existing authorization. Preserve unrelated `skills-lock.json` changes. Document exact tests, failures, source revisions, artifacts and remaining gaps in `docs/working-game-results.md` and update the project status/glossary.

## Remaining larger milestones

This slice does not imply a complete GTA replacement. Ambient traffic/pedestrians, interiors, combat, additional vehicle classes, persistent progression, native-world geometry and original-client interoperability need separate vertical slices. Existing deployment recipes remain usable; private invitations, production moderation and network-latency validation follow this activity milestone.
