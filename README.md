# SA Online Browser

Research and development plan for playing San Andreas multiplayer from a browser with friends using native desktop clients.

**Decision: implement the SA-MP 0.3.7 protocol family first, through a gateway, using an open.mp server as the first interoperability target.** MTA has a substantially harder entry barrier because its public repository excludes important network/anti-cheat components. Neither project provides a ready-made browser game.

This repository currently contains research and plans, not a playable client. No connection or gameplay compatibility has been demonstrated yet.

Start here:

- [Protocol decision and comparison](docs/decisions/0001-protocol-and-scope.md)
- [Proposed architecture](docs/architecture.md)
- [Development milestones and acceptance gates](docs/roadmap.md)
- [Current status, risks, and next task](docs/status.md)
- Research: [SA-MP and open.mp](docs/research/sa-mp.md), [MTA](docs/research/mta.md), [browser runtime and SanAndreasUnity](docs/research/browser-runtime.md)

The first product target is a desktop browser and a small group on a controlled server. This is a planning assumption, not a confirmed user constraint. Compatibility with arbitrary public servers remains a later, separately tested goal. The browser will render and simulate the game locally; the gateway will handle the legacy network connection.

Research date: **2026-09-07**. Repository sources are pinned in the research notes; refresh live documentation and releases when implementation starts. Keep enduring decisions and results in `docs/`; disposable research clones belong in `.context/`.
