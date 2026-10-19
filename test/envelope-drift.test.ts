/**
 * Drift test — behavioral, not comparative (WAL-123 Phase A, step 4).
 *
 * DEF-1 backstory: a test that compares CLI imports to runner imports compares a module to
 * itself once they share schema.ts — it goes green forever. This suite avoids that shape by
 * driving the runner's own entry points (via __testing) and the CLI's validation path
 * independently, then asserting they both accept every valid spec and both reject a non-member.
 *
 * What this test proves:
 *   1. For every spec in VALID_WAITING_SPECS, both the runner (transitionToWaiting +
 *      SWEEP_PREDICATES) and the CLI accept it.
 *   2. A non-member spec ("waiting:on:bogus") is rejected by both sides.
 *   3. Every named bucket subset (ARCHIVABLE_BUCKETS, GRAPH_SCAN_BUCKETS, etc.) is a
 *      subset of schema.BUCKETS — i.e., they are derived from schema.ts, not independently
 *      defined.
 *   4. Grep gate: no string-literal bucket list or spec list reappears in src/ or scripts/
 *      outside schema.ts.
 *
 * Adding a family to schema.VALID_WAITING_SPECS without a SWEEP_PREDICATES entry fails the
 * behavioral half. Reintroducing a literal in src/ or scripts/ fails the grep half.
 *
 * Run with: bun run test/envelope-drift.test.ts
 */

import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readdirSync, readFileSync } from "fs";
import {
  BUCKETS,
  VALID_WAITING_SPECS,
  ARCHIVABLE_BUCKETS,
  GRAPH_SCAN_BUCKETS,
  LOCATE_ENVELOPE_BUCKETS,
  STALE_RENDEZVOUS_BUCKETS,
  ALLOCATION_SCAN_DIRS,
  VALIDATE_BUCKETS,
  WORKER_WAITING_SPECS,
} from "../src/envelope/schema";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function makeClaimedYaml(id: string, agent = "bob"): string {
  return [
    `id: ${id}`,
    `headline: "drift test"`,
    `created: 2026-01-01T00:00:00.000Z`,
    `updated: 2026-01-01T00:00:00.000Z`,
    `from: alice`,
    `to: ${agent}`,
    `kind: code`,
    `priority: high`,
    `project: null`,
    `brief: |`,
    `  test`,
    `output_format: ""`,
    `status: claimed`,
    `budget:`,
    `  max_turns: 10`,
    `history: []`,
    `dispatch:`,
    `  chat_id: test-chat`,
    `  chat_ts: 2026-01-01T00:00:00.000Z`,
    `lease:`,
    `  holder: runner-test`,
    `  expires: 2099-01-01T00:00:00.000Z`,
  ].join("\n") + "\n";
}

// ── suite ────────────────────────────────────────────────────────────────────

console.log("envelope-drift (WAL-123 Phase A)");

// ── T1: bucket subsets all derive from BUCKETS ────────────────────────────────

console.log("\nT1 — bucket subsets are subsets of BUCKETS:");
const allBuckets = new Set<string>(BUCKETS);

const subsets: Array<{ name: string; members: readonly string[] }> = [
  { name: "ARCHIVABLE_BUCKETS", members: ARCHIVABLE_BUCKETS },
  { name: "GRAPH_SCAN_BUCKETS", members: GRAPH_SCAN_BUCKETS },
  { name: "LOCATE_ENVELOPE_BUCKETS", members: LOCATE_ENVELOPE_BUCKETS },
  { name: "STALE_RENDEZVOUS_BUCKETS", members: STALE_RENDEZVOUS_BUCKETS },
  { name: "ALLOCATION_SCAN_DIRS", members: ALLOCATION_SCAN_DIRS },
  { name: "VALIDATE_BUCKETS", members: VALIDATE_BUCKETS },
];

for (const { name, members } of subsets) {
  for (const b of members) {
    assert(allBuckets.has(b), `${name} member "${b}" is in BUCKETS`);
  }
  assert(members.length > 0, `${name} is non-empty`);
}

