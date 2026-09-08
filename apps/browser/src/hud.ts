// SPDX-License-Identifier: GPL-3.0-or-later
import type { SceneManifest } from "../../../packages/shared/scene";
export function mountHUD() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div id="viewport" class="viewport" data-testid="viewport"></div><div class="vignette"></div>
<header class="top"><div class="brand"><div><div class="title">Arroyo</div><p class="eyebrow">San Andreas · Multiplayer</p></div></div><div id="connection" class="connection"><span class="dot"></span><span data-testid="status" id="status">Not connected</span><button id="debug-toggle" title="Protocol diagnostics">⌘</button><select id="quality" aria-label="Graphics quality"><option value="low">Low</option><option value="standard">Standard</option></select></div></header>
<aside class="left"><section class="panel join" id="join-panel"><div class="kicker">WELCOME TO THE NEIGHBORHOOD</div><h1>Your block.<br>Your people.</h1><p class="muted">Afternoon sun. An open road.<br>Join your friends in Arroyo.</p><form id="join-form"><label for="nickname">YOUR NAME</label><input id="nickname" data-testid="nickname" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="BrowserPlayer" autocomplete="off" required/><button class="primary" data-testid="join" id="join" disabled>Join neighborhood ↗</button></form><p id="loading" role="status">Preparing the scene…</p><button id="retry-assets" class="secondary hidden">Retry loading</button></section>
<section class="panel info" id="diagnostics"><div class="kicker">Session diagnostics</div><div class="row"><span>Player</span><strong id="self-name">—</strong></div><div class="row"><span>Server ID</span><strong id="server-id" data-testid="server-id">—</strong></div><div class="row"><span>Mode</span><strong id="mode" data-testid="mode">Exploring soon</strong></div><div class="row"><span>Nearby</span><strong id="player-count">0</strong></div><div id="roster"></div></section></aside>
<div class="corner"><div class="arena-name">Arroyo</div><div class="arena-detail">A PLACE TO MEET</div><div class="speed"><span id="speed">00</span><small>KM/H</small></div><button class="secondary hidden" data-testid="disconnect" id="disconnect">Leave session</button></div>
<div class="map-wrap"><canvas id="minimap" width="210" height="210" aria-label="Neighborhood minimap"></canvas><div class="map-caption"><b>N</b><span>ARROYO AVE</span></div></div>
<section class="chat panel"><div class="chat-head"><button id="chat-toggle" aria-expanded="true">Neighborhood chat</button><span class="tag">ENTER ↵</span></div><div id="chat-content"><div data-testid="chat-log" id="chat-log" class="chat-log" role="log" aria-live="polite"></div><form id="chat-form"><input id="chat-input" data-testid="chat-input" placeholder="Say hello · /reset to start over" maxlength="128" autocomplete="off" disabled/><button type="submit" aria-label="Send chat">↗</button></form></div></section>
<aside class="bottom"><div class="controls"><span><kbd>W A S D</kbd> move</span><span><kbd>E / G</kbd> drive / ride</span><span><kbd>F</kbd> exit</span><span><kbd>SPACE</kbd> jump</span><span>Right drag · orbit &nbsp; Scroll · zoom</span></div></aside><div id="toast" class="toast hidden" role="alert"></div><div class="footer-label">BROWSER → NATIVE GATEWAY → OPEN.MP</div>`;
  document.getElementById("debug-toggle")!.onclick = () =>
    document.body.classList.toggle("debug");
  document.getElementById("chat-toggle")!.onclick = () => {
    const c = document.getElementById("chat-content")!;
    c.classList.toggle("hidden");
    document
      .getElementById("chat-toggle")!
      .setAttribute("aria-expanded", String(!c.classList.contains("hidden")));
  };
  document.getElementById("retry-assets")!.onclick = () => location.reload();
}
export function minimap(
  manifest: SceneManifest,
  self: { position: number[]; heading: number; spawned: boolean },
  peers: { state: { position: number[] }; streamed: boolean }[],
  vehicles: { position: number[] }[],
) {
  const canvas = document.getElementById("minimap") as HTMLCanvasElement,
    c = canvas.getContext("2d")!,
    s = canvas.width / (manifest.halfSize * 2 + 12),
    cx = canvas.width / 2,
    cy = canvas.height / 2;
  const p = (v: number[]) => [cx + v[0] * s, cy - v[1] * s];
  c.fillStyle = "#536146";
  c.fillRect(0, 0, 210, 210);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "#b6b5a1";
  for (const r of manifest.roads) {
    c.lineWidth = (r.width + 2) * s;
    c.beginPath();
    r.points.forEach((v, i) => {
      const [x, y] = p(v);
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.stroke();
  }
  if (manifest.culdesac) {
    const [x, y] = p(manifest.culdesac.center);
    c.beginPath();
    c.arc(x, y, manifest.culdesac.radius * s, 0, Math.PI * 2);
    c.fillStyle = "#b6b5a1";
    c.fill();
  }
  c.fillStyle = "#30342c";
  for (const b of manifest.barriers.filter(
    (b) => !b.id || b.id.startsWith("house"),
  )) {
    const [x, y] = p(b.position);
    c.fillRect(
      x - (b.size[0] * s) / 2,
      y - (b.size[1] * s) / 2,
      b.size[0] * s,
      b.size[1] * s,
    );
  }
  function dot(v: number[], color: string, r: number) {
    const [x, y] = p(v);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = "#182d29";
    c.lineWidth = 1;
    c.stroke();
  }
  vehicles.forEach((v) => dot(v.position, "#f4a16f", 4));
  peers
    .filter((v) => v.streamed)
    .forEach((v) => dot(v.state.position, "#ecda91", 3.5));
  if (self.spawned) {
    const [x, y] = p(self.position);
    c.save();
    c.translate(x, y);
    c.rotate(-self.heading);
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 5);
    c.lineTo(0, 2);
    c.lineTo(-5, 5);
    c.closePath();
    c.fillStyle = "#f6f7e8";
    c.fill();
    c.strokeStyle = "#21473a";
    c.stroke();
    c.restore();
  }
}
