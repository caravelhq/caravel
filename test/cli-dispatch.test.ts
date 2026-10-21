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

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
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

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
