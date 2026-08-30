/**
 * Phase 3W tests — retire waiting:on:* from the runner (WAL-72).
 *
 * Tests in this file:
 *
 *   17. Straggler conversion — stale-claim path (both user and limits variants).
 *       Worker-written rendezvous file with status:waiting:on:user is converted
 *       to done. waiting:on:limits is honoured (parks, not converted).
 *       Mutation: delete `fromReport.kind = "done"` → stays in waiting/ → fails 17a.
 *
 *   18. Limits-park survival — stale-claim path.
 *       Rendezvous file with waiting_on:limits → task moves to waiting/ (not done/).
 *       Mutation: delete `if (onSpec !== "limits")` check → limits converted to done → fails 18a.
 *
 *   19. depends_on → needs shim at graph-load time.
 *       Legacy `depends_on: task:TSK-X` envelope → loadGraph treats it as needs:[X].
 *       ready() returns false when X is open; true when X is done.
 *       Mutation: delete the shim block → dep never seen → task ready prematurely → fails 19a.
 *
 *   20. Parent auto-close on new Phase 3W shape.
 *       Child with closes_parent_on_done:true lands done. Parent is in done/ with closed:null.
 *       maybeCloseParentOnUserUnblock writes closed overlay (parent stays in done/).
 *       Mutation: revert parentPath to waiting/ → parent not found → no overlay → fails 20b.
 *
 *   21. No-claim of a cancelled task.
 *       Task has status:open but closed.status != null → claimDecision returns "skip-closed".
 *       runClaimPassForTesting verifies the task is not claimed.
 *       Mutation: delete closedStatus check in claimDecision → task is claimed → fails 21a.
 *
 *   F2. extendContinuationAfter — inline after: form.
 *       Continuation with inline `after: [TSK-A]` form (not block list).
 *       New sibling appears → loadGraph reconcile extends after without duplication.
 *       Mutation: delete inlineRe replacement branch → second after: appended (corrupted) → fails F2b.
 *
 *   F3. Frontier leaf predicate — linear chain produces no consolidation.
 *       A→B chain (B.after:[A]), both done, from: kelly. frontierLeaves = [B] (length 1) → report-flag.
 *       Mutation: restore !n.isTerminal → A counts as a leaf → length 2 → consolidation → fails F3a.
 *
 * Run with: bun run test/scheduler/phase3w.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
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

// ── fixture helpers ──────────────────────────────────────────────────────────

function claimedEnvelopeYaml(taskId: string, agent: string, extra: Record<string, unknown> = {}): string {
  const envelope: Record<string, unknown> = {
    id: taskId,
    headline: `fixture ${taskId}`,
    created: "2026-08-30T00:00:00.000Z",
    updated: "2026-08-30T00:00:00.000Z",
    from: "alice",
    to: agent,
    kind: "code",
    parent: null,
    gate: null,
    status: "claimed",
    lease: {
      holder: "runner-99999",
      expires: "2026-01-01T00:00:00.000Z", // expired in the past
    },
    history: [],
    // Use null (not "") for summary.response — yamlDump serializes "" as '' which
    // readNestedField returns as "''" (two chars, truthy) and confuses sweepStaleClaims.
    summary: { brief: null, response: null },
    report: null,
    ...extra,
  };
  return yamlDump(envelope);
}

function rendezvousFile(opts: {
  status: string;
  waitingOn?: string;
  summary?: string;
}): string {
  const fm: string[] = ["---", `status: ${opts.status}`];
  if (opts.waitingOn) fm.push(`waiting_on: ${opts.waitingOn}`);
  if (opts.summary) fm.push(`summary: "${opts.summary}"`);
  fm.push("---", "", "Body text.");
  return fm.join("\n") + "\n";
}

// ── process.chdir BEFORE import (AGENTS_DIR is pinned at module load time) ──

const root = await mkdtemp(join(tmpdir(), "caravel-phase3w-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;

if (
  typeof t.sweepStaleClaims !== "function" ||
  typeof t.claimDecision !== "function" ||
  typeof t.loadGraph !== "function" ||
  typeof t.ready !== "function" ||
  typeof t.runClaimPassForTesting !== "function" ||
  typeof t.checkFrontierAndMaybeSpawnContinuation !== "function" ||
  typeof t.maybeCloseParentOnUserUnblock !== "function"
) {
  console.error("SKIP: required __testing exports not available");
  process.exit(0);
}

type SweepStaleClaimsFn = (opts: { agents: string[]; tickMs: number; leaseMs: number; perAgentConcurrency: number }, includeUnexpired?: boolean) => Promise<void>;
type ClaimDecisionFn = (yaml: string, taskId: string, graph: unknown) => string;
type TaskGraph = Awaited<ReturnType<typeof ma.loadGraph>>;
type LoadGraphFn = (agentsDir: string, agents: string[]) => Promise<TaskGraph>;
type ReadyFn = (id: string, graph: TaskGraph) => boolean;
type RunClaimPassFn = (agentsDir: string, agents: string[], leaseMs?: number) => Promise<{ claimed: string[]; skippedNotReady: string[] }>;
type FrontierFn = (yaml: string, taskId: string, agent: string, agents: string[], agentsDir?: string) => Promise<void>;
type MaybeCloseParentFn = (childYaml: string, childId: string) => Promise<void>;

const sweepStaleClaims = t.sweepStaleClaims as SweepStaleClaimsFn;
const claimDecisionFn = t.claimDecision as ClaimDecisionFn;
const loadGraphFn = t.loadGraph as LoadGraphFn;
const readyFn = t.ready as ReadyFn;
const runClaimPass = t.runClaimPassForTesting as RunClaimPassFn;
const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const maybeCloseParent = t.maybeCloseParentOnUserUnblock as MaybeCloseParentFn;

const agents = ["alice", "bob", "cliff"];
const testOpts = { agents, tickMs: 5000, leaseMs: 60_000, perAgentConcurrency: 4 };

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

async function journalEntries(agent: string): Promise<Array<Record<string, unknown>>> {
  const path = join(agentsDir, agent, "tasks", "journal.ndjson");
  const text = await readFile(path, "utf-8").catch(() => "");
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

try {

  // ── Test 17: straggler conversion — stale-claim path (waiting:on:user) ───────
  //
  // A claimed envelope with an expired lease sits in open/.
  // A rendezvous .md file in waiting/ has waiting_on: user.
  // sweepStaleClaims must:
  //   1. Detect the straggler (waiting:on:user ≠ limits).
  //   2. Append a level:warn journal entry.
  //   3. Convert the rendezvous directive to done and move the envelope to done/.
  //
  // Mutation anchor: deleting `fromReport.kind = "done"` in sweepStaleClaims
  // (line ~2599 in multiAgent.ts) means the straggler stays as kind:"waiting" →
  // termBucket would remain "waiting" or produce a type error → envelope goes
  // to waiting/ (or stays open/) → 17a fails (not found in done/).

  console.log("\nTest 17: straggler conversion (stale-claim path) — waiting:on:user → done");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    const openDir = join(agentsDir, "alice", "tasks", "open");
    const waitDir = join(agentsDir, "alice", "tasks", "waiting");
    await mkdir(openDir, { recursive: true });
    await mkdir(waitDir, { recursive: true });

    const taskId = "TSK-ST17";
    await writeFile(join(openDir, `${taskId}.yaml`), claimedEnvelopeYaml(taskId, "alice"));
    await writeFile(
      join(waitDir, `${taskId}.md`),
      rendezvousFile({ status: "waiting", waitingOn: "user", summary: "Need a decision before continuing" })
    );

    await sweepStaleClaims(testOpts, true);

    const doneFiles = await readdir(join(agentsDir, "alice", "tasks", "done")).catch(() => [] as string[]);
    assert(doneFiles.includes(`${taskId}.yaml`), "17a: straggler envelope moved to done/", `found: [${doneFiles.join(", ")}]`);

    const doneYaml = await readFile(join(agentsDir, "alice", "tasks", "done", `${taskId}.yaml`), "utf-8").catch(() => "");
    const doneDoc = yamlLoad(doneYaml) as Record<string, unknown>;
    assert(doneDoc["status"] === "done", "17b: straggler envelope status is done", `status: ${String(doneDoc["status"])}`);

    const entries = await journalEntries("alice");
    const warnEntry = entries.find((e) => e["level"] === "warn" && String(e["id"]).includes(taskId));
    assert(!!warnEntry, "17c: level:warn journal entry recorded for straggler", `entries: ${JSON.stringify(entries.slice(-3))}`);
    assert(
      String(warnEntry?.["summary"]).includes("waiting:on:user"),
      "17d: warn summary names the emitted spec",
      `summary: ${String(warnEntry?.["summary"])}`
    );
  }

  // ── Test 18: limits-park survival — stale-claim path ─────────────────────────
  //
  // A claimed envelope with an expired lease sits in open/.
  // A rendezvous .md file in waiting/ has waiting_on: limits.
  // sweepStaleClaims must honour the limits park — NOT convert it to done.
  // The envelope must end up in waiting/ (via transitionToWaiting) rather than done/.
  //
  // Mutation anchor: deleting `if (onSpec !== "limits")` (the guard before converting)
  // means limits is also converted to done → envelope goes to done/ → 18a fails.

  console.log("\nTest 18: limits-park survival (stale-claim path) — waiting:on:limits stays parked");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    const openDir = join(agentsDir, "alice", "tasks", "open");
    const waitDir = join(agentsDir, "alice", "tasks", "waiting");
    await mkdir(openDir, { recursive: true });
    await mkdir(waitDir, { recursive: true });

    const taskId = "TSK-LIM18";
    await writeFile(join(openDir, `${taskId}.yaml`), claimedEnvelopeYaml(taskId, "alice"));
    await writeFile(
      join(waitDir, `${taskId}.md`),
      rendezvousFile({ status: "waiting", waitingOn: "limits", summary: "Rate limit hit" })
    );

    await sweepStaleClaims(testOpts, true);

    const waitFiles = await readdir(join(agentsDir, "alice", "tasks", "waiting")).catch(() => [] as string[]);
    const doneFiles = await readdir(join(agentsDir, "alice", "tasks", "done")).catch(() => [] as string[]);
    assert(
      waitFiles.some((f) => f.startsWith(taskId)),
      "18a: limits-park envelope stays in waiting/ (not converted)",
      `waiting: [${waitFiles.join(", ")}], done: [${doneFiles.join(", ")}]`
    );
    assert(
      !doneFiles.includes(`${taskId}.yaml`),
      "18b: limits-park envelope NOT moved to done/",
      `done: [${doneFiles.join(", ")}]`
    );

    const entries = await journalEntries("alice");
    const warnEntry = entries.find((e) => e["level"] === "warn" && String(e["id"]) === taskId);
    assert(!warnEntry, "18c: no level:warn journal entry for limits park (it is valid, not a straggler)");
  }

  // ── Test 19: depends_on → needs shim at graph-load time ──────────────────────
  //
  // A legacy envelope has `depends_on: task:TSK-DEP19` and no `needs:` field.
  // loadGraph must read the shim and treat it as needs:[TSK-DEP19].
  // ready() for the downstream task is false while TSK-DEP19 is open,
  // true after TSK-DEP19 is done.
  //
  // Mutation anchor: deleting the `depends_on → needs` shim block in loadGraph
  // (~line 970) means the dep is never parsed → the downstream task is immediately
  // ready → 19a fails (asserts NOT ready).

  console.log("\nTest 19: depends_on → needs shim — legacy envelope treated as needs edge");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    // Write the dep (open — not yet done) and the downstream (also open, legacy depends_on).
    const openDir = join(agentsDir, "alice", "tasks", "open");
    await mkdir(openDir, { recursive: true });

    const depEnv: Record<string, unknown> = {
      id: "TSK-DEP19",
      headline: "dep",
      created: "2026-08-30T00:00:01.000Z",
      updated: "2026-08-30T00:00:01.000Z",
      from: "bob",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    await writeFile(join(openDir, "TSK-DEP19.yaml"), yamlDump(depEnv));

    // Legacy envelope: uses depends_on: task:TSK-DEP19 (no needs: field).
    const downstreamEnv: Record<string, unknown> = {
      id: "TSK-DOWN19",
      headline: "downstream",
      created: "2026-08-30T00:00:02.000Z",
      updated: "2026-08-30T00:00:02.000Z",
      from: "bob",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      depends_on: "task:TSK-DEP19",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    await writeFile(join(openDir, "TSK-DOWN19.yaml"), yamlDump(downstreamEnv));

    let g = await loadGraphFn(agentsDir, agents);
    assert(
      !readyFn("TSK-DOWN19", g),
      "19a: TSK-DOWN19 NOT ready while TSK-DEP19 is open (shim treated depends_on as needs edge)",
      `ready=${readyFn("TSK-DOWN19", g)}`
    );

    // Now mark the dep as done.
    const doneDir = join(agentsDir, "alice", "tasks", "done");
    await mkdir(doneDir, { recursive: true });
    const depYaml = await readFile(join(openDir, "TSK-DEP19.yaml"), "utf-8");
    const donedDep = depYaml.replace(/^status: open$/m, "status: done");
    await writeFile(join(doneDir, "TSK-DEP19.yaml"), donedDep);
    await rm(join(openDir, "TSK-DEP19.yaml"));

    g = await loadGraphFn(agentsDir, agents);
    assert(
      readyFn("TSK-DOWN19", g),
      "19b: TSK-DOWN19 IS ready after TSK-DEP19 is done",
      `ready=${readyFn("TSK-DOWN19", g)}`
    );
    assert(g.errors.filter((e) => e.id === "TSK-DOWN19").length === 0, "19c: no graph errors for downstream");
  }

  // ── Test 20: parent auto-close on Phase 3W shape ─────────────────────────────
  //
  // Child TSK-CHILD20 has closes_parent_on_done: true and parent: TSK-PAR20.
  // TSK-PAR20 is in done/ with status:done and no closed block (report-state).
  // When checkFrontierAndMaybeSpawnContinuation fires for the child, the runner
  // calls maybeCloseParentOnUserUnblock, which must stamp a closed overlay on
  // the parent in-place (parent stays in done/).
  //
  // Mutation anchor: in maybeCloseParentOnUserUnblock, if the lookup changes back
  // to waiting/ (pre-Phase-3W shape), parentPath won't exist → no overlay written
  // → 20b fails.

  console.log("\nTest 20: parent auto-close — done∧closed:null parent gets closed overlay");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    const aliceDone = join(agentsDir, "alice", "tasks", "done");
    const aliceOpen = join(agentsDir, "alice", "tasks", "open");
    await mkdir(aliceDone, { recursive: true });
    await mkdir(aliceOpen, { recursive: true });

    // Parent: done, no closed block (report-state = "report awaiting review").
    const parentEnv: Record<string, unknown> = {
      id: "TSK-PAR20",
      headline: "parent",
      created: "2026-08-30T00:00:01.000Z",
      updated: "2026-08-30T00:00:01.000Z",
      from: "kelly",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "done",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "some answer" },
      report: "",
    };
    await writeFile(join(aliceDone, "TSK-PAR20.yaml"), yamlDump(parentEnv));

    // Child: done, closes_parent_on_done: true.
    const childEnv: Record<string, unknown> = {
      id: "TSK-CHILD20",
      headline: "child",
      created: "2026-08-30T00:00:02.000Z",
      updated: "2026-08-30T00:00:02.000Z",
      from: "alice",
      to: "alice",
      kind: "code",
      parent: "TSK-PAR20",
      gate: null,
      status: "done",
      closes_parent_on_done: true,
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "child done" },
      report: "",
    };
    await writeFile(join(aliceDone, "TSK-CHILD20.yaml"), yamlDump(childEnv));

    await loadGraphFn(agentsDir, agents);
    const childYaml = await readFile(join(aliceDone, "TSK-CHILD20.yaml"), "utf-8");

    // Call maybeCloseParentOnUserUnblock directly — it's the function under test.
    // (It is called inside transitionToTerminal when kind=done; exported for direct testing.)
    await maybeCloseParent(childYaml, "TSK-CHILD20");

    // The parent should now have a closed overlay.
    const parentYaml = await readFile(join(aliceDone, "TSK-PAR20.yaml"), "utf-8").catch(() => "");
    const parentDoc = yamlLoad(parentYaml) as Record<string, unknown>;

    assert(existsSync(join(aliceDone, "TSK-PAR20.yaml")), "20a: parent stays in done/ (closed overlay, not moved)");
    const closedBlock = parentDoc["closed"] as Record<string, unknown> | null | undefined;
    assert(
      typeof closedBlock === "object" && closedBlock !== null && closedBlock["status"] === "closed",
      "20b: parent has closed.status = closed (overlay written)",
      `closed: ${JSON.stringify(closedBlock)}`
    );
    assert(
      String(closedBlock?.["reason"] ?? "").includes("TSK-CHILD20"),
      "20c: closed.reason references the child id",
      `reason: ${String(closedBlock?.["reason"])}`
    );
  }

  // ── Test 21: no-claim of a cancelled task ────────────────────────────────────
  //
  // A task has status:open (sits in open/) but has a closed block
  // (closed.status: cancelled). The claim pass must not claim it.
  // claimDecision must return "skip-closed".
  //
  // Mutation anchor: deleting the `closedStatus !== null ⇒ skip-closed` check in
  // claimDecision (multiAgent.ts ~2790) means the task is claimed despite the
  // cancellation → 21a fails.

  console.log("\nTest 21: no-claim of cancelled task — closed.status != null → skip-closed");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    const openDir = join(agentsDir, "alice", "tasks", "open");
    await mkdir(openDir, { recursive: true });

    const cancelledEnv: Record<string, unknown> = {
      id: "TSK-CANCEL21",
      headline: "cancelled task",
      created: "2026-08-30T00:00:01.000Z",
      updated: "2026-08-30T00:00:02.000Z",
      from: "kelly",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      closed: { status: "cancelled", at: "2026-08-30T00:01:00.000Z", by: "kelly", reason: "no longer needed" },
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    const cancelledYaml = yamlDump(cancelledEnv);
    await writeFile(join(openDir, "TSK-CANCEL21.yaml"), cancelledYaml);

    // Also have a normal open task to verify it IS claimed (the claim pass works).
    const normalEnv: Record<string, unknown> = {
      id: "TSK-NORMAL21",
      headline: "normal task",
      created: "2026-08-30T00:00:03.000Z",
      updated: "2026-08-30T00:00:03.000Z",
      from: "kelly",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    await writeFile(join(openDir, "TSK-NORMAL21.yaml"), yamlDump(normalEnv));

    // Verify claimDecision directly.
    const g = await loadGraphFn(agentsDir, agents);
    const decision = claimDecisionFn(cancelledYaml, "TSK-CANCEL21", g);
    assert(decision === "skip-closed", "21a: claimDecision returns skip-closed for closed.status != null", `got: ${decision}`);

    // Verify the claim pass skips the cancelled task.
    const pass = await runClaimPass(agentsDir, agents);
    assert(!pass.claimed.includes("TSK-CANCEL21"), "21b: claim pass does not claim cancelled task", `claimed: [${pass.claimed.join(", ")}]`);
    // The normal task should be claimed (proves the pass ran).
    assert(pass.claimed.includes("TSK-NORMAL21"), "21c: normal open task IS claimed (claim pass ran)");
  }

  // ── Test F2: extendContinuationAfter — inline after: form ────────────────────
  //
  // A continuation has `after: [TSK-AF2]` (inline list form, not block list).
  // A new sibling TSK-BF2 appears. loadGraph reconcile must extend the after: to
  // include TSK-BF2 by replacing the inline form — not appending a second after:.
  //
  // Mutation anchor: deleting the `inlineRe` branch in extendContinuationAfter
  // means the inline form is not matched → a second `after:` key is appended →
  // duplicate mapping key → envelope becomes unparseable → F2b fails (after: list
  // doesn't include TSK-BF2 after a load-then-parse).

  console.log("\nTest F2: extendContinuationAfter — inline after: form correctly extended");

  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });

  {
    // Family: parent PAR-F2, sibling TSK-AF2 (done), continuation C-F2 with inline after:.
    const aliceDone = join(agentsDir, "alice", "tasks", "done");
    const aliceOpen = join(agentsDir, "alice", "tasks", "open");
    const bobOpen = join(agentsDir, "bob", "tasks", "open");
    await mkdir(aliceDone, { recursive: true });
    await mkdir(aliceOpen, { recursive: true });
    await mkdir(bobOpen, { recursive: true });

    const parEnv: Record<string, unknown> = {
      id: "TSK-PARF2",
      headline: "parent F2",
      created: "2026-08-30T00:00:01.000Z",
      updated: "2026-08-30T00:00:01.000Z",
      from: "kelly",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    await writeFile(join(aliceOpen, "TSK-PARF2.yaml"), yamlDump(parEnv));

    const siblingAEnv: Record<string, unknown> = {
      id: "TSK-AF2",
      headline: "sibling A F2",
      created: "2026-08-30T00:00:02.000Z",
      updated: "2026-08-30T00:00:02.000Z",
      from: "alice",
      to: "alice",
      kind: "code",
      parent: "TSK-PARF2",
      gate: null,
      status: "done",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "done" },
      report: "",
    };
    await writeFile(join(aliceDone, "TSK-AF2.yaml"), yamlDump(siblingAEnv));

    // Continuation C-F2 with INLINE after: form — the F2 defect case.
    // Inline form: `after: [TSK-AF2]` on a single line (not the block `after:\n  - TSK-AF2`).
    const contId = "TSK-CF2";
    const contYaml = [
      `id: ${contId}`,
      `headline: "consolidation F2"`,
      `created: "2026-08-30T00:00:03.000Z"`,
      `updated: "2026-08-30T00:00:03.000Z"`,
      `from: runner`,
      `to: bob`,
      `kind: continuation`,
      `parent: TSK-PARF2`,
      `gate: null`,
      `status: open`,
      `after: [TSK-AF2]`,   // ← inline form (not block list)
      `needs: []`,
      `lease:`,
      `  holder: null`,
      `  expires: null`,
      `history: []`,
      `summary:`,
      `  brief: ""`,
      `  response: ""`,
      `report: ""`,
    ].join("\n") + "\n";
    await writeFile(join(bobOpen, `${contId}.yaml`), contYaml);

    // Now add sibling B — a new late sibling.
    const siblingBEnv: Record<string, unknown> = {
      id: "TSK-BF2",
      headline: "sibling B F2",
      created: "2026-08-30T00:00:04.000Z",
      updated: "2026-08-30T00:00:04.000Z",
      from: "alice",
      to: "alice",
      kind: "code",
      parent: "TSK-PARF2",
      gate: null,
      status: "open",
      lease: { holder: null, expires: null },
      history: [],
      summary: { brief: "", response: "" },
      report: "",
    };
    await writeFile(join(aliceOpen, "TSK-BF2.yaml"), yamlDump(siblingBEnv));

    // loadGraph reconcile should extend C-F2.after to include TSK-BF2.
    await loadGraphFn(agentsDir, agents);

    const updatedContYaml = await readFile(join(bobOpen, `${contId}.yaml`), "utf-8");

    // F2a: The after: field includes TSK-BF2 after reconcile.
    let afterList: unknown;
    try {
      const doc = yamlLoad(updatedContYaml) as Record<string, unknown>;
      afterList = doc["after"];
    } catch (e) {
      afterList = null;
      assert(false, "F2a: continuation YAML is parseable after reconcile (no duplicate key corruption)", `parse error: ${e}`);
    }
    assert(
      Array.isArray(afterList) && (afterList as string[]).includes("TSK-AF2") && (afterList as string[]).includes("TSK-BF2"),
      "F2a: after: includes both TSK-AF2 and TSK-BF2 after reconcile (inline form extended correctly)",
      `after: ${JSON.stringify(afterList)}`
    );

    // F2b: Only ONE after: key in the file (no duplication).
    const afterMatches = updatedContYaml.match(/^after[:\s]/gm) ?? [];
    assert(
      afterMatches.length === 1,
      "F2b: exactly ONE after: key in continuation YAML (not duplicated)",
      `matches: ${afterMatches.length}, yaml:\n${updatedContYaml}`
    );
  }

  // ── Test F3: frontier leaf predicate — linear chain → no consolidation ────────
  //
  // TSK-AF3 → TSK-BF3 (B.after: [A]). Both done, from: kelly (user target).
  // This is a linear chain: A is an interior node (has B as dependant), B is the leaf.
  // frontierLeaves = [B] (length 1) → report-flag, no consolidation spawn.
  //
  // Mutation anchor: restoring `!n.isTerminal` to the leaf predicate means that once
  // A and B are both terminal, B's isTerminal=true makes it "not disqualifying" for
  // the leaf test → A counts as a leaf too → frontierLeaves=[A,B] (length 2) →
  // consolidation spawned → F3a fails.

  console.log("\nTest F3: linear chain → no consolidation (leaf predicate excludes interior nodes)");

  await buildFixture(root, {
    agents: {
      alice: [
        { id: "TSK-PARF3" },
        { id: "TSK-AF3", status: "done", from: "kelly", kind: "code", parent: "TSK-PARF3" },
        { id: "TSK-BF3", status: "done", from: "kelly", kind: "code", parent: "TSK-PARF3", after: ["TSK-AF3"] },
      ],
      bob: [],
      cliff: [],
    },
  });

  {
    const aliceDone = join(agentsDir, "alice", "tasks", "done");

    const aliceOpenBefore = (await readdir(join(agentsDir, "alice", "tasks", "open")).catch(() => [])).length;
    const bobOpenBefore = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;

    // Fire A: A has B as a dependant (B.after:[A]) → B disqualifies A from being a leaf.
    // frontierLeaves = [B] (length 1) → report-flag, no spawn.
    await loadGraphFn(agentsDir, agents);
    const yamlA = await readFile(join(aliceDone, "TSK-AF3.yaml"), "utf-8");
    await checkFrontier(yamlA, "TSK-AF3", "alice", agents, agentsDir);

    const aliceOpenAfterA = (await readdir(join(agentsDir, "alice", "tasks", "open")).catch(() => [])).length;
    const bobOpenAfterA = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;

    assert(
      aliceOpenAfterA === aliceOpenBefore && bobOpenAfterA === bobOpenBefore,
      "F3a: TSK-AF3 fires — no consolidation spawned (A is interior, frontierLeaves=[B], length=1)",
      `alice open: ${aliceOpenBefore}→${aliceOpenAfterA}, bob open: ${bobOpenBefore}→${bobOpenAfterA}`
    );

    // Fire B: B is the actual leaf. frontierLeaves = [B] (length 1) → report-flag.
    await loadGraphFn(agentsDir, agents);
    const yamlB = await readFile(join(aliceDone, "TSK-BF3.yaml"), "utf-8");
    await checkFrontier(yamlB, "TSK-BF3", "alice", agents, agentsDir);

    const aliceOpenAfterB = (await readdir(join(agentsDir, "alice", "tasks", "open")).catch(() => [])).length;
    const bobOpenAfterB = (await readdir(join(agentsDir, "bob", "tasks", "open")).catch(() => [])).length;

    assert(
      aliceOpenAfterB === aliceOpenAfterA && bobOpenAfterB === bobOpenAfterA,
      "F3b: TSK-BF3 fires — no consolidation spawned (B is solo leaf, length=1 → report-flag)",
      `alice open: ${aliceOpenAfterA}→${aliceOpenAfterB}, bob open: ${bobOpenAfterA}→${bobOpenAfterB}`
    );
  }

} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\nphase3w: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
