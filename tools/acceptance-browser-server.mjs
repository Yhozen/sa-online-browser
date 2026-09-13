// SPDX-License-Identifier: GPL-3.0-or-later
// Native browser host for a container running the pinned acceptance tests.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("playwright-core/package.json");
if (require(packagePath).version !== "1.59.1")
  throw Error("The acceptance focus adapter requires Playwright 1.59.1.");
const { PlaywrightServer } = require(join(dirname(packagePath), "lib/remote/playwrightServer.js"));
const port = Number(process.env.POC_BROWSER_PORT || 9344);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("POC_BROWSER_PORT must be an unprivileged TCP port.");
const path = "/sa-online-acceptance";
const server = new PlaywrightServer({ mode: "default", path, maxConnections: 4 });
const originalUpgrade = server._wsServer._delegate.onUpgrade;
server._wsServer._delegate.onUpgrade = (request, socket) => request.headers.origin
  ? { error: `HTTP/${request.httpVersion} 403 Forbidden\r\n\r\n` }
  : originalUpgrade(request, socket);

// Playwright forces focus on its own CDP session. Its existing local test
// adapter must execute on this host when tests use a remote browser. Expose
// only that operation, only for pages owned by this isolated server. The test
// still switches actual Chrome tabs and observes the real visibility event.
const originalRequest = server._wsServer._delegate.onRequest;
server._wsServer._delegate.onRequest = async (request, response) => {
  if (request.url !== `${path}/focus-emulation`)
    return originalRequest(request, response);
  const reply = (status, value) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
  };
  if (request.method !== "POST" || request.headers.origin)
    return reply(403, { error: "Only the local test runner may use this adapter." });
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024) return reply(413, { error: "Request is too large." });
    }
    const { targetId, enabled } = JSON.parse(body);
    if (typeof targetId !== "string" || !/^[a-f0-9]{32}$/i.test(targetId) || typeof enabled !== "boolean")
      return reply(400, { error: "Expected a targetId and boolean enabled." });
    const page = server._playwright.allBrowsers()
      .flatMap(browser => browser.contexts())
      .flatMap(context => context.pages())
      .find(page => page.delegate._targetId === targetId);
    if (!page) return reply(404, { error: "Target is not owned by this test server." });
    await page.delegate._mainFrameSession._client.send("Emulation.setFocusEmulationEnabled", { enabled });
    reply(200, { targetId, enabled });
  } catch (error) {
    reply(400, { error: error.message });
  }
};

console.log(`Acceptance browser listening on ${await server.listen(port, "127.0.0.1")}`);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await Promise.all(server._playwright.allBrowsers().map(browser =>
    browser.close({ reason: "Acceptance browser host stopped" })));
  await server.close();
  process.exit(0);
});
