// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AudioSceneModel, parseAudioPreferences } from '../apps/browser/src/audio.ts';
import { createSounds, encodeWav, sampleRate } from '../tools/audio/synthesize.mjs';

const self = (overrides = {}) => ({ id: 1, position: [0, 0, 10], velocity: [0, 0, 0], mode: 'onFoot', vehicleId: 0, keys: 0, ...overrides });
const frame = (actor = self(), overrides = {}) => ({ connected: true, groundZ: 9, listener: { position: [0, -5, 12], forward: [0, 1, 0], up: [0, 0, 1] }, self: actor, vehicles: [], peers: [], ...overrides });

test('committed original PCM exports reproduce exactly and have useful bounded levels', () => {
  const inventory = JSON.parse(readFileSync('apps/browser/public/audio/inventory.json', 'utf8'));
  const sounds = createSounds();
  assert.equal(inventory.license, 'GPL-3.0-or-later');
  assert.equal(inventory.entries.length, 16);
  assert.ok(inventory.totalBytes < 2 * 1024 * 1024);
  for (const sound of sounds) {
    const entry = inventory.entries.find(entry => entry.id === sound.id);
    const bytes = readFileSync(`apps/browser/public/audio/${entry.file}`);
    assert.deepEqual(bytes, encodeWav(sound.samples), `${sound.id} must match its editable synthesis source`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(24), sampleRate);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    let peak = 0, energy = 0;
    for (const value of sound.samples) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    assert.ok(peak < .96, `${sound.id} has headroom`);
    assert.ok(Math.sqrt(energy / sound.samples.length) > .005, `${sound.id} contains audible content`);
    if (entry.loop) {
      let differences = 0;
      for (let i = 1; i < sound.samples.length; i++) differences += (sound.samples[i] - sound.samples[i - 1]) ** 2;
      const seam = Math.abs(sound.samples.at(-1) - sound.samples[0]), normalDelta = Math.sqrt(differences / (sound.samples.length - 1));
      assert.ok(seam < normalDelta * 6 + .001, `${sound.id}: seam ${seam} should resemble ordinary sample changes ${normalDelta}`);
    } else {
      assert.equal(Math.abs(sound.samples[0]), 0, `${sound.id} starts without a click`);
      assert.ok(Math.abs(sound.samples.at(-1)) < .005, `${sound.id} ends without a click`);
    }
  }
});

test('walking sound cadence follows distance at different update cadences', () => {
  for (const interval of [20, 50, 100, 250]) {
    const model = new AudioSceneModel(), events = [];
    model.advance(frame(), 0);
    for (let now = interval; now <= 6000; now += interval) events.push(...model.advance(frame(self({ position: [now / 1000 * 5, 0, 10], velocity: [5, 0, 0] })), now).effects);
    assert.equal(events.length, 18, `${interval}ms updates should emit the same 30m of steps`);
    assert.ok(events.every(event => event.sound.startsWith('footstep') && event.position === undefined));
    assert.notEqual(events[0].sound, events[1].sound);
  }
});

test('jump, landing, door placement and safe exit follow actual observed state', () => {
  const model = new AudioSceneModel(); model.advance(frame(), 0);
  assert.deepEqual(model.advance(frame(self({ position: [0, 0, 10.4], velocity: [0, 0, 4] })), 100).effects.map(e => e.sound), ['jump']);
  assert.equal(model.advance(frame(self({ position: [0, 0, 11], velocity: [0, 0, -2] })), 200).effects.length, 0);
  assert.deepEqual(model.advance(frame(), 400).effects.map(e => e.sound), ['land']);
  assert.deepEqual(model.advance(frame(self({ mode: 'driver', vehicleId: 1 })), 500).effects.map(e => e.sound), ['door-close']);
  assert.deepEqual(model.advance(frame(self({ position: [3.2, 0, 10] })), 600).effects.map(e => e.sound), ['door-open']);
});

test('initial observations, resets, stale frames, and disconnected sessions do not synthesize movement', () => {
  const model = new AudioSceneModel();
  assert.equal(model.advance(frame(self({ position: [0, 0, 11], velocity: [0, 0, -3] })), 0).effects.length, 0);
  assert.equal(model.advance(frame(self({ position: [60, 0, 10] })), 100).effects.length, 0);
  assert.equal(model.advance(frame(self({ position: [70, 0, 10], velocity: [5, 0, 0] })), 3000).effects.length, 0);
  assert.equal(model.advance(frame(self({ position: [72, 0, 10], velocity: [5, 0, 0] })), 2000).effects.length, 0);
  assert.deepEqual(model.advance(frame(self(), { connected: false }), 3100), { effects: [], engines: [] });
  assert.equal(model.advance(frame(self({ position: [0, 0, 10], mode: 'driver', vehicleId: 1 })), 3200).effects.length, 0);
});

