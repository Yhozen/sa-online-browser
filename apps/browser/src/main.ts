// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { createRenderer, applyQuality } from "./graphics";
import yard from "../../../packages/shared/scenes/yard.json";
import type { SceneManifest } from "../../../packages/shared/scene";
import { loadAssets, assetStats } from "./assets";
import { buildEnvironment } from "./environment";
import {
  createCharacter,
  animateCharacter,
  disposeActor,
  createCar,
  animateCar,
} from "./characters";
import { CollisionIndex } from "./collision";
import { FollowCamera } from "./camera";
import { mountHUD, minimap } from "./hud";
let arena = yard as unknown as SceneManifest,
  sceneReady = false;
let collisionIndex = new CollisionIndex(arena.barriers);
import type {
  PlayerState,
  Vec3,
  Rotation,
  ServerMessage,
} from "../../../packages/shared/protocol";
mountHUD();
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#283d46");
scene.fog = new THREE.Fog("#283d46", 55, 135);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const camera = new THREE.PerspectiveCamera(
  48,
  innerWidth / innerHeight,
  0.1,
  250,
);
camera.up.set(0, 0, 1);
const renderer = createRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute(
  "aria-label",
  "Multiplayer playground. Use WASD to move.",
);
el("viewport").append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe0f0ff, 0x6e7259, 1.8));
const sun = new THREE.DirectionalLight(0xffe4be, 2.5);
sun.position.set(-20, -18, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -60,
  right: 60,
  top: 60,
  bottom: -60,
  near: 1,
  far: 130,
});
sun.shadow.bias = -0.001;
sun.target.position.set(0, 0, 9);
scene.add(sun, sun.target);
interface Peer {
  id: number;
  name: string;
  state: PlayerState;
  streamed: boolean;
  mesh: THREE.Group;
  label: HTMLDivElement;
}
interface Vehicle {
  id: number;
  model: number;
  position: Vec3;
  rotation: Rotation;
  velocity: Vec3;
  mesh: THREE.Group;
}
const self: PlayerState & {
  id: number | null;
  name: string;
  spawned: boolean;
  heading: number;
} = {
  id: null,
  name: "",
  spawned: false,
  heading: 0,
  position: [-4, 0, 10],
  rotation: [1, 0, 0, 0],
  velocity: [0, 0, 0],
  mode: "onFoot",
  vehicleId: 0,
  seat: 0,
  keys: 0,
};
const peers = new Map<number, Peer>(),
  vehicles = new Map<number, Vehicle>(),
  names = new Map<number, string>();
const received: Record<string, number> = {},
  chats: {
    id?: number;
    text: string;
    system: boolean;
  }[] = [];
let socket: WebSocket | null = null,
  epoch: number | null = null,
  sequence = 0,
  controlRevision = 0,
  lastServerSequence = -1,
  status = "Not connected",
  onFootRate = 30,
  inCarRate = 30,
  lastSend = 0,
  heading = 0,
  speed = 0,
  jumpSpeed = 0,
  toastUntil = 0;
