# Native browser acceptance environment

The acceptance suite can run its browser on the Mac while retaining the Linux
gateway, native protocol workers and unchanged open.mp fixture in Docker. This
addresses Chromium's GPU-process crash under x86 emulation; it does not change
the game or replace the separate native frame-rate audit. The complete current
suite has not passed; the targeted results below are not a full acceptance pass.

`POC_BROWSER_WS_ENDPOINT` selects the optional connection. The local host binds
to loopback, launches isolated Chrome profiles, and tunnels browser loopback
requests back to the test runner. Default Linux/Xvfb/SwiftShader settings remain
available without that variable. See the [reproduction commands](../README.md).
The test host and its narrow focus adapter are pinned to Playwright 1.59.1.

The first graphics test records the actual browser version, user agent and WebGL
renderer. The native run reports Chrome 153.0.8010.37 and ANGLE Metal on Apple
M5 Pro. The summary requires that record to come from the current run; it does
not label the Linux Chromium executable as the browser that was tested.

## Verified transport controls

- A native Chrome page loaded a temporary HTTP server bound only to the
  container's loopback address, demonstrating the return tunnel.
- The real tab-switch check observed `document.hidden` after disabling
  Playwright's own focus override. The adapter addresses only a page owned by
  the isolated host and sends the same CDP command as the existing local test.
  It does not inject document visibility or gameplay state.
- Unknown targets returned 404, malformed input returned 400, and a WebSocket
  request carrying a website Origin returned 403.
- A remote video was saved successfully. Recorded neighborhood cycles use
  distinct video filenames; complete traces retain their resources and stack
  metadata.
- Stopping a separate test host with a live owned browser completed in 35 ms:
  exit code 0, client disconnected, all observed owned processes gone, temporary
  profile removed, and listening port closed.
- All four graphics scenarios passed while the Mac was awake, including both
  scenes, both presets, DPR 1 and 2, resize/reload, and graphics recovery. The
  separate gameplay edge case passed jump, wall collision, passenger exit,
  actual hidden-tab cleanup and rejoin in 1.4 minutes.

An independent source comparison initially found all 132 existing `expect`
statements unchanged by the transport. Recording allowances below preserve those
assertions. The later reset observation replacement is documented separately.

## Recording allowances

Recorded native tests retain their existing continuous WebM recordings, explicit
PNG screenshots, browser actions, DOM snapshots, network resources and client
stack traces. Only Playwright's duplicate screenshot timeline is disabled.
The default local Linux trace configuration still includes that timeline.

The first complete native attempt passed five browser cases and finished both
nine-waypoint driving loops, then failed while saving its trace. During 141
seconds of gameplay, the recorder produced 6,219 JPEG resources (377 MB) inside
a 412 MB archive. Playwright then decompressed and recompressed that archive
under QEMU to append client stack metadata, exceeding the 120-second save
allowance. That failed run was stopped before the longer soaks reproduced the
same recording problem. It is not a full acceptance pass.

Disabling the duplicate images uses the public tracing option, preserves the
existing video dimensions (640×360 neighborhood, 960×640 yard), and changes no
gameplay assertion. The failed archive retained about 34 MB of other compressed
resources. Earlier short-case yard trace saves took 24–30 seconds; neighborhood
admission, recording and release cycles took approximately 29 seconds each.

The original five-minute neighborhood reconnect run released ten sessions
successfully, admitted the eleventh, and then hit its overall 300,000 ms deadline.
Its timeout is preserved as a failed test, not a completed twenty-cycle result.
The optional remote path now allows time for complete recordings:

| Allowance | Default local path | Remote native browser |
| --- | ---: | ---: |
| Twenty neighborhood reconnects | 300 seconds | 900 seconds |
| Twenty yard reconnects | 180 seconds | 900 seconds |
| Neighborhood trace save | 30 seconds | 120 seconds |

All twenty cycles, observed worker/server-slot releases, complete recordings,
both ten-minute active soak phases, graphics budgets, and the 0.5-unit agreement
within one second remain required. This adds time to the test run; it does not
relax the game's agreement deadline or reduce drawing-buffer resolution.

Earlier native test attempts overlapped repeated macOS maintenance sleep and
are not accepted sustained-session evidence. A temporary `caffeinate` process
keeps the current run awake; persistent power settings were not changed.

