/**
 * Policy lint tests for src/cli/task.ts doLintNewEnvelope (WAL-123 Phase B step 9).
 *
 * One fixture per F2 row, plus the companion warn and the n ≥ 5 median guard.
 * Each fixture demonstrates: FAIL before the fix, PASS after.
 *
 * F2 catalogue (from the FDP):
 *   F2-1 (R16 M8):    Sibling tasks with overlapping touches: and no needs: edge
 *   F2-2 (.19/.21):   Budget outside 0.5×–1.5× median (blocked on n ≥ 5 guard)
 *   F2-3 (.19→.21):   Second retry of the same parent: chain
 *   F2-4 (WAL-119):   "lint" in brief for a repo with no lint config
 *   F2-5 (several):   Rule/doc path in brief absent from context:
 *
 * Additional:
 *   Companion warn:   ≥2 parallel tasks in same project, none declares touches:
 *   Hard-fails:       Unknown agent, missing required field, headline > 10 words, invalid waiting_on
 *   Output format:    No output_format field, or output_format with no path
 *
 * Run with: bun run test/cli-policy-lint.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { doLintNewEnvelope } from "../src/cli/task";

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

function hasHardFail(result: ReturnType<typeof doLintNewEnvelope>, fragment: string): boolean {
  return result.hardFails.some((f) => f.includes(fragment));
}

function hasWarning(result: ReturnType<typeof doLintNewEnvelope>, fragment: string): boolean {
  return result.warnings.some((w) => w.includes(fragment));
}

function noHardFails(result: ReturnType<typeof doLintNewEnvelope>): boolean {
  return result.hardFails.length === 0;
}

function noWarnings(result: ReturnType<typeof doLintNewEnvelope>): boolean {
  return result.warnings.length === 0;
}

// ── workspace fixture ─────────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "lint-test-"));
const AGENT = "alice";

for (const bucket of ["open", "waiting", "done", "failed", "paused", "blocked", "archived"]) {
  mkdirSync(join(root, "agents", AGENT, "tasks", bucket), { recursive: true });
}
writeFileSync(join(root, "agents", AGENT, "tasks", "journal.ndjson"), "");
writeFileSync(join(root, "agents", AGENT, "agent.json"), JSON.stringify({
  name: AGENT, displayName: "Alice", description: "test", mode: "resident",
}));

// Add a second agent for some tests
for (const bucket of ["open", "waiting", "done", "failed", "paused", "blocked", "archived"]) {
  mkdirSync(join(root, "agents", "bob", "tasks", bucket), { recursive: true });
}
writeFileSync(join(root, "agents", "bob", "tasks", "journal.ndjson"), "");
writeFileSync(join(root, "agents", "bob", "agent.json"), JSON.stringify({
  name: "bob", displayName: "Bob", description: "test", mode: "resident",
}));

process.env.CARAVEL_WORKSPACE = root;

// ── base envelope template ─────────────────────────────────────────────────────

const BASE = `id: TSK-2026-01-01-0001
headline: "test task headline"
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z

from: bob
to: alice
parent: null
reply_to: bob

kind: code
priority: P2
status: open
project: TestProject

brief: |
  A test task for the policy lint suite.

output_format: |
  A report at agents/alice/tasks/done/<id>.md
`;

// ── Hard-fail: unknown agent ───────────────────────────────────────────────────

console.log("\n── H1: unknown agent ─────────────────────────────────────────────");

{
  const bad = BASE.replace("to: alice", "to: nonexistent-agent");
  const r = doLintNewEnvelope(bad, root);
  assert(hasHardFail(r, "unknown agent"), 'FAIL: "nonexistent-agent" triggers hard-fail');
  assert(hasHardFail(r, "nonexistent-agent"), "FAIL: error names the offending agent");

  const good = BASE;
  const r2 = doLintNewEnvelope(good, root);
  assert(!hasHardFail(r2, "unknown agent"), "PASS: known agent clears hard-fail");
}

// ── Hard-fail: missing required field ────────────────────────────────────────

console.log("\n── H2: missing required field ────────────────────────────────────");

{
  // Remove the `from:` line
  const bad = BASE.replace(/^from:.*\n/m, "");
  const r = doLintNewEnvelope(bad, root);
  assert(hasHardFail(r, 'missing required field "from"'), 'FAIL: missing from: triggers hard-fail');

  // Restore from:
  const good = BASE;
  const r2 = doLintNewEnvelope(good, root);
  assert(!hasHardFail(r2, "missing required field"), "PASS: all required fields present");
}

// ── Hard-fail: headline > 10 words ────────────────────────────────────────────

console.log("\n── H3: headline over 10 words ────────────────────────────────────");

{
  const bad = BASE.replace(
    'headline: "test task headline"',
    'headline: "this headline has eleven words which exceeds the ten word maximum limit"'
  );
  const r = doLintNewEnvelope(bad, root);
  assert(hasHardFail(r, "headline too long"), "FAIL: 11-word headline triggers hard-fail");

  const exactly10 = BASE.replace(
    'headline: "test task headline"',
    'headline: "one two three four five six seven eight nine ten"'
  );
  const r2 = doLintNewEnvelope(exactly10, root);
  assert(!hasHardFail(r2, "headline too long"), "PASS: exactly 10 words is allowed");
}

// ── Hard-fail: invalid waiting_on ─────────────────────────────────────────────

console.log("\n── H4: invalid waiting_on ────────────────────────────────────────");

{
  const bad = BASE + "\nwaiting_on: bogus-spec\n";
  const r = doLintNewEnvelope(bad, root);
  assert(hasHardFail(r, "waiting_on"), 'FAIL: invalid waiting_on spec triggers hard-fail');
  assert(hasHardFail(r, "bogus-spec"), "FAIL: error names the bad spec");

  const good = BASE + "\nwaiting_on: script\n";
  const r2 = doLintNewEnvelope(good, root);
  assert(!hasHardFail(r2, "waiting_on"), "PASS: valid waiting_on spec clears hard-fail");
}

// ── Hard-fail: second retry (F2-3) ────────────────────────────────────────────
// Incident: "One automatic retry, ever" tracked in Alice's head while dispatching a second
// (.19 → .21 in the FDP catalogue)

console.log("\n── H5 / F2-3: second retry ───────────────────────────────────────");

{
  const ROOT_TASK_ID = "TSK-2026-01-01-0002";
  const FIRST_RETRY_ID = `${ROOT_TASK_ID}.01`;

  // Plant a first retry child in the workspace
  writeFileSync(
    join(root, "agents", AGENT, "tasks", "done", `${FIRST_RETRY_ID}.yaml`),
    `id: ${FIRST_RETRY_ID}\nheadline: "first retry"\nstatus: done\nfrom: bob\nto: alice\nparent: ${ROOT_TASK_ID}\nreply_to: bob\nsummary: completed\n`
  );

  // Second retry of the same parent — should hard-fail without --force
  const secondRetry = BASE.replace("parent: null", `parent: ${ROOT_TASK_ID}`);
  const r = doLintNewEnvelope(secondRetry, root);
  assert(hasHardFail(r, "second retry"), "FAIL: second retry hard-fails without --force");
  assert(hasHardFail(r, ROOT_TASK_ID), "FAIL: error names the parent id");

  // First dispatch of a parent (no prior child) — no hard-fail
  const ROOT_TASK_ID2 = "TSK-2026-01-01-0003";
  const firstRetry = BASE.replace("parent: null", `parent: ${ROOT_TASK_ID2}`);
  const r2 = doLintNewEnvelope(firstRetry, root);
  assert(!hasHardFail(r2, "second retry"), "PASS: no prior child — not a second retry");

  // --force bypasses the hard-fail and sets forceBypassed
  const r3 = doLintNewEnvelope(secondRetry, root, { force: true });
  assert(!hasHardFail(r3, "second retry"), "PASS (force): --force bypasses second-retry hard-fail");
  assert(r3.forceBypassed === true, "PASS (force): forceBypassed flag is set");
}

// ── Warn: overlapping touches: with no needs: edge (F2-1) ────────────────────
// Incident: .03/.04/.05 dispatched in parallel; collided on TabStrip.vue (R16 M8)

console.log("\n── W1 / F2-1: overlapping touches ────────────────────────────────");

{
  const SIBLING_PARENT = "TSK-2026-01-01-0010";
  const SIBLING_ID = `${SIBLING_PARENT}.01`;

  // Plant a sibling with overlapping touches:
  writeFileSync(
    join(root, "agents", AGENT, "tasks", "open", `${SIBLING_ID}.yaml`),
    `id: ${SIBLING_ID}\nheadline: "sibling task"\nstatus: open\nfrom: bob\nto: alice\nparent: ${SIBLING_PARENT}\nreply_to: bob\ntouches:\n  - repos/caravel/src/ui/TabStrip.vue\n  - repos/caravel/src/ui/app.ts\n`
  );

  // This task overlaps TabStrip.vue, no needs: edge
  const bad = BASE
    .replace("parent: null", `parent: ${SIBLING_PARENT}`)
    + "\ntouches:\n  - repos/caravel/src/ui/TabStrip.vue\n  - repos/caravel/src/cli/task.ts\n";
  const r = doLintNewEnvelope(bad, root);
  assert(hasWarning(r, "overlaps"), "WARN: overlapping touches: triggers warning");
  assert(hasWarning(r, SIBLING_ID), "WARN: warning names the sibling id");
  assert(hasWarning(r, "TabStrip.vue"), "WARN: warning names the overlapping path");

  // Same but with a needs: edge pointing at the sibling — warning clears
  const good = bad + `\nneeds:\n  - ${SIBLING_ID}\n`;
  const r2 = doLintNewEnvelope(good, root);
  assert(!hasWarning(r2, "overlaps"), "PASS: needs: edge clears overlap warning");

  // No shared paths — no warning
  const noOverlap = BASE
    .replace("parent: null", `parent: ${SIBLING_PARENT}`)
    + "\ntouches:\n  - repos/caravel/src/cli/task.ts\n";
  const r3 = doLintNewEnvelope(noOverlap, root);
  assert(!hasWarning(r3, "overlaps"), "PASS: non-overlapping touches: no warning");
}

// ── Warn: companion warn — ≥2 parallel tasks in same project, none has touches: ──

console.log("\n── W2: companion warn (parallel siblings, no touches) ────────────");

{
  const PROJECT = "TestParallelProject";

  // Plant an open task in the same project with no touches:
  writeFileSync(
    join(root, "agents", AGENT, "tasks", "open", "TSK-2026-01-01-0020.yaml"),
    `id: TSK-2026-01-01-0020\nheadline: "parallel sibling"\nstatus: open\nfrom: bob\nto: alice\nparent: null\nreply_to: bob\nproject: ${PROJECT}\n`
  );

  // This task also has no touches: — should warn
  const bad = BASE.replace("project: TestProject", `project: ${PROJECT}`);
  const r = doLintNewEnvelope(bad, root);
  assert(hasWarning(r, "parallel tasks"), "WARN: ≥2 parallel tasks without touches: triggers warning");
  assert(hasWarning(r, PROJECT), "WARN: warning names the project");

  // This task declares touches: — companion warn doesn't fire (this task has touches:)
  const withTouches = bad + "\ntouches:\n  - repos/caravel/src/cli/task.ts\n";
  const r2 = doLintNewEnvelope(withTouches, root);
  assert(!hasWarning(r2, "parallel tasks"), "PASS: declaring touches: suppresses companion warn");

  // Only one open task in the project (no sibling) — no companion warn
  const differentProject = BASE.replace("project: TestProject", "project: SingleTaskProject");
  const r3 = doLintNewEnvelope(differentProject, root);
  assert(!hasWarning(r3, "parallel tasks"), "PASS: single task in project — no companion warn");
}

// ── Warn: budget median guard (F2-2) — n ≥ 5 guard keeps it dormant ──────────
// Incident: gate budget guessed at 70 turns, died; then 95, died (n < 5 in workspace)

console.log("\n── W3 / F2-2: budget median guard (dormant until n ≥ 5) ──────────");

{
  const kindAgent = "code-test";
  const toAgent = "alice";

  // With fewer than 5 recorded tasks, the check should NOT fire even with a wild budget
  const withWildBudget = BASE.replace(
    "kind: code",
    `kind: ${kindAgent}`
  ) + "\nbudget:\n  max_turns: 9999\n";
  const r = doLintNewEnvelope(withWildBudget, root);
  assert(!hasWarning(r, "median"), "PASS (dormant): budget warn suppressed with n < 5 records");

  // Plant 5 usage records for kind=code-test/to=alice with turns ~40
  for (let i = 0; i < 5; i++) {
    writeFileSync(
      join(root, "agents", toAgent, "tasks", "done", `TSK-2026-01-05-000${i + 1}.yaml`),
      `id: TSK-2026-01-05-000${i + 1}\nheadline: "usage record ${i + 1}"\nstatus: done\nfrom: bob\nto: ${toAgent}\nkind: ${kindAgent}\nparent: null\nreply_to: bob\nsummary: done\nusage:\n  turns: ${38 + i}\n  tokens:\n    input: 100000\n    output: 5000\n    cache_read: 50000\n    cache_creation: 10000\n  duration_ms: 600000\n`
    );
  }

  // Now n=5, median≈40. Budget 9999 is >1.5×40 — should warn
  const r2 = doLintNewEnvelope(withWildBudget, root);
  assert(hasWarning(r2, "median"), "WARN: budget >1.5× median fires when n ≥ 5");

  // Budget of 40 (within 0.5×–1.5× of median 40) — no warning
  const goodBudget = BASE.replace("kind: code", `kind: ${kindAgent}`) + "\nbudget:\n  max_turns: 40\n";
  const r3 = doLintNewEnvelope(goodBudget, root);
  assert(!hasWarning(r3, "median"), "PASS: budget within 0.5×–1.5× range clears warning");

  // Budget of 5 (under 0.5× of median 40) — should also warn
  const lowBudget = BASE.replace("kind: code", `kind: ${kindAgent}`) + "\nbudget:\n  max_turns: 5\n";
  const r4 = doLintNewEnvelope(lowBudget, root);
  assert(hasWarning(r4, "median"), "WARN: budget under 0.5× median also fires");
}

// ── Warn: brief references path absent from context: (F2-5) ──────────────────
// Incident: rules named in prose while the context: array lagged

console.log("\n── W4 / F2-5: rule path in brief absent from context ─────────────");

{
  const badBrief = BASE.replace(
    "brief: |\n  A test task for the policy lint suite.",
    "brief: |\n  Read agents/_shared/rules/worktrees.md before starting."
  ).replace("output_format: |", "context:\n  - agents/_shared/task-envelope.md\n\noutput_format: |");

  const r = doLintNewEnvelope(badBrief, root);
  assert(hasWarning(r, "agents/_shared/rules/worktrees.md"), "WARN: rule path in brief not in context:");
  assert(hasWarning(r, "absent from context"), "WARN: error message references context:");

  // Add the path to context: — warning should clear
  const fixed = badBrief.replace(
    "context:\n  - agents/_shared/task-envelope.md",
    "context:\n  - agents/_shared/task-envelope.md\n  - agents/_shared/rules/worktrees.md"
  );
  const r2 = doLintNewEnvelope(fixed, root);
  assert(!hasWarning(r2, "agents/_shared/rules/worktrees.md"), "PASS: path added to context: clears warning");
}

// ── Warn: "lint" in brief for repo with no lint config (F2-4) ─────────────────
// Incident: "Lint gate" written into six briefs for a repo with no linter (WAL-119)

console.log("\n── W5 / F2-4: lint in brief for no-lint repo ────────────────────");

{
  // Create a mock repo dir without any lint config
  const nolintRepo = "nolint-repo";
  mkdirSync(join(root, "repos", nolintRepo, "src"), { recursive: true });
  writeFileSync(join(root, "repos", nolintRepo, "package.json"), JSON.stringify({
    name: nolintRepo,
    scripts: { build: "tsc" },  // no lint script
  }));

  const bad = BASE
    .replace(
      "brief: |\n  A test task for the policy lint suite.",
      "brief: |\n  Run the lint gate before committing."
    )
    + `\ntouches:\n  - repos/${nolintRepo}/src/index.ts\n`;
  const r = doLintNewEnvelope(bad, root);
  assert(hasWarning(r, "lint"), "WARN: 'lint' in brief for no-lint repo triggers warning");
  assert(hasWarning(r, nolintRepo), "WARN: warning names the repo");
  assert(hasWarning(r, "tsc --noEmit"), "WARN: suggestion mentions tsc --noEmit");

  // Repo WITH a lint config — no warning
  const lintRepo = "has-lint-repo";
  mkdirSync(join(root, "repos", lintRepo, "src"), { recursive: true });
  writeFileSync(join(root, "repos", lintRepo, "package.json"), JSON.stringify({
    name: lintRepo,
    scripts: { lint: "eslint src/" },
  }));

  const good = BASE
    .replace(
      "brief: |\n  A test task for the policy lint suite.",
      "brief: |\n  Run the lint gate before committing."
    )
    + `\ntouches:\n  - repos/${lintRepo}/src/index.ts\n`;
  const r2 = doLintNewEnvelope(good, root);
  assert(!hasWarning(r2, lintRepo), "PASS: repo with lint config suppresses warning");
}

// ── Warn: no output_format / output_format without artefact path ──────────────

console.log("\n── W6: output_format missing or path-free ────────────────────────");

{
  // Remove output_format entirely
  const noOutputFmt = BASE.replace(
    "\noutput_format: |\n  A report at agents/alice/tasks/done/<id>.md\n",
    "\n"
  );
  const r = doLintNewEnvelope(noOutputFmt, root);
  assert(hasWarning(r, "output_format"), "WARN: missing output_format triggers warning");

  // output_format with no path (no slash)
  const noPath = BASE.replace(
    "output_format: |\n  A report at agents/alice/tasks/done/<id>.md",
    "output_format: |\n  A written report with findings summarised."
  );
  const r2 = doLintNewEnvelope(noPath, root);
  assert(hasWarning(r2, "artefact path"), "WARN: output_format without path triggers warning");

  // output_format with a proper path
  const good = BASE;
  const r3 = doLintNewEnvelope(good, root);
  assert(!hasWarning(r3, "output_format"), "PASS: output_format with path clears warning");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
