# Original Arroyo assets

Created September 7, 2026 for this repository. Original modeling, rigging, animation, layout and scripts use GPL-3.0-or-later. Generated images are original built-in imagegen outputs; distributed under the repository's licensing approach to the extent copyright applies. No GTA, SA-MP, vehicle-brand or third-party model/texture data is included.

- `reference/arroyo-concept.png`: built-in imagegen, original concept reference, not in-engine evidence.
- `textures/neighborhood-atlas.png`: retained original built-in imagegen surface study. The current runtime uses the later Arroyo inputs below; no image service is needed at setup or runtime.
- `source/*.blend`: editable Blender sources, including weighted character mesh, armature and actions; script creates deterministic geometry with explicit weights. The original kit used Blender 4.5.13. Later native rebuilds are identified individually in `source/asset-build.json`; untouched models retain their original pinned provenance.
- `../tools/assets/build.py`: authoritative editable modeling/export recipe.
- `../apps/browser/public/assets/*.glb`: committed meter-scale exports, Blender Z-up/+Y forward converted by standard glTF exporter to Y-up/-Z forward; browser normalizes once.
- Blender 4.5.13 archive SHA256 `da4e69b06b75b9e642d106496c50e7e240218b411d2f6e18271c1d1d819cef91`; extracted executable SHA256 `e3ce4e960a2fd3beb1f9d2299e38b3804475ccd395193013aec239a4b75bfbfe`. The official mirror URL and both checks are recorded in `tools/build-assets.mjs`. Blender itself remains ignored in .runtime, under its upstream GPL license.

## Native asset authoring (2026-09-12)

The installed macOS arm64 Blender 5.2.1 LTS (build `9e2066aef7ef`, executable SHA256 `ea651e507c6b197df0e234bfa04e5ed43e7f4d498267a7df93fcb38f21928a5c`) generated the updated oak, palm, neighbor and new `garden-low` planting kit. The houses, coupe and other unchanged props retain their accepted Blender 4.5.13 exports. Native output is not claimed byte-identical to the Linux build.

`source/asset-build.json` records generation time, actual Blender version/build hash/executable SHA256, host platform, modeling recipe hashes, and both GLB and editable blend identities for each newly generated model. Selective runs preserve other records and exports. Model construction and export first happen in ignored scratch space; an exporter failure or a recipe edit during generation prevents publication. The checksum-pinned Linux path remains available on Linux x64, while `--blender` / `BLENDER_BIN` explicitly selects another installed supported runtime.

All new vegetation geometry remains original repository-authored work. `tools/assets/garden-kit.py` creates a compact thick-leaf agave and flowering shrub arrangement with a 0.70 m radial envelope and 0.65 m height bound. The oak/palm recipes retain their collision origins and reuse the original generated foliage atlas. Only real browser captures count as visual/gameplay evidence; native Blender exports and isolated previews are authoring checks.

## Native dream-loop continuation (2026-09-13 UTC)

The following current records supersede the intermediate September 13 counts and material settings retained later in this document. Current native Blender 5.2.1 entries are oak, palm, neighbor, `garden-low` and `garden-shrub`; untouched houses, coupe and other props retain their accepted pinned Blender 4.5.13 provenance. `source/asset-build.json` and the per-asset records are authoritative for generator and output identities. Native authoring checks, generated art references and actual browser evidence remain distinct.

`reference/arroyo-dream-2026-09-13.png` is the built-in image-generation edit of the starting live street capture, used as the new visual target. The prompt retained the exact camera, neighborhood layout, car, character and HUD while targeting realistic warm afternoon lighting, connected oak crowns, feathered palms, planted lawns, automotive reflections and cloth. This generated image is never labeled as gameplay evidence.

`textures/arroyo-grass.png` is a new original built-in image-generation output, `exec-74d1d105-828f-4e06-859d-45d49f931007.png`. The prompt requested an evenly lit, orthographic two-meter lawn albedo with fine olive and straw blades and about ten percent exposed dry soil, without objects or directional shadows. The 1254² original is retained unchanged; the runtime derives 1024² aligned albedo, normal and roughness maps.

