// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import type { SceneManifest } from "../../../packages/shared/scene";
import type { PlayerState } from "../../../packages/shared/protocol";
import { ChallengeReplica, formatRaceTime, type ActivityCue } from "./challenge-state";

const cancellation: Record<string, string> = {
  driver_exit: "The driver left the car.", passenger_exit: "Your passenger left the car.",
  driver_disconnect: "The driver disconnected.", passenger_disconnect: "Your passenger disconnected.",
  reset: "The neighborhood was reset.", cancelled: "The crew ended this attempt.",
  left_start: "The car moved before the green light. Hold still through the countdown.",
  timeout: "Time is up. Return to the start for another run.",
  teleport: "A crew member teleported.", seat_change: "The crew changed seats.",
};
type Self = PlayerState & { id: number | null; spawned: boolean };

/** World/UI presentation of a server-scored activity. No completion logic lives here. */
export class DrivingActivity {
  readonly replica = new ChallengeReplica();
  private manifest: SceneManifest | null = null;
  private group = new THREE.Group();
  private marker = new THREE.Group();
  private start = new THREE.Group();
  private arrow = new THREE.Group();
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private markerKey = "";
  private resultsKey = "";
  private panel: HTMLElement;
  private announcement: HTMLElement;
  private expanded = false;
  private cue?: (cue: ActivityCue) => void;

  constructor(scene: THREE.Scene, private command: (text: string) => void) {
    this.group.name = "driving-activity";
    this.group.add(this.marker, this.start); scene.add(this.group);
    this.group.visible = false;
    this.panel = document.createElement("section");
    this.panel.className = "activity hidden";
    this.panel.setAttribute("aria-label", "Arroyo Loop driving challenge");
    this.panel.innerHTML = `<button class="activity-heading" id="activity-toggle" aria-expanded="true"><span class="activity-emblem" aria-hidden="true"><svg viewBox="0 0 24 28" width="24" height="28"><path d="M3 26V3M4 4h16v13H4" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M4 4h4v4H4zm8 0h4v4h-4zM8 8h4v4H8zm8 0h4v4h-4zM4 12h4v4H4zm8 0h4v4h-4z"/></svg></span><span><small>NEIGHBORHOOD TIME TRIAL</small><b id="activity-name">Arroyo Loop</b></span><span class="activity-collapse">−</span></button>
      <div id="activity-content"><div class="activity-readout"><strong id="activity-time" data-testid="race-time">0:00.00</strong><span id="activity-progress" data-testid="race-progress">9 CHECKPOINTS</span></div>
      <div class="activity-progress-track"><i id="activity-progress-bar"></i></div>
      <p id="activity-status" data-testid="race-status" aria-live="off">Take the driver's seat to start.</p><p class="activity-crew" id="activity-crew"></p>
      <div class="activity-actions"><button id="race-start" data-testid="race-start">Start time trial <kbd>R</kbd></button><button id="race-cancel" data-testid="race-cancel" class="hidden">Cancel run</button><button id="race-scores" aria-expanded="false">Records</button></div>
      <div id="race-results" class="hidden"><div class="activity-record-title">THIS SERVER SESSION</div><ol id="race-scores-list"></ol><p class="activity-record-note">Driver + passenger · best five runs</p></div></div>`;
    // The visible navigation text changes with distance. Keep assistive
    // announcements separate, including when the instrument is collapsed.
    this.announcement = document.createElement("p");
    this.announcement.id = "activity-announcement";
    this.announcement.setAttribute("role", "status");
    this.announcement.setAttribute("aria-live", "polite");
    this.announcement.setAttribute("aria-atomic", "true");
    this.announcement.style.cssText = "position:absolute;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    this.panel.append(this.announcement);
    document.body.append(this.panel);
    document.getElementById("race-start")!.onclick = () => this.command("/race");
    document.getElementById("race-cancel")!.onclick = () => this.command("/cancel");
    document.getElementById("race-scores")!.onclick = () => {
      this.expanded = !this.expanded;
      document.getElementById("race-results")!.classList.toggle("hidden", !this.expanded);
      document.getElementById("race-scores")!.setAttribute("aria-expanded", String(this.expanded));
      if (this.expanded) this.command("/scores");
    };
    document.getElementById("activity-toggle")!.onclick = () => {
      const content = document.getElementById("activity-content")!;
      const collapsed = content.classList.toggle("hidden");
      document.getElementById("activity-toggle")!.setAttribute("aria-expanded", String(!collapsed));
      this.panel.querySelector(".activity-collapse")!.textContent = collapsed ? "+" : "−";
    };
  }

