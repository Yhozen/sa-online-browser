# Original Arroyo activity kit

Created September 20, 2026 for the neighborhood driving challenge and gathering area. The scripts, geometry, material definitions, original lettering and exports use **GPL-3.0-or-later**. No GTA assets, third-party models, downloaded fonts, vehicle branding or additional image-generation service are used.

`tools/assets/activity-kit.py` is the authoritative, deterministic Blender **4.5.13** recipe. It also runs independently of the older neighborhood export script. The binary/archive pins remain in `tools/build-assets.mjs`. Normal setup consumes the committed GLBs.

```sh
.runtime/blender-4.5.13-linux-x64/blender --background --python-exit-code 1 --python tools/assets/activity-kit.py
```

Add `-- --preview` for isolated Cycles authoring views in ignored `.dream-loop/activity-assets/`. These previews inspect the modeled objects; they are **not live-game acceptance evidence**. `-- --only activity-board` rebuilds one object using the same per-asset random seed as a complete build.

## Editable source and runtime exports

Every asset has a matching individually editable `assets/source/activity-*.blend` and `apps/browser/public/assets/activity-*.glb`. Source files retain named bolts, slats, sign lettering, frames and leaves. Runtime meshes merge by material, including the two-material succulent leaves. Coordinates are meters, Blender Z-up, with the sign and bench facing -Y and resting at local Z=0. The browser performs its existing glTF axis normalization once.

| Asset | Authored details | Local collision envelope |
| --- | --- | --- |
| `activity-board` | Hemmed enamel sign, rain cap and drip edge, original geometric alphabet baked into one face, rear stiffeners, square supports, concrete footings, galvanized washers/hex bolts, restrained paint wear and oxidation | X ±1.40; Y ±0.26; Z 0–2.6395 |
| `activity-pylon` | Continuous formed cone, open recessed top grip, reflective sleeves, molded rings, beveled recycled-rubber base and anchor recesses | X/Y ±0.33; Z 0–1.065 |
| `activity-bench` | Individually rounded hardwood seat/back slats, reclining back, curved steel side frames and armrests, foot anchors, screw heads, fine lengthwise checking, original maker plaque | X ±1.03; Y −0.36–0.39565; Z 0–0.924275 |
| `activity-planter` | Hollow rounded-square concrete vessel with formed lip, recessed soil and mineral mulch, 34 curved solid leaves with contrasting margins and dry basal tips | X −0.685475–0.695879; Y −0.658–0.686052; Z 0–1.575012 |

The planter's rigid vessel occupies roughly X/Y ±0.66 and Z 0–0.675. Its upper extent includes the succulent. Collision, placement and admission revisions belong to the shared scene manifest; decoration must remain outside road/driving and pedestrian clearances.

`concrete` and `wood` reuse the accepted project material maps already described in [PROVENANCE.md](PROVENANCE.md). Dedicated `activity-*` paints, galvanized metal, reflective tape, soil and leaf colors use original physical material definitions and neutral vertex weathering. The sign text is built from a hand-authored geometric alphabet in the script; it includes no font data.

`assets/source/activity-sign.svg` retains the original letter polygons and enamel color blocks. The script rasterizes those polygons with 2× coverage sampling into `assets/textures/arroyo-club-sign.png`, an original 1024×512 RGBA enamel face with restrained color variation. The exact PNG is embedded in the checksummed GLB. Ordinary loading needs no additional URL or image service. Its mipmapped RGBA storage is approximately **2.67 MiB**. The source `.blend` retains all editable letter meshes and the packed image; the runtime export replaces front lettering and its raised orange stripe with one UV-mapped panel. Rear text is omitted from the export to avoid the same thin-geometry artifact.

## Verification and authoring findings

`node --test tests/activity-assets.test.mjs` reads the actual GLB exports and checks metric envelopes, ground contact, bounded finite geometry/UVs/normals, neutral baked color values, material sharing, and the planter's genuinely hollow concrete shell.

The accepted kit totals **2,473,080 bytes**, **31,116 triangles** and **20 material primitives** across four unique models. Board/pylon/bench/planter contain 5,772 / 6,894 / 7,370 / 11,080 triangles respectively, with 6 / 4 / 4 / 6 primitives. The editable sources retain 79 / 34 / 109 / 84 individually named components. Four exported-data tests pass, including exact embedded/source PNG equality, dimensions, original vector provenance and a ray confirming that no floating lettering remains above the face. A second complete standalone pinned-Blender build reproduces all four GLB and source-PNG SHA256 checksums; `.blend` editor metadata is not used as runtime content identity.

The first authoring audit caught a Blender data-layer issue: allocating a color layer invalidated an earlier UV-layer handle. Interleaved UV/color writes then injected signed UV coordinates into `COLOR_0`, producing green/magenta corners. The recipe now completes UV writes before allocating the color layer, and exported-data tests guard against recurrence. A separate visual inspection replaced overlapping letter-segment rectangles with shared mitered boundaries and micron-separated branch strokes, avoiding black coplanar junction artifacts. Live street inspection still showed fragmented printing in the game's shadow/depth path. Increasing separation to 6.5 mm did **not** resolve that live artifact. The accepted structural response bakes the authored print and stripe into one image on the actual panel; letters can no longer cast separate shadows or fight its depth. This replaces the failed geometry-offset attempt without changing model dimensions, camera range or native resolution.

The four isolated previews and machine-readable bounds/triangle/size report are saved under `.dream-loop/activity-assets/`. Integration screenshots, multiplayer behavior and resource totals are recorded by the parent neighborhood/activity verification, separately from these authoring checks.