The six surface, detail, foliage, sky, asphalt and lawn WebP inputs recorded in `source/texture-encodings.json` are **lossless** encodings of their retained PNG originals. `source/texture-encodings.json` records exact source/output hashes, dimensions, encoder settings and independent native Chrome plus raw RGBA comparisons, with the independent raw comparison establishing invisible RGB preservation under transparency. Chrome's premultiplied decode alone cannot establish that detail. They save 5,427,996 bytes (30.60%) without changing any decoded channel. Builds copy the committed encodings and do not require an image encoder. The seventh WebP, the later grass tussock atlas, has its own exact encoding record described below; it is not included in those six-input savings.

The current asphalt is an original built-in image edit with quieter fissures and warm mineral aggregate, retained byte-for-byte at `textures/arroyo-asphalt.png`. `source/asphalt-authoring.json` records its exact prompt and generation identity. Runtime samples it across four metres and derives aligned surface maps. The current sky is an original four-edit refinement with fuller warm-white clouds, a midpoint horizon and open blue at the panorama wrap. `source/arroyo-sky-generation.json` and `source/arroyo-sky-prompts.txt` retain every exact prompt, input and generated-output identity. Its opposite cloud-band edges differ by at most 4/255 mean RGB in the measured 29–33° band; this is a closely matched wrap, not a claim of mathematically identical edges.

### Current structural refinement (September 13, round twelve)

Native Blender 5.2.1 rebuilt `tree`, `roadside-oak`, `palm` and `neighbor` through
the normal selective pipeline. Current hashes, source BLEND identities and native
executable/recipe identities are in `source/asset-build.json`. Both oaks now have
8,536 triangles and 630 attached leaf sprays; all 3,496 wood triangles and their
attributes remain exact. More exposed outer sprays and locally curved lobe
normals create crown openings and separate illuminated faces. Their two lossless
gzip deliveries total 766,351 bytes. Existing tree placements and colliders remain.

The palm has 24 fronds, 1,104 individual drooping/twisted pinnae and 13,431 triangles.
It replaces the former sunlight-axis leaf deformation with natural blade torsion;
wood and rachises are preserved, while the highest blade is 1.98 cm lower. The
selected fuller variant is 881,160 bytes, SHA256
`83e001d52a835436bf62bc39c361e229b83dd025f1ba8aa8ef09a41d6461233d`.
The native comparison accepted its separated pinnae after rejecting a sparse
narrower variant. This is an art decision, not a claim that the visual target passed.

The neighbor now has 121,590 triangles and occupies 6,521,848 bytes. Localized
trouser compression, a recessed heel counter, thinner sole/welt and padded collar
retain the original foot support and seated fit. All vertex attributes, eleven
bone transforms, inverse binds and four animation streams match the reviewed
prototype exactly; a few existing triangles have different index ordering in the
native export, with identical oriented triangle sets. New shoes are closed
manifolds. No rig, animation, collision or seat-anchor contract changes.

Terrain v4 retains three draws, 172,800 triangles and all 218 perimeter placements.
`source/horizon-envelope-v3.*` preserves its prior authored envelope and recipe
provenance. `tools/assets/horizon-bake.mjs` remeshes connected gullies and bakes one
fixed diffuse-irradiance field, packed with explicit little-endian coordinates.
`tools/assets/horizon-save.py` saves the exact decoded runtime Float32 mesh to
`source/horizon.blend`; complete native provenance is recorded in
`source/horizon-build.json`. The 859,283-byte packed runtime data has SHA256
`94e2c411dacb524e2ee90c4cf5bd312fbf0c7b3e4355b2ba8f11c6bacf1c9b56`.
The Basic material applies that irradiance once in either quality preset, retaining
original grass/concrete maps and fog. It adds no texture or runtime light.
The envelope remesh changes the reference skyline by at most 3.10 pixels; exact
silhouette identity is not claimed.

Broad asphalt and concrete pigment variation uses vertex colors on ten existing
horizontal surfaces. Two isolated material clones preserve the original curb
material and restore Standard exactly after Low. Existing sidewalk joint geometry
and colors remain byte-exact. Fifty-seven additional low frontage shrubs bring
that count to 141; the 30 masonry-bed and 27 verge plants and all earlier transforms
remain. Original authored surface images and the grass color field are retained.

