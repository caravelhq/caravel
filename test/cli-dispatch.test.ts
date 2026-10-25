/**
 * Dispatch tests for src/cli/task.ts new|next-id|list|summary (WAL-123 Phase B step 8).
 *
 * One fixture per dated incident in task.mjs — each fix has a test that catches its regression.
 *
 * D1 (2026-08-26): double-quote bug — draft `headline: "Foo"` must not produce `headline: "\"Foo\""`.
 * D2 (2026-08-26): duplicate `headline:` — dedupe pass keeps exactly one occurrence.
 * D3 (TSK-2026-07-03-0001.10/.12): invisible-task bug — authoritative identity block always complete.
 * D4: quoted-colon headline — `Follow-on: step` stored and round-trips correctly.
 * D5: project inference — auto-inferred from context: paths when no --project flag.
 * D6 (F6): seven-bucket allocator — id in paused/ or blocked/ not reissued.
 *
 * Run with: bun run test/cli-dispatch.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, readdirSync } from "fs";
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
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

/** Extract a scalar from a YAML string (top-level key only). Unwraps JSON-quoted strings. */
function extractFmField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  let v = (m[1] ?? "").trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { v = JSON.parse(v); } catch { v = v.slice(1, -1); }
  }
  return v;
}

/** Count occurrences of a key pattern in a YAML string. */
function countLines(yaml: string, prefix: string): number {
  return yaml.split("\n").filter((l) => l.startsWith(prefix)).length;
}

// ── workspace fixture ─────────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "cli-dispatch-test-"));
const AGENT = "alice";

// Create all seven allocation buckets + journal
for (const bucket of ["open", "waiting", "done", "failed", "paused", "blocked", "archived"]) {
  mkdirSync(join(root, "agents", AGENT, "tasks", bucket), { recursive: true });
}
writeFileSync(join(root, "agents", AGENT, "tasks", "journal.ndjson"), "");
writeFileSync(join(root, "agents", AGENT, "agent.json"), JSON.stringify({
  name: AGENT, displayName: "Alice", description: "test", mode: "resident",
}));

process.env.CARAVEL_WORKSPACE = root;

// Import after env var is set so workspaceRoot() resolves correctly.
const { runTaskCli } = await import("../src/cli/task");

// ── helpers for writing draft files ──────────────────────────────────────────

let draftSeq = 0;

function writeDraft(yaml: string): string {
  const p = join(root, `draft-${++draftSeq}.yaml`);
  writeFileSync(p, yaml);
  return p;
}

function runNew(draftPath: string, opts: string[] = []): string {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    runTaskCli(["new", "--target", AGENT, "--yaml", draftPath, ...opts]);
  } finally {
    console.log = origLog;
  }
  return lines.join("\n").trim(); // last line is the allocated id
}

function runNextId(opts: string[] = []): string {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    runTaskCli(["next-id", "--target", AGENT, ...opts]);
  } finally {
    console.log = origLog;
  }
  return lines.join("\n").trim();
}

