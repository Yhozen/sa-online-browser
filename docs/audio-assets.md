# Original neighborhood audio

The neighborhood now has an original sound kit for walking, jumping, sharing the coupe, and the server-scored driving challenge. The editable source is [`tools/audio/synthesize.mjs`](../tools/audio/synthesize.mjs). Every sound is synthesized mathematically from authored oscillators, filtered deterministic noise, envelopes, and original short note patterns. No GTA recordings, music, sample libraries, downloaded effects, voices, or image/audio generation services are used.

Original synthesis code, PCM exports, and this document are **GPL-3.0-or-later**, under the repository license. `apps/browser/public/audio/inventory.json` records descriptions, byte lengths, durations, loop flags, and SHA-256 digests for all 16 files.

## Assets and regeneration

Run `node tools/build-audio.mjs` (or `npm run build:audio` when wired into the root scripts). Ordinary setup and browser builds consume committed WAV files and do not regenerate them or call any external service.

| Files | Purpose |
| --- | --- |
| `engine-idle.wav`, `engine-load.wav` | Seamless harmonic exhaust/air loops; observed speed and acceleration change pitch and crossfade. |
| `tire-roll.wav` | Seamless filtered road contact; gain follows actual vehicle speed. |
| `footstep-a.wav`, `footstep-b.wav` | Alternating shoe contact, scheduled by distance walked rather than render frames. |
| `jump.wav`, `land.wav` | Push-off and two-foot landing derived from actual on-foot state. |
| `door-open.wav`, `door-close.wav` | Seat exit and confirmed server seat placement. |
| `countdown.wav`, `start.wav`, `checkpoint.wav`, `finish.wav`, `reset.wav` | Short original feedback for observed activity events. |
| `horn.wav` | Short dual-frequency horn, driven by the ordinary replicated SA-MP in-car key bit 2. |
| `ambience.wav` | Quiet 24-second wind/leaf loop with sparse original synthesized birds. |

Exports are mono, 24 kHz, signed 16-bit PCM WAV. Total payload is **1,691,264 bytes (1.61 MiB)**, plus the small inventory. The browser resamples decoded buffers to its device sample rate; `gameAudio.status.decodedBytes` reports actual allocated PCM storage. At 48 kHz this is approximately 6.45 MiB. This is audio memory, separate from texture memory. The new audio does not alter canvas size, native DPR, graphics presets, simulation, or network cadence.

Loop noise is circularly filtered, and harmonic frequencies complete integer periods. Continuous loops have no fade-to-silence seam. One-shot envelopes enter and leave near zero. Exports preserve headroom; a restrained master compressor limits summation peaks. These are deliberately lightweight original game sounds, not recorded engine realism or licensed radio music.

## Integration contract

`createGameAudio()` in [`apps/browser/src/audio.ts`](../apps/browser/src/audio.ts) creates no `AudioContext` and downloads nothing until `unlock()` is called from a real gesture. Joining, pressing the sound button, or changing volume can unlock it. The call catches unavailable audio and loading failures; a sound failure does not prevent multiplayer admission.

The module fetches `/audio/inventory.json` and its assets from the **page/static origin**, respecting Vite's base URL. This remains correct when `VITE_GATEWAY_ORIGIN` points to a separate websocket/API server. Every file is length-checked and SHA-256 verified before decoding; a modified or missing asset produces an actionable retry message. Verification requires HTTPS or localhost, consistent with the supported local/private secure browser deployment.

The browser supplies an `AudioFrame` every 100 ms, independently of drawing:

```ts
const audio = createGameAudio();
void audio.unlock(); // Inside a real join/sound gesture.
audio.update({
  connected: self.spawned,
  groundZ: scene.groundZ,
  listener: { position: cameraPosition, forward: cameraForward, up: [0, 0, 1] },
  self: { id, position, velocity, mode, vehicleId, keys },
  peers: observedPeers,
  vehicles: observedVehicles, // { id, position, velocity, occupied }
});
audio.cue("checkpoint"); // Only after the corresponding observed server event.
```

Coordinates remain the existing meter-scale, Z-up world; the Web Audio listener receives the camera's actual forward and up vectors. Occupied nearby vehicles get HRTF spatialized engine/tire loops. Driver and passenger hear the same observed vehicle motion. Local movement cues stay centered; peer footsteps, door sounds, and horn cues use peer positions. Horn state comes from the existing driver key field, so friends hear it through the normal server-routed synchronization path. The module sends no network messages.

`setVolume(0..1)` and `setMuted(boolean)` persist under `arroyo-audio-v1`. Defaults are 65% volume and unmuted, subject to browser gesture unlock. Malformed preferences fall back safely. `.preferences` and `.status` are read-only snapshots for the HUD/diagnostics. Status includes loading state, actionable error text, effect/engine counts, loaded asset count, and decoded bytes.

There are at most **8 active vehicle emitters**, each with three loops, **24 simultaneous short effects**, and **1 ambience loop**: 49 source nodes total. Only the nearest 12 actors contribute local/peer state-derived effects, and sources beyond 90 meters are omitted. Horns repeat at most every 650 ms while the observed key remains held. Explicit activity cues have their own cooldown. These bounds prevent unbounded voice queues while retaining spatial peer sound.

Disconnect clears every sound source and event history. Hidden pages suspend the context and stop their scene; rejoin or the sound button resumes from a gesture. If gameplay snapshots stop arriving for 1.5 seconds, a separate watchdog stops stale engine/ambience loops. Page exit disposes listeners, pending fetches, buffers, sources, and the audio context. Teleports, prolonged gaps, first snapshots, and resets do not replay accumulated footsteps or produce false landings.

## Verification and limitations

`node --experimental-transform-types --test tests/audio.test.mjs` verifies deterministic reproduction and checksums of all committed exports, WAV metadata, bounded sample levels, audible content, loop continuity, distance-based step cadence across 20–250 ms updates, jump/landing/seat changes, collision-safe exit distance, correction/disconnection silence, spatial peer events, bounded nearest engine selection, horn key behavior, and malformed input/preferences.

`node --test tests/audio-browser.test.mjs` uses a separate ephemeral HTTP port and actual Chromium Web Audio. It verifies gesture unlock, all 16 asset decodes, actual nonzero PCM, correct left/right spatial reversal, zero output after mute/disconnect, stored preferences after reload, finite engine allocation, stale-snapshot watchdog cleanup, context disposal, and an actual corrupt-asset checksum failure followed by successful retry. Run headed with `xvfb-run -a env POC_HEADLESS=0 node --test tests/audio-browser.test.mjs`. The headed run additionally switches real Chrome tabs, verifies hidden-page suspension, freezes/resumes the hidden page, and verifies gesture-based recovery. Headless Chromium does not reliably hide an audible page when another tab activates, so that explicit lifecycle case runs only in headed mode; it does not inject a synthetic visibility property.

The test records observed PCM energy, errors, an interactive-page screenshot, and a Playwright trace in ignored `artifacts/audio/`. These establish browser behavior and signal generation; they are not a human listening assessment or a claim of realistic recorded engine acoustics. Building/terrain audio occlusion, interior reverb, surface-specific footsteps, music/radio, voice chat, and physical drivetrain/gearing audio remain future work.
