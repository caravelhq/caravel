/**
 * Adapter binding the fixture cases to the real scheduler in
 * src/multiAgent.ts (WAL-72 Phase 1 exports, landed 2026-08-27 as 9db3ba8).
 *
 * Bound signatures — read from the export surface only, NOT from the
 * implementation, so the reference oracle stays independent:
 *
 *   loadGraph(agentsDir: string, agents: string[]): Promise<TaskGraph>
 *   ready(taskId: string, graph: TaskGraph): boolean
 *
 * The composition deliberately enumerates the ids the case DECLARED and asks
 * `ready()` about each one, rather than walking TaskGraph's internals — the
 * adapter needs no knowledge of the graph's in-memory shape, only of the two
 * public functions. If either export disappears or changes shape, the
 * adapter reports `incompatible` instead of crashing the suite.
 *
 * Contract the real implementation is held to by the suite:
 *   - unknown edge targets and cycles must be survivable: no throw, no
 *     unbounded recursion (cases run under a watchdog either way);
 *   - ready-ness must match the FDP v1.4 semantics the reference pins;
 *   - disagreement is reported as a FINDING — the suite never edits the
 *     runner to make itself green.
 */

import { join } from "path";

export type RealScheduler = {
  /** Human label for the suite output. */
  label: string;
  /**
   * Compute the ready subset of `allIds` against the fixture tree at
   * `agentsDir` as it exists right now.
   */
  computeReady: (agentsDir: string, agents: string[], allIds: string[]) => Promise<string[]>;
};

export type Resolution =
  | { status: "available"; scheduler: RealScheduler }
  | { status: "incompatible"; reason: string };

type GraphTesting = {
  loadGraph?: (agentsDir: string, agents: string[]) => Promise<unknown>;
  ready?: (taskId: string, graph: unknown) => boolean;
};

export async function resolveRealScheduler(): Promise<Resolution> {
  let ma: { __testing?: Record<string, unknown> };
  try {
    ma = (await import("../../src/multiAgent.ts")) as { __testing?: Record<string, unknown> };
  } catch (e) {
    return { status: "incompatible", reason: `import failed: ${(e as Error).message}` };
  }
  const t = (ma.__testing ?? {}) as GraphTesting;
  const { loadGraph, ready } = t;
  if (typeof loadGraph !== "function" || typeof ready !== "function") {
    return {
      status: "incompatible",
      reason: `__testing lacks loadGraph/ready (loadGraph:${typeof loadGraph}, ready:${typeof ready})`,
    };
  }

  // Shape probe on an empty roster — must return an object, not throw.
  try {
    const graph = await loadGraph(join(process.cwd(), "agents"), []);
    if (!graph || typeof graph !== "object") {
      return { status: "incompatible", reason: "loadGraph did not return an object" };
    }
  } catch (e) {
    return { status: "incompatible", reason: `loadGraph probe threw: ${(e as Error).message.split("\n")[0]}` };
  }

  return {
    status: "available",
    scheduler: {
      label: "src/multiAgent.ts __testing.loadGraph + __testing.ready",
      computeReady: async (agentsDir, agents, allIds) => {
        const graph = await loadGraph(agentsDir, agents);
        return allIds.filter((id) => {
          try {
            return ready(id, graph);
          } catch {
            // A throw on one id must not hide the verdict on the rest.
            return false;
          }
        });
      },
    },
  };
}
