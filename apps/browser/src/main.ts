// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import arena from '../../../test-server/arena.json';
import type { PlayerState, Vec3, Rotation, ServerMessage } from '../../../packages/shared/protocol';
import './style.css';
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<div id="viewport" class="viewport" data-testid="viewport"></div><div class="vignette"></div>
<header class="top"><div class="brand"><div class="monogram">SA</div><div><div class="title">Browser playground<span style="color:#7e9594"> / </span>01</div><p class="eyebrow">Same server. A new way in.</p></div></div><div id="connection" class="connection"><span class="dot"></span><span data-testid="status" id="status">Not connected</span></div></header>
<aside class="left"><section class="panel join" id="join-panel"><div class="kicker">A little San Andreas</div><h1>Meet in the<br/>playground.</h1><p class="muted">Walk, talk, and take a friend for a spin.<br/>A browser experiment on a real open.mp server.</p><form id="join-form"><label for="nickname">YOUR NAME</label><input id="nickname" data-testid="nickname" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="BrowserPlayer" autocomplete="off" spellcheck="false" required/><button class="primary" data-testid="join" id="join" type="submit">Join playground <span aria-hidden="true">↗</span></button></form></section>
<section class="panel info"><div class="kicker">Session</div><div class="row"><span>Player</span><strong id="self-name">—</strong></div><div class="row"><span>Server ID</span><strong id="server-id" data-testid="server-id">—</strong></div><div class="row"><span>Current mode</span><strong id="mode" data-testid="mode">Exploring soon</strong></div><div class="row"><span>Players nearby</span><strong id="player-count">0</strong></div><hr/><div id="roster"></div><button class="secondary hidden" data-testid="disconnect" id="disconnect">Leave playground</button></section></aside>
<div class="corner"><div class="arena-name">THE TEST YARD</div><div class="arena-detail">LOCAL SESSION · PLACEHOLDER WORLD</div><div class="speed"><span id="speed">00</span><small>KM/H</small></div></div>
<section class="chat panel"><div class="chat-head"><span class="kicker">Server chat</span><span class="tag">SA-MP 0.3.7</span></div><div data-testid="chat-log" id="chat-log" class="chat-log" role="log" aria-live="polite"></div><form id="chat-form"><input id="chat-input" data-testid="chat-input" placeholder="Enter to chat · /reset to start over" maxlength="128" autocomplete="off" disabled/><button type="submit" aria-label="Send chat">↗</button></form></section>
<aside class="bottom"><div class="panel mission"><div class="kicker">Better with a friend</div><p>Find the coral car. One drives, one rides.<br/>Swap seats and go around again.</p></div><div class="panel controls"><h2>Your next move</h2><div class="control-row"><div class="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>Walk / steer & accelerate</span></div><div class="control-row"><kbd>SPACE</kbd><span>Jump</span></div><div class="control-row"><div class="key-group"><kbd>E</kbd><kbd>G</kbd></div><span>Drive / ride passenger</span></div><div class="control-row"><kbd>F</kbd><span>Exit vehicle</span></div><div class="control-row"><kbd>ENTER</kbd><span>Chat with the server</span></div></div></aside><div id="toast" class="toast hidden" role="alert"></div><div class="footer-label">BROWSER → NATIVE GATEWAY → OPEN.MP · EXPERIMENTAL PROTOCOL CLIENT</div>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#283d46');
scene.fog = new THREE.Fog('#283d46', 55, 135);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 250);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Multiplayer playground. Use WASD to move.');
el('viewport').append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe7f4ed, 0x303339, 2.3));
const sun = new THREE.DirectionalLight(0xffd7a1, 3.5);
sun.position.set(-20, -18, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 130 });
sun.shadow.bias = -0.001;
sun.target.position.set(0, 0, 9);
scene.add(sun, sun.target);
const mat = (color: number, roughness = .8) => new THREE.MeshStandardMaterial({ color, roughness });
const groundMat = mat(0x33434a), wallMat = mat(0x9b9885), coralMat = mat(0xe8946d), darkMat = mat(0x17282e), tealMat = mat(0x68d7bc), whiteMat = mat(0xe6e4c9);
function box(w: number, d: number, h: number, material: THREE.Material, position: Vec3, parent: THREE.Object3D = scene) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), material); m.position.set(...position); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
box(180, 180, .4, groundMat, [0, 0, arena.groundZ - .2]);
const grid = new THREE.GridHelper(80, 40, 0x6b7772, 0x46565a);
grid.rotation.x = Math.PI / 2;
grid.position.z = arena.groundZ + .01;
scene.add(grid);
for (const barrier of arena.barriers) {
    box(...barrier.size as Vec3, wallMat, barrier.position as Vec3);
    box(barrier.size[0], barrier.size[1], .1, whiteMat, [barrier.position[0], barrier.position[1], barrier.position[2] + 1.03]);
}
// Road markings and starting bay are handmade geometry, independent of network entities.
for (let y = -34; y <= 34; y += 7)
    for (const x of [-9, 9])
        box(.13, 2.5, .015, whiteMat, [x, y, arena.groundZ + .03]);
