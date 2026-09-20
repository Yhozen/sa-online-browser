// SPDX-License-Identifier: GPL-3.0-or-later
// Original Arroyo sounds. No recordings, sample libraries, or external services.
// Every sample is deterministic; loops use periodic oscillation/noise, not fades
// to silence. This source is the editable project for these PCM exports.
export const sampleRate = 24000;
const tau = Math.PI * 2;
function rng(seed) {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 0x100000000 * 2 - 1; };
}
function noise(length, seed) {
  const next = rng(seed), output = new Float64Array(length);
  for (let i = 0; i < length; i++) output[i] = next();
  return output;
}
// Circular one-pole filtering preserves continuity across the loop seam.
function filter(input, cutoff, highpass = false) {
  const output = new Float64Array(input.length), a = 1 - Math.exp(-tau * cutoff / sampleRate);
  let last = 0;
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < input.length; i++) {
    last += a * (input[i] - last);
    output[i] = highpass ? input[i] - last : last;
  }
  return output;
}
function signal(seconds, fn) {
  const output = new Float64Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < output.length; i++) output[i] = fn(i / sampleRate, i);
  return output;
}
function attackDecay(t, duration, attack = .004, release = 8) {
  return Math.min(1, t / attack) * Math.exp(-t / duration * release) * Math.min(1, (duration - t) / .018);
}
function tone(seconds, notes, seed = 7) {
  const hiss = filter(noise(Math.round(seconds * sampleRate), seed), 2300);
  return signal(seconds, (t, i) => notes.reduce((sum, [start, frequency, duration, amplitude]) => {
    const age = t - start;
    if (age < 0 || age >= duration) return sum;
    return sum + amplitude * attackDecay(age, duration, .006, 3.8) *
      (Math.sin(tau * frequency * age) + .18 * Math.sin(tau * frequency * 2 * age) + hiss[i] * .01);
  }, 0));
}
function engine(seconds, fundamental, load) {
  const air = filter(noise(sampleRate * seconds, 130 + fundamental), 1600), exhaust = filter(air, 95, true);
  return signal(seconds, (t, i) => {
    const phase = tau * fundamental * t + .04 * Math.sin(tau * 3 * t),
      pulse = Math.sin(phase) + .52 * Math.sin(phase * 2 + .3) + .26 * Math.sin(phase * 3 + .8) +
        .15 * Math.sin(phase * 5) + .055 * Math.sin(phase * 9),
      flutter = .9 + .07 * Math.sin(tau * 2 * t) + .03 * Math.sin(tau * 7 * t);
    return .37 * Math.tanh(pulse * (load ? 1.1 : .8)) * flutter + exhaust[i] * (load ? .2 : .09);
  });
}
function impact(seconds, seed, size = 1, bright = 1) {
  const n = noise(Math.round(seconds * sampleRate), seed), low = filter(n, 450 * bright), high = filter(n, 2100 * bright);
  return signal(seconds, (t, i) => {
    const body = Math.sin(tau * (82 / size * t - 21 / size * t * t));
    const envelope = attackDecay(t, seconds, .002, 8);
    return envelope * (.47 * low[i] + .16 * high[i] + body * .24);
  });
}
function door(open) {
  const length = open ? .42 : .5, n = noise(Math.round(length * sampleRate), open ? 251 : 257), low = filter(n, 550);
  return signal(length, (t, i) => {
    const latch = attackDecay(t, length, .001, 27) * (.23 * n[i] + .3 * Math.sin(tau * 420 * t));
    const age = t - (open ? .11 : .075);
    const thud = age > 0 ? attackDecay(age, length - .11, .003, 5) *
      ((open ? .12 : .56) * low[i] + (open ? .07 : .3) * Math.sin(tau * 68 * age)) : 0;
    return latch + thud;
  });
}
function ambience() {
  const seconds = 24, n = noise(seconds * sampleRate, 680), wind = filter(n, 650), leaves = filter(n, 2200);
  const birds = [[1.8, 2110], [2.16, 2730], [8.1, 2440], [8.6, 2860], [16.4, 2210], [17, 2580]];
  return signal(seconds, (t, i) => {
    const gust = .55 + .2 * Math.sin(tau * t / 24) + .12 * Math.sin(tau * t / 8 + .7);
    let value = .2 * wind[i] * gust + .03 * leaves[i];
    for (const [start, pitch] of birds) {
      const age = t - start;
      if (age > 0 && age < .24) {
        const envelope = Math.sin(Math.PI * age / .24) ** 2;
        value += .025 * envelope * Math.sin(tau * (pitch * age + 1250 * age * age + 16 * Math.sin(tau * 17 * age)));
      }
    }
    return value;
  });
}

export function createSounds() {
  const tireNoise = filter(noise(sampleRate * 2, 481), 2800), roll = filter(tireNoise, 180, true);
  return [
    { id: 'engine-idle', loop: true, description: 'Original six-cylinder idle: periodic exhaust harmonics and filtered air.', samples: engine(2, 48, false) },
    { id: 'engine-load', loop: true, description: 'Original loaded engine: stronger exhaust harmonics, smoothly pitch shifted at runtime.', samples: engine(2, 106, true) },
    { id: 'tire-roll', loop: true, description: 'Circularly filtered tire contact noise; gain follows road speed.', samples: signal(2, (t, i) => roll[i] * .23 * (1 + .08 * Math.sin(tau * 8 * t))) },
    { id: 'footstep-a', description: 'Shoe heel and asphalt contact, first deterministic variation.', samples: impact(.22, 101, .9, 1.5) },
    { id: 'footstep-b', description: 'Shoe heel and asphalt contact, second deterministic variation.', samples: impact(.24, 113, 1.03, 1.3) },
    { id: 'jump', description: 'Clothing movement and push-off, synthesized filtered impulse.', samples: impact(.19, 163, .65, .7) },
    { id: 'land', description: 'Two-foot landing: a low, short shoe impact.', samples: impact(.32, 173, 1.35, .8) },
    { id: 'door-open', description: 'Seat-exit latch click and light panel resonance.', samples: door(true) },
    { id: 'door-close', description: 'Seat-placement latch and low coupe door thump.', samples: door(false) },
    { id: 'countdown', description: 'Short A4 staging beep.', samples: tone(.22, [[0, 440, .2, .38]]) },
    { id: 'start', description: 'Two ascending original tones signal the server race start.', samples: tone(.55, [[0, 660, .24, .32], [.12, 880, .4, .31]]) },
    { id: 'checkpoint', description: 'A restrained two-note checkpoint acknowledgement.', samples: tone(.4, [[0, 740, .2, .27], [.085, 988, .3, .25]]) },
    { id: 'finish', description: 'Original four-note finish phrase; no sampled melody.', samples: tone(1.28, [[0, 554, .38, .25], [.16, 659, .38, .25], [.32, 831, .42, .25], [.52, 1109, .74, .26]]) },
    { id: 'reset', description: 'Descending pair acknowledges an actual reset.', samples: tone(.48, [[0, 523, .23, .26], [.14, 392, .3, .25]]) },
    { id: 'horn', description: 'Original short automotive dual horn, F4 and A4.', samples: signal(.4, t => Math.min(1, t / .015, (.4 - t) / .03) * (.2 * Math.sin(tau * 349 * t) + .17 * Math.sin(tau * 440 * t) + .045 * Math.sin(tau * 698 * t))) },
    { id: 'ambience', loop: true, description: 'Quiet circular wind/leaf noise and sparse original synthesized bird chirps.', samples: ambience() },
  ];
}

export function encodeWav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
  return data;
}