The latest reflection cache and actual browser build identities are recorded in
`source/reflection-bake.json`. Native geometry/CPU checks passed; final rendered
performance, multiplayer acceptance and independent art review are documented
separately in `docs/native-dream-results.md`. The older dated descriptions below
are historical and are superseded by this section and current ledgers.

### Earlier street refinement (September 13, 09:12 UTC build)

The native Blender pipeline now also builds `roadside-oak`: a mature specimen with
one continuous 3 m growth deformation above the unchanged 2.1 m low trunk.
It has 9,256 triangles, a 7.095–11.397 m leaf envelope, and 720 leaf-stem anchors
within 3.136 cm of the scaffold. The ordinary `tree.glb` rebuild remains
byte-identical. `source/asset-build.json` records both native sources, exports,
recipe hashes and lossless gzip deliveries. The standard GLBs remain available
for editing and geometry tests; the browser verifies both compressed and decoded
identities. Delivering both trees costs 816,317 bytes, a net addition of 143,409
bytes over the prior uncompressed oak. No texture or external asset was added.

The mature oak is appended at (−13,14,9) with a matching trunk collider. Existing
prop/collider values and indices remain unchanged. Actual-GLB tests verify roads,
turning sidewalk, house access, roofs, lamp, sign and center landmarks. Native
visual review accepts the heavier left tree cluster; the new tree overlaps
26.863% of the separately sampled left-palm geometry, so that landmark is not
claimed unobstructed. CPU alpha projection estimates 14.03% additional shade in
the measured middle-road band; native PCF and overlap with other shadows differ.

Current grass redistribution retains 23,000 yard tufts in 52 grass batches and
493,294 total grass/soil triangles. All existing travel and access exclusions
remain. A shared integer lattice hash aligns turf pigment and tuft color;
54 native GPU samples agree with the CPU field within 0.00000205. Original
textures and coverage-preserving cutout mips remain. The current decorative
planting is 30 bed specimens, 27 verge specimens and 84 frontage shrubs.

The three existing terrain meshes retain all 172,800 triangles, positions,
indices, textures and smooth seam attributes. Standard uses a bounded blend of
smooth and actual face normals at authored gullies, preserving the angular seam;
Low retains its existing cached material behavior. Exposed bank pixels in the
controlled native preview changed by 18–41 RGB levels. This is visible relief,
not a claim that every geological-detail target has been achieved. The latest
reflection identity is always the current `source/reflection-bake.json` record.

The dated paragraphs below retain earlier authoring measurements; where their
counts or cache identities differ, this latest section and current ledgers win.

### Earlier grass tussock atlas integration

`textures/arroyo-grass-clumps.png` is a new original built-in ImageGen output: four isolated olive and straw grass tussocks in a transparent 2×2 atlas. No external image or model was supplied. `source/grass-clump-generation.json` retains the complete prompt, source/output identities and independent exact RGBA verification. Lossless WebP preserves all 1,572,516 pixels, including invisible RGB. Runtime prepares a 1024² cutout mip chain using the existing coverage-preserving filter.

Three curved crossed cards replace one grass ribbon variant; the other retains individually curved blades. The integration preserves all **23,725 yard tuft placements** and their instance colors, with **64 total grass batches**. Yard grass contains 498,444 triangles; all grass totals **507,228 triangles**, down from the preceding ribbon-only total of 755,124. All grass instances reuse two materials and one grass-clump atlas texture. Actual transformed card, ribbon and soil triangles are checked against roads, sidewalks, driveways, porches, fences and fixture barriers. Maximum grass height is 0.23992 m. The atlas is an art input; only actual browser captures establish game appearance.

### Current low garden planting

The original `garden-shrub` variant reuses the accepted foliage atlas in three overlapping olive crowns, with three basal leaders, 21 connected lateral shoots, 63 folded sprays and four small attached flowers. It contains 1,496 triangles in four material primitives and occupies 102,380 bytes; actual exported radius is 0.5304 m and height is 0.5082 m, within the 0.65 m authoring limits. Local low-crown normals and complete atlas UVs are validated from the export. Its editable native Blender source and exact recipe/output identities are recorded separately in `source/asset-build.json`. The accepted `garden-low` GLB and Blender source remain byte-identical. Isolated single/group previews are authoring checks; frontage placement and final appearance are verified in the browser. The current fixture adds 86 frontage shrubs and 27 verge `garden-low` specimens, alongside 30 specimens in the existing masonry beds. The independent exported-triangle test inspects 202,852 triangles across the 113 frontage/verge plants, with a maximum height of 0.604 m and a minimum measured vertex-to-sidewalk gap of 0.299 m.

