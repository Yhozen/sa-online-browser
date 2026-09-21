// SPDX-License-Identifier: GPL-3.0-or-later
// A real Web Audio test on an isolated HTTP port. This does not need open.mp or
// alter any browser gameplay state; the page exercises the presentation API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import playwright from 'playwright';

const html = `<!doctype html><meta charset="utf-8"><title>Arroyo original audio verification</title>
<style>body{font:18px sans-serif;background:#17242c;color:#f2e9d5;padding:30px}button{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap}</style>
<h1>Arroyo audio verification</h1><p>This isolated page plays the committed original game sounds through the actual browser AudioContext.</p>
<button id="unlock">Enable sound / retry</button><button id="drive">Drive</button><button id="mute">Toggle mute</button><button id="finish">Finish cue</button><button id="disconnect">Disconnect</button><button id="dispose">Dispose</button>
<pre id="status"></pre>
<script type="module">
import {createGameAudio} from '/audio-module.js';
const OriginalAudioContext=window.AudioContext;
window.contexts=[];
window.AudioContext=class extends OriginalAudioContext { constructor(options){super(options);window.contexts.push(this);this.probe=this.createAnalyser();this.probe.fftSize=2048;this.channels=this.createChannelSplitter(2);this.left=this.createAnalyser();this.right=this.createAnalyser();this.left.fftSize=this.right.fftSize=2048;this.channels.connect(this.left,0);this.channels.connect(this.right,1);} };
const connect=AudioNode.prototype.connect;
AudioNode.prototype.connect=function(target,...rest){const result=connect.call(this,target,...rest);if(this instanceof DynamicsCompressorNode&&target===this.context.destination){connect.call(this,this.context.probe);connect.call(this,this.context.channels);}return result;};
window.sound=createGameAudio({onChange:()=>document.querySelector('#status').textContent=JSON.stringify(sound.status,null,2)});
window.frame={connected:false,groundZ:9,listener:{position:[0,0,10],forward:[0,1,0],up:[0,0,1]},self:{id:0,mode:'driver',vehicleId:1,keys:8,position:[0,0,10],velocity:[0,10,0]},vehicles:[{id:1,occupied:true,position:[6,6,10],velocity:[0,10,0]}],peers:[]};
window.tick=setInterval(()=>sound.update(frame),100);
document.querySelector('#unlock').onclick=()=>sound.unlock();
document.querySelector('#drive').onclick=()=>{frame.connected=true;sound.update(frame)};
document.querySelector('#mute').onclick=()=>sound.setMuted(!sound.preferences.muted);
document.querySelector('#finish').onclick=()=>sound.cue('finish');
document.querySelector('#disconnect').onclick=()=>{frame.connected=false;sound.update(frame)};
document.querySelector('#dispose').onclick=()=>{clearInterval(tick);sound.dispose()};
window.measure=async()=>{let total=0,left=0,right=0,peak=0;const samples=15,data=new Float32Array(2048);for(let n=0;n<samples;n++){for(const [key,probe]of [['total',contexts[0].probe],['left',contexts[0].left],['right',contexts[0].right]]){probe.getFloatTimeDomainData(data);let energy=0;for(const value of data){energy+=value*value;peak=Math.max(peak,Math.abs(value))}if(key==='total')total+=energy/data.length;else if(key==='left')left+=energy/data.length;else right+=energy/data.length;}await new Promise(resolve=>setTimeout(resolve,20));}return {rms:Math.sqrt(total/samples),left:Math.sqrt(left/samples),right:Math.sqrt(right/samples),peak}};
window.ready=true;
</script>`;

