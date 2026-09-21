// helpers.ts — shared utility functions for the Tasks page.
// Ported from client.js:4344–4440.

import { escHtml } from "../../lib/highlight";
import type { TaskRow } from "../../stores/tasks";

export function escapeHtml(s: unknown): string {
  return escHtml(String(s == null ? "" : s));
}

export function isPanelNarrow(panelId: string, threshold: number): boolean {
  const el = document.getElementById(panelId);
  if (el && el.clientWidth > 0) return el.clientWidth <= threshold;
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: " + threshold + "px)").matches;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

export function statusClass(status: string | null | undefined): string {
  if (!status) return "is-open";
  if (status === "open" || status === "claimed") return "is-open";
  if (status.indexOf("waiting:") === 0) return "is-waiting";
  if (status === "paused") return "is-paused";
  if (status === "done") return "is-done";
  if (status.indexOf("failed:") === 0 || status === "escalated") return "is-failed";
  return "is-open";
}

export function shorten(s: unknown, n: number): string {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

export function shortenStatusLabel(s: string | null | undefined): string {
  if (!s) return "?";
  if (s === "paused") return "paused";
  if (s.indexOf("waiting:on:") === 0) return "wait " + s.slice("waiting:on:".length);
  if (s.indexOf("failed:") === 0) {
    const rest = s.slice("failed:".length);
    return rest === "other" ? "failed" : "fail " + rest;
  }
  return s;
}

export function fmtDaysHours(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return days + "d " + hours + "h";
  return hours + "h " + Math.floor((seconds % 3600) / 60) + "m";
}

// suggestChildHeadline: mirrors spawnNextTask headline rule for the Next form pre-fill.
export function suggestChildHeadline(parentHeadline: string, source: string): string {
  const base = String(parentHeadline || "").slice(0, 56);
  if (source === "unblock") return base + " — continue with response";
  return base + " — rework";
}

// renderNextTargetPicker: agent picker for Next/Continue/Chat forms.
export function renderNextTargetPicker(currentAgent: string, agentsCache: TaskRow[]): string {
  let options = "";
  const agents = Array.isArray(agentsCache) ? agentsCache : [];
  for (const a of agents as Array<{ name?: string; emoji?: string; displayName?: string }>) {
    if (!a || !a.name) continue;
    const label = (a.emoji ? a.emoji + " " : "") + (a.displayName || a.name);
    const selected = (a.name === currentAgent) ? " selected" : "";
    options += '<option value="' + escapeHtml(a.name) + '"' + selected + '>' + escapeHtml(label) + '</option>';
  }
  if (!options && currentAgent) {
    options = '<option value="' + escapeHtml(currentAgent) + '" selected>' + escapeHtml(currentAgent) + '</option>';
  }
  return (
    '<label class="task-panel-next-target" title="Pick a different agent to take over from here">' +
    '<span class="task-panel-next-target-label">→</span>' +
    '<select class="task-panel-next-target-select">' + options + '</select>' +
    '</label>'
  );
}

// countActiveDescendants: count open descendants for the close-cascade prompt.
export function countActiveDescendants(taskId: string, cache: TaskRow[]): number {
  if (!taskId || !cache.length) return 0;
  const byParent: Record<string, TaskRow[]> = {};
  for (const t of cache) {
    const p = (t.parent && t.parent !== "null") ? t.parent : null;
    if (!p) continue;
    (byParent[p] = byParent[p] || []).push(t);
  }
  const queue = [taskId];
  const seen: Record<string, boolean> = { [taskId]: true };
  let count = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const kid of byParent[cur] || []) {
      if (seen[kid.id]) continue;
      seen[kid.id] = true;
      if (!kid.closed || !kid.closed.status) count++;
      queue.push(kid.id);
    }
  }
  return count;
}
