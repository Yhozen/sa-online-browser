# Native motion verification — 2026-09-13 UTC

The local player's and driven vehicle's rendered positions now interpolate the
unchanged 60 Hz simulation. Camera following uses the presented position and
orientation. Spawn, server corrections, teleports, seat changes, exits, and
disconnects clear presentation history.

The input/publish timer can run ahead of a queued animation-frame timestamp.
Sampling only the accumulator alpha removed repeated positions but still caused
17.6% variation during a constant-speed walk. Timestamp-aware sampling retains
one additional pose interval and removed that variation in the native browser.

Remote players and vehicles now use a bounded snapshot buffer with a 100ms view
delay. Reported velocities help reconstruct movement intervals independently of
packet arrival jitter; received timestamps anchor the timeline. Interpolation
uses monotone Hermite position curves and quaternion slerp. Missing packets can
extrapolate reported velocity for at most 100ms before holding. Corrections,
implausible teleport jumps, stream/seat transitions, and driver exits clear the
appropriate history. Network authority, raw position replication, and RPCs are
unchanged.

## Native browser results

All results below use **Low**, 1280×720 CSS pixels, native DPR 2, and a
**2560×1440 drawing buffer**. Both clients retained native resolution throughout.
Other continuously rendering game windows were suspended for this run.

| Scenario | Median FPS | p95 frame time | Repeated rendered positions | Repeated simulation positions |
| --- | ---: | ---: | ---: | ---: |
| Walking, one client | 120.5 | 9.8ms | 0 / 324 | 162 / 324 |
| Driving, one client | 120.5 | 9.8ms | 0 / 203 | 102 / 203 |
| Walking, two clients: local | 120.5 | 10.0ms | 0 / 322 | 161 / 322 |
| Walking, two clients: remote | 120.5 | 10.0ms | 2 / 322 | 242 / 322 |

The local walking speed stayed 5m/s after normalization by each frame's elapsed
time. Remote walking retained **14.2% speed variation**, with a maximum 0.500003m
distance between its latest received position and presented position. The view
delay is 100ms; remote motion is improved but still affected by network timing.

An earlier run with the old remote chase measured 48.4% variation and 0.93m lag,
but another controller changed its graphics preset and captured a screenshot
during that run. It is useful diagnostic evidence, not a controlled performance
comparison. Replaying the old chase formula against the final run's same sampled
raw positions and frame times gives 18.3% variation versus the new live 14.2%.
The replay is a trace calculation, not a second native-browser run.

Actual UI/server commands also verified:

- `/teleport` cuts to the authoritative location on the first corrected frame.
- `/reset` completes its real server transition before `/drive` is requested.
- Steering rotates the rendered vehicle by 1.145 radians while respecting the
  simulation's angular-speed limit between display frames.
- Driver and passenger remain visibly seated during shared driving; passenger
  movement input does not control the car.
- Both occupants can exit normally; the unoccupied car stops extrapolating its
  former driver's velocity.
- Two-player raw positions agree within 0.0000004m after settling. No browser
  exceptions were recorded.

These FPS figures do not describe Standard. Standard performance is evaluated
separately with the finished visual scene.

## Jumping into and exiting a vehicle

A separate native Chrome 153.0.8010.37 regression reproduced a retained jump
impulse: press Space, enter with E while rising, drive 3.287m, release movement,
remain seated for 1.5 seconds, then exit with F. The old build launched the player
**0.728m upward at 4.55m/s without another jump input**. The initial jump was
observed at 5.55m/s before the seat request.

The seat and exit handlers now clear the old jump impulse. The rebuilt game
passed the same driver sequence and a stationary passenger sequence using G:
both produced **0m unwanted height and 0m/s upward velocity** during the 1.5-second
post-exit trace, then remained in the idle animation. Actual server seat/exit RPCs
and increasing control revisions were required; no separate position correction
could mask the result. Space remained released, both exits stayed in bounds and
outside the car cabin, and the minimum scene-obstacle clearances after subtracting
the player radius were 13.565m for the driver and 17.565m for the passenger.
No browser exceptions occurred. The test retained a native 2560×1440 drawing
buffer at 1280×720 CSS pixels and DPR 2.

Run this bounded regression with:

```sh
POC_MOTION_CASE=jump-seat-exit POC_MOTION_ARTIFACTS=.dream-loop/motion-jump-after node tools/verify-motion.mjs
```

The default full motion probe also includes these two cases. The intentionally
failing baseline trace is `.dream-loop/motion-jump-before/verification.json`;
the passing fixed trace is `.dream-loop/motion-jump-after/verification.json`.
Both are ignored working evidence. Each run closed only its owned browser window.

## Reproduction and automated checks

Run the game development server and native Chrome with remote debugging port
9333 and background-window throttling disabled, as described in the movement
handoff. Then run `node tools/verify-motion.mjs`. The probe creates and closes
only its own browser windows, uses ordinary UI inputs, and rejects unexpected
preset or resolution changes. It executes global fixture resets, so other test
sessions should be idle. `POC_CHROME_DEBUG`, `POC_URL`, and
`POC_MOTION_ARTIFACTS` override the endpoint and evidence directory.

Final raw evidence is in `.dream-loop/motion-round3/verification.json` (ignored
working material). Earlier evidence remains in `.dream-loop/motion/` and
`.dream-loop/motion-round2/`.

`node --experimental-transform-types --test tests/simulation-clock.test.mjs
tests/snapshot-pose.test.mjs` passes all 13 cases. They cover deterministic
simulation through stalls, 90/120/144Hz presentation, timers ahead of frame
timestamps, corrections, shortest-arc rotation, packet gaps, bounded prediction,
stopping without overshoot, batched receipts, and arrival-jitter reconstruction.
Native TypeScript checking and the production Vite build also pass.
