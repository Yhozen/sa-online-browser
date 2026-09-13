# Reset-to-seat setup race — round seven, September 13, 2026

The first full native run passed walking, teleport, driving, steering and
two-player replication, then stalled after one `/drive` rejection. The
[original failed trace](reset-setup-failure.json) is preserved byte-for-byte,
SHA-256 `7f315d305d5bf5ccc2d6d850e64b64ee10eed00188fb7008120074a8aed12d7b`.
No browser exceptions occurred.

The [server-sequence excerpt](reset-setup-server-sequence.json) preserves original
log line numbers and isolates the `MotionA91883` server lifetime. Its sequence is:

| Server tick | Observation |
| --- | --- |
| 245613 | Reset requested. |
| 245815 | `FinishReset` sends player position/heading corrections and logs completion. |
| 245816 | Authoritative sample still places A at `[-14.667, 10.663, 10]`, 15.39 m from the car. |
| 245857 | `/drive` is rejected by the unchanged 12 m seat-distance check, 42 ms after reset. |
| 245993 | Next authoritative sample places A at corrected spawn `[-4, 0, 10]`. |

The old setup helper waited for a fresh downstream heading correction and the
parked car. That does not prove that corrected on-foot state has reached the
upstream distance check. Worker control revisions reject obsolete browser
snapshots; they are not an upstream acknowledgment. The log proves the stale
server position at request time, but cannot alone distinguish an in-flight old
packet from the server's position-update semantics.

The test now requires fresh reset position/heading RPCs on both clients, followed
by subsequent real peer `playerState` updates matching the corrected positions
within 0.001 m. It records timing and counters, adds no fixed delay and does not
retry a rejected seat. Single-player setup has no peer observer and requires its
fresh local position/heading corrections. Production motion, server authority,
seat-distance checks and the strict one-second moving-reset gate are unchanged.

The [full rerun](verification.json) passed on the same served scene with peer
barriers of 515/514 ms. The [passing summary](../native-motion-summary.json) and
[cleanup record](cleanup.json) retain the measurements and confirm both owned
windows closed with zero server sessions/workers. This is evidence for round
seven, not acceptance of later art changes.

The [original diagnosis record](reset-setup-source-record.json) preserves source
and test hashes. The complete 4.6 MB server log remains only in the ignored local
working artifact `.dream-loop/motion-final-round7-server-preserved.log`; it is
not included in a fresh checkout. Its SHA-256 is
`5e0212f469bb75a8991c9e9b665fc02f2135ec70e8a8ca11d1c3098f9814b9e9`.
The durable excerpt and complete failed trace above retain the evidence used by
this diagnosis without requiring that unrelated multi-session log.
