// Verification test for TSK-2026-08-22-0002: waiting-on deadlock fix.
//
// Before the fix:  sweepWaiting() skipped ALL tasks with closed.status set,
//                  so worker tasks parked on a sibling were never unblocked.
// After the fix:   sweepWaiting() only skips tasks where to === "alice"
//                  (Alice orchestration parents covered by a continuation).
//                  Worker tasks (to !== "alice") are unblocked and their
//                  closed block is cleared.
//
// Run with: bun test-waiting-deadlock.ts
//
// Expected output: all assertions pass, no failures.

import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { __testing } from "./src/multiAgent.ts";

const { sweepWaiting } = __testing;

// ── helpers ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ ${msg}`); pass++; }
  else       { console.error(`  ✗ ${msg}`); fail++; }
}

// Temporarily redirect AGENTS_DIR to a temp sandbox.
// sweepWaiting uses process.cwd()/agents — we'll pass a fake opts.agents list
// and create the directory structure manually.
const SANDBOX = join(process.cwd(), ".test-sandbox-waiting-deadlock");

function agentDir(agent: string) { return join(SANDBOX, "agents", agent); }
function waitDir(agent: string) { return join(agentDir(agent), "tasks", "waiting"); }
function openDir(agent: string) { return join(agentDir(agent), "tasks", "open"); }
function doneDir(agent: string) { return join(agentDir(agent), "tasks", "done"); }

async function setup(agent: string) {
  await mkdir(waitDir(agent), { recursive: true });
  await mkdir(openDir(agent), { recursive: true });
  await mkdir(doneDir(agent), { recursive: true });
}

// Build a minimal waiting envelope YAML.
function makeWaitingYaml(opts: {
  id: string;
  to: string;
  spec: string;   // e.g. "task:TSK-2026-08-22-0001.05"
  closed?: boolean;  // whether to stamp the tombstone
}): string {
  const closed = opts.closed
    ? `closed:\n  status: superseded\n  at: 2026-08-22T20:00:00.000Z\n  by: auto-on-waiting-task\n  reason: "parked waiting on ${opts.spec}"\n`
    : "closed: null\n";
  return [
    `id: ${opts.id}`,
    `headline: "test task"`,
    `from: alice`,
    `to: ${opts.to}`,
    `kind: code`,
    `status: waiting:on:${opts.spec}`,
    closed,
    `history:`,
    `  - ts: 2026-08-22T20:00:00.000Z`,
    `    from: claimed`,
    `    to: waiting:on:${opts.spec}`,
    `    by: runner-test`,
    `    note: "worker waiting"`,
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
  ].join("\n");
}

// Build a minimal done envelope YAML.
function makeDoneYaml(id: string): string {
  return [
    `id: ${id}`,
    `headline: "dependency task"`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `status: done`,
    `summary:`,
    `  brief: ""`,
    `  response: "done"`,
  ].join("\n");
}

// ── Override AGENTS_DIR for tests ─────────────────────────────────────────────
// sweepWaiting uses process.cwd()/agents internally. We can't easily redirect
// it without patching the module. Instead we'll symlink or use the real agents
// dir but under a sub-prefix. Easiest: we CAN'T easily override, so we'll use
// process.cwd() + "agents" and create sub-agents with unique names in a
// test-specific scope by using the actual workspace's agents dir with test-
// prefixed names.
//
// Simpler approach: create real test agents in the actual agents/ dir with
// names that won't collide, and clean them up after.

const REAL_AGENTS = join(process.cwd(), "agents");
const TEST_AGENT_WORKER = "zzz-test-worker-bob";
const TEST_AGENT_ALICE  = "zzz-test-alice";
const DEP_AGENT         = "zzz-test-dep-bob";
const DEP_TASK_ID       = "TSK-0000-00-00-DEPTEST";

