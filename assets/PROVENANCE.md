# Original Arroyo assets

Created September 7, 2026 for this repository. Original modeling, rigging, animation, layout and scripts use GPL-3.0-or-later. Generated images are original built-in imagegen outputs; distributed under the repository's licensing approach to the extent copyright applies. No GTA, SA-MP, vehicle-brand or third-party model/texture data is included.

- `reference/arroyo-concept.png`: built-in imagegen, original concept reference, not in-engine evidence.
- `textures/neighborhood-atlas.png`: built-in imagegen, four surface inputs (stucco, asphalt, concrete, dry grass). Runtime extracts four 512² textures; no image service is needed at setup or runtime.
- `source/*.blend`: editable Blender 4.5.13 sources, including weighted character mesh, armature and actions; script creates deterministic geometry with explicit weights.
- `../tools/assets/build.py`: authoritative editable modeling/export recipe.
- `../apps/browser/public/assets/*.glb`: committed meter-scale exports, Blender Z-up/+Y forward converted by standard glTF exporter to Y-up/-Z forward; browser normalizes once.
- Blender 4.5.13 archive SHA256 `da4e69b06b75b9e642d106496c50e7e240218b411d2f6e18271c1d1d819cef91`; extracted executable SHA256 `e3ce4e960a2fd3beb1f9d2299e38b3804475ccd395193013aec239a4b75bfbfe`. The official mirror URL and both checks are recorded in `tools/build-assets.mjs`. Blender itself remains ignored in .runtime, under its upstream GPL license.

## Built-in imagegen prompts

Concept: Use case: stylized-concept. Asset type: original game art direction reference sheet for an editable 3D browser neighborhood named Arroyo. Create a polished landscape concept board: main large street-level view of a sunny Southern California working-class cul-de-sac, weathered cream stucco bungalows, faded sage garage doors, porches, low chainlink fences, palms, overhead utility wires, worn asphalt and double yellow markings, muted dry lawns, blue sky and warm afternoon sun. Smaller studies along bottom: four different bungalow facades, an original coral 1990s sports coupe with glass cabin and two seats, and an original adult male neighbor in teal overshirt with cream tee and dark jeans, alternate rust overshirt. Grounded proportions and modern restrained stylized realism, soft shadows. No GTA logos, no copied characters or map, no existing car brand, no weapons. Show plausible affordable game geometry. This is an original art reference not a screenshot of existing game. Label only ARROYO / NEIGHBORHOOD STUDY.

Materials: Use case: photorealistic-natural. Asset type: seamless original tileable game material texture atlas. One square image, exactly four equal square quadrants with absolutely no border, gaps, labels, text, perspective or shadows: top left weathered warm cream stucco fine irregular plaster mottling; top right dark gray worn asphalt fine gravel with very subtle thin cracks; bottom left warm gray sidewalk concrete faint pits and weathering; bottom right muted olive dry grass with short sun bleached straw. Each quadrant should be independently seamless and uniformly lit, top-down orthographic surface scan, no objects, no dramatic contrast or large landmarks. Physically plausible small surface grain suitable for repeating on low poly neighborhood geometry.

The coupe includes named `cabin_ceiling` and `cabin_floor` bounds as well as seat anchors. The seated clip and shoulder proportions are checked against those bounds from the actual GLB skin. Standard/low fence exports share the same collision boundary. Blender source files can include nondeterministic editor metadata; the committed export inventory is the exact identity used by admission, and changing/rebuilding exports requires restarting the gateway.

## Dream-loop material and geometry upgrade (2026-09-08)

Original authored extensions: `tools/assets/environment-kit.py` and `tools/assets/heroes.py`, executed by the pinned Blender 4.5.13 build. No downloaded vehicle, character, vegetation or building geometry. Source `.blend` files and GLB exports remain GPL-3.0-or-later.

New original bitmap inputs generated with the built-in image-generation tool (not an external model API):

- `assets/textures/arroyo-surfaces.png`: orthographic 2×2 albedo atlas; worn asphalt, pale concrete, cream stucco, dry green grass; evenly lit, no directional shadows or labels.
- `assets/textures/arroyo-details.png`: orthographic 2×2 atlas; roofing shingles, palm bark, faded sage siding, indigo denim; evenly lit, no labels.
- `assets/textures/arroyo-foliage.png`: original live-oak leaf branch on transparent RGBA, natural gaps and muted green variation, for alpha-tested cards.
- `assets/textures/arroyo-sky.png`: original equirectangular blue afternoon sky, soft clouds, hazy horizon and neutral lower hemisphere; no landmarks.

These are accepted project inputs under GPL-3.0-or-later. The original generated outputs are retained in the tool's generated-images directory; project builds consume the committed copies. Runtime material preparation crops atlas quadrants and derives aligned relief normals/roughness from their luminance. This is an artistic approximation, not measured scan data. Generated target screenshots guide art direction and are never presented as runtime evidence. Working prompts/targets/verdicts live in ignored `.dream-loop/`; the accepted decisions/results live in docs.

The refined houses bake local occlusion with 48 deterministic BVH visibility samples into neutral vertex colors; both presets preserve it. Runtime Standard adds original depth-reconstructed contact shading using the actual alpha-tested beauty depth. Road repairs, curb grass blades and eroded distant ridges are authored geometry. Seated arm pose changes keep loose sleeves within the unchanged cabin envelope.
