# Browser San Andreas Multiplayer

A replacement browser client that joins an existing multiplayer server through a native network gateway.

## Language

**Browser player**: A person controlling a locally rendered character or vehicle in a browser, represented by a normal player connection on the game server. _Avoid_: NPC, streamed desktop.

**Native worker**: One independent protocol client process representing a browser player's upstream connection. It contains no GTA executable or renderer. _Avoid_: game server, native reference client.

**Gateway**: The service connecting a browser session to its native worker. Other players' gameplay reaches it through the game server. _Avoid_: replacement multiplayer server.

**Server fixture**: The unchanged pinned open.mp server running a deliberately small Pawn gamemode with observable test behavior. _Avoid_: mock server.

**Native reference client**: An original GTA/SA-MP desktop installation used for a separate future interoperability check. _Avoid_: native worker.

**Driver**: The player assigned to simulate the shared vehicle and submit driver updates.

**Passenger**: A seated player whose position follows the shared vehicle without authority to drive it.

**Protocol proof**: Demonstrated normal-player behavior on the pinned server through actual SA-MP UDP traffic. It is narrower than native GTA gameplay compatibility.

**Session epoch**: Gateway-assigned identity for one browser WebSocket session. Rejoining creates a new epoch so delayed messages cannot enter the new session.

**Control revision**: Native worker counter changed by server corrections and seat transitions. Browser snapshots echo it; the worker drops snapshots from an earlier revision.

**Seat reservation**: A Pawn fixture rule assigning a driver or passenger slot before sending standard vehicle-placement RPCs. It is distinct from a client's vehicle-entry notification.

## Neighborhood presentation

- **Scene manifest:** shared static placements, collision, spawns, resets, vehicle and minimap geometry; selected by POC_SCENE.
- **Scene revision:** content identity advertised by the gateway and echoed on join, preventing clients playing different geometry together.
- **Asset kit:** original reusable Blender exports and their editable source scripts; independent of protocol entities.
- **Seat anchor:** visual local transform for a replicated driver/passenger, not a seat reservation or networking message.
- **Arroyo:** original browser neighborhood, not part of the native GTA map.
- **Drawing buffer:** the pixel resolution used for the 3D scene. Low uses 384 × 216 inside a 1280 × 720 view; HTML controls retain the view's resolution.
- **Texture storage audit:** test-only accounting of WebGL texture allocations, including mipmaps, skeletons and shadows. Logical texture bytes exclude driver overhead and total browser memory.
- **Recorded soak:** a sustained functional session captured with video/traces. Its capture cost is reported separately from an unrecorded ordinary-play benchmark.