### Earlier distant terrain authoring

`tools/assets/horizon.py` authors the original distant terrain in native Blender 5.2.1 LTS. `source/horizon.blend` is editable, `horizon-relief.json` supplies relief and mineral/vegetation fields, and `source/horizon-build.json` records exact native executable, recipe and output hashes. The current sculpt has connected multiscale folds beneath a narrow 1.9–3.5 m crown strip, with a smooth three-metre transition toward a 36° radial slope. This replaces the rejected isolated crest points that produced triangular teeth. All 1,443 sampled crown heights, horizontal coordinates, topology and playable boundaries remain unchanged; 44,661 vertices move subtractively. Native Blender and runtime match all 88,023 coordinates and triangle indices exactly. Runtime retains three terrain batches and 172,800 triangles. Median immediate crown-edge inclination drops from the rejected 25.36° to 2.35°, while 68–74% of the former exposed top-metre band carries relief. Mean projected skyline change is 0.01090°, maximum 0.12395°. Native Chrome/M5 Pro review at DPR 2, sun 6.2 and sky fill 1.55 measured average upper-band brightness changes of +1.86% north and +0.46% northeast with no browser errors; source hashes remained stable. This establishes geometric and brightness checks, not the requested universal twofold tonal-variation gate. The staged review record is retained under `.dream-loop/terrain-planes-stage/`.

### Current neighbor and seated garment

The current native Blender 5.2.1 neighbor contains **117,702 triangles**, 13 material primitives and 6,365,356 GLB bytes. `neighbor.glb` SHA256 is `cf14bd6ff88bee0e4333d9a67eea1b1c53d67200efb72aade705ff677e9f70e7`; the editable `neighbor.blend` contains 3,446,298 bytes with SHA256 `ed62584d5aad70bef4ed6bfe97444c8ecbadd5048e0f29051f9124eb4438eb1e`. `source/asset-build.json` records the native executable and recipe identities; `source/neighbor-shoe-refinement.json` retains the detailed comparison and validation.

Rounded connected uppers, a visible recessed collar and distinct sole bands replace the intermediate angular shoe profile. Each main shoe is one closed manifold with 720 vertices and 682 polygons. Actual foot support bounds and standing height remain unchanged. The garment also retains inward asymmetric elbow, knee and ankle compression folds.

Review of both the preceding model and the shoe candidate exposed a preexisting seated binding defect: a discontinuous shoulder-weight boundary produced sharp armpit spikes, and forearm weights caught the wide shirt hem. The corrected continuous field follows the actual sleeve boundary and leaves the shirt tail on the pelvis; attached shirt details use the same cloth binding. Under the actual seated clip, maximum measured shoulder-edge stretch drops from 32.31× to 5.04× and hem-edge stretch from 9.94× to 1.27×. Compressed armpit folds remain; this is skinning, not cloth simulation.

All eleven bone transforms, inverse binds and all four animation key streams remain byte-identical. Exact standing height and foot bounds are preserved; seated lateral bounds change by at most 0.016 mm. Both actual cabin roof/floor/width tests pass. The new exported-geometry regression samples three seated times, fails the preceding model and passes the replacement. Native Blender front/rear/opposite-side renders establish authoring checks; final gameplay appearance is established separately through browser captures.

### Current palm crown, approved 2026-09-13

The approved narrower palm study retains all 24 fronds, every woody attribute/index byte, the exact accepted body bounds, and 13,431 total triangles. Original leaflet cross-sections are widened and twisted principally along the fixed neighborhood sunlight direction, with their roots, tips, raised midribs and rachises preserved. Any new edge displacement that reaches the existing crown envelope is shortened along the same light ray. This is authored mesh geometry, with no opacity or shadow-casting override in the published asset. Native Blender 5.2.1 generated the editable source and GLB; `source/asset-build.json` retains its exact runtime and recipe identities.

