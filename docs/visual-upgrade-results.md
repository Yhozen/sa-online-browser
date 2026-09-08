# Arroyo visual upgrade — September 8, 2026

The neighborhood now uses original detailed Blender assets, authored physical textures, warm directional lighting, cached environment reflections, native-resolution antialiasing/contact shading, and an SA-inspired interface. **The 8/10 visual target is not yet met:** the eighth independent review scores driving, pedestrian and street views **5.0/10 each**. This record distinguishes implemented improvements, measured behavior and remaining visual work.

The user reports that the game runs fine on their own machine. No hardware-GPU benchmark was collected; software-renderer measurements below are not predictions of hardware performance.

## Actual game captures

These are live Standard-mode Chrome 152 captures on the actual cloud display `:1`, at **1672×941, DPR 1**, using normal server-routed player controls. They are not generated target images. The complete capture has no browser errors. Working targets, earlier captures, traces and eight independent verdicts are in ignored `.dream-loop/`.

![Street and coupe in the running game](images/visual-street.png)

[Pedestrian view](images/visual-pedestrian.png) · [Rear driving view](images/visual-driving.png)

## Implemented changes

- Lighting: original cloudy sky, warmer sun/cool ambient fill, 4096² directional shadows, nearby contact shading, physical roughness/normal detail and a losslessly cached neighborhood reflection atlas.
- Environment: four remodeled house variants across the unchanged ten-house layout, actual recessed front/side windows, porches and garages, local occlusion/weathering, connected asphalt fractures, low grass/soil planting, branching foliage, layered palm fronds and distant terrain watersheds.
- Vehicle and people: continuous coupe body/glass/pillar boundaries, formed wheel arches, detailed wheels and cabin; refined rigged human geometry, two outfits and fixed-step idle/walk/jump/seated animation. Vehicle dimensions, pivots and seat anchors remain unchanged.
- Presentation: lower orbiting third-person cameras, circular radar at native DPR, restrained session/speed/location information, collapsible chat and a live entry scene. There are no decorative money/ammunition/health values presented as functional systems.
- Graphics behavior: Standard defaults only for new preferences; explicitly saved Low is retained. Both presets use full viewport × native DPR, including resizing and DPR changes. Loading/retry, scene revision admission, WebGL recovery and disconnect behavior remain.
- Asset pipeline: pinned Blender 4.5.13 scripts, editable `.blend` sources, original generated texture inputs, committed GLBs/reflection cache and checksum inventory. Normal setup calls no image-generation service. See [provenance](../assets/PROVENANCE.md).

The shared playable layout and collision manifest remain unchanged. Decorative ground triangles are checked independently against roads, paths and barriers. Gameplay still travels through separate native workers and the unchanged open.mp server; animation does not add network messages.

## Verification status

The complete final-asset headed suite is running on implementation commit `d8f0210`. Do not treat historical neighborhood/yard results as acceptance of these assets. The final source-hashed summary and actual-desktop two-player result will be linked here after verification finishes.

Focused exported-asset checks passed before the complete run: exact vehicle anchors/envelope, animated cabin fit, four house opening cavities, canopy normal fields, planting triangle clearance, cutout mip coverage and bounded reflection-cache decoding. The full run additionally exercises graphics startup/recovery, native DPR1/2 resizing/reloading, loading failures, walking/chat/driving, both routes/seat assignments, safe exits, server corrections, failures, twenty reconnects, resident resource stability and both ten-minute active sessions. The networking threshold remains **0.5 world units within one second**.

## Resource measurements and explicit tradeoffs

The selected native Standard views download **46,023,763 bytes**, submit at most **5,139,319 triangles including shadow passes**, and use at most **893 draw calls**. These are measured view samples, not worst-case bounds across every possible camera. Final texture allocation and warmed two-view frame times are pending the complete audit. Mixed setup/preset-switching frame history is not used as a warmed benchmark.

| Resource | Initial neighborhood budget | Current explicit fidelity ceiling |
| --- | ---: | ---: |
| Scene downloads | 15 MB | 48 MB |
| Geometry | 300,000 visible triangles | 6,000,000 submitted triangles including shadow passes |
| Draw calls | 250 | 1,000 |
| Logical texture storage | 96 MiB | 192 MiB |
| Cloud median frame rate | User revised to 4 FPS | Diagnostic only |

The original budgets are exceeded. Visible faces and submitted triangles are different measurements; the latter repeats geometry for shadow rendering. The larger reflection cache trades download size for reproducible startup, while denser models, planting and expanded shadows increase rendering work. Texture storage estimates exclude driver overhead, buffers and process memory. No fidelity adjustment reduces internal resolution, and slower cloud results do not trigger downscaling.

## Art review and remaining gaps

| Fresh review | Driving | Pedestrian | Street |
| --- | ---: | ---: | ---: |
| 1 | 2.8 | 2.8 | 2.0 |
| 2 | 3.8 | 3.7 | Not judged |
| 3 | 4.4 | 4.3 | 4.1 |
| 4 | 4.7 | 4.6 | 4.4 |
| 5 | 4.8 | 4.8 | 4.8 |
| 6 | 4.8 | 4.8 | 4.9 |
| 7 | 4.9 | 4.9 | 5.0 |
| 8 | 5.0 | 5.0 | 5.0 |

All three current views pass the coarse composition gate. The light/color gate remains incomplete; 5 is its cap, not a claim that the gate passed. Repeated structural changes improved crown volume, panel construction, house recesses, ground planting, hill shading and human animation. They have not made the result visually equivalent to the generated targets.

Next visual work should address connected warm crown illumination and shaded yard depth together with coherent reflected sky/horizon on car panels. After that, improve irregular curb/paint wear, varied planting layers, terrain material regions, and convincing human hair/hands/anatomical cloth folds. More isolated color tweaks or higher-frequency texture alone will not close the review gap. The single static reflection probe also cannot reproduce position-dependent reflections everywhere on the driving loop.

Two generated foliage replacement attempts returned painted checkerboards in RGB instead of real transparency and were rejected. The valid original RGBA foliage remains. Generated targets and isolated Blender previews are authoring references only, never networking or gameplay acceptance evidence.

## Reproduce and continue

```sh
npm run setup:poc
npm run dev:poc
npm run open:poc             # optional actual cloud Chrome launcher
```

Stop the demo before `npm run verify:poc` so its fixtures own the required ports. With the demo running and no other players, use `npm run verify:desktop` for the actual cloud display. `npm run build:assets` regenerates editable models, exports and the static reflection cache without calling an image-generation service; restart the gateway after rebuilding assets.

Native GTA-world interoperability, original SA-MP/public servers, non-Chromium browsers, WAN behavior and hardware-GPU performance remain unverified. The next gameplay slices remain a server-scored checkpoint challenge, private remote invitations/latency testing, then an original-client interoperability fixture.
