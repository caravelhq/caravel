// knowledge.ts — KnowledgeService interface + BridgeKnowledge implementation.
//
// Phase 3 ships a bridge to the workspace CLI (.claude/skills/knowledge/script/knowledge.mjs).
// WAL-103 will replace BridgeKnowledge with a native Bun implementation behind the same
// interface — the API routes and client components don't change.

import { watch as fsWatch } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { getSettings } from "../config";
import { emitLive } from "./live";

// ── Service interface ─────────────────────────────────────────────────────────

export interface SearchOpts {
  limit?: number;
  doc_type?: string;
  project?: string;
}

export interface QueryOpts {
  limit?: number;
  tasks?: boolean;
  project?: string;
  since?: string;
}

export interface SearchResult {
  ok: boolean;
  docs?: unknown[];
  reports?: unknown[];
  tookMs?: number;
  builtAt?: string;
  reason?: string;
}

export interface DocResult {
  ok: boolean;
  content?: string;
  path?: string;
  reason?: string;
}

export interface StatsResult {
  ok: boolean;
  enabled: boolean;
  docs?: number;
  reports?: number;
  builtAt?: string;
}

export interface KnowledgeService {
  search(q: string, opts?: SearchOpts): Promise<SearchResult>;
  query(q: string, opts?: QueryOpts): Promise<SearchResult>;
  doc(path: string): Promise<DocResult>;
  mark(node: string, verdict: string, ctx?: string): Promise<{ ok: boolean }>;
  stats(): Promise<StatsResult>;
}

// ── Input hardening ───────────────────────────────────────────────────────────

function sanitizeQuery(q: string): string | null {
  if (!q || typeof q !== "string") return null;
  const trimmed = q.trim();
  if (!trimmed) return null;
  // Strip or reject a leading `-` — the CLI treats --prefixed tokens as flags
  return trimmed.replace(/^-+/, "") || null;
}

function sanitizeDocPath(path: string, workspaceRoot: string): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  // Reject absolute paths
  if (isAbsolute(trimmed)) return null;
  // Reject `.` segments that escape root
  const resolved = resolve(workspaceRoot, trimmed);
  if (!resolved.startsWith(workspaceRoot + "/") && resolved !== workspaceRoot) return null;
  return resolved;
}

// ── Single-flight + LRU cache ─────────────────────────────────────────────────

const CACHE_MAX = 20;
const CACHE_TTL_MS = 60_000;

interface CacheEntry { result: SearchResult; ts: number }
const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SearchResult>>();

function cacheKey(op: string, q: string, opts: Record<string, unknown>): string {
  return `${op}:${q}:${JSON.stringify(opts)}`;
}

function cacheGet(key: string): SearchResult | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { resultCache.delete(key); return null; }
  return entry.result;
}

function cachePut(key: string, result: SearchResult): void {
  resultCache.set(key, { result, ts: Date.now() });
  if (resultCache.size > CACHE_MAX) {
    const oldest = resultCache.keys().next().value as string | undefined;
    if (oldest) resultCache.delete(oldest);
  }
}

// ── BridgeKnowledge ───────────────────────────────────────────────────────────

let activeQueryCount = 0;

async function runCli(
  args: string[],
  workspaceRoot: string,
  timeoutMs = 10_000
): Promise<{ stdout: string; ok: boolean }> {
  const cfg = getSettings().knowledge;
  const cliPath = resolve(workspaceRoot, cfg.cli);
  if (!existsSync(cliPath)) {
    return { stdout: "", ok: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proc = Bun.spawn([cfg.node, cliPath, ...args, "--json"], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, KNOWLEDGE_ROOT: workspaceRoot },
    });

    const killed = new Promise<void>((res) => {
      controller.signal.addEventListener("abort", () => { proc.kill(); res(); }, { once: true });
    });

    const [stdout] = await Promise.race([
      Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]),
      killed.then(() => { throw new Error("knowledge CLI timed out"); }),
    ]) as [string, string];

    await proc.exited;
    return { stdout: stdout.trim(), ok: true };
  } finally {
    clearTimeout(timer);
  }
}

export class BridgeKnowledge implements KnowledgeService {
  private readonly root: string;

  constructor(workspaceRoot: string) {
    this.root = workspaceRoot;
  }

