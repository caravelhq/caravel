/**
 * Phase 1 — task-graph engine tests (WAL-72).
 *
 * Proves:
 *   1. readList parses inline and block YAML list forms.
 *   2. loadGraph builds nodes + reverse-index from a fixture dir.
 *   3. ready() — the four cases required by the task brief:
 *      a. paused task with all deps satisfied → NOT ready (DEC-0004).
 *      b. no-edge envelope → ready.
 *      c. needs on a failed dep → NOT ready.
 *      d. after on a failed dep → ready.
 *   4. back-compat: legacy envelope (no needs/after) → ready.
 *   5. partial-needs: one done, one open → NOT ready.
 *   6. after with open dep → NOT ready.
 *   7. missing dep id → NOT ready.
 *   8. task in wrong bucket (waiting) → NOT ready.
 *   9. reverse-index (dependants) is populated correctly.
 *
 * Run with: bun run test/graph-ready.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadGraph, ready, readList, claimDecision } from "../src/multiAgent.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? `\n    ${extra}` : ""}`);
    failed++;
  }
}

// Build a minimal valid envelope YAML string.
function makeEnvelope(opts: {
  id: string;
  status?: string;      // default "open"
  bucket?: string;      // used to choose the directory, not written into YAML unless provided as status
  needs?: string[];
  after?: string[];
  type?: string;
}): string {
  const status = opts.status ?? "open";
  const lines = [
    `id: ${opts.id}`,
    `headline: "Test task ${opts.id}"`,
    `created: 2026-08-27T00:00:00.000Z`,
    `updated: 2026-08-27T00:00:00.000Z`,
    `from: alice`,
    `to: bob`,
    `kind: code`,
    `deadline: null`,
    `status: ${status}`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history: []`,
  ];
  if (opts.type) lines.push(`type: ${opts.type}`);
  if (opts.needs && opts.needs.length > 0) {
    lines.push(`needs: [${opts.needs.join(", ")}]`);
  } else {
    lines.push(`needs: []`);
  }
  if (opts.after && opts.after.length > 0) {
    lines.push(`after: [${opts.after.join(", ")}]`);
  } else {
    lines.push(`after: []`);
  }
  return lines.join("\n") + "\n";
}

// Write a task envelope to a fixture directory.
async function writeTask(
  agentsDir: string,
  agent: string,
  bucket: string,
  id: string,
  yaml: string
): Promise<void> {
  const dir = join(agentsDir, agent, "tasks", bucket);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.yaml`), yaml);
}

// ── test setup ───────────────────────────────────────────────────────────────

const fixtureRoot = await mkdtemp(join(tmpdir(), "caravel-graph-"));

// ── section 1: readList ───────────────────────────────────────────────────────

console.log("\nSection 1 — readList:");

{
  // Inline empty list
  assert(readList("needs: []\n", "needs").length === 0, "inline [] → empty");

  // Inline single-item
  const one = readList("needs: [TSK-2026-08-27-0001.05]\n", "needs");
  assert(one.length === 1 && one[0] === "TSK-2026-08-27-0001.05", "inline single → one item");

  // Inline multi-item
  const multi = readList("needs: [A, B, C]\n", "needs");
  assert(multi.length === 3 && multi[1] === "B", "inline multi → three items");

  // Block form
  const block = readList("needs:\n  - X\n  - Y\n", "needs");
  assert(block.length === 2 && block[0] === "X" && block[1] === "Y", "block form → two items");

  // Absent key → empty
  assert(readList("status: open\n", "needs").length === 0, "absent key → empty");

  // Spaces around items
  const spaced = readList("needs: [ TSK-A , TSK-B ]\n", "needs");
  assert(spaced.length === 2 && spaced[0] === "TSK-A", "inline with spaces → trimmed");
}

// ── section 2: basic graph loading ───────────────────────────────────────────

console.log("\nSection 2 — loadGraph basics:");

{
  const dir = join(fixtureRoot, "basic");
  const AGENTS = ["alice"];

  // Task A: done
  await writeTask(dir, "alice", "done", "A", makeEnvelope({ id: "A", status: "done" }));
  // Task B: open, no edges
  await writeTask(dir, "alice", "open", "B", makeEnvelope({ id: "B" }));
  // Task C: open, needs [A]
  await writeTask(dir, "alice", "open", "C", makeEnvelope({ id: "C", needs: ["A"] }));

  const graph = await loadGraph(dir, AGENTS);

  assert(graph.nodes.has("A"), "graph has node A");
  assert(graph.nodes.has("B"), "graph has node B");
  assert(graph.nodes.has("C"), "graph has node C");

  const a = graph.nodes.get("A")!;
  assert(a.isDone, "A.isDone");
  assert(a.isTerminal, "A.isTerminal");
  assert(!a.isFailed, "A not failed");
  assert(a.bucket === "done", "A.bucket = done");

  const c = graph.nodes.get("C")!;
  assert(c.needs.length === 1 && c.needs[0] === "A", "C.needs = [A]");
  assert(c.bucket === "open", "C.bucket = open");

  // Reverse index
  const deps = graph.dependants.get("A") ?? [];
  assert(deps.includes("C"), "reverse index: A → C");
}

// ── section 3: ready() — the four cases from the brief ────────────────────────

console.log("\nSection 3 — ready() four required cases:");

{
  const dir = join(fixtureRoot, "ready-cases");
  const AGENTS = ["bob"];

  // Dep task D1: done
  await writeTask(dir, "bob", "done", "D1", makeEnvelope({ id: "D1", status: "done" }));
  // Dep task D2: failed
  await writeTask(dir, "bob", "failed", "D2", makeEnvelope({ id: "D2", status: "failed:other" }));
  // Dep task D3: open (in progress)
  await writeTask(dir, "bob", "open", "D3", makeEnvelope({ id: "D3" }));

  // Case 3a: paused task with all deps satisfied → NOT ready (DEC-0004)
  await writeTask(
    dir, "bob", "paused", "T-paused",
    makeEnvelope({ id: "T-paused", status: "paused", needs: ["D1"] })
  );

  // Case 3b: open, no edges → ready
  await writeTask(dir, "bob", "open", "T-no-edges", makeEnvelope({ id: "T-no-edges" }));

  // Case 3c: needs on a failed dep → NOT ready (needs requires done, not just terminal)
  await writeTask(
    dir, "bob", "open", "T-needs-failed",
    makeEnvelope({ id: "T-needs-failed", needs: ["D2"] })
  );

  // Case 3d: after on a failed dep → ready (after only requires terminal)
  await writeTask(
    dir, "bob", "open", "T-after-failed",
    makeEnvelope({ id: "T-after-failed", after: ["D2"] })
  );

  const graph = await loadGraph(dir, AGENTS);

  // 3a: paused task — DEC-0004: never ready even when all deps done
  assert(
    !ready("T-paused", graph),
    "3a: paused task with all deps done → NOT ready (DEC-0004)"
  );

  // 3b: no edges → immediately ready
  assert(
    ready("T-no-edges", graph),
    "3b: no-edge envelope → ready"
  );

  // 3c: needs on failed → not ready (needs requires done, not just terminal)
  assert(
    !ready("T-needs-failed", graph),
    "3c: needs on failed dep → NOT ready"
  );

  // 3d: after on failed → ready (after accepts done|failed)
  assert(
    ready("T-after-failed", graph),
    "3d: after on failed dep → ready"
  );
}

// ── section 4: additional ready() cases ──────────────────────────────────────

console.log("\nSection 4 — ready() additional cases:");

{
  const dir = join(fixtureRoot, "extra");
  const AGENTS = ["cliff"];

  await writeTask(dir, "cliff", "done",   "E-done",   makeEnvelope({ id: "E-done",   status: "done" }));
  await writeTask(dir, "cliff", "open",   "E-open",   makeEnvelope({ id: "E-open" }));
  await writeTask(dir, "cliff", "failed", "E-failed", makeEnvelope({ id: "E-failed", status: "failed:crash" }));

  // Task with both needs done and after failed (fully satisfied)
  await writeTask(
    dir, "cliff", "open", "T-full",
    makeEnvelope({ id: "T-full", needs: ["E-done"], after: ["E-failed"] })
  );

  // Task with needs including one still open → NOT ready
  await writeTask(
    dir, "cliff", "open", "T-partial",
    makeEnvelope({ id: "T-partial", needs: ["E-done", "E-open"] })
  );

  // Task with after on an open dep → NOT ready (open is not terminal)
  await writeTask(
    dir, "cliff", "open", "T-after-open",
    makeEnvelope({ id: "T-after-open", after: ["E-open"] })
  );

  // Task referencing a completely unknown id → NOT ready
  await writeTask(
    dir, "cliff", "open", "T-unknown-dep",
    makeEnvelope({ id: "T-unknown-dep", needs: ["NO-SUCH-TASK-ID"] })
  );

  // Task in waiting/ bucket (not open/) → NOT ready
  await writeTask(
    dir, "cliff", "waiting", "T-waiting",
    makeEnvelope({ id: "T-waiting", status: "waiting:on:user" })
  );

  // Legacy envelope (no needs/after fields in YAML) — back-compat
  const legacyYaml = [
    "id: T-legacy",
    "status: open",
    "from: alice",
    "to: cliff",
    "kind: other",
    "headline: legacy task",
    "created: 2026-01-01T00:00:00.000Z",
    "updated: 2026-01-01T00:00:00.000Z",
  ].join("\n") + "\n";
  await writeTask(dir, "cliff", "open", "T-legacy", legacyYaml);

  const graph = await loadGraph(dir, AGENTS);

  assert(ready("T-full", graph), "both needs done and after terminal → ready");
  assert(!ready("T-partial", graph), "partial needs (one open) → NOT ready");
  assert(!ready("T-after-open", graph), "after on open dep → NOT ready");
  assert(!ready("T-unknown-dep", graph), "unknown dep id → NOT ready");
  assert(!ready("T-waiting", graph), "task in waiting/ bucket → NOT ready");
  assert(ready("T-legacy", graph), "legacy envelope (no edges) → ready (back-compat)");
}

// ── section 5: type field is carried but not branched on ──────────────────────

console.log("\nSection 5 — type field is carried, not used by scheduler:");

{
  const dir = join(fixtureRoot, "type-field");
  const AGENTS = ["alice"];

  const yaml = makeEnvelope({ id: "T-typed", type: "code" });
  await writeTask(dir, "alice", "open", "T-typed", yaml);

  const graph = await loadGraph(dir, AGENTS);
  // type is carried (parseFields sets it) but ready() ignores it
  assert(ready("T-typed", graph), "type: code task → still ready (type is reserved in v1)");
  const node = graph.nodes.get("T-typed");
  // type is not on GraphNode (it's on TaskFields, not the graph).
  // Verify it doesn't affect readiness.
  assert(node !== undefined, "typed task node exists in graph");
}

// ── section 6: reverse-index correctness ─────────────────────────────────────

console.log("\nSection 6 — reverse-index (dependants):");

{
  const dir = join(fixtureRoot, "reverse");
  const AGENTS = ["alice"];

  await writeTask(dir, "alice", "done", "R-A", makeEnvelope({ id: "R-A", status: "done" }));
  await writeTask(dir, "alice", "open", "R-B", makeEnvelope({ id: "R-B", needs: ["R-A"] }));
  await writeTask(dir, "alice", "open", "R-C", makeEnvelope({ id: "R-C", after: ["R-A"] }));
  await writeTask(dir, "alice", "open", "R-D", makeEnvelope({ id: "R-D", needs: ["R-A"], after: ["R-A"] }));

  const graph = await loadGraph(dir, AGENTS);
  const deps = graph.dependants.get("R-A") ?? [];

  assert(deps.includes("R-B"), "R-A has B as dependant (via needs)");
  assert(deps.includes("R-C"), "R-A has C as dependant (via after)");
  assert(deps.includes("R-D"), "R-A has D as dependant (via both)");
  // D declares the same dep in both needs and after; dedup means it appears
  // exactly once in the reverse index (F4 fix — duplicates would double-count
  // it in Phase 2's sibling-join generator).
  assert(deps.filter((d) => d === "R-D").length === 1, "R-D appears exactly once (deduped)");
}

// ── section 8: F4 — reverse-index dedup ──────────────────────────────────────

console.log("\nSection 8 — F4: reverse-index dedup:");

{
  const dir = join(fixtureRoot, "dedup");
  const AGENTS = ["alice"];

  await writeTask(dir, "alice", "done", "DEP-A", makeEnvelope({ id: "DEP-A", status: "done" }));
  // Task declares DEP-A in both needs and after — the deduped reverse index
  // must show it exactly once, not twice.
  await writeTask(dir, "alice", "open", "CHILD", makeEnvelope({ id: "CHILD", needs: ["DEP-A"], after: ["DEP-A"] }));

  const graph = await loadGraph(dir, AGENTS);
  const deps = graph.dependants.get("DEP-A") ?? [];

  assert(deps.includes("CHILD"), "dedup: CHILD is in dependants[DEP-A]");
  assert(deps.filter((d) => d === "CHILD").length === 1, "dedup: CHILD appears exactly once (not twice)");
  // Sanity: CHILD is ready (DEP-A is done, satisfies both needs and after).
  assert(ready("CHILD", graph), "dedup: CHILD is ready when DEP-A is done");
}

// ── section 9: F6 — readList strips quotes ────────────────────────────────────

console.log("\nSection 9 — F6: readList strips surrounding quotes:");

{
  // Inline form with double-quoted items (WAL-80 collision path).
  const inlineDoubleQuoted = readList('needs: ["TSK-X", "TSK-Y"]\n', "needs");
  assert(
    inlineDoubleQuoted.length === 2 && inlineDoubleQuoted[0] === "TSK-X" && inlineDoubleQuoted[1] === "TSK-Y",
    "inline: double-quoted items → stripped"
  );

  // Inline form with single-quoted items.
  const inlineSingleQuoted = readList("needs: ['TSK-A', 'TSK-B']\n", "needs");
  assert(
    inlineSingleQuoted.length === 2 && inlineSingleQuoted[0] === "TSK-A",
    "inline: single-quoted items → stripped"
  );

  // Block form with double-quoted items.
  const blockDoubleQuoted = readList('needs:\n  - "TSK-P"\n  - "TSK-Q"\n', "needs");
  assert(
    blockDoubleQuoted.length === 2 && blockDoubleQuoted[0] === "TSK-P" && blockDoubleQuoted[1] === "TSK-Q",
    "block: double-quoted items → stripped"
  );

  // Block form with single-quoted items.
  const blockSingleQuoted = readList("needs:\n  - 'TSK-R'\n", "needs");
  assert(blockSingleQuoted.length === 1 && blockSingleQuoted[0] === "TSK-R", "block: single-quoted item → stripped");

  // Unquoted items must be unaffected.
  const unquoted = readList("needs: [TSK-1, TSK-2]\n", "needs");
  assert(unquoted.length === 2 && unquoted[0] === "TSK-1", "unquoted items → unchanged");

  // Quote stripping propagates to graph lookup: quoted dep id resolves correctly.
  const dir = join(fixtureRoot, "quoted-deps");
  const AGENTS = ["alice"];
  const makeRaw = (id: string, status: string, needsLine: string) =>
    [
      `id: ${id}`,
      `status: ${status}`,
      "from: alice",
      "to: bob",
      "kind: code",
      `headline: "${id}"`,
      "created: 2026-08-27T00:00:00.000Z",
      "updated: 2026-08-27T00:00:00.000Z",
      needsLine,
      "after: []",
    ].join("\n") + "\n";

  // Task done, dependency declared with quoted id — must resolve.
  await writeTask(dir, "alice", "done", "QD", makeRaw("QD", "done", "needs: []"));
  await writeTask(
    dir, "alice", "open", "QC",
    makeRaw("QC", "open", 'needs: ["QD"]')  // hand-written with quotes
  );

  const graph = await loadGraph(dir, AGENTS);
  assert(ready("QC", graph), "F6: quoted dep id resolves correctly → QC ready");
}

// ── section 7: block-form needs/after in YAML ────────────────────────────────

console.log("\nSection 7 — block-form needs/after:");

{
  const dir = join(fixtureRoot, "block-form");
  const AGENTS = ["alice"];

  const yaml = [
    "id: BLK-A",
    "status: done",
    "from: alice",
    "to: bob",
    "kind: code",
    "headline: done task",
    "created: 2026-08-01T00:00:00.000Z",
    "updated: 2026-08-01T00:00:00.000Z",
    "needs: []",
    "after: []",
  ].join("\n") + "\n";
  await writeTask(dir, "alice", "done", "BLK-A", yaml);

  const blockNeeds = [
    "id: BLK-B",
    "status: open",
    "from: alice",
    "to: bob",
    "kind: code",
    "headline: block needs",
    "created: 2026-08-01T00:00:00.000Z",
    "updated: 2026-08-01T00:00:00.000Z",
    "needs:",
    "  - BLK-A",
    "after: []",
  ].join("\n") + "\n";
  await writeTask(dir, "alice", "open", "BLK-B", blockNeeds);

  const graph = await loadGraph(dir, AGENTS);
  const node = graph.nodes.get("BLK-B");
  assert(node?.needs[0] === "BLK-A", "block-form needs parses correctly");
  assert(ready("BLK-B", graph), "block-form needs satisfied → ready");
}

// ── section 10: claimDecision — four outcomes ──────────────────────────────────

console.log("\nSection 10 — claimDecision: four outcomes:");

{
  // Fixture: DEP-X (done), CHILD-X (open, needs DEP-X), BLOCKED-X (open, needs
  // MISSING-X which doesn't exist), ROOT-X (open, no deps).
  const dir = join(fixtureRoot, "claim-decision");
  const AGENTS = ["alice"];

  await writeTask(dir, "alice", "done", "DEP-X",
    makeEnvelope({ id: "DEP-X", status: "done", needs: [] }));
  await writeTask(dir, "alice", "open", "CHILD-X",
    makeEnvelope({ id: "CHILD-X", status: "open", needs: ["DEP-X"] }));
  await writeTask(dir, "alice", "open", "BLOCKED-X",
    makeEnvelope({ id: "BLOCKED-X", status: "open", needs: ["MISSING-X"] }));
  await writeTask(dir, "alice", "open", "ROOT-X",
    makeEnvelope({ id: "ROOT-X", status: "open" }));

  const graph = await loadGraph(dir, AGENTS);

  // Outcome 1: skip-claimed — status: claimed, any graph state.
  const claimedYaml = makeEnvelope({ id: "ROOT-X", status: "claimed" });
  assert(
    claimDecision(claimedYaml, "ROOT-X", graph) === "skip-claimed",
    "claimDecision: status: claimed → skip-claimed"
  );

  // Outcome 2a: skip-terminalish — done.
  const doneYaml = makeEnvelope({ id: "DEP-X", status: "done" });
  assert(
    claimDecision(doneYaml, "DEP-X", graph) === "skip-terminalish",
    "claimDecision: status: done → skip-terminalish"
  );

  // Outcome 2b: skip-terminalish — failed:*.
  const failedYaml = makeEnvelope({ id: "DEP-X", status: "failed:other" });
  assert(
    claimDecision(failedYaml, "DEP-X", graph) === "skip-terminalish",
    "claimDecision: status: failed:other → skip-terminalish"
  );

  // Outcome 2c: skip-terminalish — waiting:on:*.
  const waitingYaml = makeEnvelope({ id: "DEP-X", status: "waiting:on:task:FOO" });
  assert(
    claimDecision(waitingYaml, "DEP-X", graph) === "skip-terminalish",
    "claimDecision: status: waiting:on:task:FOO → skip-terminalish"
  );

  // Outcome 3: skip-not-ready — open but needs not satisfied (dep missing from graph).
  const blockedYaml = makeEnvelope({ id: "BLOCKED-X", status: "open", needs: ["MISSING-X"] });
  assert(
    claimDecision(blockedYaml, "BLOCKED-X", graph) === "skip-not-ready",
    "claimDecision: open with unsatisfied needs → skip-not-ready"
  );

  // Outcome 4a: claim — open with all needs satisfied.
  const childYaml = makeEnvelope({ id: "CHILD-X", status: "open", needs: ["DEP-X"] });
  assert(
    claimDecision(childYaml, "CHILD-X", graph) === "claim",
    "claimDecision: open with all needs done → claim"
  );

  // Outcome 4b: claim — open with no needs.
  const rootYaml = makeEnvelope({ id: "ROOT-X", status: "open" });
  assert(
    claimDecision(rootYaml, "ROOT-X", graph) === "claim",
    "claimDecision: open with no needs → claim"
  );
}

// ── summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
