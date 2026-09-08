# Arroyo neighborhood milestone

Accepted September 7, 2026. Original Southern California neighborhood inspired by the atmosphere of San Andreas, with grounded dimensions, weathered surfaces, warm afternoon light, and a modern restrained presentation. Custom geography does not establish native GTA world compatibility. Keep outdoors and flat; interiors, traffic, combat, and time of day remain deferred.

## Art standard and inventory

[Original reference sheet](../assets/reference/arroyo-concept.png) establishes the palette and silhouettes. It is an art target, not rendered acceptance evidence. Ten homes use four editable kits: porch bungalow, ranch with garage, mission parapet, and gabled cottage. Each lot includes driveway, lawn, fence, mailbox, bin, and landscaping. Street kit includes asphalt/concrete surfaces, yellow markings, utility poles and sagging wires, lamps, palms, broadleaf trees, boundary walls and gates. Original coupe includes separate wheels, transparent windows, lights, interior and two seat anchors. Original skinned human has teal/rust outfits and idle/walk/jump/seated clips.

Blender 4.5.13 is pinned by SHA256 from the [official mirror](https://mirror.blender.org/release/Blender4.5/blender-4.5.13.sha256), in the [4.5 LTS series](https://www.blender.org/releases/4-5/). `npm run build:assets` regenerates exports from source scripts and committed image inputs. Normal setup uses committed exports. Built-in image generation supplies original concept and surface atlas, with prompts and provenance committed. Original code/assets follow GPL-3.0-or-later to the extent applicable; no extracted GTA assets.

## Layout and shared contract

180 × 180 meters, ground Z=9. A central north/south street ends in a cul-de-sac, with a rectangular driving loop to the east. Spawns and initial car remain near the center. All placements, collision boxes, reset/teleport coordinates and minimap paths come from versioned JSON manifests in packages/shared/scenes. Exported Blender models use meters/Z-up/+Y forward; GLTF is converted back once at the asset boundary. The gateway advertises a content revision before joining and rejects wrong scene/revision without starting a worker. Pawn coordinates are compiled from the selected manifest. `POC_SCENE=yard|neighborhood`, neighborhood default; regressions select yard explicitly.

## Engineering and budgets

Separate environment, assets, character presentation, spatial collision, camera and HUD from protocol lifecycle. Keep fixed 60 Hz simulation, server correction revisions, epoch/sequence validation, passenger replication and all peer gameplay through open.mp UDP. Uniform-grid collision queries bound neighborhood searches. Camera-relative walking, right-drag orbit, zoom, chase driving and segment obstruction tests preserve E/G/F/Space/Enter. Joining waits for asset/collision readiness; failures offer retry. Low/standard graphics preserve WebGL recovery and cloud launcher.

Initial caps: 15 MB transferred scene assets, 300,000 visible triangles, 250 draw calls, 96 MiB texture memory. Repeated static meshes are instanced by geometry/material; moving skinned characters retain animation. Following the user's September 8 revision, Low graphics targets two full-resolution 1280×720 cloud views at median >=5 FPS after warm-up. Report p95 frame time without the former 100 ms cap, which is incompatible with a 200 ms median frame at 5 FPS. Software rendering measurements are separate from hardware GPU claims.

## Acceptance and evidence

Retain full yard multiplayer and graphics regressions. Add scene mismatch, missing asset/retry, collision, camera obstruction, safe exit, visible occupants and reset tests. Drive the complete neighborhood loop with both role assignments. Require independent server observations and received peer snapshots within 0.5 units within one second; 20 reconnect cycles and ten minutes active walking/chat/driving. Headed Chromium plus actual cloud desktop inspection, street/pedestrian/driver/passenger screenshots, traces and browser errors. Record measured budgets and any failed/unverified gates in docs/neighborhood-results.md; generated recordings remain ignored under artifacts.

## Commit sequence and later work

Incremental Conventional Commits: scene contract, reproducible assets, character/car presentation, camera/HUD, verification, results. First inspect a representative house/street/avatar/car in-engine before expanding the kit. Update docs/status.md and CONTEXT.md as discoveries change the plan.

Next milestones: a server-scored checkpoint challenge; private HTTPS/WSS invitations, limits and latency testing; original GTA/SA-MP client interoperability and world alignment. None is implied by this browser/open.mp scene milestone.

## Measurement clarification from implementation

The recorded ten-minute functional soak retains video/traces and reports their observed frame cost. A separate active two-player benchmark measures ordinary play without video/trace instrumentation, after ten seconds warm-up. Both use 1280×720 browser viewports. The user's September 8 correction requires full native drawing-buffer resolution in both presets, including high-DPI displays and resizing. The earlier 30% resolution experiment is superseded. The user subsequently set the cloud target to 5 FPS; report misses and p95 latency without lowering resolution. FPS is reported to 0.1 FPS to avoid treating Chromium's sub-millisecond timestamp quantization as a meaningful target miss; raw median frame milliseconds and sampled frame times remain available. This does not round a 15 FPS recording run into a passing normal-play result. Hardware GPU results remain separate and unverified.

Texture accounting separates the surface-map estimate from a test-only audit of WebGL texture storage, uploads, mipmaps and deletes. The audit includes skeleton and shadow textures, rejects unaccounted upload formats, and measures logical storage bytes; driver overhead and physical GPU memory residency are outside that figure. Desktop and neighborhood benchmark checks require this allocation total below 96 MiB.