Each neighborhood session now has a shared unique identifier for its trace and
remote video, so twenty reconnects preserve twenty distinct trace archives.

## Reset timing evidence and current verification

The round-eleven rerun used source commit `9e37c60` and remains an actual failed
full run: fourteen of fifteen browser scenarios passed, including both sets of
twenty reconnects and the full neighborhood soak. The final yard soak completed
42 rounds and failed during the next reset, before ten active minutes. Supervisor
checks did not run. The original results, traces, videos and server observations
are archived under `.dream-loop/round11-yard-reset-failure`; no passing acceptance
summary exists for that run.

The saved trace identifies the failing distance callback by its client stack.
It returned the correct car position `[0,6,10]` in 15.041 ms; all 322 server
vehicle samples after the reset were also correct. The preceding browser call
ended 3155.758 ms before that callback began. Playwright's runner timer expired
without a completed matcher result, rather than recording a nonzero distance.
This establishes a runner observation deadline failure, but does not establish
command-to-correction within one second: the first browser observation was later.
The trace cannot separate runner scheduling, protocol transit and response
processing. The small index and archive hashes are retained in
`.dream-loop/yard-soak-reset-diagnostic/chronology.json`.

Commit `b49e186` integrates the test-only
[reset observer](../tests/browser/reset-observer.mjs). A passive capture listener
timestamps the actual trusted Enter on `/reset` and records counter baselines
before the normal input handler sends the command. Success requires the same
spawned player, session epoch and vehicle, fresh `selfPosition`, `selfHeading`
and generic `vehicleState` counters, on-foot mode, and car distance strictly below
0.5 m within 1000 ms of that Enter, measured with browser `performance.now()`.
The generic vehicle counter also includes ordinary sync; it does not distinguish
the individual vehicle reset RPCs.

This intentionally replaces the old browser-position `expect.poll` timer, which
started after server-reset and mode polls. Measuring from the command is stricter.
Every sample checks the browser deadline before accepting correct state, and the
terminal result is immutable, so delayed runner retrieval cannot turn late
convergence into a pass. Independent server reset, mode and car assertions remain;
the server car sample must follow the newly observed reset. No movement, distance,
soak or server agreement allowance was increased. The observer changes no game
state and removes its listener, timer and unique test property in `finally`.

All eight [CPU observer controls](../tests/reset-observer.test.mjs) passed, covering
delayed collection, late correction, browser timer starvation, stale counters,
Enter-time baselines, identity changes, exact time/distance boundaries and cleanup.
Twelve summary rejection controls also passed: invalid timing or distance,
stale counters, missing or duplicate reset records, invalid server ordering or
values, evidence from another run, cleanup errors and missing final samples were
rejected. `reset-agreements.json` persists every collected verdict and independent
server evidence; summary provenance hashes the helper and its tests. Routine yard
snapshots transfer only fields used by the scenario; divergence evidence still
captures the complete `__poc` state.

An isolated native Chrome timing fixture also passed both controls. A correction
scheduled at 120 ms was observed at **133.1 ms** and passed. A correction scheduled
at 1250 ms failed at **1000.8 ms**, even though both results were collected after
a **2500 ms** delay. These are instrumentation controls, not gameplay results;
their evidence is `.dream-loop/yard-soak-reset-diagnostic/native-observer-control.json`.

The focused real yard soak passed at 11:05 UTC on the integrated observer:
**75 rounds over 605,182 ms**, two players, zero browser errors. Every reset
passed; the slowest browser correction was **267.7 ms**, with zero browser and
server reset-position error. All 150 ordinary movement agreement samples also
passed, with maximum distance **0.48245 m**. Both worker processes exited cleanly,
and both complete traces and continuous videos were saved. The
[summary](native-yard-soak/round12/summary.json) and
[reset witnesses](native-yard-soak/round12/reset-agreements.json) preserve the
measurements and artifact hashes. The raw run is archived under
`.dream-loop/round12-targeted-yard-pass`.

This is a filtered diagnostic, not final acceptance. A fresh complete
`verify:poc` run, including all fifteen browser scenarios and supervisor checks,
remains required before declaring acceptance complete.
