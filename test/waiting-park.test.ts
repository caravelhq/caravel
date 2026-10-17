/**
 * Tests for WAL-120: runner park on waiting:on:script.
 *
 * T1: worker parks waiting:on:script — envelope NOT failed, lease cleared
 * T2: terminal .md appears later — sweep transitions to done
 * T3: deadline exceeded — failed:timeout, park reason in history
 * T4: waiting:on:limits behaviour unchanged (regression)
 * T5: second reason (ci) via one predicate — generality proof
 * T6: no deadline → auto-default now+60min; past deadline → failed:timeout
 * T7: completion-path park via applyWorkerOutcome — waiting directive parks envelope
 * T8: stale-claim recovery via sweepStaleClaims — waiting/<id>.md rendezvous parks — generality proof
 *
 * Run with: bun run test/waiting-park.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function makeClaimedYaml(id: string): string {
  return [
    `id: ${id}`,
    `headline: "WAL-120 test"`,
    `created: 2026-10-01T00:00:00.000Z`,
    `updated: 2026-10-01T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: claimed`,
    `lease:`,
    `  holder: "runner-99999"`,
    `  expires: 2099-01-01T00:00:00.000Z`,
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-10-01T00:00:00.000Z"`,
    `    from: open`,
    `    to: claimed`,
    `    by: runner-99999`,
    ``,
  ].join("\n");
}

function makeWaitingYaml(id: string, spec: string, deadline: string, watch = ""): string {
  return [
    `id: ${id}`,
    `headline: "WAL-120 test"`,
    `created: 2026-10-01T00:00:00.000Z`,
    `updated: 2026-10-01T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: waiting:on:${spec}`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `script_deadline: ${deadline}`,
    ...(watch ? [`script_watch: ${watch}`] : []),
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-10-01T00:00:00.000Z"`,
    `    from: claimed`,
    `    to: waiting:on:${spec}`,
    `    by: runner-99999`,
    ``,
  ].join("\n");
}

// ── test setup ───────────────────────────────────────────────────────────────

const testDir = await mkdtemp(join(tmpdir(), "caravel-wal120-"));
process.chdir(testDir);

// Import AFTER chdir — AGENTS_DIR and LIMITS_GATE_FILE use process.cwd() at load time.
type WaitingDirective = {
  kind: "waiting";
  reason: string | null;
  summary: string;
  body: string;
  report: string | null;
  deadline?: string;
  watch?: string;
};
type SweepOpts = {
  agents: string[];
  tickMs: number;
  leaseMs: number;
  perAgentConcurrency: number;
};

const ma = (await import("../src/multiAgent.ts") as unknown) as {
  __testing: {
    transitionToWaiting: (agent: string, taskId: string, openPath: string, directive: WaitingDirective) => Promise<void>;
    sweepWaiting: (opts: SweepOpts) => Promise<void>;
    sweepStaleClaims: (opts: SweepOpts, includeUnexpired?: boolean) => Promise<void>;
    applyWorkerOutcome: (agent: string, taskId: string, filePath: string, claimedYaml: string, directive: WaitingDirective | null) => Promise<void>;
    SWEEP_PREDICATES: Record<string, (agent: string, taskId: string, yaml: string) => Promise<
      | { kind: "unblock" }
      | { kind: "terminal"; directive: { kind: string; reason: string | null; summary: string; body: string; report: string | null } }
      | null
    >>;
    VALID_WAITING_SPECS: Set<string>;
  };
};

const { transitionToWaiting, sweepWaiting, sweepStaleClaims, applyWorkerOutcome, SWEEP_PREDICATES, VALID_WAITING_SPECS } = ma.__testing;

const agentsDir = join(testDir, "agents");
const SWEEP_OPTS = { agents: [] as string[], tickMs: 30000, leaseMs: 1800000, perAgentConcurrency: 1 };

async function setupAgent(agent: string): Promise<void> {
  for (const b of ["open", "waiting", "done", "failed", "paused", "archived", "blocked"]) {
    await mkdir(join(agentsDir, agent, "tasks", b), { recursive: true });
  }
}

async function readYamlField(path: string, field: string): Promise<string | null> {
  let yaml: string;
  try { yaml = await readFile(path, "utf-8"); } catch { return null; }
  const m = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(yaml);
  return m ? m[1]!.trim() : null;
}

// ── T1: worker parks waiting:on:script — NOT failed, lease cleared ────────────

console.log("\nT1 — worker parks waiting:on:script: envelope moves to waiting/, lease cleared:");

{
  const agent = "t1-agent";
  const taskId = "TSK-WAL120-T1";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  await writeFile(openPath, makeClaimedYaml(taskId));

  const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();
  await transitionToWaiting(agent, taskId, openPath, {
    kind: "waiting",
    reason: "script",
    summary: "detached proof script launched",
    body: "",
    report: null,
    deadline: futureDeadline,
    watch: "PID 12345",
  });

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  assert(existsSync(waitPath), "envelope in waiting/");
  assert(!existsSync(openPath), "envelope NOT in open/");
  assert(!existsSync(join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`)), "envelope NOT in failed/");

  const yaml = await readFile(waitPath, "utf-8").catch(() => "");
  assert(/^\s+holder:\s*null\s*$/m.test(yaml), "lease.holder cleared");
  assert(/^\s+expires:\s*null\s*$/m.test(yaml), "lease.expires cleared");

  const status = await readYamlField(waitPath, "status");
  assert(status === "waiting:on:script", `status is waiting:on:script (got: ${status})`);
}

// ── T2: terminal .md appears → sweep transitions to done ────────────────────

console.log("\nT2 — terminal rendezvous appears: sweep moves envelope to done/:");

{
  const agent = "t2-agent";
  const taskId = "TSK-WAL120-T2";
  await setupAgent(agent);

  // Parked envelope in waiting/ with future deadline
  const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();
  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  await writeFile(waitPath, makeWaitingYaml(taskId, "script", futureDeadline));

  // S6: lingering waiting/<id>.md from the original park phase — must NOT shadow done/
  await writeFile(join(agentsDir, agent, "tasks", "waiting", `${taskId}.md`), [
    "---",
    "status: waiting",
    "waiting_on: script",
    `deadline: ${futureDeadline}`,
    `summary: "prior park phase"`,
    "---",
    "",
    "Background script waiting.",
    "",
  ].join("\n"));

  // Worker's late done rendezvous appears after the turn ended
  await writeFile(join(agentsDir, agent, "tasks", "done", `${taskId}.md`), [
    "---",
    "status: done",
    `summary: "proof script completed successfully"`,
    `report_path: agents/${agent}/tasks/done/${taskId}.md`,
    "---",
    "",
    "# Report",
    "Work done by background script.",
    "",
  ].join("\n"));

  await sweepWaiting({ ...SWEEP_OPTS, agents: [agent] });

  const doneYaml = join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`);
  assert(existsSync(doneYaml), "envelope moved to done/");
  assert(!existsSync(waitPath), "envelope NOT in waiting/");

  const status = await readYamlField(doneYaml, "status");
  assert(status === "done", `status is done (got: ${status})`);
}

// ── T3: deadline exceeded → failed:timeout, park reason in history ─────────

console.log("\nT3 — deadline exceeded: failed:timeout with park reason in history:");

{
  const agent = "t3-agent";
  const taskId = "TSK-WAL120-T3";
  await setupAgent(agent);

  // Envelope with past deadline, no terminal rendezvous
  const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();
  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  await writeFile(waitPath, makeWaitingYaml(taskId, "script", pastDeadline, "PID 99999"));

  await sweepWaiting({ ...SWEEP_OPTS, agents: [agent] });

  const failedYaml = join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`);
  assert(existsSync(failedYaml), "envelope moved to failed/");
  assert(!existsSync(waitPath), "envelope NOT in waiting/");

  const status = await readYamlField(failedYaml, "status");
  assert(status === "failed:timeout", `status is failed:timeout (got: ${status})`);

  // History must record the transition from waiting:on:script
  const content = await readFile(failedYaml, "utf-8").catch(() => "");
  assert(content.includes("waiting:on:script"), "history preserves waiting:on:script as prior status");
}

// ── T4: waiting:on:limits behaviour unchanged ────────────────────────────────

console.log("\nT4 — waiting:on:limits: unblocked when gate absent (regression):");

{
  const agent = "t4-agent";
  const taskId = "TSK-WAL120-T4";
  await setupAgent(agent);

  // No limits-gate.json in testDir/.caravel/ → readLimitsGate returns null → predicate unblocks.
  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  await writeFile(waitPath, [
    `id: ${taskId}`,
    `headline: "WAL-120 limits test"`,
    `created: 2026-10-01T00:00:00.000Z`,
    `updated: 2026-10-01T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: waiting:on:limits`,
    `limits_hit_at: 2026-10-01T00:00:00.000Z`,
    `limits_retry_count: 1`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-10-01T00:00:00.000Z"`,
    `    from: claimed`,
    `    to: waiting:on:limits`,
    `    by: runner-99999`,
    ``,
  ].join("\n"));

  await sweepWaiting({ ...SWEEP_OPTS, agents: [agent] });

  const openYaml = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  assert(existsSync(openYaml), "waiting:on:limits envelope unblocked to open/");
  assert(!existsSync(waitPath), "envelope NOT in waiting/");

  const status = await readYamlField(openYaml, "status");
  assert(status === "open", `status is open (got: ${status})`);
}

// ── T5: second reason (ci) via one predicate — generality proof ─────────────

console.log("\nT5 — second reason family (ci) via one predicate addition:");

{
  const agent = "t5-agent";
  const taskId = "TSK-WAL120-T5";
  await setupAgent(agent);

  // Add "ci" predicate — the only code change needed to support a new family.
  SWEEP_PREDICATES["ci"] = async (_a, _t, _y) => ({ kind: "unblock" });

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  await writeFile(waitPath, [
    `id: ${taskId}`,
    `headline: "WAL-120 ci test"`,
    `created: 2026-10-01T00:00:00.000Z`,
    `updated: 2026-10-01T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: waiting:on:ci`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-10-01T00:00:00.000Z"`,
    `    from: claimed`,
    `    to: waiting:on:ci`,
    `    by: runner-99999`,
    ``,
  ].join("\n"));

  await sweepWaiting({ ...SWEEP_OPTS, agents: [agent] });

  // Remove the test predicate
  delete SWEEP_PREDICATES["ci"];

  const openYaml = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  assert(existsSync(openYaml), "waiting:on:ci envelope unblocked to open/ via single predicate addition");
  assert(!existsSync(waitPath), "envelope NOT in waiting/");

  const status = await readYamlField(openYaml, "status");
  assert(status === "open", `status is open (got: ${status})`);

  // Confirm exactly 2 entries in SWEEP_PREDICATES after cleanup (limits + script)
  const predCount = Object.keys(SWEEP_PREDICATES).length;
  assert(predCount === 2, `SWEEP_PREDICATES has 2 entries after cleanup (got ${predCount})`);
}

// ── T6: no deadline → auto-default now+60min; past deadline → failed:timeout ─

console.log("\nT6 — no deadline → auto-default now+60min; past deadline → failed:timeout:");

{
  const agent = "t6-agent";
  const taskId = "TSK-WAL120-T6";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  await writeFile(openPath, makeClaimedYaml(taskId));

  // No deadline provided — M1 should default to now+60min with a warning
  await transitionToWaiting(agent, taskId, openPath, {
    kind: "waiting",
    reason: "script",
    summary: "background script launched without deadline",
    body: "",
    report: null,
  });

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  assert(existsSync(waitPath), "T6: envelope moved to waiting/");

  const deadlineStr = await readYamlField(waitPath, "script_deadline");
  const deadlineMs = deadlineStr ? Date.parse(deadlineStr) : NaN;
  const diffMin = (deadlineMs - Date.now()) / 60000;
  assert(
    Number.isFinite(deadlineMs) && diffMin > 50 && diffMin < 70,
    `T6: auto-deadline is ~60min from now (got ${diffMin.toFixed(1)}min)`
  );

  // Overwrite with a past deadline to drive the timeout sweep
  await writeFile(waitPath, makeWaitingYaml(taskId, "script", new Date(Date.now() - 60 * 1000).toISOString()));

  await sweepWaiting({ ...SWEEP_OPTS, agents: [agent] });

  const failedYaml = join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`);
  assert(existsSync(failedYaml), "T6: deadline exceeded → failed/");
  assert(!existsSync(waitPath), "T6: envelope NOT in waiting/");

  const status = await readYamlField(failedYaml, "status");
  assert(status === "failed:timeout", `T6: status is failed:timeout (got: ${status})`);
}

// ── T7: completion-path park via applyWorkerOutcome ──────────────────────────

console.log("\nT7 — applyWorkerOutcome parks claimed envelope on waiting:on:script directive:");

{
  const agent = "t7-agent";
  const taskId = "TSK-WAL120-T7";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  const claimedYaml = makeClaimedYaml(taskId);
  await writeFile(openPath, claimedYaml);

  const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();
  await applyWorkerOutcome(agent, taskId, openPath, claimedYaml, {
    kind: "waiting",
    reason: "script",
    summary: "long-running proof script launched",
    body: "",
    report: null,
    deadline: futureDeadline,
    watch: "PID 55555",
  });

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  assert(existsSync(waitPath), "T7: envelope in waiting/");
  assert(!existsSync(openPath), "T7: envelope NOT in open/");

  const status = await readYamlField(waitPath, "status");
  assert(status === "waiting:on:script", `T7: status is waiting:on:script (got: ${status})`);

  const yaml = await readFile(waitPath, "utf-8").catch(() => "");
  assert(/^\s+holder:\s*null\s*$/m.test(yaml), "T7: lease.holder cleared");
  assert(/^\s+expires:\s*null\s*$/m.test(yaml), "T7: lease.expires cleared");

  const deadline = await readYamlField(waitPath, "script_deadline");
  assert(deadline === futureDeadline, `T7: script_deadline preserved (got: ${deadline})`);
}

// ── T8: stale-claim recovery via sweepStaleClaims — waiting/<id>.md rendezvous

console.log("\nT8 — sweepStaleClaims recovers stale claim with waiting/<id>.md rendezvous:");

{
  const agent = "t8-agent";
  const taskId = "TSK-WAL120-T8";
  await setupAgent(agent);

  // Claimed envelope with expired lease
  const expiredLease = new Date(Date.now() - 60 * 1000).toISOString();
  const claimedYaml = [
    `id: ${taskId}`,
    `headline: "WAL-120 T8 test"`,
    `created: 2026-10-01T00:00:00.000Z`,
    `updated: 2026-10-01T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: claimed`,
    `lease:`,
    `  holder: "runner-99999"`,
    `  expires: ${expiredLease}`,
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-10-01T00:00:00.000Z"`,
    `    from: open`,
    `    to: claimed`,
    `    by: runner-99999`,
    ``,
  ].join("\n");

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  await writeFile(openPath, claimedYaml);

  // Worker wrote a waiting rendezvous before the daemon died
  const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();
  await writeFile(join(agentsDir, agent, "tasks", "waiting", `${taskId}.md`), [
    "---",
    "status: waiting",
    "waiting_on: script",
    `deadline: ${futureDeadline}`,
    `summary: "proof script launched before daemon died"`,
    "---",
    "",
    "Script is running.",
    "",
  ].join("\n"));

  await sweepStaleClaims({ ...SWEEP_OPTS, agents: [agent] }, false);

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  assert(existsSync(waitPath), "T8: stale claim with waiting rendezvous → waiting/");
  assert(!existsSync(openPath), "T8: envelope NOT in open/");

  const status = await readYamlField(waitPath, "status");
  assert(status === "waiting:on:script", `T8: status is waiting:on:script (got: ${status})`);
}

// ── result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
