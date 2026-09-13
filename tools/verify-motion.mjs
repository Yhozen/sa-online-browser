// SPDX-License-Identifier: GPL-3.0-or-later
// Native Chrome/CDP regression probe. Creates and closes only its own windows.
// Inputs go through the game UI; window.__poc is a read-only observation API.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const debug = process.env.POC_CHROME_DEBUG || 'http://127.0.0.1:9333';
const url = process.env.POC_URL || 'http://127.0.0.1:3000';
const dir = process.env.POC_MOTION_ARTIFACTS || '.dream-loop/motion';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
mkdirSync(dir, { recursive: true });

async function connect(address) {
  const socket = new WebSocket(address);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  };
  return {
    errors,
    send(method, params = {}, timeoutMs = 45000) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

const version = await (await fetch(`${debug}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);
const owned = [], records = { at: new Date().toISOString(), chrome: version.Browser, complete: false };

async function newPlayer(name) {
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank', newWindow: true, width: 1280, height: 807,
  });
  const target = { id: targetId };
  owned.push(target);
  console.log('Opening native motion window:', targetId);
  const pages = await (await fetch(`${debug}/json/list`)).json();
  const cdp = await connect(pages.find(page => page.id === targetId).webSocketDebuggerUrl);
  target.cdp = cdp;
  const evaluate = async expression => {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const wait = async (expression, timeout = 180000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw Error(`Timed out waiting for ${expression}: ${await evaluate('document.body.innerText.slice(0,500)')}`);
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('poc-quality','low')`,
  });
  await cdp.send('Page.navigate', { url });
  await wait('window.__poc?.scene.ready && !document.querySelector("#join").disabled');
  await evaluate(`document.querySelector('#nickname').value=${JSON.stringify(name)};document.querySelector('#join').click()`);
  await wait('window.__poc?.self.spawned');
  console.log('Joined:', name);
  await evaluate(`document.querySelector('#viewport canvas').focus()`);
  await sleep(1000);
  const key = async (letter, held) => {
    const code = letter === ' ' ? 'Space' : `Key${letter.toUpperCase()}`;
    await cdp.send('Input.dispatchKeyEvent', {
      type: held ? 'keyDown' : 'keyUp', key: letter, code,
      windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
      nativeVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
    });
  };
  const command = async text => {
    await evaluate(`document.querySelector('#chat-input').value=${JSON.stringify(text)};document.querySelector('#chat-form').requestSubmit()`);
  };
  const snapshot = () => evaluate('window.__poc');
  const reset = async () => {
    const headings = (await snapshot()).received.selfHeading || 0;
    await command('/reset');
    // FinishReset emits a fresh heading correction after every player has sent
    // on-foot state. The previous parked position alone can pass too early.
    await wait(`(window.__poc.received.selfHeading||0)>${headings} && window.__poc.self.mode==='onFoot' && Math.abs(window.__poc.vehicles[0].position[1]-6)<.1`);
  };
  const sample = (milliseconds, peerId = null) => evaluate(`new Promise((resolve,reject)=>{
    const rows=[], started=performance.now(), timeout=setTimeout(()=>reject(Error('rAF sampling timeout')),${milliseconds + 15000});
    function frame(t) {
      const s=window.__poc, peerId=${JSON.stringify(peerId)},
        raw=peerId===null?s.self:s.peers.find(p=>p.id===peerId),
        presented=peerId===null?s.presentation.self:s.presentation.peers.find(p=>p.id===peerId),
        vehicle=raw?.mode!=='onFoot'?s.presentation.vehicles?.find(v=>v.id===raw.vehicleId):null;
      if(raw&&presented) rows.push({t,raw:raw.position,render:(vehicle||presented).position,
        quaternion:(vehicle||presented).quaternion,mode:raw.mode,alpha:s.presentation.simulationAlpha,
        spawned:s.self.spawned,correction:s.received.selfPosition||0,preset:s.graphics.preset,
        renderSize:s.graphics.renderSize,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]});
      if(performance.now()-started>=${milliseconds}) {clearTimeout(timeout);resolve(rows)}
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })`);
  return { ...target, evaluate, wait, key, command, snapshot, sample, reset };
}

