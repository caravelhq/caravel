// tree.ts — task tree building, rendering, and picker views.
// Ported from client.js:5428–5963.

import { escapeHtml, statusClass, shorten, shortenStatusLabel, timeAgo } from "./helpers";
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

function buildByParent(cache: TaskRow[]): Record<string, TaskRow[]> {
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

// ── Tree row renderer ─────────────────────────────────────────────────────

export function renderTreeRow(
  t: TaskRow, depth: number, hasChildren: boolean, expanded: boolean,
  queuedCount: number, currentTaskId: string | null
): string {
  let rowStatus = statusClass(t.status);
  const marker = depth === 0 ? "●" : "└";
  const headline = t.headline || (t.summary && t.summary.brief) || t.brief || "(no headline)";
  let rowClass = "tasks-tree-row";
  if (t.id === currentTaskId) rowClass += " is-active";
  if (t.status === "waiting:on:user") rowClass += " is-waiting-user";
  if (t.status === "paused") rowClass += " is-paused";
  if (t.closed && t.closed.status) rowClass += " is-closed";
  if (depth === 0) rowClass += " is-root";
  let queuedBadge = "";
  if (queuedCount > 0) {
    rowClass += " has-queued";
    rowStatus = "is-open";
    queuedBadge = '<span class="tasks-tree-queued-badge">▸ ' + queuedCount + " queued</span>";
  }
  const indent = '<span class="tasks-tree-indent" style="width:' + (depth * 14) + 'px"></span>';
  const chevron = hasChildren
    ? '<button class="tasks-tree-chevron' + (expanded ? " is-expanded" : "") + '" data-toggle-expand="' + escapeHtml(t.id) + '" type="button" aria-label="' + (expanded ? "Collapse" : "Expand") + '">' + (expanded ? "▾" : "▸") + "</button>"
    : '<span class="tasks-tree-chevron-spacer"></span>';
  const rawStatus = t.status || "?";
  const shortStatus = shortenStatusLabel(rawStatus);
  return (
    '<div class="' + rowClass + '" data-task-id="' + escapeHtml(t.id) + '" role="button" tabindex="0">' +
    indent + chevron +
    '<span class="tasks-tree-marker">' + marker + "</span>" +
    '<div class="tasks-tree-titlecol">' +
    '<span class="tasks-tree-headline">' + escapeHtml(shorten(headline, 80)) + "</span>" +
    '<div class="tasks-tree-meta">' +
    '<span class="tasks-tree-id">' + escapeHtml(t.id) + "</span>" +
    '<span class="tasks-tree-agent">' + escapeHtml(t.agent || t.to || "?") + "</span>" +
    (queuedBadge || '<span class="tasks-tree-status ' + rowStatus + '" title="' + escapeHtml(rawStatus) + '">' + escapeHtml(shortStatus) + "</span>") +
    "</div></div></div>"
  );
}

export function renderTreeBranch(
  tree: TaskTree, node: TaskRow, depth: number, out: string[],
  expanded: Record<string, boolean>, byParent: Record<string, TaskRow[]>,
  currentTaskId: string | null, seen: Record<string, boolean> = {}
): void {
  if (seen[node.id] || depth > 32) return;
  seen[node.id] = true;
  const kids = tree.childrenOf[node.id] || [];
  const hasChildren = kids.length > 0;
  const queuedCount = countNonTerminalDescendants(node.id, byParent);
  if (queuedCount > 0 && hasChildren && !(node.id in expanded)) {
    expanded[node.id] = true;
  }
  const isExpanded = !!expanded[node.id];
  out.push(renderTreeRow(node, depth, hasChildren, isExpanded, queuedCount, currentTaskId));
  if (!hasChildren || !isExpanded) return;
  for (const kid of kids) {
    renderTreeBranch(tree, kid, depth + 1, out, expanded, byParent, currentTaskId, seen);
  }
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

// ── Current (leaf) view ───────────────────────────────────────────────────

export function currentStatusClass(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "done") return "status-done";
  if (s.indexOf("failed") === 0 || s === "escalated") return "status-failed";
  if (s === "waiting:on:user") return "status-waiting-user";
  if (s.indexOf("waiting:on:task") === 0) return "status-waiting-task";
  if (s === "waiting:on:limits") return "status-waiting-limits";
  if (s.indexOf("waiting:") === 0) return "status-waiting-other";
  if (s === "claimed") return "status-claimed";
  return "status-open";
}

export function renderCurrentRow(
  task: TaskRow,
  currentTaskId: string | null,
  currentSelected: Record<string, { agent: string; defaultStatus: string }>
): string {
  const sc = currentStatusClass(task.status);
  const isClaimed = task.status === "claimed";
  const headline = task.headline || (task.summary && task.summary.brief) || task.brief || "(no headline)";
  const meta = [
    escapeHtml(task.agent || task.to || "?"),
    escapeHtml(shortenStatusLabel(task.status || "?")),
    ...(task.updated ? [escapeHtml(timeAgo(task.updated))] : []),
  ];
  let rowClass = "tasks-current-row " + sc;
  if (task.id === currentTaskId) rowClass += " is-active";
  const defaultCloseStatus = (task.status === "done") ? "closed" : "cancelled";
  const checkbox = isClaimed ? "" :
    '<input type="checkbox" class="current-row-select" ' +
    'data-task-id="' + escapeHtml(task.id) + '" ' +
    'data-task-agent="' + escapeHtml(task.agent || task.to || "") + '" ' +
    'data-task-default-status="' + escapeHtml(defaultCloseStatus) + '"' +
    (currentSelected[task.id] ? " checked" : "") + ">";
  return (
    '<div class="' + rowClass + '" data-task-id="' + escapeHtml(task.id) + '" role="button" tabindex="0">' +
    checkbox +
    '<span class="tasks-current-row-dot" aria-hidden="true"></span>' +
    '<div class="tasks-current-row-body">' +
    '<div class="tasks-current-row-title" title="' + escapeHtml(task.id) + '">' + escapeHtml(shorten(headline, 96)) + "</div>" +
    '<div class="tasks-current-row-sub">' +
    '<span class="tasks-current-row-id">' + escapeHtml(task.id) + "</span>" +
    '<span class="tasks-current-row-meta">' + meta.join(" · ") + "</span>" +
    "</div></div></div>"
  );
}

export function renderCurrentView(
  tasksTree: HTMLElement,
  cache: TaskRow[],
  currentTaskId: string | null,
  currentSelected: Record<string, { agent: string; defaultStatus: string }>,
  multiSelectActive: boolean,
  updateBulkBar: () => void
): void {
  if (!cache.length) {
    tasksTree.innerHTML = '<div class="tasks-current-empty">No tasks yet. Click <strong>+ New</strong> to create one.</div>';
    return;
  }
  const byParent: Record<string, TaskRow[]> = {};
  for (const t of cache) {
    const p = (t.parent && t.parent !== "null") ? t.parent : null;
    if (!p) continue;
    (byParent[p] = byParent[p] || []).push(t);
  }
  function isActive(task: TaskRow): boolean { return !(task && task.closed && task.closed.status); }
  function hasActiveDescendant(id: string, seen: Record<string, boolean> = {}): boolean {
    if (seen[id]) return false;
    seen[id] = true;
    for (const kid of byParent[id] || []) {
      if (isActive(kid)) return true;
      if (hasActiveDescendant(kid.id, seen)) return true;
    }
    return false;
  }
  const leaves: TaskRow[] = [];
  for (const task of cache) {
    if (!isActive(task)) continue;
    if (hasActiveDescendant(task.id)) continue;
    leaves.push(task);
  }
  if (leaves.length === 0) {
    tasksTree.innerHTML = '<div class="tasks-current-empty">No active leaves. Inbox zero. ✨</div>';
    return;
  }
  leaves.sort((a, b) => (Date.parse(b.updated || "0") || 0) - (Date.parse(a.updated || "0") || 0));
  let html = '<div class="tasks-current">';
  for (const leaf of leaves) html += renderCurrentRow(leaf, currentTaskId, currentSelected);
  html += "</div>";
  tasksTree.innerHTML = html;
  tasksTree.classList.toggle("is-multiselect-active", multiSelectActive);
  updateBulkBar();
}

export function renderAllTasksView(
  tasksTree: HTMLElement,
  cache: TaskRow[],
  filter: TasksFilter,
  currentTaskId: string | null,
  currentSelected: Record<string, { agent: string; defaultStatus: string }>,
  expanded: Record<string, boolean>,
  collapsed: Record<string, boolean>
): void {
  const filtered = cache.filter(t => passesFilter(t, filter));
  if (filtered.length === 0) {
    tasksTree.innerHTML = '<div class="tasks-tree-empty">No tasks match this filter.</div>';
    return;
  }
  const groups: Record<string, TaskRow[]> = {};
  for (const t of filtered) {
    const key = t.project || "__unassigned";
    (groups[key] = groups[key] || []).push(t);
  }
  const projectKeys = Object.keys(groups).sort((a, b) => {
    if (a === "__unassigned" && b !== "__unassigned") return 1;
    if (b === "__unassigned" && a !== "__unassigned") return -1;
    const aLatest = groups[a].reduce((m, t) => Math.max(m, Date.parse(t.updated || "0") || 0), 0);
    const bLatest = groups[b].reduce((m, t) => Math.max(m, Date.parse(t.updated || "0") || 0), 0);
    return bLatest - aLatest;
  });

  let html = "";
  const byParent = buildByParent(filtered);
  for (const groupKey of projectKeys) {
    const rows = groups[groupKey];
    const displayName = (groupKey === "__unassigned") ? "Unassigned" : groupKey;
    const isCollapsed = !!collapsed[groupKey];
    html += '<div class="tasks-current-group' + (isCollapsed ? " is-collapsed" : "") + '" data-project-key="' + escapeHtml(groupKey) + '">';
    html += '<div class="tasks-current-group-head" data-toggle-group="' + escapeHtml(groupKey) + '">';
    html += '<span class="tasks-current-group-chevron"></span>';
    html += '<span class="tasks-current-group-name">' + escapeHtml(displayName) + "</span>";
    html += '<span class="tasks-current-group-count">' + rows.length + "</span></div>";
    html += '<div class="tasks-current-group-body">';
    const tree = buildTaskTree(rows);
    const out: string[] = [];
    for (const root of tree.roots) {
      renderTreeBranch(tree, root, 0, out, expanded, byParent, currentTaskId);
    }
    html += out.join("") + "</div></div>";
  }
  tasksTree.innerHTML = html;
}
