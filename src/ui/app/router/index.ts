import { createRouter, createWebHashHistory, type RouteLocationNormalized } from "vue-router";
import { useWorkspaceStore } from "../stores/workspace";
import type { ResourceRef } from "../workspace/refs";
import { refKey } from "../workspace/refs";

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
    { path: "/tasks", component: Stub },
    { path: "/files", component: Stub },
    { path: "/file/:path(.*)", component: Stub },
    { path: "/report/:taskId", component: Stub },
    { path: "/", redirect: "/dashboard" },
    { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  ],
});

// Parse a route into a ResourceRef (or null if unrecognised).
function routeToRef(route: RouteLocationNormalized): ResourceRef | null {
  const p = route.path;
  if (p === "/dashboard" || p === "/") return { kind: "dashboard" };
  if (p === "/tasks") return { kind: "legacy", page: "tasks" };
  if (p === "/chat") return { kind: "legacy", page: "chat" };
  if (p === "/files") return { kind: "legacy", page: "files" };
  if (p.startsWith("/file/")) {
    const path = decodeURIComponent(p.slice("/file/".length));
    const branch = route.query["branch"] as string | undefined;
    return { kind: "file", path, ...(branch ? { branch } : {}) };
  }
  if (p.startsWith("/report/")) {
    const taskId = decodeURIComponent(p.slice("/report/".length));
    return { kind: "report", taskId };
  }
  return null;
}

// Navigation-initiated changes (popstate / direct URL) open or focus without a history push.
router.afterEach((to) => {
  const ref = routeToRef(to);
  if (!ref) return;

  // Run after the next tick so the store is ready (Pinia is set up before the router).
  const ws = useWorkspaceStore();

  // Open the main ref (no URL write — we came from navigation).
  const key = refKey(ref);
  const existingIdx = ws.tabs.findIndex((t) => refKey(t) === key);
  if (existingIdx !== -1) {
    ws.activate(key);
  } else {
    ws.open(ref);
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
});

// Build a URL path from a ResourceRef.
export function refToPath(ref: ResourceRef): string {
  switch (ref.kind) {
    case "dashboard": return "/dashboard";
    case "file": return `/file/${encodeURIComponent(ref.path)}${ref.branch ? `?branch=${encodeURIComponent(ref.branch)}` : ""}`;
    case "report": return `/report/${encodeURIComponent(ref.taskId)}`;
    case "legacy": return `/${ref.page}`;
    default: return "/dashboard";
  }
}
