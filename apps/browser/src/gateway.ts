// SPDX-License-Identifier: GPL-3.0-or-later
// Where the gateway lives.
//
// Locally and in Docker the gateway serves this page, so every gateway route is
// same-origin and needs no configuration. A CDN deployment serves only the
// static client, and the gateway runs on its own host; VITE_GATEWAY_ORIGIN
// carries that host into the bundle at build time. Static assets are always
// fetched from the page's own origin, because whoever served the page also
// served them.
const raw = String(import.meta.env.VITE_GATEWAY_ORIGIN ?? "").trim();

function parse(value: string): URL | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error(`VITE_GATEWAY_ORIGIN is not a URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw Error(`VITE_GATEWAY_ORIGIN must be http:// or https://: ${value}`);
  return url;
}

const configured = parse(raw.replace(/\/+$/, ""));

/** Empty when the gateway serves this page. */
export const gatewayOrigin = configured ? configured.origin : "";

export function gatewayUrl(path: string): string {
  return gatewayOrigin + path;
}

export function gatewaySocketUrl(): string {
  const base = configured ?? location;
  return `${base.protocol === "https:" ? "wss:" : "ws:"}//${base.host}/ws`;
}
