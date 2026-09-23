import { defineStore } from "pinia";
import { reactive } from "vue";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResourceSpec {
  topics: string[];
  fetch: () => Promise<unknown>;
}

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export interface ResourceEntry {
  data: unknown;
  status: ResourceStatus;
  error: string | null;
  fetchedAt: number | null;
  refs: number;
  touchedAt: number;
  spec: ResourceSpec;
  inflight: boolean;
  dirty: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 64;
const UNHEALTHY_MS = 10_000;
const FALLBACK_MS = 15_000;
const LIVE_URL = "/api/live";

// ── Store ────────────────────────────────────────────────────────────────────

export const useLiveStore = defineStore("live", () => {
  // Reactive cache: Map<key, ResourceEntry>
  const entries = reactive(new Map<string, ResourceEntry>());

  // Client-side topic → key set (mirrors server broadcast — client filters)
  const topicMap = new Map<string, Set<string>>();

  // EventSource
  let es: EventSource | null = null;
  let unhealthyTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let overflowLogged = false;

  // ── Cache helpers ──────────────────────────────────────────────────────────

  function touch(entry: ResourceEntry): void {
    entry.touchedAt = Date.now();
  }

  function evict(): void {
    if (entries.size <= MAX_ENTRIES) {
      overflowLogged = false;
      return;
    }
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, e] of entries) {
      if (e.refs === 0 && e.touchedAt < oldestTime) {
        oldest = key;
        oldestTime = e.touchedAt;
      }
    }
    if (oldest) {
      const e = entries.get(oldest)!;
      for (const topic of e.spec.topics) {
        topicMap.get(topic)?.delete(oldest);
      }
      entries.delete(oldest);
    } else if (!overflowLogged) {
      console.warn("[live] resource cache overflow: all 64 entries are bound — possible leak");
      overflowLogged = true;
    }
  }

  function registerTopics(key: string, spec: ResourceSpec): void {
    for (const topic of spec.topics) {
      if (!topicMap.has(topic)) topicMap.set(topic, new Set());
      topicMap.get(topic)!.add(key);
    }
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function doFetch(key: string, entry: ResourceEntry): Promise<void> {
    if (entry.inflight) {
      entry.dirty = true;
      return;
    }
    entry.inflight = true;
    entry.dirty = false;
    try {
      const data = await entry.spec.fetch();
      entry.data = data;
      entry.status = "ready";
      entry.fetchedAt = Date.now();
      touch(entry);
      entry.error = null;
    } catch (err) {
      entry.status = "error";
      entry.error = String(err);
    } finally {
      entry.inflight = false;
      // If an event arrived while we were fetching, go again
      if (entry.dirty && entry.refs > 0) {
        doFetch(key, entry).catch(() => {});
      }
    }
  }

  // ── Bind / unbind ──────────────────────────────────────────────────────────

  function bind(key: string, spec: ResourceSpec): void {
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        data: null,
        status: "idle",
        error: null,
        fetchedAt: null,
        refs: 0,
        touchedAt: Date.now(),
        spec,
        inflight: false,
        dirty: false,
      };
      entries.set(key, entry);
      registerTopics(key, spec);
      evict();
    } else {
      touch(entry);
    }
    const wasUnbound = entry.refs === 0;
    entry.refs++;
    if (wasUnbound) {
      // 0→1 transition: fetch (revalidating cache hit or fresh)
      doFetch(key, entry).catch(() => {});
    }
  }

  function unbind(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    touch(entry);
    // Entry stays in cache — evicted only when the cache is full
  }

  function entry(key: string): ResourceEntry | undefined {
    const e = entries.get(key);
    if (e) touch(e);
    return e;
  }

  // ── Prefetch ───────────────────────────────────────────────────────────────

  function prefetch(key: string, spec: ResourceSpec): void {
    if (entries.has(key)) return; // Already cached or in flight
    const e: ResourceEntry = {
      data: null,
      status: "idle",
      error: null,
      fetchedAt: null,
      refs: 0,
      touchedAt: Date.now(),
      spec,
      inflight: false,
      dirty: false,
    };
    entries.set(key, e);
    registerTopics(key, spec);
    evict();
    doFetch(key, e).catch(() => {});
  }

  // ── Event handler ──────────────────────────────────────────────────────────

  function handleEvent(topic: string, hint: Record<string, unknown>): void {
    const keys = topicMap.get(topic);
    if (!keys) return;
    for (const key of keys) {
      const e = entries.get(key);
      if (!e) continue;
      touch(e);
      if (e.refs > 0) {
        doFetch(key, e).catch(() => {});
      } else {
        // Cached but unbound — mark stale (refetch when next bound or prefetched)
        e.status = "idle";
      }
    }
  }

  // ── Resync: refetch all bound entries ─────────────────────────────────────

  function refetchAllBound(): void {
    for (const [key, e] of entries) {
      if (e.refs > 0) doFetch(key, e).catch(() => {});
    }
  }

  // ── Fallback poll (stream unhealthy >10s) ──────────────────────────────────

  function startFallback(): void {
    if (fallbackTimer) return;
    fallbackTimer = setInterval(refetchAllBound, FALLBACK_MS);
  }

  function clearFallback(): void {
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
  }

  function startUnhealthyTimer(): void {
    if (unhealthyTimer) return;
    unhealthyTimer = setTimeout(() => {
      unhealthyTimer = null;
      startFallback();
    }, UNHEALTHY_MS);
  }

  function clearUnhealthyTimer(): void {
    if (unhealthyTimer) { clearTimeout(unhealthyTimer); unhealthyTimer = null; }
  }

  // ── EventSource lifecycle ──────────────────────────────────────────────────

  function connect(): void {
    if (es) { es.close(); es = null; }
    es = new EventSource(LIVE_URL);

    es.addEventListener("message", (ev) => {
      let payload: { topic: string; hint?: Record<string, unknown> };
      try {
        payload = JSON.parse(ev.data);
      } catch {
        return;
      }
      const { topic, hint = {} } = payload;

      if (topic === "hello") {
        // Connection established (or reconnected)
        clearUnhealthyTimer();
        clearFallback();
        refetchAllBound();
        return;
      }
      if (topic === "resync") {
        refetchAllBound();
        return;
      }
      handleEvent(topic, hint);
    });

    es.addEventListener("error", () => {
      startUnhealthyTimer();
    });

    es.addEventListener("open", () => {
      clearUnhealthyTimer();
    });
  }

  function disconnect(): void {
    if (es) { es.close(); es = null; }
    clearUnhealthyTimer();
    clearFallback();
  }

  // ── Visibility / pageshow resync ──────────────────────────────────────────

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refetchAllBound();
    });
    window.addEventListener("pageshow", () => refetchAllBound());
  }

  // Auto-connect when the store is first used
  connect();

  return { entries, bind, unbind, entry, prefetch, connect, disconnect };
});
