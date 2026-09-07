# ADR 0003: original neighborhood presentation over the existing protocol subset

Status: accepted and being verified, 2026-09-07.

## Decision

Build Arroyo, a roughly 180-meter-square original Southern California neighborhood, using the existing browser/open.mp transport and player/seat lifecycle. Keep the yard selectable for regression testing. Custom map geometry remains a browser fixture and establishes no original GTA world compatibility.

The static scene manifest owns placements, colliders, minimap paths and Pawn spawn/reset/car coordinates. Server scene selection defaults to neighborhood and can be overridden by POC_SCENE. The gateway revision hashes the manifest and committed asset inventory. Browsers verify every GLB/texture SHA256 before enabling Join and echo the revision on admission; mismatches are rejected before a native worker starts.

Original Blender 4.5.13 sources and deterministic modeling scripts are committed alongside exports. Ordinary setup consumes exports, without downloading Blender or invoking image generation. The built-in imagegen skill created the original concept and material atlas; prompts and license/provenance are recorded. Generated art is a visual input, not acceptance evidence.

World geometry and presentation are separated from lifecycle code. Characters derive idle/walk/jump/seated animation from existing replicated movement and seat state. Seat anchors affect rendering only. Pawn commands still allocate actual seats, and every peer update still passes through the upstream UDP server.

## Graphics tradeoff

The VM's SwiftShader backend is substantially slower than a hardware GPU. Low mode uses reduced internal canvas resolution, baked vertex shading, simplified fence wires, no shadow maps and no backdrop blur; HTML HUD resolution is unchanged. Standard mode uses PBR materials and soft directional shadow maps. Repeated props/vegetation are instanced; houses are merged by shared material after placement, and coupe body parts share material batches while retaining separate wheels and seat anchors. This keeps downloadable assets and draw calls within the initial budgets.

Actual VNC desktop and headed Xvfb performance are recorded separately. Hardware GPU performance remains unverified. Passing rendered screenshots alone never satisfies multiplayer acceptance; server observations and decoded peer snapshots are required.

## Consequences and continuation

The neighborhood remains outdoors, flat and small. It has no streaming interiors, ambient traffic, combat or day/night cycle. Collider/visual bounds and camera behavior require regression checks when adding assets. Future work proceeds to a server-scored checkpoint challenge, private remote invitations and latency tests, then a native-client interoperability slice with coordinate and geometry alignment.
