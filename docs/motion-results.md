# Native motion verification — round 12, 2026-09-13 UTC

The full native Low motion probe passed on game source `b49e186`, scene
`6c1739ad64e66280`, during 10:48–10:50 UTC. The served game module was
`main-B6cZGs4C.js`, SHA-256
`507908629ceba28a7194fa8c0eeb73695bcb44663b6bfe0e773a8886ad0ff2c5`.
The before/after captures agree exactly on all 74 source files, 28 assets and
four served resources. Both owned targets were closed; recorded server health
was zero sessions and zero workers. The disconnected comparison window was
retained and minimized.

This is a motion result for Low. Standard rendering performance is evaluated
separately. The full round-12 browser acceptance suite has not rerun yet.

## Recorded motion

Chrome 153.0.8010.37 used 1280×720 CSS pixels, native DPR 2 and a 2560×1440
drawing buffer on both Low clients throughout. Admission readiness took 1.497
and 1.721 seconds.

| Scenario | Median FPS | p95 frame time | Repeated rendered positions | Repeated simulation positions |
| --- | ---: | ---: | ---: | ---: |
| Walking, one client | 120.48 | 9.7 ms | 0 / 324 | 162 / 324 |
| Driving, one client | 120.48 | 9.8 ms | 0 / 202 | 101 / 202 |
| Walking, two clients: local | 120.48 | 10.0 ms | 0 / 322 | 161 / 322 |
| Walking, two clients: remote | 120.48 | 10.0 ms | 3 / 322 | 242 / 322 |

Counts describe sampled intervals after the probe's initial trim. Local walking
maintained 5 m/s when normalized by elapsed frame time. Remote walking retained
**3 repeated rendered positions in 322 intervals and 15.36% speed variation**;
this run does not establish zero remote stutter. Its maximum distance between
the latest received and presented position was 0.48134 m. The remote view delay
was 100 ms. Settled raw network positions agreed within 0.000000641 m.

The driving sample accelerates, so its recorded 38.70% speed variation is not a
constant-speed jitter measurement. Steering turned the presented vehicle
1.152 radians and passed the existing per-frame angular-speed bound. Shared
driving retained visible driver/passenger seating and rejected passenger
movement control; both occupants exited normally. No browser exceptions were
recorded.

## Corrections and shared reset

The real `/teleport` command put raw and rendered positions at `[-4, -4, 10]`
on the first observed corrected frame. The existing reset setup waits for fresh
authority updates before seating. With two clients it also waits for fresh peer
replication agreeing with corrected positions; the two recorded barriers took
510 and 511 ms.

The occupied moving-reset case drove 7.170 m and steered 0.930 radians before
the real `/reset`, with old throttle input held across the command. Both
clients recorded 601 display frames. Driver/passenger correction receipts were
176.8/185.2 ms after the request; peer agreement followed within 50.4/32.2 ms
of those corrections. Maximum local-body and car presentation errors were
exactly zero. Maximum peer-body error was below 0.000000000000002 m. Both
clients stayed settled for more than 4.66 seconds.

The existing one-second replication, immediate presentation cut, authority,
stale-input clearing, idle-animation, camera-clearance and native-resolution
assertions all passed. Camera settling remains allowed by the test.

Both jump/seat/exit cases also passed. Entering a seat while rising at
5.55 m/s, then exiting after a real seat/exit transition, produced zero
uncommanded height and zero upward velocity during the post-exit trace.
Minimum obstacle gaps after player-radius subtraction were 11.148 m for the
driver and 14.790 m for the passenger. The driver traveled 3.287 m while
seated; the passenger case was stationary.

## Implementation and reproduction

Rendered local-player and driven-vehicle poses interpolate the unchanged
60 Hz simulation. Timestamp-aware sampling retains one additional pose interval
so timers running ahead of animation-frame timestamps do not create alternating
display-frame holds. The camera follows the presented position and orientation.
Spawn, corrections, teleports, seat transitions, exits and disconnects clear
presentation history.

Remote players and vehicles use a bounded snapshot buffer with a 100 ms view
delay. Reported velocities and receipt timestamps reconstruct movement intervals;
position uses monotone Hermite curves and rotation uses quaternion slerp.
Missing updates permit at most 100 ms of velocity extrapolation before holding.
Corrections, implausible jumps, stream/seat transitions and driver exits clear the
relevant history. Network authority and RPC behavior remain unchanged.

With the development server and native Chrome remote debugging on port 9333
running, reproduce the full probe with:

```sh
POC_MOTION_ARTIFACTS=.dream-loop/motion-recheck node tools/verify-motion.mjs
```

The probe creates and closes only its owned windows and uses ordinary UI input.
It rejects unexpected presets or drawing-buffer sizes. It executes global
fixture resets, so other test sessions must be idle. `POC_CHROME_DEBUG`,
`POC_URL` and `POC_MOTION_ARTIFACTS` override endpoints and the evidence directory.
`POC_MOTION_CASE=jump-seat-exit` or `POC_MOTION_CASE=moving-reset` selects a
bounded regression; both are included in the default full probe.

Exact round-12 records are in the [motion evidence index](native-motion/README.md),
including [full verification](native-motion/round12/verification.json),
[before](native-motion/round12/served-before.json) and
[after](native-motion/round12/served-after.json) source/HTTP captures,
[cleanup](native-motion/round12/cleanup.json), and a
[derived compact summary](native-motion-summary.json). The
[copy provenance](native-motion/round12/provenance.json) records sizes and hashes.
These documents preserve the completed run; no additional motion run was made
while updating them.

## Historical evidence

The round-seven pass at 05:57 UTC used scene `7e1fc8ada24a68ec` and
`main-CXPv_yyV.js`. It recorded zero repeated rendered positions during its
two-player walking sample. That earlier result does not replace the nonzero
remote jitter in round 12. Its [full trace](native-motion/verification.json),
[original compact summary](native-motion/round12/historical-round7-summary.json)
and [matching rendering record](native-motion/rendering-round7.json) are retained.

The immediately preceding round-seven setup failure is also historical:
`/drive` reached the server 42 ms after `/reset`, while the player was still
15.39 m from the car. The normal 12 m seat-distance check rejected it. The
[failed trace](native-motion/reset-setup-failure.json) and
[diagnosis with server sequence](native-motion/reset-setup-diagnosis.md) preserve
that failure and the subsequent test-only synchronization correction. The
successful round-seven two-client setup barriers took 515 and 514 ms.

Earlier working traces, including the jump-impulse failure and correction,
remain under `.dream-loop/motion-jump-before/`, `.dream-loop/motion-jump-after/`
and `.dream-loop/motion-moving-reset/`. They are diagnostic history for older
builds, not current acceptance evidence. The round-ten rendering pass and the
round-eleven acceptance attempt likewise concern earlier frozen scenes; current
rendering and full acceptance status are tracked separately in
[native results](native-dream-results.md).
