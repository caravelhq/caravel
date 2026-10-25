import { createRouter, createWebHashHistory, type RouteLocationNormalized } from "vue-router";
import { useWorkspaceStore, type WsSnapshot } from "../stores/workspace";
import type { ResourceRef } from "../workspace/refs";
import { refKey } from "../workspace/refs";

// Suppresses store→URL writes while afterEach is propagating navigation to the store,
// preventing the feedback loop: nav → ws.open → syncWorkspaceUrl → nav → …
let _navigating = false;

// Stub component — the workspace renders the active ref; routes are used only for URL tracking.
import { defineComponent } from "vue";
const Stub = defineComponent({ render: () => null });

export const router = createRouter({
  history: createWebHashHistory(),
  linkActiveClass: "tab-btn-active",
  linkExactActiveClass: "tab-btn-active",
  routes: [
    { path: "/dashboard", component: Stub },
    { path: "/chat", component: Stub },
    { path: "/chat/:chatId", component: Stub },
    { path: "/tasks", component: Stub },
    // /tasks/project/:slug and sub-views must be declared before the bare taskId pattern.
    { path: "/tasks/project/:slug", component: Stub },
    { path: "/tasks/:taskId(TSK-[^/]+)/next", component: Stub },
    { path: "/tasks/:taskId(TSK-[^/]+)/report", component: Stub },
    { path: "/tasks/:taskId(TSK-[^/]+)", component: Stub },
    { path: "/files", component: Stub },
    { path: "/files/:filePath(.*)", component: Stub },
    { path: "/file/:path(.*)", component: Stub },
    { path: "/report/:taskId", component: Stub },
    { path: "/envelope/:taskId", component: Stub },
    { path: "/project/:slug(.*)", component: Stub },
    { path: "/", redirect: "/dashboard" },
    { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  ],
});

// ── Snapshot ring ────────────────────────────────────────────────────────────
// A bounded ring of 50 workspace snapshots in sessionStorage, keyed by
// monotonically increasing wsStateId. Each history.push embeds its id in
// history.state so popstate can restore the matching snapshot.

const WS_RING_KEY = "ws.ring";
const WS_RING_MAX = 50;
type WsRing = Record<number, WsSnapshot>;

function loadRing(): WsRing {
  try { return JSON.parse(sessionStorage.getItem(WS_RING_KEY) ?? "{}") as WsRing; } catch { return {}; }
}

function saveRing(ring: WsRing): void {
  const ids = Object.keys(ring).map(Number).sort((a, b) => a - b);
  if (ids.length > WS_RING_MAX) {
    for (const id of ids.slice(0, ids.length - WS_RING_MAX)) delete ring[id];
  }
  try { sessionStorage.setItem(WS_RING_KEY, JSON.stringify(ring)); } catch {}
}

// Init seq from highest stored id so a reload doesn't collide with existing entries.
let _wsStateIdSeq = (() => {
  const ring = loadRing();
  const ids = Object.keys(ring).map(Number);
  return ids.length ? Math.max(...ids) : 0;
})();

// Flag set by the popstate listener; consumed once by afterEach.
// Stores only a boolean — afterEach reads window.history.state.wsStateId authoritatively
// so that spurious popstate events (fired by vue-router's history.go(-delta) reverts) cannot
// overwrite the flag with a stale ring entry before afterEach runs.
let _pendingSnapshot = false;

// Capture the popstate event before vue-router's async afterEach fires.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (ev) => {
    const stateId = (ev.state as Record<string, unknown> | null)?.wsStateId as number | undefined;
    if (stateId !== undefined) {
      _pendingSnapshot = true;
    }
  });
}

// ── Routing ──────────────────────────────────────────────────────────────────

// Parse a route into a ResourceRef (or null if unrecognised).
// Extract a sub-view from a /tasks/:taskId/:subView path (e.g. "/tasks/TSK-x/next" → "next").
function taskSubView(path: string): "next" | "report" | null {
  const m = path.match(/^\/tasks\/TSK-[^/]+(\/next|\/report)$/);
  if (!m) return null;
  return m[1] === "/next" ? "next" : "report";
}

function routeToRef(route: RouteLocationNormalized): ResourceRef | null {
  const p = route.path;
  if (p === "/dashboard" || p === "/") return { kind: "dashboard" };
  if (p === "/tasks" || p === "/tasks/") return { kind: "legacy", page: "tasks" };
  // /tasks/:taskId/next and /tasks/:taskId/report — open the envelope (sub-view wired via intent)
  if (/^\/tasks\/TSK-[^/]+\/(next|report)$/.test(p)) {
    const parts = p.split("/");
    return { kind: "envelope", taskId: parts[2] };
  }
  // /tasks/:taskId — also opens the envelope (legacy URL form)
  if (/^\/tasks\/TSK-[^/]+$/.test(p)) {
    const taskId = p.slice("/tasks/".length);
    return { kind: "envelope", taskId };
  }
  if (p.startsWith("/tasks/")) return { kind: "legacy", page: "tasks" };
  if (p === "/chat") return { kind: "legacy", page: "chat" };
  if (p.startsWith("/chat/")) {
    const chatId = decodeURIComponent(p.slice("/chat/".length));
    return { kind: "chat", chatId };
  }
  if (p === "/files") return { kind: "legacy", page: "files" };
  if (p.startsWith("/files/")) {
    // Step 7: /files/<path> opens the file as a file: tab (step 6 converted Files to a pure picker).
    const filePath = decodeURIComponent(p.slice("/files/".length));
    return { kind: "file", path: filePath };
  }
  if (p.startsWith("/file/")) {
    const path = decodeURIComponent(p.slice("/file/".length));
    const branch = route.query["branch"] as string | undefined;
    return { kind: "file", path, ...(branch ? { branch } : {}) };
  }
  if (p.startsWith("/report/")) {
    const taskId = decodeURIComponent(p.slice("/report/".length));
    return { kind: "envelope", taskId };
  }
  if (p.startsWith("/envelope/")) {
    const taskId = decodeURIComponent(p.slice("/envelope/".length));
    return { kind: "envelope", taskId };
  }
  if (p.startsWith("/project/")) {
    const slug = decodeURIComponent(p.slice("/project/".length));
    return { kind: "project", slug };
  }
  return null;
}