async function realSetup(agent: string) {
  await mkdir(join(REAL_AGENTS, agent, "tasks", "waiting"), { recursive: true });
  await mkdir(join(REAL_AGENTS, agent, "tasks", "open"),    { recursive: true });
  await mkdir(join(REAL_AGENTS, agent, "tasks", "done"),    { recursive: true });
}

async function cleanup(...agents: string[]) {
  for (const a of agents) {
    await rm(join(REAL_AGENTS, a), { recursive: true, force: true });
  }
}

// ── Test 1: Worker task (to !== alice) with tombstone is now unblocked ────────
async function testWorkerTaskUnblocks() {
  console.log("\nTest 1: Worker task (to: bob) with tombstone unblocks when dep is done");
  const WORKER_TASK_ID = "TSK-0000-00-00-WORKER1";

  await realSetup(TEST_AGENT_WORKER);
  await realSetup(DEP_AGENT);

  // Place the dependency task in done/
  await writeFile(
    join(REAL_AGENTS, DEP_AGENT, "tasks", "done", `${DEP_TASK_ID}.yaml`),
    makeDoneYaml(DEP_TASK_ID)
  );

  // Place a parked worker task (to: bob, tombstoned) in waiting/
  await writeFile(
    join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`),
    makeWaitingYaml({
      id: WORKER_TASK_ID,
      to: "bob",
      spec: `task:${DEP_TASK_ID}`,
      closed: true,
    })
  );

  // Run the sweep
  await sweepWaiting({
    agents: [TEST_AGENT_WORKER, DEP_AGENT],
    tickMs: 30000,
    leaseMs: 1800000,
    perAgentConcurrency: 1,
    archiveDays: 30,
    archiveOnlyTerminal: true,
    debug: false,
  } as any);

  // After the sweep, the task should be in open/ (unblocked)
  const inOpen    = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "open",    `${WORKER_TASK_ID}.yaml`));
  const inWaiting = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`));

  assert(inOpen,     "task moved to open/ after sweep");
  assert(!inWaiting, "task removed from waiting/");

  if (inOpen) {
    const yaml = await readFile(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "open", `${WORKER_TASK_ID}.yaml`), "utf-8");
    assert(yaml.includes("status: open"), "status set to open");
    assert(!yaml.includes("closed:\n  status: superseded"), "closed block cleared (not superseded)");
    assert(yaml.includes("dependency resolved"), "history entry added");
  }

  await cleanup(TEST_AGENT_WORKER, DEP_AGENT);
}

// ── Test 2: Alice orchestration parent (to: alice) with tombstone is SKIPPED ──
async function testAliceOrchestratonParentSkipped() {
  console.log("\nTest 2: Alice orchestration parent (to: alice) with tombstone is NOT auto-unblocked");
  const ALICE_TASK_ID = "TSK-0000-00-00-ALICE1";

  await realSetup(TEST_AGENT_ALICE);
  await realSetup(DEP_AGENT);

  // Place the dependency task in done/
  await writeFile(
    join(REAL_AGENTS, DEP_AGENT, "tasks", "done", `${DEP_TASK_ID}.yaml`),
    makeDoneYaml(DEP_TASK_ID)
  );

  // Place a parked Alice task (to: alice, tombstoned) in waiting/
  await writeFile(
    join(REAL_AGENTS, TEST_AGENT_ALICE, "tasks", "waiting", `${ALICE_TASK_ID}.yaml`),
    makeWaitingYaml({
      id: ALICE_TASK_ID,
      to: "alice",
      spec: `task:${DEP_TASK_ID}`,
      closed: true,
    })
  );

  // Run the sweep
  await sweepWaiting({
    agents: [TEST_AGENT_ALICE, DEP_AGENT],
    tickMs: 30000,
    leaseMs: 1800000,
    perAgentConcurrency: 1,
    archiveDays: 30,
    archiveOnlyTerminal: true,
    debug: false,
  } as any);

  // Alice task should still be in waiting/ — NOT unblocked
  const inWaiting = existsSync(join(REAL_AGENTS, TEST_AGENT_ALICE, "tasks", "waiting", `${ALICE_TASK_ID}.yaml`));
  const inOpen    = existsSync(join(REAL_AGENTS, TEST_AGENT_ALICE, "tasks", "open",    `${ALICE_TASK_ID}.yaml`));

  assert(inWaiting, "Alice orchestration parent remains in waiting/ (not unblocked)");
  assert(!inOpen,   "Alice orchestration parent NOT moved to open/");

  await cleanup(TEST_AGENT_ALICE, DEP_AGENT);
}