const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
function summarize(rows, trim = 200) {
  assert.ok(rows.every(row => row.preset === 'low'), 'another controller changed the probe quality preset');
  assert.ok(rows.every(row => row.renderSize.every((size, i) => size === row.viewport[i] * row.dpr)),
    'every sampled frame must keep native viewport resolution');
  const active = rows.filter(row => row.t > rows[0].t + trim && row.t < rows.at(-1).t - 100);
  const frames = active.slice(1).map((row, i) => ({
    dt: row.t - active[i].t,
    render: distance(row.render, active[i].render),
    raw: distance(row.raw, active[i].raw),
  }));
  assert.ok(frames.length > 20, 'motion probe requires enough completed render frames');
  const speed = frames.map(frame => frame.render * 1000 / frame.dt);
  const meanSpeed = speed.reduce((sum, value) => sum + value, 0) / speed.length;
  const deviation = Math.sqrt(speed.reduce((sum, value) => sum + (value - meanSpeed) ** 2, 0) / speed.length);
  const sorted = frames.map(frame => frame.dt).sort((a, b) => a - b);
  return {
    frames: frames.length,
    medianFPS: 1000 / sorted[Math.floor(sorted.length / 2)],
    p95FrameMs: sorted[Math.floor(sorted.length * .95)],
    zeroRenderFrames: frames.filter(frame => frame.render < 1e-9).length,
    zeroSimulationFrames: frames.filter(frame => frame.raw < 1e-9).length,
    meanRenderSpeed: meanSpeed,
    speedVariationPercent: 100 * deviation / meanSpeed,
    maximumSimulationLag: Math.max(...active.map(row => distance(row.raw, row.render))),
    totalDistance: distance(active[0].render, active.at(-1).render),
  };
}

