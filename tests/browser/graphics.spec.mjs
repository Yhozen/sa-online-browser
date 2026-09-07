// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect, chromium } from '@playwright/test';
import { createGateway } from '../../services/gateway/server.mjs';

const url = 'http://127.0.0.1:3100';
let gateway;
test.beforeAll(async () => {
    gateway = createGateway({ port: 3100 });
    await gateway.start();
});
test.afterAll(async () => { await gateway?.close(); });

test('graphics: software WebGL starts the playground', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await expect(page.getByTestId('join')).toBeEnabled();
    await expect(page.locator('#viewport canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__poc?.status)).toBe('Not connected');
    expect(errors).toEqual([]);
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
    await expect(page.getByTestId('join')).toBeEnabled();
    await expect(page.locator('#viewport canvas')).toBeVisible();
    expect(errors).toEqual([]);
});
