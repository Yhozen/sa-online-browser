// SPDX-License-Identifier: GPL-3.0-or-later
// Audio is a presentation of observed gameplay. It never sends network messages
// or claims that a local cue (including the horn) was accepted by the server.
import type { PlayerMode } from "../../../packages/shared/protocol";

export type AudioCue = "countdown" | "start" | "checkpoint" | "finish" | "reset" | "horn";
type Effect = AudioCue | "footstep-a" | "footstep-b" | "jump" | "land" | "door-open" | "door-close";
type Sound = Effect | "engine-idle" | "engine-load" | "tire-roll" | "ambience";
type Point = readonly [number, number, number];
export interface AudioActor {
  id: number | null;
  position: Point;
  velocity: Point;
  mode: PlayerMode;
  vehicleId: number;
  keys?: number;
}
export interface AudioVehicle {
  id: number;
  position: Point;
  velocity: Point;
  occupied: boolean;
}
export interface AudioFrame {
  connected: boolean;
  groundZ: number;
  listener: { position: Point; forward: Point; up: Point };
  self: AudioActor;
  vehicles: readonly AudioVehicle[];
  peers?: readonly AudioActor[];
}
interface EffectEvent { sound: Effect; position?: Point; gain: number }
interface EngineState { id: number; position: Point; speed: number; load: number; cabin: boolean }
interface ActorHistory { position: Point; mode: PlayerMode; vehicleId: number; airborne: boolean; distance: number; alternate: boolean; horn: boolean; hornAt: number }
export interface AudioPreferences { volume: number; muted: boolean }
export interface AudioStatus {
  state: "locked" | "loading" | "running" | "suspended" | "unavailable" | "disposed";
  message?: string;
  effects: number;
  engines: number;
  assetsLoaded: number;
  decodedBytes: number;
}
const MAX_ENGINES = 8, MAX_EFFECTS = 24, MAX_ACTORS = 12, MAX_DISTANCE = 90;
const STORAGE_KEY = "arroyo-audio-v1";
const SOUND_IDS: Sound[] = ["engine-idle", "engine-load", "tire-roll", "footstep-a", "footstep-b", "jump", "land", "door-open", "door-close", "countdown", "start", "checkpoint", "finish", "reset", "horn", "ambience"];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const validPoint = (p: readonly number[]) => p.length === 3 && p.every(n => Number.isFinite(n) && Math.abs(n) < 100000);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function parseAudioPreferences(raw: string | null): AudioPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && typeof value === "object") return {
      volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? clamp(value.volume, 0, 1) : .65,
      muted: value.muted === true,
    };
  } catch { /* A corrupt preference must not prevent entry. */ }
  return { volume: .65, muted: false };
}

/** Frame-independent event derivation; separately tested without a browser. */
export class AudioSceneModel {
  private actors = new Map<string, ActorHistory>();
  private speeds = new Map<number, number>();
  private lastTime: number | null = null;

  reset() { this.actors.clear(); this.speeds.clear(); this.lastTime = null; }