  setCue(callback: (cue: ActivityCue) => void) { this.cue = callback; }

  configure(manifest: SceneManifest, startPaint?: THREE.Texture) {
    this.manifest = manifest;
    this.releaseGeometry();
    this.marker.clear(); this.start.clear(); this.markerKey = "";
    this.marker.visible = false;
    if (!manifest.challenge) return;
    document.getElementById("activity-name")!.textContent = manifest.challenge.name;
    // Original paint atlas, cosmetic only. The shared loader owns its texture.
    // Retain the physical line footprint and sample fine chips instead of square holes.
    if (startPaint) this.start.add(new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(8.4, .84)),
      this.material(new THREE.MeshBasicMaterial({map:startPaint, color:0xd7d1be, alphaTest:.35, depthWrite:false})),
    ));
    this.start.position.set(manifest.challenge.start[0], manifest.challenge.start[1], manifest.groundZ + .105);
  }

  accept(event: Record<string, unknown>, now = performance.now()) {
    if (!this.manifest?.challenge) return;
    const cue = this.replica.accept(event, now);
    if (cue) this.cue?.(cue);
  }

  clear() {
    this.replica.clear(); this.marker.visible = false; this.group.visible = false;
    this.markerKey = ""; this.resultsKey = "";
    this.panel.classList.add("hidden");
    this.announcement.textContent = "";
    document.getElementById("race-scores-list")!.replaceChildren();
  }

  update(self: Self, names: Map<number, string>, now: number) {
    const challenge = this.manifest?.challenge;
    const visible = !!challenge && self.spawned;
    this.panel.classList.toggle("hidden", !visible);
    this.group.visible = visible;
    if (!visible || !challenge) return;
    const state = this.replica.state, checkpoint = this.replica.checkpoint;
    const active = state?.phase === "running" || state?.phase === "countdown";
    const participant = state?.driverId === self.id || state?.passengerId === self.id;
    const display = this.replica.display(now);
    const distance = Math.hypot(self.position[0] - challenge.start[0], self.position[1] - challenge.start[1]);
    const startButton = document.getElementById("race-start") as HTMLButtonElement;
    startButton.classList.toggle("hidden", active);
    startButton.disabled = self.mode !== "driver" || distance > challenge.startRadius;
    this.text("race-start", state?.phase === "finished" || state?.phase === "cancelled" ? "Race again · R" : "Start time trial · R");
    const cancelButton = document.getElementById("race-cancel") as HTMLButtonElement;
    cancelButton.classList.toggle("hidden", !active || !participant);
    this.panel.dataset.phase = state?.phase ?? "idle";
    const total = state?.checkpointCount ?? challenge.checkpoints.length;
    const completed = state?.checkpointIndex ?? 0;
    this.text("activity-progress", active
      ? `${completed} / ${total} GATES`
      : state?.phase === "finished" ? "FINISHED" : `${total} CHECKPOINTS`);
    document.getElementById("activity-progress-bar")!.style.width = `${active || state?.phase === "finished" ? completed / total * 100 : 0}%`;
    this.text("activity-time", state?.phase === "countdown"
      ? display.countdown > 0 ? String(display.countdown) : "WAIT"
      : formatRaceTime(display.elapsedMs));
    let instruction = self.mode !== "driver" ? "Take the driver's seat. Bring a friend along." :
      distance > challenge.startRadius ? `Return to the checkered start · ${Math.round(distance)} m` : "Hold still, then start. A passenger can ride along.";
    if (state?.phase === "countdown") instruction = "Hold the car still. Wait for GO.";
    if (state?.phase === "running") instruction = checkpoint
      ? `Gate ${completed + 1} · ${Math.round(Math.hypot(self.position[0] - checkpoint.position[0], self.position[1] - checkpoint.position[1]))} m${self.mode === "passenger" ? " · Riding with your crew" : " · Follow the green marker"}`
      : "Waiting for the next checkpoint…";
    if (state?.phase === "finished") instruction = `Finished in ${formatRaceTime(state.elapsedMs)}. ${distance <= challenge.startRadius ? "Swap seats or race again." : "Return to the start for a rematch."}`;
    if (state?.phase === "cancelled") instruction = `${cancellation[state.reason] ?? "Attempt ended."} ${distance > challenge.startRadius ? "Return to the start." : "Ready to try again."}`;
    if (display.stale) instruction = "Waiting for the server… Your time is awaiting confirmation.";
    this.text("activity-status", instruction);
    let announcement = self.mode === "driver"
      ? "Arroyo Loop is ready. Park at the checkered start, then start the time trial."
      : self.mode === "passenger" ? "Arroyo Loop is ready. Your driver can start at the checkered line."
      : "Arroyo Loop is ready. Take the driver's seat to start.";
    if (state?.phase === "countdown") announcement = "Countdown started. Hold the car still. Wait for GO.";
    if (state?.phase === "running") announcement = `Run in progress. Gate ${completed + 1} of ${total}.`;
    if (state?.phase === "finished") announcement = `Finished in ${formatRaceTime(state.elapsedMs)}. Return to the start for another run.`;
    if (state?.phase === "cancelled") announcement = `Run cancelled. ${cancellation[state.reason] ?? "Attempt ended."} Return to the start to try again.`;
    if (display.stale) announcement = "Waiting for the server. Your time is awaiting confirmation.";
    if (this.announcement.textContent !== announcement) this.announcement.textContent = announcement;
    this.text("activity-crew", state && state.driverId !== 65535
      ? `${names.get(state.driverId) ?? "Driver"}${state.passengerId !== 65535 ? " + " + (names.get(state.passengerId) ?? "Passenger") : " · solo"}${state.bestMs ? " · Record " + formatRaceTime(state.bestMs) : ""}`
      : "One car. One crew. A lap around your block.");
    this.updateMarker(active && state?.phase === "running" ? checkpoint : null, now);
    const resultsKey = JSON.stringify(this.replica.scores);
    if (resultsKey !== this.resultsKey) {
      this.resultsKey = resultsKey;
      const rows = this.replica.scores.map(score => {
        const row = document.createElement("li"), crew = document.createElement("span"), time = document.createElement("strong");
        crew.textContent = `${score.driverName}${score.passengerName ? " + " + score.passengerName : " · solo"}`;
        time.textContent = formatRaceTime(score.timeMs); row.append(crew, time); return row;
      });
      if (!rows.length) { const empty = document.createElement("li"); empty.textContent = "No finishes yet. Set the first time."; rows.push(empty); }
      document.getElementById("race-scores-list")!.replaceChildren(...rows);
    }
  }

  private text(id: string, value: string) {
    const element = this.panel.querySelector<HTMLElement>(`#${id}`)!;
    if (element.textContent !== value) element.textContent = value;
  }

  private updateMarker(checkpoint: ChallengeReplica["checkpoint"], now: number) {
    this.marker.visible = !!checkpoint;
    if (!checkpoint || !this.manifest) return;
    const key = JSON.stringify(checkpoint);
    if (key !== this.markerKey) {
      this.markerKey = key;
      if (this.marker.children.length === 0) this.buildMarker();
      this.marker.position.set(checkpoint.position[0], checkpoint.position[1], this.manifest.groundZ + .09);
      this.marker.scale.set(checkpoint.radius, checkpoint.radius, 1);
      this.arrow.rotation.z = -Math.atan2(checkpoint.nextPosition[0] - checkpoint.position[0], checkpoint.nextPosition[1] - checkpoint.position[1]);
    }
    this.arrow.position.z = 1.6 + Math.sin(now * .003) * .08;
  }

  private buildMarker() {
    const green = this.material(new THREE.MeshBasicMaterial({ color: 0x9fe7a8, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide }));
    const wall = this.material(new THREE.MeshBasicMaterial({ color: 0x6fce95, transparent: true, opacity: .055, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(this.geometry(new THREE.RingGeometry(.965, 1, 80)), green);
    this.marker.add(ring);
    const cylinder = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(1, 1, .6, 80, 1, true)), wall);
    cylinder.rotation.x = Math.PI / 2; cylinder.position.z = .3; this.marker.add(cylinder);
    // A compact chevron points to the next server-provided position, never a local waypoint advance.
    this.arrow = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-.18, -.1); shape.lineTo(0, .16); shape.lineTo(.18, -.1);
    shape.lineTo(.1, -.1); shape.lineTo(0, .035); shape.lineTo(-.1, -.1); shape.closePath();
    const arrowMesh = new THREE.Mesh(this.geometry(new THREE.ShapeGeometry(shape)), green);
    this.arrow.add(arrowMesh); this.marker.add(this.arrow);
  }

  private material<T extends THREE.Material>(material: T): T { this.materials.push(material); return material; }
  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }
  private releaseGeometry() { this.materials.forEach(m => m.dispose()); this.geometries.forEach(g => g.dispose()); this.materials = []; this.geometries = []; }
  dispose() { this.releaseGeometry(); this.group.removeFromParent(); this.panel.remove(); }
}
