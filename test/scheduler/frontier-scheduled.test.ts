/**
 * v1.19 scheduled-template guard (WAL-84).
 *
 * Proves that the frontier check does NOT spawn a consolidation when the
 * completing task's parent is a recurring schedule template, while a real
 * multi-child fan-out still produces exactly one consolidation.
 *
 * Run with: bun run test/scheduler/frontier-scheduled.test.ts
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

const root = await mkdtemp(join(tmpdir(), "caravel-scheduled-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;

if (
  typeof t.checkFrontierAndMaybeSpawnContinuation !== "function" ||
  typeof t.loadGraph !== "function"
) {
  console.error("SKIP: required __testing exports not available");
  process.exit(0);
}

type TaskGraph = Awaited<ReturnType<typeof ma.loadGraph>>;

// v1.19 API: no graph parameter — loadGraph sets module-level currentGraph,
// checkFrontier reads it. Call loadGraph first, then checkFrontier with (yaml, id, agent, agents).
type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[]
) => Promise<void>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<TaskGraph>;

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

const agents = ["alice", "bob", "cliff"];

// Scheduled template YAML — mimics agents/alice/tasks/scheduled/daily.yaml.
// Key field: id: TSK-SCHED-TEST, plus recurrence: block. Lives in tasks/scheduled/
// so isScheduledTemplateParent() finds it via the directory + id scan.
const SCHED_TEMPLATE_ID = "TSK-SCHED-TEST";
const schedTemplateYaml = [
  `id: ${SCHED_TEMPLATE_ID}`,
  `headline: "Test scheduled template"`,
  `to: alice`,
  `from: user`,
  `kind: other`,
  `status: open`,
  `recurrence:`,
  `  cron: "0 5 * * 1-5"`,
  `  enabled: true`,
].join("\n");

try {
  // ── Test 1: scheduled parent → no consolidation spawned ──────────────────────
  //
  // Three instances of TSK-SCHED-TEST are in done/. When the latest (.03)
  // completes, isScheduledTemplateParent() finds the template in tasks/scheduled/
  // and treats the completing task as a family of one. frontierLeaves.length === 1,
  // so the report-flag path fires and spawns nothing. Alice's open/ count stays the same.

  console.log("\nTest 1: scheduled parent → frontier report-flags, NO consolidation spawned");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: `${SCHED_TEMPLATE_ID}.01`, status: "done", from: "user", kind: "other", parent: SCHED_TEMPLATE_ID },
        { id: `${SCHED_TEMPLATE_ID}.02`, status: "done", from: "user", kind: "other", parent: SCHED_TEMPLATE_ID },
        { id: `${SCHED_TEMPLATE_ID}.03`, status: "done", from: "user", kind: "other", parent: SCHED_TEMPLATE_ID },
      ],
      bob: [],
      cliff: [],
    },
    rawFiles: [
      {
        agent: "alice",
        bucket: "scheduled",
        name: "daily.yaml",
        content: schedTemplateYaml,
      },
    ],
  });

  {
    const aliceOpenBefore = (await openEnvelopes("alice")).length;

    await loadGraphFn(agentsDir, agents);
    const yaml03 = await readFile(
      join(agentsDir, "alice", "tasks", "done", `${SCHED_TEMPLATE_ID}.03.yaml`),
      "utf-8"
    );
    await checkFrontier(yaml03, `${SCHED_TEMPLATE_ID}.03`, "alice", agents);

    const aliceOpenAfter = (await openEnvelopes("alice")).length;

    assert(
      aliceOpenAfter === aliceOpenBefore,
      `1a: scheduled parent → no continuation spawned in alice open/ (before=${aliceOpenBefore}, after=${aliceOpenAfter})`
    );

    const bobOpen = (await openEnvelopes("bob")).length;
    assert(bobOpen === 0, `1b: bob open/ also empty — no consolidation (count=${bobOpen})`);
  }

  // ── Test 2: real fan-out parent → consolidation still spawned ─────────────────
  //
  // Two children share parent TSK-FANOUT-PARENT, a real open task (NOT in scheduled/).
  // Both have from: user (isUserTarget=true). When child B completes with both siblings
  // terminal in the graph, frontierLeaves.length === 2 and a consolidation is spawned.
  // This proves the guard is selective — only template parents are skipped.

  console.log("\nTest 2: real fan-out parent → consolidation IS spawned (guard is selective)");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-FANOUT-PARENT", status: "open", from: "user", kind: "code" },
        { id: "TSK-FANOUT-A", status: "done", from: "user", kind: "code", parent: "TSK-FANOUT-PARENT" },
        { id: "TSK-FANOUT-B", status: "done", from: "user", kind: "code", parent: "TSK-FANOUT-PARENT" },
      ],
      bob: [],
      cliff: [],
    },
    // No rawFiles → no tasks/scheduled/ in this fixture → isScheduledTemplateParent returns false
  });

  {
    // Load graph first (sets currentGraph for frontier check).
    await loadGraphFn(agentsDir, agents);
    const yamlB = await readFile(
      join(agentsDir, "alice", "tasks", "done", "TSK-FANOUT-B.yaml"),
      "utf-8"
    );
    await checkFrontier(yamlB, "TSK-FANOUT-B", "alice", agents);

    const aliceOpen = (await openEnvelopes("alice")).filter(
      (e) => e.doc["kind"] === "continuation"
    );
    assert(
      aliceOpen.length === 1,
      `2a: real fan-out → exactly one consolidation spawned to alice (got ${aliceOpen.length})`
    );

    if (aliceOpen.length === 1) {
      const cont = aliceOpen[0]!;
      const afterList = (cont.doc["after"] as string[] | undefined) ?? [];
      assert(
        afterList.includes("TSK-FANOUT-A") && afterList.includes("TSK-FANOUT-B"),
        "2b: consolidation after: contains both siblings",
        `after: [${afterList.join(", ")}]`
      );
    }
  }

  // ── Test 3: nine scheduled instances — still no consolidation ─────────────────
  //
  // Simulates the 3→4→5→... accumulation measured in production across nine runs.
  // All nine instances share parent TSK-SCHED-TEST (a scheduled template). Frontier
  // check on the last instance must spawn nothing — the guard holds at any family size.

  console.log("\nTest 3: nine scheduled instances — frontier still spawns nothing (accumulation guard)");

  const nineInstances = Array.from({ length: 9 }, (_, i) => ({
    id: `${SCHED_TEMPLATE_ID}.${String(i + 1).padStart(2, "0")}`,
    status: "done" as const,
    from: "user",
    kind: "other",
    parent: SCHED_TEMPLATE_ID,
  }));

  await buildFixture(root, {
    agents: {
      alice: nineInstances,
      bob: [],
      cliff: [],
    },
    rawFiles: [
      {
        agent: "alice",
        bucket: "scheduled",
        name: "daily.yaml",
        content: schedTemplateYaml,
      },
    ],
  });

  {
    const aliceOpenBefore = (await openEnvelopes("alice")).length;

    await loadGraphFn(agentsDir, agents);
    const lastId = `${SCHED_TEMPLATE_ID}.09`;
    const yamlLast = await readFile(
      join(agentsDir, "alice", "tasks", "done", `${lastId}.yaml`),
      "utf-8"
    );
    await checkFrontier(yamlLast, lastId, "alice", agents);

    const aliceOpenAfter = (await openEnvelopes("alice")).length;

    assert(
      aliceOpenAfter === aliceOpenBefore,
      `3a: nine instances → still no consolidation (before=${aliceOpenBefore}, after=${aliceOpenAfter})`
    );
    assert(
      (await openEnvelopes("bob")).length === 0,
      "3b: bob open/ empty too"
    );
  }

} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nfrontier-scheduled: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
