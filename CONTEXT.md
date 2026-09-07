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