The 2 cm geometric projection raster measures unchanged sun-projected union and approximately 1.52× forward-view crown union at 15 degrees elevation. The approved actual game comparison uses Standard quality at native DPR 2 and a 3344×1882 drawing buffer. In selected native ground regions, sidewalk-shadow and road-control pixels are identical, while foreground-shadow mean luminance changes +0.0223% and solid-shadow pixel count changes −0.0778%. These are bounded measurements, not a claim that the requested universal 2× visible-mass target was reached. The stronger broad-leaf variant was rejected before publication. Full native baseline/prototype frames, geometry hashes and the review remain under `.dream-loop/palm-mass-stage/`.

Published `palm.glb`: 830,960 bytes, SHA256 `777457b436e1f8d5ca350fb30886e57461bac0718a914068fe7f09a3f3598060`. Editable `palm.blend`: 644,297 bytes, SHA256 `8f3818975770d7dded5fe84c48e74cf89b1eba2eedca97a1da198161669e8930`. Only the palm ledger entry was replaced; all other model records were preserved.

### Earlier reflection cache snapshot

`tools/bake-reflections-native.mjs` provides an additional native Chrome/GPU bake path for the local empty fixture. It validates source, model, inventory, served scene and browser bundle identities before publication, and records the actual renderer. The pinned provisioned bake path remains available.

The earlier cache snapshot was the native bake recorded at **2026-09-13T05:43:56.509Z** (approximately 05:44 UTC) in `source/reflection-bake.json`: Chrome 153.0.8010.37, ANGLE Metal on Apple M5 Pro, scene revision `382505ade0366b07`. The 1536×2048 RGBA16F PMREM cache occupies 11,216,349 compressed bytes; SHA256 is `cdf4b001427fd4cded2023be7302e86799b177910a50d67be152e08297789205`. The record includes every input identity, served bundle identity and a zero-player/zero-worker capture. It is a static probe at the vehicle reset position, not a claim of dynamic reflections everywhere or gameplay acceptance. Historical pinned Chromium/SwiftShader bakes are described below.

### Earlier September 13 authoring stages (historical)

Before the grass-card integration, front-yard turf distributed 23,725 tufts, each with four or six curved blades, across 14,706 quarter-metre cells on the fixture, 4.15 times the earlier 3,540-cell coverage. This is a placement metric, not an image score. That ribbon-only density pass used 17 cm jittered candidate spacing and actual-distance rejection; live blade tips began at a measured 10.4 cm, and the highest yard vertex was 22.6 cm above ground. Yard grass contained 711,312 triangles within its 740,000-triangle cap; all grass totaled 755,124 triangles in 64 spatial batches sharing one material. Upward canopy normals and two-sided diffuse response preserve the actual shadow attenuation; real blade/soil triangles are checked against roads, sidewalks, porches, driveways, fences and trunks. Sky fill follows the game's Z-up axis. These ribbon-only geometry totals are historical; the current atlas-assisted grass totals are recorded above.

An earlier neighbor refinement preserved all eleven bones, four animation clips, exact standing bounds and seat anchors. Connected shoulders, skin joins and improved lower-shirt weighting addressed the seated waist intersection. A subsequent native garment pass sculpted asymmetric shoulder, waist and elbow folds after topology reduction, and fitted turned-edge denim pocket patches and fine double seams to the actual curved legs. Pocket relief measures 0.30–2.08 mm, replacing the prior 15–47 mm floating gap; its cylindrical cloth UVs match the leg convention. That garment export contained 119,126 triangles, down from 121,548 initially. Actual GLB tests verify both occupants fit the existing cabin, sparse-frame animation behavior, and byte-identical bone transforms, inverse binds and all four animation key streams. Native authoring renders remain separate from browser acceptance evidence. The later seated review described above exposed a separate preexisting shoulder/hem binding defect; this paragraph records the earlier authoring stage, not the current export.

