/**
 * Regression tests for WAL-71: stale-claim replay after daemon restart
 * (dimension 1, d312df2) and live-worker lease expiry (dimension 2).
 *
 * Dimension 1: worker writes rendezvous file, daemon dies before reconciliation.
 * Fix: sweepStaleClaims calls readReportFile before re-opening.
 *
 * Dimension 2: worker is still alive when its lease expires. The every-tick
 * sweep previously re-opened the envelope underneath the running worker,
 * causing a duplicate claim on the next tick (incident: 2026-08-21 11:42Z).
 * Fix: sweepStaleClaims checks inflightWorkers before re-opening.
 *
 * Run with: bun run test/stale-claim-replay.ts
 * Exits 0 on all pass, 1 on any failure.
 */

// Static imports only — none from multiAgent (that needs cwd set first)
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

// ── one shared tmpdir so the module import sees a stable AGENTS_DIR ────────

const testDir = await mkdtemp(join(tmpdir(), "caravel-wal71-"));
process.chdir(testDir);

// Dynamic import AFTER chdir — AGENTS_DIR = testDir/agents
const ma = (await import("../src/multiAgent.ts")) as {
  __testing: {
    sweepStaleClaims: (
      opts: { agents: string[]; tickMs: number; leaseMs: number; perAgentConcurrency: number },
      includeUnexpired?: boolean
    ) => Promise<void>;
    inflightWorkers: Map<string, { controller: AbortController; aborted: boolean; by: string; reason: string; claimedAt: number }>;
    readMaxWorkerLifetimeMs: () => number;
  };
};
const { sweepStaleClaims, inflightWorkers, readMaxWorkerLifetimeMs } = ma.__testing;

const agentsDir = join(testDir, "agents");

// ── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

const SWEEP_OPTS = { agents: [] as string[], tickMs: 30000, leaseMs: 1800000, perAgentConcurrency: 1 };

async function setupClaimed(agent: string, taskId: string, opts?: { leaseExpired?: boolean }) {
  await mkdir(join(agentsDir, agent, "tasks", "open"), { recursive: true });
  const expiry = opts?.leaseExpired === false
    ? new Date(Date.now() + 86400000).toISOString()  // far future
    : "2020-01-01T00:00:00.000Z";                     // already expired
  const yaml = [
    `id: ${taskId}`,
    `headline: "WAL-71 test"`,
    `status: claimed`,
    `lease:`,
    `  holder: "runner-99999"`,
    `  expires: ${expiry}`,
    `summary:`,
    `  response: ""`,
    `history:`,
    `  - ts: "2026-01-01T00:00:00.000Z"`,
    `    from: open`,
    `    to: claimed`,
    `    by: runner-99999`,
    ``,
  ].join("\n");
  await writeFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), yaml);
}

async function setupRendezvous(agent: string, taskId: string, bucket: string, frontmatter: string) {
  await mkdir(join(agentsDir, agent, "tasks", bucket), { recursive: true });
  await writeFile(
    join(agentsDir, agent, "tasks", bucket, `${taskId}.md`),
    `${frontmatter}\n\n# Report\n\nWork done.\n`
  );
}

function simulateLiveWorker(agent: string, taskId: string, claimedAgoMs = 5 * 60 * 1000) {
  inflightWorkers.set(`${agent}/${taskId}`, {
    controller: new AbortController(),
    aborted: false,
    by: "",
    reason: "",
    claimedAt: Date.now() - claimedAgoMs,
  });
}

function clearLiveWorker(agent: string, taskId: string) {
  inflightWorkers.delete(`${agent}/${taskId}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Dimension 1: rendezvous-file detection (d312df2)
// ═══════════════════════════════════════════════════════════════════════

// ── case 1: done rendezvous → promote to done ───────────────────────────────

console.log("\n── done rendezvous file → promote to done");
{
  const agent = "agent-done";
  const taskId = "TSK-wal71-done-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId);
  await setupRendezvous(agent, taskId, "done", `---\nstatus: done\nsummary: Completed\n---`);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope not in open/");
  assert(existsSync(join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`)), "envelope in done/");
  assert(existsSync(join(agentsDir, agent, "tasks", "done", `${taskId}.md`)), "rendezvous .md preserved");

  const yaml = await readFile(join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`), "utf-8");
  assert(yaml.includes("status: done"), 'YAML status is "done"');
  assert(yaml.includes("rendezvous file found"), "history note mentions rendezvous file");
}

// ── case 2: failed rendezvous → promote to failed ───────────────────────────

console.log("\n── failed rendezvous file → promote to failed");
{
  const agent = "agent-failed";
  const taskId = "TSK-wal71-failed-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId);
  await setupRendezvous(agent, taskId, "failed", `---\nstatus: failed\nreason: timeout\nsummary: Timed out\n---`);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope not in open/");
  assert(existsSync(join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`)), "envelope in failed/");
  assert(existsSync(join(agentsDir, agent, "tasks", "failed", `${taskId}.md`)), "rendezvous .md preserved");

  const yaml = await readFile(join(agentsDir, agent, "tasks", "failed", `${taskId}.yaml`), "utf-8");
  assert(yaml.includes("status: failed:timeout"), 'YAML status is "failed:timeout"');
  assert(yaml.includes("rendezvous file found"), "history note mentions rendezvous file");
}

// ── case 3: waiting rendezvous → promote to waiting ─────────────────────────

