# Arroyo implementation results

Status: full acceptance in progress, September 7, 2026. Do not treat this draft as a completed acceptance claim.

The demo now defaults to an original 180 × 180 meter neighborhood with ten houses/four architectural variants, cul-de-sac and connected driving loop, shared collision/scene metadata, original rigged human and coupe, visible seat occupants, minimap, orbit/chase camera and low/standard graphics. The yard remains selectable with `POC_SCENE=yard`. Gameplay continues through the unchanged open.mp release and separate native workers.

## Preliminary checks

- Pinned Blender 4.5.13 installed through its official mirror after the primary download endpoint returned a Cloudflare challenge. Archive and executable SHA256 checks are enforced; editable source files, script, original texture/concept inputs and GLBs are committed.
- Four scene unit tests pass: actual manifest geometry/clear spawns/camera obstruction; spatial index versus exhaustive collision; scene mismatch rejected before any worker starts; exported skin, animation clips and both seat anchors.
- Headed neighborhood route test passed with both driver/passenger role assignments, server-routed movement/chat, camera obstruction, fenced-lot collision, visible occupants, passenger input isolation, exits and reset positions.
- Actual cloud desktop inspected in both low and standard modes. Standard screenshots show shadows and transparent cabin; they establish rendering behavior, not a hardware GPU benchmark.
- Early two-view software benchmarks prompted lower-cost materials, simplified fence geometry, merged house/car materials, reduced internal resolution and removal of backdrop blur in low mode. Record final measurements below once full verification ends.

## Evidence locations

Ignored detailed artifacts: `artifacts/neighborhood/` contains street/pedestrian/driver/passenger/obstruction screenshots, context traces, videos, independent server observations, position agreements, route waypoints, reconnect counts and soak/performance metrics. `artifacts/verification/` contains the retained yard/graphics regressions, native/gateway results, report and complete acceptance summary. Accepted compact results and selected screenshots will be committed here after verification.

## Limits and next steps

Original GTA clients, stock SA-MP servers, public servers, non-Chromium browsers, WAN behavior, and hardware GPU performance remain unverified. The original browser neighborhood is not native GTA map geometry. Low graphics trades render resolution and dynamic lighting for cloud CPU performance; the HTML HUD stays sharp. Standard provides richer materials/shadows but is slower on SwiftShader.

Next: a server-scored checkpoint challenge with shared start/finish/reset; private HTTPS/WSS sessions and invites with latency/limit tests; then native GTA/SA-MP interoperability and geometry/coordinate reconciliation.
