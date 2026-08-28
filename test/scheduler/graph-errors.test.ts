/**
 * Graph-error tests (WAL-72 Phase 2 review, TSK-2026-08-27-0005.12).
 *
 * Bob's suites assert graph.errors only indirectly (the reference oracle
 * agreeing in ready.test.ts). These assert the REAL implementation's error
 * records directly — right id, right problem — per FDP v1.8 §Graph errors:
 *
 *   - An unparseable envelope is recorded and EXCLUDED from the graph (F1).
 *   - An unresolvable edge is recorded against the declaring task (F2).
 *   - Both surface via first-encounter console.warn (not per-tick)
 *     **plus a journal entry**.  <-- the journal half is asserted here too;
 *     if that fails it is a finding for Bob/Cliff, not a reason to weaken
 *     the test.
 *
 * Also probes (documented, not contractual): the module-level warn set never
 * resets — what happens when a corrupt envelope is fixed and then re-broken
 * identically?
 *
 * Run with: bun run test/scheduler/graph-errors.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

import { buildFixture } from "./fixture.ts";

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

/** Documenting probe — prints an observed (non-contractual) value. */
function probe(label: string, value: string | number) {
  console.log(`  ℹ ${label}: ${value}`);
}

// ── setup: pin AGENTS_DIR via cwd BEFORE importing multiAgent ────────────────

