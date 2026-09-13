<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Deployment

This project deploys as two pieces. Vercel serves the browser client. A
container host runs the gateway, the native protocol workers and the unchanged
open.mp fixture. This document covers both and the wiring between them.

## What runs where

| Piece | Where | Why |
| --- | --- | --- |
| Browser client (`apps/browser/dist`) | Vercel | Static bundle and ~47 MB of assets; a CDN is the right home, and the player's own GPU does the rendering |
| Gateway (`services/gateway/server.mjs`) | Container host | Holds a WebSocket per player and one native worker child process per session |
| Native protocol worker (`native/build/poc-worker`) | Container host | One long-lived process per player, holding a RakNet connection |
| open.mp fixture (`.runtime/Server`) | Container host | One always-on i386 UDP server that every player must join |

## Why the gateway is not a Vercel Function

Vercel does support both of the things that look like blockers at first glance.
It runs [OCI container images as Functions](https://vercel.com/kb/guide/does-vercel-support-docker-deployments),
and it serves [WebSocket connections](https://vercel.com/docs/functions/websockets)
on Fluid compute. Node 24 is generally available, so this repository's
`engines.node` range is fine there.

The blocker is narrower, and it is about shared state rather than protocol
support. Vercel's WebSocket documentation states that "new WebSocket
connections are not guaranteed to reach the same Vercel Function instance" and
that durable state belongs "in an external data store instead of relying on
in-memory variables."

In this project the shared state is not a counter that Redis could hold. It is
an operating-system process: one open.mp server that both players' native
workers join over UDP, plus one worker process per player holding a live
RakNet session. Two players whose WebSockets landed on different function
instances would be admitted to two different fixtures and would not see each
other, which is exactly the property the whole prototype exists to demonstrate.
Two further limits compound it: container-based Functions are stateless by
design, and a WebSocket "close[s] when a Vercel Function reaches its maximum
duration" — 300 s on Hobby, 800 s on Pro — while this project's own acceptance
run is a ten-minute soak.

So the gateway wants one long-running container with a stable process tree.
That is what `Dockerfile`'s `server` target already is.

## Prerequisites

- A Vercel account and `npm i -g vercel` (or the dashboard).
- A container host that can run one always-on `linux/amd64` container with TLS.
  `fly.toml` in this repository is a worked Fly.io example; Render, Railway,
  Google Cloud Run with minimum instances, or a plain VM with Docker all work.
- Nothing else installed locally: `docker compose --profile dev` has the
  toolchain (see the README).

Any host for the gateway must provide:

- **One instance, not an autoscaled pool.** A second instance is a second world.
- **TLS**, because a browser on an `https:` page refuses a `ws:` socket.
- **A tmpfs mount at `/work/.runtime/Server`, or `CAP_SYS_ADMIN`.** The i386
  fixture aborts on the 64-bit directory offsets that overlayfs and ext4
  report. `tools/docker-entrypoint.sh` mounts the tmpfs itself when it can and
  prints a precise warning when it cannot.
- **About 2 GB of memory**, since the fixture runs i386 code under QEMU and each
  player adds a worker process.

## Step 1 — deploy the gateway

The order matters: the client's gateway URL is compiled into its bundle, so the
gateway needs a public hostname first.

```sh
fly launch --no-deploy      # reuses the committed fly.toml; pick your own app name
fly deploy
fly status                  # confirm exactly one machine, started
curl https://<your-app>.fly.dev/health
```

`/health` should answer `{"ok":true,"sessions":0,"workers":0}`. Check the
fixture came up too:

```sh
fly logs | grep -E "Legacy Network started|POC .*ready|gatewayReady"
```

Expect `POC {"event":"ready",...}` and `Legacy Network started on
127.0.0.1:7777`. The fixture binds loopback inside the container, so only the
gateway can reach it — the host publishes port 3000 alone.

If you see `Value too large for defined data type`, the fixture directory is not
tmpfs; see the tmpfs requirement above.

On another host, the equivalent is: build `--target server`, run one instance,
publish container port 3000, set `POC_HOST=0.0.0.0`, and give it the tmpfs
mount.

## Step 2 — deploy the client to Vercel

`vercel.json` already pins the build: no framework detection, `npm ci`,
`npm run build:browser`, and `apps/browser/dist` as the output directory.
`.vercelignore` keeps the protocol worker, the fixture, the tests and the
editable art sources out of the upload.

Set the gateway origin as a **build-time** environment variable, then deploy:

```sh
vercel link
vercel env add VITE_GATEWAY_ORIGIN production   # https://<your-app>.fly.dev
vercel deploy --prod
```

`VITE_GATEWAY_ORIGIN` must include the scheme and must be `https://` for a
production deployment. It is read by `apps/browser/src/gateway.ts` at build
time and baked into the bundle, so **changing it requires a redeploy**, not just
an environment-variable edit. Leaving it unset keeps the old behaviour, where
the client expects the gateway to serve the page — correct locally and in
Docker, wrong on Vercel.

## Step 3 — let the gateway trust the client

The gateway rejects cross-origin WebSocket upgrades unless the origin is named,
which is what keeps it from being hijacked by any other site. Give it the
Vercel domain and restart it:

```sh
fly secrets set POC_ALLOWED_ORIGINS=https://your-project.vercel.app
```

`POC_ALLOWED_ORIGINS` accepts a comma-separated list. Vercel preview
deployments each get their own hostname, so either add the ones you use or test
previews against a separate gateway. Unset means same-origin only.

Confirm what the gateway parsed:

```sh
fly logs | grep gatewayReady
# {"type":"gatewayReady","host":"0.0.0.0","port":3000,"allowedOrigins":["https://your-project.vercel.app"]}
```

## Verify the deployment

Server side:

```sh
curl https://<your-app>.fly.dev/health
curl https://<your-app>.fly.dev/scene | head -c 120
# CORS header present only for an allowed origin:
curl -sI -H "Origin: https://your-project.vercel.app" \
  https://<your-app>.fly.dev/scene | grep -i access-control-allow-origin
```

Client side, checking the asset the CDN is most likely to mangle. The client
fetches this file, verifies its SHA-256, then inflates it itself with
`DecompressionStream`, so a CDN that transparently decompresses it breaks the
checksum rather than failing quietly:

```sh
curl -sI https://your-project.vercel.app/assets/arroyo-reflections.pmrem.gz \
  | grep -iE "content-length|content-encoding"
# expect content-length: 10885842 and no content-encoding
curl -s https://your-project.vercel.app/assets/arroyo-reflections.pmrem.gz | shasum -a 256
# expect 58d8267844cd9ad3971e9678be5cd44799ab84ab0af11bc0878d0d5d3aa047b1
```

Then the real check, in your own browser: open the Vercel URL, wait for
`Ready · Arroyo`, and join. The status should read `Connected · open.mp` with a
server ID. Open a second window with a different nickname and confirm each
player sees the other move. `Loading materials…` that never finishes means the
asset fetch failed; `Not connected` means the WebSocket did.

## Operational limits

These are properties of the prototype, not of the deployment:

- **Eight sessions.** The gateway refuses a ninth, and the fixture is configured
  for `max_players: 8`.
- **One process per player.** Each join spawns a worker; memory grows with
  players.
- **One world per container.** Scaling out gives you separate worlds, not more
  capacity in one.
- **Anyone with the URL can join.** There is no authentication. The fixture runs
  with rcon disabled and `announce: false`, so it is not listed publicly, but a
  public deployment is a public server. Put it behind access control if that
  matters.
- **A restart drops every session.** Players rejoin; the server may hold a
  nickname until its connection timeout expires.
- **Sessions need a visible tab.** A hidden or suspended tab disconnects.
- **`npm run open:poc` and `npm run verify:desktop` are cloud-desktop tools**
  and do not apply to a deployment.

## Local development is unchanged

Nothing here changes the local or Docker workflow. With `VITE_GATEWAY_ORIGIN`
unset the client talks to whatever origin served it, so the gateway serving its
own `dist` still works, and with `POC_ALLOWED_ORIGINS` unset the gateway still
accepts same-origin connections only. See the README for
`docker compose --profile server up --build` and the development container.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Not connected`, no gateway log entry | `POC_ALLOWED_ORIGINS` missing the Vercel origin |
| Console reports an insecure WebSocket | `VITE_GATEWAY_ORIGIN` is `http://` on an `https:` page |
| Client fetches `/scene` from the Vercel domain | `VITE_GATEWAY_ORIGIN` was set after the build; redeploy |
| `Value too large for defined data type` | Fixture directory is not tmpfs |
| Players cannot see each other | More than one gateway instance is running |
| Session drops on a fixed interval | A function-style host is capping duration; use a long-running container |
| `Scene metadata unavailable` | Gateway unreachable, or `/scene` blocked by CORS |
