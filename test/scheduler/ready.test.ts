/**
 * Scheduler ready-set suite (WAL-72 design, TSK-2026-08-27-0002).
 *
 * Runs every case in ready.cases.ts against the reference implementation
 * (reference.ts — the FDP v1.5 semantics as an executable oracle). Each case
 * ALSO runs against the real Phase 1 code in src/multiAgent.ts via adapter.ts
 * (loadGraph + ready, landed as 9db3ba8), and a disagreement is reported as a
 * FINDING against the runner — the suite never edits the runner to make
 * itself green.
 *
 * Run with: bun run test/scheduler/ready.test.ts   (or via test/run-all.ts)
 *
 * Failure policy: a failure of the REFERENCE implementation is always a
 * failure (that is this suite's own correctness). A disagreement with the
 * real scheduler is a FINDING — advisory while WAL-72 Phase 1 is in flight,
 * reported loudly but not exit-failing. Pass --strict (or set
 * CARAVEL_SCHED_STRICT=1) to promote findings to failures — flip that on
 * when Phase 1 is declared done, so the oracle becomes an enforcement gate.
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { buildFixture } from "./fixture.ts";
import { loadGraph, readySet, type Graph } from "./reference.ts";
import { resolveRealScheduler, type RealScheduler } from "./adapter.ts";
import { CASES } from "./ready.cases.ts";

let passed = 0;
let failed = 0;
const findings: string[] = [];

function report(ok: boolean, label: string, extra?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? `\n    ${extra}` : ""}`);
    failed++;
  }
}

const sorted = (a: string[]) => [...a].sort();

function checkCase(
  name: string,
  ready: string[],
  graph: Graph,
  c: (typeof CASES)[number]
) {
  const exp = sorted(c.expectReady);
  const got = sorted(ready);
  report(
    exp.length === got.length && exp.every((v, i) => v === got[i]),
    `ready set: ${name}`,
    `expected [${exp.join(", ")}] got [${got.join(", ")}]`
  );

  for (const e of c.expectErrors ?? []) {
    const hit = graph.errors.find((err) => err.id === e.id && err.problem.includes(e.contains));
    report(!!hit, `error recorded: ${name} — ${e.id} ${e.contains}`, JSON.stringify(graph.errors));
  }
  if (!c.expectErrors && graph.errors.length > 0) {
    report(false, `no unexpected errors: ${name}`, JSON.stringify(graph.errors));
  }

  for (const [dep, expected] of Object.entries(c.expectDependants ?? {})) {
    const gotD = sorted(graph.dependants.get(dep) ?? []);
    report(
      gotD.length === expected.length && gotD.every((v, i) => v === sorted(expected)[i]),
      `dependants(${dep}) resolved once: ${name}`,
      `expected [${expected.join(", ")}] got [${gotD.join(", ")}]`
    );
  }
}

async function withWatchdog<T>(ms: number, work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });
  const result = await Promise.race([work().then((value) => ({ ok: true as const, value })), timeout]);
  clearTimeout(timer!);
  return result;
}

// ── setup: one fixture root per process, cwd-pinned for the adapter ─────────

const STRICT =
  process.argv.includes("--strict") || process.env["CARAVEL_SCHED_STRICT"] === "1";

const root = await mkdtemp(join(tmpdir(), "caravel-sched-"));
process.chdir(root);

const adapter = await resolveRealScheduler();
let real: RealScheduler | null = null;
if (adapter.status === "available") {
  real = adapter.scheduler;
  console.log(`real scheduler: ${adapter.scheduler.label}`);
} else {
  console.log(`real scheduler: INCOMPATIBLE (${adapter.reason}) — reference only.`);
}

// ── run every case ───────────────────────────────────────────────────────────

for (const c of CASES) {
  console.log(`\n${c.name}`);
  console.log(`  [pins: ${c.pins}]`);

  const agentsDir = await buildFixture(root, c.decl);
  const agentNames = Object.keys(c.decl.agents);
  // Enumerate raw-file ids too — a case like the unparseable-sibling one must
  // ask the real scheduler about the corrupt envelope itself, or agreement is
  // vacuous (the oracle skips it; the adapter would never query it).
  const allIds = [
    ...Object.values(c.decl.agents).flatMap((tasks) => tasks.map((t) => t.id)),
    ...(c.decl.rawFiles ?? []).map((r) => r.name.replace(/\.yaml$/, "")),
  ];

  const result = await withWatchdog(c.watchdogMs ?? 2000, async () => {
    const graph = await loadGraph(agentsDir, agentNames);
    return { graph, ready: readySet(graph) };
  });

  if (!result.ok) {
    report(false, `terminates: ${c.name}`, `did not finish within ${c.watchdogMs ?? 2000}ms`);
    continue;
  }
  checkCase(c.name, result.value.ready, result.value.graph, c);

  if (real) {
    const realReady = await withWatchdog(c.watchdogMs ?? 2000, () =>
      real!.computeReady(agentsDir, agentNames, allIds)
    );
    if (!realReady.ok) {
      const msg = `${c.name}: real scheduler did not terminate`;
      findings.push(msg);
      report(false, `real scheduler terminates: ${c.name}`);
      continue;
    }
    const exp = sorted(c.expectReady);
    const got = sorted(realReady.value);
    const agree = exp.length === got.length && exp.every((v, i) => v === got[i]);
    if (!agree) {
      const msg = `${c.name}: real scheduler [${got.join(", ")}] ≠ FDP expectation [${exp.join(", ")}]`;
      findings.push(msg);
      // Deliberately NOT report(): a finding is advisory unless STRICT, so it
      // must not count into `failed`.
      console.error(`  ✗ (finding) real scheduler agrees: ${c.name}\n    ${msg0(got, exp)}`);
    } else {
      report(true, `real scheduler agrees: ${c.name}`);
    }
  }
}

function msg0(got: string[], exp: string[]) {
  return `FINDING against runner — expected [${exp.join(", ")}] got [${got.join(", ")}]`;
}

// ── cleanup + summary ────────────────────────────────────────────────────────

await rm(root, { recursive: true, force: true });

console.log(`\n${"─".repeat(56)}`);
console.log(
  `Results: ${passed} passed, ${failed} failed${real ? ` (+${findings.length} findings vs real scheduler)` : ""}` +
    (STRICT ? " [STRICT: findings fail]" : "")
);
if (findings.length > 0) {
  console.error(
    `\nFINDINGS against src/multiAgent.ts (advisory${STRICT ? ", STRICT — failing" : ""}; report, do not fix — runner is WAL-72's):`
  );
  for (const f of findings) console.error(`  • ${f}`);
}

if (failed > 0 || (STRICT && findings.length > 0)) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
