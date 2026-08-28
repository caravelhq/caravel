/**
 * Reference implementation of the FDP v1.5 scheduler — the executable spec.
 *
 * Written from Notes/Projects/caravel/2026-08-23_FDP_Workflow-Graph-Engine.md
 * §"The scheduler" and §"Envelope schema", deliberately NOT from any WAL-72
 * implementation branch: the suite's value is independence. Phase 1 landed
 * `loadGraph`/`ready` in src/multiAgent.ts (9db3ba8); adapter.ts points the
 * same fixture cases at the real code and any disagreement is a finding —
 * this module is the oracle those cases are judged against.
 *
 * The FDP's core claim: ready is a pure function of on-disk state.
 *
 *     ready(t) := bucket(t) == open
 *              ∧  ¬paused(t)                       // DEC-0004: paused outranks edges
 *              ∧  ∀ d ∈ t.needs : status(d) == done
 *              ∧  ∀ d ∈ t.after : status(d) ∈ {done, failed}
 *              ∧  t.gate == none                   // Phase 3 — NOT evaluated in Phase 1
 *
 * v1.5 note: the gate clause is annotated in the FDP formula as Phase 3.
 * This oracle implements the Phase 1 subset — `gate` is parsed onto the node
 * but does not affect readiness. ready.cases.ts carries the gate case with
 * its Phase 1 expectation and a marker to flip when Phase 3 lands.
 */

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";

// ── graph model ──────────────────────────────────────────────────────────────

export type GraphNode = {
  id: string;
  agent: string;
  bucket: string;
  status: string;
  needs: string[];
  after: string[];
  gate: string | null;
  kind: string | null;
  created: string;
};

export type GraphError = { id: string; problem: string };

export type Graph = {
  nodes: Map<string, GraphNode>;
  /** Reverse index: id → ids that declare it in `needs` or `after`. */
  dependants: Map<string, string[]>;
  /** Structural problems that must not crash the scheduler. */
  errors: GraphError[];
};

const BUCKET_STATUSES = new Set(["open", "waiting", "done", "failed", "paused", "blocked", "archived"]);

export async function loadGraph(agentsDir: string, agents: string[]): Promise<Graph> {
  const graph: Graph = { nodes: new Map(), dependants: new Map(), errors: [] };

  for (const agent of agents) {
    const tasksDir = join(agentsDir, agent, "tasks");
    if (!existsSync(tasksDir)) continue;
    for (const bucket of await readdir(tasksDir).catch(() => [] as string[])) {
      if (!BUCKET_STATUSES.has(bucket)) continue;
      const dir = join(tasksDir, bucket);
      const files = (await readdir(dir).catch(() => [] as string[])).filter((f) =>
        f.endsWith(".yaml")
      );
      for (const f of files) {
        const id = f.replace(/\.yaml$/, "");
        const content = await readFile(join(dir, f), "utf-8");
        let doc: Record<string, unknown>;
        try {
          doc = yamlLoad(content) as Record<string, unknown>;
        } catch (e) {
          // The 29-unparseable-envelope class: state on disk the scheduler
          // cannot see. Recorded as an error, never silently skipped.
          graph.errors.push({ id, problem: `unparseable YAML: ${(e as Error).message.split("\n")[0]}` });
          continue;
        }
        const node: GraphNode = {
          id,
          agent,
          bucket,
          status: typeof doc.status === "string" ? doc.status : "open",
          needs: Array.isArray(doc.needs) ? (doc.needs as string[]) : [],
          after: Array.isArray(doc.after) ? (doc.after as string[]) : [],
          gate: typeof doc.gate === "string" ? doc.gate : null,
          kind: typeof doc.kind === "string" ? doc.kind : null,
          created: typeof doc.created === "string" ? doc.created : "",
        };
        graph.nodes.set(id, node);
      }
    }
  }

  // Reverse index + edge-target validation, one pass after all nodes load.
  for (const node of graph.nodes.values()) {
    for (const dep of [...node.needs, ...node.after]) {
      if (!graph.nodes.has(dep)) {
        graph.errors.push({ id: node.id, problem: `edge references unknown task ${dep}` });
        continue;
      }
      const list = graph.dependants.get(dep) ?? [];
      if (!list.includes(node.id)) list.push(node.id); // diamond edges resolve once
      graph.dependants.set(dep, list);
    }
  }
  return graph;
}

// ── ready predicate ──────────────────────────────────────────────────────────

// The FDP v1.5 formula keys readiness on the BUCKET, with exactly one status
// clause: ¬paused (DEC-0004). A `claimed` or `waiting:on:*` envelope sitting
// in open/ therefore IS ready per the formula — the live claim pass skips it
// via its own earlier guards (isClaimed / isTerminalish in tickOnce), which
// is a layer this pure oracle deliberately does not model. Model the doc,
// not the loop.
function isOpen(node: GraphNode): boolean {
  if (node.bucket !== "open") return false;
  if (node.status === "paused") return false; // DEC-0004: paused outranks edges
  return true;
}

const isDone = (n: GraphNode) => n.status === "done";
const isFailed = (n: GraphNode) => n.status === "failed" || n.status.startsWith("failed:");

export function isReady(node: GraphNode, graph: Graph): boolean {
  // gate (user | limits) is Phase 3 per the v1.5 formula annotation — parsed
  // onto the node, NOT evaluated here. Flip when Phase 3 lands.
  if (!isOpen(node)) return false;
  for (const dep of node.needs) {
    const d = graph.nodes.get(dep);
    if (!d || !isDone(d)) return false; // unknown dep ⇒ never ready (error recorded)
  }
  for (const dep of node.after) {
    const d = graph.nodes.get(dep);
    if (!d || !(isDone(d) || isFailed(d))) return false;
  }
  return true;
}

/**
 * All ready ids across every agent, sorted by (created, id) per the FDP tick.
 * Flat and iterative by construction — no recursion, so a cycle cannot hang
 * it; the cycle case still guards a future recursive implementation via the
 * suite's watchdog.
 */
export function readySet(graph: Graph): string[] {
  return Array.from(graph.nodes.values())
    .filter((n) => isReady(n, graph))
    .map((n) => n.id)
    .sort((a, b) => {
      const ca = graph.nodes.get(a)!.created;
      const cb = graph.nodes.get(b)!.created;
      return ca !== cb ? ca.localeCompare(cb) : a.localeCompare(b);
    });
}
