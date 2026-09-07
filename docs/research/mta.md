# MTA browser compatibility research

Research date: **2026-09-07**. Scope: whether a new browser game can join existing MTA servers alongside native players. This is source research, not a demonstrated connection or portability test.

## Finding

**Do not select MTA for the first browser protocol implementation.** Its public repository exposes a valuable game replication implementation, but important transport, identity, anti-cheat, and script-loading functionality remains in native closed-source modules. Broad server compatibility would also require implementing MTA's client Lua/resource API over a replacement GTA runtime. This recommendation is an engineering inference from the evidence below, to be compared with the separate SA-MP investigation.

MTA remains a possible later target if its maintainers provide a supported alternative-client networking interface, or if the product deliberately targets cooperative servers with a custom gateway/resource. That latter design must be described as a custom integration, not evidence that an arbitrary MTA server accepts the browser client.

## Audited revision and provenance

Inspected official repository [multitheftauto/mtasa-blue](https://github.com/multitheftauto/mtasa-blue), shallow-cloned locally under `.context/research/mta`. Pinned revision: [`322a139950084bd3d4e64fa071beebadf78b8b84`](https://github.com/multitheftauto/mtasa-blue/commit/322a139950084bd3d4e64fa071beebadf78b8b84), commit timestamp `2026-09-07T08:18:46Z`, titled “Update CEF to 152.0.5+gb129680+chromium-152.0.7977.54 (#5331)”. Repository activity exists on the research date; this is not an abandoned codebase.

Version caveat: audited `master` declares **1.7.0**, while the wiki download link advertises **1.6.0**. Development head is therefore not a substitute for identifying a deployed server's exact release, net module and bitstream versions. Sources: [pinned version.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/version.h#L43), [wiki landing page](https://wiki.multitheftauto.com/wiki/Main_Page).

## Evidence by layer

### Transport and public source completeness

- **Verified:** player connections use UDP, default port 22003. Resource HTTP service uses a separate TCP port, default 22005; an external download URL can replace that service. HTTP resource support does not mean the gameplay endpoint accepts browser HTTP connections. [Server configuration](https://wiki.multitheftauto.com/wiki/Server_mtaserver.conf#serverport).
- **Verified:** official fork documentation explicitly identifies `netc.dll`, `net.dll`, and `FairplayKD.sys` as closed source. It distinguishes fork anti-cheat support from official builds and requires compatible network-module versions. [Forks and anti-cheat](https://wiki.multitheftauto.com/wiki/Forks#Forks_and_anti-cheat).
- **Verified in code:** the install-data script downloads client `netc.dll` and server `net.dll`/`net.so` binaries. `Client/core/CCore.cpp` creates its network module from `netc` and `InitNetInterface`, then calls the binary's compatibility check. Server startup dynamically loads its network library, checks its version, and resolves `InitNetServerInterface`. [Download script](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/utils/buildactions/install_data.lua#L8), [client loading](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Client/core/CCore.cpp#L1093), [server loading](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Server/core/CServerImpl.cpp#L333).
- **Verified:** public `CNet` exposes pure virtual connection, sending, bitstream allocation, serial, validation and script deobfuscation operations. `NetBitStreamInterface` similarly exposes serialization interfaces rather than a complete concrete transport implementation. [CNet.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Client/sdk/net/CNet.h#L63), [bitstream.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/net/bitstream.h#L49).
- **Verified but limited:** packet headers reference RakNet and enumerate its message IDs. This establishes RakNet lineage; it does **not** establish that an off-the-shelf RakNet implementation can connect or reveal the complete current wire handshake. [packetenums.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/net/packetenums.h#L14).

**Inference:** compiling this repository to WebAssembly is not a complete networking strategy. A browser-facing relay still needs a functioning MTA-side endpoint; forwarding bytes does not fill the missing protocol behavior. Running a native module in a gateway might be investigable, but a usable standalone client ABI, permitted deployment, identity handling, and server acceptance have not been demonstrated.

### Joining, versions and anti-cheat

The visible application join packet includes net version, MTA version, bitstream version, player version string, update preference, game version, nickname, and a 16-byte password hash. This is **application-level** parsing after transport setup, not the complete connection handshake. [CPlayerJoinDataPacket.cpp](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Server/mods/deathmatch/logic/packets/CPlayerJoinDataPacket.cpp#L15).

Server join handling obtains client serial/version from the network module, validates a 32-character hexadecimal serial, can reject duplicate serials, requires matching net version, enforces minimum client version, and checks version consistency for relevant builds. Reproducing the visible nickname/password fields alone is insufficient. [CGame.cpp join handling](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Server/mods/deathmatch/logic/CGame.cpp#L1832).

`version.h` distinguishes release, unstable and custom builds and changes compatibility identifiers accordingly. It gives separate procedures for public servers accepting official clients and custom servers accepting custom clients. Its private-development “without anti-cheat” option still uses a downloaded `netc.dll`; it is not a public source-only transport mode. [Build and module compatibility guidance](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/version.h#L6).

The official anti-cheat guide says `disableac` cannot disable all detections. Therefore “turn off anti-cheat in the server config” is not a verified solution for a browser client. [Anti-cheat guide](https://wiki.multitheftauto.com/wiki/Anti-cheat_guide).

**Unknown:** the complete transport challenge/identity validation exchange, whether a supported browser identity can be issued, and what an unmodified release server would require from a non-native client. These require a sanctioned prototype or maintainer documentation; no claim of impossibility or successful bypass is made here.

### Native GTA dependence

The client manual requires an installed GTA: San Andreas 1.0 game and describes Windows/DirectX requirements. The code confirms that MTA extends an existing game process: `CGameSA.cpp` dereferences absolute GTA memory addresses, changes memory protection, and installs hooks for game entities, models, rendering and tasks. [Client manual](https://wiki.multitheftauto.com/wiki/Client_Manual#Before_you_start), [native runtime coupling](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Client/game_sa/CGameSA.cpp#L66).

**Inference:** even with a solved wire protocol, the browser needs a substantial replacement runtime: world streaming, collision, movement, vehicles, animation, combat, rendering and game-state semantics. MTA is not a portable standalone implementation of all those systems. Rendering native MTA remotely and streaming video would be a different product architecture.

### Lua, resources and game behavior

MTA resource metadata defines server/client/shared scripts, downloads, dependencies, exports and minimum versions. Downloaded assets can include TXD, COL and DFF files. Supporting the UDP entity stream alone cannot execute server-supplied client game logic. [Meta.xml specification](https://wiki.multitheftauto.com/wiki/Meta.xml).

The client registers Lua functions covering audio, browser, camera, collision, drawing, engine, GUI, networking, entities, vehicles, weapons and more. Broad compatibility means reproducing observable API behavior, resource lifecycle, events, timers, exports and element semantics, with browser-side sandboxing. [CLuaManager.cpp API registration](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Client/mods/deathmatch/logic/lua/CLuaManager.cpp#L246).

An additional native boundary exists before Lua loading: `CLuaMain::LoadScriptFromBuffer` calls `g_pNet->DeobfuscateScript`; failures reject the script. Consequently adding a standard Lua VM does not demonstrate support for compiled/obfuscated resources. [Script loading](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Client/mods/deathmatch/logic/lua/CLuaMain.cpp#L214).

The public replication layer is nevertheless useful reference material: player/vehicle synchronization, Lua events and resource lifecycle packet identifiers are available, as are many application packet readers/writers. [Packets.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/net/Packets.h#L16), [SyncStructures.h](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/Shared/sdk/net/SyncStructures.h).

**Inference:** a small controlled server using selected functions could reduce the runtime/API workload. Compatibility with arbitrary existing roleplay, racing or custom-content resources is a much larger scope and cannot be inferred from a successful minimal join.

## Licensing and reuse boundary

The official repository identifies GPLv3 as its default source license, with exceptions where specified; its root license is GPLv3. Its README treats GTA as a separate proprietary game. Treat MTA source, third-party dependencies, closed network modules and GTA assets as distinct provenance categories. The repository's license is not evidence that the separately downloaded binaries or Rockstar assets may be ported or redistributed under the same terms. [Pinned README licensing](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/README.md#license), [LICENSE](https://github.com/multitheftauto/mtasa-blue/blob/322a139950084bd3d4e64fa071beebadf78b8b84/LICENSE).

Implementation planning consequence: record exact file licenses before reuse, keep source provenance, and resolve closed-module permissions if that route is pursued. This research did not audit every vendor license or establish a redistribution policy for game assets.

## Decision conditions and future work

Prefer SA-MP **if its independent investigation establishes a licensed, inspectable server/network implementation and a smaller client behavior surface**. MTA's advantages—active maintenance, substantial public game logic and strong documentation—do not remove its current network-module and resource-runtime risks.

Revisit MTA only after a bounded spike can answer:

1. Which released client/server/net-module tuple is the target? Pin source and binary hashes.
2. Is there a maintainer-supported way for a new client/gateway to complete transport and identity setup without impersonating an official native build?
3. Can that endpoint join an unmodified selected server, stay connected, spawn and exchange movement with a stock client?
4. Which client Lua functions and resource formats does one representative game mode actually require? Can plain and compiled scripts load through supported interfaces?
5. Which engine behaviors must match native GTA for that mode, and what measurable errors are acceptable?

No MTA server or client was executed, no packets were captured, and no interoperability or performance claim has been validated. The current result is a high-confidence identification of architectural risks, not a working alternate client.