The first connected-footwear pass replaced three independent elliptical shells per foot with one closed connected sole, sidewall and leather upper. Existing material bands run through the shared topology; the toe, heel and vamp use shaped cross-sections, with curved sewn ribbons and flat cotton laces fitted to the actual surface. Each main shoe in that stage was a closed manifold with 242 vertices and 242 polygons. That intermediate neighbor contained 118,390 triangles and 6,886,748 bytes, saving 736 triangles and 9,076 bytes against the accepted garment version. The authoring record for that stage reported unchanged foot, standing and seated bounds. The eleven bone transforms, inverse binds and all four animation key streams remain byte-identical; five actual exported rig, sparse-frame animation, cabin and coupe contracts pass. This intermediate shoe profile was later judged too angular and was replaced by the rounded upper described above.

## Built-in imagegen prompts

Concept: Use case: stylized-concept. Asset type: original game art direction reference sheet for an editable 3D browser neighborhood named Arroyo. Create a polished landscape concept board: main large street-level view of a sunny Southern California working-class cul-de-sac, weathered cream stucco bungalows, faded sage garage doors, porches, low chainlink fences, palms, overhead utility wires, worn asphalt and double yellow markings, muted dry lawns, blue sky and warm afternoon sun. Smaller studies along bottom: four different bungalow facades, an original coral 1990s sports coupe with glass cabin and two seats, and an original adult male neighbor in teal overshirt with cream tee and dark jeans, alternate rust overshirt. Grounded proportions and modern restrained stylized realism, soft shadows. No GTA logos, no copied characters or map, no existing car brand, no weapons. Show plausible affordable game geometry. This is an original art reference not a screenshot of existing game. Label only ARROYO / NEIGHBORHOOD STUDY.

Materials: Use case: photorealistic-natural. Asset type: seamless original tileable game material texture atlas. One square image, exactly four equal square quadrants with absolutely no border, gaps, labels, text, perspective or shadows: top left weathered warm cream stucco fine irregular plaster mottling; top right dark gray worn asphalt fine gravel with very subtle thin cracks; bottom left warm gray sidewalk concrete faint pits and weathering; bottom right muted olive dry grass with short sun bleached straw. Each quadrant should be independently seamless and uniformly lit, top-down orthographic surface scan, no objects, no dramatic contrast or large landmarks. Physically plausible small surface grain suitable for repeating on low poly neighborhood geometry.

The coupe includes named `cabin_ceiling` and `cabin_floor` bounds as well as seat anchors. The seated clip and shoulder proportions are checked against those bounds from the actual GLB skin. Standard/low fence exports share the same collision boundary. Blender source files can include nondeterministic editor metadata; the committed export inventory is the exact identity used by admission, and changing/rebuilding exports requires restarting the gateway.

## Dream-loop material and geometry upgrade (2026-09-08; historical record)

The following paragraphs preserve the September 8 authoring history. Later September 13 records above supersede intermediate model counts, asphalt scale, paint settings, foliage forms and reflection identities; these earlier settings are not presented as the current build.

Original authored extensions: `tools/assets/environment-kit.py` and `tools/assets/heroes.py`, executed by the pinned Blender 4.5.13 build. No downloaded vehicle, character, vegetation or building geometry. Source `.blend` files and GLB exports remain GPL-3.0-or-later.

New original bitmap inputs generated with the built-in image-generation tool (not an external model API):

- `assets/textures/arroyo-surfaces.png`: orthographic 2×2 albedo atlas; worn asphalt, pale concrete, cream stucco, dry green grass; evenly lit, no directional shadows or labels.
- `assets/textures/arroyo-details.png`: orthographic 2×2 atlas; roofing shingles, palm bark, faded sage siding, indigo denim; evenly lit, no labels.
- `assets/textures/arroyo-foliage.png`: original live-oak leaf branch on transparent RGBA, natural gaps and muted green variation, for alpha-tested cards.
- `assets/textures/arroyo-sky.png`: original equirectangular blue afternoon sky, soft clouds, hazy horizon and neutral lower hemisphere; no landmarks.

These are accepted project inputs under GPL-3.0-or-later. The original generated outputs are retained in the tool's generated-images directory; project builds consume the committed copies. Runtime material preparation crops atlas quadrants and derives aligned relief normals/roughness from their luminance. This is an artistic approximation, not measured scan data. Generated target screenshots guide art direction and are never presented as runtime evidence. Working prompts/targets/verdicts live in ignored `.dream-loop/`; the accepted decisions/results live in docs.

