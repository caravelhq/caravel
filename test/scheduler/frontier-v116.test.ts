/**
 * v1.16 continuation guard tests + sweepBlockedDependants coverage (WAL-72 post-deploy).
 *
 * Proves the four defects fixed in the v1.16 batch:
 *
 *   F1a (staggered family): A completes → C1 spawned. B completes later →
 *     findExistingContinuation finds C1, extends its after: to include B.
 *     Exactly ONE continuation in the end.
 *
 *   F1b (two-graph variant): same-parent siblings claimed on different ticks →
 *     two independent graph snapshots, each loaded fresh. The old graph.dependants
 *     guard was blind to cross-tick siblings. Filesystem scan fixes this.
 *
 *   F2 (different reply_to): X reply_to:alice, Y reply_to:bob, same parent.
 *     Must produce TWO continuations — one per target. Old guard saw X's
 *     continuation in dependants[Y] and dropped Y's silently.
 *
 *   sweepBlockedDependants (#4 from FDP test plan): a failed task causes its
 *     needs-dependants to move to blocked/. after:-dependants are unaffected.
 *     First dedicated coverage for this sweep.
 *
 * Run with: bun run test/scheduler/frontier-v116.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";

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

const root = await mkdtemp(join(tmpdir(), "caravel-v116-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;

if (
  typeof t.checkFrontierAndMaybeSpawnContinuation !== "function" ||
  typeof t.loadGraph !== "function" ||
  typeof t.sweepBlockedDependants !== "function"
) {
  console.error("SKIP: required __testing exports not available");
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
type SweepBlockedFn = (
  failedId: string,
  graph: TaskGraph,
  agentsDir: string
) => Promise<void>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<TaskGraph>;
const sweepBlocked = t.sweepBlockedDependants as SweepBlockedFn;

async function openEnvelopes(agent: string): Promise<{ id: string; doc: Record<string, unknown> }[]> {
  const dir = join(agentsDir, agent, "tasks", "open");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
  const out: { id: string; doc: Record<string, unknown> }[] = [];
  for (const f of files) {
    const yaml = await readFile(join(dir, f), "utf-8");
    out.push({ id: f.replace(/\.yaml$/, ""), doc: yamlLoad(yaml) as Record<string, unknown> });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readTask(
  bucket: string,
  agent: string,
  id: string
): Promise<{ yaml: string; doc: Record<string, unknown> } | null> {
  const path = join(agentsDir, agent, "tasks", bucket, `${id}.yaml`);
  try {
    const yaml = await readFile(path, "utf-8");
    return { yaml, doc: yamlLoad(yaml) as Record<string, unknown> };
  } catch { return null; }
}

async function countBucketFiles(agent: string, bucket: string): Promise<number> {
  const dir = join(agentsDir, agent, "tasks", bucket);
  return (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml")).length;
}

const agents = ["alice", "bob", "cliff"];

try {
  // ── Test 1: F1a — staggered family → extend existing continuation ──────────
  //
  // A completes first → continuation C1 spawned (after: [A]).
  // B completes after → findExistingContinuation finds C1 → extends after: to [A, B].
  // Final state: exactly ONE continuation with both siblings in after:.

  console.log("\nTest 1: F1a — staggered family → extend existing continuation");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR" },
        { id: "TSK-A", status: "done", from: "bob", kind: "code", parent: "TSK-PAR" },
        { id: "TSK-B", status: "done", from: "bob", kind: "code", parent: "TSK-PAR" },
      ],
      bob: [],
      cliff: [],
    },
  });

  // Step 1: A completes — load a fresh graph, call frontier.
  const graphA = await loadGraphFn(agentsDir, agents);
  const yamlA = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-A.yaml"), "utf-8");
  await checkFrontier(yamlA, "TSK-A", "alice", agents, graphA, agentsDir);

  const afterA = await openEnvelopes("bob");
  assert(afterA.length === 1, "1a: A's completion spawns exactly one continuation");

  // Step 2: B completes — load a NEW graph (different tick, doesn't see the insertion from graphA).
  const graphB = await loadGraphFn(agentsDir, agents);
  const yamlB = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-B.yaml"), "utf-8");
  await checkFrontier(yamlB, "TSK-B", "alice", agents, graphB, agentsDir);

  const afterB = await openEnvelopes("bob");
  assert(
    afterB.length === 1,
    "1b: B's completion extends existing continuation — still exactly ONE",
    `found ${afterB.length}: [${afterB.map((e) => e.id).join(", ")}]`
  );
  if (afterB.length === 1) {
    const afterList = afterB[0]!.doc["after"] as string[] | undefined;
    assert(
      Array.isArray(afterList) && afterList.includes("TSK-A") && afterList.includes("TSK-B"),
      "1c: extended continuation lists both A and B in after:",
      `after: [${afterList?.join(", ") ?? ""}]`
    );
  }

  // ── Test 2: F1b — two-graph variant (cross-tick blind spot) ───────────────
  //
  // Two siblings, each completing with their own independent graph snapshot
  // (simulates tasks claimed on different ticks — no shared graph state).
  // Must produce exactly ONE continuation, not two.

  console.log("\nTest 2: F1b — two-graph variant: same-parent siblings, independent graph objects");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR2" },
        { id: "TSK-X", status: "done", from: "bob", kind: "code", parent: "TSK-PAR2" },
        { id: "TSK-Y", status: "done", from: "bob", kind: "code", parent: "TSK-PAR2" },
      ],
      bob: [],
      cliff: [],
    },
  });

  // Both graphs loaded fresh — each snapshot is independent (no shared mutation).
  const graphX = await loadGraphFn(agentsDir, agents);
  const graphY = await loadGraphFn(agentsDir, agents); // separate object, same view
  const yamlX = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-X.yaml"), "utf-8");
  const yamlY = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Y.yaml"), "utf-8");

  // Fire both transitions — different graph objects like different ticks would.
  await checkFrontier(yamlX, "TSK-X", "alice", agents, graphX, agentsDir);
  await checkFrontier(yamlY, "TSK-Y", "alice", agents, graphY, agentsDir);

  const afterXY = await openEnvelopes("bob");
  assert(
    afterXY.length === 1,
    "2a: two-graph variant → exactly ONE continuation (cross-tick blind spot fixed)",
    `found ${afterXY.length}: [${afterXY.map((e) => e.id).join(", ")}]`
  );
  if (afterXY.length === 1) {
    const afterList = afterXY[0]!.doc["after"] as string[] | undefined;
    assert(
      Array.isArray(afterList) && afterList.includes("TSK-X") && afterList.includes("TSK-Y"),
      "2b: continuation lists both X and Y in after:",
      `after: [${afterList?.join(", ") ?? ""}]`
    );
  }

  // ── Test 3: F2 — different reply_to targets → two continuations ───────────
  //
  // X has reply_to:alice, Y has reply_to:cliff, same parent.
  // Must produce TWO continuations — one per target.
  // Old guard: Y saw X's continuation in dependants[Y] and silently dropped Y's.

  console.log("\nTest 3: F2 — different reply_to targets → two distinct continuations");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR3" },
        { id: "TSK-M", status: "done", from: "bob", kind: "code", reply_to: "alice", parent: "TSK-PAR3" },
        { id: "TSK-N", status: "done", from: "bob", kind: "code", reply_to: "cliff", parent: "TSK-PAR3" },
      ],
      bob: [],
      cliff: [],
    },
  });

  // Use a single shared graph (the easy case) to verify per-target routing.
  const graph3 = await loadGraphFn(agentsDir, agents);
  const yamlM = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-M.yaml"), "utf-8");
  const yamlN = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-N.yaml"), "utf-8");

  await checkFrontier(yamlM, "TSK-M", "alice", agents, graph3, agentsDir);
  await checkFrontier(yamlN, "TSK-N", "alice", agents, graph3, agentsDir);

  // Filter by kind: continuation — alice's open/ also contains the fixture TSK-PAR3 task.
  const toAlice = (await openEnvelopes("alice")).filter((s) => s.doc["kind"] === "continuation");
  const toCliff = (await openEnvelopes("cliff")).filter((s) => s.doc["kind"] === "continuation");
  assert(toAlice.length === 1, "3a: one continuation routed to alice (M's reply_to)", `alice got ${toAlice.length}`);
  assert(toCliff.length === 1, "3b: one continuation routed to cliff (N's reply_to)", `cliff got ${toCliff.length}`);
  if (toAlice.length === 1) {
    assert(toAlice[0]!.doc["kind"] === "continuation", "3c: alice continuation has kind:continuation");
  }
  if (toCliff.length === 1) {
    assert(toCliff[0]!.doc["kind"] === "continuation", "3d: cliff continuation has kind:continuation");
  }

  // ── Test 4: sweepBlockedDependants ────────────────────────────────────────
  //
  // FDP test plan #4 — first dedicated test coverage for this sweep.
  // TSK-FAIL fails → TSK-NEEDS (needs: [TSK-FAIL]) moves to blocked/.
  //                  TSK-AFTER (after: [TSK-FAIL]) is NOT moved (after: doesn't block).
  // graph.errors is empty before the sweep — the duplicate/parse errors are separate.

  console.log("\nTest 4: sweepBlockedDependants — failed dep → needs-dependant blocked, after:-dependant untouched");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-FAIL", status: "failed" },
        { id: "TSK-NEEDS", status: "open", needs: ["TSK-FAIL"] },
        { id: "TSK-AFTER", status: "open", after: ["TSK-FAIL"] },
      ],
      bob: [],
      cliff: [],
    },
  });

  const graph4 = await loadGraphFn(agentsDir, agents);
  await sweepBlocked("TSK-FAIL", graph4, agentsDir);

  // TSK-NEEDS should be in blocked/ now.
  const needsInBlocked = await readTask("blocked", "alice", "TSK-NEEDS");
  const needsInOpen = await readTask("open", "alice", "TSK-NEEDS");
  assert(needsInBlocked !== null, "4a: TSK-NEEDS moved to blocked/ (needs dep failed)");
  assert(needsInOpen === null, "4b: TSK-NEEDS removed from open/");
  if (needsInBlocked) {
    assert(needsInBlocked.doc["status"] === "blocked", "4c: TSK-NEEDS status: blocked");
    assert(needsInBlocked.doc["blocked_by"] === "TSK-FAIL", "4d: blocked_by: TSK-FAIL");
  }

  // TSK-AFTER should remain in open/ (after: doesn't cascade blocks).
  const afterInOpen = await readTask("open", "alice", "TSK-AFTER");
  const afterInBlocked = await readTask("blocked", "alice", "TSK-AFTER");
  assert(afterInOpen !== null, "4e: TSK-AFTER stays in open/ (after: dep — no cascade)");
  assert(afterInBlocked === null, "4f: TSK-AFTER NOT in blocked/");

  // Journal should have a level:error entry for TSK-NEEDS.
  const journalPath = join(agentsDir, "alice", "tasks", "journal.ndjson");
  const journalLines = (await readFile(journalPath, "utf-8").catch(() => ""))
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
    })
    .filter(Boolean);
  const blockEntry = journalLines.find(
    (e) => e && e["id"] === "TSK-NEEDS" && e["status"] === "blocked"
  );
  assert(blockEntry !== null, "4g: journal has a blocked entry for TSK-NEEDS");
  assert(blockEntry?.["level"] === "error", "4h: journal entry has level: error");

  // In-memory graph node should reflect the new state (node.bucket = blocked).
  const nodeInGraph = graph4.nodes.get("TSK-NEEDS");
  assert(nodeInGraph?.bucket === "blocked", "4i: in-memory graph node updated to bucket: blocked");

  // Blocked count = 1 (only TSK-NEEDS), not 2.
  const blockedCount = await countBucketFiles("alice", "blocked");
  assert(blockedCount === 1, "4j: exactly one file in alice blocked/", `found ${blockedCount}`);

} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nfrontier-v116: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
