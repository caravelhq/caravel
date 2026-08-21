/**
 * Regression test for WAL-71: stale-claim replay after daemon restart.
 *
 * Scenario: a worker writes its rendezvous file (agents/<agent>/tasks/done/<id>.md)
 * and exits, but the daemon dies before reconcileWorkerResult can call
 * readReportFile and move the YAML. On restart, sweepStaleClaims(includeUnexpired=true)
 * previously saw an empty summary.response and re-opened the envelope, causing
 * the task to run a second time.
 *
 * The fix: sweepStaleClaims now calls readReportFile before re-opening. If a
 * terminal rendezvous file is found, it promotes to that terminal state instead.
 *
 * Run with: bun run test/stale-claim-replay.ts
 *
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
  };
};
const { sweepStaleClaims } = ma.__testing;

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

const SWEEP_OPTS = { agents: [] as string[], tickMs: 30000, leaseMs: 300000, perAgentConcurrency: 1 };

async function setupClaimed(agent: string, taskId: string) {
  await mkdir(join(agentsDir, agent, "tasks", "open"), { recursive: true });
  const yaml = [
    `id: ${taskId}`,
    `headline: "WAL-71 test"`,
    `status: claimed`,
    `lease:`,
    `  holder: "runner-99999"`,
    `  expires: "2020-01-01T00:00:00.000Z"`,
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
  // No rendezvous file — worker died without completing

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope stays in open/");

  const yaml = await readFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), "utf-8");
  assert(yaml.includes("status: open"), 'YAML status reset to "open"');
  assert(!yaml.includes("status: claimed"), "status: claimed replaced (not re-opening for fresh claim)");
}

// ── case 5: startup sweep with unexpired lease (includeUnexpired=true) ───────

console.log("\n── unexpired lease + done rendezvous → still promotes (startup path)");
{
  const agent = "agent-unexpired";
  const taskId = "TSK-wal71-unexpired-0001";
  SWEEP_OPTS.agents = [agent];

  await mkdir(join(agentsDir, agent, "tasks", "open"), { recursive: true });
  // Lease expires FAR in the future — normally skip on a running daemon
  const farFuture = new Date(Date.now() + 86400000).toISOString();
  const yaml = [
    `id: ${taskId}`,
    `headline: "unexpired lease test"`,
    `status: claimed`,
    `lease:`,
    `  holder: "runner-99999"`,
    `  expires: "${farFuture}"`,
    `summary:`,
    `  response: ""`,
    ``,
  ].join("\n");
  await writeFile(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`), yaml);
  await setupRendezvous(agent, taskId, "done", `---\nstatus: done\nsummary: Completed before death\n---`);

  await sweepStaleClaims(SWEEP_OPTS, true);

  assert(!existsSync(join(agentsDir, agent, "tasks", "open", `${taskId}.yaml`)), "envelope not in open/ (unexpired but startup)");
  assert(existsSync(join(agentsDir, agent, "tasks", "done", `${taskId}.yaml`)), "envelope promoted to done/");
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
