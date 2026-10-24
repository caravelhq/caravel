/**
 * Tests for caravel task batch (WAL-123 Phase C v2).
 *
 * All tests run against a throwaway workspace in a tmpdir — never the real agents/ tree.
 *
 * B1: 3-node sequential chain (A→B→C via needs:) — all 3 dispatched, real IDs substituted.
 * B2: parallel fan-out + convergence — A and B run in parallel, C waits for both.
 * B3: cycle detection — batch with A needs B, B needs A is rejected before any write.
 * B4: dangling reference — batch referencing a label not in the batch is rejected.
 * B5: lint failure aborts the batch — bad headline (>10 words) blocks the entire batch.
 * B6: top-level defaults — from/project/to at spec root are inherited by tasks.
 * B7: single-task batch — degenerate case, works like task new.
 *
 * Run with: bun run test/cli-batch-dispatch.test.ts
 * Exits 0 if every assertion passes, 1 otherwise.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "fs";
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`
    );
    failed++;
  }
}

function assertIncludes(text: string, substr: string, label: string): void {
  if (text.includes(substr)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(
      `  ✗ ${label}\n    expected to include: ${JSON.stringify(substr)}\n    in: ${JSON.stringify(text.slice(0, 300))}`
    );
    failed++;
  }
}

// ── workspace fixture ─────────────────────────────────────────────────────────

const ROOT = mkdtempSync(join(tmpdir(), "cli-batch-test-"));

const AGENT = "alice";
for (const bucket of ["open", "waiting", "done", "failed", "paused", "blocked", "archived"]) {
  mkdirSync(join(ROOT, "agents", AGENT, "tasks", bucket), { recursive: true });
}
writeFileSync(join(ROOT, "agents", AGENT, "tasks", "journal.ndjson"), "");
writeFileSync(join(ROOT, "agents", AGENT, "agent.json"), JSON.stringify({
  name: AGENT,
  displayName: "Alice",
  description: "test agent",
  mode: "resident",
}));

// Set CARAVEL_WORKSPACE before importing
process.env.CARAVEL_WORKSPACE = ROOT;

const { runTaskCli } = await import("../src/cli/task");

// ── capture helper ────────────────────────────────────────────────────────────

type Captured = { stdout: string[]; stderr: string[]; exitCode: number | null };

/** Run `caravel task batch` with a given YAML spec and return captured output. */
function runBatch(specYaml: string, extraArgs: string[] = []): Captured {
  const specPath = join(ROOT, `batch-spec-${Date.now()}.yaml`);
  writeFileSync(specPath, specYaml);

  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;

  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);

  console.log = (...a: unknown[]) => stdout.push(a.join(" "));
  console.warn = (...a: unknown[]) => stderr.push(a.join(" "));
  console.error = (...a: unknown[]) => stderr.push(a.join(" "));
  // @ts-ignore
  process.stderr.write = (chunk: string) => { stderr.push(chunk.trim()); return true; };
  // @ts-ignore
  process.exit = (code?: number) => { exitCode = code ?? 0; throw new Error(`__EXIT_${code ?? 0}__`); };

  try {
    runTaskCli(["batch", "--yaml", specPath, ...extraArgs]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.startsWith("__EXIT_")) {
      stderr.push(`UNEXPECTED_THROW: ${msg}`);
    }
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
    process.stderr.write = origStderrWrite;
    // @ts-ignore
    process.exit = origExit;
  }

  return { stdout, stderr, exitCode };
}

/** Get printed task IDs (one per line on stdout) from a run. */
function printedIds(result: Captured): string[] {
  return result.stdout.filter((l) => /^TSK-/.test(l));
}

