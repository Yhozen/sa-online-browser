// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';

// Opt in only for the trusted local PoC, in an isolated browser profile.
export const softwareGraphicsArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// The test runner and unchanged Linux fixture stay together. Playwright tunnels
// browser loopback requests back to that runner when the browser runs on a host.
export function acceptanceConnectOptions() {
  const wsEndpoint = process.env.POC_BROWSER_WS_ENDPOINT;
  return wsEndpoint ? { wsEndpoint, exposeNetwork: '<loopback>' } : undefined;
}

export function acceptanceLaunchOptions() {
  const remote = Boolean(acceptanceConnectOptions());
  return {
    ...(remote ? { channel: process.env.POC_BROWSER_CHANNEL || 'chrome' } : {}),
    args: [
      ...(remote ? [] : softwareGraphicsArgs),
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  };
}

// Explicit launches, such as disabled WebGL, need the same optional transport
// as Playwright's normal browser fixture. Per-call arguments replace defaults.
export async function launchAcceptanceBrowser(browserType, options) {
  const connectOptions = acceptanceConnectOptions();
  if (!connectOptions) return browserType.launch(options);
  return browserType.connect(connectOptions.wsEndpoint, {
    ...connectOptions,
    headers: {
      'x-playwright-launch-options': JSON.stringify({ ...acceptanceLaunchOptions(), ...options }),
    },
  });
}

// Playwright enables focus emulation on its own CDP session. A new public CDP
// session cannot unset that override. The optional host endpoint performs only
// that same operation for the target owned by its isolated test browser.
export async function setAcceptanceFocusEmulation(page, enabled, playwright) {
  if (!acceptanceConnectOptions()) {
    const cdp = playwright._connection.toImpl(page).delegate._mainFrameSession._client;
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled });
    return cdp;
  }
  const endpoint = new URL(acceptanceConnectOptions().wsEndpoint);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/focus-emulation`;
  endpoint.search = '';
  const cdp = await page.context().newCDPSession(page);
  try {
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetId: targetInfo.targetId, enabled }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Host focus-emulation request failed: ${response.status} ${await response.text()}`);
    return cdp;
  } catch (error) {
    await cdp.detach();
    throw error;
  }
}

export async function recordAcceptanceBrowserEnvironment(page, info) {
  const environment = {
    capturedAt: new Date().toISOString(),
    transport: acceptanceConnectOptions() ? 'remote-playwright-loopback' : 'local-playwright',
    chromium: page.context().browser().version(),
    headed: !info.project.use.headless,
    launchOptions: info.project.use.launchOptions,
    ...await page.evaluate(() => {
      const gl = document.querySelector('#viewport canvas').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        browserPlatform: navigator.platform,
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        webglVersion: gl.getParameter(gl.VERSION),
      };
    }),
  };
  mkdirSync('artifacts/verification', { recursive: true });
  writeFileSync('artifacts/verification/browser-environment.json', JSON.stringify(environment, null, 2) + '\n');
}
