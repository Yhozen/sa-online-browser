# SA-MP protocol research

Research date: **2026-09-07**. Method: current primary project pages, shallow source checkouts, inspection of the exact release and dependency revisions below. This is a source-based feasibility assessment; **no connection or interoperability test has been performed**.

## Recommendation

Implement the **SA-MP 0.3.7 legacy wire protocol**, initially against a controlled **open.mp v1.5.8.3079 server**, with a native gateway maintaining each browser player's UDP connection. Use open.mp as the primary protocol reference and test oracle. Defer 0.3.DL custom model downloads, open.mp-specific client extensions, arbitrary public-server compatibility, and full GTA gameplay parity.

This is an engineering recommendation, not proof of a working browser client. The strongest evidence is open.mp's inspectable legacy server implementation. The largest early uncertainty is client-side transport/authentication: the presence of `RakClient` in its dependency does **not** make that dependency a complete working SA-MP client.

## Sources and reproducible baseline

| Source | Revision / status | Use |
| --- | --- | --- |
| [open.mp release](https://github.com/openmultiplayer/open.mp/releases/tag/v1.5.8.3079) | `v1.5.8.3079`, commit `c6759bd8d265171ae3d86598895a23d5a8d92a3b` | Initial test server; resolved by `/releases/latest` on research date |
| [open.mp source](https://github.com/openmultiplayer/open.mp/tree/c6759bd8d265171ae3d86598895a23d5a8d92a3b) | Same release commit | RPC/packet schemas and server behavior |
| [RakNet dependency](https://github.com/openmultiplayer/RakNet/tree/417077754bed5c23c38d64fb39c5a629790c091b) | `417077754bed5c23c38d64fb39c5a629790c091b` | Exact release gitlink; modified RakNet 2.52 |
| [Network dependency](https://github.com/openmultiplayer/open.mp-network/tree/dc3eac9d5dc30f96edcf4e7e64f33d8c241d49ff) | `dc3eac9d5dc30f96edcf4e7e64f33d8c241d49ff` | Bitstream primitives |
| [SDK dependency](https://github.com/openmultiplayer/open.mp-sdk/tree/efc11219c587dd1af791130bb937152051c05bda) | `efc11219c587dd1af791130bb937152051c05bda` | Release type/API definitions |
| [FlexodMR/SA-MP](https://github.com/FlexodMR/SA-MP/tree/318bcd6371a3de6b51b4ce06b287797a12b97bfb) | `318bcd6371a3de6b51b4ce06b287797a12b97bfb`, latest commit dated 2021-09-22 | Secondary research lead only |

Local disposable checkouts are `.context/research/openmp` and `.context/research/flexodmr-samp`. The open.mp checkout was first inspected at master `91a38854f02b05f35bcd3d1162d4fc205d9a4cb9`, then moved to the release above and its network/RakNet gitlinks. Critical findings were rechecked at the release; use the release links in this document, not a floating branch.

## Verified facts

### Current version and site provenance

The supplied [sa-mp.mp homepage](https://www.sa-mp.mp/) describes itself as the community-maintained successor after sa-mp.com closed, cooperating with open.mp. It is not evidence that a random repository is an official source release. Its [download page](https://www.sa-mp.mp/downloads/) advertises **0.3.7-R5-2-MP**, separately offers **0.3.DL-R1-2-MP**, and describes the R revisions as fixes/security updates. These are distribution labels; the target wire family is **0.3.7**, not a new protocol named R5.

The [legacy server connection implementation](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Server/Components/LegacyNetwork/legacy_network_impl.cpp#L316) explicitly distinguishes version numbers **4057 (0.3.7)** and **4062 (0.3.DL)**. It validates a server-token XOR version response and checks player authentication and the serialized client key. This is a multi-stage handshake, not just sending movement packets to a UDP port.

### Transport and authentication

The [RakNet README](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/README.md) identifies a modified **RakNet 2.52**, adapted for SA-MP, and explicitly says it is not taken from leaked SA-MP source. Do not substitute contemporary RakNet/SLNet or a Minecraft RakNet package without wire-level proof.

The [SA-MP transport additions](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/SAMPRakNet.cpp) include client-to-server datagram decoding, address-dependent cookies, an authentication challenge/response table, and optional open.mp encryption. The [peer implementation](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/Source/RakPeer.cpp) sends an authentication challenge, validates player/NPC responses, and later sends the connection acceptance token. Normal player authentication matters: an NPC connection is not equivalent to a playable client.

**Important negative finding:** [SocketLayer.cpp](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/Source/SocketLayer.cpp#L360) unconditionally decodes incoming SA-MP client datagrams in `RecvFrom`, while legacy `SendTo` emits server-direction bytes without that client obfuscation. [RakClient.cpp](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/Source/RakClient.cpp) contains generic connect/receive code and parses the acceptance token, but the inspected files do not provide a demonstrated complete client-side cookie/auth/obfuscation path. **Inference:** direct reuse requires adaptation, or a separately validated client transport. Compiling `RakClient` is insufficient acceptance evidence.

### Protocol scope

The release has 178 textual `NetworkPacketBase` structure declarations across `Shared/NetCode`; this is an inventory observation, **not** 178 distinct supported features (some directions share IDs and some entries are extensions). The headers cover players, vehicles, objects, actors, dialogs, textdraws, labels, checkpoints, pickups, menus, gang zones, and custom models. [Schema directory](https://github.com/openmultiplayer/open.mp/tree/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Shared/NetCode).

[core.hpp](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Shared/NetCode/core.hpp) identifies join RPC 25, initialization RPC 139, spawn RPC 52, chat RPC 101, commands RPC 50, on-foot packet 207, aim 203, and bullet 206. Critically, on-foot `read` and `write` describe **different directions**: server output includes a player ID and conditional/compressed fields absent from the server input shape. Build separate client-to-server and server-to-client codecs; do not assume symmetry or memcpy native structs.

[class.hpp](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Shared/NetCode/class.hpp) defines class/spawn request-response RPCs 128/129. [vehicle.hpp](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Shared/NetCode/vehicle.hpp) defines driver packet 200, passenger 211, unoccupied 209, and trailer 210. These are useful second-stage features after on-foot lifecycle works.

The [network send implementation](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Server/Components/LegacyNetwork/legacy_network_impl.hpp) selects reliable/reliable-ordered delivery for RPCs and unreliable/unreliable-sequenced delivery for ordinary sync, depending on channel. A gateway should preserve the distinction between events and replaceable snapshots.

### Controlled server configuration

The [open.mp configuration documentation](https://open.mp/docs/server/config.json) documents `network.allow_037_clients`, optional `network.use_omp_encryption` alongside legacy traffic, `network.mtu` (576 default), per-category sync rates, and `artwork.enable`. The initial fixture should explicitly allow 0.3.7, disable custom artwork and optional encryption for a deterministic baseline, use a small known gamemode, and record the complete config. It should accept both a normal native client and the experimental client, rather than teaching a modified server to accept invalid browser packets.

## Source reuse and provenance assessment

open.mp's own files carry [MPL-2.0 notices](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/LICENSE.md). The RakNet dependency has older license notices naming Creative Commons noncommercial, commercial, and GPL v2-or-later license arrangements; see its [source header](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/Source/RakClient.cpp#L1) and [original readme](https://github.com/openmultiplayer/RakNet/blob/417077754bed5c23c38d64fb39c5a629790c091b/readme.txt). **Do not label the combined dependency MPL, MIT, or BSD.** Resolve the intended reuse/distribution path and each dependency's notices before vendoring. This is an observed source-license issue, not a legal conclusion about which license applies to our future implementation.

GitHub identifies [FlexodMR/SA-MP](https://github.com/FlexodMR/SA-MP) as a fork of `teredokot/SAMPC`. Its [pinned README](https://github.com/FlexodMR/SA-MP/blob/318bcd6371a3de6b51b4ce06b287797a12b97bfb/README.md) calls it unfinished reverse engineering of 0.3.7/0.3DL, warns of instability/incomplete progress tracking, and requires its own incompatible auxiliary archives. No top-level license was found in the inspected checkout. Older SA-MP copyright/version comments remain in files such as [netgame.cpp](https://github.com/FlexodMR/SA-MP/blob/318bcd6371a3de6b51b4ce06b287797a12b97bfb/client/net/netgame.cpp). These facts do not establish authorized source provenance or a usable modern client. Do not copy it as the foundation or treat its repository description as proof that SA-MP is open source.

## Open questions and staged proof

1. **Transport feasibility gate:** implement or adapt the client direction, then connect as a normal player to the pinned unmodified open.mp server, pass cookie/auth/join/init, stay connected for 10 minutes, disconnect/reconnect, and repeat with a second simultaneous client. Capture packet traces and expected state transitions. Test retransmission, malformed/truncated input, packet reordering, and timeouts. A query response or NPC join does not pass this gate.
2. **Differential codec gate:** obtain authorized native-client sessions on our fixture and produce fixtures for each direction of lifecycle, chat, spawn, on-foot sync, and stream-in/out. Compare observed bytes to the server source. Test against two independent observations where possible; a codec round-trip against itself can reproduce the same bug twice.
3. **Browser gameplay gate:** send browser state through a gateway, render streamed players and the known scene, and confirm browser/native friends see each other's movement and chat. Protocol compatibility alone supplies neither GTA assets nor collision, animation, movement physics, or rendering.
4. **Gameplay expansion:** add vehicles, passenger transitions, damage/death, objects, basic dialogs/textdraws, and server corrections in explicit compatibility tiers. Use a feature matrix containing implemented, approximated, unsupported, and tested status.
5. **Legacy-server gate:** repeat normal-player join and gameplay against an acquired, version-pinned original 0.3.7 server. open.mp success is not proof that every SA-MP release accepts the handshake or that the open.mp auth table covers every original-server challenge. Native-client capture access and server binary availability remain unverified.
6. **Public-server limits:** gamemode-specific client checks, GTA-memory checks, server-side anti-cheat, plugins, and third-party launcher requirements may exclude a browser engine. Test only servers we operate or whose operators permit the experiment, and declare unsupported capabilities. Do not promise to join every server or simulate successful GTA integrity checks.

The first stop/go decision should be made after the normal-player transport gate, before investing heavily in a map renderer. If client transport adaptation or permitted source reuse is unexpectedly blocked, reassess an independently implemented transport; switching to MTA should depend on its own evidence, not on assuming all RakNet variants are interchangeable.
