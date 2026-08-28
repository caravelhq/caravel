/**
 * Frontier integrity tests (WAL-72 Phase 2 review, TSK-2026-08-27-0005.12).
 *
 * Three behaviours Bob's frontier suite (frontier.test.ts, 8 assertions)
 * does not cover, checked against FDP v1.8 intent:
 *
 *   1. Double terminal transition for the same task must still leave
 *      exactly ONE continuation. The old machinery guarded this with
 *      findExistingAliceContinuation; checkFrontierAndMaybeSpawnContinuation
 *      has no equivalent existence check, and double-transition is a
 *      demonstrated failure mode in this codebase (WAL-71 stale-claim
 *      replay). The FDP's spawn rule ("on any terminal transition … spawn")
 *      was written assuming each task terminates once.
 *   2. The spawned continuation's `needs:` must cover every sibling sharing
 *      the parent — that block is the substance of the join (FDP §Continuations).
 *   3. `reply_to` must actually override `from` (target := reply_to ?? from).
 *
 * Run with: bun run test/scheduler/frontier-integrity.test.ts
 * Exits 0 on all pass, 1 on any failure. A failure here is a finding for
 * Bob/Cliff — this suite never edits the runner to go green.
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

// ── setup: pin AGENTS_DIR via cwd BEFORE importing multiAgent ────────────────
// The fixture root IS the process cwd; fixtures live under root/agents, which
// is also what nextTaskId scans (it reads module-level AGENTS_DIR, not the
// agentsDir argument — see the note in the task report). Keeping all three on
// root/agents is what makes the second spawn visible to the id allocator.

const root = await mkdtemp(join(tmpdir(), "caravel-frontier-integrity-"));
process.chdir(root);
const agentsDir = join(root, "agents");

type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir?: string
) => Promise<void>;

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;
if (typeof t.checkFrontierAndMaybeSpawnContinuation !== "function") {
  console.error("SKIP: __testing.checkFrontierAndMaybeSpawnContinuation not available");
  process.exit(0);
}
const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;

// Read the yaml arg back for a declared task — checkFrontier receives the
// envelope text, so the fixture on disk is the source for it.
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
  // The WAL-71 replay class: a terminal transition firing twice for the same
  // task (stale-claim re-open, worker replay). The spawn authority has no
  // existence guard; nextTaskId mints from a directory scan.

  console.log("\nTest 1: double terminal transition → exactly one continuation");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-WORK", status: "done", from: "bob", kind: "code" }],
      bob: [],
      cliff: [],
    },
  });
  const workYaml = await readTaskYaml("TSK-WORK", "done");

  await checkFrontier(workYaml, "TSK-WORK", "alice", agents, agentsDir);
  await checkFrontier(workYaml, "TSK-WORK", "alice", agents, agentsDir); // replay

  const spawned = await openEnvelopes("bob");
  assert(
    spawned.length === 1,
    "1a: second transition for the same task → still exactly ONE continuation",
    `found ${spawned.length}: [${spawned.map((s) => s.id).join(", ")}]`
  );
  if (spawned.length > 1) {
    // Diagnosis for the finding: fresh ids (duplicate envelopes) or same id
    // (overwrite)? And both address the same completed task?
    const distinctIds = new Set(spawned.map((s) => s.id)).size === spawned.length;
    console.error(
      `    mode: ${distinctIds ? "DUPLICATE ENVELOPES (nextTaskId minted fresh ids)" : "OVERWRITE (same id reused)"}`
    );
    for (const s of spawned) {
      console.error(`    ${s.id}: kind=${String(s.doc["kind"])} headline=${String(s.doc["headline"])}`);
    }
    assert(
      spawned.every((s) => s.doc["kind"] === "continuation"),
      "1b: every spawned envelope is a continuation (diagnostic — both address TSK-WORK)"
    );
  }

  // ── Test 2: sibling needs content — the substance of the join ─────────────

  console.log("\nTest 2: spawned continuation lists every sibling in needs:");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PARENT" },
        { id: "TSK-WORK2", status: "done", from: "bob", kind: "code", parent: "TSK-PARENT" },
        { id: "TSK-SIB1", from: "bob", parent: "TSK-PARENT" },
        { id: "TSK-SIB2", from: "bob", parent: "TSK-PARENT" },
        // A same-parent task that is already terminal — still a sibling per
        // the FDP text ("every sibling sharing t.parent"); no filter is specified.
        { id: "TSK-SIB3", status: "done", from: "bob", parent: "TSK-PARENT" },
        // Different parent — must NOT be listed.
        { id: "TSK-OTHER", from: "bob", parent: "TSK-UNRELATED" },
      ],
      bob: [],
      cliff: [],
    },
  });
  const work2Yaml = await readTaskYaml("TSK-WORK2", "done");

  await checkFrontier(work2Yaml, "TSK-WORK2", "alice", agents, agentsDir);

  const cont = (await openEnvelopes("bob")).filter((s) => s.doc["kind"] === "continuation");
  assert(cont.length === 1, "2a: exactly one continuation spawned");
  if (cont.length === 1) {
    const needs = cont[0]!.doc["needs"];
    assert(Array.isArray(needs), "2b: continuation carries a needs block");
    if (Array.isArray(needs)) {
      const got = [...(needs as string[])].sort();
      const exp = ["TSK-SIB1", "TSK-SIB2", "TSK-SIB3"].sort();
      assert(
        got.length === exp.length && got.every((v, i) => v === exp[i]),
        "2c: needs covers every sibling sharing the parent (open AND done)",
        `expected [${exp.join(", ")}] got [${got.join(", ")}]`
      );
      assert(
        !(needs as string[]).includes("TSK-OTHER"),
        "2d: tasks under a different parent are NOT listed"
      );
      assert(
        !(needs as string[]).includes("TSK-WORK2"),
        "2e: the completing task itself is not its own continuation dependency"
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