for (const x of [-3.1, 3.1])
    box(.12, 7, .015, coralMat, [x, 6, arena.groundZ + .04]);
box(6.2, .12, .015, coralMat, [0, 9.5, arena.groundZ + .04]);
for (let i = 0; i < 12; i++)
    box(.8, .8, .025, i % 2 ? darkMat : whiteMat, [-4.4 + i * .8, -7, arena.groundZ + .035]);
for (const x of [-31, 31])
    for (const y of [-30, 30]) {
        box(.2, .2, 8, darkMat, [x, y, 13]);
        box(2.2, .6, .25, whiteMat, [x, y, 17]);
    }
function sign(text: string, width: number, height: number, position: Vec3) { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const ctx = c.getContext('2d')!; ctx.fillStyle = '#152c32'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#c6e6b9'; ctx.font = 'bold 76px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 128); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); mesh.rotation.x = Math.PI / 2; mesh.position.set(...position); scene.add(mesh); }
sign('THE TEST YARD  /  01', 17, 4, [0, 39, 15]);
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
} = { id: null, name: '', spawned: false, heading: 0, position: [-4, 0, 10], rotation: [1, 0, 0, 0], velocity: [0, 0, 0], mode: 'onFoot', vehicleId: 0, seat: 0, keys: 0 };
const peers = new Map<number, Peer>(), vehicles = new Map<number, Vehicle>(), names = new Map<number, string>();
const received: Record<string, number> = {}, chats: {
    id?: number;
    text: string;
    system: boolean;
}[] = [];
let socket: WebSocket | null = null, epoch: number | null = null, sequence = 0, controlRevision = 0, lastServerSequence = -1, status = 'Not connected', onFootRate = 30, inCarRate = 30, lastSend = 0, heading = 0, speed = 0, jumpSpeed = 0, toastUntil = 0;
let terminalReason: string | null = null;
const keys = new Set<string>();
function capsule(color: number) { const group = new THREE.Group(); const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(.33, .95, 6, 12), mat(color)); mesh.rotation.x = Math.PI / 2; mesh.castShadow = true; group.add(mesh); box(.42, .22, .18, darkMat, [0, .29, .43], group); const ring = new THREE.Mesh(new THREE.RingGeometry(.47, .51, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .4 })); ring.position.z = -.97; group.add(ring); scene.add(group); return group; }
const selfMesh = capsule(0x68d7bc);
selfMesh.visible = false;
function makeCar() { const group = new THREE.Group(); box(1.9, 4, .62, coralMat, [0, 0, 0], group); box(1.57, 1.8, .62, darkMat, [0, -.2, .62], group); box(1.7, 1.6, .12, coralMat, [0, -.3, .97], group); box(1.5, .1, .2, whiteMat, [0, 2.03, .1], group); for (const x of [-1, 1])
    for (const y of [-1.3, 1.3]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .28, 14), darkMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, y, -.28);
        wheel.castShadow = true;
        group.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .3, 10), wallMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        group.add(hub);
    } scene.add(group); return group; }