  advance(frame: AudioFrame, now: number): { effects: EffectEvent[]; engines: EngineState[] } {
    const effects: EffectEvent[] = [], engines: EngineState[] = [];
    if (!frame.connected || !Number.isFinite(now) || !Number.isFinite(frame.groundZ) || !validPoint(frame.listener.position)) {
      this.reset(); return { effects, engines };
    }
    if (this.lastTime !== null && now <= this.lastTime) return { effects, engines: [] };
    const dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    const actors = [{ actor: frame.self, key: "self", local: true }, ...(frame.peers ?? [])
      .filter(actor => actor.id !== frame.self.id && validPoint(actor.position))
      .sort((a, b) => distance(a.position, frame.listener.position) - distance(b.position, frame.listener.position))
      .slice(0, MAX_ACTORS - 1).map(actor => ({ actor, key: `peer:${actor.id}`, local: false }))];
    const actorKeys = new Set<string>();
    for (const { actor, key, local } of actors) {
      if (!validPoint(actor.position) || !validPoint(actor.velocity)) continue;
      if (!local && distance(actor.position, frame.listener.position) > MAX_DISTANCE) continue;
      actorKeys.add(key);
      const previous = this.actors.get(key), airborne = actor.mode === "onFoot" && actor.position[2] > frame.groundZ + 1.07;
      const horn = actor.mode === "driver" && Boolean((actor.keys ?? 0) & 2);
      const state: ActorHistory = { position: [...actor.position], mode: actor.mode, vehicleId: actor.vehicleId, airborne, distance: previous?.distance ?? 0, alternate: previous?.alternate ?? false, horn, hornAt: previous?.hornAt ?? -Infinity };
      // Long stalls, teleports, initial observations, and seat changes cannot
      // replay accumulated steps or produce a false landing at a reset point.
      const moved = previous ? distance(previous.position, actor.position) : 0;
      const continuous = previous && dt > 0 && dt < .6 && moved < Math.max(2.5, dt * 35);
      const emit = (sound: Effect, gain: number) => effects.push({ sound, gain, position: local ? undefined : [...actor.position] });
      // The ordinary SA-MP in-car key bit 2 carries horn state. Peers therefore
      // hear only received driver state, with no extra browser-to-browser path.
      if (previous && horn && (!previous.horn || now - previous.hornAt >= 650)) {
        emit("horn", local ? .6 : .48); state.hornAt = now;
      }
      if (previous && dt > 0 && dt < .6 && moved < 8) {
        if (previous.mode === "onFoot" && actor.mode !== "onFoot") emit("door-close", local ? .72 : .45);
        else if (previous.mode !== "onFoot" && actor.mode === "onFoot") emit("door-open", local ? .6 : .4);
      }
      if (continuous) {
        if (actor.mode === "onFoot" && previous.mode === "onFoot") {
          if (!previous.airborne && airborne && actor.velocity[2] > .7) emit("jump", local ? .62 : .38);
          if (previous.airborne && !airborne) emit("land", local ? .72 : .45);
          if (!airborne && !previous.airborne && Math.hypot(...actor.velocity.slice(0, 2)) > .25) {
            state.distance += Math.hypot(actor.position[0] - previous.position[0], actor.position[1] - previous.position[1]);
            if (state.distance >= 1.65) {
              state.distance %= 1.65;
              state.alternate = !state.alternate;
              emit(state.alternate ? "footstep-a" : "footstep-b", local ? .55 : .38);
            }
          } else state.distance = 0;
        } else state.distance = 0;
      } else state.distance = 0;
      this.actors.set(key, state);
    }
    for (const key of this.actors.keys()) if (!actorKeys.has(key)) this.actors.delete(key);
    const selected = frame.vehicles.filter(vehicle => vehicle.occupied && Number.isSafeInteger(vehicle.id) &&
      validPoint(vehicle.position) && validPoint(vehicle.velocity) && distance(vehicle.position, frame.listener.position) <= MAX_DISTANCE)
      .sort((a, b) => distance(a.position, frame.listener.position) - distance(b.position, frame.listener.position) || a.id - b.id)
      .slice(0, MAX_ENGINES);
    const ids = new Set<number>();
    for (const vehicle of selected) {
      ids.add(vehicle.id);
      const speed = clamp(Math.hypot(vehicle.velocity[0], vehicle.velocity[1]), 0, 40), previousSpeed = this.speeds.get(vehicle.id) ?? speed;
      const acceleration = dt > .01 && dt < .6 ? clamp((speed - previousSpeed) / dt / 8, -1, 1) : 0;
      const localDriver = frame.self.mode === "driver" && frame.self.vehicleId === vehicle.id;
      const throttle = localDriver && Boolean((frame.self.keys ?? 0) & (8 | 32));
      const load = clamp(speed / 26 + Math.max(0, acceleration) * .35 + (throttle ? .2 : 0), 0, 1);
      engines.push({ id: vehicle.id, position: [...vehicle.position], speed, load, cabin: frame.self.mode !== "onFoot" && frame.self.vehicleId === vehicle.id });
      this.speeds.set(vehicle.id, speed);
    }
    for (const id of this.speeds.keys()) if (!ids.has(id)) this.speeds.delete(id);
    return { effects: effects.slice(0, MAX_EFFECTS), engines };
  }
}

