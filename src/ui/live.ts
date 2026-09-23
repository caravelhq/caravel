import { watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Event bus ────────────────────────────────────────────────────────────────

interface LiveEvent {
  id: number;
  topic: string;
  ts: number;
  hint: Record<string, unknown>;
}

const RING_SIZE = 500;
const ring: LiveEvent[] = [];
let nextId = 1;

type Ctrl = ReadableStreamDefaultController<Uint8Array>;
const connections = new Set<Ctrl>();
let connectionCount = 0;

const encoder = new TextEncoder();

function sseEvent(e: LiveEvent): Uint8Array {
  return encoder.encode(
    `id: ${e.id}\ndata: ${JSON.stringify({ id: e.id, topic: e.topic, ts: e.ts, hint: e.hint })}\n\n`
  );
}

export function emitLive(topic: string, hint: Record<string, unknown> = {}): void {
  const event: LiveEvent = { id: nextId++, topic, ts: Date.now(), hint };
  ring.push(event);
  if (ring.length > RING_SIZE) ring.shift();

  const frame = sseEvent(event);
  for (const ctrl of connections) {
    try {
      ctrl.enqueue(frame);
    } catch {
      connections.delete(ctrl);
    }
  }
}

// ── Debounce / coalesce per topic ────────────────────────────────────────────

const debounce = new Map<string, ReturnType<typeof setTimeout>>();
const debounceHints = new Map<string, Record<string, unknown>>();

function emitDebounced(topic: string, hint: Record<string, unknown>): void {
  debounceHints.set(topic, hint);
  const existing = debounce.get(topic);
  if (existing) clearTimeout(existing);
  debounce.set(
    topic,
    setTimeout(() => {
      debounce.delete(topic);
      const h = debounceHints.get(topic) ?? {};
      debounceHints.delete(topic);
      emitLive(topic, h);
    }, 150)
  );
}

// ── Path → topics mapper ─────────────────────────────────────────────────────

// Spike result (R09 F4, Bun 1.3.14/Linux):
// 1. Rename fires for the source path only → emit for any event in a bucket dir.
// 2. Atomic writes fire only for the .tmp name → strip before parsing.
function pathToTopics(rel: string): Array<{ topic: string; hint: Record<string, unknown> }> {
  // Strip atomic-write suffixes before parsing
  let p = rel;
  if (p.endsWith(".tmp")) p = p.slice(0, -4);
  else if (p.endsWith(".partial")) p = p.slice(0, -8);

  // agents/<a>/tasks/<bucket>/<file>
  const taskMatch = p.match(/^agents\/([^/]+)\/tasks\/([^/]+)\/([^/]+)$/);
  if (taskMatch) {
    const [, agent, bucket, filename] = taskMatch;
    if (bucket === "scheduled") {
      return [{ topic: "schedules", hint: { agent, file: filename } }];
    }
    // Strip file extension(s) to get the task id
    const id = filename.replace(/\.(yaml|yml|md)$/, "");
    if (id.startsWith("TSK-")) {
      return [
        { topic: "tasks", hint: { agent, id } },
        { topic: `task:${id}`, hint: { agent, id } },
        { topic: "attention", hint: { agent, id } },
      ];
    }
    // Non-TSK file in a bucket dir (e.g. journal.ndjson) — skip
    return [];
  }

  // .caravel/chats/<id>.json
  const chatMatch = p.match(/^\.caravel\/chats\/([^/]+)\.json$/);
  if (chatMatch) {
    const id = chatMatch[1];
    return [
      { topic: `chat:${id}`, hint: { id } },
      { topic: "chats", hint: { id } },
    ];
  }

  // Notes/** and repos/dev/** → knowledge (step 8 reindex trigger)
  if (p.startsWith("Notes/") || p.startsWith("repos/dev/")) {
    return [{ topic: "knowledge", hint: { path: p } }];
  }

  return [];
}

// ── Filesystem watchers ──────────────────────────────────────────────────────

let watchersStarted = false;

export function startLive(workspaceRoot: string): () => void {
  if (watchersStarted) return () => {};
  watchersStarted = true;

  const watchDirs = [
    "agents",
    ".caravel/chats",
    "Notes",
    "repos/dev",
  ];

  const watchers: ReturnType<typeof fsWatch>[] = [];
  for (const dir of watchDirs) {
    const abs = join(workspaceRoot, dir);
    try {
      const w = fsWatch(abs, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const rel = join(dir, filename).replace(/\\/g, "/");
        for (const { topic, hint } of pathToTopics(rel)) {
          emitDebounced(topic, hint);
        }
      });
      watchers.push(w);
    } catch {
      // Directory doesn't exist — skip silently (Notes/, repos/dev/ may not exist in fixture ws)
    }
  }

  // State keepalive every 15s so the dock's `state` resource stays fresh
  const stateKeepalive = setInterval(() => emitLive("state", {}), 15_000);

  // 20s ping on all connections (belt-and-braces; each connection also sends its own)
  // Handled per-connection below; no module-level ping needed.

  return () => {
    watchersStarted = false;
    clearInterval(stateKeepalive);
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
  };
}

// ── GET /api/live — SSE endpoint ─────────────────────────────────────────────

export function handleLiveRoute(req: Request): Response {
  const connId = randomUUID().slice(0, 8);
  let ctrl: Ctrl | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      connections.add(c);
      connectionCount++;

      // Hello — always first, before any replay
      c.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ topic: "hello", ts: Date.now(), hint: { conn: connId } })}\n\n`
        )
      );

      // Replay from Last-Event-ID if still in ring buffer
      const lastIdHeader = req.headers.get("Last-Event-ID");
      if (lastIdHeader) {
        const lastId = Number(lastIdHeader);
        const oldestInRing = ring.length > 0 ? ring[0].id : null;
        if (oldestInRing !== null && lastId >= oldestInRing - 1) {
          // Gap is covered — replay missed events
          for (const e of ring) {
            if (e.id > lastId) c.enqueue(sseEvent(e));
          }
        } else {
          // Gap too large — tell client to resync
          c.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ topic: "resync", ts: Date.now() })}\n\n`
            )
          );
        }
      }

      // Ping every 20s so tailscale proxy doesn't idle the connection out
      pingTimer = setInterval(() => {
        try {
          c.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        }
      }, 20_000);
    },
    cancel() {
      if (ctrl) {
        connections.delete(ctrl);
        connectionCount = Math.max(0, connectionCount - 1);
        ctrl = null;
      }
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── GET /api/live/connections — test-only connection count ───────────────────

export function handleLiveConnectionsRoute(): Response {
  return new Response(JSON.stringify({ count: connectionCount }), {
    headers: { "Content-Type": "application/json" },
  });
}
