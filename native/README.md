# Native legacy player worker

Original code: GPL-3.0-or-later. RakNet uses its GPL v2-or-later option; keep upstream notices. nlohmann/json v3.11.3 is MIT. See the root third-party notices.

```
python3 tools/setup-protocol.py
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build -j4
ctest --test-dir native/build --output-on-failure
native/build/poc-worker --host 127.0.0.1 --port 7777 --name Browser_A
```

Each worker is one ordinary SA-MP 0.3.7 player. Its stdin remains open and receives JSON lines. Its stdout emits JSON lines; stderr contains transport and RPC diagnostics. The Node gateway owns session epochs; worker output carries monotonically increasing `seq` and `controlRevision`. Browser state must echo the current control revision; delayed state cannot undo a teleport, heading correction, or seat transition. Independent worker processes isolate the legacy dependency's global state. The only upstream supported by this PoC is the pinned unchanged open.mp server.

Input: `state` with `position:[x,y,z]`, `rotation:[w,x,y,z]`, `velocity:[x,y,z]`, `keys`, `mode` (`onFoot`, `driver`, `passenger`), `vehicleId`, `seat`, and `controlRevision`; `chat`/`command` with `text`; `disconnect`. World coordinates are GTA Z-up; GTA heading degrees map to quaternion `[cos(h/2),0,0,-sin(h/2)]`. Server seat/exit RPCs own mode transitions; stale browser mode snapshots are dropped. Synchronization pauses on vehicle placement until a matching browser snapshot avoids sending the old walking position as vehicle position.

Output capabilities: join/init, class/spawn, roster and stream changes, chat/server messages, on-foot/driver/passenger snapshots, vehicle stream-in/out, seat placement/removal, player position/heading corrections, vehicle position/heading corrections, structured errors/disconnects. No peers are fabricated; peer movement comes from decoded upstream UDP.

## Dependency adaptations

`tools/setup-protocol.py` checks out RakNet commit `417077754bed5c23c38d64fb39c5a629790c091b`, then applies only worker-side changes:

- Invert the SA-MP substitution and checksum transform for outgoing client UDP; accept incoming legacy server UDP directly.
- Answer connection cookies with XOR `0x6969`; answer player authentication using the pinned server's challenge table. Unknown challenges are not claimed compatible. No NPC authentication path is used.
- Replace server-core/query integration with a small diagnostic shim; disable optional open.mp encryption in this client.
- Exempt client-initiated connections from the server-side 30-second login check.
- Accept server fragments, limiting each message to 256 parts and concurrent fragment channels to 16; reject out-of-range, inconsistent, and duplicate fragment indices.

The upstream server binary and its networking code remain unchanged. The setup script verifies the immutable JSON header SHA256. Downloaded dependencies and build artifacts stay ignored; they are reproducible from the script.

## Verification

`protocol-tests` verifies little-endian primitives, truncated/overlong fields, server-specific compressed-vector epsilon, directional on-foot and passenger fixtures, invalid JSON state rejection, reordered fragments, and fragment bounds/duplicates. These fixtures exercise the directional schema, not merely an encoder decoding its own output.

Initial live integration against official open.mp v1.5.8.3079 under QEMU proved non-NPC admission, two streamed players, chat, driver/passenger synchronization, and exit-to-on-foot transitions. The root browser verification suite owns sustained-session, screenshots, failure recovery, and leak evidence. Do not infer original SA-MP-server/native-GTA compatibility from these tests.