test('peer footsteps are spatial and silent when distant; departure clears history', () => {
  const model = new AudioSceneModel(), near = self({ id: 2 }), distant = self({ id: 3, position: [100, 100, 10] });
  model.advance(frame(self(), { peers: [near, distant] }), 0);
  const observed = model.advance(frame(self(), { peers: [{ ...near, position: [2, 0, 10], velocity: [5, 0, 0] }, { ...distant, position: [102, 100, 10], velocity: [5, 0, 0] }] }), 400);
  assert.equal(observed.effects.length, 1); assert.deepEqual(observed.effects[0].position, [2, 0, 10]);
  model.advance(frame(), 500);
  assert.equal(model.advance(frame(self(), { peers: [{ ...near, position: [4, 0, 10], velocity: [5, 0, 0] }] }), 600).effects.length, 0);
});

test('engines are selected from real occupied vehicles with bounded nearest spatial voices', () => {
  const model = new AudioSceneModel(), vehicles = Array.from({ length: 24 }, (_, id) => ({ id, occupied: true, position: [id * 3, 0, 10], velocity: [id, 0, 0] }));
  vehicles[0].occupied = false;
  const result = model.advance(frame(self({ mode: 'passenger', vehicleId: 2 }), { vehicles }), 0);
  assert.equal(result.engines.length, 8);
  assert.deepEqual(result.engines.map(engine => engine.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.engines.find(engine => engine.id === 2).cabin, true);
  assert.ok(result.engines.every(engine => Number.isFinite(engine.load) && engine.load >= 0 && engine.load <= 1));
  assert.equal(model.advance(frame(self(), { vehicles: [{ id: 2, occupied: false, position: [0, 0, 10], velocity: [5, 0, 0] }] }), 100).engines.length, 0);
});

test('standard replicated driver key bit produces bounded horns and excludes passengers', () => {
  const model = new AudioSceneModel(), driver = self({ mode: 'driver', vehicleId: 2 }), peer = self({ id: 2, mode: 'driver', vehicleId: 3, position: [4, 0, 10] });
  model.advance(frame(driver, { peers: [peer] }), 0);
  const sounding = { ...driver, keys: 2 }, soundingPeer = { ...peer, keys: 2 };
  let observed = model.advance(frame(sounding, { peers: [soundingPeer] }), 100);
  assert.deepEqual(observed.effects.map(event => event.sound), ['horn', 'horn']);
  assert.equal(observed.effects[0].position, undefined);
  assert.deepEqual(observed.effects[1].position, [4, 0, 10]);
  assert.equal(model.advance(frame(sounding, { peers: [soundingPeer] }), 200).effects.length, 0);
  assert.equal(model.advance(frame(sounding, { peers: [soundingPeer] }), 400).effects.length, 0);
  assert.equal(model.advance(frame(sounding, { peers: [soundingPeer] }), 600).effects.length, 0);
  assert.equal(model.advance(frame(sounding, { peers: [soundingPeer] }), 800).effects.length, 2);
  model.advance(frame(driver), 900);
  assert.equal(model.advance(frame(sounding), 1000).effects.filter(event => event.sound === 'horn').length, 1);
  assert.equal(model.advance(frame({ ...sounding, mode: 'passenger' }), 1100).effects.filter(event => event.sound === 'horn').length, 0);
});

test('invalid audio observations and preferences fail quietly without invalid numeric nodes', () => {
  const model = new AudioSceneModel();
  const result = model.advance(frame(self({ position: [NaN, 0, 10] }), { peers: [self({ id: 2, position: [Infinity, 0, 10] })], vehicles: [{ id: 2, occupied: true, position: [0, 0, 10], velocity: [NaN, 0, 0] }] }), 0);
  assert.deepEqual(result, { effects: [], engines: [] });
  assert.deepEqual(parseAudioPreferences('broken'), { volume: .65, muted: false });
  assert.deepEqual(parseAudioPreferences('{"volume": 9, "muted": true}'), { volume: 1, muted: true });
  assert.deepEqual(parseAudioPreferences('{"volume": -9, "muted": "true"}'), { volume: 0, muted: false });
});
