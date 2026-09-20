# Local open.mp fixture

`python3 tools/setup-runtime.py` downloads checksum-pinned packages, extracts an
isolated i386 userspace and QEMU, compiles `poc.pwn` with the release's bundled
Pawn compiler, and writes a local configuration. `python3 tools/run-server.py`
executes the server with its working directory in `.runtime/Server`.
For a direct interactive launch, enter `exit` in the server console to stop it.
Supervisors should retain a stdin pipe and send `exit\n` before falling back to
signals. In this QEMU runtime, direct signal shutdown has produced an upstream
abort or a stalled process; four console-exit probes terminated cleanly with
exit code 0. The server binary remains unchanged.

The official open.mp **v1.5.8.3079 binary and components are unchanged**. This
cloud environment executes i386 programs but returns `EACCES` for their socket
creation. The pinned x86_64 `qemu-i386-static` translates the unchanged program;
its host socket calls support the required UDP connection. No host libraries,
kernel policy, upstream source, or server networking behavior are modified.

The initially attempted pristine x86_64 source fallback configured after adding
Perl build prerequisites and downloaded its Conan dependencies. That experiment
was stopped once the official release worked through QEMU; a complete source
build is not claimed or needed by the setup command.

`packages/shared/scenes/{yard,neighborhood}.json` supplies browser geometry and generated Pawn spawn/car constants. `POC_SCENE` selects the manifest, defaulting to `neighborhood`; each server start recompiles the fixture. `arena.json` remains the source for the retained yard layout recipe. `POC_GAME_PORT` can override the default UDP port for an isolated test process.
The server binds UDP **127.0.0.1:7777**, accepts ordinary 0.3.7 players, allows
eight players, and disables public announcement, artwork, and open.mp encryption.

Commands `/drive` and `/passenger` reserve seats 0 and 1 within 12 world units of
the vehicle. `/exit` clears the seat and removes the player; `/reset` resets all
players and the vehicle; `/teleport` corrects the sender to `(-4,-4,10)`.
Driver disconnect resets the fixture and reconciles remaining occupants.
Reset first removes occupants and blocks new seat requests. It waits for actual
server-observed on-foot states before applying final player/vehicle corrections;
otherwise an in-flight driver update could overwrite the vehicle reset. A wait
longer than five seconds emits a visible diagnostic without claiming completion.

Independent observations appear in stdout and `.runtime/Server/log.txt` as
`POC {json}`. Event types include `ready`, `connect` (with `npc`), `spawn`, `chat`,
`state`, `seatGranted`, `seatRejected`, `exit`, `resetRequested`, `resetWaiting`,
`reset`, `teleport`, `disconnect`,
and 200 ms `player`/`vehicle` samples. Coordinates use GTA `(x,y,z)`; `tick` is
server uptime in milliseconds. Player state `1` is on foot, `2` is driver, and
`3` is passenger. Unreserved owners are `65535`; no vehicle is `0`.

Dependency versions, source commit, upstream URLs, and SHA256 values are in
`manifest.json`. Debian package SHA256 values came from the bookworm package
metadata over HTTPS. Package copyright/license files are retained in each
extracted package's `usr/share/doc` directory. See the root third-party notices
for source and license links. Runtime downloads/build products remain ignored.


## Server-scored Arroyo Loop

The neighborhood manifest supplies the ordered checkpoint positions, start area,
checkpoint radius, three-second countdown, and three-minute maximum run time.
`tools/setup-runtime.py` generates the same constants into `arena.inc`. Yard has
the challenge disabled and emits no activity messages or checkpoints during its
existing walking/driving regression flow.

The reserved driver can start `/race` while inside the start area. A reserved
passenger must already be in the car; the crew is captured when the countdown
begins. Moving more than 0.75 world units before the countdown ends cancels the
attempt. After green, only the captured driver in the reserved car may advance
one ordered checkpoint at a time. open.mp invokes `OnPlayerEnterRaceCheckpoint`
from the received player state; Pawn independently checks the current point and
seat before awarding progress. Missing a point leaves it active. Passengers and
spectators see the same standard checkpoint RPC but cannot advance the score.

Pawn owns generation, phase, countdown, elapsed time, current checkpoint, finish,
and a sorted top-five leaderboard for this server session. A finish requires every
point in order and publishes one score for the captured crew. `/scores` shows the
current leaderboard; `/cancel` is restricted to the active crew. Start requests
while a run is active, on foot, resetting, or away from the start are rejected.
Finishing preserves the result until a new run. `/reset` restores the fixture but
preserves session scores; restarting the server clears the session leaderboard.

Driver/passenger exit, disconnect, changed crew/seat reservation, a participant's
`/teleport`, `/reset`, explicit crew cancellation, and run timeout cancel an active
attempt and clear every displayed checkpoint. A new player receives the current
activity state and scores on spawn. A spectator cannot cancel another crew's run.
Browser movement remains client simulated: this demonstrates server-owned scoring
and ordering, not anti-cheat validation of the driven trajectory.

Structured notices travel from Pawn through reliable standard `ClientMessage`
RPCs, never via gateway peer broadcast. See `native/README.md` for the bounded
versioned wire format. Numeric cancellation reasons in independent `POC` logs are
0 none, 1 driver exit, 2 passenger exit, 3 driver disconnect, 4 passenger disconnect,
5 reset, 6 crew cancellation, 7 countdown movement, 8 timeout, 9 teleport, and
10 crew/seat change. Numeric phases are 0 idle, 1 countdown, 2 running, 3 finished,
and 4 cancelled. Additional observations are `challenge`, `challengeRejected`,
`challengeCheckpoint` (one-based completed point), `challengeFinished` for every
completed run, and `challengeScore` when that result enters the top five.
