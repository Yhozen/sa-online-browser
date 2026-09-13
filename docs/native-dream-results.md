# Native Dream-loop results — September 13, 2026

Round thirteen adds coordinated cross-street sunlight to the original Blender
assets and movement fixes from round twelve. Runtime light, terrain irradiance
and the native reflection bake use the same physical inputs. The current native
rendering and quality-switch checks pass; fresh final-source motion and complete
acceptance are pending. **The visual target remains unfinished:** the fresh
[round-thirteen review](art-review-round13-2026-09-13.md) scores **5.0/10, Tier 1**.
Road shade improved; crown separation and mountain relief remain the lighting gate.

The fresh full run started at 11:30 UTC finished **14 passed / 1 failed**. Both
ten-minute soaks passed, but the browser connection closed before rejoining in
the worker-crash/restart case. Cleanup reused the click error. The unchanged
targeted rerun reproduced a transport disconnection followed by clean Chrome
cleanup. An empty-page control isolated idle transport failure, and the local
host's new [WebSocket keepalive](native-transport-heartbeat.json) passed both a
60-second quiet control and the unchanged recovery case. The
[failed-run record](native-acceptance-round12-failed.json) preserves the results.

The tested scene is **`7ef8f91ef0fd9fec`**, built from the round-thirteen lighting
changes on source base `2108faa`. The served module is `main-BRewO_K2.js`, SHA256
`c86bd004f54b7e5368e9dc2c72354a4149409e4863d7b18f16b3be3f44e95379`.
Exact source, asset and served identities are retained in the
[round-thirteen rendering record](native-rendering-round13-summary.json).

## Current appearance and authoring

![Actual native Standard gameplay](images/native-street-round13-2026-09-13.png)

This is an actual Chrome gameplay capture, rendered at 3344×1882 native pixels
and captured as a 1672×941 comparison image. Its [capture record](images/native-street-round13-2026-09-13.json)
identifies the build and image hash. The [generated target](images/native-concept-2026-09-13.png)
is reference art, with a separate [origin record](images/native-concept-2026-09-13.json).

Native **Blender 5.2.1** rebuilt the ordinary and mature oaks, palm and neighbor.
The oaks have clearer crown openings and shaped leaf normals; the palm uses
individual drooping and twisted pinnae. The neighbor adds localized trouser
compression and distinct shoe heel, collar, sole and welt. The eleven-bone rig,
four animation streams, foot support, vehicle fit and original woody geometry
contracts remain. The model [integration record](native-model-integration-round12.json)
and [asset provenance](../assets/PROVENANCE.md) retain exact sources and exports.
Untouched models retain their earlier pinned provenance; no external game assets
or new texture service is required.

The three terrain meshes retain 172,800 triangles and all 218 perimeter placements.
A packed, connected gully mesh carries one baked diffuse-irradiance field, applied
once in both presets. Its editable native source matches the actual decoded
Float32 geometry. The [terrain record](native-terrain-integration-round12.json)
identifies the earlier geometry provenance. The current
[lighting integration](native-lighting-integration-round13.json) identifies the
rebuilt native source, unchanged geometry and new irradiance. Ten road/sidewalk surfaces receive broad
pigment variation, and 57 added frontage shrubs bring that count to 141. Existing
plant transforms and sidewalk dirt remain exact; [ground checks](native-ground-integration-round12.json)
retain the details.

Three real Standard → Low → Standard cycles kept full native resolution and
reported no rendering errors. Repeated same-preset pixels were identical in four
static road, curb, terrain and lawn regions; see the [pixel comparisons](native-quality-cycle-round13.json).
This also verifies the material-isolation fix that prevents Low shading from
altering the restored Standard curbs.

The current review credits the changed street shade and clearer lawn light. It
still asks for connected warm crown faces, cooler crown interiors and stronger
mountain gullies, plus vehicle finish and smaller surface details. The
[round-twelve review](art-review-round12-2026-09-13.md) and
[round-twelve image](images/native-street-2026-09-13.png) remain historical.

