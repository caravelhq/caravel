// Test server for caravel-vue app — serves app-dist with minimal routing
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const APP_DIST = new URL("./app-dist", import.meta.url);
const PORT = 4633;
const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const DAEMON_BASE = "http://127.0.0.1:4632";

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Stub /api/state so dock shows test-server as the "daemon"
    if (url.pathname === "/api/state") {
      const now = Date.now();
      const stub = {
        daemon: { running: true, pid: 0, startedAt: now - 60000, uptimeMs: 60000 },
        tasksActive: 0,
        heartbeat: { enabled: false, intervalMinutes: 60, nextAt: null, nextInMs: null },
        jobs: [],
        security: { enableApiKey: false, apiKey: "" },
        telegram: { configured: false, allowedUserCount: 0 },
        discord: { configured: false, allowedUserCount: 0 },
        session: null,
        web: { port: 4633, enabled: true },
      };
      return new Response(JSON.stringify(stub), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Proxy all other /api/* to the live daemon so tests get real data
    if (url.pathname.startsWith("/api/")) {
      try {
        const target = DAEMON_BASE + url.pathname + url.search;
        const proxyRes = await fetch(target, {
          method: req.method,
          headers: req.headers,
          body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
        });
        const body = await proxyRes.arrayBuffer();
        const headers = new Headers(proxyRes.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(body, { status: proxyRes.status, headers });
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "daemon unreachable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Route everything to index.html for SPA routing (except explicit files)
    let pathname = url.pathname;

    // Serve explicit static files from app-dist
    if (pathname.startsWith("/app.") || pathname.startsWith("/icon.") || pathname.startsWith("/manifest.")) {
      const filePath = join(APP_DIST.pathname, pathname.slice(1));
      if (existsSync(filePath)) {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(content, { headers: { "Content-Type": contentType } });
      }
    }

    // Service worker
    if (pathname === "/sw.js") {
      const sw = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});`;
      return new Response(sw, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }

    // For any other route, serve index.html (Vue Router will handle it)
    const indexPath = join(APP_DIST.pathname, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Fallback: serve app.html template if index.html doesn't exist (test scenario)
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Caravel</title>
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
</head>
<body>
  <div id="app"></div>
  <link rel="stylesheet" href="/app.css" />
  <script type="module" src="/app.js"></script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log(`Test server listening on http://127.0.0.1:${PORT}`);