let terminalReason: string | null = null;
const keys = new Set<string>();
function capsule(variant: number) {
  const group = createCharacter(variant);
  applyQuality(group, quality === "low");
  scene.add(group);
  return group;
}
let selfMesh = new THREE.Group();
selfMesh.visible = false;
function makeCar() {
  const group = createCar();
  applyQuality(group, quality === "low");
  scene.add(group);
  return group;
}
function rotationFromHeading(angle: number): Rotation {
  return [Math.cos(angle / 2), 0, 0, -Math.sin(angle / 2)];
}
function headingFromRotation(q: Rotation) {
  return -Math.atan2(
    2 * (q[0] * q[3] + q[1] * q[2]),
    1 - 2 * (q[2] * q[2] + q[3] * q[3]),
  );
}
function setRotation(object: THREE.Object3D, q: Rotation) {
  object.quaternion.set(-q[1], -q[2], -q[3], q[0]);
}
function toast(text: string) {
  el("toast").textContent = text;
  el("toast").classList.remove("hidden");
  toastUntil = performance.now() + 6000;
}
function chat(text: string, id?: number, system = false) {
  chats.push({ id, text, system });
  if (chats.length > 200) chats.shift();
  const line = document.createElement("div");
  line.className = "chat-line" + (system ? " system" : "");
  if (!system) {
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${names.get(id!) ?? (id === self.id ? self.name : `Player ${id}`)}: `;
    line.append(name);
  }
  line.append(document.createTextNode(text));
  el("chat-log").append(line);
  while (el("chat-log").children.length > 200)
    el("chat-log").firstChild!.remove();
  el("chat-log").scrollTop = el("chat-log").scrollHeight;
}
chat(
  "Your messages and movements travel through the game server.",
  undefined,
  true,
);
function setStatus(value: string, connected = false) {
  document.body.classList.toggle("playing", connected);
  status = value;
  el("status").textContent = value;
  el("connection").dataset.connected = String(connected);
  el<HTMLButtonElement>("join").disabled =
    !sceneReady || connected || value === "Connecting…";
  el("join-panel").classList.toggle("hidden", connected);
  el("disconnect").classList.toggle("hidden", !connected);
  el<HTMLInputElement>("chat-input").disabled = !connected;
}
function send(message: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) {
    if (socket.bufferedAmount > 64 * 1024) {
      socket.close(1013, "Slow gateway");
      return;
    }
    socket.send(JSON.stringify({ version: 1, ...message, epoch }));
  }
}
function publishState(now = performance.now()) {
  send({
    type: "state",
    controlRevision,
    position: self.position,
    rotation: self.rotation,
    velocity: self.velocity,
    mode: self.mode,
    vehicleId: self.vehicleId,
    seat: self.seat,
    keys: self.keys,
    seq: ++sequence,
  });
  lastSend = now;
}
function removeMesh(mesh: THREE.Group) {
  scene.remove(mesh);
  disposeActor(mesh); /* Geometry/materials belong to the shared asset cache. */
}
function clearWorld() {
  for (const p of peers.values()) {
    removeMesh(p.mesh);
    p.label.remove();
  }
  for (const v of vehicles.values()) removeMesh(v.mesh);
  peers.clear();
  vehicles.clear();
  names.clear();
  self.id = null;
  self.spawned = false;
  self.mode = "onFoot";
  self.vehicleId = 0;
  self.seat = 0;
  self.velocity = [0, 0, 0];
  self.keys = 0;
  selfMesh.visible = false;
  keys.clear();
  speed = 0;
  jumpSpeed = 0;
  sequence = 0;
  controlRevision = 0;
  lastServerSequence = -1;
}
function disconnect(reason: string) {
  terminalReason = reason;
  clearWorld();
  setStatus(reason);
  el<HTMLButtonElement>("join").disabled = !sceneReady;
  el("join-panel").classList.remove("hidden");
}
function ensurePeer(id: number) {
  let p = peers.get(id);
  if (!p) {
    const label = document.createElement("div");
    label.className = "player-label";
    document.body.append(label);
    p = {
      id,
      name: names.get(id) ?? `Player ${id}`,
      state: {
        position: [0, 0, 10],
        rotation: [1, 0, 0, 0],
        velocity: [0, 0, 0],
        mode: "onFoot",
        vehicleId: 0,
        seat: 0,
        keys: 0,
      },
      streamed: false,
      mesh: capsule(id % 2),
      label,
    };
    p.mesh.visible = false;
    peers.set(id, p);
  }
  return p;
}
function handle(m: ServerMessage) {
  if (terminalReason !== null) return;
  if (typeof m.epoch === "number") {
    if (epoch !== null && m.epoch !== epoch) return;
    epoch = m.epoch;
  }
  if (typeof m.seq === "number") {
    if (m.seq <= lastServerSequence) return;
    lastServerSequence = m.seq;
  }
  // A server control change invalidates input already queued by the browser.
  if (typeof m.controlRevision === "number") {
    if (
      !Number.isSafeInteger(m.controlRevision) ||
      m.controlRevision < controlRevision
    )
      return;
    controlRevision = m.controlRevision;
  }
  received[m.type] = (received[m.type] ?? 0) + 1;
  switch (m.type) {
    case "init":
      self.id = m.playerId ?? null;
      removeMesh(selfMesh);
      selfMesh = capsule(self.id ?? 0);
      selfMesh.visible = false;
      names.set(self.id!, self.name);
      onFootRate = Math.max(10, m.onFootRate ?? 30);
      inCarRate = Math.max(10, m.inCarRate ?? 30);
      setStatus("Connected · open.mp", true);
      break;
    case "spawn":
      if (m.position) self.position = [...m.position];
      heading = ((m.heading ?? 0) * Math.PI) / 180;
      self.heading = heading;
      self.rotation = rotationFromHeading(heading);
      self.spawned = true;
      self.mode = "onFoot";
      self.vehicleId = 0;
      self.seat = 0;
      self.velocity = [0, 0, 0];
      selfMesh.visible = true;
      renderer.domElement.focus();
      break;
    case "playerJoin":
      if (m.id !== undefined && m.id !== self.id) {
        names.set(m.id, m.name ?? `Player ${m.id}`);
        const p = ensurePeer(m.id);
        p.name = names.get(m.id)!;
      }
      break;
    case "playerRemove": {
      const p = peers.get(m.id!);
      if (p) {
        removeMesh(p.mesh);
        p.label.remove();
        peers.delete(p.id);
      }
      names.delete(m.id!);
      break;
    }
    case "playerState":
      if (m.id !== undefined && m.id !== self.id && m.position) {
        const p = ensurePeer(m.id);
        p.state = {
          ...p.state,
          ...m,
          position: [...m.position],
        } as PlayerState;
        p.streamed = true;
        p.mesh.visible = p.state.mode === "onFoot";
        if (p.mesh.position.lengthSq() === 0)
          p.mesh.position.set(...m.position);
      }
      break;
    case "vehicle":
      if (m.id !== undefined && m.position) {
        let v = vehicles.get(m.id);
        if (!v) {
          v = {
            id: m.id,
            model: m.model ?? 411,
            position: [...m.position],
            rotation: rotationFromHeading(((m.heading ?? 0) * Math.PI) / 180),
            velocity: [0, 0, 0],
            mesh: makeCar(),
          };
          vehicles.set(m.id, v);
        } else {
          v.position = [...m.position];
          v.rotation = rotationFromHeading(((m.heading ?? 0) * Math.PI) / 180);
        }
        v.mesh.position.set(...v.position);
        setRotation(v.mesh, v.rotation);
      }
      break;
    case "vehicleRemove": {
      const v = vehicles.get(m.id!);
      if (v) {
        removeMesh(v.mesh);
        vehicles.delete(v.id);
      }
      break;
    }
    case "vehicleState": {
      const v = vehicles.get(m.id ?? m.vehicleId!);
      if (v) {
        if (m.position) v.position = [...m.position];
        if (m.rotation) v.rotation = [...m.rotation];
        if (m.velocity) v.velocity = [...m.velocity];
        else if (m.position) v.velocity = [0, 0, 0]; // Server position corrections stop old motion.
        if (self.mode !== "onFoot" && self.vehicleId === v.id) {
          self.position = [...v.position];
          self.rotation = [...v.rotation];
          heading = headingFromRotation(v.rotation);
          self.heading = heading;
          // Received velocity describes the vehicle; deriving it from an
          // occluded tab's render delta creates a spurious speed spike.
          self.velocity = [...v.velocity];
          if (self.mode === "driver") speed = 0;
          else {
            // Passenger replication must continue even when Chrome
            // throttles rendering in a visible but occluded window.
            // Publishing here resets the shared frame-send deadline.
            const now = performance.now();
            if (now - lastSend >= inCarRate) publishState(now);
          }
        }
      }
      break;
    }
    case "chat":
      chat(m.text ?? "", m.id);
      break;
    case "message":
      chat(m.text ?? "", undefined, true);
      toast(m.text ?? "");
      break;
    case "selfPosition":
      if (m.position) {
        self.position = [...m.position];
        self.velocity = [0, 0, 0];
        speed = 0;
        jumpSpeed = 0;
        if (self.mode === "driver") {
          const v = vehicles.get(self.vehicleId);
          if (v) v.position = [...self.position];
        }
      }
      break;
    case "selfHeading":
      heading = ((m.heading ?? 0) * Math.PI) / 180;
      self.rotation = rotationFromHeading(heading);
      break;
    case "seat": {
      self.vehicleId = m.vehicleId ?? 0;
      self.seat = m.seat ?? 0;
      self.mode = self.seat === 0 ? "driver" : "passenger";
      speed = 0;
      const v = vehicles.get(self.vehicleId);
      if (v) {
        self.position = [...v.position];
        self.rotation = [...v.rotation];
        heading = headingFromRotation(v.rotation);
      }
      keys.clear();
      break;
    }
    case "exitVehicle": {
      const v = vehicles.get(self.vehicleId);
      // Explicit server placements win; otherwise choose a nearby clear doorway.
      if (m.position) self.position = [...m.position];
      else if (v) self.position = freeExitPosition(v, self.seat);
      self.mode = "onFoot";
      self.vehicleId = 0;
      self.seat = 0;
      self.velocity = [0, 0, 0];
      speed = 0;
      keys.clear();
      break;
    }
    case "disconnected":
      disconnect(`Disconnected: ${m.reason ?? "Server ended the session."}`);
      socket?.close();
      break;
    case "error":
      toast(m.message ?? "Connection error");
      chat(m.message ?? "Connection error", undefined, true);
      disconnect(`Error: ${m.message ?? "Connection failed"}`);
      socket?.close();
      break;
  }
}
el<HTMLFormElement>("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!sceneReady) return;
  socket?.close();
  clearWorld();
  terminalReason = null;
  epoch = null;
  self.name = el<HTMLInputElement>("nickname").value.trim();
  setStatus("Connecting…");
  const current = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
  );
  socket = current;
  current.addEventListener("open", () => {
    if (socket === current)
      send({
        type: "join",
        name: self.name,
        scene: { id: arena.id, revision: arena.revision },
      });
  });
  current.addEventListener("message", (event) => {
    if (socket !== current) return;
    try {
      handle(JSON.parse(String(event.data)));
    } catch {
      toast("Invalid gateway message");
      current.close(1002, "Invalid gateway message");
    }
  });
  current.addEventListener("error", () => {
    if (socket === current)
      toast("The gateway is unavailable. Check the local server.");
  });
  current.addEventListener("close", (event) => {
    if (socket === current) {
      disconnect(
        terminalReason ??
          (event.reason
            ? `Disconnected: ${event.reason}`
            : "Disconnected: join to reconnect"),
      );
    }
  });
});
el("disconnect").addEventListener("click", () => {
  send({ type: "disconnect" });
  socket?.close();
  disconnect("Disconnected: left by you");
});
el<HTMLFormElement>("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = el<HTMLInputElement>("chat-input"),
    text = input.value.trim();
  if (text && self.spawned) {
    send({ type: text.startsWith("/") ? "command" : "chat", text });
    input.value = "";
    input.blur();
    renderer.domElement.focus();
  }
});
function isTyping() {
  return document.activeElement instanceof HTMLInputElement;
}
window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && !isTyping() && self.spawned) {
    event.preventDefault();
    keys.clear();
    el("chat-content").classList.remove("hidden");
    el<HTMLInputElement>("chat-input").focus();
    return;
  }
  if (isTyping() || !self.spawned) return;
  if (
    ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE", "KeyG", "KeyF"].includes(
      event.code,
    )
  )
    event.preventDefault();
  keys.add(event.code);
  if (!event.repeat) {
    if (event.code === "KeyE") send({ type: "command", text: "/drive" });
    if (event.code === "KeyG") send({ type: "command", text: "/passenger" });
    if (event.code === "KeyF") send({ type: "command", text: "/exit" });
    if (
      event.code === "Space" &&
      self.mode === "onFoot" &&
      self.position[2] <= arena.groundZ + 1.01
    )
      jumpSpeed = 5.8;
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
function suspend() {
  keys.clear();
  self.keys = 0;
  self.velocity = [0, 0, 0];
  speed = 0;
  if (self.spawned) publishState();
}
window.addEventListener("blur", suspend);
function disconnectSuspendedPage(reason: "tab hidden" | "page suspended") {
  if (
    terminalReason !== null ||
    !socket ||
    socket.readyState === WebSocket.CLOSED
  )
    return;
  // Hidden or frozen pages cannot keep their simulation current. Release the
  // upstream player instead of letting its worker publish stale coordinates.
  send({ type: "disconnect" });
  socket.close();
  disconnect(`Disconnected: ${reason}; join again to resynchronize.`);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) disconnectSuspendedPage("tab hidden");
});
document.addEventListener("freeze", () =>
  disconnectSuspendedPage("page suspended"),
);
window.addEventListener("pagehide", () => {
  send({ type: "disconnect" });
  socket?.close();
});
function collision(x: number, y: number, radius: number) {
  return collisionIndex.collides(x, y, radius);
}
function freeExitPosition(vehicle: Vehicle, seat: number): Vec3 {
  const angle = headingFromRotation(vehicle.rotation);
  const side = seat === 0 ? -1 : 1;
  // Try the requested door, the opposite door, then the rear/front of the car.
  const offsets = [
    [side * 2, 0],
    [-side * 2, 0],
    [0, -3],
    [0, 3],
  ];
  for (const radius of [3, 4, 6]) {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      offsets.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  }
  for (const [x, y] of offsets) {
    const position: Vec3 = [
      vehicle.position[0] + x * Math.cos(angle) - y * Math.sin(angle),
      vehicle.position[1] + x * Math.sin(angle) + y * Math.cos(angle),
      arena.groundZ + 1,
    ];
    if (
      Math.abs(position[0]) < arena.halfSize &&
      Math.abs(position[1]) < arena.halfSize &&
      !collision(position[0], position[1], 0.45)
    )
      return position;
  }
  // The fixed fixture always has clear spawns, including after a server vehicle correction.
  return [...arena.spawns.find((p) => !collision(p[0], p[1], 0.45))!] as Vec3;
}
function step(dt: number) {
  if (!self.spawned) return;
  const old = [...self.position] as Vec3;
  if (self.mode === "onFoot") {
    const inputX = Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      inputY = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
    const [x, y] =
        arena.id === "yard"
          ? [inputX, inputY]
          : followCamera.movement(inputX, inputY),
      length = Math.hypot(x, y) || 1;
    const nx = self.position[0] + (x / length) * 5 * dt,
      ny = self.position[1] + (y / length) * 5 * dt;
    if (!collision(nx, self.position[1], 0.36)) self.position[0] = nx;
    if (!collision(self.position[0], ny, 0.36)) self.position[1] = ny;
    if (x || y) heading = Math.atan2(-x, y);
    jumpSpeed -= 15 * dt;
    self.position[2] = Math.max(
      arena.groundZ + 1,
      self.position[2] + jumpSpeed * dt,
    );
    if (self.position[2] === arena.groundZ + 1) jumpSpeed = 0;
  } else if (self.mode === "driver") {
    const throttle = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
    speed += throttle * 10 * dt;
    speed *= Math.exp(-(throttle ? 0.45 : 2.5) * dt);
    speed = Math.max(-7, Math.min(19, speed));
    const steer = Number(keys.has("KeyA")) - Number(keys.has("KeyD"));
    heading +=
      steer * Math.min(Math.abs(speed) / 5, 1) * 1.45 * dt * Math.sign(speed);
    const nx = self.position[0] - Math.sin(heading) * speed * dt,
      ny = self.position[1] + Math.cos(heading) * speed * dt;
    if (!collision(nx, ny, 2)) {
      self.position[0] = nx;
      self.position[1] = ny;
    } else speed = 0;
    self.position[2] = arena.groundZ + 1;
    const v = vehicles.get(self.vehicleId);
    if (v) {
      v.position = [...self.position];
      v.rotation = rotationFromHeading(heading);
    }
  } else {
    const v = vehicles.get(self.vehicleId);
    if (v) {
      self.position = [...v.position];
      heading = headingFromRotation(v.rotation);
    }
  }
  self.heading = heading;
  self.rotation = rotationFromHeading(heading);
  self.velocity =
    self.mode === "passenger"
      ? ([...(vehicles.get(self.vehicleId)?.velocity ?? [0, 0, 0])] as Vec3)
      : (self.position.map((n, i) => (n - old[i]) / dt) as Vec3);
  self.keys =
    (keys.has("KeyW") ? 8 : 0) |
    (keys.has("KeyS") ? 32 : 0) |
    (keys.has("Space") ? 128 : 0);
  if (self.mode === "driver") {
    const v = vehicles.get(self.vehicleId);
    if (v) v.velocity = [...self.velocity];
  }
}
const followCamera = new FollowCamera(camera, renderer.domElement);
const cameraTarget = new THREE.Vector3(0, 2, 10),
  desiredCamera = new THREE.Vector3();
camera.position.set(0, -13, 23);
camera.lookAt(0, 6, 10);
let previous = performance.now(),
  accumulator = 0,
  lastHud = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const elapsed = now - previous;
  const delta = Math.max(0, Math.min(elapsed / 1000, 0.1));
  previous = now;
  accumulator += delta;
  while (accumulator >= 1 / 60) {
    step(1 / 60);
    accumulator -= 1 / 60;
  }
  if (
    self.spawned &&
    now - lastSend >= (self.mode === "onFoot" ? onFootRate : inCarRate)
  ) {
    publishState(now);
  }
  selfMesh.visible = self.spawned;
  selfMesh.position.set(...self.position);
  setRotation(selfMesh, self.rotation);
  for (const v of vehicles.values()) {
    if (self.mode === "driver" && self.vehicleId === v.id)
      v.mesh.position.set(...v.position);
    else
      v.mesh.position.lerp(
        new THREE.Vector3(...v.position),
        1 - Math.exp(-delta * 14),
      );
    const target = new THREE.Quaternion(
      -v.rotation[1],
      -v.rotation[2],
      -v.rotation[3],
      v.rotation[0],
    );
    v.mesh.quaternion.slerp(target, 1 - Math.exp(-delta * 14));
  }
  animateCharacter(
    selfMesh,
    self,
    delta,
    arena.groundZ,
    vehicles.get(self.vehicleId)?.mesh,
  );
  for (const v of vehicles.values()) animateCar(v.mesh, v.velocity, delta);
  for (const p of peers.values()) {
    p.mesh.visible = p.streamed;
    p.mesh.position.lerp(
      new THREE.Vector3(...p.state.position),
      1 - Math.exp(-delta * 14),
    );
    p.mesh.quaternion.slerp(
      new THREE.Quaternion(
        -p.state.rotation[1],
        -p.state.rotation[2],
        -p.state.rotation[3],
        p.state.rotation[0],
      ),
      1 - Math.exp(-delta * 14),
    );
    const vehicle = vehicles.get(p.state.vehicleId);
    animateCharacter(p.mesh, p.state, delta, arena.groundZ, vehicle?.mesh);
    const labelPos =
      p.state.mode !== "onFoot" && vehicle
        ? vehicle.mesh.position.clone()
        : p.mesh.position.clone();
    labelPos.z += 1.7;
    const projected = labelPos.project(camera);
    p.label.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
    p.label.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
    p.label.classList.toggle(
      "hidden",
      !p.streamed || projected.z > 1 || projected.z < 0,
    );
    p.label.textContent =
      p.name +
      (p.state.mode === "driver"
        ? " · driving"
        : p.state.mode === "passenger"
          ? " · riding"
          : "");
  }
  const target = self.spawned
    ? new THREE.Vector3(...self.position)
    : new THREE.Vector3(0, 4, 10);
  if (arena.id === "yard") {
    cameraTarget.lerp(target, 1 - Math.exp(-delta * 7));
    desiredCamera.copy(cameraTarget).add(new THREE.Vector3(0, -17, 13));
    camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 5));
    camera.lookAt(cameraTarget.x, cameraTarget.y + 2, cameraTarget.z);
  }
  if (arena.id === "neighborhood")
    followCamera.update(
      target.toArray(),
      heading,
      self.mode !== "onFoot",
      delta,
      collisionIndex,
    );
  if (!document.hidden) renderer.render(scene, camera);
  if (sceneReady) {
    frameTimes.push(elapsed);
    if (frameTimes.length > 1800) frameTimes.shift();
  }
  if (now > toastUntil) el("toast").classList.add("hidden");
  if (now - lastHud > 150) {
    el("self-name").textContent = self.name || "—";
    el("server-id").textContent = self.id === null ? "—" : String(self.id);
    el("mode").textContent = !self.spawned
      ? "Exploring soon"
      : self.mode === "onFoot"
        ? "On foot"
        : self.mode === "driver"
          ? "Driver · seat 0"
          : `Passenger · seat ${self.seat}`;
    el("player-count").textContent = String(
      (self.spawned ? 1 : 0) + peers.size,
    );
    el("speed").textContent = String(
      Math.round(
        (self.mode === "driver"
          ? Math.abs(speed)
          : Math.hypot(self.velocity[0], self.velocity[1])) * 3.6,
      ),
    ).padStart(2, "0");
    el("roster").replaceChildren(
      ...[
        ...(self.spawned ? [{ name: self.name + " (you)" }] : []),
        ...peers.values(),
      ].map((p) => {
        const row = document.createElement("div");
        row.className = "players";
        const dot = document.createElement("i");
        dot.className = "swatch";
        row.append(dot, document.createTextNode(p.name));
        return row;
      }),
    );
    minimap(arena, self, [...peers.values()], [...vehicles.values()]);
    lastHud = now;
  }
}
requestAnimationFrame(frame);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// A fresh immutable observation snapshot, never a control or test bypass.
function snapshot() {
  return JSON.parse(
    JSON.stringify({
      version: 1,
      scene: { id: arena.id, revision: arena.revision, ready: sceneReady },
      graphics: {
        preset: quality,
        renderScale: renderer.getPixelRatio(),
        renderSize: renderer
          .getDrawingBufferSize(new THREE.Vector2())
          .toArray(),
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        assets: assetStats,
        frameTimes,
        camera: {
          position: camera.position.toArray(),
          yaw: followCamera.yaw,
          obstruction: followCamera.obstruction,
        },
      },
      presentation: {
        self: {
          visible: selfMesh.visible,
          animation: selfMesh.userData.animation,
          position: selfMesh.position.toArray(),
        },
        peers: [...peers.values()].map((p) => ({
          id: p.id,
          visible: p.mesh.visible,
          animation: p.mesh.userData.animation,
          position: p.mesh.position.toArray(),
        })),
      },
      status,
      epoch,
      controlRevision,
      self,
      peers: [...peers.values()].map((p) => ({
        id: p.id,
        name: p.name,
        ...p.state,
      })),
      vehicles: [...vehicles.values()].map((v) => ({
        id: v.id,
        model: v.model,
        position: v.position,
        rotation: v.rotation,
        velocity: v.velocity,
      })),
      chat: chats,
      received,
      sentSequence: sequence,
      serverSequence: lastServerSequence,
      rates: { onFootRate, inCarRate },
    }),
  );
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
Object.defineProperty(window, "__poc", {
  get: () => deepFreeze(snapshot()),
  configurable: false,
});

const frameTimes: number[] = [];
let quality = localStorage.getItem("poc-quality") || "low";
function setQuality(value: string) {
  quality = value === "standard" ? "standard" : "low";
  localStorage.setItem("poc-quality", quality);
  document.body.dataset.quality = quality;
  renderer.setPixelRatio(
    quality === "low" ? 0.35 : Math.min(devicePixelRatio, 1.5),
  );
  renderer.shadowMap.enabled = quality === "standard";
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el<HTMLSelectElement>("quality").value = quality;
  applyQuality(scene, quality === "low");
}
el<HTMLSelectElement>("quality").onchange = () =>
  setQuality(el<HTMLSelectElement>("quality").value);
setQuality(quality);
async function initializeScene() {
  try {
    const response = await fetch("/scene", { cache: "no-store" });
    if (!response.ok)
      throw Error("Scene metadata unavailable. Start the gateway and retry.");
    const manifest = await response.json();
    if (
      !["yard", "neighborhood"].includes(manifest.id) ||
      typeof manifest.revision !== "string" ||
      !Array.isArray(manifest.barriers)
    )
      throw Error(
        "Invalid scene metadata. Reload after rebuilding the server.",
      );
    arena = manifest;
    collisionIndex = new CollisionIndex(arena.barriers);
    await loadAssets(
      (text) => (el("loading").textContent = text),
      arena.assets,
    );
    buildEnvironment(scene, arena);
    selfMesh = capsule(0);
    selfMesh.visible = false;
    el("loading").textContent = "Ready · " + arena.name;
    el("join").textContent = "Join " + arena.name + " ↗";
    document.querySelector(".arena-name")!.textContent =
      arena.name.toUpperCase();
    applyQuality(scene, quality === "low");
    renderer.compile(scene, camera);
    sceneReady = true;
    el<HTMLButtonElement>("join").disabled = false;
  } catch (error) {
    el("loading").textContent = String(
      error instanceof Error ? error.message : error,
    );
    el("retry-assets").classList.remove("hidden");
  }
}
void initializeScene();
