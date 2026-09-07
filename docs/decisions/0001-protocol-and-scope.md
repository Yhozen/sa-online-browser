# ADR 0001: SA-MP 0.3.7 through a native gateway

Date: 2026-09-07  
Status: selected and implemented for the narrower [browser/open.mp PoC](0002-placeholder-poc.md). Native GTA and original SA-MP interoperability remain unverified. The analysis below records the initial research decision; see [current status](../status.md) for implementation evidence.

## Decision

Implement the **SA-MP 0.3.7 legacy protocol**, initially against a pinned **open.mp v1.5.8.3079** server with ordinary SA-MP desktop clients as peers. Build a browser client that renders and simulates locally, connected through a hosted native protocol gateway. The upstream connection must occupy a normal player slot and use the existing UDP protocol. A server plugin that directly inserts browser-controlled NPCs would not satisfy this milestone.

Start with a controlled freeroam scenario: spawn, walk, chat, see native friends, then drive and ride together in one supported car. Keep MTA as a researched alternative rather than a parallel implementation.

## Why SA-MP is easier

This is a comparative engineering judgment, not a measured effort estimate. The decisive difference is the number of unknown prerequisites before an independently implemented client can join and do useful work.

| Criterion | SA-MP / open.mp legacy path | MTA | Consequence |
| --- | --- | --- | --- |
| Inspectable network implementation | open.mp publishes legacy server packet/RPC code and its modified RakNet 2.52; client adaptation remains necessary | Public packet/game code exists, but official documentation identifies closed network and anti-cheat binaries | SA-MP offers a more tractable connection experiment |
| Gameplay extension surface | Server-side Pawn scripts predominantly drive a fixed client RPC/game behavior surface | Server resources may supply client Lua with extensive engine, UI, media and resource APIs | A useful subset is narrower for SA-MP |
| Original engine dependency | Native client expects GTA:SA; a browser still needs a replacement runtime | Native client hooks GTA:SA and exposes its facilities | Both require much more than packet serialization |
| Browser transport | Requires a web-to-UDP gateway | Requires a web-to-UDP gateway | No direct-browser advantage for either |
| Identity / admission | Version, cookie, authentication and serial handling; server plugins can impose more checks | Versioned net modules, serial/integrity and anti-cheat requirements | MTA has a larger opaque admission surface |
| Testability | Pinned open.mp server can be inspected and instrumented while preserving its wire interface | Inspectable high-level server, with binary networking dependency | SA-MP is easier to diagnose incrementally |
| Reuse | open.mp and dependencies have separate license terms; reference code is not automatically a working client | GPL source does not grant source access to missing binaries | Audit dependency scope before copying either |