// ── Test 3: Worker task WITHOUT tombstone (normal waiting) still unblocks ─────
async function testNormalWaitingStillUnblocks() {
  console.log("\nTest 3: Worker task WITHOUT tombstone (normal waiting:on:task:) still unblocks");
  const WORKER_TASK_ID = "TSK-0000-00-00-NORMAL1";

  await realSetup(TEST_AGENT_WORKER);
  await realSetup(DEP_AGENT);

  await writeFile(
    join(REAL_AGENTS, DEP_AGENT, "tasks", "done", `${DEP_TASK_ID}.yaml`),
    makeDoneYaml(DEP_TASK_ID)
  );

  // No tombstone — normal worker park (pre-fix path, should still work)
  await writeFile(
    join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`),
    makeWaitingYaml({
      id: WORKER_TASK_ID,
      to: "bob",
      spec: `task:${DEP_TASK_ID}`,
      closed: false,
    })
  );

  await sweepWaiting({
    agents: [TEST_AGENT_WORKER, DEP_AGENT],
    tickMs: 30000,
    leaseMs: 1800000,
    perAgentConcurrency: 1,
    archiveDays: 30,
    archiveOnlyTerminal: true,
    debug: false,
  } as any);

  const inOpen    = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "open",    `${WORKER_TASK_ID}.yaml`));
  const inWaiting = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`));

  assert(inOpen,     "task (no tombstone) moved to open/");
  assert(!inWaiting, "task (no tombstone) removed from waiting/");

  await cleanup(TEST_AGENT_WORKER, DEP_AGENT);
}

// ── Test 4: Worker task with unresolved dep stays in waiting/ ─────────────────
async function testUnresolvedDepStaysWaiting() {
  console.log("\nTest 4: Worker task whose dependency is NOT yet done stays in waiting/");
  const WORKER_TASK_ID = "TSK-0000-00-00-UNRESOLVED1";
  const UNRESOLVED_DEP = "TSK-0000-00-00-UNRESOLVED-DEP";

  await realSetup(TEST_AGENT_WORKER);
  // No dep task created in done/

  await writeFile(
    join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`),
    makeWaitingYaml({
      id: WORKER_TASK_ID,
      to: "bob",
      spec: `task:${UNRESOLVED_DEP}`,
      closed: true,
    })
  );

  await sweepWaiting({
    agents: [TEST_AGENT_WORKER],
    tickMs: 30000,
    leaseMs: 1800000,
    perAgentConcurrency: 1,
    archiveDays: 30,
    archiveOnlyTerminal: true,
    debug: false,
  } as any);

  const inWaiting = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "waiting", `${WORKER_TASK_ID}.yaml`));
  const inOpen    = existsSync(join(REAL_AGENTS, TEST_AGENT_WORKER, "tasks", "open",    `${WORKER_TASK_ID}.yaml`));

  assert(inWaiting, "task with unresolved dep stays in waiting/");
  assert(!inOpen,   "task with unresolved dep NOT moved to open/");

  await cleanup(TEST_AGENT_WORKER);
}

// ── Run all tests ─────────────────────────────────────────────────────────────
await testWorkerTaskUnblocks();
await testAliceOrchestratonParentSkipped();
await testNormalWaitingStillUnblocks();
await testUnresolvedDepStaysWaiting();

console.log(`\n── Results: ${pass} passed, ${fail} failed ──`);
if (fail > 0) process.exit(1);
