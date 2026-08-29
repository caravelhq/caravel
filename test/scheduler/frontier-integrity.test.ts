/**
 * Frontier integrity tests (WAL-72 Phase 2 review / v1.19 update).
 * Updated for FDP v1.19 continuation model:
 *   - checkFrontierAndMaybeSpawnContinuation uses module-level currentGraph (no graph param)
 *   - after: replaces needs: (a continuation reports what happened; failed
 *     siblings must not block it)
 *   - the completing task is in its own after: block (self-edge)
 *   - double transition idempotency: first spawn inserts C1 into currentGraph;
 *     second call sees dependants[t] non-empty → skip
 *
 * Three behaviours Bob's frontier suite (frontier.test.ts, 8 assertions)
 * does not cover, checked against FDP v1.19 intent:
 *
 *   1. Double terminal transition for the same task must still leave exactly
 *      ONE continuation. Guarded by currentGraph.dependants[t] edge check.
 *   2. The spawned continuation's after: must cover every sibling sharing the
 *      parent (including the completing task itself — self-edge).
 *   3. reply_to must actually override from (target := reply_to ?? from).
 *
 * Run with: bun run test/scheduler/frontier-integrity.test.ts
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

const root = await mkdtemp(join(tmpdir(), "caravel-frontier-integrity-"));
process.chdir(root);
const agentsDir = join(root, "agents");

// Import multiAgent after chdir so module-level AGENTS_DIR resolves to root/agents.
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
  agentsDir?: string
) => Promise<void>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<TaskGraph>;

async function readTaskYaml(id: string, bucket: string): Promise<string> {
  return readFile(join(agentsDir, "alice", "tasks", bucket, `${id}.yaml`), "utf-8");
}

async function openEnvelopes(agent: string): Promise<{ id: string; doc: Record<string, unknown> }[]> {
  const dir = join(agentsDir, agent, "tasks", "open");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
  const out: { id: string; doc: Record<string, unknown> }[] = [];
  for (const f of files) {
    out.push({ id: f.replace(/\.yaml$/, ""), doc: yamlLoad(await readFile(join(dir, f), "utf-8")) as Record<string, unknown> });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

try {
  const agents = ["alice", "bob", "cliff"];

  // ── Test 1: double terminal transition → exactly one continuation ─────────
  //
  // Two calls for the same task. First spawn inserts C1 into currentGraph;
  // second call sees dependants[t]={C1} non-terminal → skip. Idempotent.

  console.log("\nTest 1: double terminal transition → exactly one continuation");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-WORK", status: "done", from: "bob", kind: "code" }],
      bob: [],
      cliff: [],
    },
  });
  await loadGraphFn(agentsDir, agents);
  const workYaml = await readTaskYaml("TSK-WORK", "done");

  await checkFrontier(workYaml, "TSK-WORK", "alice", agents, agentsDir);
  await checkFrontier(workYaml, "TSK-WORK", "alice", agents, agentsDir); // replay — currentGraph already has C1

  const spawned = await openEnvelopes("bob");
  assert(
    spawned.length === 1,
    "1a: second transition for the same task → still exactly ONE continuation",
    `found ${spawned.length}: [${spawned.map((s) => s.id).join(", ")}]`
  );
  if (spawned.length > 1) {
    const distinctIds = new Set(spawned.map((s) => s.id)).size === spawned.length;
    console.error(
      `    mode: ${distinctIds ? "DUPLICATE ENVELOPES (nextContTaskId minted fresh ids)" : "OVERWRITE (same id reused)"}`
    );
    for (const s of spawned) {
      console.error(`    ${s.id}: kind=${String(s.doc["kind"])} headline=${String(s.doc["headline"])}`);
    }
    assert(
      spawned.every((s) => s.doc["kind"] === "continuation"),
      "1b: every spawned envelope is a continuation (diagnostic)"
    );
  }

  // ── Test 2: after: content — the substance of the join (FDP v1.15) ────────
  //
  // v1.15 uses `after:` (not `needs:`). The completing task is in its own
  // after: block (self-edge). This INVERTS Jess's assertion 2e — re-derived
  // from v1.15: "after: must include the completing task itself so that
  // dependants[t] is populated and the second spawn is refused."

  console.log("\nTest 2: spawned continuation lists every sibling in after: (v1.15 self-edge)");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PARENT" },
        { id: "TSK-WORK2", status: "done", from: "bob", kind: "code", parent: "TSK-PARENT" },
        { id: "TSK-SIB1", from: "bob", parent: "TSK-PARENT" },
        { id: "TSK-SIB2", from: "bob", parent: "TSK-PARENT" },
        // A same-parent task that is already terminal — still a sibling.
        { id: "TSK-SIB3", status: "done", from: "bob", parent: "TSK-PARENT" },
        // Different parent — must NOT be listed.
        { id: "TSK-OTHER", from: "bob", parent: "TSK-UNRELATED" },
      ],
      bob: [],
      cliff: [],
    },
  });
  await loadGraphFn(agentsDir, agents);
  const work2Yaml = await readTaskYaml("TSK-WORK2", "done");

  await checkFrontier(work2Yaml, "TSK-WORK2", "alice", agents, agentsDir);

  const cont = (await openEnvelopes("bob")).filter((s) => s.doc["kind"] === "continuation");
  assert(cont.length === 1, "2a: exactly one continuation spawned");
  if (cont.length === 1) {
    const after = cont[0]!.doc["after"];
    assert(Array.isArray(after), "2b: continuation carries an after: block (v1.15 — not needs:)");
    if (Array.isArray(after)) {
      const got = [...(after as string[])].sort();
      // v1.15: after: = family = completing task (self-edge) + all siblings sharing parent
      const exp = ["TSK-SIB1", "TSK-SIB2", "TSK-SIB3", "TSK-WORK2"].sort();
      assert(
        got.length === exp.length && got.every((v, i) => v === exp[i]),
        "2c: after: covers completing task + every sibling sharing the parent",
        `expected [${exp.join(", ")}] got [${got.join(", ")}]`
      );
      assert(
        !(after as string[]).includes("TSK-OTHER"),
        "2d: tasks under a different parent are NOT listed"
      );
      // v1.15 INVERTS Jess's 2e: the completing task IS in after: (self-edge).
      // Without this, dependants[TSK-WORK2] is empty and the second spawn guard
      // is blind to the first spawn.
      assert(
        (after as string[]).includes("TSK-WORK2"),
        "2e: (v1.15 — inverted from Jess 2e) completing task IS in after: (self-edge)"
      );
    }
  }

  // ── Test 3: reply_to overrides from ────────────────────────────────────────

  console.log("\nTest 3: reply_to override — target := reply_to ?? from");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-WORK5", status: "done", from: "bob", reply_to: "cliff", kind: "code" }],
      bob: [],
      cliff: [],
    },
  });
  await loadGraphFn(agentsDir, agents);
  const work5Yaml = await readTaskYaml("TSK-WORK5", "done");

  await checkFrontier(work5Yaml, "TSK-WORK5", "alice", agents, agentsDir);

  const toCliff = (await openEnvelopes("cliff")).filter((s) => s.doc["kind"] === "continuation");
  const toBob = (await openEnvelopes("bob")).filter((s) => s.doc["kind"] === "continuation");
  assert(toCliff.length === 1, "3a: continuation lands on cliff (reply_to wins)");
  assert(toBob.length === 0, "3b: nothing spawned to bob (from is overridden)", `bob got ${toBob.length}`);
  if (toCliff.length === 1) {
    assert(toCliff[0]!.doc["to"] === "cliff", "3c: envelope addressed to: cliff");
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nfrontier-integrity: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
