// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock } from '../apps/browser/src/simulation-clock.ts';
test('five seconds of input covers the same distance through long render stalls',()=>{
  for(const cadence of [1000/144,1000/60,250,1700]) {
    let x=0,held=false,steps=0;
    const clock=new SimulationClock(0,dt=>{assert.equal(dt,1/60);if(held)x+=5*dt;steps++;});
    clock.advance(800);held=true;
    for(let now=800+cadence;now<5800;now+=cadence)clock.advance(now);
    clock.advance(5800);held=false;
    clock.advance(5700); // stale rAF must not rewind elapsed time
    clock.advance(6500);
    assert.ok(Math.abs(x-25)<1e-7,`${cadence}ms rendering: ${x}m`);
    assert.equal(steps,390);
  }
});
test('corrections reset debt and frozen clocks reject unbounded catch-up',()=>{
  let ticks=0;const clock=new SimulationClock(0,()=>ticks++);
  clock.advance(10);clock.reset(500);clock.advance(510);assert.equal(ticks,0);
  assert.equal(clock.advance(20000),false);assert.equal(ticks,0);
  assert.equal(clock.advance(20100),true);assert.equal(ticks,6);
});