interface Loop { source: AudioBufferSourceNode; gain: GainNode }
interface Engine { panner: PannerNode; bus: GainNode; idle: Loop; load: Loop; tires: Loop }
interface Voice { source: AudioBufferSourceNode; gain: GainNode; panner?: PannerNode; started: number }
interface InventoryEntry { id: Sound; file: string; bytes: number; sha256: string }
export interface GameAudioOptions { assetUrl?: (path: string) => string; onChange?: (status: AudioStatus, preferences: AudioPreferences) => void }

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambience: Loop | null = null;
  private buffers = new Map<Sound, AudioBuffer>();
  private engines = new Map<number, Engine>();
  private voices = new Set<Voice>();
  private cueTimes = new Map<Effect, number>();
  private model = new AudioSceneModel();
  private frame: AudioFrame | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;
  private connected = false;
  private state: AudioStatus["state"] = "locked";
  private message: string | undefined;
  private settings: AudioPreferences;
  private lifetime = new AbortController();
  private idleTimer: ReturnType<typeof setInterval>;
  private lastUpdate = 0;
  private options: GameAudioOptions;

  constructor(options: GameAudioOptions = {}) {
    this.options = options;
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    this.settings = parseAudioPreferences(stored);
    document.addEventListener("visibilitychange", this.visibility);
    document.addEventListener("freeze", this.pause);
    window.addEventListener("pagehide", this.pagehide);
    // If integration stops providing gameplay snapshots, never leave a stale
    // engine running indefinitely. This timer is independent of requestAnimationFrame.
    this.idleTimer = setInterval(() => {
      if (this.connected && performance.now() - this.lastUpdate > 1500) this.stopScene();
    }, 500);
  }

  get preferences(): AudioPreferences { return { ...this.settings }; }
  get status(): AudioStatus { return { state: this.state, message: this.message, effects: this.voices.size, engines: this.engines.size, assetsLoaded: this.buffers.size, decodedBytes: [...this.buffers.values()].reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0) }; }
  private notify() { this.options.onChange?.(this.status, this.preferences); }

  setVolume(value: number) {
    if (!Number.isFinite(value) || this.disposed) return;
    this.settings.volume = clamp(value, 0, 1); this.savePreferences();
  }
  setMuted(value: boolean) {
    if (this.disposed) return;
    this.settings.muted = Boolean(value); this.savePreferences();
  }
  private savePreferences() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Sound still works without persistence. */ }
    this.applyVolume(); this.notify();
  }
  private applyVolume() {
    if (this.context && this.master) this.smooth(this.master.gain, this.settings.muted ? 0 : this.settings.volume * .75);
  }
  private smooth(param: AudioParam, target: number, time = .05) {
    if (!this.context) return;
    param.cancelScheduledValues(this.context.currentTime);
    param.setTargetAtTime(target, this.context.currentTime, time);
  }

  /** Call from a real click/key gesture. It resolves safely on unavailable audio. */
  async unlock(): Promise<void> {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -9;
        this.compressor.knee.value = 8;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = .005;
        this.compressor.release.value = .18;
        this.master.connect(this.compressor).connect(this.context.destination);
        this.applyVolume();
      }
      // Resume starts synchronously within the gesture, before network awaits.
      await this.context.resume();
      if (this.disposed) return;
      if (this.buffers.size !== SOUND_IDS.length) {
        if (!this.loading) this.loading = this.load().finally(() => { this.loading = null; });
        await this.loading;
      }
      if (this.disposed) return;
      this.state = this.context.state === "running" ? "running" : "suspended";
      this.message = undefined; this.notify();
      if (this.frame && !document.hidden) this.update(this.frame);
    } catch (error) {
      if (this.disposed) return;
      this.state = "unavailable";
      this.message = `Sound could not load. Use the sound button to retry. ${error instanceof Error ? error.message : "Audio is unavailable."}`;
      this.stopScene(); this.notify();
    }
  }

  private async load() {
    this.state = "loading"; this.notify();
    const url = this.options.assetUrl ?? (path => `${import.meta.env?.BASE_URL ?? "/"}${path.replace(/^\//, "")}`);
    const fetchAsset = async (path: string, maxBytes: number) => {
      const response = await fetch(url(path), { signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length"));
      if (length > maxBytes) throw Error(`${path}: unexpected asset size`);
      const data = await response.arrayBuffer();
      if (data.byteLength > maxBytes) throw Error(`${path}: unexpected asset size`);
      return data;
    };
    const inventory = JSON.parse(new TextDecoder().decode(await fetchAsset("/audio/inventory.json", 32 * 1024))) as { version?: number; entries?: InventoryEntry[] };
    if (inventory.version !== 1 || !Array.isArray(inventory.entries) || inventory.entries.length !== SOUND_IDS.length) throw Error("Invalid audio inventory");
    const pending = new Map<Sound, AudioBuffer>();
    await Promise.all(SOUND_IDS.map(async id => {
      const matches = inventory.entries!.filter(entry => entry.id === id), entry = matches[0];
      if (matches.length !== 1 || entry.file !== `${id}.wav` || !Number.isSafeInteger(entry.bytes) || entry.bytes < 44 || entry.bytes > 2 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error(`Invalid ${id} inventory entry`);
      const data = await fetchAsset(`/audio/${entry.file}`, entry.bytes);
      if (data.byteLength !== entry.bytes) throw Error(`Incomplete ${id} audio`);
      if (!crypto.subtle) throw Error("Sound verification requires HTTPS or localhost");
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (digest !== entry.sha256) throw Error(`Checksum mismatch for ${id}`);
      const buffer = await this.context!.decodeAudioData(data);
      if (buffer.numberOfChannels !== 1 || !Number.isFinite(buffer.duration) || buffer.duration > 25) throw Error(`Invalid ${id} audio format`);
      pending.set(id, buffer);
    }));
    if (!this.disposed) this.buffers = pending;
  }

  update(frame: AudioFrame, now = performance.now()) {
    if (this.disposed) return;
    this.frame = frame;
    this.lastUpdate = now;
    if (!frame.connected || document.hidden) { this.stopScene(); return; }
    if (this.state !== "running" || !this.context || this.context.state !== "running" || !this.master) return;
    if (!validPoint(frame.listener.position) || !validPoint(frame.listener.forward) || !validPoint(frame.listener.up)) { this.stopScene(); return; }
    this.connected = true;
    const listener = this.context.listener;
    const parameters = [listener.positionX, listener.positionY, listener.positionZ, listener.forwardX, listener.forwardY, listener.forwardZ, listener.upX, listener.upY, listener.upZ];
    [...frame.listener.position, ...frame.listener.forward, ...frame.listener.up].forEach((value, index) => this.smooth(parameters[index], value));
    if (!this.ambience) this.ambience = this.loop("ambience", this.master, .48);
    const derived = this.model.advance(frame, now), ids = new Set<number>();
    for (const value of derived.engines) {
      ids.add(value.id);
      let engine = this.engines.get(value.id);
      if (!engine) {
        const panner = this.panner(value.position), bus = this.context.createGain();
        bus.gain.value = .85; bus.connect(panner).connect(this.master);
        engine = { panner, bus, idle: this.loop("engine-idle", bus, 0), load: this.loop("engine-load", bus, 0), tires: this.loop("tire-roll", bus, 0) };
        this.engines.set(value.id, engine);
      }
      this.position(engine.panner, value.position);
      this.smooth(engine.bus.gain, value.cabin ? 1 : .85);
      this.smooth(engine.idle.gain.gain, .26 * (1 - value.load * .65));
      this.smooth(engine.load.gain.gain, .02 + value.load * .3);
      this.smooth(engine.tires.gain.gain, Math.min(.4, value.speed / 55));
      this.smooth(engine.idle.source.playbackRate, 1 + value.speed / 38, .12);
      this.smooth(engine.load.source.playbackRate, .78 + value.speed / 27 + value.load * .15, .12);
      this.smooth(engine.tires.source.playbackRate, .65 + value.speed / 30, .12);
    }
    for (const [id, engine] of this.engines) if (!ids.has(id)) { this.stopEngine(engine); this.engines.delete(id); }
    for (const effect of derived.effects) this.play(effect.sound, effect.gain, effect.position);
  }

  /** For observed server activity events. Horn is local presentation until replicated. */
  cue(sound: AudioCue, position?: Point) {
    if (position && !validPoint(position)) return;
    if (!this.connected || this.state !== "running" || !this.context || document.hidden) return;
    const now = this.context.currentTime, previous = this.cueTimes.get(sound) ?? -Infinity;
    const cooldown = sound === "finish" ? .8 : sound === "horn" ? .3 : .1;
    if (now - previous < cooldown) return;
    this.cueTimes.set(sound, now);
    this.play(sound, sound === "horn" ? .6 : .55, position);
  }

  private panner(position: Point) {
    const panner = this.context!.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "inverse";
    panner.refDistance = 7; panner.maxDistance = MAX_DISTANCE; panner.rolloffFactor = 1.35;
    panner.positionX.value = position[0]; panner.positionY.value = position[1]; panner.positionZ.value = position[2];
    return panner;
  }
  private position(panner: PannerNode, point: Point) {
    this.smooth(panner.positionX, point[0]); this.smooth(panner.positionY, point[1]); this.smooth(panner.positionZ, point[2]);
  }
  private loop(id: Sound, destination: AudioNode, volume: number): Loop {
    const source = this.context!.createBufferSource(), gain = this.context!.createGain();
    source.buffer = this.buffers.get(id)!; source.loop = true; gain.gain.value = volume;
    source.connect(gain).connect(destination); source.start(); return { source, gain };
  }
  private play(sound: Effect, volume: number, position?: Point) {
    if (!this.context || !this.master || this.context.state !== "running") return;
    const buffer = this.buffers.get(sound); if (!buffer) return;
    // Oldest short effect is retired before allocation; a flood cannot build an
    // unbounded voice queue. Engine/ambience voices have their own fixed bounds.
    if (this.voices.size >= MAX_EFFECTS) this.stopVoice(this.voices.values().next().value!);
    const source = this.context.createBufferSource(), gain = this.context.createGain(), panner = position ? this.panner(position) : undefined;
    source.buffer = buffer; gain.gain.value = volume;
    source.connect(gain); if (panner) gain.connect(panner).connect(this.master); else gain.connect(this.master);
    const voice: Voice = { source, gain, panner, started: this.context.currentTime };
    source.onended = () => this.stopVoice(voice);
    this.voices.add(voice); source.start();
  }
  private stopVoice(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* It may have naturally ended. */ }
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner?.disconnect();
  }
  private stopLoop(loop: Loop) { try { loop.source.stop(); } catch { /* Already stopped. */ } loop.source.disconnect(); loop.gain.disconnect(); }
  private stopEngine(engine: Engine) {
    this.stopLoop(engine.idle); this.stopLoop(engine.load); this.stopLoop(engine.tires); engine.bus.disconnect(); engine.panner.disconnect();
  }
  private stopScene() {
    this.connected = false;
    for (const engine of this.engines.values()) this.stopEngine(engine);
    this.engines.clear();
    for (const voice of [...this.voices]) this.stopVoice(voice);
    if (this.ambience) this.stopLoop(this.ambience);
    this.ambience = null; this.model.reset(); this.cueTimes.clear();
  }
  private pause = () => {
    this.stopScene();
    if (this.context?.state === "running") void this.context.suspend().then(() => {
      if (!this.disposed) { this.state = "suspended"; this.notify(); }
    }).catch(() => {});
  };
  private visibility = () => {
    if (document.hidden) this.pause();
    // Joining again (or clicking sound) explicitly resumes from a real gesture.
  };
  private pagehide = (event: PageTransitionEvent) => { if (!event.persisted) this.dispose(); else this.pause(); };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopScene(); this.frame = null;
    clearInterval(this.idleTimer); this.lifetime.abort();
    document.removeEventListener("visibilitychange", this.visibility); document.removeEventListener("freeze", this.pause); window.removeEventListener("pagehide", this.pagehide);
    this.master?.disconnect(); this.compressor?.disconnect();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.buffers.clear(); this.state = "disposed"; this.notify();
  }
}

export function createGameAudio(options: GameAudioOptions = {}) { return new GameAudio(options); }
