// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect, chromium } from '@playwright/test';
import { createGateway } from '../../services/gateway/server.mjs';

const url = 'http://127.0.0.1:3100';
let gateway, neighborhoodGateway;
test.beforeAll(async () => {
    gateway = createGateway({ port: 3100, sceneId:'yard' });
    await gateway.start();
    neighborhoodGateway = createGateway({port:3101,sceneId:"neighborhood"});
    await neighborhoodGateway.start();
});
test.afterAll(async () => { await Promise.all([gateway?.close(),neighborhoodGateway?.close()]); });

test('graphics: software WebGL starts the playground', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await expect(page.getByTestId('join')).toBeEnabled({timeout:60000});
    await expect(page.locator('#viewport canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__poc?.status)).toBe('Not connected');
    expect(await page.evaluate(() => window.__poc.graphics.preset)).toBe('standard');
    await page.locator('#quality').selectOption('low');
    await page.reload();
    await expect(page.getByTestId('join')).toBeEnabled({timeout:60000});
    expect(await page.evaluate(() => window.__poc.graphics.preset)).toBe('low');
    expect(errors).toEqual([]);
});

test('graphics: both presets preserve native screen resolution after resize and reload', async ({ browser }) => {
    test.setTimeout(360000);
    for (const url of ['http://127.0.0.1:3100','http://127.0.0.1:3101'])
    for (const deviceScaleFactor of [1, 2]) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor });
        try {
            const page = await context.newPage();
            await page.goto(url);
            await expect(page.getByTestId('join')).toBeEnabled({timeout:60000});
            async function nativeResolution() {
                await expect.poll(() => page.evaluate(() => {
                    const canvas = document.querySelector('#viewport canvas');
                    const gl = canvas.getContext('webgl2');
                    const width = Math.floor(innerWidth * devicePixelRatio);
                    const height = Math.floor(innerHeight * devicePixelRatio);
                    const radar = document.querySelector('#minimap');
                    return {
                        viewport: [canvas.width - width, canvas.height - height,
                            gl.drawingBufferWidth - width, gl.drawingBufferHeight - height],
                        radar: [radar.width - Math.floor(radar.clientWidth * devicePixelRatio),
                            radar.height - Math.floor(radar.clientHeight * devicePixelRatio)],
                    };
                }), {
                    // Native DPR2 software frames can block a single observation for
                    // 8–10 seconds; allow rendering readiness without changing pixels
                    // or the separate one-second multiplayer agreement requirement.
                    timeout:60000,
                    message: `${url} at DPR ${deviceScaleFactor}: drawing buffers must match CSS pixels × DPR`,
                })
                    .toEqual({viewport:[0,0,0,0],radar:[0,0]});
            }
            for (const preset of ['low', 'standard', 'low']) {
                await page.locator('#quality').selectOption(preset);
                await nativeResolution();
                await page.setViewportSize({ width: 800, height: 450 });
                await nativeResolution();
                await page.setViewportSize({ width: 640, height: 360 });
            }
            await page.reload();
            await expect(page.getByTestId('join')).toBeEnabled({timeout:60000});
            await nativeResolution();
        } finally { await context.close(); }
    }
});

test('graphics: disabled WebGL shows recovery without starting a session', async ({}, info) => {
    // Real browser-level failure, independent of the normal SwiftShader config.
    const browser = await chromium.launch({ headless: info.project.use.headless, args: ['--disable-webgl'] });
    try {
        const page = await browser.newPage();
        const errors = [], sockets = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('websocket', socket => sockets.push(socket.url()));
        await page.goto(url);
        await expect(page.getByRole('heading', { name: '3D graphics are unavailable' })).toBeVisible();
        await expect(page.getByRole('alert')).toContainText('npm run open:poc');
        await expect(page.getByTestId('join')).toHaveCount(0);
        await expect(page.locator('canvas')).toHaveCount(0);
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        expect(await page.evaluate(() => window.__poc)).toBeUndefined();
        await page.screenshot({ path: info.outputPath('webgl-unavailable.png') });
        expect(sockets).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await browser.close(); }
});

test('graphics: context exceptions are handled and retry can recover', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        if (sessionStorage.getItem('graphics-attempted')) return;
        sessionStorage.setItem('graphics-attempted', '1');
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === 'webgl2') throw new Error('Test context creation failure');
            return original.call(this, type, ...args);
        };
    });
    await page.goto(url);
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByText('Graphics details', { exact: true }).click();
    await expect(page.locator('#graphics-details')).toHaveText('Test context creation failure');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('join')).toBeEnabled({timeout:60000});
    await expect(page.locator('#viewport canvas')).toBeVisible();
    expect(errors).toEqual([]);
});