The refined houses bake local occlusion with 48 deterministic BVH visibility samples into neutral vertex colors; both presets preserve it. Runtime Standard adds original depth-reconstructed contact shading using the actual alpha-tested beauty depth. Road repairs, curb grass blades and eroded distant ridges are authored geometry. Seated arm pose changes keep loose sleeves within the unchanged cabin envelope.

The sky input was revised through built-in image editing: retain the original 2:1 projection and neutral lower hemisphere, increase clear-blue saturation about 15%, reduce gray cloud slabs to roughly 20% small warm-white cumulus/wispy cloud coverage, preserve a restrained warm horizon. Accepted source remains `arroyo-sky.png`; previous input is retained in git history.

### Authored asphalt and local reflection atlas (2026-09-08)

`assets/textures/arroyo-asphalt.png` is an original built-in image-generation material input: an orthographic, uniformly lit 12 m square of gray-brown Southern California asphalt with interconnected fine cracks and worn repairs, no markings or borrowed imagery. Accepted original output `exec-18b605f3-57ce-46ff-b321-6766b76652f2.png`; runtime uses aligned derived roughness/normal detail. It replaces the repeated uniform aggregate appearance. Rust and tobacco clothing keep the two outfit variants in the accepted earthy palette.

`apps/browser/public/assets/arroyo-reflections.pmrem.gz` is an original static neighborhood reflection atlas, captured through Three.js from scene geometry before any player joins. `tools/bake-reflections.mjs` rebuilds it using pinned Chromium/SwiftShader; `assets/source/reflection-bake.json` records input hashes, scene revision, renderer and checksums. PMR1 stores exact RGBA16F atlas texels in lossless gzip. Normal setup loads the committed cache, validates its checksum and bounded layout, and never needs a graphics or image-generation service. This is material data, not gameplay evidence. The probe is static at vehicle reset position, so it does not claim dynamic local reflection accuracy everywhere on the loop.

The subsequent canopy-normal pass preserves original branch/card positions and UVs, blending geometric leaf normals with a crown-shaped outward field. Coupe hood/deck profiles use original smooth cubic contours and shared analytic surface normals, retaining the measured vehicle envelope and seat/wheel transforms. Front-yard grass is original curved ribbon geometry scattered into manifest-derived clear areas below 0.25 m height. No third-party mesh data is used.

The next original kit pass creates seven interlocking oak crown lobes (630 attached sprays; 8,920 triangles) and 32 age-layered curved palm fronds (23,024 triangles), retaining trunk origins and clearances. Runtime foliage uses alpha-weighted linear-color mip generation with cutout coverage preservation and invisible edge-color padding; the accepted PNG is unchanged. The character now has a continuous sculpted face, shaped ears/hairline, separate fingers, localized cloth folds and continuous cloth UVs; the coupe has formed metal pillars. Both seat anchors and wheel pivots retain their exact transforms. All geometry is authored in the repository scripts and exported through the pinned Blender pipeline; isolated Cycles previews are authoring checks, not game screenshots.

The subsequent structural pass uses the same original image inputs. House walls now contain actual cut openings with front/side glazing roughly 14–20 cm behind the exterior; the four variants pass exported-mesh ray tests. The coupe roof, formed A/C pillars, glazing, hood/fenders and end covers share sampled boundaries rather than independent rails. Its exact whole-vehicle envelope, wheel and seat transforms remain unchanged. Low grass and soil islands derive from the shared scene manifest, with triangle-level clearance checks; they reuse the existing grass map. Broad distant mineral/scrub regions preserve the sampled skyline. Canopy normals follow the measured crown volume, with center Z 6.05 m rather than 5.15 m; geometry and leaf UVs remain unchanged. All editable sources and exports are original GPL-3.0-or-later.

The authored 12 m asphalt study is now mapped across 9.6 m to reduce aggregate/fissure scale 20%; normal strength falls from .55 to .4 while base exposure remains unchanged. The unused earlier atlas-asphalt map allocation is removed. Navy paint shifts from `#193d5a` to `#233d50`, reducing saturation at similar luminance after the body-continuity correction. Reflection provenance and hashes were regenerated with the complete final asset build. These are material/art choices, not resolution reductions.
