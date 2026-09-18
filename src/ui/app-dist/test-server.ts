// test-server.ts — minimal static server for Vue app build (WAL-85 Phase 2 tests).
//
// Serves the built app on port 4633. API requests are proxied to the live daemon
// on port 4632 so the UI tests see real data without needing the full daemon stack.
//
// Usage:
//   bun run repos/caravel/src/ui/app-dist/test-server.ts
//   node .claude/skills/ui-test/playwright/run.mjs --out /tmp/wal85-test \
//     .claude/skills/ui-test/playwright/specs/caravel-wal85-phase2-*.mjs

import { htmlPage } from "../page/html";

const PORT = 4633;
const DAEMON = "http://127.0.0.1:4632";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#1E76FE"/>
<g transform="translate(39 90) scale(6.8)" fill="none">
<path d="M31 34 V6 M48 34 V14" stroke="#eaf2ff" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
<path d="M36 25 L58 13 Q61 23 56 31 Q46 29 36 25 Z" fill="#eaf2ff" opacity="0.68"/>
<path d="M12 20 L42 4 Q49 18 40 31 Q26 27 12 20 Z" fill="#eaf2ff"/>
<path d="M6 34 H58 L52 43 Q49 45 45 45 H19 Q15 45 12 43 Z" fill="#eaf2ff"/>
</g>
</svg>`;

const SW = `self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});`;

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  fetch: async (req) => {
    const url = new URL(req.url);

    // App shell
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(htmlPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Built assets
    if (url.pathname === "/app.js") {
      const f = Bun.file(new URL("./app.js", import.meta.url));
      return new Response(f, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }
    if (url.pathname === "/app.css") {
      const f = Bun.file(new URL("./app.css", import.meta.url));
      return new Response(f, { headers: { "Content-Type": "text/css; charset=utf-8" } });
    }

    // Static resources
    if (url.pathname === "/icon.svg") return new Response(ICON_SVG, { headers: { "Content-Type": "image/svg+xml" } });
    if (url.pathname === "/sw.js") return new Response(SW, { headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" } });
    if (url.pathname === "/manifest.json") {
      return new Response(JSON.stringify({
        name: "Caravel", short_name: "Caravel", description: "Caravel Dashboard",
        start_url: "/", display: "standalone",
        background_color: "#0d1117", theme_color: "#0d1117",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Proxy everything else (API, etc.) to the live daemon
    const proxyUrl = DAEMON + url.pathname + url.search;
    try {
      const proxyReq = new Request(proxyUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
      });
      return await fetch(proxyReq);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "proxy error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});

console.log(`[test-server] Caravel Vue app test server running on http://127.0.0.1:${PORT}`);
console.log(`[test-server] Proxying API requests to ${DAEMON}`);