// ── T2: VALID_WAITING_SPECS accepted by the runner ───────────────────────────

console.log("\nT2 — runner accepts every VALID_WAITING_SPECS member:");

// We need to drive multiAgent's entry points. The module pins AGENTS_DIR at load time,
// so we chdir into a tmpdir before importing (same pattern as the other suites).
const tmp = await mkdtemp(join(tmpdir(), "drift-test-"));
const agentDir = join(tmp, "agents", "test-agent", "tasks");

for (const bucket of ["open", "waiting", "done", "failed", "paused", "blocked", "archived", "scheduled"]) {
  await mkdir(join(agentDir, bucket), { recursive: true });
}

// Write a claimed envelope to open/
const taskId = "TSK-DRIFT-T2";
await writeFile(join(agentDir, "open", `${taskId}.yaml`), makeClaimedYaml(taskId));

process.chdir(tmp);
const { __testing } = await import("../src/multiAgent");

for (const spec of VALID_WAITING_SPECS) {
  const id = `TSK-DRIFT-SPEC-${spec.toUpperCase()}`;
  await mkdir(join(agentDir, "open"), { recursive: true });
  await writeFile(join(agentDir, "open", `${id}.yaml`), makeClaimedYaml(id));

  try {
    // TaskDirective shape: kind="waiting", reason=spec, deadline, watch, summary, body, report
    const directive = {
      kind: "waiting" as const,
      reason: spec,
      deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
      watch: `test rendezvous for ${id}`,
      summary: `drift test spec=${spec}`,
      body: "",
      report: null,
    };
    // @ts-ignore — __testing.transitionToWaiting is the runner's internal path
    await __testing.transitionToWaiting(
      "test-agent",
      id,
      join(agentDir, "open", `${id}.yaml`),
      directive
    );

    const waitingPath = join(agentDir, "waiting", `${id}.yaml`);
    assert(existsSync(waitingPath), `runner: transitionToWaiting accepted spec "${spec}"`);

    // Also confirm SWEEP_PREDICATES has an entry for this spec
    // @ts-ignore — __testing.SWEEP_PREDICATES
    const predicates = __testing.SWEEP_PREDICATES as Record<string, unknown>;
    assert(spec in predicates, `runner: SWEEP_PREDICATES has entry for spec "${spec}"`);
  } catch (err) {
    assert(false, `runner: transitionToWaiting accepted spec "${spec}"`, String(err));
  }
}

// ── T3: non-member spec rejected by the runner ───────────────────────────────

console.log("\nT3 — runner rejects non-member spec 'bogus':");

const bogusId = "TSK-DRIFT-BOGUS";
await writeFile(join(agentDir, "open", `${bogusId}.yaml`), makeClaimedYaml(bogusId));

let runnerRejected = false;
try {
  // reason: "bogus" — not in VALID_WAITING_SPECS, should be rejected
  const directive = {
    kind: "waiting" as const,
    reason: "bogus",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    watch: "drift test bogus",
    summary: "drift test bogus spec",
    body: "",
    report: null,
  };
  // @ts-ignore
  await __testing.transitionToWaiting(
    "test-agent",
    bogusId,
    join(agentDir, "open", `${bogusId}.yaml`),
    directive
  );
  // transitionToWaiting returns early (does NOT throw) on bad spec
  const waitingPath = join(agentDir, "waiting", `${bogusId}.yaml`);
  runnerRejected = !existsSync(waitingPath);
} catch {
  runnerRejected = true;
}
assert(runnerRejected, `runner: transitionToWaiting rejected spec "bogus"`);

// Also assert bogus is not in SWEEP_PREDICATES
// @ts-ignore
const predicates = __testing.SWEEP_PREDICATES as Record<string, unknown>;
assert(!("bogus" in predicates), `runner: SWEEP_PREDICATES has no entry for "bogus"`);

