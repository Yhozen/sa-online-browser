# Durable native motion evidence

The latest full Low motion probe passed on September 13, 2026, at 10:48–10:50
UTC, using game source `b49e186`, scene `6c1739ad64e66280` and
`main-B6cZGs4C.js`. Both Chrome 153.0.8010.37 clients rendered 2560×1440 at
1280×720 CSS pixels and native DPR 2. Remote walking still recorded **3 repeated
positions in 322 intervals and 15.36% speed variation**. This is a passing
motion probe, with residual remote jitter. The full round-12 browser acceptance
suite has not rerun yet. Standard rendering is covered separately by
[native results](../native-dream-results.md).

## Round 12

| Record | Scope |
| --- | --- |
| [Compact results](../native-motion-summary.json) | Derived exact measurements, identities, reset results and cleanup; explicitly records residual remote jitter. |
| [Full verification](round12/verification.json) | Byte-identical copy of the completed native motion trace and assertions. |
| [Served before](round12/served-before.json) | Exact pre-run source, asset, HTTP resource and health capture. |
| [Served after](round12/served-after.json) | Exact post-run source, asset, HTTP resource and health capture. |
| [Cleanup](round12/cleanup.json) | Exact record confirming both owned targets closed and the retained disconnected reference minimized. |
| [Copy provenance](round12/provenance.json) | Original/durable paths, byte sizes, SHA-256 hashes and summary derivation. |

All 74 source records, 28 asset records and four HTTP resource records match
between the before/after captures. The game-module SHA-256 is
`507908629ceba28a7194fa8c0eeb73695bcb44663b6bfe0e773a8886ad0ff2c5`.
Both captures report zero server sessions and workers. The full verification
SHA-256 is
`fad5b440cb7dfe3cb637acc5092891dd311a07ab67f94510215b8ad0a2c9deaf`.
All four copied evidence files are byte-identical to
`.dream-loop/motion-final-round12/`; no capture has been reconstructed or
re-fetched while documenting it. See [motion results](../motion-results.md) for
measurements, limitations and reproduction.

## Historical round seven and setup failure

The earlier pass at 05:57 UTC used scene `7e1fc8ada24a68ec` and
`main-CXPv_yyV.js`. These records remain unchanged and are historical evidence
for that scene, including the setup failure before its successful retry.

| Record | Historical scope |
| --- | --- |
| [Original round-seven summary](round12/historical-round7-summary.json) | Exact archived bytes of the former top-level summary, preserved when the latest summary was updated. |
| [Full verification](verification.json) | Complete passing round-seven motion trace. |
| [Matching rendering audit](rendering-round7.json) | Rendering proof for the same round-seven scene. |
| [Served before](served-before.json) | Original served-scene, entry/game-module hashes, health and target list. |
| [Final browser snapshots](served-after.json) | Exact extraction from round-seven `verification.json` → `movingReset.after`; not an after-run HTTP asset capture. |
| [Cleanup](cleanup.json) | Exact extraction of the historical summary's closure and zero-session/worker checks. |
| [Setup failure trace](reset-setup-failure.json) | Failed seat request before authoritative reset replication completed. |
| [Setup diagnosis](reset-setup-diagnosis.md) | Preserved failure, server sequence, synchronization correction and successful retry. |
| [Original copy provenance](provenance.json) | Historical paths/hashes and extraction details as recorded then. |

The historical passing trace SHA-256 is
`98bfb86095beed474cb477100153b227cedf5a6a3b1c5c06772fdd259d3c3323`.
No separate after-run HTTP build/asset capture was persisted for round seven.
Its original provenance still names `docs/native-motion-summary.json`; the
exact old bytes now live at `round12/historical-round7-summary.json`, with the
relocation documented in the round-12 provenance. References there to earlier
pending suites describe the historical capture, not current acceptance status.
