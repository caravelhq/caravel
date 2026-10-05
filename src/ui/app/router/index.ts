import { createRouter, createWebHashHistory, type RouteLocationNormalized } from "vue-router";
import { useWorkspaceStore } from "../stores/workspace";
import { useTasksStore } from "../stores/tasks";
import { useFilesStore } from "../stores/files";
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
    { path: "/tasks", component: Stub },
    { path: "/tasks/:taskId", component: Stub },
    { path: "/files", component: Stub },
    { path: "/files/:filePath(.*)", component: Stub },
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
  if (p === "/tasks" || p.startsWith("/tasks/")) return { kind: "legacy", page: "tasks" };
  if (p === "/chat") return { kind: "legacy", page: "chat" };
  if (p === "/files" || p.startsWith("/files/")) return { kind: "legacy", page: "files" };
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

  // Guard: store→URL writes triggered by ws.open/activate below must not produce another navigation.
  _navigating = true;
  try {
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

    // Hydrate legacy-page stores from URL identity segments.
    // This runs before the page mounts, so onMounted sees the correct values.
    const p = to.path;
    if (p.startsWith("/tasks/")) {
      const taskId = decodeURIComponent(p.slice("/tasks/".length));
      if (taskId) {
        const tasks = useTasksStore();
        tasks.currentTaskId = taskId;
        tasks.pane = "view";
      }
    } else if (p.startsWith("/files/")) {
      const filePath = decodeURIComponent(p.slice("/files/".length));
      if (filePath) {
        const files = useFilesStore();
        files.currentPath = filePath;
      }
    }
  } finally {
    _navigating = false;
  }
});

// Sync the current workspace state to the URL.
// push=true when opening a brand-new tab; push=false (replace) for activation, focus changes, ?side= changes.
export function syncWorkspaceUrl(push: boolean): void {
  if (_navigating) return;
  const ws = useWorkspaceStore();
  const focusedRef = ws.focusedActiveRef;
  if (!focusedRef) return;

  let path: string;
  if (focusedRef.kind === "legacy" && focusedRef.page === "tasks") {
    const tasks = useTasksStore();
    path = (tasks.pane === "view" && tasks.currentTaskId)
      ? `/tasks/${encodeURIComponent(tasks.currentTaskId)}`
      : "/tasks";
  } else if (focusedRef.kind === "legacy" && focusedRef.page === "files") {
    const files = useFilesStore();
    path = files.currentPath
      ? `/files/${encodeURIComponent(files.currentPath)}`
      : "/files";
  } else {
    path = refToPath(focusedRef);
  }

  // Build ?side= from the non-focused group's active key when split.
  const otherGroup: 0 | 1 = ws.focused === 0 ? 1 : 0;
  const otherKey = ws.active[otherGroup];
  const query: Record<string, string> = ws.splitOn && otherKey ? { side: otherKey } : {};

  if (push) {
    router.push({ path, query });
  } else {
    router.replace({ path, query });
  }
}

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
