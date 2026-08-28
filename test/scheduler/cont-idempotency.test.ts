/**
 * Continuation idempotency tests (WAL-72 Phase 2 fix round, TSK-2026-08-27-0005.18).
 * Updated for FDP v1.15 continuation model (TSK-2026-08-27-0005.28).
 *
 * v1.15 changes the guard from deterministic-id existence check (v1.11) to a
 * shared tick-scoped graph mutation.  The semantics change accordingly:
 *
 *   - Within a tick (same graph object): a non-terminal continuation blocks
 *     re-spawn regardless of its status on disk.  The graph is the source of
 *     truth, not the filesystem.
 *
 *   - Across ticks (fresh graph): a done or failed continuation does NOT block
 *     re-spawn.  This is intentional in v1.15 — the guard is about preventing
 *     double-dispatch within one tick, not across ticks.  In production,
 *     transitionToTerminal is called at most once per task, so cross-tick
 *     replay of the same terminal task ID cannot occur through normal paths.
 *
 * Three cases:
 *
 *   1. Same graph, continuation already CLAIMED — spawn skipped because the
 *      graph still shows the node as open (non-terminal).
 *
 *   2. Fresh graph, continuation already DONE — NEW spawn is allowed.
 *      v1.15 makes this explicit: skip only when non-terminal.
 *
 *   3. Fresh graph, continuation already FAILED — same; NEW spawn allowed.
 *
 * Run with: bun run test/scheduler/cont-idempotency.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";

import { buildFixture } from "./fixture.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? `\n    ${extra}` : ""}`);
    failed++;
  }
}

const root = await (async () => {
  const { mkdtemp } = await import("fs/promises");
  return mkdtemp(join(tmpdir(), "caravel-cont-idempotency-"));
})();
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;
if (typeof t.checkFrontierAndMaybeSpawnContinuation !== "function") {
  console.error("SKIP: __testing.checkFrontierAndMaybeSpawnContinuation not available");
  process.exit(0);
}
if (typeof t.loadGraph !== "function") {
  console.error("SKIP: __testing.loadGraph not available");
  process.exit(0);
}

type TaskGraph = Awaited<ReturnType<typeof ma.loadGraph>>;
type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  graph: TaskGraph,
  agentsDir?: string
) => Promise<void>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<TaskGraph>;

async function openFilesFor(agent: string): Promise<string[]> {
  const dir = join(agentsDir, agent, "tasks", "open");
  return (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
}

async function readTaskYaml(bucket: string, id: string): Promise<string> {
  return readFile(join(agentsDir, "alice", "tasks", bucket, `${id}.yaml`), "utf-8");
}

// Find the first continuation file in an agent's open/ dir.
async function findContYaml(agent: string): Promise<{ path: string; yaml: string; id: string } | null> {
  const dir = join(agentsDir, agent, "tasks", "open");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
  for (const f of files) {
    const p = join(dir, f);
    const y = await readFile(p, "utf-8").catch(() => "");
    if (y.includes("kind: continuation")) return { path: p, yaml: y, id: f.replace(/\.yaml$/, "") };
  }
  return null;
}

try {
  const agents = ["alice", "bob"];

  // ── Test 1: same-tick guard via shared graph — claimed continuation ────────
  //
  // v1.15: the guard is graph mutation, not id existence. First spawn inserts
  // the node into graph.nodes (bucket: open); second call finds it non-terminal
  // and skips, regardless of the continuation's status on disk.
  //
  // This mirrors the WAL-71 replay class: stale-claim re-opens the original
  // task mid-tick, firing transitionToTerminal a second time with the same
  // tick graph. The graph (not the filesystem) is the authority.

  console.log("\nTest 1: same-tick guard — continuation claimed in open/ → spawn skipped");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C1", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const graph1 = await loadGraphFn(agentsDir, agents);
  const c1Yaml = await readTaskYaml("done", "TSK-C1");

  // First transition: spawns continuation in bob/open/
  await checkFrontier(c1Yaml, "TSK-C1", "alice", agents, graph1, agentsDir);

  // Simulate runner claiming the continuation.
  const cont1 = await findContYaml("bob");
  assert(cont1 !== null, "1a: first transition spawned a continuation");

  if (cont1) {
    const leaseExpiry = new Date(Date.now() + 3_600_000).toISOString();
    const claimedDoc = {
      ...yamlLoad(cont1.yaml) as Record<string, unknown>,
      status: "claimed",
      lease: { holder: "worker-test-0001", expires: leaseExpiry },
    };
    await writeFile(cont1.path, yamlDump(claimedDoc));

    // Second transition (stale-claim replay) — same graph object. The graph
    // already has the continuation node with bucket:open (non-terminal) → skip.
    await checkFrontier(c1Yaml, "TSK-C1", "alice", agents, graph1, agentsDir);

    const contAfter = yamlLoad(await readFile(cont1.path, "utf-8")) as Record<string, unknown>;
    const leaseAfter = contAfter["lease"] as Record<string, unknown> | null;

    assert(
      contAfter["status"] === "claimed",
      "1b: re-transition does not reset continuation status to open",
      `status after re-transition: ${String(contAfter["status"])}`
    );
    assert(
      leaseAfter?.["holder"] === "worker-test-0001",
      "1c: lease holder is unchanged (worker still owns the envelope)",
      `holder: ${String(leaseAfter?.["holder"])}`
    );
    assert(
      (await openFilesFor("bob")).length === 1,
      "1d: still exactly one file in bob/open/ (no duplicate spawned)"
    );
  }

  // ── Test 2: fresh-graph, continuation DONE → re-spawn is allowed (v1.15) ──
  //
  // v1.15 deliberately allows this: skip only on non-terminal.  In production
  // transitionToTerminal is called at most once per task, so this path is
  // theoretical (the original task can't re-fire after it moves to done/).
  // The test records what v1.15 specifies, not what v1.11 guarded against.

  console.log("\nTest 2: fresh-graph, continuation done → re-spawn is ALLOWED (v1.15)");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C2", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const graph2a = await loadGraphFn(agentsDir, agents);
  const c2Yaml = await readTaskYaml("done", "TSK-C2");

  // First transition: spawns continuation
  await checkFrontier(c2Yaml, "TSK-C2", "alice", agents, graph2a, agentsDir);

  const cont2 = await findContYaml("bob");
  assert(cont2 !== null, "2a: first transition spawned a continuation");

  if (cont2) {
    // Move continuation to done/ (simulating completion)
    const doneDir = join(agentsDir, "bob", "tasks", "done");
    await mkdir(doneDir, { recursive: true });
    const doneDoc = { ...(yamlLoad(cont2.yaml) as object), status: "done" };
    await writeFile(join(doneDir, `${cont2.id}.yaml`), yamlDump(doneDoc));
    await rm(cont2.path);

    // Load a fresh graph (new tick) — sees the continuation as done
    const graph2b = await loadGraphFn(agentsDir, agents);

    // Second transition with fresh graph — v1.15: done continuation is terminal,
    // so the guard does NOT skip. A new continuation is spawned.
    await checkFrontier(c2Yaml, "TSK-C2", "alice", agents, graph2b, agentsDir);

    const newFiles = await openFilesFor("bob");
    assert(
      newFiles.length === 1,
      "2b: fresh graph + done continuation → new spawn (v1.15 allows re-spawn on terminal)",
      `open files: [${newFiles.join(", ")}]`
    );
  }

  // ── Test 3: fresh-graph, continuation FAILED → re-spawn is allowed (v1.15) ─

  console.log("\nTest 3: fresh-graph, continuation failed → re-spawn is ALLOWED (v1.15)");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C3", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const graph3a = await loadGraphFn(agentsDir, agents);
  const c3Yaml = await readTaskYaml("done", "TSK-C3");

  // First transition
  await checkFrontier(c3Yaml, "TSK-C3", "alice", agents, graph3a, agentsDir);

  const cont3 = await findContYaml("bob");
  assert(cont3 !== null, "3a: first transition spawned a continuation");

  if (cont3) {
    // Move to failed/
    const failedDir = join(agentsDir, "bob", "tasks", "failed");
    await mkdir(failedDir, { recursive: true });
    const failedDoc = { ...(yamlLoad(cont3.yaml) as object), status: "failed" };
    await writeFile(join(failedDir, `${cont3.id}.yaml`), yamlDump(failedDoc));
    await rm(cont3.path);

    // Fresh graph
    const graph3b = await loadGraphFn(agentsDir, agents);

    // Second transition with fresh graph — failed is terminal → new spawn allowed
    await checkFrontier(c3Yaml, "TSK-C3", "alice", agents, graph3b, agentsDir);

    const newFiles = await openFilesFor("bob");
    assert(
      newFiles.length === 1,
      "3b: fresh graph + failed continuation → new spawn (v1.15 allows re-spawn on terminal)",
      `open files: [${newFiles.join(", ")}]`
    );
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\ncont-idempotency: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