// A server seat/exit transition must discard the old on-foot jump impulse.
// Use Space/E/G/F UI input and inspect authority counters; never alter __poc.
async function verifyJumpSeatExit(player) {
  const manifest = await (await fetch(new URL('/scene', url))).json();
  const ground = manifest.groundZ + 1;
  records.jumpSeatExit = { sceneRevision: manifest.revision, ground, cases: [] };
  for (const mode of ['driver', 'passenger']) {
    await player.reset();
    const before = await player.snapshot();
    const evidence = { mode, before, samples: [] };
    records.jumpSeatExit.cases.push(evidence);
    await player.key(' ', true);
    // Observe a real rising simulation step before requesting the seat. rAF
    // avoids a coarse polling delay accidentally waiting until after landing.
    evidence.rising = await player.evaluate(`new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('No rising jump observed')),2500);
      function frame() {const s=window.__poc;
        if(s.self.mode==='onFoot' && s.self.position[2]>${ground + .04} && s.self.velocity[2]>1) {
          clearTimeout(timeout);resolve(s);
        } else requestAnimationFrame(frame);
      } requestAnimationFrame(frame);
    })`);
    await player.key(' ', false);
    const seatKey = mode === 'driver' ? 'e' : 'g';
    await player.key(seatKey, true);
    await player.key(seatKey, false);
    await player.wait(`window.__poc.self.mode===${JSON.stringify(mode)}`, 10000);
    evidence.seated = await player.snapshot();
    assert.ok((evidence.seated.received.seat || 0) > (before.received.seat || 0),
      'seat must come from an actual server RPC');
    assert.ok(evidence.seated.controlRevision > before.controlRevision,
      'seat must advance server control authority');
    assert.equal(evidence.seated.received.selfPosition, before.received.selfPosition,
      'a separate teleport correction would mask the retained-jump regression');
    assert.equal(evidence.seated.presentation.self.animation, 'seated');
    if (mode === 'driver') {
      await player.key('w', true);
      await sleep(550);
      await player.key('w', false);
    }
    // Longer than a complete normal jump: an on-foot impulse must not resume
    // even after a sustained seated interval (with and without driving).
    await sleep(1500);
    evidence.beforeExit = await player.snapshot();
    evidence.seatedDistance = distance(evidence.seated.self.position, evidence.beforeExit.self.position);
    if (mode === 'driver') assert.ok(evidence.seatedDistance > 1, 'drive input must move the actual car');
    else assert.ok(evidence.seatedDistance < .01, 'stationary passenger must stay in the parked car');
    const capture = player.evaluate(`new Promise((resolve,reject)=>{
      const rows=[],start=performance.now(),timeout=setTimeout(()=>reject(Error('Exit sampling timeout')),15000);
      function frame(t) {const s=window.__poc; rows.push({t,mode:s.self.mode,
        position:s.self.position,velocity:s.self.velocity,keys:s.self.keys,
        animation:s.presentation.self.animation,controlRevision:s.controlRevision,
        seat:s.received.seat||0,exitVehicle:s.received.exitVehicle||0,
        selfPosition:s.received.selfPosition||0});
        if(performance.now()-start>1500) {clearTimeout(timeout);resolve(rows)}
        else requestAnimationFrame(frame);
      } requestAnimationFrame(frame);
    })`);
    await player.key('f', true);
    await player.key('f', false);
    evidence.samples = await capture;
    evidence.afterExit = await player.snapshot();
    const exited = evidence.samples.filter(row => row.mode === 'onFoot' &&
      row.exitVehicle > (evidence.beforeExit.received.exitVehicle || 0));
    assert.ok(exited.length > 30, 'exit trace must observe enough frames after the actual server exit RPC');
    assert.ok(exited.every(row => row.controlRevision > evidence.beforeExit.controlRevision),
      'exit must advance server control authority');
    assert.ok(exited.every(row => row.selfPosition === (before.received.selfPosition || 0)),
      'a separate position correction must not mask the post-exit simulation');
    assert.ok(exited.every(row => (row.keys & 128) === 0), 'Space must remain released after exit');
    const exit = exited[0].position;
    assert.ok(Math.abs(exit[0]) < manifest.halfSize && Math.abs(exit[1]) < manifest.halfSize,
      'server-triggered exit must remain inside the playable world');
    // Independent circle-versus-rectangle distance, using the actual fixture
    // barriers rather than calling the runtime exit/collision implementation.
    evidence.minimumBarrierGap = Math.min(...manifest.barriers.map(barrier => {
      const dx = Math.max(0, Math.abs(exit[0] - barrier.position[0]) - barrier.size[0] / 2);
      const dy = Math.max(0, Math.abs(exit[1] - barrier.position[1]) - barrier.size[1] / 2);
      return Math.hypot(dx, dy) - .36;
    }));
    assert.ok(evidence.minimumBarrierGap >= 0, 'exit must clear actual fixture obstacles by the player radius');
    assert.ok(distance(exit.slice(0, 2), evidence.beforeExit.self.position.slice(0, 2)) >= 1.8,
      'exit must move the player outside the car cabin');
    evidence.maximumUncommandedHeight = Math.max(...exited.map(row => row.position[2] - ground));
    evidence.maximumUpwardVelocity = Math.max(...exited.map(row => row.velocity[2]));
    console.log('Jump/seat/exit:', JSON.stringify({mode,
      risingVelocity:evidence.rising.self.velocity[2], seatedDistance:evidence.seatedDistance,
      maximumUncommandedHeight:evidence.maximumUncommandedHeight,
      maximumUpwardVelocity:evidence.maximumUpwardVelocity,
      minimumBarrierGap:evidence.minimumBarrierGap}));
    assert.ok(evidence.maximumUncommandedHeight <= .025 && evidence.maximumUpwardVelocity <= .05,
      `${mode} exit must not resume the pre-seat jump without fresh Space input`);
    assert.equal(evidence.afterExit.presentation.self.animation, 'idle');
  }
  await player.reset();
}

