// SPDX-License-Identifier: GPL-3.0-or-later
// Test-only observation. No application state or input is changed.
// These self-contained functions are serialized into the existing page.
export function armResetObservation({ key }) {
  if (Object.prototype.hasOwnProperty.call(window, key)) throw Error('Reset observation key already exists');
  const input = document.querySelector('[data-testid="chat-input"]');
  if (!input || input.value.trim() !== '/reset') throw Error('Fill the real reset chat command before arming');
  const initial = window.__poc;
  if (!initial?.self?.spawned || !initial.vehicles?.[0]) throw Error('Reset observation requires a spawned player and actual vehicle');
  const vehicleId = initial.vehicles[0].id;
  const epoch = initial.epoch, playerId = initial.self.id;
  const limitMs = 1000, tolerance = 0.5, required = ['selfPosition', 'selfHeading', 'vehicleState'];
  let startedAt = null, baseline, last = null, timer = null, sampleCount = 0, result = null, resolve;
  const completed = new Promise(r => { resolve = r; });
  const deepFreeze = value => {
    if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
    return value;
  };
  const finish = (passed, reason, elapsedMs) => {
    if (result) return;
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey, true);
    result = deepFreeze({ passed, reason, limitMs, tolerance, vehicleId, epoch, playerId, startedAt, elapsedMs, baseline, last, sampleCount });
    resolve(result);
  };
  const sample = () => {
    if (result) return;
    try {
      const state = window.__poc;
      const elapsedMs = performance.now() - startedAt;
      if (state.epoch !== epoch || state.self.id !== playerId || !state.self.spawned)
        return finish(false, 'session-changed', elapsedMs);
      const vehicle = state.vehicles.find(v => v.id === vehicleId);
      // vehicleState includes ordinary sync; it is not an exact RPC159/160 fence.
      const counters = Object.fromEntries(required.map(name => [name, state.received[name] ?? 0]));
      const fresh = required.every(name => counters[name] > baseline[name]);
      const distance = vehicle ? Math.hypot(vehicle.position[0], vehicle.position[1] - 6, vehicle.position[2] - 10) : null;
      last = { elapsedMs, counters, fresh, mode: state.self.mode, selfPosition: [...state.self.position], vehiclePosition: vehicle ? [...vehicle.position] : null, distance };
      sampleCount++;
      // Check actual observation time first, including a delayed timer/getter.
      // A correction observed after the deadline can never become a pass.
      if (elapsedMs > limitMs) return finish(false, 'deadline', elapsedMs);
      if (fresh && state.self.mode === 'onFoot' && distance !== null && distance < tolerance)
        return finish(true, 'fresh-correction-within-deadline', elapsedMs);
      if (elapsedMs >= limitMs) return finish(false, 'deadline', elapsedMs);
      timer = setTimeout(sample, Math.min(16, limitMs - elapsedMs));
    } catch (error) {
      finish(false, `observer-error: ${String(error)}`, performance.now() - startedAt);
    }
  };
  function onKey(event) {
    if (event.target !== input || event.code !== 'Enter' || event.repeat || !event.isTrusted || input.value.trim() !== '/reset' || startedAt !== null) return;
    // Capture before the normal submit handler. Do not dispatch/prevent input.
    startedAt = performance.now();
    try {
      const state = window.__poc;
      if (state.epoch !== epoch || state.self.id !== playerId || !state.self.spawned)
        return finish(false, 'session-changed', 0);
      baseline = Object.fromEntries(required.map(name => [name, state.received[name] ?? 0]));
      window.removeEventListener('keydown', onKey, true);
      timer = setTimeout(sample, 0);
    } catch (error) {
      finish(false, `observer-error: ${String(error)}`, performance.now() - startedAt);
    }
  }
  Object.defineProperty(window, key, { configurable: true, value: {
    completed,
    cancel() { finish(false, 'cancelled', startedAt === null ? null : performance.now() - startedAt); },
  } });
  window.addEventListener('keydown', onKey, true);
  return { key, vehicleId, limitMs, tolerance };
}

export async function collectResetObservation({ key }) {
  const observation = window[key];
  if (!observation) throw Error('Reset observation missing');
  return await observation.completed;
}

export function disposeResetObservation({ key }) {
  const observation = window[key];
  if (!observation) return;
  observation.cancel();
  delete window[key];
}