test('real Chromium decodes original sounds, spatializes engines, respects mute, retries failures and releases audio', { timeout: 90000 }, async () => {
  const transformed = ts.transpileModule(readFileSync('apps/browser/src/audio.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const server = createServer((request, response) => {
    if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return; }
    if (request.url === '/audio-module.js') { response.writeHead(200, { 'content-type': 'application/javascript' }); response.end(transformed.outputText); return; }
    if (/^\/audio\/[a-z-]+\.(json|wav)$/.test(request.url ?? '')) {
      try { const bytes = readFileSync(`apps/browser/public${request.url}`); response.writeHead(200, { 'content-type': request.url.endsWith('.wav') ? 'audio/wav' : 'application/json', 'content-length': bytes.length }); response.end(bytes); return; } catch { /* 404 below. */ }
    }
    response.writeHead(404); response.end('Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const artifacts = 'artifacts/audio'; mkdirSync(artifacts, { recursive: true });
  const errors = [], observations = { renderer: 'Chromium Web Audio; no GPU required', errors };
  try {
    browser = await chromium.launch({ headless: process.env.POC_HEADLESS !== '0', args: ['--autoplay-policy=user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await page.waitForFunction(() => window.ready);
    assert.equal(await page.evaluate(() => contexts.length), 0, 'entry must not create or autoplay an audio context');
    await page.click('#unlock');
    await page.waitForFunction(() => sound.status.state === 'running');
    assert.equal(await page.evaluate(() => sound.status.assetsLoaded), 16);
    assert.equal(await page.evaluate(() => contexts.length), 1);
    await page.click('#drive');
    await page.waitForFunction(() => sound.status.engines === 1);
    await page.waitForTimeout(600);
    observations.driving = await page.evaluate(() => measure());
    assert.ok(observations.driving.rms > .004 && observations.driving.peak < .9, JSON.stringify(observations.driving));
    assert.ok(observations.driving.right > observations.driving.left * 1.08, 'right-side engine must have greater right-channel energy');
    // Moving the actual sound source across the listener must reverse the stereo result.
    await page.evaluate(() => { frame.vehicles[0].position = [-6, 6, 10]; });
    await page.waitForTimeout(600);
    observations.left = await page.evaluate(() => measure());
    assert.ok(observations.left.left > observations.left.right * 1.08, 'left-side engine must have greater left-channel energy');
    await page.click('#mute'); await page.waitForTimeout(700);
    observations.muted = await page.evaluate(() => measure());
    assert.ok(observations.muted.rms < .00001, 'mute must silence actual rendered PCM');
    await page.reload(); await page.waitForFunction(() => window.ready);
    assert.equal(await page.evaluate(() => sound.preferences.muted), true);
    await page.click('#unlock'); await page.waitForFunction(() => sound.status.state === 'running');
    await page.click('#drive'); await page.click('#mute');
    await page.evaluate(() => sound.setVolume(.23));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arroyo-audio-v1')).volume), .23);
    await page.click('#finish');
    assert.ok(await page.evaluate(() => sound.status.effects >= 1));
    await page.click('#disconnect');
    assert.deepEqual(await page.evaluate(() => ({ engines: sound.status.engines, effects: sound.status.effects })), { engines: 0, effects: 0 });
    await page.waitForTimeout(500);
    observations.disconnected = await page.evaluate(() => measure());
    assert.ok(observations.disconnected.rms < .00001);
    // Repeat a larger world snapshot to exercise the actual voice allocation cap.
    await page.evaluate(() => {
      frame.vehicles = Array.from({ length: 32 }, (_, id) => ({ id, occupied: true, position: [id + 1, 2, 10], velocity: [0, 10, 0] }));
      frame.connected = true; sound.update(frame);
    });
    await page.waitForFunction(() => sound.status.engines === 8);
    observations.bounds = await page.evaluate(() => sound.status);
    if (process.env.POC_HEADLESS === '0') {
      // Remove Playwright's test-only always-focused override, then switch actual
      // Chrome tabs. Use the existing pinned test adapter, never injected app or
      // document visibility state (a separate CDP session cannot remove it).
      // Headless Chromium does not hide this audible tab when another activates.
      const cdp = playwright._connection.toImpl(page).delegate._mainFrameSession._client;
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      const { targetInfo } = await cdp.send('Target.getTargetInfo');
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: targetInfo.browserContextId, newWindow: false, background: false, forTab: true });
      await cdp.send('Target.activateTarget', { targetId });
      await page.waitForFunction(() => document.hidden && sound.status.state === 'suspended', null, { polling: 100 });
      observations.hidden = await page.evaluate(() => ({ hidden: document.hidden, ...sound.status }));
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
      await page.waitForTimeout(150);
      await cdp.send('Page.setWebLifecycleState', { state: 'active' });
      await cdp.send('Target.closeTarget', { targetId }); await page.bringToFront();
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await page.waitForFunction(() => sound.status.state === 'suspended');
      assert.equal(await page.evaluate(() => sound.status.engines), 0);
      observations.suspended = await page.evaluate(() => sound.status);
      await page.click('#unlock'); await page.waitForFunction(() => sound.status.state === 'running' && sound.status.engines === 8);
    } else observations.tabVisibility = 'Requires the separate headed Chromium run.';
    // An integration stall independently stops loops, even with a visible tab.
    await page.evaluate(() => clearInterval(tick));
    await page.waitForFunction(() => sound.status.engines === 0, null, { timeout: 4000 });
    observations.watchdog = await page.evaluate(() => sound.status);
    await page.evaluate(() => { window.tick = setInterval(() => sound.update(frame), 100); });
    await page.waitForFunction(() => sound.status.engines === 8);
    await page.click('#dispose');
    assert.deepEqual(await page.evaluate(() => ({ state: sound.status.state, engines: sound.status.engines, effects: sound.status.effects, assets: sound.status.assetsLoaded })), { state: 'disposed', engines: 0, effects: 0, assets: 0 });
    await page.waitForFunction(() => contexts[0].state === 'closed');
    // A modified committed asset fails verification and can be retried without
    // throwing into the game or creating another AudioContext.
    await page.route('**/audio/engine-idle.wav', route => {
      const bytes = readFileSync('apps/browser/public/audio/engine-idle.wav'); bytes[bytes.length - 9] ^= 1;
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: bytes });
    });
    await page.reload(); await page.waitForFunction(() => window.ready);
    await page.click('#unlock'); await page.waitForFunction(() => sound.status.state === 'unavailable');
    observations.failedAsset = await page.evaluate(() => sound.status);
    assert.match(observations.failedAsset.message, /Checksum mismatch/);
    assert.equal(observations.failedAsset.engines, 0);
    await page.unroute('**/audio/engine-idle.wav');
    await page.click('#unlock'); await page.waitForFunction(() => sound.status.state === 'running');
    assert.equal(await page.evaluate(() => contexts.length), 1, 'retry reuses the gesture-created audio context');
    await page.screenshot({ path: `${artifacts}/verified.png` });
    await context.tracing.stop({ path: `${artifacts}/trace.zip` });
    observations.result = 'passed';
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
    writeFileSync(`${artifacts}/observations.json`, JSON.stringify(observations, null, 2) + '\n');
  }
});