Evidence: [open.mp legacy implementation](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Server/Components/LegacyNetwork/legacy_network_impl.cpp), [RakNet project description](https://github.com/openmultiplayer/RakNet), [MTA fork documentation](https://wiki.multitheftauto.com/wiki/Forks), [MTA resource and engine description](https://github.com/multitheftauto/mtasa-blue). Detailed, file-specific evidence and qualifications are in the three [research reports](../research/sa-mp.md).

## Exact initial compatibility claim

The target is **SA-MP 0.3.7 legacy interoperability through a gateway**, not all SA-MP derivatives. The inspected open.mp implementation distinguishes 0.3.7 using version number `4057` and 0.3.DL using `4062`. These numbers alone do not implement admission: transport cookies, authentication, connection RPC fields and lifecycle also matter. See [source](https://github.com/openmultiplayer/open.mp/blob/c6759bd8d265171ae3d86598895a23d5a8d92a3b/Server/Components/LegacyNetwork/legacy_network_impl.cpp#L314).

Use open.mp **v1.5.8.3079**, commit `c6759bd8d265171ae3d86598895a23d5a8d92a3b`, as the first release fixture. The release was verified on the research date via its [release page](https://github.com/openmultiplayer/open.mp/releases/tag/v1.5.8.3079). Record binary hashes and matching dependency gitlinks before running it. Research on newer main-branch code is evidence, not permission to silently mix implementations.

Initial fixture intent: permit 0.3.7 clients, avoid optional open.mp encryption/extensions and downloadable artwork, disable public announcement, and use a minimal gamemode with no required custom client. Generate configuration from the pinned executable; verify effective settings rather than pasting a guessed config. [Configuration reference](https://open.mp/docs/server/config.json).

The SA-MP site currently advertises `0.3.7-R5-2-MP` and separately distributes `0.3.DL`. Pin the actual desktop reference installer by hash; an installer revision is not itself a new wire-protocol specification. [Client downloads](https://www.sa-mp.mp/downloads/).

| Target | Planned treatment |
| --- | --- |
| Controlled open.mp server, legacy 0.3.7, native peers | First interoperability fixture |
| Controlled original SA-MP 0.3.7 server | Separate compatibility gate before broader SA-MP claims |
| Public 0.3.7 servers | Later, per-server feature/admission testing; no blanket promise |
| 0.3.DL, custom launchers, required client mods, optional open.mp protocol extensions | Deferred profiles |
| MTA servers | Unsupported by this decision |

## Architecture choice

Keep legacy RakNet and SA-MP session logic in a native gateway. Use a versioned browser-facing message protocol, initially over secure WebSocket for connection debugging and then WebRTC DataChannels for gameplay. The browser owns controls, rendering and local simulation. The gateway translates messages and maintains one upstream session per player. See [architecture](../architecture.md).

Browser WebRTC and WebTransport use their own protocols; neither can be pointed directly at a SA-MP UDP port. Emscripten also documents that native socket programs need adaptation or proxying in browsers. [Emscripten networking](https://emscripten.org/docs/porting/networking.html), [WebRTC specification](https://www.w3.org/TR/webrtc/).

Do not commit to a full engine implementation until the transport and a small browser runtime experiment pass. Prefer a small TypeScript/WebGL2 prototype for the first playable slice. Evaluate SanAndreasUnity as a source of engine knowledge and possibly reusable components after a dependency/portability review. Its own multiplayer does not establish SA-MP compatibility; see [runtime research](../research/browser-runtime.md).

## Alternatives considered

- **MTA first:** attractive public gameplay implementation and rich scripting, but closed networking and broad client resource semantics increase initial uncertainty. Revisit if a portable, usable network implementation becomes available and MTA compatibility is a concrete priority.
- **Port RakNet into WebAssembly and tunnel datagrams:** possible later. It still needs a gateway and introduces browser scheduling, socket adaptation and retransmission behavior before we have proven the protocol. Native termination gives a simpler first diagnostic boundary.
- **Custom browser server / open.mp plugin bridge:** useful for a standalone game but does not prove wire compatibility. Keep any such experiment explicitly separate.
- **Stream a native GTA client as video:** a different product, with native GTA execution, hosting/GPU and asset requirements per session. It may shortcut engine recreation but does not deliver a browser-native implementation of either protocol. Reconsider only if the product objective shifts toward remote play.
- **Fork FlexodMR/SA-MP:** its repository describes unfinished reverse engineering and does not establish a suitable redistribution basis. Treat claims as research leads, not a trusted implementation foundation. [Repository](https://github.com/FlexodMR/SA-MP).

## Consequences and reconsideration gates

We operate a gateway, so this will not be a static-only deployment. Servers observe gateway network addresses; shared-IP limits, latency and reconnect identity require explicit testing. Browser assets and gameplay behavior remain a major engineering effort even after a successful join.

Confidence is **high in the relative SA-MP-over-MTA decision**, **medium in the gateway approach**, and **unproven in interoperable gameplay and affordable engine fidelity**. Revisit architecture after failed native admission experiments, unusable browser performance, or a requirement for unsupported server features. Failure of a time-boxed experiment is evidence to revise scope or technique, not an automatic reason to select MTA.