/** Read the YAML body of a task envelope by ID. */
function readEnvelope(id: string): string {
  const path = join(ROOT, "agents", AGENT, "tasks", "open", `${id}.yaml`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Count files in the open bucket. */
function openCount(): number {
  const dir = join(ROOT, "agents", AGENT, "tasks", "open");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).length : 0;
}

// ── B1: 3-node sequential chain ───────────────────────────────────────────────

console.log("\nB1: 3-node sequential chain (A→B→C via needs:)");

{
  const before = openCount();

  const spec = `
from: alice
tasks:
  step-a:
    headline: "Fetch source data"
    to: alice
    kind: code
    brief: |
      Fetch the data.
    output_format: agents/alice/tasks/done/<id>.md

  step-b:
    headline: "Process fetched data"
    to: alice
    kind: code
    needs:
      - step-a
    brief: |
      Process the data.
    output_format: agents/alice/tasks/done/<id>.md

  step-c:
    headline: "Generate final report"
    to: alice
    kind: report
    needs:
      - step-b
    brief: |
      Generate report.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);
  const ids = printedIds(result);

  assert(result.exitCode === null, "B1a: exits without error code");
  assertEqual(ids.length, 3, "B1b: printed 3 IDs to stdout");
  assertEqual(openCount() - before, 3, "B1c: 3 envelopes written to open/");

  const [idA, idB, idC] = ids;
  if (idA && idB && idC) {
    const yamlA = readEnvelope(idA);
    const yamlB = readEnvelope(idB);
    const yamlC = readEnvelope(idC);

    // step-a (first dispatched) has no needs:
    assert(!yamlA.includes("needs:"), "B1d: step-a has no needs: field");
    // step-b needs step-a (first ID)
    assertIncludes(yamlB, `  - ${idA}`, "B1e: step-b needs: contains step-a's real ID");
    // step-c needs step-b (second ID)
    assertIncludes(yamlC, `  - ${idB}`, "B1f: step-c needs: contains step-b's real ID");
    // no local labels leaked into the written envelopes
    assert(!yamlB.includes("step-a"), "B1g: step-b has no raw 'step-a' label in YAML");
    assert(!yamlC.includes("step-b"), "B1h: step-c has no raw 'step-b' label in YAML");
    // IDs are consecutive serials
    const serial = (id: string) => parseInt(id.split("-").pop() ?? "0", 10);
    assertEqual(serial(idB) - serial(idA), 1, "B1i: step-b serial is step-a + 1");
    assertEqual(serial(idC) - serial(idB), 1, "B1j: step-c serial is step-b + 1");
  }
}

// ── B2: parallel fan-out + convergence ────────────────────────────────────────

console.log("\nB2: parallel fan-out + convergence (fetch,validate in parallel; combine needs both)");

{
  const before = openCount();

  const spec = `
tasks:
  fetch:
    headline: "Fetch data from source"
    to: alice
    kind: code
    from: alice
    brief: |
      Fetch from source.
    output_format: agents/alice/tasks/done/<id>.md

  validate:
    headline: "Validate source schema"
    to: alice
    kind: code
    from: alice
    brief: |
      Validate data.
    output_format: agents/alice/tasks/done/<id>.md

  combine:
    headline: "Combine results into report"
    to: alice
    kind: report
    from: alice
    needs:
      - fetch
      - validate
    brief: |
      Combine results.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);
  const ids = printedIds(result);

  assert(result.exitCode === null, "B2a: exits without error code");
  assertEqual(ids.length, 3, "B2b: 3 IDs dispatched");
  assertEqual(openCount() - before, 3, "B2c: 3 envelopes written");

  const [idFetch, idValidate, idCombine] = ids;
  if (idFetch && idValidate && idCombine) {
    const yamlCombine = readEnvelope(idCombine);
    assertIncludes(yamlCombine, `  - ${idFetch}`, "B2d: combine needs fetch ID");
    assertIncludes(yamlCombine, `  - ${idValidate}`, "B2e: combine needs validate ID");
    // fetch and validate have no needs:
    assert(!readEnvelope(idFetch).includes("needs:"), "B2f: fetch has no needs:");
    assert(!readEnvelope(idValidate).includes("needs:"), "B2g: validate has no needs:");
  }
}

// ── B3: cycle detection ───────────────────────────────────────────────────────

console.log("\nB3: cycle detection rejects the batch");

