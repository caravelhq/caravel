/**
 * Continuation guard tests — v1.16 baseline, updated to v1.19 semantics (WAL-72).
 *
 * Tests 1–3 and 5–8 prove the four original v1.16 defects still fixed, re-pointed
 * where DEC-20 (one-per-family) changes the expected outcome:
 *
 *   F1a (staggered family): A completes → C1 spawned. B completes later → reconcile
 *     extends C1's after: to [A, B]. Exactly ONE continuation.
 *
 *   F1b (two-graph replay): persistent currentGraph makes two-graph races moot.
 *     Test stays as a regression guard — a refactor back to per-invocation loadGraph
 *     turns it red.
 *
 *   F2 re-pointed (DEC-20): M reply_to:alice, N reply_to:cliff, same parent.
 *     Under v1.19 one-per-family: ONE continuation to alice covering [M, N].
 *     Previously asserted two; that assertion is withdrawn.
 *
 *   sweepBlockedDependants (#4): failed dep → needs-dependant to blocked/;
 *     after:-dependant untouched. First dedicated coverage.
 *
 *   Tests 5–6: extension is unclaimed-only; paused/waiting continuations extended
 *     without status change; claimed continuations not touched.
 *
 *   Test 7 (v1.18): ready() true, no self-reference, graph.errors clean after extend.
 *
 *   Test 8 re-pointed (DEC-20): multi-sibling, one continuation to alice covers
 *     the whole family; cliff gets none. familyIds excludes kind:continuation nodes.
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
// v1.19: graph parameter dropped from checkFrontierAndMaybeSpawnContinuation;
// frontier checks now use module-level currentGraph (set by loadGraph as a side
// effect). Call sites pass agentsDir directly where graph was.
type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
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

  // Step 1: A completes — rebuild currentGraph, call frontier.
  await loadGraphFn(agentsDir, agents);
  const yamlA = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-A.yaml"), "utf-8");
  await checkFrontier(yamlA, "TSK-A", "alice", agents, agentsDir);

  const afterA = await openEnvelopes("bob");
  assert(afterA.length === 1, "1a: A's completion spawns exactly one continuation");

  // Step 2: B completes — loadGraphFn sets currentGraph (simulates new tick rebuild).
  await loadGraphFn(agentsDir, agents);
  const yamlB = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-B.yaml"), "utf-8");
  await checkFrontier(yamlB, "TSK-B", "alice", agents, agentsDir);

  const afterB = await openEnvelopes("bob");
  assert(
    afterB.length === 1,
    "1b: B's completion extends existing continuation — still exactly ONE",
    `found ${afterB.length}: [${afterB.map((e) => e.id).join(", ")}]`
  );
  if (afterB.length === 1) {
    const c1 = afterB[0]!;
    const afterList = c1.doc["after"] as string[] | undefined;
    assert(
      Array.isArray(afterList) && afterList.includes("TSK-A") && afterList.includes("TSK-B"),
      "1c: extended continuation lists both A and B in after:",
      `after: [${afterList?.join(", ") ?? ""}]`
    );
    const gFinal1 = await loadGraphFn(agentsDir, agents);
    const readyFn1 = t.ready as (id: string, graph: TaskGraph) => boolean;
    assert(readyFn1(c1.id, gFinal1), "1d: continuation is ready() — A and B are terminal");
    const errs1 = gFinal1.errors.filter((e) => e.id === c1.id);
    assert(errs1.length === 0, "1e: graph.errors empty for continuation", `errors: [${errs1.map((e) => e.problem).join("; ")}]`);
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

  // Two-graph replay: under v1.19 the persistent graph makes this moot — X fires,
  // inserts C1 into currentGraph; Y fires and sees dependants[Y]=C1 → skip.
  // Test stays as a regression guard: a refactor back to per-invocation loadGraph turns it red.
  await loadGraphFn(agentsDir, agents);
  const yamlX = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-X.yaml"), "utf-8");
  const yamlY = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Y.yaml"), "utf-8");

  await checkFrontier(yamlX, "TSK-X", "alice", agents, agentsDir);
  await checkFrontier(yamlY, "TSK-Y", "alice", agents, agentsDir);

  const afterXY = await openEnvelopes("bob");
  assert(
    afterXY.length === 1,
    "2a: two-graph variant → exactly ONE continuation (cross-tick blind spot fixed)",
    `found ${afterXY.length}: [${afterXY.map((e) => e.id).join(", ")}]`
  );
  if (afterXY.length === 1) {
    const c2 = afterXY[0]!;
    const afterList = c2.doc["after"] as string[] | undefined;
    assert(
      Array.isArray(afterList) && afterList.includes("TSK-X") && afterList.includes("TSK-Y"),
      "2b: continuation lists both X and Y in after:",
      `after: [${afterList?.join(", ") ?? ""}]`
    );
    const gFinal2 = await loadGraphFn(agentsDir, agents);
    const readyFn2 = t.ready as (id: string, graph: TaskGraph) => boolean;
    assert(readyFn2(c2.id, gFinal2), "2c: continuation is ready() — X and Y are terminal");
    const errs2 = gFinal2.errors.filter((e) => e.id === c2.id);
    assert(errs2.length === 0, "2d: graph.errors empty for continuation", `errors: [${errs2.map((e) => e.problem).join("; ")}]`);
  }

  // ── Test 3: F2 re-pointed — one continuation per family (DEC-20) ───────────
  //
  // M has reply_to:alice, N has reply_to:cliff, same parent TSK-PAR3.
  // Under v1.19 one-per-family: M fires first → C1 to alice after:[M,N].
  // N fires → dependants[N]={C1}, non-terminal → skip. Total: 1 continuation.

  console.log("\nTest 3: F2 re-pointed — one per family (DEC-20), M fires first → alice only");

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

  await loadGraphFn(agentsDir, agents);
  const yamlM = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-M.yaml"), "utf-8");
  const yamlN = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-N.yaml"), "utf-8");

  await checkFrontier(yamlM, "TSK-M", "alice", agents, agentsDir);
  await checkFrontier(yamlN, "TSK-N", "alice", agents, agentsDir);

  // Filter by kind: continuation — alice's open/ also contains the fixture TSK-PAR3 task.
  const toAlice = (await openEnvelopes("alice")).filter((s) => s.doc["kind"] === "continuation");
  const toCliff = (await openEnvelopes("cliff")).filter((s) => s.doc["kind"] === "continuation");
  assert(toAlice.length === 1, "3a: M fires first → exactly ONE continuation to alice", `alice got ${toAlice.length}`);
  assert(toCliff.length === 0, "3b: N fires second → dependants[N] non-empty → no cliff continuation", `cliff got ${toCliff.length}`);
  if (toAlice.length === 1) {
    const c3 = toAlice[0]!;
    assert(c3.doc["kind"] === "continuation", "3c: alice continuation has kind:continuation");
    const af3 = c3.doc["after"] as string[] | undefined;
    assert(Array.isArray(af3) && af3.includes("TSK-M") && af3.includes("TSK-N"),
      "3d: alice continuation after: covers whole family [M, N]", `after: [${af3?.join(", ") ?? ""}]`);
    const gFinal3 = await loadGraphFn(agentsDir, agents);
    const readyFn3 = t.ready as (id: string, graph: TaskGraph) => boolean;
    assert(readyFn3(c3.id, gFinal3), "3e: continuation is ready() — both M and N are terminal");
    const errs3 = gFinal3.errors.filter((e) => e.id === c3.id);
    assert(errs3.length === 0, "3f: graph.errors empty for continuation", `errors: [${errs3.map((e) => e.problem).join("; ")}]`);
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

  // ── Test 5: v1.17 — paused continuation is extended, not bypassed ─────────
  //
  // DEC-0004 auto-pause moves idle continuations to paused/. Before v1.17,
  // findExistingContinuation only scanned open/+waiting/, so a paused C1 was
  // invisible: B's transition spawned a fresh C2 in open/ alongside the paused
  // one, bypassing the human hold that pause was meant to enforce.
  //
  // After v1.17: bucket list = [open, waiting, paused, blocked].
  // On a paused match, extend after: and leave it paused. Do not spawn C2.

  console.log("\nTest 5: v1.17 — paused continuation is extended, NOT bypassed (DEC-0004 hold)");

  {
    const { rename: fsRename, mkdir: fsMkdir, writeFile: fsWrite } = await import("fs/promises");

    await buildFixture(root, {
      agents: {
        alice: [
          { id: "TSK-PAR5" },
          { id: "TSK-P1", status: "done", from: "bob", kind: "code", parent: "TSK-PAR5" },
          { id: "TSK-P2", status: "done", from: "bob", kind: "code", parent: "TSK-PAR5" },
        ],
        bob: [],
        cliff: [],
      },
    });

    // Step 1: P1 completes → C1 spawned to bob's open/.
    await loadGraphFn(agentsDir, agents);
    const yamlP1 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-P1.yaml"), "utf-8");
    await checkFrontier(yamlP1, "TSK-P1", "alice", agents, agentsDir);

    const openAfterP1 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(openAfterP1.length === 1, "5a: P1 completion spawns exactly one continuation to bob");

    if (openAfterP1.length !== 1) {
      // Can't run the rest of the test without a continuation to move.
      assert(false, "5b: (skipped — precondition 5a failed)");
      assert(false, "5c: (skipped — precondition 5a failed)");
      assert(false, "5d: (skipped — precondition 5a failed)");
      assert(false, "5e: (skipped — precondition 5a failed)");
    } else {
      const c1Id = openAfterP1[0]!.id;
      const c1OpenPath = join(agentsDir, "bob", "tasks", "open", `${c1Id}.yaml`);
      const c1PausedDir = join(agentsDir, "bob", "tasks", "paused");
      const c1PausedPath = join(c1PausedDir, `${c1Id}.yaml`);

      // Step 2: DEC-0004 auto-pause — move C1 to paused/. Update its status field.
      await fsMkdir(c1PausedDir, { recursive: true });
      let c1Yaml = await readFile(c1OpenPath, "utf-8");
      c1Yaml = c1Yaml.replace(/^status: open$/m, "status: paused");
      await fsWrite(c1OpenPath, c1Yaml); // write updated status before rename
      await fsRename(c1OpenPath, c1PausedPath);

      // Step 3: P2 completes with a fresh currentGraph (cross-tick simulation).
      await loadGraphFn(agentsDir, agents);
      const yamlP2 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-P2.yaml"), "utf-8");
      await checkFrontier(yamlP2, "TSK-P2", "alice", agents, agentsDir);

      // Assert: no new continuation in bob's open/.
      const openAfterP2 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
      assert(
        openAfterP2.length === 0,
        "5b: P2 completion does NOT spawn a fresh continuation alongside the paused one",
        `bob open had ${openAfterP2.length} continuation(s): [${openAfterP2.map((e) => e.id).join(", ")}]`
      );

      // Assert: paused C1 still exists (not unpaused, not removed).
      const pausedYaml = await readFile(c1PausedPath, "utf-8").catch(() => null);
      assert(pausedYaml !== null, "5c: C1 remains in paused/ (human hold preserved)");

      if (pausedYaml !== null) {
        const { load: yl } = await import("js-yaml");
        const pausedDoc = yl(pausedYaml) as Record<string, unknown>;
        assert(pausedDoc["status"] === "paused", "5d: C1 status is still paused (not changed by extend)");

        // Assert: after: in the paused envelope now includes P2.
        const afterList = pausedDoc["after"] as string[] | undefined;
        assert(
          Array.isArray(afterList) && afterList.includes("TSK-P2"),
          "5e: paused C1 after: extended to include the late sibling TSK-P2",
          `after: [${afterList?.join(", ") ?? ""}]`
        );

        // Assert all after: deps terminal and graph.errors clean — extension must not
        // introduce a self-reference (which would prevent the task ever becoming ready).
        const gFinal5 = await loadGraphFn(agentsDir, agents);
        const c1Node5 = gFinal5.nodes.get(c1Id);
        const allDepsTerminal5 = c1Node5?.after.every(dep => gFinal5.nodes.get(dep)?.isTerminal ?? false) ?? false;
        assert(allDepsTerminal5, "5f: all after: deps are terminal (would be ready once paused hold lifted)");
        const errs5 = gFinal5.errors.filter((e) => e.id === c1Id);
        assert(errs5.length === 0, "5g: graph.errors empty for C1 (no self-reference)", `errors: [${errs5.map((e) => e.problem).join("; ")}]`);
      }
    }
  }

  // ── Test 6: bucket list pinned — waiting/ is also scanned (not new, confirm) ─
  //
  // Pins waiting/ as a scanned bucket by test observation. The existing Test 1
  // (staggered family) proves open/ is scanned. This confirms waiting/ is too.
  // Uses a pre-placed waiting/ continuation — same probe shape as Test 5.

  console.log("\nTest 6: waiting/ bucket scanned — pre-placed waiting continuation is extended");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR6" },
        { id: "TSK-W1", status: "done", from: "bob", kind: "code", parent: "TSK-PAR6" },
        { id: "TSK-W2", status: "done", from: "bob", kind: "code", parent: "TSK-PAR6" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    const { rename: fsRename, mkdir: fsMkdir, writeFile: fsWrite } = await import("fs/promises");

    // Step 1: W1 completes → C1 spawned to bob's open/.
    await loadGraphFn(agentsDir, agents);
    const yamlW1 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-W1.yaml"), "utf-8");
    await checkFrontier(yamlW1, "TSK-W1", "alice", agents, agentsDir);

    const openAfterW1 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    if (openAfterW1.length === 1) {
      const c1Id = openAfterW1[0]!.id;
      const c1OpenPath = join(agentsDir, "bob", "tasks", "open", `${c1Id}.yaml`);
      const c1WaitDir = join(agentsDir, "bob", "tasks", "waiting");
      const c1WaitPath = join(c1WaitDir, `${c1Id}.yaml`);

      // Step 2: move C1 to waiting/ (e.g. waiting:on:user).
      await fsMkdir(c1WaitDir, { recursive: true });
      let c1Yaml = await readFile(c1OpenPath, "utf-8");
      c1Yaml = c1Yaml.replace(/^status: open$/m, "status: waiting:on:user");
      await fsWrite(c1OpenPath, c1Yaml);
      await fsRename(c1OpenPath, c1WaitPath);

      // Step 3: W2 completes with a fresh currentGraph.
      await loadGraphFn(agentsDir, agents);
      const yamlW2 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-W2.yaml"), "utf-8");
      await checkFrontier(yamlW2, "TSK-W2", "alice", agents, agentsDir);

      const openAfterW2 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
      assert(
        openAfterW2.length === 0,
        "6a: W2 completion does NOT spawn alongside the waiting continuation",
        `bob open had ${openAfterW2.length} continuation(s)`
      );

      const waitYaml = await readFile(c1WaitPath, "utf-8").catch(() => null);
      if (waitYaml !== null) {
        const { load: yl } = await import("js-yaml");
        const waitDoc = yl(waitYaml) as Record<string, unknown>;
        const afterList = waitDoc["after"] as string[] | undefined;
        assert(
          Array.isArray(afterList) && afterList.includes("TSK-W2"),
          "6b: waiting C1 after: extended to include TSK-W2",
          `after: [${afterList?.join(", ") ?? ""}]`
        );
        const gFinal6 = await loadGraphFn(agentsDir, agents);
        const c1Node6 = gFinal6.nodes.get(c1Id);
        const allDepsTerminal6 = c1Node6?.after.every(dep => gFinal6.nodes.get(dep)?.isTerminal ?? false) ?? false;
        assert(allDepsTerminal6, "6c: all after: deps are terminal (would be ready once waiting hold lifted)");
        const errs6 = gFinal6.errors.filter((e) => e.id === c1Id);
        assert(errs6.length === 0, "6d: graph.errors empty for C1", `errors: [${errs6.map((e) => e.problem).join("; ")}]`);
      } else {
        assert(false, "6b: (waiting envelope not readable)");
      }
    } else {
      assert(false, "6a: (skipped — precondition: W1 did not spawn continuation)");
      assert(false, "6b: (skipped — precondition)");
    }
  }

  // ── Test 7: ready() + no self-reference + graph.errors clean (v1.18) ────────
  //
  // The v1.18 bug: familyIds included kind:continuation nodes sharing the same
  // parent. The spawned continuation enrolled itself in its own after:, creating
  // a permanent self-referencing deadlock (ready() = false forever).
  //
  // This test asserts the three invariants that would have caught it:
  //   a) ready(contId, graph) === true after all real siblings are terminal.
  //   b) The continuation's own id is NOT in its after: list.
  //   c) graph.errors is empty for the continuation (no self-reference or cycle).

  console.log("\nTest 7: v1.18 — ready() true after extend, no self-ref, graph.errors clean");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR7" },
        { id: "TSK-Q1", status: "done", from: "bob", kind: "code", parent: "TSK-PAR7" },
        { id: "TSK-Q2", status: "done", from: "bob", kind: "code", parent: "TSK-PAR7" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    // Q1 completes → C1 spawned. Q2 completes with fresh currentGraph → C1 extended.
    await loadGraphFn(agentsDir, agents);
    const yamlQ1 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Q1.yaml"), "utf-8");
    await checkFrontier(yamlQ1, "TSK-Q1", "alice", agents, agentsDir);

    const envsAfterQ1 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    if (envsAfterQ1.length !== 1) {
      assert(false, "7a: (skipped — Q1 did not spawn exactly one continuation)");
      assert(false, "7b: (skipped)");
      assert(false, "7c: (skipped)");
      assert(false, "7d: (skipped)");
    } else {
      const contId = envsAfterQ1[0]!.id;

      await loadGraphFn(agentsDir, agents);
      const yamlQ2 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Q2.yaml"), "utf-8");
      await checkFrontier(yamlQ2, "TSK-Q2", "alice", agents, agentsDir);

      // Reload graph to reflect the extended after: on disk.
      const gFinal = await loadGraphFn(agentsDir, agents);

      // 7a: continuation is schedulable after extend (all real siblings are terminal).
      const readyFn = t.ready as (id: string, graph: TaskGraph) => boolean;
      const isReady = readyFn(contId, gFinal);
      assert(isReady, "7a: ready(contId, graph) === true — continuation is schedulable after extend");

      // 7b: continuation's own id is NOT in its after: list.
      const contNode = gFinal.nodes.get(contId);
      assert(
        contNode !== undefined && !contNode.after.includes(contId),
        "7b: continuation's own id is NOT in its after: list (no self-reference)",
        `after: [${contNode?.after.join(", ") ?? ""}]`
      );

      // 7c: graph.errors has no entry for the continuation (no self-ref or cycle detected).
      const contErrors = gFinal.errors.filter((e) => e.id === contId);
      assert(
        contErrors.length === 0,
        "7c: graph.errors is empty for the continuation (no self-ref or cycle)",
        `errors: [${contErrors.map((e) => e.problem).join("; ")}]`
      );

      // 7d: after: contains exactly the real siblings (Q1 self-edge + Q2), not the cont.
      const afterList = contNode?.after ?? [];
      assert(
        afterList.includes("TSK-Q1") && afterList.includes("TSK-Q2") && !afterList.includes(contId),
        "7d: after: = [TSK-Q1, TSK-Q2] — real siblings only, no continuation id",
        `after: [${afterList.join(", ")}]`
      );
    }
  }

  // ── Test 8: re-pointed — one continuation per family, late third sibling ────
  //
  // M8 fires first (reply_to:alice) → C1 spawned to alice after:[M8,N8,Z8].
  // N8 fires → dependants[N8]={C1} non-terminal → skip.
  // Z8 fires → dependants[Z8]={C1} non-terminal → skip.
  // familyIds must exclude C1 (kind:continuation) — no self-reference.
  // C1 must be ready() and graph.errors clean.

  console.log("\nTest 8: re-pointed — one per family (DEC-20), familyIds excludes continuations, C1 ready()");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR8" },
        { id: "TSK-M8", status: "done", from: "bob", kind: "code", reply_to: "alice", parent: "TSK-PAR8" },
        { id: "TSK-N8", status: "done", from: "bob", kind: "code", reply_to: "cliff", parent: "TSK-PAR8" },
        { id: "TSK-Z8", status: "done", from: "bob", kind: "code", parent: "TSK-PAR8" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    const readyFn = t.ready as (id: string, graph: TaskGraph) => boolean;

    // M8 fires first → C1 spawned. N8 and Z8 see dependants non-empty → skip.
    await loadGraphFn(agentsDir, agents);
    const yamlM8 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-M8.yaml"), "utf-8");
    await checkFrontier(yamlM8, "TSK-M8", "alice", agents, agentsDir);

    await loadGraphFn(agentsDir, agents);
    const yamlN8 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-N8.yaml"), "utf-8");
    await checkFrontier(yamlN8, "TSK-N8", "alice", agents, agentsDir);

    await loadGraphFn(agentsDir, agents);
    const yamlZ8 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Z8.yaml"), "utf-8");
    await checkFrontier(yamlZ8, "TSK-Z8", "alice", agents, agentsDir);

    // Reload graph for final assertions.
    const gFinal8 = await loadGraphFn(agentsDir, agents);

    const aliceConts = (await openEnvelopes("alice")).filter((e) => e.doc["kind"] === "continuation");
    const cliffConts = (await openEnvelopes("cliff")).filter((e) => e.doc["kind"] === "continuation");

    assert(aliceConts.length === 1, "8a: M8 fires first → exactly one continuation to alice", `got ${aliceConts.length}`);
    assert(cliffConts.length === 0, "8b: N8 fires second → dependants[N8] non-empty → no cliff continuation", `got ${cliffConts.length}`);

    if (aliceConts.length === 1) {
      const cAliceId = aliceConts[0]!.id;
      const cAliceNode = gFinal8.nodes.get(cAliceId);

      // Continuation must cover the whole family.
      assert(
        cAliceNode !== undefined &&
          cAliceNode.after.includes("TSK-M8") &&
          cAliceNode.after.includes("TSK-N8") &&
          cAliceNode.after.includes("TSK-Z8"),
        "8c: alice continuation after: covers whole family [M8, N8, Z8]",
        `after: [${cAliceNode?.after.join(", ") ?? ""}]`
      );

      // Continuation must not reference itself (familyIds excludes kind:continuation).
      assert(
        cAliceNode !== undefined && !cAliceNode.after.includes(cAliceId),
        "8d: alice continuation does NOT self-reference in after:",
        `after: [${cAliceNode?.after.join(", ") ?? ""}]`
      );

      // Must be ready — all siblings are terminal.
      const aliceReady = readyFn(cAliceId, gFinal8);
      assert(aliceReady, "8e: alice continuation is ready() — all after: deps terminal");

      // No graph errors.
      const aliceErrors = gFinal8.errors.filter((e) => e.id === cAliceId);
      assert(aliceErrors.length === 0, "8f: no graph.errors for alice continuation");
    }
  }

} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nfrontier-v116: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
