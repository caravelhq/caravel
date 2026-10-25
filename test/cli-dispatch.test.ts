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

// ── B1: batch with top-level parent: → decimal child ids ─────────────────────
// WAL-123 Phase C v2 fix: batch tasks now accept a top-level parent: field.
// When given, ids are allocated as <parent-root>.NN decimal children.

console.log("\nB1 — batch with top-level parent: produces decimal child ids:");

// Create a parent task to reference.
const b1ParentId = runNew(writeDraft([
  `headline: "B1 parent"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: code`,
  `priority: P2`,
  `project: null`,
  `brief: parent`,
  `output_format: agents/${AGENT}/tasks/done/<id>.md`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n"));

const b1SpecPath = join(root, "b1-batch.yaml");
writeFileSync(b1SpecPath, [
  `from: alice`,
  `to: ${AGENT}`,
  `parent: ${b1ParentId}`,
  `project: null`,
  ``,
  `tasks:`,
  `  step1:`,
  `    headline: "B1 step 1"`,
  `    kind: code`,
  `    priority: P2`,
  `    brief: do step 1`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
  ``,
  `  step2:`,
  `    headline: "B1 step 2"`,
  `    kind: code`,
  `    priority: P2`,
  `    needs: [step1]`,
  `    brief: do step 2`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

// Capture stdout from doBatch (it logs the ids).
const b1Ids: string[] = [];
const origLog = console.log;
console.log = (...args: unknown[]) => b1Ids.push(args.join(" "));
runTaskCli(["batch", "--yaml", b1SpecPath]);
console.log = origLog;

const b1RootId = b1ParentId.split(".")[0]!;
assert(b1Ids.length === 2, `B1: dispatched 2 tasks (got ${b1Ids.length})`);
assert(
  b1Ids[0]!.startsWith(b1RootId + "."),
  `B1: step1 id is a decimal child of parent root (got: ${b1Ids[0]})`
);
assert(
  b1Ids[1]!.startsWith(b1RootId + "."),
  `B1: step2 id is a decimal child of parent root (got: ${b1Ids[1]})`
);
assert(b1Ids[0] !== b1Ids[1], "B1: step1 and step2 got distinct ids");

// Read the envelopes and confirm parent: field is set correctly.
const b1Step1Yaml = existsSync(join(root, "agents", AGENT, "tasks", "open", `${b1Ids[0]}.yaml`))
  ? readFileSync(join(root, "agents", AGENT, "tasks", "open", `${b1Ids[0]}.yaml`), "utf8") : "";
assertEqual(extractFmField(b1Step1Yaml, "parent"), b1ParentId, "B1: step1 parent: field matches top-level default");

const b1Step2Yaml = existsSync(join(root, "agents", AGENT, "tasks", "open", `${b1Ids[1]}.yaml`))
  ? readFileSync(join(root, "agents", AGENT, "tasks", "open", `${b1Ids[1]}.yaml`), "utf8") : "";
assertEqual(extractFmField(b1Step2Yaml, "parent"), b1ParentId, "B1: step2 parent: field matches top-level default");

// Confirm needs: edge round-trips correctly.
assert(
  b1Step2Yaml.includes(b1Ids[0]!),
  `B1: step2 needs: contains the real id of step1 (${b1Ids[0]})`
);

// ── B2: per-task parent: overrides top-level default ─────────────────────────

console.log("\nB2 — per-task parent: overrides top-level default:");

const b2ParentA = runNew(writeDraft([
  `headline: "B2 parent A"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: code`,
  `priority: P2`,
  `project: null`,
  `brief: parentA`,
  `output_format: agents/${AGENT}/tasks/done/<id>.md`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n"));

const b2ParentB = runNew(writeDraft([
  `headline: "B2 parent B"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: code`,
  `priority: P2`,
  `project: null`,
  `brief: parentB`,
  `output_format: agents/${AGENT}/tasks/done/<id>.md`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n"));

const b2SpecPath = join(root, "b2-batch.yaml");
writeFileSync(b2SpecPath, [
  `from: alice`,
  `to: ${AGENT}`,
  `parent: ${b2ParentA}`,  // top-level default
  `project: null`,
  ``,
  `tasks:`,
  `  uses-default:`,
  `    headline: "B2 uses default parent"`,
  `    kind: code`,
  `    priority: P2`,
  `    brief: uses default parent`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
  ``,
  `  overrides-to-b:`,
  `    headline: "B2 overrides to parent B"`,
  `    kind: code`,
  `    priority: P2`,
  `    parent: ${b2ParentB}`,  // per-task override
  `    brief: overrides to parent B`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

const b2Ids: string[] = [];
const origLog2 = console.log;
console.log = (...args: unknown[]) => b2Ids.push(args.join(" "));
runTaskCli(["batch", "--yaml", b2SpecPath]);
console.log = origLog2;

assert(b2Ids.length === 2, `B2: dispatched 2 tasks (got ${b2Ids.length})`);

const b2RootA = b2ParentA.split(".")[0]!;
const b2RootB = b2ParentB.split(".")[0]!;

// Read envelopes
const b2DefaultYaml = existsSync(join(root, "agents", AGENT, "tasks", "open", `${b2Ids[0]}.yaml`))
  ? readFileSync(join(root, "agents", AGENT, "tasks", "open", `${b2Ids[0]}.yaml`), "utf8") : "";
const b2OverrideYaml = existsSync(join(root, "agents", AGENT, "tasks", "open", `${b2Ids[1]}.yaml`))
  ? readFileSync(join(root, "agents", AGENT, "tasks", "open", `${b2Ids[1]}.yaml`), "utf8") : "";

assertEqual(extractFmField(b2DefaultYaml, "parent"), b2ParentA, "B2: uses-default task has parent A");
assert(b2Ids[0]!.startsWith(b2RootA + "."), `B2: uses-default id is child of parent A root (got: ${b2Ids[0]})`);

assertEqual(extractFmField(b2OverrideYaml, "parent"), b2ParentB, "B2: overrides-to-b task has parent B");
assert(b2Ids[1]!.startsWith(b2RootB + "."), `B2: overrides-to-b id is child of parent B root (got: ${b2Ids[1]})`);

// ── B3: H5 fires on parented batch when sibling already exists ────────────────

console.log("\nB3 — H5: parented batch hard-fails when sibling already exists (--force bypasses):");

const b3ParentId = runNew(writeDraft([
  `headline: "B3 parent"`,
  `from: alice`,
  `to: ${AGENT}`,
  `kind: code`,
  `priority: P2`,
  `project: null`,
  `brief: b3 parent`,
  `output_format: agents/${AGENT}/tasks/done/<id>.md`,
  `status: open`,
  `budget:`,
  `  max_turns: 10`,
  `  max_subagents: 0`,
  `history: []`,
].join("\n") + "\n"));

// Plant a sibling so H5 fires.
const b3RootId = b3ParentId.split(".")[0]!;
writeFileSync(
  join(root, "agents", AGENT, "tasks", "done", `${b3RootId}.01.md`),
  `# Prior child\n`
);
writeFileSync(
  join(root, "agents", AGENT, "tasks", "done", `${b3RootId}.01.yaml`),
  `id: ${b3RootId}.01\nheadline: "Prior child"\nstatus: done\nfrom: alice\nto: ${AGENT}\n`
);

const b3SpecPath = join(root, "b3-batch.yaml");
writeFileSync(b3SpecPath, [
  `from: alice`,
  `to: ${AGENT}`,
  `parent: ${b3ParentId}`,
  `project: null`,
  ``,
  `tasks:`,
  `  retry:`,
  `    headline: "B3 retry task"`,
  `    kind: code`,
  `    priority: P2`,
  `    brief: retry`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

// Without --force: must fail (H5).
let b3HardFailed = false;
const origDie = process.exit;
let b3ExitCode = 0;
process.exit = ((code?: number) => { b3ExitCode = code ?? 0; b3HardFailed = true; throw new Error(`exit:${code}`); }) as any;
try {
  runTaskCli(["batch", "--yaml", b3SpecPath]);
} catch (e: unknown) {
  if (!(e instanceof Error && e.message.startsWith("exit:"))) throw e;
}
process.exit = origDie;
assert(b3HardFailed, "B3: batch without --force hard-fails when H5 fires");

// With --force: must succeed.
const b3ForceIds: string[] = [];
const origLog3 = console.log;
console.log = (...args: unknown[]) => b3ForceIds.push(args.join(" "));
runTaskCli(["batch", "--yaml", b3SpecPath, "--force"]);
console.log = origLog3;
assert(b3ForceIds.length === 1, `B3: batch with --force dispatches 1 task (got ${b3ForceIds.length})`);
assert(b3ForceIds[0]!.startsWith(b3RootId + "."), `B3: --force task has decimal child id (got: ${b3ForceIds[0]})`);

// ── B4: intra-batch W1 warns on overlapping touches with no edge ──────────────

console.log("\nB4 — intra-batch W1: overlapping touches without needs: edge emit warning; adding edge silences it:");

const b4SpecPathConflict = join(root, "b4-conflict.yaml");
writeFileSync(b4SpecPathConflict, [
  `from: alice`,
  `to: ${AGENT}`,
  `project: null`,
  ``,
  `tasks:`,
  `  edit-a:`,
  `    headline: "B4 edit file A"`,
  `    kind: code`,
  `    priority: P2`,
  `    touches:`,
  `      - repos/caravel/src/cli/task.ts`,
  `      - repos/caravel/test/cli-dispatch.test.ts`,
  `    brief: edit a`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
  ``,
  `  edit-b:`,
  `    headline: "B4 also edits task.ts"`,
  `    kind: code`,
  `    priority: P2`,
  `    touches:`,
  `      - repos/caravel/src/cli/task.ts`,
  `    brief: edit b`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

const b4Warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => b4Warnings.push(args.join(" "));
const b4ConflictIds: string[] = [];
const origLog4 = console.log;
console.log = (...args: unknown[]) => b4ConflictIds.push(args.join(" "));
runTaskCli(["batch", "--yaml", b4SpecPathConflict]);
console.warn = origWarn;
console.log = origLog4;

assert(
  b4Warnings.some((w) => w.includes("intra-batch W1") && w.includes("task.ts")),
  `B4: W1 warning fires for overlapping touches with no edge (warnings: ${b4Warnings.join(" | ")})`
);

// Now add a needs: edge — warning must be silenced.
const b4SpecPathEdge = join(root, "b4-edge.yaml");
writeFileSync(b4SpecPathEdge, [
  `from: alice`,
  `to: ${AGENT}`,
  `project: null`,
  ``,
  `tasks:`,
  `  edit-a:`,
  `    headline: "B4e edit file A"`,
  `    kind: code`,
  `    priority: P2`,
  `    touches:`,
  `      - repos/caravel/src/cli/task.ts`,
  `    brief: edit a`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
  ``,
  `  edit-b:`,
  `    headline: "B4e also edits task.ts"`,
  `    kind: code`,
  `    priority: P2`,
  `    needs: [edit-a]`,
  `    touches:`,
  `      - repos/caravel/src/cli/task.ts`,
  `    brief: edit b`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

const b4EdgeWarnings: string[] = [];
const origWarn2 = console.warn;
console.warn = (...args: unknown[]) => b4EdgeWarnings.push(args.join(" "));
const b4EdgeIds: string[] = [];
const origLog5 = console.log;
console.log = (...args: unknown[]) => b4EdgeIds.push(args.join(" "));
runTaskCli(["batch", "--yaml", b4SpecPathEdge]);
console.warn = origWarn2;
console.log = origLog5;

assert(
  !b4EdgeWarnings.some((w) => w.includes("intra-batch W1")),
  `B4: no W1 warning when needs: edge is present (warnings: ${b4EdgeWarnings.join(" | ")})`
);

// ── B5: batch with no parent still produces flat TSK ids (regression) ─────────

console.log("\nB5 — regression: batch with no parent still produces flat TSK-<date>-NNNN ids:");

const b5SpecPath = join(root, "b5-batch.yaml");
writeFileSync(b5SpecPath, [
  `from: alice`,
  `to: ${AGENT}`,
  `project: null`,
  ``,
  `tasks:`,
  `  taskA:`,
  `    headline: "B5 task A"`,
  `    kind: code`,
  `    priority: P2`,
  `    brief: task A`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
  ``,
  `  taskB:`,
  `    headline: "B5 task B"`,
  `    kind: code`,
  `    priority: P2`,
  `    needs: [taskA]`,
  `    brief: task B`,
  `    output_format: agents/${AGENT}/tasks/done/<id>.md`,
].join("\n") + "\n");

const b5Ids: string[] = [];
const origLog6 = console.log;
console.log = (...args: unknown[]) => b5Ids.push(args.join(" "));
runTaskCli(["batch", "--yaml", b5SpecPath]);
console.log = origLog6;

const todayPrefix = (() => {
  const d = new Date();
  return `TSK-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-`;
})();

assert(b5Ids.length === 2, `B5: dispatched 2 tasks (got ${b5Ids.length})`);
assert(b5Ids[0]!.startsWith(todayPrefix), `B5: task A id is a flat TSK-date id (got: ${b5Ids[0]})`);
assert(b5Ids[1]!.startsWith(todayPrefix), `B5: task B id is a flat TSK-date id (got: ${b5Ids[1]})`);
assert(!b5Ids[0]!.includes("."), `B5: task A id has no decimal component (got: ${b5Ids[0]})`);
assert(!b5Ids[1]!.includes("."), `B5: task B id has no decimal component (got: ${b5Ids[1]})`);

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