const root = await mkdtemp(join(tmpdir(), "caravel-graph-errors-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;
if (typeof t.loadGraph !== "function") {
  console.error("SKIP: __testing.loadGraph not available");
  process.exit(0);
}
type Graph = {
  nodes: Map<string, { id: string }>;
  errors: { id: string; problem: string }[];
};
const loadGraph = t.loadGraph as (agentsDir: string, agents: string[]) => Promise<Graph>;

/** A corrupt envelope whose `status:` line still matches — the WAL-79 shape. */
function corruptYaml(id: string): string {
  return [
    `id: ${id}`,
    `headline: "unclosed quote`,
    `created: 2026-01-01T00:00:01.000Z`,
    `status: open`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history: []`,
    ``,
  ].join("\n");
}

/** Wrap console.warn, capturing only [graph] lines, for the duration of fn. */
async function withGraphWarns<T>(fn: () => Promise<T>): Promise<{ result: T; warns: string[] }> {
  const orig = console.warn;
  const warns: string[] = [];
  console.warn = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.includes("[graph]")) warns.push(line);
  };
  try {
    const result = await fn();
    return { result, warns };
  } finally {
    console.warn = orig;
  }
}

async function readJournal(agent: string): Promise<string[]> {
  try {
    const text = await readFile(join(agentsDir, agent, "tasks", "journal.ndjson"), "utf-8");
    return text.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

try {
  const agents = ["alice", "bob"];
  // Unique ids per section: the module-level warnedGraphErrors set persists
  // for the process, so reuse of an id would silently suppress later probes.
  let seq = 0;
  const freshId = () => `TSK-BAD-${String(++seq).padStart(2, "0")}`;

  // ── Test 1: F1 unparseable — recorded with the right id, excluded ──────────

  console.log("\nTest 1: unparseable envelope → error record + excluded from graph");

  const bad1 = freshId();
  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-GOOD1", from: "bob" }],
      bob: [],
    },
    rawFiles: [{ agent: "alice", bucket: "open", name: `${bad1}.yaml`, content: corruptYaml(bad1) }],
  });
  const g1 = await loadGraph(agentsDir, agents);

  assert(g1.errors.length === 1, "1a: exactly one error recorded", JSON.stringify(g1.errors));
  assert(
    g1.errors[0]?.id === bad1 && g1.errors[0]!.problem.startsWith("unparseable YAML"),
    "1b: error names the envelope id and the unparseable-YAML problem",
    JSON.stringify(g1.errors[0])
  );
  assert(!g1.nodes.has(bad1), "1c: unparseable envelope is EXCLUDED from the graph (not a ready node)");
  assert(g1.nodes.has("TSK-GOOD1"), "1d: the healthy sibling task is still in the graph");

  // ── Test 2: F2 dangling edge — recorded against the declaring task ─────────

  console.log("\nTest 2: dangling edge → error record against the declaring task");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-DECL", from: "bob", needs: ["TSK-GHOST"] }],
      bob: [],
    },
  });
  const g2 = await loadGraph(agentsDir, agents);

  assert(g2.errors.length === 1, "2a: exactly one error recorded", JSON.stringify(g2.errors));
  assert(
    g2.errors[0]?.id === "TSK-DECL" &&
      g2.errors[0]!.problem === "edge references unknown task TSK-GHOST",
    "2b: error names the declaring task and the unknown dep",
    JSON.stringify(g2.errors[0])
  );
  assert(g2.nodes.has("TSK-DECL"), "2c: the declaring task itself stays in the graph");

  // ── Test 3: errors are fresh per call (the warn set gates warns only) ──────

  console.log("\nTest 3: two loads of the same corrupt tree both carry the error");

  const bad3 = freshId();
  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-GOOD3", from: "bob" }],
      bob: [],
    },
    rawFiles: [{ agent: "alice", bucket: "open", name: `${bad3}.yaml`, content: corruptYaml(bad3) }],
  });
  const first = await loadGraph(agentsDir, agents);
  const second = await loadGraph(agentsDir, agents);
  assert(
    first.errors.some((e) => e.id === bad3) && second.errors.some((e) => e.id === bad3),
    "3a: errors array is per-call state — both loads report the corrupt envelope",
    `first=${JSON.stringify(first.errors)} second=${JSON.stringify(second.errors)}`
  );

  // ── Test 4: warn idempotency — first encounter only, not per-tick ──────────

  console.log("\nTest 4: repeated loads warn once (first-encounter, not per-tick)");

  const bad4 = freshId();
  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-GOOD4", from: "bob" }],
      bob: [],
    },
    rawFiles: [{ agent: "alice", bucket: "open", name: `${bad4}.yaml`, content: corruptYaml(bad4) }],
  });
  const { warns: warnsA } = await withGraphWarns(() => loadGraph(agentsDir, agents));
  const { warns: warnsB } = await withGraphWarns(() => loadGraph(agentsDir, agents));
  assert(
    warnsA.filter((w) => w.includes(bad4)).length === 1,
    "4a: first load warns exactly once",
    `warns=${JSON.stringify(warnsA)}`
  );
  assert(
    warnsB.filter((w) => w.includes(bad4)).length === 0,
    "4b: second load does not warn again",
    `warns=${JSON.stringify(warnsB)}`
  );

  // ── Test 5 (probe): fix, then re-break identically ──────────────────────────
  //
  // warnedGraphErrors is a module-level Set that never resets. FDP v1.8
  // specifies first-encounter warns but is silent on recurrence after a fix,
  // so this is a documented observation, not a pass/fail contract.

  console.log("\nTest 5 (probe): envelope fixed then re-broken identically");

  const bad5 = freshId();
  const path5 = join(agentsDir, "alice", "tasks", "open", `${bad5}.yaml`);
  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-GOOD5", from: "bob" }],
      bob: [],
    },
  });
  await writeFile(path5, corruptYaml(bad5));
  const { warns: wBreak1 } = await withGraphWarns(() => loadGraph(agentsDir, agents));
  await writeFile(
    path5,
    yamlDump({
      id: bad5,
      headline: "fixed now",
      created: "2026-01-01T00:00:01.000Z",
      updated: "2026-01-01T00:00:01.000Z",
      from: "bob",
      to: "alice",
      kind: "code",
      parent: null,
      gate: null,
      status: "open",
      lease: { holder: null, expires: null },
      history: [],
    })
  );
  const { warns: wFixed } = await withGraphWarns(() => loadGraph(agentsDir, agents));
  await writeFile(path5, corruptYaml(bad5)); // identical re-break
  const { result: g5, warns: wBreak2 } = await withGraphWarns(() => loadGraph(agentsDir, agents));

  probe("warns on first break", wBreak1.filter((w) => w.includes(bad5)).length);
  probe("warns while fixed", wFixed.filter((w) => w.includes(bad5)).length);
  probe("warns on identical re-break", wBreak2.filter((w) => w.includes(bad5)).length);
  probe("re-break still in errors[]", g5.errors.some((e) => e.id === bad5));
  assert(
    g5.errors.some((e) => e.id === bad5) && !g5.nodes.has(bad5),
    "5a: the re-broken envelope is still excluded and recorded per-call (state is correct even if the warn is suppressed)"
  );

  // ── Test 6: FDP v1.8 — graph errors surface "plus a journal entry" ─────────
  //
  // FDP §Graph errors: "Both surface via a first-encounter console.warn
  // (not per-tick — that floods) plus a journal entry." A dangling edge must
  // never again be indistinguishable from "not finished yet" — and the journal
  // is the durable half of that visibility.

  console.log("\nTest 6: graph error surfaces in the agent journal (FDP v1.8)");

  const bad6 = freshId();
  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-GOOD6", from: "bob", needs: ["TSK-GHOST6"] }],
      bob: [],
    },
    rawFiles: [{ agent: "alice", bucket: "open", name: `${bad6}.yaml`, content: corruptYaml(bad6) }],
  });
  await loadGraph(agentsDir, agents);

  const journal = await readJournal("alice");
  assert(
    journal.length > 0,
    "6a: a journal entry was written for the graph errors",
    `${join(agentsDir, "alice", "tasks", "journal.ndjson")} is absent or empty — loadGraph only console.warns; FDP v1.8 requires "plus a journal entry"`
  );
  if (journal.length > 0) {
    assert(
      journal.some((l) => l.includes(bad6)) && journal.some((l) => l.includes("TSK-GHOST6")),
      "6b: journal entries name the corrupt envelope id and the dangling edge"
    );
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\ngraph-errors: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