{
  const before = openCount();

  const spec = `
tasks:
  task-a:
    headline: "Task A depends on B"
    to: alice
    kind: code
    from: alice
    needs:
      - task-b
    brief: A depends on B.
    output_format: agents/alice/tasks/done/<id>.md

  task-b:
    headline: "Task B depends on A"
    to: alice
    kind: code
    from: alice
    needs:
      - task-a
    brief: B depends on A.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);

  assert(result.exitCode !== null && result.exitCode !== 0, "B3a: exits non-zero");
  assertEqual(openCount(), before, "B3b: no envelopes written (cycle rejected)");
  assert(result.stderr.some((l) => l.toLowerCase().includes("cycle")), "B3c: error mentions cycle");
  assertEqual(printedIds(result).length, 0, "B3d: no IDs printed");
}

// ── B4: dangling reference ────────────────────────────────────────────────────

console.log("\nB4: dangling reference (needs: points to unknown label)");

{
  const before = openCount();

  const spec = `
tasks:
  task-x:
    headline: "Task X needs a missing label"
    to: alice
    kind: code
    from: alice
    needs:
      - task-missing
    brief: Depends on non-existent label.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);

  assert(result.exitCode !== null && result.exitCode !== 0, "B4a: exits non-zero");
  assertEqual(openCount(), before, "B4b: no envelopes written");
  assert(
    result.stderr.some((l) => l.includes("task-missing") || l.includes("unknown label")),
    "B4c: error names the missing label"
  );
  assertEqual(printedIds(result).length, 0, "B4d: no IDs printed");
}

// ── B5: lint failure aborts the entire batch ──────────────────────────────────

console.log("\nB5: lint failure (headline too long) aborts the entire batch");

{
  const before = openCount();

  const spec = `
tasks:
  good-task:
    headline: "Good task headline"
    to: alice
    kind: code
    from: alice
    brief: This is fine.
    output_format: agents/alice/tasks/done/<id>.md

  bad-task:
    headline: "This headline is way too long and definitely has more than ten words in it"
    to: alice
    kind: code
    from: alice
    brief: This has a bad headline.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);

  assert(result.exitCode !== null && result.exitCode !== 0, "B5a: exits non-zero");
  assertEqual(openCount(), before, "B5b: no envelopes written (lint failure aborted batch)");
  assert(result.stderr.some((l) => l.includes("bad-task")), "B5c: error names the failing task");
  assert(result.stderr.some((l) => l.includes("headline")), "B5d: error mentions headline");
  assertEqual(printedIds(result).length, 0, "B5e: no IDs printed");
}

// ── B6: top-level defaults inherited ─────────────────────────────────────────

console.log("\nB6: top-level from/project defaults are inherited by tasks");

{
  const spec = `
from: alice
to: alice
project: WAL-123_Multi-Agent

tasks:
  delegated:
    headline: "Delegated task with defaults"
    kind: code
    brief: |
      Uses top-level defaults.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);
  const ids = printedIds(result);

  assert(result.exitCode === null, "B6a: exits without error code");
  assertEqual(ids.length, 1, "B6b: one ID dispatched");

  if (ids[0]) {
    const yamlBody = readEnvelope(ids[0]);
    assertIncludes(yamlBody, "from: alice", "B6c: from: from top-level default");
    assertIncludes(yamlBody, "project: WAL-123_Multi-Agent", "B6d: project: from top-level default");
  }
}

// ── B7: single-task batch ─────────────────────────────────────────────────────

console.log("\nB7: single-task batch (degenerate case)");

{
  const before = openCount();

  const spec = `
tasks:
  solo:
    headline: "Solo task in batch"
    to: alice
    from: alice
    kind: code
    brief: |
      Just one task.
    output_format: agents/alice/tasks/done/<id>.md
`.trim();

  const result = runBatch(spec);
  const ids = printedIds(result);

  assert(result.exitCode === null, "B7a: single-task batch exits without error");
  assertEqual(openCount() - before, 1, "B7b: exactly one envelope written");
  assertEqual(ids.length, 1, "B7c: one ID printed");

  if (ids[0]) {
    const yaml = readEnvelope(ids[0]);
    assertIncludes(yaml, "parent: null", "B7d: solo task has parent: null");
    assertIncludes(yaml, "status: open", "B7e: solo task has status: open");
  }
}

// ── isolation ─────────────────────────────────────────────────────────────────

assert(
  !ROOT.startsWith("/home/walter/workspace"),
  "ISOLATION: test root is outside real workspace",
  `root=${ROOT}`
);

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
