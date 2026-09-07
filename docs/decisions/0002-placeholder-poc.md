# ADR 0002: local placeholder PoC with server-verified driving

Accepted 2026-09-07. Deliver walking, chat and one arcade car through real SA-MP 0.3.7 connections to unchanged open.mp. The user chose a cloud-local demonstration with two browser sessions as the verification target, deferring native GTA and original-server compatibility.

Use Three.js and original geometry, C++ native protocol workers, and a Node WebSocket gateway. Local WebSocket transport and placeholder physics let us validate admission and replication before investing in game assets, realistic handling or WAN transports. This narrows the earlier long-horizon engine/transport milestones without claiming those milestones are fully complete.

Ordinary Pawn commands allocate seats using standard placement RPCs. Entry animation RPCs do not reserve seats, so the fixture owns that game rule. Player and vehicle updates still travel through the unchanged server protocol.

The user selected GPL-3.0-or-later for original PoC code to enable compatible transport reuse. Upstream source and skill notices remain applicable and are not relicensed by the root license.
