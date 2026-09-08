# Dream-loop: modern San Andreas atmosphere

Accepted 2026-09-08. Upgrade Arroyo's existing outdoor layout with original, believable Southern California architecture, vegetation, characters, coupe, materials and an SA-inspired interface. Native viewport × devicePixelRatio is mandatory in both presets. Cloud FPS is diagnostic, never a reason to reduce resolution. Standard becomes the default for new installs; saved preferences remain respected.

## Execution

1. Capture fresh pedestrian, driving and street views from the actual game. Generate improved in-engine targets from those compositions with built-in image generation; no art confirmation requested by the user.
2. Author detailed editable Blender 4.5.13 geometry and original texture inputs. Keep houses, roads, gameplay footprints and seat anchors compatible with the shared manifest. Commit source, exports and provenance; setup requires no generation service.
3. Improve physical materials, reflected environment, directional/contact shadows, sky and native-resolution antialiasing. Rebuild foliage, prominent building surfaces, coupe bodywork and character detail.
4. Integrate circular radar, restrained outlined HUD, live-background entry screen and lower camera. Preserve input, loading/retry, recovery and multiplayer lifecycle.
5. Self-assess live screenshots, then use fresh art-director subagents with the dream-loop gated rubric. Carry forward previous directives. Target 8/10 in each selected composition; record actual scores and any unresolved gaps. Structural changes are required if iteration stalls.
6. Verify graphics, yard/neighborhood networking, two-player driving/role swaps, corrections, collision, reconnects and sustained sessions. Keep 0.5-unit/one-second agreement. Record actual desktop and headed Chromium evidence. Report resource and software-FPS measurements separately from hardware GPU performance.

## Invariants and interfaces

No new animation/gameplay RPCs. UDP server remains the source of peer state. Preserve current meter scale, Z-up/+Y-forward normalization, wheel pivots and named seat anchors. Extend checksummed asset inventory/loading for new textures. New blocking geometry must enter shared collision and revision generation. Preserve Low material lifecycle, transparency, alpha testing and shared-resource disposal.

## Evidence and delivery

Working targets, prompts, screenshots and judge verdicts: gitignored `.dream-loop/`. Accepted results and reproducible recipes are committed. Original assets/code remain GPL-3.0-or-later; third-party notices remain intact. Incremental Conventional Commits and pushes follow milestones. Unrelated skill-lock changes are excluded.

No traffic, pedestrians, interiors, combat, new activities or claims of native GTA-world compatibility in this milestone. Existing resource targets are reported; any revised budgets require an explicit result record, never concealed assertion removal.

## Recorded budget revision

The first detailed pass downloads 16.07 MB of assets (18 files), exceeding the initial 15 MB placeholder target. Its unculled Standard view submits 1.16 million triangles including shadow passes; these are not all visible surface triangles. The fidelity budget is now explicit in `tools/visual-budgets.mjs`: 24 MB scene download, 1.5 million submitted triangles, 700 draw calls, 192 MiB logical texture storage. Spatial batching retains geometry while allowing frustum/shadow culling. Cloud 4 FPS is recorded as a diagnostic target, with pass/fail reported in evidence, not a functional-suite blocker. Both presets retain full native resolution. Cloud functional fixtures explicitly select Low; default preference and Standard visuals are verified separately. No hardware GPU result is inferred.

## Iterations through the second review

Fresh 1280×720 baseline gameplay views were edited into 1672×941 in-engine targets with the built-in image-generation tool. Live comparison captures use the target dimensions. Original image inputs cover eight physical surfaces, transparent branch foliage and an equirectangular sky; ordinary setup consumes their committed exports.

The first independent review scored driving/pedestrian/street 2.8/2.8/2.0, identifying excessive horizon mass, exposed boundary walls and a mismatched street camera. The next review passed the driving and pedestrian shape gate at 3.8/3.7; local shading, bright architecture, road variation and hero finish remained blocking. Structural responses include a 48-ray BVH vertex-occlusion bake, continuous roof panels, unified clothing with skin weights, eroded terrain meshes, articulated palm leaves and irregular asphalt repairs. Review artifacts and failed capture logs stay in `.dream-loop/`; final results will record the actual attained scores.

The native glTF wheel basis is covered by exported-geometry tests: local Z is the rolling axle, four named assemblies rotate as units, and liners remain fixed. This corrects a discovered animation-axis bug without changing vehicle physics or networking.

## Third review and slow-frame regression

The third fresh judge scores were 4.4 driving, 4.3 pedestrian, and 4.1 street. All composition gates passed. Remaining lighting blockers are dark canopy interiors, subdued road midtones, pale sky and insufficiently readable reflections. The next structural response rebuilds oak limbs and leaf-spray attachment, replaces independent hood/fender surfaces with a shared contour, and gives thin foliage its own wrapped lighting response. The sky was edited with the built-in generator to retain projection while reducing gray cloud cover. Connected fracture geometry and irregular paint edges replace sparse straight decals/regular rectangular gaps.

