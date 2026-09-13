# Native visual studies after round twelve

These rejected studies used runtime `b49e186`, scene `6c1739ad64e66280`.
They were evaluated in separate native Chrome windows and **were not installed**.
The later accepted cross-street sun is documented separately in the
[round-thirteen integration](native-lighting-integration-round13.json).

| Study | Actual result | Decision |
| --- | --- | --- |
| Rear-house oak at (-28, 53, 9) | Approximately 1.7 percentage points of additional far-road shade; a wider normal camera view exposed a long lateral branch ending in an isolated round crown. | Rejected: the visible whole-tree shape was unnatural and the shade gain too small. |
| Measured diffuse spherical-harmonic field | Numerically valid six-face native capture and clean shader compilation. Shaded pavement became too blue; houses, character and crowns became too dark. | Rejected on the actual pixels. |
| Generated leaf-normal atlas and thin-sheet response | Native shader compilation, original geometry/alpha/instance identity and exact material restoration passed. Crowns became darker and coarser at the comparison size. | Rejected on the actual pixels. |
| Combined diffuse and leaf treatment | Both changes composed without errors, but their visual problems accumulated. | Rejected. |
| Coherent 30° sun, terrain irradiance and rebuilt local reflections | Longer shadows reached the turning circle, but a broad blue shadow covered the playable character and foreground; the far-right circle still lacked scattered shade. | Rejected after root and independent visual review. |

The lighting comparison completed at **11:30 UTC on September 13, 2026**. All six
stages used Standard at native DPR 2, a 3344×1882 drawing buffer and 1672×941
screenshots. The scene retained 912 draw calls and 4,946,823 submitted triangles
throughout. There were no page or shader errors; one expected development warning
reported the separately bundled Three.js helper. The owned window was closed,
canonical and served inputs were unchanged, and original material bindings were
restored. Character animation prevents claiming whole-frame pixel equality.

The diffuse field integrates the actual scene's six 128² float faces with explicit
camera bases and solid-angle weights. Its numerical checks include 4π closure,
finite nonnegative irradiance and zero negative clamp energy. A single probe,
the original LDR sky, limited shadow volume and approximate first-bounce treatment
remain physical limitations. Numerical consistency did not make its appearance
closer to the concept. No coefficient scaling was used to disguise that result.

An initial capture was invalidated: the capture harness copied a render target
onto itself during restoration, clearing its attachments and causing late errors.
The fitter rejected those errors. The repaired guard copies only distinct cloned
math values, restores GPU resources by identity and checks errors through final
cleanup. A fresh successful capture supplied the comparison; the invalid attempt
is preserved separately and supplies no accepted field.

The generated normal image preserves its original source and prompt. Its leaf
registration is approximate, with 93.3% opaque recall and 82.4% precision. The
original diffuse alpha remains authoritative. Documented vector normalization and
independent alpha-weighted mip preparation produce 1.33 MiB of logical normal-map
storage. This is authored texture data, not measured botanical surface normals.

The compact [comparison record](native-visual-studies-round12.json) identifies
the raw evidence and its hashes. Full source, images and measurements remain in
the local `.dream-loop/lighting-capture`, `.dream-loop/lighting-comparison`,
`.dream-loop/diffuse-light-prototype`, `.dream-loop/leaf-normal-prototype` and
`.dream-loop/rear-house-oak-authoring` directories. They are experimental working
files, separate from the shipped asset pipeline.

The separate 30° comparison completed at 12:20 UTC with baseline, candidate and
restored-baseline captures at the same native resolution. It preserved horizontal
direct irradiance, while direct illumination on a sun-facing vertical plane rose
37.4%. The actual rebuilt reflection peak was 5.3945, below the existing limit of
16; no gain or clamping was applied. Candidate shadow culling reduced submissions
to 900 calls and 4,844,391 triangles. This preview temporarily retained both old
and new reflection targets, so it supplies no production memory or FPS claim.
All original bindings and terrain bytes restored, inputs stayed exact, no browser
errors occurred, and the owned window and worker closed. Evidence is in
`.dream-loop/coordinated-sun`. Subsequent geometry attribution identifies the
foreground palm, rather than an oak, as the main caster over the character at
this angle; the accepted cross-street direction clears the character without pruning the palm.
