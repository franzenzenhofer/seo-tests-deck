import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/* A real local site with a cookie banner (button "Accept all") covering the
   content - the deterministic counterpart of a consent-managed public site. */
const PAGE = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Consent fixture</title></head>
<body style="margin:0;font:18px sans-serif"><h1 style="padding:16px">Example article</h1><p style="padding:16px">Main content.</p>
<div id="banner" style="position:fixed;inset:auto 0 0 0;height:60vh;background:#222;color:#fff;padding:16px">We use cookies.
<button onclick="document.getElementById('banner').remove()">Accept all</button></div></body></html>`;

export interface ConsentSite {
  readonly url: string;
  close(): Promise<void>;
}

export async function startConsentSite(): Promise<ConsentSite> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
