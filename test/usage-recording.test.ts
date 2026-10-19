/**
 * Tests for WAL-123 Phase B step 7 — usage recording on terminal transition.
 *
 * T1: normal worker completion stamps a populated `usage:` block on the envelope
 * T2: rendezvous-resolved park (no result event) stamps NO `usage:` key
 * T3: aborted/crashed worker (no result event) stamps NO `usage:` key
 * T4: usage block round-trips through appendUsageToEnvelopeYaml: replace strips old, appends new
 * T5: zero-cost run (all zeros) is distinguishable from an unmeasured envelope (absent key)
 *
 * Drives transitionToTerminal directly via __testing.
 * Run with: bun run test/usage-recording.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra?: string): void {
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
    `headline: "WAL-123 usage test"`,
    `created: 2026-10-18T00:00:00.000Z`,
    `updated: 2026-10-18T00:00:00.000Z`,
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
    `  brief: ""`,
    `  response: ""`,
    `history:`,
    `  - ts: 2026-10-18T00:00:00.000Z`,
    `    from: open`,
    `    to: claimed`,
    `    by: runner-99999`,
    ``,
  ].join("\n");
}

function makeWaitingYaml(id: string): string {
  return [
    `id: ${id}`,
    `headline: "WAL-123 usage test"`,
    `created: 2026-10-18T00:00:00.000Z`,
    `updated: 2026-10-18T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `priority: P2`,
    `project: null`,
    `brief: |`,
    `  test task`,
    `output_format: ""`,
    `context: []`,
    `status: waiting:on:script`,
    `script_deadline: 2099-01-01T00:00:00.000Z`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
    `history:`,
    `  - ts: 2026-10-18T00:00:00.000Z`,
    `    from: claimed`,
    `    to: waiting:on:script`,
    `    by: runner-99999`,
    ``,
  ].join("\n");
}

// ── test setup ────────────────────────────────────────────────────────────────

const testDir = await mkdtemp(join(tmpdir(), "caravel-wal123-usage-"));
process.chdir(testDir);

// Import AFTER chdir — AGENTS_DIR uses process.cwd() at load time.
type DoneDirective = { kind: "done"; reason: null; summary: string; body: string; report: string | null };
type FailedDirective = { kind: "failed"; reason: string; summary: string; body: string; report: string | null; cancelled?: { by: string; reason: string } };
type TaskDirective = DoneDirective | FailedDirective;

import type { WorkerUsage } from "../src/envelope/schema";
import { appendUsageToEnvelopeYaml } from "../src/envelope/write";

const ma = (await import("../src/multiAgent.ts") as unknown) as {
  __testing: {
    transitionToTerminal: (
      agent: string,
      taskId: string,
      openPath: string,
      directive: TaskDirective,
      usage?: WorkerUsage
    ) => Promise<void>;
  };
};

const { transitionToTerminal } = ma.__testing;

const agentsDir = join(testDir, "agents");

async function setupAgent(agent: string): Promise<void> {
  for (const b of ["open", "waiting", "done", "failed", "paused", "archived", "blocked"]) {
    await mkdir(join(agentsDir, agent, "tasks", b), { recursive: true });
  }
}

function sampleUsage(): WorkerUsage {
  return {
    turns: 37,
    tokens: { input: 412930, output: 18422, cache_read: 1204331, cache_creation: 88210 },
    cost_usd: 4.82,
    duration_ms: 1842000,
  };
}

// ── T1: normal completion stamps usage: block ─────────────────────────────────

console.log("\nT1 — normal worker completion stamps usage: block:");

{
  const agent = "t1-agent";
  const taskId = "TSK-USAGE-T1";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  await writeFile(openPath, makeClaimedYaml(taskId));

  const usage = sampleUsage();
  await transitionToTerminal(agent, taskId, openPath, { kind: "done", reason: null, summary: "ok", body: "", report: null }, usage);

  const donePath = join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`);
  const content = await readFile(donePath, "utf-8");

  assert(content.includes("usage:"), "usage: key present");
  assert(/turns:\s*37/.test(content), "turns: 37");
  assert(/input:\s*412930/.test(content), "tokens.input: 412930");
  assert(/output:\s*18422/.test(content), "tokens.output: 18422");
  assert(/cache_read:\s*1204331/.test(content), "tokens.cache_read: 1204331");
  assert(/cache_creation:\s*88210/.test(content), "tokens.cache_creation: 88210");
  assert(/cost_usd:\s*4\.82/.test(content), "cost_usd: 4.82");
  assert(/duration_ms:\s*1842000/.test(content), "duration_ms: 1842000");
  assert(/status:\s*done/.test(content), "status: done (other fields intact)");
}

// ── T2: rendezvous-resolved park stamps NO usage: key ────────────────────────

console.log("\nT2 — rendezvous-resolved park (no usage passed) stamps NO usage: key:");

{
  const agent = "t2-agent";
  const taskId = "TSK-USAGE-T2";
  await setupAgent(agent);

  const waitPath = join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`);
  await writeFile(waitPath, makeWaitingYaml(taskId));

  // Called with no usage argument — same as sweepWaiting's terminal path.
  await transitionToTerminal(agent, taskId, waitPath, { kind: "done", reason: null, summary: "rendezvous received", body: "", report: null });

  const donePath = join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`);
  const content = await readFile(donePath, "utf-8");

  assert(!content.includes("usage:"), "usage: key absent (unmeasured, not zero)");
  assert(/status:\s*done/.test(content), "status: done");
}

// ── T3: aborted worker stamps NO usage: key ───────────────────────────────────

console.log("\nT3 — aborted/crashed worker (null usage passed) stamps NO usage: key:");

{
  const agent = "t3-agent";
  const taskId = "TSK-USAGE-T3";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  await writeFile(openPath, makeClaimedYaml(taskId));

  // applyWorkerOutcome converts null → undefined for transitionToTerminal.
  // Drive transitionToTerminal with undefined usage directly (same end state).
  await transitionToTerminal(agent, taskId, openPath, {
    kind: "failed",
    reason: "aborted",
    summary: "Aborted mid-flight by user.",
    body: "",
    report: null,
    cancelled: { by: "user", reason: "" },
  });

  const failedPath = join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`);
  const content = await readFile(failedPath, "utf-8");

  assert(!content.includes("usage:"), "usage: key absent for aborted worker");
  assert(/status:\s*failed:aborted/.test(content), "status: failed:aborted");
}

// ── T4: appendUsageToEnvelopeYaml replaces existing block ────────────────────

console.log("\nT4 — appendUsageToEnvelopeYaml: replaces pre-existing usage: block:");

{
  const agent = "t4-agent";
  const taskId = "TSK-USAGE-T4";
  await setupAgent(agent);

  const openPath = join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`);
  // Pre-seed an envelope that already has a (stale) usage: block.
  const staleYaml = makeClaimedYaml(taskId) +
    `usage:\n  turns: 1\n  tokens:\n    input: 100\n    output: 50\n    cache_read: 0\n    cache_creation: 0\n  cost_usd: 0.01\n  duration_ms: 5000\n`;
  await writeFile(openPath, staleYaml);

  const freshUsage: WorkerUsage = {
    turns: 5,
    tokens: { input: 9999, output: 2222, cache_read: 0, cache_creation: 0 },
    cost_usd: 0.12,
    duration_ms: 30000,
  };
  await transitionToTerminal(agent, taskId, openPath, { kind: "done", reason: null, summary: "fresh run", body: "", report: null }, freshUsage);

  const donePath = join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`);
  const content = await readFile(donePath, "utf-8");

  // Must contain new values, not stale ones.
  assert(/turns:\s*5/.test(content), "fresh turns: 5");
  assert(/input:\s*9999/.test(content), "fresh input: 9999");
  // Old values must not appear.
  assert(!/turns:\s*1\b/.test(content), "stale turns: 1 absent");
  assert(!/input:\s*100\b/.test(content), "stale input: 100 absent");
  // Only one usage: key.
  assert((content.match(/^usage:/gm) ?? []).length === 1, "exactly one usage: key");
}

// ── T5: zero-cost usage is distinguishable from unmeasured ───────────────────

console.log("\nT5 — zero-cost run (all zeros) is distinguishable from unmeasured:");

{
  const base = makeClaimedYaml("TSK-ZERO");
  const zeroUsage: WorkerUsage = {
    turns: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
    cost_usd: 0,
    duration_ms: 0,
  };

  // Zero usage stamped → usage: key present (zero-cost fact recorded).
  const withZero = appendUsageToEnvelopeYaml(base, zeroUsage);
  assert(withZero.includes("usage:"), "usage: key present for zero-cost run");
  assert(/turns:\s*0/.test(withZero), "turns: 0 recorded");

  // No usage stamped → usage: key absent (unmeasured fact).
  assert(!base.includes("usage:"), "usage: key absent when never stamped");
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