The first full verification attempt passed all four headed graphics scenarios and the neighborhood asset/mismatch negative case, then failed walking distance: five seconds moved only two meters. The frame loop discarded physics time after 100 ms. The new `SimulationClock` runs fixed 1/60-second steps from elapsed active time, advances before input transitions, resets on authoritative corrections and publishes independently of render scheduling. Frozen gaps above ten seconds reject catch-up and reconnect; they are never integrated as stale input. Deterministic tests cover 144 Hz through 1.7-second frame gaps, stale rAF timestamps, corrections and frozen-clock bounds. The original browser movement and 0.5-unit/one-second assertions remain intact. The failed run and traces are retained in `.dream-loop/verification-failed-1/`.

Connected woody branches and the refined house surfaces submit up to 2.17 million Standard triangles in the round-9 views, including shadow passes, at 599 draw calls and 23.68 MB downloaded. The subsequent fidelity ceiling is **2.5 million submitted triangles**, with the 24 MB/700-call/192 MiB ceilings retained. This exceeds the original placeholder geometry budget; no drawing-buffer reduction or vegetation removal was used to hide that cost.

The focused headed neighborhood regression subsequently passed in 6.5 minutes: both nine-waypoint loops, role swap, walking/chat/jump, obstruction/collision, occupants and resets. Five settled comparisons reached worst distances 0.00339 units from independent server observations and 0.00126 from peer snapshots. This is a focused result, not the pending full soak/lifecycle acceptance.


### Fourth review and committed reflection bake

Independent fourth review: driving 4.7, pedestrian 4.6, street 4.4; Tier 1 retained, lighting gate incomplete. Clearer sky, road exposure and higher driving framing landed. Canopy volume/light, car reflection gradients, planted boundary, grass, asphalt structure and cloth/hero detail remain blocking or carried. This does not meet the >=8 target. A further structural pass replaces road material, terrain/verge construction and car/cloth contours.

Static reflection capture is now an asset-build step. The 1536x2048 RGBA16F PMREM atlas adds approximately 10.7 MB losslessly compressed and 24 MiB of texture allocation, eliminating repeated static cubemap convolution during ordinary startup. The download ceiling increases explicitly from 24 MB to **40 MB** for that cache and a dedicated original asphalt input; full native output resolution and both presets are retained. Texture ceiling remains 192 MiB pending measured validation. This trades download size for reproducible lighting and startup work, not lower visual fidelity.

Full rebuilt inventory measures 42.29 MB after finer cloth/body topology and the dedicated asphalt image. The final working download ceiling is therefore **48 MB**, superseding the provisional 40 MB estimate. This is an explicit visual-quality budget revision, not a passing claim for the original 15 MB ceiling.


### Fifth review and cold player-graphics admission

All three fifth-review scores are 4.8. Road fracture/repair structure, street shirt/profile, and removal of glass/cabin hotspots landed. Canopy lighting and car reflection continuity still block Tier 2. A measured normal audit found every original oak card normal faced upward; two-sided shading then inverted many viewed from below. The next structural pass authors a coherent outward canopy normal field while preserving exact positions/UVs/triangles, and removes the incidental card-backface inversion. Coupe hood/deck contours and shared normals now follow deliberate smooth surfaces independent of the wheel-opening semicircles. These are structural lighting/geometry changes, not more global exposure adjustment.

The second full run passed four graphics cases (both scenes at native DPR1/2), asset/cached-reflection/mismatch negative checks, both neighborhood loops/roles, and twenty reconnects. Its soak was interrupted after one player disconnected during a prolonged initial active-render stall; the remaining soak/lifecycle/yard cases have not passed on this revision. No full-acceptance summary was produced. Trace teardown also stalled; cleanup now bounds trace flushing and closes the context. Player/vehicle shaders and shared geometry are prewarmed into a native-size offscreen target before enabling join. Temporary render-only models never enter gameplay/network state or captured visible frames. The fixed-step clock and agreement limits are unchanged. The intent is to finish expensive admission work before controls become usable, rather than accept lost movement or indefinite stale input.

The subsequent unjudged round 14 exposed a shader regression: applying wrapped light incidence to both diffuse and GGX specular terms, together with back-facing custom canopy normals, produced invalid reflection energy. The new probe reached 12,072 in linear RGB. The correction keeps GGX incidence unchanged and its normal view-facing, while evaluating the wrapped diffuse response separately against the authored canopy field. Foliage/palm variants have separate shader-cache keys. The rebuilt probe peaks at **1.253**, with no output clamping, compared with 3,500 in the preceding committed cache. Round 14 is rejected as gameplay evidence for visual acceptance. The committed-cache regression test checks nonnegative, finite and plausible radiance in this non-emissive fixture.
