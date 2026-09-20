// SPDX-License-Identifier: GPL-3.0-or-later
// Actual exported-asset render diagnostics, isolated from multiplayer ports.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import { softwareGraphicsArgs } from './browser-options.mjs';

const pageSource = `<!doctype html><meta charset="utf-8"><title>Arroyo coupe mechanical presentation</title>
<style>html,body{margin:0;background:#b8c7c9;overflow:hidden}#label{position:absolute;left:22px;top:18px;color:#fff;font:600 18px sans-serif;text-shadow:0 2px 3px #000;pointer-events:none}</style><div id="label">Arroyo · coupe mechanical presentation</div>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{RoomEnvironment}from'three/addons/environments/RoomEnvironment.js';import{VehiclePresentation}from'/presentation.js';import{applyQuality,disposeQualityMaterial}from'/graphics.js';
THREE.Object3D.DEFAULT_UP.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(devicePixelRatio);renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#b8c7c9');const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromScene(new RoomEnvironment(),.025);scene.environment=environment.texture;
scene.add(new THREE.HemisphereLight('#e7f2ff','#5f6455',1.2));const sun=new THREE.DirectionalLight('#fff1d6',3);sun.position.set(-4,-7,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-8;sun.shadow.camera.right=sun.shadow.camera.top=8;sun.shadow.bias=-.0002;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#727974',roughness:.95}));ground.receiveShadow=true;scene.add(ground);
const gltf=await new GLTFLoader().loadAsync('/coupe.glb');gltf.scene.rotation.x=Math.PI/2;const car=new THREE.Group();car.add(gltf.scene);car.position.z=1.005;scene.add(car);car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});let presentation=new VehiclePresentation(car,disposeQualityMaterial);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,200);camera.up.set(0,0,1);
const rotation=h=>[Math.cos(h/2),0,0,-Math.sin(h/2)];
window.captureState=async(mode,low=false)=>{presentation.dispose();presentation=new VehiclePresentation(car,disposeQualityMaterial);applyQuality(car,low);let h=0;
for(let i=0;i<120;i++){h=i/60*.65;const speed=mode==='reverse'?-3:6;presentation.advance([-Math.sin(h)*speed,Math.cos(h)*speed,0],1/60,{rotation:rotation(h),keys:mode==='brake'?32:0});}
if(mode==='steer')camera.position.set(5.8,6.2,2.9);else if(mode==='reverse')camera.position.set(1.3,-4.8,1.15);else camera.position.set(5.8,-6.2,2.5);camera.lookAt(0,mode==='reverse'?-1.8:0,mode==='reverse'?.75:1.03);document.querySelector('#label').textContent='Arroyo · '+mode+' · '+(low?'Low':'Standard')+' · actual GLB render';renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(resolve));renderer.render(scene,camera);return{state:{...presentation.state},pixelRatio:renderer.getPixelRatio(),buffer:[renderer.domElement.width,renderer.domElement.height],triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};};
window.ready=true;
</script>`;
const transform = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const presentation = transform('apps/browser/src/vehicle-presentation.ts'), graphics = transform('apps/browser/src/graphics.ts');
const threeRoot = path.resolve('node_modules/three');
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(pageSource); return; }
  if (request.url === '/presentation.js' || request.url === '/graphics.js') { response.writeHead(200, { 'content-type': 'application/javascript' }); response.end(request.url === '/presentation.js' ? presentation : graphics); return; }
  const file = request.url === '/coupe.glb' ? path.resolve('apps/browser/public/assets/coupe.glb') : request.url?.startsWith('/three/') ? path.resolve(threeRoot, request.url.slice(7)) : undefined;
  if (file && (request.url === '/coupe.glb' || file.startsWith(`${threeRoot}/`))) {
    try { response.writeHead(200, { 'content-type': file.endsWith('.glb') ? 'model/gltf-binary' : 'application/javascript' }); response.end(readFileSync(file)); return; } catch { /* 404 below. */ }
  }
  response.writeHead(404); response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser; const observations = { type: 'actual exported coupe render, isolated mechanical diagnostic; not multiplayer evidence', errors: [], captures: [] };
mkdirSync('artifacts/vehicle-presentation', { recursive: true });
try {
  browser = await chromium.launch({ headless: process.env.POC_HEADLESS !== '0', args: softwareGraphicsArgs });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.on('pageerror', error => observations.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') observations.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  for (const [mode, low] of [['steer', false], ['brake', false], ['reverse', false], ['brake', true]]) {
    const details = await page.evaluate(([mode, low]) => captureState(mode, low), [mode, low]);
    const name = `${mode}-${low ? 'low' : 'standard'}`;
    await page.screenshot({ path: `artifacts/vehicle-presentation/${name}.png` });
    observations.captures.push({ name, ...details });
  }
  if (observations.errors.length) throw Error(observations.errors.join('\n'));
  console.log('Captured four native-resolution actual coupe views; no browser/render errors.');
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  writeFileSync('artifacts/vehicle-presentation/observations.json', JSON.stringify(observations, null, 2) + '\n');
}
