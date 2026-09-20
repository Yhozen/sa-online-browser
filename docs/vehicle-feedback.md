# Coupe movement and lamp feedback

The original coupe now shows its observed driving state mechanically. This presentation uses the existing SA-MP vehicle rotation, velocity, and driver key mask. It adds no network message and does not change vehicle physics, seat anchors, collision shapes, body transforms, or the character/cabin fit.

`animateCar(group, velocity, dt, { rotation, keys })` in `characters.ts` feeds `VehiclePresentation` on the existing fixed simulation clock. Root integration selects keys from the local driver or the server-relayed peer driving that vehicle.

- Wheel rotation follows signed distance along the car's actual forward direction, including reversing and vehicles facing any heading. All four existing wheel pivots remain fixed.
- Front wheels smoothly steer from observed heading change and signed speed; rear wheels remain straight. Reverse steering follows the same motion geometry. Wheels return straight at rest. Large heading corrections do not produce a violent steering transient.
- Red brake lenses brighten while applying the reverse/brake key while moving forward, holding the handbrake while moving, or observing substantial deceleration. Their emission stays within a useful range for the current ACES exposure, preserving red rather than blowing out to pale orange.
- The existing white reverse lenses illuminate when moving backward. Blender batches these lenses with other ivory parts; runtime code partitions only their exact authored triangles into a separately controlled material. It leaves registration plates and other ivory details unaffected and introduces no floating overlay or duplicated lamp faces.

The exporter conventions were verified against the actual committed GLB: `_0` wheel groups are rear, `_1` groups are front, and each complete wheel's local Z is its rolling axle. The glTF parent basis is converted to the existing Z-up world once by the asset loader. Steering composes around the correct vertical axis while rolling remains around the wheel axle.

Lamp materials belong to each car instance. Standard uses emissive PBR materials; Low uses the corresponding actual Basic material color and retains the same lamp state. Switching presets restores the current Standard state. Disposal restores shared original geometry/material references, removes owned reverse-lamp geometry, releases both Standard and cached Low lamp materials, and leaves shared asset cache resources alive.

Body roll and suspension displacement are intentionally absent in this change: moving the car body independently of its current cabin/occupant contract requires separate rigging and fit work. Front brake calipers remain part of the existing static body mesh. Night-time headlight beams, indicators, damage, gearing, and native GTA vehicle parity remain unimplemented.

## Evidence

Run `node --experimental-transform-types --test tests/vehicle-presentation.test.mjs`. Five tests use the actual exported coupe and prove signed rolling, rotated/reverse travel, front-only steering, rest recovery, fixed wheel/seat centers, exact reverse-lamp triangle partition, per-instance lamp ownership, Standard/Low switching, disposal, and invalid-sample/correction behavior. The existing exported-asset and animated-character tests also pass.

Run `node tools/verify-vehicle-visual.mjs`, or headed with `xvfb-run -a env POC_HEADLESS=0 node tools/verify-vehicle-visual.mjs`, for four original renderer captures. The isolated diagnostic loads the committed GLB and the actual presentation code, using a separate ephemeral HTTP port. It records front steering, rear brake, rear reverse closeup, and Low brake views at native 1280×800/DPR 1 in ignored `artifacts/vehicle-presentation/`, along with browser errors and observed state. These are actual 3D renders, not generated images, but the isolated display is **not multiplayer acceptance evidence**; integrated neighborhood driving remains a separate verification gate.