console.log("\n── waiting rendezvous file → promote to waiting");
{
  const agent = "agent-waiting";
  const taskId = "TSK-wal71-waiting-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId);
  await setupRendezvous(agent, taskId, "waiting", `---\nstatus: waiting\nwaiting_on: user\nsummary: Waiting on Kelly\n---`);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope not in open/");
  assert(existsSync(join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`)), "envelope in waiting/");
  assert(existsSync(join(agentsDir, agent, "tasks", "waiting", `${taskId}.md`)), "rendezvous .md preserved");

  const yaml = await readFile(join(agentsDir, agent, "tasks", "waiting", `${taskId}.yaml`), "utf-8");
  assert(yaml.includes("status: waiting:on:user"), 'YAML status is "waiting:on:user"');
  assert(yaml.includes("rendezvous file found"), "history note mentions rendezvous file");
}

// ── case 4: expired lease, no rendezvous → re-open (unchanged behaviour) ────

console.log("\n── no rendezvous file → re-open (existing behaviour preserved)");
{
  const agent = "agent-nofile";
  const taskId = "TSK-wal71-nofile-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope stays in open/");

  const yaml = await readFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), "utf-8");
  assert(yaml.includes("status: open"), 'YAML status reset to "open"');
  assert(!yaml.includes("status: claimed"), "status: claimed replaced");
}

// ── case 5: startup sweep with unexpired lease (includeUnexpired=true) ───────

console.log("\n── unexpired lease + done rendezvous → still promotes (startup path)");
{
  const agent = "agent-unexpired";
  const taskId = "TSK-wal71-unexpired-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId, { leaseExpired: false });
  await setupRendezvous(agent, taskId, "done", `---\nstatus: done\nsummary: Completed before death\n---`);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope not in open/ (unexpired but startup)");
  assert(existsSync(join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`)), "envelope promoted to done/");
}

// ═══════════════════════════════════════════════════════════════════════
// Dimension 2: live-worker inFlight protection
// Reproduces the 2026-08-21 11:42Z incident:
//   TSK-2026-08-21-0001 claimed at 11:32, lease expired 11:42,
//   worker still running, sweep re-opened underneath it.
// ═══════════════════════════════════════════════════════════════════════

// ── case 6: live worker, expired lease, no rendezvous → SKIP (the fix) ───────

console.log("\n── live worker with expired lease → skip (per-tick path, the incident)");
{
  const agent = "agent-live";
  const taskId = "TSK-wal71-live-0001";
  SWEEP_OPTS.agents = [agent];

  await setupClaimed(agent, taskId);
  // Simulate the worker being live on this daemon for 12 minutes
  // (past the old 10-min DEFAULT_LEASE_MS, but within max lifetime)
  simulateLiveWorker(agent, taskId, 12 * 60 * 1000);

  try {
    await sweepStaleClaims(SWEEP_OPTS, false);  // per-tick path, includeUnexpired=false

    // Envelope must NOT have been re-opened — the worker is live
    assert(existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope still in open/");

    const yaml = await readFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), "utf-8");
    assert(yaml.includes("status: claimed"), 'YAML status still "claimed" (not re-opened)');
    assert(!yaml.includes("re-opening for fresh claim"), "no re-open history entry written");
  } finally {
    clearLiveWorker(agent, taskId);
  }
}

// ── case 7: startup sweep with live worker → still processes (fresh daemon,
//            inflightWorkers empty, so the inFlight guard is a no-op) ──────────

console.log("\n── startup sweep: inflightWorkers empty → processes normally");
{
  const agent = "agent-startup";
  const taskId = "TSK-wal71-startup-0001";
  SWEEP_OPTS.agents = [agent];

  // inflightWorkers is empty at startup (new daemon process)
  // The envelope is from the PREVIOUS daemon — should be recovered
  await setupClaimed(agent, taskId, { leaseExpired: false });
  await setupRendezvous(agent, taskId, "done", `---\nstatus: done\nsummary: Done in old daemon\n---`);

  assert(!inflightWorkers.has(`${agent}/${taskId}`), "inflightWorkers empty (simulating fresh daemon)");

  await sweepStaleClaims(SWEEP_OPTS, true);  // startup: includeUnexpired=true

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "old claim recovered (not skipped)");
  assert(existsSync(join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`)), "promoted to done/");
}

// ── case 8: wedged worker past max lifetime → recovery proceeds ──────────────

console.log("\n── wedged worker past max lifetime → recovery proceeds (hang ceiling)");
{
  const agent = "agent-wedged";
  const taskId = "TSK-wal71-wedged-0001";
  SWEEP_OPTS.agents = [agent];

  // Set max lifetime to 1 second so we can test without waiting
  process.env["CARAVEL_MAX_WORKER_LIFETIME_MS"] = "1000";
  const maxMs = readMaxWorkerLifetimeMs();
  assert(maxMs === 1000, "env override sets max lifetime to 1s");

  await setupClaimed(agent, taskId);
  // Worker claimed 5 seconds ago — well past the 1s max
  simulateLiveWorker(agent, taskId, 5000);
  // No rendezvous file — worker is wedged

  try {
    await sweepStaleClaims(SWEEP_OPTS, false);

    // Even though the worker is in inflightWorkers, it's past max lifetime
    // → recovery proceeds → no rendezvous file → re-opened
    assert(existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope in open/ (past max, re-opened)");
    const yaml = await readFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), "utf-8");
    assert(yaml.includes("status: open"), "YAML reset to open for recovery");
  } finally {
    delete process.env["CARAVEL_MAX_WORKER_LIFETIME_MS"];
    clearLiveWorker(agent, taskId);
  }
}

// ── cleanup + summary ────────────────────────────────────────────────────────

await rm(testDir, { recursive: true, force: true });

console.log(`\n${"─".repeat(56)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
} else {
  console.log("PASS");
}