  async search(q: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const sq = sanitizeQuery(q);
    if (!sq) return { ok: false, reason: "invalid query" };

    const key = cacheKey("search", sq, opts as Record<string, unknown>);
    const cached = cacheGet(key);
    if (cached) return cached;

    if (inFlight.has(key)) return inFlight.get(key)!;

    const args: string[] = ["search", sq];
    if (opts.limit) args.push("--limit", String(opts.limit));
    if (opts.doc_type) args.push("--doc-type", opts.doc_type);
    if (opts.project) args.push("--project", opts.project);

    const promise = this._exec("search", args, key);
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key));
    return promise;
  }

  async query(q: string, opts: QueryOpts = {}): Promise<SearchResult> {
    const sq = sanitizeQuery(q);
    if (!sq) return { ok: false, reason: "invalid query" };

    const key = cacheKey("query", sq, opts as Record<string, unknown>);
    const cached = cacheGet(key);
    if (cached) return cached;

    if (inFlight.has(key)) return inFlight.get(key)!;

    const args: string[] = ["query", sq];
    if (opts.limit) args.push("--limit", String(opts.limit));
    if (opts.tasks) args.push("--tasks");
    if (opts.project) args.push("--project", opts.project);
    if (opts.since) args.push("--since", opts.since);

    const promise = this._exec("query", args, key);
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key));
    return promise;
  }

  private async _exec(op: string, args: string[], cacheKeyStr: string): Promise<SearchResult> {
    activeQueryCount++;
    const t0 = Date.now();
    try {
      const { stdout, ok: cliFound } = await runCli(args, this.root);
      if (!cliFound) return { ok: false, reason: "unavailable" };

      let parsed: unknown;
      try { parsed = JSON.parse(stdout); } catch { return { ok: false, reason: "parse error" }; }

      // search → flat list [{id, score, snippet, via}, ...]
      // query  → {docs: [...], reports: [...], ...}
      let docs: unknown[];
      let reports: unknown[];

      if (Array.isArray(parsed)) {
        docs = parsed;
        reports = [];
      } else {
        docs = (parsed as any)?.docs ?? [];
        reports = (parsed as any)?.reports ?? [];
      }

      const result: SearchResult = {
        ok: true,
        docs,
        reports,
        tookMs: Date.now() - t0,
        builtAt: (parsed as any)?.builtAt,
      };
      cachePut(cacheKeyStr, result);
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason, tookMs: Date.now() - t0 };
    } finally {
      activeQueryCount--;
    }
  }

  async doc(path: string): Promise<DocResult> {
    const safePath = sanitizeDocPath(path, this.root);
    if (!safePath) return { ok: false, reason: "invalid path" };

    const relPath = safePath.slice(this.root.length + 1);
    const { stdout, ok: cliFound } = await runCli(["doc", "--path", relPath], this.root);
    if (!cliFound) return { ok: false, reason: "unavailable" };

    try {
      const parsed = JSON.parse(stdout) as any;
      return { ok: true, content: parsed?.content ?? parsed?.text ?? stdout, path: relPath };
    } catch {
      return { ok: true, content: stdout, path: relPath };
    }
  }

  async mark(node: string, verdict: string, ctx?: string): Promise<{ ok: boolean }> {
    const args = ["mark", node, verdict];
    if (ctx) args.push("--context", ctx);

    const { ok: cliFound } = await runCli(args, this.root);
    if (!cliFound) return { ok: false };
    return { ok: true };
  }

  async stats(): Promise<StatsResult> {
    const cfg = getSettings().knowledge;
    const cliPath = resolve(this.root, cfg.cli);
    if (!existsSync(cliPath)) return { ok: true, enabled: false };

    const { stdout, ok: cliFound } = await runCli(["stats"], this.root, 5_000);
    if (!cliFound) return { ok: true, enabled: false };

    try {
      // stats output: {total_nodes, by_kind: [{kind, n}], ..., built_at}
      const parsed = JSON.parse(stdout) as any;
      const byKind: Array<{ kind: string; n: number }> = parsed?.by_kind ?? [];
      const docs = byKind.find((k) => k.kind === "doc")?.n;
      // Count task reports as the "reports" count
      const byStatus: Array<{ status: string; n: number }> = parsed?.by_status ?? [];
      const reports = byKind.find((k) => k.kind === "task")?.n
        ?? byStatus.filter((s) => s.status === "done").reduce((acc, s) => acc + s.n, 0);
      return {
        ok: true,
        enabled: true,
        docs,
        reports,
        builtAt: parsed?.built_at ?? parsed?.builtAt,
      };
    } catch {
      return { ok: true, enabled: true };
    }
  }
}

// ── Reindex watcher ───────────────────────────────────────────────────────────
// Watches Notes/ and repos/dev/ with a 10s debounce. On quiet, runs rebuild
// incrementally and emits the `knowledge` topic so clients know the index is fresh.

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let rebuilding = false;
let knowledgeInstance: BridgeKnowledge | null = null;
const REINDEX_DEBOUNCE_MS = 10_000;
const REINDEX_FALLBACK_INTERVAL_MS = 5 * 60_000;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

function scheduleReindex(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;
    if (rebuilding || activeQueryCount > 0 || !knowledgeInstance) return;
    rebuilding = true;
    try {
      const root = (knowledgeInstance as any).root as string;
      const cfg = getSettings().knowledge;
      const cliPath = resolve(root, cfg.cli);
      if (!existsSync(cliPath)) return;
      await runCli(["rebuild"], root, 30_000);
      const stats = await knowledgeInstance.stats();
      emitLive("knowledge", {
        builtAt: stats.builtAt ?? new Date().toISOString(),
        docs: stats.docs ?? 0,
        reports: stats.reports ?? 0,
      });
    } catch { /* rebuild errors are non-fatal */ } finally {
      rebuilding = false;
    }
  }, REINDEX_DEBOUNCE_MS);
}

export function startKnowledgeReindex(workspaceRoot: string, instance: BridgeKnowledge): () => void {
  knowledgeInstance = instance;
  const watchDirs = ["Notes", "repos/dev"];
  const watchers: ReturnType<typeof fsWatch>[] = [];

  for (const dir of watchDirs) {
    const abs = join(workspaceRoot, dir);
    try {
      const w = fsWatch(abs, { recursive: true }, () => scheduleReindex());
      watchers.push(w);
    } catch { /* directory missing — skip */ }
  }

  // Fallback incremental rebuild every 5 minutes if watchers miss events
  fallbackTimer = setInterval(scheduleReindex, REINDEX_FALLBACK_INTERVAL_MS);

  return () => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
    knowledgeInstance = null;
    for (const w of watchers) { try { w.close(); } catch {} }
  };
}
