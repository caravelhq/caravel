// tree.ts — task tree shape logic (building + filtering + expanding).
// Markup builders removed in Phase 4 step 4 — replaced by TaskPickerTree.vue.
import type { TaskRow, TasksFilter } from "../../stores/tasks";

// ── Filter ────────────────────────────────────────────────────────────────

export function passesFilter(t: TaskRow, filter: TasksFilter): boolean {
  if (filter === "all") return true;
  const s = (t.status || "").toLowerCase();
  if (filter === "open") return s === "open" || s === "claimed";
  if (filter === "waiting") return s.indexOf("waiting:") === 0;
  if (filter === "done") return s === "done";
  if (filter === "failed") return s.indexOf("failed:") === 0 || s === "escalated";
  return true;
}

// ── Tree builder ──────────────────────────────────────────────────────────

interface TaskTree {
  roots: TaskRow[];
  childrenOf: Record<string, TaskRow[]>;
}

export function buildTaskTree(tasks: TaskRow[]): TaskTree {
  const byId: Record<string, TaskRow> = {};
  for (const t of tasks) byId[t.id] = t;

  function idDerivedAncestor(id: string): string | null {
    let cur = id;
    while (true) {
      const m = /^(.+)\.[0-9]+$/.exec(cur);
      if (!m) return null;
      cur = m[1];
      if (byId[cur]) return cur;
    }
  }

  function dotDepth(id: string): number {
    return (String(id).match(/\./g) || []).length;
  }

  function effectiveParent(t: TaskRow): string | null {
    const pid = t.parent && t.parent !== "null" ? t.parent : null;
    if (pid && pid !== t.id && byId[pid] && dotDepth(pid) >= dotDepth(t.id)) {
      const idAnc = idDerivedAncestor(t.id);
      if (idAnc) return idAnc;
    }
    if (pid && pid !== t.id && byId[pid]) {
      const seen: Record<string, boolean> = { [t.id]: true };
      let cur: TaskRow | undefined = byId[pid];
      let cyclic = false;
      while (cur) {
        if (seen[cur.id]) { cyclic = true; break; }
        seen[cur.id] = true;
        const nextId: string | null = cur.parent && cur.parent !== "null" ? cur.parent : null;
        if (!nextId || nextId === cur.id || !byId[nextId]) break;
        cur = byId[nextId];
      }
      if (!cyclic) return pid;
    }
    return idDerivedAncestor(t.id);
  }

  const roots: TaskRow[] = [];
  const childrenOf: Record<string, TaskRow[]> = {};
  for (const t of tasks) {
    const parentId = effectiveParent(t);
    if (parentId) {
      (childrenOf[parentId] = childrenOf[parentId] || []).push(t);
    } else {
      roots.push(t);
    }
  }

  function byUpdatedDesc(a: TaskRow, b: TaskRow): number {
    return (Date.parse(b.updated || "0") || 0) - (Date.parse(a.updated || "0") || 0);
  }
  function byIdAsc(a: TaskRow, b: TaskRow): number {
    return String(a.id).localeCompare(String(b.id));
  }
  roots.sort(byUpdatedDesc);
  Object.keys(childrenOf).forEach(k => childrenOf[k].sort(byIdAsc));
  return { roots, childrenOf };
}

// ── Non-terminal descendant count (Measure F) ────────────────────────────

export function buildByParent(cache: TaskRow[]): Record<string, TaskRow[]> {
  const bp: Record<string, TaskRow[]> = {};
  for (const t of cache) {
    const p = (t.parent && t.parent !== "null") ? t.parent : null;
    if (!p) continue;
    (bp[p] = bp[p] || []).push(t);
  }
  return bp;
}

export function countNonTerminalDescendants(taskId: string, byParent: Record<string, TaskRow[]>): number {
  const queue = [taskId];
  const seen: Record<string, boolean> = { [taskId]: true };
  let count = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const kid of byParent[cur] || []) {
      if (seen[kid.id]) continue;
      seen[kid.id] = true;
      const s = kid.status || "";
      const terminal = s === "done" || s.indexOf("failed:") === 0;
      if (!terminal) count++;
      queue.push(kid.id);
    }
  }
  return count;
}


export function expandAncestors(taskId: string, cache: TaskRow[], expanded: Record<string, boolean>): void {
  if (!taskId) return;
  const byId: Record<string, TaskRow> = {};
  for (const t of cache) byId[t.id] = t;
  function depth(id: string): number { return (String(id).match(/\./g) || []).length; }
  function idDerived(id: string): string | null {
    let cur = id;
    while (true) {
      const m = /^(.+)\.[0-9]+$/.exec(cur);
      if (!m) return null;
      cur = m[1];
      if (byId[cur]) return cur;
    }
  }
  function ancestorOf(id: string): string | null {
    const t = byId[id];
    if (t) {
      const p = t.parent && t.parent !== "null" && t.parent !== id ? t.parent : null;
      if (p && byId[p] && depth(p) >= depth(id)) {
        const derived = idDerived(id);
        if (derived) return derived;
      }
      if (p && byId[p]) return p;
    }
    return idDerived(id);
  }
  const seen: Record<string, boolean> = {};
  let cur = ancestorOf(taskId);
  while (cur && !seen[cur]) {
    seen[cur] = true;
    expanded[cur] = true;
    cur = ancestorOf(cur);
  }
}