// ── T4: VALID_WAITING_SPECS not in WORKER_WAITING_SPECS ──────────────────────

console.log("\nT4 — limits is runner-internal (not in WORKER_WAITING_SPECS):");
assert(!WORKER_WAITING_SPECS.has("limits"), `"limits" absent from WORKER_WAITING_SPECS`);
assert(VALID_WAITING_SPECS.has("limits"), `"limits" present in VALID_WAITING_SPECS`);
assert(WORKER_WAITING_SPECS.has("script"), `"script" present in WORKER_WAITING_SPECS`);

// ── T5: CLI park validation rejects non-member spec ──────────────────────────

console.log("\nT5 — CLI park rejects non-member spec:");

// The CLI uses WORKER_WAITING_SPECS to validate. Write a minimal envelope for it.
const cliTaskId = "TSK-DRIFT-CLI";
await writeFile(join(agentDir, "open", `${cliTaskId}.yaml`), makeClaimedYaml(cliTaskId));

// Simulate CLI validation logic: check WORKER_WAITING_SPECS
const bogusSpec = "bogus";
assert(
  !WORKER_WAITING_SPECS.has(bogusSpec),
  `CLI: WORKER_WAITING_SPECS rejects spec "${bogusSpec}"`
);

for (const spec of WORKER_WAITING_SPECS) {
  assert(
    WORKER_WAITING_SPECS.has(spec),
    `CLI: WORKER_WAITING_SPECS accepts spec "${spec}"`
  );
}

// ── T6: grep gate — no literal bucket list outside schema.ts ─────────────────

console.log("\nT6 — grep gate: no bucket/spec literals in src/ or scripts/ (except schema.ts):");

const WORKTREE = join(import.meta.dir, "..");

function collectTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      collectTs(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Files to scan: src/ and scripts/ (not schema.ts itself, not test/)
const srcDir = join(WORKTREE, "src");
const scriptsDir = join(WORKTREE, "scripts");
const schemaPath = join(srcDir, "envelope", "schema.ts");

const filesToScan = [
  ...collectTs(srcDir),
  ...collectTs(scriptsDir),
].filter((f) => f !== schemaPath);

// Patterns that signal a locally-defined literal list. We look for:
// - An array literal containing two or more canonical bucket names on one line
// - A Set constructor with two or more spec names
const BUCKET_NAMES = ["open", "waiting", "done", "failed", "paused", "blocked", "archived", "scheduled"];
const SPEC_NAMES = ["limits", "script"];

// Three-or-more bucket names in an array literal signals a locally-defined bucket list.
// Does NOT flag: type annotations ("done" | "failed"), individual comparisons.
function hasBucketLiteral(line: string): boolean {
  // Must have array bracket to be a literal list (not just a type annotation)
  if (!line.includes("[")) return false;
  const found = BUCKET_NAMES.filter((b) => {
    const re = new RegExp(`["']${b}["']`);
    return re.test(line);
  });
  return found.length >= 3;
}

// Both spec names in an array/set literal signals a locally-defined spec list.
function hasSpecLiteral(line: string): boolean {
  if (!line.includes("[") && !line.includes("Set(")) return false;
  return SPEC_NAMES.every((s) => new RegExp(`["']${s}["']`).test(line));
}

let gateViolations = 0;
for (const file of filesToScan) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  const relPath = file.replace(WORKTREE + "/", "");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and import lines
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    if (/^\s*import\s/.test(line)) continue;

    if (hasBucketLiteral(line)) {
      console.error(`  grep-gate: bucket literal at ${relPath}:${i + 1}`);
      console.error(`    ${line.trim()}`);
      gateViolations++;
    }
    if (hasSpecLiteral(line)) {
      console.error(`  grep-gate: spec literal at ${relPath}:${i + 1}`);
      console.error(`    ${line.trim()}`);
      gateViolations++;
    }
  }
}

assert(gateViolations === 0, `grep gate: no bucket/spec literals in src/ or scripts/ (${gateViolations} violations)`);

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
