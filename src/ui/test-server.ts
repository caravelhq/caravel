// Caravel UI test server — serves THIS checkout's app bundle against the LIVE
// daemon's API, so an app-dist build can be gated without restarting the daemon.
//
//   bun run src/ui/test-server.ts [start] [--port 4633] [--daemon http://127.0.0.1:4632] [--ttl 30]
//   bun run src/ui/test-server.ts stop [--port 4633]
//
// What it serves:
//   /, /index.html, unknown paths  → htmlPage() from this checkout (same shell + inline
//                                    CSS the daemon serves — not a hand-written copy)
//   /app.js, /app.css, other files → this checkout's src/ui/app-dist/
//   everything else (/api/*, /sw.js, /icon.svg, /manifest.json) → proxied to the daemon
//
// If the daemon is unreachable, /api/* answers 503 JSON with `harness_error` set and
// the server says so loudly on stderr. It never fabricates API data: a gate that
// passes against stubbed state is as wrong as one that fails against missing state.
// (WAL-95 — R05 wrote up three "defects" measured against a server with no API.)
//
// Lifecycle — never clean this up with a `pkill -f` pattern: the daemon runs from the
// same repo path, and `pkill -f "bun run.*caravel"` killed it on 2026-09-18. Instead:
//   - `stop` kills exactly the PID in the pidfile, after checking it is a test server;
//   - the server exits on its own after --ttl minutes (default 30; 0 = never), so an
//     orphan can't hold the port indefinitely;
//   - it refuses to bind the daemon's port.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, extname, normalize } from "path";
import { htmlPage } from "./page/html";

const APP_DIST = new URL("./app-dist/", import.meta.url).pathname;
const REPO_ROOT = new URL("../../", import.meta.url).pathname;

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const command = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "start";
const PORT = Number(flag("port", process.env.CARAVEL_TEST_PORT || "4633"));
const DAEMON = flag("daemon", process.env.CARAVEL_DAEMON_URL || "http://127.0.0.1:4632").replace(/\/$/, "");
const TTL_MIN = Number(flag("ttl", "30"));
const PIDFILE = join(REPO_ROOT, `.caravel-test-server-${PORT}.pid`);

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".map": "application/json",
};

function isTestServer(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("test-server.ts");
  } catch {
    return false;
  }
}

function stop(): never {
  if (!existsSync(PIDFILE)) {
    console.log(`No test server pidfile for port ${PORT} (${PIDFILE}).`);
    process.exit(0);
  }
  const pid = Number(readFileSync(PIDFILE, "utf8").trim());
  if (!pid || !isTestServer(pid)) {
    console.log(`Stale pidfile (PID ${pid} is not a test server) — removing it, killing nothing.`);
    unlinkSync(PIDFILE);
    process.exit(0);
  }
  process.kill(pid, "SIGTERM");
  console.log(`Stopped test server PID ${pid} on :${PORT}.`);
  process.exit(0);
}

async function daemonReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${DAEMON}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function harnessError(reason: string): Response {
  const body = {
    error: `caravel test-server: ${reason}`,
    harness_error: true,
    note: "This is a test-harness failure, not an app defect. Results that depend on this response are invalid.",
  };
  return new Response(JSON.stringify(body), {
    status: 503,
    headers: { "Content-Type": "application/json", "X-Caravel-Harness": "test-server" },
  });
}

async function proxy(req: Request, url: URL): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete("host");
  try {
    const res = await fetch(`${DAEMON}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
      // @ts-expect-error Bun supports streaming request bodies
      duplex: "half",
    });
    const out = new Headers(res.headers);
    out.set("X-Caravel-Harness", "test-server; proxied");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  } catch (err) {
    console.error(`[test-server] HARNESS ERROR: ${req.method} ${url.pathname} → daemon ${DAEMON} unreachable (${(err as Error).message})`);
    return harnessError(`daemon unreachable at ${DAEMON}`);
  }
}

function serveDist(pathname: string): Response | null {
  const rel = normalize(pathname).replace(/^\/+/, "");
  if (!rel || rel.startsWith("..") || rel.endsWith(".ts")) return null;
  const filePath = join(APP_DIST, rel);
  if (!existsSync(filePath)) return null;
  const type = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  return new Response(Bun.file(filePath), { headers: { "Content-Type": type, "X-Caravel-Harness": "test-server" } });
}

function page(): Response {
  return new Response(htmlPage(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Caravel-Harness": "test-server" },
  });
}

async function start() {
  const daemonPort = Number(new URL(DAEMON).port || 80);
  if (PORT === daemonPort) {
    console.error(`Refusing to bind :${PORT} — that is the daemon's port. Pick another --port.`);
    process.exit(2);
  }

  if (!(await daemonReachable())) {
    console.error(
      `\n*** WARNING: daemon not reachable at ${DAEMON}. Every /api/* request will answer 503 ` +
        `(harness_error). Any spec that reads API-derived values WILL FAIL for harness reasons. ` +
        `Start the daemon or pass --daemon, then restart this server.\n`,
    );
  }

  const server = Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      if (pathname === "/" || pathname === "/index.html") return page();
      if (pathname.startsWith("/api/")) return proxy(req, url);
      const dist = serveDist(pathname);
      if (dist) return dist;
      if (["/sw.js", "/icon.svg", "/manifest.json"].includes(pathname)) return proxy(req, url);
      return page(); // SPA fallback
    },
  });

  writeFileSync(PIDFILE, String(process.pid));
  const cleanup = () => {
    try {
      if (readFileSync(PIDFILE, "utf8").trim() === String(process.pid)) unlinkSync(PIDFILE);
    } catch {}
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  if (TTL_MIN > 0) {
    setTimeout(() => {
      console.log(`[test-server] TTL of ${TTL_MIN} min reached — exiting.`);
      cleanup();
    }, TTL_MIN * 60_000).unref?.();
  }

  console.log(`Test server PID ${process.pid} listening on http://127.0.0.1:${PORT}`);
  console.log(`  app bundle: ${APP_DIST}`);
  console.log(`  /api/* → ${DAEMON}`);
  console.log(`  stop with:  bun run src/ui/test-server.ts stop --port ${PORT}   (TTL ${TTL_MIN || "∞"} min)`);
}

if (command === "stop") stop();
else if (command === "start") await start();
else {
  console.error(`Unknown command "${command}". Use: start | stop`);
  process.exit(2);
}
