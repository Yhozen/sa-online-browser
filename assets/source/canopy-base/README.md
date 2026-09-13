# Retained oak bases

These are immutable, original no-accessibility `.blend` and `.glb` inputs. `base.json` records their exact identities and original export provenance. The current runtime outputs must never replace these inputs as part of a normal build. A new structural tree edit requires a separately reviewed base revision and fresh visibility bake.

`tools/assets/canopy-visibility.py` casts alpha-aware rays from the retained native meshes. The companion JavaScript module verifies a byte-exact original vertex bijection, transfers only the new forward/back diffuse accessibility, and appends that field to the original GLB buffer layout. Published `assets/source/tree.blend` and `roadside-oak.blend` are the authored copies. Raw native exports and per-model reports are retained under `assets/source/canopy/`.

The accepted native bake and export were verified with Blender **5.2.1**. Compatibility with 4.5.13 has not been verified; the newer source save version alone is not proof of incompatibility. Full/oak builds require a verified 5.2.1 executable. macOS uses `/Applications/Blender.app` when installed. On Linux, provide the executable explicitly:

```sh
node tools/build-assets.mjs --blender /path/to/blender-5.2.1 --models tree,roadside-oak --skip-reflections
```

The automatic pinned Linux 4.5.13 executable remains available for selective non-oak models and terrain. It is no longer the default path for a full build that includes these oaks. The command fails before downloading 4.5.13 when a full/oak build has no suitable explicit executable. After asset publication, rebuild the browser and refresh native local reflections through the normal project workflow.