function readEnvelope(id: string): string {
  const p = join(root, "agents", AGENT, "tasks", "open", `${id}.yaml`);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// ── D1 (2026-08-26): double-quote bug ─────────────────────────────────────────

console.log("cli-dispatch (WAL-123 Phase B step 8)\n");
console.log("D1 — draft with quoted headline does not double-quote in output:");

const d1Draft = writeDraft([
  `headline: "Deploy the thing"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: test`,
  `output_format: ""`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n");

const d1Id = runNew(d1Draft);
const d1Yaml = readEnvelope(d1Id);
const d1Headline = extractFmField(d1Yaml, "headline");
assertEqual(d1Headline, "Deploy the thing", "D1: headline unwrapped — no double-quote");
assert(!d1Yaml.includes('\\"Deploy'), `D1: no escaped inner quotes in YAML (got: ${d1Yaml.split("\n").find(l => l.startsWith("headline:")) ?? ""})`);

// ── D2 (2026-08-26): duplicate headline key ───────────────────────────────────

console.log("\nD2 — draft with duplicate `headline:` key is deduped:");

const d2Draft = writeDraft([
  `id: TSK-STALE`,
  `headline: First Headline`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: test`,
  `headline: Second Headline`,  // duplicate!
  `output_format: ""`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n");

const d2Id = runNew(d2Draft, [`--headline`, "Final Headline"]);
const d2Yaml = readEnvelope(d2Id);
const d2Count = countLines(d2Yaml, "headline:");
assertEqual(d2Count, 1, "D2: exactly one headline: line in output");
const d2Headline = extractFmField(d2Yaml, "headline");
assertEqual(d2Headline, "Final Headline", "D2: headline value is from --headline flag");

// ── D3 (TSK-2026-07-03-0001.10/.12): authoritative identity block ─────────────

console.log("\nD3 — authoritative identity block always written (invisible-task bug fix):");

// A draft dispatched with --parent but no `parent:` field in the body would
// previously produce an envelope missing `parent:`, making the task invisible
// in the dashboard family-tree. Now the CLI always writes the complete block.
const d3Draft = writeDraft([
  `headline: "Sub-task without parent field"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: sub-task`,
  `output_format: ""`,
  `status: open`,
  `budget:`,
  `  max_turns: 5`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n");

// First, plant a parent in open/
const parentId = runNew(writeDraft([
  `headline: "Parent task"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: parent`,
  `output_format: ""`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n"));

// Dispatch a child with --parent but no `parent:` in the draft body
const d3Id = runNew(d3Draft, ["--parent", parentId]);
const d3Yaml = readEnvelope(d3Id);

assert(d3Id.includes("."), `D3: id is a decimal sub-id (got: ${d3Id})`);
assertEqual(extractFmField(d3Yaml, "parent"), parentId, "D3: parent: field is set correctly");
assertEqual(extractFmField(d3Yaml, "to"), AGENT, "D3: to: field is set");
assertEqual(extractFmField(d3Yaml, "from"), "alice", "D3: from: field is set");
// All four identity fields must be present
for (const field of ["from", "to", "parent", "reply_to"]) {
  assert(
    new RegExp(`^${field}:`, "m").test(d3Yaml),
    `D3: ${field}: field present in output`
  );
}

// ── D4: quoted-colon headline ─────────────────────────────────────────────────

console.log("\nD4 — headline with colon is stored and round-trips correctly:");

const d4Headline = "Follow-on: the next step";
const d4Draft = writeDraft([
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: colon test`,
  `output_format: ""`,
  `status: open`,
  `budget:`,
  `  max_turns: 5`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n");

const d4Id = runNew(d4Draft, ["--headline", d4Headline]);
const d4Yaml = readEnvelope(d4Id);
const d4HeadlineLine = d4Yaml.split("\n").find((l) => l.startsWith("headline:")) ?? "";
// The headline line must be quoted (colon inside value makes bare value ambiguous in YAML)
assert(
  d4HeadlineLine.includes('"'),
  `D4: headline with colon is JSON-quoted (got: ${d4HeadlineLine})`
);
// Must round-trip to the original value
assertEqual(extractFmField(d4Yaml, "headline"), d4Headline, "D4: headline round-trips");

// ── D5: project inference from context: paths ─────────────────────────────────

console.log("\nD5 — project inferred from context: paths when --project is absent:");

const d5Draft = writeDraft([
  `headline: "Context inference task"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: build`,
  `priority: P2`,
  `project: null`,
  `brief: test`,
  `output_format: ""`,
  `context:`,
  `  - Notes/Projects/WAL-63_Multi-Agent/2026-10-18_FDP.md`,
  `  - Notes/Projects/WAL-63_Multi-Agent/README.md`,
  `  - repos/caravel/src/cli/task.ts`,
  `status: open`,
  `budget:`,
  `  max_turns: 5`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n");

const d5Id = runNew(d5Draft);
const d5Yaml = readEnvelope(d5Id);
assertEqual(extractFmField(d5Yaml, "project"), "WAL-63_Multi-Agent", "D5: project inferred from context");

// ── D6 (F6): seven-bucket allocator — no id reuse from paused/ or blocked/ ────

console.log("\nD6 — seven-bucket allocator: paused/ and blocked/ prevent id reuse:");

// Plant two sub-tasks in paused/ (highest sibling) and one in blocked/.
// The old five-bucket scan (missing paused, blocked) would return .01 (reissue!).
// The new seven-bucket scan must return .04.
const today = new Date();
const dateStr =
  `${today.getFullYear()}-` +
  `${String(today.getMonth() + 1).padStart(2, "0")}-` +
  `${String(today.getDate()).padStart(2, "0")}`;
const baseParentId = `TSK-${dateStr}-8888`;

// Write to paused/ directly (simulating tasks that were paused)
for (const suffix of ["01", "02"]) {
  writeFileSync(
    join(root, "agents", AGENT, "tasks", "paused", `${baseParentId}.${suffix}.yaml`),
    `id: ${baseParentId}.${suffix}\nheadline: "paused"\nstatus: paused\nfrom: alice\nto: ${AGENT}\n`
  );
}
// Write to blocked/
writeFileSync(
  join(root, "agents", AGENT, "tasks", "blocked", `${baseParentId}.03.yaml`),
  `id: ${baseParentId}.03\nheadline: "blocked"\nstatus: blocked\nfrom: alice\nto: ${AGENT}\n`
);

// next-id should return .04, not .01 (which would be a reissue)
const d6NextId = runNextId(["--parent", baseParentId]);
assertEqual(d6NextId, `${baseParentId}.04`, "D6: next-id skips ids in paused/ and blocked/");
assert(d6NextId !== `${baseParentId}.01`, "D6: does not reissue .01 (which is in paused/)");

// Confirm the old five-bucket scan would return .01 by demonstrating manually:
// (We can't run the old scan here, but we document the contrast for the record.)
console.log(`  ℹ old 5-bucket scan would have returned ${baseParentId}.01 (visible in test log for contrast)`);

// ── D7–D12: caravel task delegate ─────────────────────────────────────────────
//
// D7 (WAL-153): failure-recovery — failed task replaced by delegate; blocked
//   dependant's needs: rewritten; delegate in done/ proves sweepBlocked releases.
// D8: --add mode keeps original edge alongside delegate.
// D9: cycle detection refuses when delegate transitively needs a dependant.
// D10: terminal delegate refused (delegate already in done/).
// D11: self-reference refused (--original === --to).
// D12: original keeps terminal status; gains delegated_to: field.
//

/** Call runTaskCli for `delegate` subcommand and collect stdout. */
function runDelegate(opts: string[]): string {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    runTaskCli(["delegate", ...opts]);
  } finally {
    console.log = origLog;
  }
  return lines.join("\n").trim();
}

/** Read YAML from a specific agent/bucket. Returns "" when absent. */
function readFromBucket(id: string, bucket: string): string {
  const p = join(root, "agents", AGENT, "tasks", bucket, `${id}.yaml`);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/** True when text contains id as a standalone task-id (not as a prefix of a longer id like .01). */
function hasExactId(text: string, id: string): boolean {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc + "(?!\\.)").test(text);
}

/** Write a minimal envelope YAML directly into a bucket for test setup. */
function plantEnvelope(id: string, bucket: string, extra = ""): void {
  const dir = join(root, "agents", AGENT, "tasks", bucket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.yaml`),
    `id: ${id}\nheadline: "test"\nstatus: ${bucket}\nfrom: alice\nto: ${AGENT}\nproject: null\n${extra}`
  );
}

/**
 * Minimal sweepBlocked simulation: scans blocked/ and moves to open/ any task
 * whose entire needs: list is satisfied by envelopes in done/.
 * Mirrors sweepBlocked's exact check — sufficient to verify releasability.
 */
function simulateSweepBlocked(): number {
  const blockedDir = join(root, "agents", AGENT, "tasks", "blocked");
  const openDir = join(root, "agents", AGENT, "tasks", "open");
  mkdirSync(openDir, { recursive: true });
  if (!existsSync(blockedDir)) return 0;
  let released = 0;
  for (const fname of readdirSync(blockedDir).filter((f) => f.endsWith(".yaml"))) {
    const y = readFileSync(join(blockedDir, fname), "utf8");
    // Parse needs: list (block form only for test simplicity)
    const needsM = /^needs:\s*\n((?:[ \t]+-[ \t]+\S+\n?)*)/m.exec(y);
    const needs = needsM
      ? (needsM[1] ?? "").split("\n").map((l) => {
          const m = /^[ \t]+-[ \t]+(\S+)$/.exec(l);
          return m ? m[1] : "";
        }).filter(Boolean)
      : [];
    if (needs.length === 0) continue;
    const allDone = needs.every((depId) =>
      existsSync(join(root, "agents", AGENT, "tasks", "done", `${depId}.yaml`))
    );
    if (!allDone) continue;
    renameSync(join(blockedDir, fname), join(openDir, fname));
    released++;
  }
  return released;
}

// ── D7: failure-recovery — incident reproduction ──────────────────────────────

console.log("\nD7 — failure recovery (WAL-153 incident): failed task delegated, blocked dependant released:");

// Reproduce the incident: original failed, replacement done, dependant blocked
// with needs: [original]. After delegation, dependant's needs: → delegate,
// and simulated sweepBlocked moves it to open/.

const d7Original = `TSK-2026-10-24-0005`;
const d7Delegate = `TSK-2026-10-24-0005.01`;
const d7Dep      = `TSK-2026-10-24-0006`;

// Plant the original in failed/, the delegate in done/, the dependant in blocked/
plantEnvelope(d7Original, "failed", "");
plantEnvelope(d7Delegate, "done", "");
plantEnvelope(d7Dep, "blocked", `blocked_by: ${d7Original}\nneeds:\n  - ${d7Original}\n`);

const d7Out = runDelegate([
  "--original", d7Original,
  "--to",       d7Delegate,
]);

assert(d7Out.includes(`delegated ${d7Original} → ${d7Delegate}`), "D7: output confirms delegation");

const d7DepYaml = readFromBucket(d7Dep, "blocked");
const d7DepNeeds = /^needs:\s*\n((?:[ \t]+-[ \t]+\S+\n?)*)/m.exec(d7DepYaml)?.[1] ?? "";
assert(
  hasExactId(d7DepNeeds, d7Delegate) && !hasExactId(d7DepNeeds, d7Original),
  `D7: dependant's needs: rewritten to delegate (got: ${d7DepNeeds.trim()})`
);

// Verify delegated_to: on the original
const d7OrigYaml = readFromBucket(d7Original, "failed");
assertEqual(
  extractFmField(d7OrigYaml, "delegated_to"),
  d7Delegate,
  "D7: original gains delegated_to: field"
);
assert(
  extractFmField(d7OrigYaml, "status") === "failed",
  "D7: original status unchanged (still failed)"
);

// sweepBlocked check: delegate is in done/, so all needs: are satisfied → release
const d7Released = simulateSweepBlocked();
assertEqual(d7Released, 1, "D7: simulateSweepBlocked releases 1 dependant");
assert(
  existsSync(join(root, "agents", AGENT, "tasks", "open", `${d7Dep}.yaml`)),
  "D7: dependant moved to open/ (releasable by sweepBlocked)"
);

// ── D8: --add mode keeps original edge ───────────────────────────────────────

console.log("\nD8 — --add mode adds delegate alongside original (both edges present):");

const d8Original = `TSK-2026-10-24-0007`;
const d8Delegate = `TSK-2026-10-24-0007.01`;
const d8Dep      = `TSK-2026-10-24-0008`;

plantEnvelope(d8Original, "failed", "");
plantEnvelope(d8Delegate, "open", "");
plantEnvelope(d8Dep, "blocked", `needs:\n  - ${d8Original}\n`);

runDelegate(["--original", d8Original, "--to", d8Delegate, "--add"]);

const d8DepYaml = readFromBucket(d8Dep, "blocked");
const d8DepNeeds = /^needs:\s*\n((?:[ \t]+-[ \t]+\S+\n?)*)/m.exec(d8DepYaml)?.[1] ?? "";
assert(
  d8DepNeeds.includes(d8Original),
  `D8: original edge kept (--add) (got: ${d8DepNeeds.trim()})`
);
assert(
  d8DepNeeds.includes(d8Delegate),
  `D8: delegate edge added (got: ${d8DepNeeds.trim()})`
);

// ── D9: cycle detection ───────────────────────────────────────────────────────

console.log("\nD9 — cycle detection refuses when delegate depends on a would-be dependant:");

// Setup: A depends on original; delegate depends on A → after rewriting,
// A would depend on delegate and delegate depends on A → cycle.
const d9Original = `TSK-2026-10-24-0009`;
const d9Delegate = `TSK-2026-10-24-0009.01`;
const d9A        = `TSK-2026-10-24-0010`;

plantEnvelope(d9Original, "failed", "");
plantEnvelope(d9Delegate, "open", `needs:\n  - ${d9A}\n`);
plantEnvelope(d9A, "blocked", `needs:\n  - ${d9Original}\n`);

let d9Threw = false;
const origExit9 = process.exit;
(process.exit as unknown as (code?: number) => void) = () => { d9Threw = true; throw new Error("exit"); };
try {
  runDelegate(["--original", d9Original, "--to", d9Delegate]);
} catch { /* expected */ }
(process.exit as unknown as (code?: number) => void) = origExit9;

assert(d9Threw, "D9: cycle causes process.exit");
// Verify the dependant was NOT rewritten (delegate command aborted before rewriting)
const d9AYaml = readFromBucket(d9A, "blocked");
const d9ANeeds = /^needs:\s*\n((?:[ \t]+-[ \t]+\S+\n?)*)/m.exec(d9AYaml)?.[1] ?? "";
assert(
  !d9ANeeds.includes(d9Delegate),
  "D9: dependant NOT rewritten after cycle rejection"
);

// ── D10: permanently-failed delegate refused ──────────────────────────────────

console.log("\nD10 — permanently-failed delegate refused (delegate in failed/):");

const d10Original = `TSK-2026-10-24-0011`;
const d10Delegate = `TSK-2026-10-24-0011.01`;

plantEnvelope(d10Original, "open", "");
plantEnvelope(d10Delegate, "failed", ""); // in failed/ — will never satisfy needs:

let d10Threw = false;
const origExit10 = process.exit;
(process.exit as unknown as (code?: number) => void) = () => { d10Threw = true; throw new Error("exit"); };
try {
  runDelegate(["--original", d10Original, "--to", d10Delegate]);
} catch { /* expected */ }
(process.exit as unknown as (code?: number) => void) = origExit10;

assert(d10Threw, "D10: permanently-failed delegate causes process.exit");

// ── D11: self-reference refused ───────────────────────────────────────────────

console.log("\nD11 — self-reference refused (--original === --to):");

const d11Id = `TSK-2026-10-24-0012`;
plantEnvelope(d11Id, "open", "");

let d11Threw = false;
const origExit11 = process.exit;
(process.exit as unknown as (code?: number) => void) = () => { d11Threw = true; throw new Error("exit"); };
try {
  runDelegate(["--original", d11Id, "--to", d11Id]);
} catch { /* expected */ }
(process.exit as unknown as (code?: number) => void) = origExit11;

assert(d11Threw, "D11: self-reference causes process.exit");

// ── D12: inline needs: form (WAL-153 incident exact format) ──────────────────

console.log("\nD12 — inline needs: [id] form is also rewritten:");

const d12Original = `TSK-2026-10-24-0013`;
const d12Delegate = `TSK-2026-10-24-0013.01`;
const d12Dep      = `TSK-2026-10-24-0014`;

plantEnvelope(d12Original, "failed", "");
plantEnvelope(d12Delegate, "open", "");
// Use inline form — this is the exact format Alice used in the incident
plantEnvelope(d12Dep, "blocked", `needs: [${d12Original}]\n`);

runDelegate(["--original", d12Original, "--to", d12Delegate]);

const d12DepYaml = readFromBucket(d12Dep, "blocked");
// After rewriting, needs: field should no longer reference original as a standalone id
const d12DepNeedsLine = /^needs:.*$/m.exec(d12DepYaml)?.[0] ?? "";
assert(
  !hasExactId(d12DepNeedsLine, d12Original),
  `D12: inline needs: no longer contains original as standalone id (needs line: ${d12DepNeedsLine})`
);
assert(
  d12DepYaml.includes(d12Delegate),
  `D12: inline needs: now contains delegate`
);

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
