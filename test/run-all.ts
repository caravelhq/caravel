/**
 * Single entry point for the Caravel test suite.
 *
 * Before this, `test/` was four ad-hoc scripts each with its own npm script
 * and its own hand-rolled pass/fail counter — there was no way to run "the
 * tests" and no aggregate signal. This runner executes every suite and exits
 * non-zero if any suite fails.
 *
 * Why subprocess-per-suite rather than importing the files into one process:
 * every suite that touches src/multiAgent.ts must `process.chdir()` into a
 * tmpdir BEFORE the dynamic import, because the module resolves
 * `AGENTS_DIR = join(process.cwd(), "agents")` at load time. Two suites in
 * one process would fight over the cwd and the first module load would pin
 * AGENTS_DIR for everyone. One process per suite is the isolation model the
 * suites already assume; this runner just automates it.
 *
 * Each suite keeps its own assertions and its own exit code — this file wraps
 * them, it does not rewrite them. A new suite is added by listing it in
 * SUITES below.
 *
 * Deliberately NOT included: `validate-envelopes` against the live
 * workspace agents/ tree. That is an operational gate on live state, not a
 * repo test — the repo suite must not go red because a live envelope is
 * mid-write. The validator's own logic IS tested here, on fixtures
 * (validate-envelopes.selftest.ts). Run the live check separately:
 *   bun run validate-envelopes -- --agents-dir <workspace>/agents
 *
 * Run with: bun run test/run-all.ts   (or: bun run test:all)
 * Exits 0 only if every suite exits 0.
 */

import { join } from "path";

const TEST_DIR = import.meta.dir;

type Suite = {
  name: string;
  file: string; // path relative to test/
  timeoutMs: number;
};

const SUITES: Suite[] = [
  { name: "set-field (WAL-63)", file: "set-field.test.ts", timeoutMs: 60_000 },
  { name: "paused-status (WAL-76)", file: "paused-status.test.ts", timeoutMs: 60_000 },
  { name: "envelope-yaml-safety (WAL-79)", file: "envelope-yaml-safety.test.ts", timeoutMs: 60_000 },
  { name: "stale-claim-replay (WAL-71)", file: "stale-claim-replay.ts", timeoutMs: 120_000 },
  { name: "validate-envelopes selftest (WAL-79)", file: "validate-envelopes.selftest.ts", timeoutMs: 120_000 },
  { name: "graph-ready (WAL-72 Phase 1)", file: "graph-ready.test.ts", timeoutMs: 120_000 },
  { name: "scheduler ready-set, FDP oracle (WAL-72)", file: "scheduler/ready.test.ts", timeoutMs: 120_000 },
  { name: "tick-claim regression (WAL-72 Phase 1)", file: "scheduler/tick-claim.test.ts", timeoutMs: 120_000 },
  { name: "frontier check + loop guard (WAL-72 Phase 2)", file: "scheduler/frontier.test.ts", timeoutMs: 120_000 },
  { name: "frontier integrity: dup-spawn/siblings/reply_to (WAL-72 Ph2 review)", file: "scheduler/frontier-integrity.test.ts", timeoutMs: 120_000 },
  { name: "graph errors: F1/F2 direct + journal (WAL-72 Ph2 review)", file: "scheduler/graph-errors.test.ts", timeoutMs: 120_000 },
  { name: "continuation idempotency: claimed/done/failed (WAL-72 v1.11)", file: "scheduler/cont-idempotency.test.ts", timeoutMs: 120_000 },
  { name: "v1.16 guard: staggered/two-graph/multi-target/sweepBlocked (WAL-72 post-deploy)", file: "scheduler/frontier-v116.test.ts", timeoutMs: 120_000 },
  { name: "type-check gate: src/+test/ errors (WAL-72 v1.12)", file: "type-check.test.ts", timeoutMs: 120_000 },
];

type Result = { name: string; ok: boolean; ms: number; detail: string };

async function runSuite(suite: Suite): Promise<Result> {
  const start = Date.now();
  const file = join(TEST_DIR, suite.file);
  const proc = Bun.spawn(["bun", "run", file], {
    cwd: TEST_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CARAVEL_TEST_CHILD: "1" },
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, suite.timeoutMs);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const ms = Date.now() - start;
  const output = stdout + (stderr ? `\n${stderr}` : "");

  // Stream the child's output under a header so a failing suite shows its own
  // diagnostics inline — the suites' assertions remain the source of truth.
  console.log(`\n${"═".repeat(72)}\n ${suite.name}\n${"═".repeat(72)}`);
  console.log(output.trimEnd());

  if (timedOut) {
    return { name: suite.name, ok: false, ms, detail: `timed out after ${suite.timeoutMs}ms` };
  }
  if (exitCode !== 0) {
    return { name: suite.name, ok: false, ms, detail: `exit ${exitCode}` };
  }
  return { name: suite.name, ok: true, ms, detail: "exit 0" };
}

console.log(`caravel test suite — ${SUITES.length} suites`);
console.log(`node ${process.version}, bun ${Bun.version}`);

const results: Result[] = [];
for (const suite of SUITES) {
  results.push(await runSuite(suite));
}

// ── aggregate ────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(72)}\n summary\n${"═".repeat(72)}`);
for (const r of results) {
  const mark = r.ok ? "✓" : "✗";
  console.log(`  ${mark} ${r.name} — ${r.detail} (${r.ms}ms)`);
}
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length} suites: ${results.length - failed.length} passed, ${failed.length} failed`
);

if (failed.length > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
