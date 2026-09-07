# Local open.mp fixture

`python3 tools/setup-runtime.py` downloads checksum-pinned packages, extracts an
isolated i386 userspace and QEMU, compiles `poc.pwn` with the release's bundled
Pawn compiler, and writes a local configuration. `python3 tools/run-server.py`
executes the server with its working directory in `.runtime/Server`.

The official open.mp **v1.5.8.3079 binary and components are unchanged**. This
cloud environment executes i386 programs but returns `EACCES` for their socket
creation. The pinned x86_64 `qemu-i386-static` translates the unchanged program;
its host socket calls support the required UDP connection. No host libraries,
kernel policy, upstream source, or server networking behavior are modified.

The initially attempted pristine x86_64 source fallback configured after adding
Perl build prerequisites and downloaded its Conan dependencies. That experiment
was stopped once the official release worked through QEMU; a complete source
build is not claimed or needed by the setup command.

`arena.json` supplies browser geometry and generated Pawn spawn/car constants.
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
