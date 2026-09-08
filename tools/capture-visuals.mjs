// SPDX-License-Identifier: GPL-3.0-or-later
// Real input and ordinary player connections only; no renderer or gameplay injection.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { softwareGraphicsArgs } from './browser-options.mjs';
const dir=process.env.POC_VISUAL_ARTIFACTS || '.dream-loop/current';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/usr/bin/google-chrome',env:{...process.env,DISPLAY:process.env.DISPLAY || ':1'},args:[...softwareGraphicsArgs,'--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const errors=[],records=[];
try {
  const context=await browser.newContext({viewport:{width:1672,height:941}});
  const reserve=await browser.newPage({viewport:{width:640,height:360}});
  await reserve.addInitScript(()=>localStorage.setItem('poc-quality','low'));
  await reserve.goto('http://127.0.0.1:3000');
  await reserve.getByTestId('nickname').fill('DreamReference');
  await reserve.getByTestId('join').click({timeout:60000});
  await reserve.waitForFunction(()=>window.__poc.self.spawned);
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByTestId('join').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__poc?.scene.ready,{},{timeout:60000});
  await page.locator('#quality').selectOption('standard');
  await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/entry.png`});
  await page.getByTestId('nickname').fill('DreamPlayer');await page.getByTestId('join').click();
  await page.waitForFunction(()=>window.__poc.self.spawned);
  await reserve.close();
  await page.locator('#chat-toggle').click();
  async function capture(name){await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/${name}.png`});records.push({name,state:await page.evaluate(()=>window.__poc)});}
  await capture('pedestrian');
  await page.locator('#viewport canvas').focus();await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__poc.self.mode==='driver');await capture('driving');
  await page.mouse.move(836,470);await page.mouse.down({button:'right'});await page.mouse.move(1101,500,{steps:12});await page.mouse.up({button:'right'});await capture('street');
  await page.locator('#quality').selectOption('low');await capture('low');
  await page.getByTestId('disconnect').click();
  await context.tracing.stop({path:`${dir}/trace.zip`});
  writeFileSync(`${dir}/observations.json`,JSON.stringify({at:new Date().toISOString(),browser:browser.version(),errors,records},null,2));
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