try {
  const a = await newPlayer(`MotionA${Date.now() % 100000}`);
  const initial = await a.snapshot();
  records.nativeViewport = await a.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  records.renderSize = initial.graphics.renderSize;
  assert.deepEqual(records.renderSize, [records.nativeViewport.width * records.nativeViewport.dpr, records.nativeViewport.height * records.nativeViewport.dpr]);
  await verifyJumpSeatExit(a);
  if (process.env.POC_MOTION_CASE !== 'jump-seat-exit') {
    await a.key('w', true);
    const walk = await a.sample(3000);
    await a.key('w', false);
    records.walk = { ...summarize(walk), samples: walk };
    assert.ok(records.walk.totalDistance > 8, 'walking must travel through the real simulation');
    assert.ok(records.walk.maximumSimulationLag < .168,
      'presentation may use one older tick when the publish timer leads the display timestamp');
    assert.ok(records.walk.zeroRenderFrames / records.walk.frames < .04, 'walking must not repeat every other display frame');
    console.log('Local walking:', JSON.stringify(summarize(walk)));

    const beforeTeleport = await a.snapshot();
    const teleportCapture = a.sample(5000);
    await sleep(100);
    await a.command('/teleport');
    const teleports = await teleportCapture;
    records.afterTeleport = await a.snapshot();
    const corrected = teleports.filter(row => row.correction > (beforeTeleport.received.selfPosition || 0));
    assert.ok(corrected.length, 'teleport command must produce a real server correction');
    assert.ok(corrected.every(row => distance(row.raw, row.render) < 1e-7), 'teleport must cut immediately without interpolating the old location');
    records.teleport = { samples: teleports, firstCorrected: corrected[0] };

    await a.reset();
    await a.command('/drive');
    await a.wait('window.__poc.self.mode==="driver"');
    await a.key('w', true);
    const driving = await a.sample(2000);
    await a.key('w', false);
    records.driving = { ...summarize(driving), samples: driving };
    assert.ok(records.driving.totalDistance > 3, 'driving must move the actual vehicle');
    assert.ok(records.driving.zeroRenderFrames / records.driving.frames < .04, 'driven vehicle must fill display frames');
    console.log('Local driving:', JSON.stringify(summarize(driving)));
    await a.key('w', true);
    await a.key('a', true);
    const steering = await a.sample(800);
    await a.key('a', false);
    await a.key('w', false);
    const rotationDistance = (qa, qb) => 2 * Math.acos(Math.min(1, Math.abs(qa.reduce((sum, value, i) => sum + value * qb[i], 0))));
    records.steering = {
      samples: steering,
      totalRotation: rotationDistance(steering[0].quaternion, steering.at(-1).quaternion),
    };
    assert.ok(records.steering.totalRotation > .3, 'real steering must rotate the presented vehicle');
    for (let i = 1; i < steering.length; i++) {
      const radians = rotationDistance(steering[i - 1].quaternion, steering[i].quaternion);
      assert.ok(radians <= 1.46 * (steering[i].t - steering[i - 1].t) / 1000 + .002,
        'rendered steering must respect simulation angular speed between display frames');
    }
    await a.reset();

    const b = await newPlayer(`MotionB${Date.now() % 100000}`);
    records.remoteNativeViewport = await b.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    const aid = (await a.snapshot()).self.id;
    await b.wait(`window.__poc.peers.some(p=>p.id===${aid})`);
    await a.key('w', true);
    const [local, remote] = await Promise.all([a.sample(3000), b.sample(3000, aid)]);
    await a.key('w', false);
    records.twoPlayer = { local: summarize(local), remote: summarize(remote), localSamples: local, remoteSamples: remote };
    console.log('Two-player:', JSON.stringify({ local: records.twoPlayer.local, remote: records.twoPlayer.remote }));
    await sleep(500);
    const [localState, remoteState] = await Promise.all([a.snapshot(), b.snapshot()]);
    records.networkAgreement = distance(localState.self.position, remoteState.peers.find(peer => peer.id === aid).position);
    assert.ok(records.networkAgreement < .5, 'remote state must agree after real network replication');
    await a.reset();
    await a.command('/drive');
    await a.wait('window.__poc.self.mode==="driver"');
    await b.command('/passenger');
    await b.wait('window.__poc.self.mode==="passenger"');
    await a.key('w', true);
    const [driverRows, passengerRows] = await Promise.all([a.sample(2000), b.sample(2000)]);
    await a.key('w', false);
    records.occupants = { driver: summarize(driverRows), passenger: summarize(passengerRows), driverRows, passengerRows };
    const occupants = await b.snapshot();
    assert.equal(occupants.presentation.self.animation, 'seated');
    assert.ok(occupants.presentation.peers.some(peer => peer.id === aid && peer.animation === 'seated'));
    await sleep(2000);
    const settled = await a.snapshot();
    await b.key('w', true);
    await sleep(600);
    await b.key('w', false);
    assert.ok(distance(settled.self.position, (await a.snapshot()).self.position) < .2,
      'passenger input must not move the driver-controlled vehicle');
    await a.command('/exit');
    await b.command('/exit');
    await Promise.all([a.wait('window.__poc.self.mode==="onFoot"'), b.wait('window.__poc.self.mode==="onFoot"')]);
    await sleep(300);
    const exited = await b.snapshot();
    assert.ok(distance(exited.vehicles[0].position, exited.presentation.vehicles[0].position) < .01,
      'an unoccupied car must stop extrapolating its former driver velocity');
  }
  records.errors = owned.flatMap(target => target.cdp?.errors || []);
  assert.deepEqual(records.errors, []);
  records.complete = true;
} finally {
  writeFileSync(`${dir}/verification.json`, JSON.stringify(records, null, 2));
  for (const target of owned) {
    target.cdp?.close();
    await browser.send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  }
  browser.close();
}