Several earlier asset and lighting studies were rejected after actual browser
inspection, including an added rear-house oak, measured diffuse lighting, leaf
normal changes and the first lower-sun direction. Their numerical checks do not
imply visual acceptance. The accepted lower sun crosses from the opposite side
of the street and restores the hero's light. See the
[experiment record](native-visual-studies-round12.md) and
[current integration record](native-lighting-integration-round13.json).

## Native rendering

Chrome **153.0.8010.37**, **ANGLE Metal on Apple M5 Pro**, native DPR 2. Each case
used a fresh context, five-second warmup, twenty-second idle sample and four-second
walk. The isolated audit completed at **12:45 UTC**.

| Preset / CSS viewport | Native drawing buffer | Idle / walking median FPS | p95 idle / walking | Logical texture storage |
| --- | --- | ---: | ---: | ---: |
| Standard, 1280×720 | 2560×1440 | 120.5 / 120.5 | 9.6 / 9.4 ms | 266.00 MiB |
| Low, 1280×720 | 2560×1440 | 120.5 / 120.5 | 9.7 / 9.8 ms | 119.34 MiB |
| Standard, 1672×941 | 3344×1882 | 120.5 / 120.5 | 9.8 / 9.9 ms | 315.72 MiB |
| Low, 1672×941 | 3344×1882 | 120.5 / 120.5 | 9.6 / 9.7 ms | 169.06 MiB |

Maximum sampled downloads were **46,810,131 bytes**, geometry **4,921,215 triangles**
and draw calls **906**. All unchanged 48 MB / 320 MiB / 6 million triangle /
1,000 call / 60 FPS gates pass. No browser errors or frame stalls over 50 ms
were recorded. These are short hardware-specific samples, not a promise of
constant 120 FPS on every route. Logical texture storage excludes driver overhead
and renderbuffers; maxima are sampled.

An earlier round-twelve measurement also passed 60 FPS but measured 61.35 FPS
at the largest Standard size. A separate owned, disconnected reference window
was then observed rendering 91 frames in 750 ms. The exact cause of its
reactivation was not established. The corrected audit explicitly freezes that
caller-selected page and proves its counter remains at 604,395 throughout each
warmup, idle and walking interval. It changes no resolution or quality setting.
The earlier result remains under `.dream-loop/native-render-audit/round-12/`;
the [round-twelve audit](native-rendering-verification.json) preserves its earlier
measurement. The [current compact audit](native-rendering-round13-summary.json)
contains the round-thirteen measurements and exact inputs.

## Movement and multiplayer

The [round-twelve native motion proof](native-motion/README.md) passes on the prior
scene. Gameplay code is unchanged by round thirteen; a fresh final-source motion
run remains pending. Local walking and driving both measured 120.5 FPS with **zero repeated
rendered positions**, while the deterministic 60 Hz simulation still repeated on
approximately half the display frames. Both jump/seat/exit cases produced zero
uncommanded height or upward velocity. Two-player remote motion retains some
network variation: three repeated positions in 322 frames and 15.36% speed
variation; zero remote stutter is not claimed.

Resetting an occupied car after 7.170 m of driving corrected the two clients in
176.8/185.2 ms. Local body and car presentation errors were zero; peer agreement
followed within 50.4/32.2 ms. Source, asset and served-resource hashes stayed exact,
both owned windows closed, and sessions/workers returned to zero. See
[motion results](motion-results.md) and the [summary](native-motion-summary.json).

An earlier complete browser run also ended **14 passed, 1 failed**: the final yard
soak hit an asynchronous observation deadline after 42 rounds. Saved browser
snapshots and all subsequent server vehicle observations showed the correct reset
position; the delayed runner did not establish command-to-correction timing.
A test-only observer now measures from the actual trusted reset Enter inside the
browser, freezes its verdict and rejects corrections observed after 1,000 ms or
at least 0.5 m away. Fresh correction counters and a separate fresh server sample
remain required. Negative controls and the focused real yard soak pass: 75 rounds over 605.2
seconds, 75 resets at most 267.7 ms, zero reset-position error and 150 ordinary
movement agreement samples within 0.483 m. Both recordings and clean worker
exits are preserved in the [focused summary](native-yard-soak/round12/summary.json).
A filtered pass cannot substitute for the pending full suite and its two
supervisor checks. See [acceptance environment](native-acceptance-environment.md).