function rotationFromHeading(angle: number): Rotation { return [Math.cos(angle / 2), 0, 0, -Math.sin(angle / 2)]; }
function headingFromRotation(q: Rotation) { return -Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])); }
function setRotation(object: THREE.Object3D, q: Rotation) { object.quaternion.set(-q[1], -q[2], -q[3], q[0]); }
function toast(text: string) { el('toast').textContent = text; el('toast').classList.remove('hidden'); toastUntil = performance.now() + 6000; }
function chat(text: string, id?: number, system = false) { chats.push({ id, text, system }); if (chats.length > 200)
    chats.shift(); const line = document.createElement('div'); line.className = 'chat-line' + (system ? ' system' : ''); if (!system) {
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${names.get(id!) ?? (id === self.id ? self.name : `Player ${id}`)}: `;
    line.append(name);
} line.append(document.createTextNode(text)); el('chat-log').append(line); while (el('chat-log').children.length > 200)
    el('chat-log').firstChild!.remove(); el('chat-log').scrollTop = el('chat-log').scrollHeight; }
chat('Your messages and movements travel through the game server.', undefined, true);
function setStatus(value: string, connected = false) { status = value; el('status').textContent = value; el('connection').dataset.connected = String(connected); el<HTMLButtonElement>('join').disabled = connected || value === 'Connecting…'; el('join-panel').classList.toggle('hidden', connected); el('disconnect').classList.toggle('hidden', !connected); el<HTMLInputElement>('chat-input').disabled = !connected; }
function send(message: Record<string, unknown>) { if (socket?.readyState === WebSocket.OPEN) {
    if (socket.bufferedAmount > 64 * 1024) {
        socket.close(1013, 'Slow gateway');
        return;
    }
    socket.send(JSON.stringify({ version: 1, ...message, epoch }));
} }
function publishState(now = performance.now()) {
    send({ type: 'state', controlRevision, position: self.position, rotation: self.rotation, velocity: self.velocity, mode: self.mode, vehicleId: self.vehicleId, seat: self.seat, keys: self.keys, seq: ++sequence });
    lastSend = now;
}
function removeMesh(mesh: THREE.Group) { scene.remove(mesh); mesh.traverse(object => { if (object instanceof THREE.Mesh) {
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
        if (![groundMat, wallMat, coralMat, darkMat, tealMat, whiteMat].includes(material))
            material.dispose();
} }); }
function clearWorld() { for (const p of peers.values()) {
    removeMesh(p.mesh);
    p.label.remove();
} for (const v of vehicles.values())
    removeMesh(v.mesh); peers.clear(); vehicles.clear(); names.clear(); self.id = null; self.spawned = false; self.mode = 'onFoot'; self.vehicleId = 0; self.seat = 0; self.velocity = [0, 0, 0]; self.keys = 0; selfMesh.visible = false; keys.clear(); speed = 0; jumpSpeed = 0; sequence = 0; controlRevision = 0; lastServerSequence = -1; }
function disconnect(reason: string) { terminalReason = reason; clearWorld(); setStatus(reason); el<HTMLButtonElement>('join').disabled = false; el('join-panel').classList.remove('hidden'); }
function ensurePeer(id: number) { let p = peers.get(id); if (!p) {
    const label = document.createElement('div');
    label.className = 'player-label';
    document.body.append(label);
    p = { id, name: names.get(id) ?? `Player ${id}`, state: { position: [0, 0, 10], rotation: [1, 0, 0, 0], velocity: [0, 0, 0], mode: 'onFoot', vehicleId: 0, seat: 0, keys: 0 }, streamed: false, mesh: capsule(id % 2 ? 0xe8946d : 0x82b8ef), label };
    p.mesh.visible = false;
    peers.set(id, p);
} return p; }
function handle(m: ServerMessage) {
    if (terminalReason !== null) return;
    if (typeof m.epoch === 'number') {
        if (epoch !== null && m.epoch !== epoch)
            return;
        epoch = m.epoch;
    }
    if (typeof m.seq === 'number') {
        if (m.seq <= lastServerSequence)
            return;
        lastServerSequence = m.seq;
    }
    // A server control change invalidates input already queued by the browser.
    if (typeof m.controlRevision === 'number') {
        if (!Number.isSafeInteger(m.controlRevision) || m.controlRevision < controlRevision) return;
        controlRevision = m.controlRevision;
    }
    received[m.type] = (received[m.type] ?? 0) + 1;
    switch (m.type) {
        case 'init':
            self.id = m.playerId ?? null;
            names.set(self.id!, self.name);
            onFootRate = Math.max(10, m.onFootRate ?? 30);
            inCarRate = Math.max(10, m.inCarRate ?? 30);
            setStatus('Connected · open.mp', true);
            break;
        case 'spawn':
            if (m.position)
                self.position = [...m.position];
            heading = (m.heading ?? 0) * Math.PI / 180;
            self.heading = heading;
            self.rotation = rotationFromHeading(heading);
            self.spawned = true;
            self.mode = 'onFoot';
            self.vehicleId = 0;
            self.seat = 0;
            self.velocity = [0, 0, 0];
            selfMesh.visible = true;
            renderer.domElement.focus();
            break;
        case 'playerJoin':
            if (m.id !== undefined && m.id !== self.id) {
                names.set(m.id, m.name ?? `Player ${m.id}`);
                const p = ensurePeer(m.id);
                p.name = names.get(m.id)!;
            }
            break;
        case 'playerRemove': {
            const p = peers.get(m.id!);
            if (p) {
                removeMesh(p.mesh);
                p.label.remove();
                peers.delete(p.id);
            }
            names.delete(m.id!);
            break;
        }
        case 'playerState':
            if (m.id !== undefined && m.id !== self.id && m.position) {
                const p = ensurePeer(m.id);
                p.state = { ...p.state, ...m, position: [...m.position] } as PlayerState;
                p.streamed = true;
                p.mesh.visible = p.state.mode === 'onFoot';
                if (p.mesh.position.lengthSq() === 0)
                    p.mesh.position.set(...m.position);
            }
            break;
        case 'vehicle':
            if (m.id !== undefined && m.position) {
                let v = vehicles.get(m.id);
                if (!v) {
                    v = { id: m.id, model: m.model ?? 411, position: [...m.position], rotation: rotationFromHeading((m.heading ?? 0) * Math.PI / 180), velocity: [0, 0, 0], mesh: makeCar() };
                    vehicles.set(m.id, v);
                }
                else {
                    v.position = [...m.position];
                    v.rotation = rotationFromHeading((m.heading ?? 0) * Math.PI / 180);
                }
                v.mesh.position.set(...v.position);
                setRotation(v.mesh, v.rotation);
            }
            break;
        case 'vehicleRemove': {
            const v = vehicles.get(m.id!);
            if (v) {
                removeMesh(v.mesh);
                vehicles.delete(v.id);
            }
            break;
        }
        case 'vehicleState': {
            const v = vehicles.get(m.id ?? m.vehicleId!);
            if (v) {
                if (m.position)
                    v.position = [...m.position];
                if (m.rotation)
                    v.rotation = [...m.rotation];
                if (m.velocity) v.velocity = [...m.velocity];
                else if (m.position) v.velocity = [0, 0, 0]; // Server position corrections stop old motion.
                if (self.mode !== 'onFoot' && self.vehicleId === v.id) {
                    self.position = [...v.position];
                    self.rotation = [...v.rotation];
                    heading = headingFromRotation(v.rotation);
                    self.heading = heading;
                    // Received velocity describes the vehicle; deriving it from an
                    // occluded tab's render delta creates a spurious speed spike.
                    self.velocity = [...v.velocity];
                    if (self.mode === 'driver') speed = 0;
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
        case 'chat':
            chat(m.text ?? '', m.id);
            break;
        case 'message':
            chat(m.text ?? '', undefined, true);
            toast(m.text ?? '');
            break;
        case 'selfPosition':
            if (m.position) {
                self.position = [...m.position];
                self.velocity = [0, 0, 0];
                speed = 0;
                jumpSpeed = 0;
                if (self.mode === 'driver') {
                    const v = vehicles.get(self.vehicleId);
                    if (v)
                        v.position = [...self.position];
                }
            }
            break;
        case 'selfHeading':
            heading = (m.heading ?? 0) * Math.PI / 180;
            self.rotation = rotationFromHeading(heading);
            break;
        case 'seat': {
            self.vehicleId = m.vehicleId ?? 0;
            self.seat = m.seat ?? 0;
            self.mode = self.seat === 0 ? 'driver' : 'passenger';
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
        case 'exitVehicle': {
            const v = vehicles.get(self.vehicleId);
            // Explicit server placements win; otherwise choose a nearby clear doorway.
            if (m.position) self.position = [...m.position];
            else if (v) self.position = freeExitPosition(v, self.seat);
            self.mode = 'onFoot';
            self.vehicleId = 0;
            self.seat = 0;
            self.velocity = [0, 0, 0];
            speed = 0;
            keys.clear();
            break;
        }
        case 'disconnected':
            disconnect(`Disconnected: ${m.reason ?? 'Server ended the session.'}`);
            socket?.close();
            break;
        case 'error':
            toast(m.message ?? 'Connection error');
            chat(m.message ?? 'Connection error', undefined, true);
            disconnect(`Error: ${m.message ?? 'Connection failed'}`);
            socket?.close();
            break;
    }
}
el<HTMLFormElement>('join-form').addEventListener('submit', event => { event.preventDefault(); socket?.close(); clearWorld(); terminalReason = null; epoch = null; self.name = el<HTMLInputElement>('nickname').value.trim(); setStatus('Connecting…'); const current = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`); socket = current; current.addEventListener('open', () => { if (socket === current)
    send({ type: 'join', name: self.name }); }); current.addEventListener('message', event => { if (socket !== current)
    return; try {
    handle(JSON.parse(String(event.data)));
}
catch {
    toast('Invalid gateway message');
    current.close(1002, 'Invalid gateway message');
} }); current.addEventListener('error', () => { if (socket === current)
    toast('The gateway is unavailable. Check the local server.'); }); current.addEventListener('close', event => { if (socket === current) {
    disconnect(terminalReason ?? (event.reason ? `Disconnected: ${event.reason}` : 'Disconnected: join to reconnect'));
} }); });
el('disconnect').addEventListener('click', () => { send({ type: 'disconnect' }); socket?.close(); disconnect('Disconnected: left by you'); });
el<HTMLFormElement>('chat-form').addEventListener('submit', event => { event.preventDefault(); const input = el<HTMLInputElement>('chat-input'), text = input.value.trim(); if (text && self.spawned) {
    send({ type: text.startsWith('/') ? 'command' : 'chat', text });
    input.value = '';
    input.blur();
    renderer.domElement.focus();
} });
function isTyping() { return document.activeElement instanceof HTMLInputElement; }
window.addEventListener('keydown', event => { if (event.code === 'Enter' && !isTyping() && self.spawned) {
    event.preventDefault();
    keys.clear();
    el<HTMLInputElement>('chat-input').focus();
    return;
} if (isTyping() || !self.spawned)
    return; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyG', 'KeyF'].includes(event.code))
    event.preventDefault(); keys.add(event.code); if (!event.repeat) {
    if (event.code === 'KeyE')
        send({ type: 'command', text: '/drive' });
    if (event.code === 'KeyG')
        send({ type: 'command', text: '/passenger' });
    if (event.code === 'KeyF')
        send({ type: 'command', text: '/exit' });
    if (event.code === 'Space' && self.mode === 'onFoot' && self.position[2] <= arena.groundZ + 1.01)
        jumpSpeed = 5.8;
} });
window.addEventListener('keyup', event => keys.delete(event.code));
function suspend() { keys.clear(); self.keys = 0; self.velocity = [0, 0, 0]; speed = 0; if (self.spawned) publishState(); }
window.addEventListener('blur', suspend);
function disconnectSuspendedPage(reason: 'tab hidden' | 'page suspended') {
    if (terminalReason !== null || !socket || socket.readyState === WebSocket.CLOSED) return;
    // Hidden or frozen pages cannot keep their simulation current. Release the
    // upstream player instead of letting its worker publish stale coordinates.
    send({ type: 'disconnect' });
    socket.close();
    disconnect(`Disconnected: ${reason}; join again to resynchronize.`);
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) disconnectSuspendedPage('tab hidden');
});
document.addEventListener('freeze', () => disconnectSuspendedPage('page suspended'));
window.addEventListener('pagehide', () => { send({ type: 'disconnect' }); socket?.close(); });
function collision(x: number, y: number, radius: number) { return arena.barriers.some(b => Math.abs(x - b.position[0]) < b.size[0] / 2 + radius && Math.abs(y - b.position[1]) < b.size[1] / 2 + radius); }
function freeExitPosition(vehicle: Vehicle, seat: number): Vec3 {
    const angle = headingFromRotation(vehicle.rotation);
    const side = seat === 0 ? -1 : 1;
    // Try the requested door, the opposite door, then the rear/front of the car.
    const offsets = [[side * 2, 0], [-side * 2, 0], [0, -3], [0, 3]];
    for (const radius of [3, 4, 6]) {
        for (let i = 0; i < 16; i++) {
            const a = i * Math.PI / 8;
            offsets.push([Math.cos(a) * radius, Math.sin(a) * radius]);
        }
    }
    for (const [x, y] of offsets) {
        const position: Vec3 = [vehicle.position[0] + x * Math.cos(angle) - y * Math.sin(angle), vehicle.position[1] + x * Math.sin(angle) + y * Math.cos(angle), arena.groundZ + 1];
        if (Math.abs(position[0]) < arena.halfSize && Math.abs(position[1]) < arena.halfSize && !collision(position[0], position[1], .45)) return position;
    }
    // The fixed fixture always has clear spawns, including after a server vehicle correction.
    return [...arena.spawns.find(p => !collision(p[0], p[1], .45))!] as Vec3;
}
function step(dt: number) {
    if (!self.spawned)
        return;
    const old = [...self.position] as Vec3;
    if (self.mode === 'onFoot') {
        const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA')), y = Number(keys.has('KeyW')) - Number(keys.has('KeyS')), length = Math.hypot(x, y) || 1;
        const nx = self.position[0] + x / length * 5 * dt, ny = self.position[1] + y / length * 5 * dt;
        if (!collision(nx, self.position[1], .36))
            self.position[0] = nx;
        if (!collision(self.position[0], ny, .36))
            self.position[1] = ny;
        if (x || y)
            heading = Math.atan2(-x, y);
        jumpSpeed -= 15 * dt;
        self.position[2] = Math.max(arena.groundZ + 1, self.position[2] + jumpSpeed * dt);
        if (self.position[2] === arena.groundZ + 1)
            jumpSpeed = 0;
    }
    else if (self.mode === 'driver') {
        const throttle = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
        speed += throttle * 10 * dt;
        speed *= Math.exp(-(throttle ? .45 : 2.5) * dt);
        speed = Math.max(-7, Math.min(19, speed));
        const steer = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
        heading += steer * Math.min(Math.abs(speed) / 5, 1) * 1.45 * dt * Math.sign(speed);
        const nx = self.position[0] - Math.sin(heading) * speed * dt, ny = self.position[1] + Math.cos(heading) * speed * dt;
        if (!collision(nx, ny, 2)) {
            self.position[0] = nx;
            self.position[1] = ny;
        }
        else
            speed = 0;
        self.position[2] = arena.groundZ + 1;
        const v = vehicles.get(self.vehicleId);
        if (v) {
            v.position = [...self.position];
            v.rotation = rotationFromHeading(heading);
        }
    }
    else {
        const v = vehicles.get(self.vehicleId);
        if (v) {
            self.position = [...v.position];
            heading = headingFromRotation(v.rotation);
        }
    }
    self.heading = heading;
    self.rotation = rotationFromHeading(heading);
    self.velocity = self.mode === 'passenger' ? [...(vehicles.get(self.vehicleId)?.velocity ?? [0, 0, 0])] as Vec3 : self.position.map((n, i) => (n - old[i]) / dt) as Vec3;
    self.keys = (keys.has('KeyW') ? 8 : 0) | (keys.has('KeyS') ? 32 : 0) | (keys.has('Space') ? 128 : 0);
    if (self.mode === 'driver') {
        const v = vehicles.get(self.vehicleId);
        if (v)
            v.velocity = [...self.velocity];
    }
}
const cameraTarget = new THREE.Vector3(0, 2, 10), desiredCamera = new THREE.Vector3();
camera.position.set(0, -13, 23);
camera.lookAt(0, 6, 10);
let previous = performance.now(), accumulator = 0, lastHud = 0;
function frame(now: number) {
    requestAnimationFrame(frame);
    const delta = Math.max(0, Math.min((now - previous) / 1000, .1));
    previous = now;
    accumulator += delta;
    while (accumulator >= 1 / 60) {
        step(1 / 60);
        accumulator -= 1 / 60;
    }
    if (self.spawned && now - lastSend >= (self.mode === 'onFoot' ? onFootRate : inCarRate)) {
        publishState(now);
    }
    selfMesh.visible = self.spawned && self.mode === 'onFoot';
    selfMesh.position.set(...self.position);
    setRotation(selfMesh, self.rotation);
    for (const v of vehicles.values()) {
        if (self.mode === 'driver' && self.vehicleId === v.id)
            v.mesh.position.set(...v.position);
        else
            v.mesh.position.lerp(new THREE.Vector3(...v.position), 1 - Math.exp(-delta * 14));
        const target = new THREE.Quaternion(-v.rotation[1], -v.rotation[2], -v.rotation[3], v.rotation[0]);
        v.mesh.quaternion.slerp(target, 1 - Math.exp(-delta * 14));
    }
    for (const p of peers.values()) {
        p.mesh.visible = p.streamed && p.state.mode === 'onFoot';
        p.mesh.position.lerp(new THREE.Vector3(...p.state.position), 1 - Math.exp(-delta * 14));
        p.mesh.quaternion.slerp(new THREE.Quaternion(-p.state.rotation[1], -p.state.rotation[2], -p.state.rotation[3], p.state.rotation[0]), 1 - Math.exp(-delta * 14));
        const vehicle = vehicles.get(p.state.vehicleId);
        const labelPos = p.state.mode !== 'onFoot' && vehicle ? vehicle.mesh.position.clone() : p.mesh.position.clone();
        labelPos.z += 1.7;
        const projected = labelPos.project(camera);
        p.label.style.left = `${(projected.x * .5 + .5) * innerWidth}px`;
        p.label.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`;
        p.label.classList.toggle('hidden', !p.streamed || projected.z > 1 || projected.z < 0);
        p.label.textContent = p.name + (p.state.mode === 'driver' ? ' · driving' : p.state.mode === 'passenger' ? ' · riding' : '');
    }
    const target = self.spawned ? new THREE.Vector3(...self.position) : new THREE.Vector3(0, 4, 10);
    cameraTarget.lerp(target, 1 - Math.exp(-delta * 7));
    desiredCamera.copy(cameraTarget).add(new THREE.Vector3(0, -17, 13));
    camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 5));
    camera.lookAt(cameraTarget.x, cameraTarget.y + 2, cameraTarget.z);
    renderer.render(scene, camera);
    if (now > toastUntil)
        el('toast').classList.add('hidden');
    if (now - lastHud > 150) {
        el('self-name').textContent = self.name || '—';
        el('server-id').textContent = self.id === null ? '—' : String(self.id);
        el('mode').textContent = !self.spawned ? 'Exploring soon' : self.mode === 'onFoot' ? 'On foot' : self.mode === 'driver' ? 'Driver · seat 0' : `Passenger · seat ${self.seat}`;
        el('player-count').textContent = String((self.spawned ? 1 : 0) + peers.size);
        el('speed').textContent = String(Math.round((self.mode === 'driver' ? Math.abs(speed) : Math.hypot(self.velocity[0], self.velocity[1])) * 3.6)).padStart(2, '0');
        el('roster').replaceChildren(...[...(self.spawned ? [{ name: self.name + ' (you)' }] : []), ...peers.values()].map(p => { const row = document.createElement('div'); row.className = 'players'; const dot = document.createElement('i'); dot.className = 'swatch'; row.append(dot, document.createTextNode(p.name)); return row; }));
        lastHud = now;
    }
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// A fresh immutable observation snapshot, never a control or test bypass.
function snapshot() { return JSON.parse(JSON.stringify({ version: 1, status, epoch, controlRevision, self, peers: [...peers.values()].map(p => ({ id: p.id, name: p.name, ...p.state })), vehicles: [...vehicles.values()].map(v => ({ id: v.id, model: v.model, position: v.position, rotation: v.rotation, velocity: v.velocity })), chat: chats, received, sentSequence: sequence, serverSequence: lastServerSequence, rates: { onFootRate, inCarRate } })); }
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value))
        deepFreeze(child);
} return value; }
Object.defineProperty(window, '__poc', { get: () => deepFreeze(snapshot()), configurable: false });
