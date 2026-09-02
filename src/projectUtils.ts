// Shared project-tag utilities used by both multiAgent.ts (runner) and
// multiAgentDispatch.ts (dispatch layer). Lives here to break the circular
// import that would result from either module importing the other for this
// one piece of logic — multiAgentDispatch already imports loadGraph/detectCycles
// from multiAgent, so the reverse direction would form a cycle.

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// WAL-63 Phase 3: infer a project tag from context entries by picking the
// most-frequently-cited `Notes/Projects/<X>/` path. Stable on ties
// (first-seen wins). Returns null when no context path resolves into a
// project folder. Mirrors the read-time inference in services/multiAgent.ts
// so the field a worker reads matches what would be inferred lazily.
const CTX_PROJECT_RE = /^Notes\/Projects\/([^/]+)\//;
export function inferProjectFromContext(context: string[]): string | null {
  if (!context.length) return null;
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const entry of context) {
    const m = CTX_PROJECT_RE.exec(entry);
    if (!m) continue;
    const project = m[1];
    if (!counts.has(project)) order.push(project);
    counts.set(project, (counts.get(project) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = order[0]!;
  let bestCount = counts.get(best)!;
  for (const name of order) {
    const c = counts.get(name)!;
    if (c > bestCount) { best = name; bestCount = c; }
  }
  return best;
}

// Read a parent task's `project:` field by id, scanning all known agents and
// buckets (including archived and scheduled). Returns the trimmed slug, or
// null when absent or not found. Lets a spawned child inherit its parent's
// project tag — including when the parent is a scheduled template.
//
// Parameterised on agentsDir and agents so both the runner and the dispatch
// layer can call it with their own values, and tests can inject a temp dir.
const ALL_BUCKETS = ["open", "waiting", "done", "failed", "paused", "archived", "scheduled"];
export async function readParentProject(
  parentId: string,
  agentsDir: string,
  agents: string[]
): Promise<string | null> {
  for (const agent of agents) {
    for (const bucket of ALL_BUCKETS) {
      const p = join(agentsDir, agent, "tasks", bucket, `${parentId}.yaml`);
      if (!existsSync(p)) continue;
      try {
        const m = /^project:\s*(.*)$/m.exec(await readFile(p, "utf-8"));
        const proj = (m?.[1] ?? "").trim();
        return proj && proj !== "null" ? proj : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
