// SPDX-License-Identifier: GPL-3.0-or-later
/** Fixed physics steps use elapsed active time, independently of presentation cadence. */
export class SimulationClock {
  private previous: number;
  private remainder = 0;
  constructor(now: number, private readonly step: (seconds: number) => void) {
    this.previous = now;
  }
  reset(now: number) { this.previous = now; this.remainder = 0; }
  advance(now: number): boolean {
    // rAF timestamps can precede an input/timer callback that already advanced us.
    if (now <= this.previous) return true;
    const elapsed = (now - this.previous) / 1000;
    this.previous = now;
    // A frozen process must reconnect instead of integrating unbounded stale input.
    if (elapsed > 10) { this.remainder = 0; return false; }
    this.remainder += elapsed;
    while (this.remainder + 1e-10 >= 1 / 60) {
      this.step(1 / 60);
      this.remainder -= 1 / 60;
    }
    return true;
  }
}
