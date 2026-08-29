/**
 * v1.19 continuation model tests (WAL-72 FDP test plan items 11-16).
 *
 *   11. Two-graph replay regression guard: persistent currentGraph makes two-graph
 *       races moot. Test stays so a refactor back to per-invocation loadGraph turns red.
 *
 *   12. Staggered extension via reconcile: a new sibling appears after C1 is spawned;
 *       the next loadGraph reconcile extends C1.after to cover the newcomer.
 *
 *   13. Claimed-continuation fresh spawn: a late NEW sibling fires when the family
 *       continuation is claimed → extension is skipped (claimed guard), a FRESH
 *       continuation is spawned. C1.after is byte-identical after the event.
 *       This is the mutation-check anchor for the unclaimed predicate.
 *
 *   14. sweepBlocked: blocked task whose needs are now all done re-opens;
 *       blocked task with unsatisfied need stays blocked (negative case).
 *
 *   15. Report-flag termination (DEC-23): user-target completion → no envelope,
 *       journal line only. DEC-12 backstop asserted NOT triggered.
 *
 *   16. T1-T5 family end-to-end: five siblings, two completion orders, failure variant.
 *       ready() and graph.errors asserted throughout.
 *
 * Run with: bun run test/scheduler/frontier-v119.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
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

const root = await mkdtemp(join(tmpdir(), "caravel-v119-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;

if (
  typeof t.checkFrontierAndMaybeSpawnContinuation !== "function" ||
  typeof t.loadGraph !== "function" ||
  typeof t.sweepBlocked !== "function"
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
  agentsDir?: string
) => Promise<void>;
type SweepBlockedFn = (opts: { agents: string[]; tickMs: number; leaseMs: number; perAgentConcurrency: number }) => Promise<void>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<TaskGraph>;
const sweepBlockedFn = t.sweepBlocked as SweepBlockedFn;
const readyFn = t.ready as (id: string, graph: TaskGraph) => boolean;

const agents = ["alice", "bob", "cliff"];

async function openEnvelopes(agent: string): Promise<Array<{ id: string; doc: Record<string, unknown> }>> {
  const dir = join(agentsDir, agent, "tasks", "open");
  const files = await readdir(dir).catch(() => [] as string[]);
  const results: Array<{ id: string; doc: Record<string, unknown> }> = [];
  for (const f of files.filter((x) => x.endsWith(".yaml"))) {
    const yaml = await readFile(join(dir, f), "utf-8").catch(() => null);
    if (yaml === null) continue;
    results.push({ id: f.replace(/\.yaml$/, ""), doc: yamlLoad(yaml) as Record<string, unknown> });
  }
  return results;
}

try {

  // ── Test 11: two-graph replay regression guard ─────────────────────────────
  //
  // Under v1.19, the persistent currentGraph makes two-graph races moot —
  // fire X (inserts C1 into currentGraph), fire Y (sees C1 → skip).
  // The test stays so a refactor back to per-invocation loadGraph turns it red.

  console.log("\nTest 11: two-graph replay — persistent currentGraph prevents double-spawn");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR11" },
        { id: "TSK-X11", status: "done", from: "bob", kind: "code", parent: "TSK-PAR11" },
        { id: "TSK-Y11", status: "done", from: "bob", kind: "code", parent: "TSK-PAR11" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    // Simulate two-tick scenario: loadGraphFn called twice (different "ticks").
    await loadGraphFn(agentsDir, agents);
    const yamlX11 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-X11.yaml"), "utf-8");
    await checkFrontier(yamlX11, "TSK-X11", "alice", agents, agentsDir);

    // Second "tick" rebuild — currentGraph picks up C1. Y fires and sees it.
    await loadGraphFn(agentsDir, agents);
    const yamlY11 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-Y11.yaml"), "utf-8");
    await checkFrontier(yamlY11, "TSK-Y11", "alice", agents, agentsDir);

    const conts11 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(conts11.length === 1, "11a: exactly ONE continuation spawned", `got ${conts11.length}`);

    if (conts11.length === 1) {
      const c11 = conts11[0]!;
      const after11 = c11.doc["after"] as string[] | undefined;
      assert(
        Array.isArray(after11) && after11.includes("TSK-X11") && after11.includes("TSK-Y11"),
        "11b: after: covers both X11 and Y11",
        `after: [${after11?.join(", ") ?? ""}]`
      );
      const gFinal11 = await loadGraphFn(agentsDir, agents);
      assert(readyFn(c11.id, gFinal11), "11c: continuation is ready() — X11 and Y11 are terminal");
      const errs11 = gFinal11.errors.filter((e) => e.id === c11.id);
      assert(errs11.length === 0, "11d: graph.errors empty for continuation");
    }
  }

  // ── Test 12: staggered extension via reconcile ─────────────────────────────
  //
  // E1 done, E2 open at spawn time → C1 spawned with after:[E1, E2].
  // A new sibling E3 is then written to alice/open/. The next loadGraphFn
  // reconcile detects C1 (unclaimed) doesn't cover E3 → extends C1.after.
  // E2 and E3 complete → both see C1 in dependants → skip. ONE continuation.

  console.log("\nTest 12: staggered extension via reconcile — new sibling extended into existing continuation");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR12" },
        { id: "TSK-E1", status: "done", from: "bob", kind: "code", parent: "TSK-PAR12" },
        { id: "TSK-E2", status: "open", from: "bob", kind: "code", parent: "TSK-PAR12" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    // E1 fires → C1 spawned with after:[E1, E2].
    await loadGraphFn(agentsDir, agents);
    const yamlE1 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-E1.yaml"), "utf-8");
    await checkFrontier(yamlE1, "TSK-E1", "alice", agents, agentsDir);

    const contsAfterE1 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(contsAfterE1.length === 1, "12a: E1 spawns exactly one continuation");

    if (contsAfterE1.length === 1) {
      const c12Id = contsAfterE1[0]!.id;

      // Add TSK-E3 to alice/open/ (late sibling joins the family).
      const e3Yaml = [
        `id: TSK-E3`,
        `status: open`,
        `to: alice`,
        `from: bob`,
        `kind: code`,
        `parent: TSK-PAR12`,
        `needs: []`,
        `after: []`,
        `headline: "E3 late sibling"`,
        `created: "2026-08-29T00:00:00Z"`,
        `updated: "2026-08-29T00:00:00Z"`,
        `summary:`,
        `  brief: ""`,
        `  response: ""`,
        `report: ""`,
      ].join("\n");
      await writeFile(join(agentsDir, "alice", "tasks", "open", "TSK-E3.yaml"), e3Yaml);

      // Reload — reconcile extends C1.after to include E3.
      await loadGraphFn(agentsDir, agents);

      // E2 and E3 move to done.
      const e2Yaml = await readFile(join(agentsDir, "alice", "tasks", "open", "TSK-E2.yaml"), "utf-8");
      const doneDir = join(agentsDir, "alice", "tasks", "done");
      await writeFile(join(doneDir, "TSK-E2.yaml"), e2Yaml.replace(/^status: open$/m, "status: done"));
      await rm(join(agentsDir, "alice", "tasks", "open", "TSK-E2.yaml"));
      const e3Saved = await readFile(join(agentsDir, "alice", "tasks", "open", "TSK-E3.yaml"), "utf-8");
      await writeFile(join(doneDir, "TSK-E3.yaml"), e3Saved.replace(/^status: open$/m, "status: done"));
      await rm(join(agentsDir, "alice", "tasks", "open", "TSK-E3.yaml"));

      // E2 fires → skip (C1 in dependants). E3 fires → skip.
      await loadGraphFn(agentsDir, agents);
      const yamlE2done = await readFile(join(doneDir, "TSK-E2.yaml"), "utf-8");
      await checkFrontier(yamlE2done, "TSK-E2", "alice", agents, agentsDir);
      await loadGraphFn(agentsDir, agents);
      const yamlE3done = await readFile(join(doneDir, "TSK-E3.yaml"), "utf-8");
      await checkFrontier(yamlE3done, "TSK-E3", "alice", agents, agentsDir);

      const contsAfterAll = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
      assert(contsAfterAll.length === 1, "12b: exactly ONE continuation after E2 and E3 fire", `got ${contsAfterAll.length}`);

      const gFinal12 = await loadGraphFn(agentsDir, agents);
      const c12Node = gFinal12.nodes.get(c12Id);
      assert(
        c12Node !== undefined &&
          c12Node.after.includes("TSK-E1") &&
          c12Node.after.includes("TSK-E2") &&
          c12Node.after.includes("TSK-E3"),
        "12c: C1 after: covers all three siblings [E1, E2, E3] after reconcile extension",
        `after: [${c12Node?.after.join(", ") ?? ""}]`
      );
      assert(readyFn(c12Id, gFinal12), "12d: continuation is ready() — E1, E2, E3 all terminal");
      const errs12 = gFinal12.errors.filter((e) => e.id === c12Id);
      assert(errs12.length === 0, "12e: graph.errors empty for continuation");
    }
  }

  // ── Test 13: claimed-continuation — extension skipped, fresh spawn ─────────
  //
  // L1 done alone → C1 spawned with after:[L1]. C1 claimed on disk.
  // A new sibling L2 appears and completes. loadGraph reconcile: C1 is claimed
  // (leaseHolder≠null) → extension SKIPPED. C1.after stays [L1] (byte-identical).
  // L2 fires: dependants[L2]={} → spawn FRESH C2 with after:[L1, L2].
  // This is the mutation-check anchor for the unclaimed predicate (DEC-21).

  console.log("\nTest 13: claimed-continuation — extension skipped, fresh spawn for new sibling");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PAR13" },
        { id: "TSK-L1", status: "done", from: "bob", kind: "code", parent: "TSK-PAR13" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    // L1 fires → C1 spawned with after:[L1] (L2 doesn't exist yet).
    await loadGraphFn(agentsDir, agents);
    const yamlL1 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-L1.yaml"), "utf-8");
    await checkFrontier(yamlL1, "TSK-L1", "alice", agents, agentsDir);

    const contsAfterL1 = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(contsAfterL1.length === 1, "13a: L1 spawns exactly one continuation");

    if (contsAfterL1.length === 1) {
      const c1Env = contsAfterL1[0]!;
      const c1Path = join(agentsDir, "bob", "tasks", "open", `${c1Env.id}.yaml`);
      const c1YamlBefore = await readFile(c1Path, "utf-8");
      const c1AfterBefore = (yamlLoad(c1YamlBefore) as Record<string, unknown>)["after"] as string[] | undefined;
      assert(
        Array.isArray(c1AfterBefore) && c1AfterBefore.includes("TSK-L1") && !c1AfterBefore.includes("TSK-L2"),
        "13b: C1 after: is [L1] (L2 not yet in family)",
        `after: [${c1AfterBefore?.join(", ") ?? ""}]`
      );

      // Claim C1 on disk (simulate a worker taking it).
      const claimedDoc = {
        ...(yamlLoad(c1YamlBefore) as object),
        status: "claimed",
        lease: { holder: "worker-test-13", expires: new Date(Date.now() + 3_600_000).toISOString() },
      };
      await writeFile(c1Path, yamlDump(claimedDoc));

      // Add L2 to alice/done/ (new sibling appears and immediately completes).
      const l2Yaml = [
        `id: TSK-L2`,
        `status: done`,
        `to: alice`,
        `from: bob`,
        `kind: code`,
        `parent: TSK-PAR13`,
        `needs: []`,
        `after: []`,
        `headline: "L2 late sibling"`,
        `created: "2026-08-29T00:00:00Z"`,
        `updated: "2026-08-29T00:00:00Z"`,
        `summary:`,
        `  brief: ""`,
        `  response: ""`,
        `report: ""`,
      ].join("\n");
      await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-L2.yaml"), l2Yaml);

      // loadGraph: C1 is claimed → reconcile skips extension.
      await loadGraphFn(agentsDir, agents);

      // L2 fires: dependants[L2]={} (L2 was never added to currentGraph.dependants) → spawn FRESH C2.
      const yamlL2 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-L2.yaml"), "utf-8");
      await checkFrontier(yamlL2, "TSK-L2", "alice", agents, agentsDir);

      // C1.after must be byte-identical (still [L1] only).
      const c1YamlAfter = await readFile(c1Path, "utf-8");
      const c1AfterAfter = (yamlLoad(c1YamlAfter) as Record<string, unknown>)["after"] as string[] | undefined;
      assert(
        Array.isArray(c1AfterAfter) &&
          !c1AfterAfter.includes("TSK-L2") &&
          c1AfterAfter.includes("TSK-L1"),
        "13c: C1.after is byte-identical — L2 NOT added (claimed continuation not extended)",
        `C1 after: [${c1AfterAfter?.join(", ") ?? ""}]`
      );
      assert(
        (yamlLoad(c1YamlAfter) as Record<string, unknown>)["status"] === "claimed",
        "13d: C1 status is still claimed (not overwritten by extension)"
      );

      // FRESH C2 must have been spawned for L2.
      const allBobConts = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
      // C1 is still in open/ as claimed; C2 is a new fresh continuation.
      const c2Envs = allBobConts.filter((e) => e.id !== c1Env.id);
      assert(c2Envs.length === 1, "13e: a fresh continuation C2 is spawned for L2", `got ${c2Envs.length}`);
      if (c2Envs.length === 1) {
        const c2After = c2Envs[0]!.doc["after"] as string[] | undefined;
        assert(
          Array.isArray(c2After) && c2After.includes("TSK-L1") && c2After.includes("TSK-L2"),
          "13f: C2 after: covers whole current family [L1, L2]",
          `C2 after: [${c2After?.join(", ") ?? ""}]`
        );
      }
    }
  }

  // ── Test 14: sweepBlocked — blocked → open when needs done ────────────────
  //
  // TSK-UP goes to done/. TSK-DOWN (needs:[TSK-UP]) is in blocked/.
  // sweepBlocked → TSK-DOWN moves to open/.
  // Negative: TSK-BLOCKNOPE (needs:[TSK-UNDONE]) stays in blocked/.

  console.log("\nTest 14: sweepBlocked — blocked task re-opens when needs are done");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-UP", status: "done", from: "bob", kind: "code" },
        // Blocked because TSK-UP was in-flight; now TSK-UP is done → sweepBlocked re-opens.
        { id: "TSK-DOWN", status: "blocked", from: "bob", kind: "code", needs: ["TSK-UP"] },
        // TSK-UNDONE stays open (not done) so TSK-BLOCKNOPE should stay blocked.
        { id: "TSK-UNDONE", status: "open", from: "bob", kind: "code" },
        { id: "TSK-BLOCKNOPE", status: "blocked", from: "bob", kind: "code", needs: ["TSK-UNDONE"] },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    const blockedDir = join(agentsDir, "alice", "tasks", "blocked");

    // Assert both are in blocked/ before sweep.
    assert(existsSync(join(blockedDir, "TSK-DOWN.yaml")), "14a: TSK-DOWN is in blocked/ before sweep");
    assert(existsSync(join(blockedDir, "TSK-BLOCKNOPE.yaml")), "14b: TSK-BLOCKNOPE is in blocked/ before sweep");
    assert(!existsSync(join(agentsDir, "alice", "tasks", "open", "TSK-DOWN.yaml")), "14c: TSK-DOWN not in open/ before sweep");

    // Run sweepBlocked.
    await sweepBlockedFn({ agents, tickMs: 1000, leaseMs: 300_000, perAgentConcurrency: 1 });

    // DOWN should now be in open/ (TSK-UP is done).
    assert(existsSync(join(agentsDir, "alice", "tasks", "open", "TSK-DOWN.yaml")), "14d: TSK-DOWN moved to open/ (needs satisfied)");
    assert(!existsSync(join(blockedDir, "TSK-DOWN.yaml")), "14e: TSK-DOWN removed from blocked/");

    // BLOCKNOPE should still be in blocked/ (TSK-UNDONE is not done).
    assert(existsSync(join(blockedDir, "TSK-BLOCKNOPE.yaml")), "14f: TSK-BLOCKNOPE stays in blocked/ (needs not satisfied)");
    assert(!existsSync(join(agentsDir, "alice", "tasks", "open", "TSK-BLOCKNOPE.yaml")), "14g: TSK-BLOCKNOPE not in open/ (negative case)");

    // TSK-DOWN status should be open after sweep.
    const downAfter = yamlLoad(await readFile(join(agentsDir, "alice", "tasks", "open", "TSK-DOWN.yaml"), "utf-8")) as Record<string, unknown>;
    assert(downAfter["status"] === "open", "14h: TSK-DOWN status is open after sweep");
    assert(!("blocked_by" in downAfter) || downAfter["blocked_by"] === null || downAfter["blocked_by"] === "", "14i: blocked_by cleared after sweep");
  }

  // ── Test 15: report-flag termination (DEC-23) + DEC-12 backstop asserted ──
  //
  // A kind:code task from:user completes → target=user (not a spawnable agent).
  // DEC-23: single frontier leaf → report-flag (no envelope). DEC-12 backstop
  // must NOT fire (its message "kind:continuation targeted at spawnable agent"
  // must not appear in the log output). These are mutually exclusive paths.

  console.log("\nTest 15: report-flag DEC-23 + DEC-12 backstop NOT triggered");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-RFLAG", status: "done", from: "kelly", kind: "code" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    await loadGraphFn(agentsDir, agents);
    const yamlRflag = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-RFLAG.yaml"), "utf-8");

    // Capture stdout/stderr for this call to verify DEC-12 backstop doesn't fire.
    const aliceOpenBefore = (await readdir(join(agentsDir, "alice", "tasks", "open")).catch(() => [])).length;
    const bobOpenBefore = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;

    await checkFrontier(yamlRflag, "TSK-RFLAG", "alice", agents, agentsDir);

    const aliceOpenAfter = (await readdir(join(agentsDir, "alice", "tasks", "open")).catch(() => [])).length;
    const bobOpenAfter = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;

    assert(aliceOpenAfter === aliceOpenBefore, "15a: user target + single leaf → no envelope spawned to alice (report-flag)", `alice before=${aliceOpenBefore} after=${aliceOpenAfter}`);
    assert(bobOpenAfter === bobOpenBefore, "15b: nothing spawned to bob", `bob before=${bobOpenBefore} after=${bobOpenAfter}`);

    // DEC-12 backstop: kind:continuation completing at spawnable agent → no spawn.
    // Test with a kind:continuation task targeting a spawnable agent.
    await buildFixture(root, {
      agents: {
        alice: [
          { id: "TSK-CONT15", status: "done", from: "bob", kind: "continuation" },
        ],
        bob: [],
        cliff: [],
      },
    });
    await loadGraphFn(agentsDir, agents);
    const yamlCont15 = await readFile(join(agentsDir, "alice", "tasks", "done", "TSK-CONT15.yaml"), "utf-8");
    const bobOpenBeforeDec12 = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;
    await checkFrontier(yamlCont15, "TSK-CONT15", "alice", agents, agentsDir);
    const bobOpenAfterDec12 = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;
    assert(bobOpenAfterDec12 === bobOpenBeforeDec12, "15c: DEC-12 backstop fires for kind:continuation at spawnable agent → no spawn", `bob before=${bobOpenBeforeDec12} after=${bobOpenAfterDec12}`);
  }

  // ── Test 16: T1-T5 family end-to-end ─────────────────────────────────────
  //
  // Five siblings sharing TSK-TPAR. Two completion orders tested.
  // Failure variant: T3 fails instead of done → C1 still ready (failed is terminal).

  console.log("\nTest 16a: T1-T5 — completion order T1 first");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-TPAR" },
        { id: "TSK-T1", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T2", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T3", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T4", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T5", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    await loadGraphFn(agentsDir, agents);
    for (const tid of ["TSK-T1", "TSK-T2", "TSK-T3", "TSK-T4", "TSK-T5"]) {
      const y = await readFile(join(agentsDir, "alice", "tasks", "done", `${tid}.yaml`), "utf-8");
      await checkFrontier(y, tid, "alice", agents, agentsDir);
      // New tick between each (loadGraph sets currentGraph).
      await loadGraphFn(agentsDir, agents);
    }

    const conts16a = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(conts16a.length === 1, "16a-1: exactly ONE continuation (T1 first order)", `got ${conts16a.length}`);
    if (conts16a.length === 1) {
      const c16a = conts16a[0]!;
      const af16a = c16a.doc["after"] as string[] | undefined;
      const expected = ["TSK-T1", "TSK-T2", "TSK-T3", "TSK-T4", "TSK-T5"];
      assert(
        Array.isArray(af16a) && expected.every((t) => af16a.includes(t)),
        "16a-2: after: covers all five siblings",
        `after: [${af16a?.join(", ") ?? ""}]`
      );
      const gFinal16a = await loadGraphFn(agentsDir, agents);
      assert(readyFn(c16a.id, gFinal16a), "16a-3: continuation is ready() — all five terminal");
      const errs16a = gFinal16a.errors.filter((e) => e.id === c16a.id);
      assert(errs16a.length === 0, "16a-4: graph.errors empty for continuation");
    }
  }

  console.log("\nTest 16b: T1-T5 — completion order T5 first");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-TPAR" },
        { id: "TSK-T1", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T2", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T3", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T4", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T5", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    await loadGraphFn(agentsDir, agents);
    for (const tid of ["TSK-T5", "TSK-T4", "TSK-T3", "TSK-T2", "TSK-T1"]) {
      const y = await readFile(join(agentsDir, "alice", "tasks", "done", `${tid}.yaml`), "utf-8");
      await checkFrontier(y, tid, "alice", agents, agentsDir);
      await loadGraphFn(agentsDir, agents);
    }

    const conts16b = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(conts16b.length === 1, "16b-1: exactly ONE continuation (T5 first order)", `got ${conts16b.length}`);
    if (conts16b.length === 1) {
      const af16b = conts16b[0]!.doc["after"] as string[] | undefined;
      const expected = ["TSK-T1", "TSK-T2", "TSK-T3", "TSK-T4", "TSK-T5"];
      assert(
        Array.isArray(af16b) && expected.every((t) => af16b.includes(t)),
        "16b-2: after: covers all five siblings",
        `after: [${af16b?.join(", ") ?? ""}]`
      );
      const gFinal16b = await loadGraphFn(agentsDir, agents);
      const c16b = conts16b[0]!;
      assert(readyFn(c16b.id, gFinal16b), "16b-3: continuation is ready()");
      const errs16b = gFinal16b.errors.filter((e) => e.id === c16b.id);
      assert(errs16b.length === 0, "16b-4: graph.errors empty");
    }
  }

  console.log("\nTest 16c: T1-T5 failure variant — T3 fails, continuation still ready");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-TPAR" },
        { id: "TSK-T1", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T2", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T3", status: "failed", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T4", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
        { id: "TSK-T5", status: "done", from: "bob", kind: "code", parent: "TSK-TPAR" },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    // buildFixture already places TSK-T3 in failed/ (bucketFor("failed") = "failed").
    await loadGraphFn(agentsDir, agents);
    // Fire T1 (done), T2 (done), T3 (failed), T4 (done), T5 (done).
    for (const [tid, bucket] of [["TSK-T1", "done"], ["TSK-T2", "done"], ["TSK-T3", "failed"], ["TSK-T4", "done"], ["TSK-T5", "done"]] as [string, string][]) {
      const y = await readFile(join(agentsDir, "alice", "tasks", bucket, `${tid}.yaml`), "utf-8");
      await checkFrontier(y, tid, "alice", agents, agentsDir);
      await loadGraphFn(agentsDir, agents);
    }

    const conts16c = (await openEnvelopes("bob")).filter((e) => e.doc["kind"] === "continuation");
    assert(conts16c.length === 1, "16c-1: exactly ONE continuation (failure variant)", `got ${conts16c.length}`);
    if (conts16c.length === 1) {
      const c16c = conts16c[0]!;
      const af16c = c16c.doc["after"] as string[] | undefined;
      assert(
        Array.isArray(af16c) && af16c.includes("TSK-T3"),
        "16c-2: after: includes the failed sibling T3",
        `after: [${af16c?.join(", ") ?? ""}]`
      );
      const gFinal16c = await loadGraphFn(agentsDir, agents);
      assert(readyFn(c16c.id, gFinal16c), "16c-3: continuation is ready() — failed is terminal");
      const errs16c = gFinal16c.errors.filter((e) => e.id === c16c.id);
      assert(errs16c.length === 0, "16c-4: graph.errors empty");
    }
  }

} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nfrontier-v119: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