// Navigation-initiated changes (popstate / direct URL) open or focus without a history push.
router.afterEach((to) => {
  // Popstate with a known wsStateId: restore workspace wholesale from the snapshot ring.
  // Read window.history.state.wsStateId here (not from the popstate event) because spurious
  // popstate events fired by vue-router's duplicate-navigation reverts can arrive after the
  // legitimate popstate and overwrite any stale value we cached there.
  if (_pendingSnapshot) {
    _pendingSnapshot = false;
    const currentId = (window.history.state as Record<string, unknown> | null)?.wsStateId as number | undefined;
    if (currentId !== undefined) {
      const snap = loadRing()[currentId] ?? null;
      if (snap) {
        const ws = useWorkspaceStore();
        _navigating = true;
        try { ws.restoreSnapshot(snap); } finally { _navigating = false; }
        return;
      }
    }
  }

  const ref = routeToRef(to);
  if (!ref) return;

  // Run after the next tick so the store is ready (Pinia is set up before the router).
  const ws = useWorkspaceStore();

  // Guard: store→URL writes triggered by ws.open/activate below must not produce another navigation.
  _navigating = true;
  try {
    // For /tasks/:taskId/next and /tasks/:taskId/report, carry the sub-view as intent.
    const sv = taskSubView(to.path);
    const intent = sv ? { subView: sv } : undefined;

    // Open the main ref (no URL write — we came from navigation).
    const key = refKey(ref);
    const existingIdx = ws.tabs.findIndex((t) => refKey(t) === key);
    if (existingIdx !== -1) {
      if (intent) ws.open(ref, { intent }); // re-open with intent to set sub-view
      ws.activate(key);
    } else {
      ws.open(ref, intent ? { intent } : {});
    }

    // Handle ?side= for the other group when split.
    const sideKey = to.query["side"] as string | undefined;
    if (sideKey) {
      const sideIdx = ws.tabs.findIndex((t) => refKey(t) === sideKey);
      if (sideIdx !== -1) {
        const g = ws.tabGroup(sideIdx);
        ws.active[g] = sideKey;
      }
    }

    // /tasks/:id deep links: viewer removed in Phase 4 step 4 — deep-link support is F15.
    // /files/<path> is handled by routeToRef returning a file: ref — ws.open above opens it.
    // files.currentPath hydration removed (step 7): the file tab is the canonical representation.
  } finally {
    _navigating = false;
  }
});

// Sync the current workspace state to the URL.
// push=true: open, activate, close, split-toggle — each is a Back stop.
// push=false (replace): focus changes and ?side= — too fine-grained for Back.
export function syncWorkspaceUrl(push: boolean): void {
  if (_navigating) return;
  const ws = useWorkspaceStore();
  const focusedRef = ws.focusedActiveRef;
  if (!focusedRef) return;

  let path: string;
  if (focusedRef.kind === "legacy" && focusedRef.page === "tasks") {
    // Phase 4 step 4: tasks page is a picker-only view; task content is in envelope: tabs.
    path = "/tasks";
  } else {
    // legacy:files always maps to /files (step 7: the path no longer tracks an open file).
    path = refToPath(focusedRef);
  }

  // Build ?side= from the non-focused group's active key when split.
  const otherGroup: 0 | 1 = ws.focused === 0 ? 1 : 0;
  const otherKey = ws.active[otherGroup];
  const query: Record<string, string> = ws.splitOn && otherKey ? { side: otherKey } : {};

  if (push) {
    // Snapshot current workspace state and embed id in the history entry.
    const id = ++_wsStateIdSeq;
    const ring = loadRing();
    ring[id] = {
      tabs: JSON.parse(JSON.stringify(ws.tabs)),
      splitIndex: ws.splitIndex,
      splitOn: ws.splitOn,
      active: [ws.active[0], ws.active[1]] as [string | null, string | null],
      focused: ws.focused,
      meta: JSON.parse(JSON.stringify(ws.meta)),
    };
    saveRing(ring);
    router.push({ path, query, state: { wsStateId: id } });
  } else {
    router.replace({ path, query });
  }
}

// Build a URL path from a ResourceRef.
export function refToPath(ref: ResourceRef): string {
  switch (ref.kind) {
    case "dashboard": return "/dashboard";
    case "file": return `/file/${encodeURIComponent(ref.path)}${ref.branch ? `?branch=${encodeURIComponent(ref.branch)}` : ""}`;
    case "envelope": return `/envelope/${encodeURIComponent(ref.taskId)}`;
    case "report": return `/report/${encodeURIComponent(ref.taskId)}`;
    case "project": return `/project/${encodeURIComponent(ref.slug)}`;
    case "chat": return `/chat/${encodeURIComponent(ref.chatId)}`;
    case "legacy": return `/${ref.page}`;
    default: return "/dashboard";
  }
}
