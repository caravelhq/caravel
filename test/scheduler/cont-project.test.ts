/**
 * Tests that both continuation writers in src/multiAgent.ts correctly
 * propagate the `project:` field to spawned continuation envelopes, and that
 * the resolution order (explicit → parent scan → context inference → absent) is
 * honoured.
 *
 * MUTATION-PROVEN before ship. See TSK-2026-09-01-0002.08 task report.
 *
 * Both writers are tested independently:
 *   - Consolidation writer (isUserTarget=true, 2+ frontier leaves → alice)
 *   - Frontier writer (isUserTarget=false → spawnable agent)
 *
 * Run with: bun run test/scheduler/cont-project.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { inferProjectFromContext } from "../../src/projectUtils.ts";
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

// ── helpers ───────────────────────────────────────────────────────────────────

async function openEnvelopes(agentsDir: string, agent: string): Promise<Array<{ id: string; raw: string }>> {
  const dir = join(agentsDir, agent, "tasks", "open");
  const files = await readdir(dir).catch(() => [] as string[]);
  const results: Array<{ id: string; raw: string }> = [];
  for (const f of files.filter((x) => x.endsWith(".yaml"))) {
    const raw = await readFile(join(dir, f), "utf-8").catch(() => null);
    if (raw === null) continue;
    results.push({ id: f.replace(/\.yaml$/, ""), raw });
  }
  return results;
}

/**
 * Build a minimal task envelope YAML string. Only emits `project:` when
 * explicitly provided (non-null). Context defaults to empty inline form.
 */
function taskYaml(fields: {
  id: string;
  from?: string;
  reply_to?: string | null;
  parent?: string | null;
  project?: string | null;
  context?: string[];
  status?: string;
  kind?: string;
}): string {
  const lines: string[] = [
    `id: ${fields.id}`,
    `headline: "fixture ${fields.id}"`,
    `created: 2026-01-01T00:00:00.000Z`,
    `updated: 2026-01-01T00:00:00.000Z`,
    `from: ${fields.from ?? "alice"}`,
    `to: alice`,
    `kind: ${fields.kind ?? "code"}`,
    `parent: ${fields.parent ?? "null"}`,
    `gate: null`,
    `status: ${fields.status ?? "done"}`,
  ];
  if (fields.project != null) lines.push(`project: ${fields.project}`);
  lines.push(`reply_to: ${fields.reply_to ?? "null"}`);
  lines.push(`lease:`, `  holder: null`, `  expires: null`, `history: []`);
  if (fields.context && fields.context.length > 0) {
    lines.push(`context:`);
    for (const c of fields.context) lines.push(`  - ${c}`);
  } else {
    lines.push(`context: []`);
  }
  lines.push(`summary:`, `  brief: ""`, `  response: ""`, `report: ""`);
  return lines.join("\n") + "\n";
}

// ── process setup ─────────────────────────────────────────────────────────────
// CRITICAL: chdir before import — multiAgent.ts pins AGENTS_DIR = process.cwd()+"/agents"
// at module load time.

const root = await mkdtemp(join(tmpdir(), "caravel-cont-proj-"));
process.chdir(root);
const agentsDir = join(root, "agents");

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;

if (
  typeof t.checkFrontierAndMaybeSpawnContinuation !== "function" ||
  typeof t.loadGraph !== "function"
) {
  console.error("SKIP: required __testing exports not available");
  process.exit(0);
}

type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir?: string
) => Promise<void>;
type LoadGraphFn = (agentsDir: string, agents: string[]) => Promise<unknown>;

const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
const loadGraphFn = t.loadGraph as LoadGraphFn;
const agents = ["alice", "bob", "cliff"];

try {

// ── Section 1: inferProjectFromContext (pure function, no FS) ─────────────────

console.log("\nSection 1: inferProjectFromContext — pure function");

assert(inferProjectFromContext([]) === null, "1a: empty context → null");
assert(
  inferProjectFromContext(["README.md", "src/foo.ts"]) === null,
  "1b: no Notes/Projects/ entries → null"
);
assert(
  inferProjectFromContext(["Notes/Projects/Caravel-Vue/Plan.md"]) === "Caravel-Vue",
  "1c: single entry → that project"
);
assert(
  inferProjectFromContext([
    "Notes/Projects/Alpha/a.md",
    "Notes/Projects/Beta/b.md",
    "Notes/Projects/Alpha/c.md",
  ]) === "Alpha",
  "1d: majority wins (Alpha 2, Beta 1)"
);
assert(
  inferProjectFromContext([
    "Notes/Projects/Alpha/a.md",
    "Notes/Projects/Beta/b.md",
  ]) === "Alpha",
  "1e: tie → first-seen wins"
);

// ── Section 2: Consolidation writer — explicit project: on terminated task ────
//
// Setup: from:kelly (not in agents) → isUserTarget=true; two done siblings with
// same parent → 2 frontier leaves → consolidation continuation written to alice.

console.log("\nSection 2: Consolidation writer — explicit project: field");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "open"), { recursive: true });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  await writeFile(
    join(agentsDir, "alice", "tasks", "open", "TSK-PAR-CA.yaml"),
    taskYaml({ id: "TSK-PAR-CA", status: "open", from: "alice", parent: null })
  );
  const yamlCA1 = taskYaml({ id: "TSK-CA1", from: "kelly", parent: "TSK-PAR-CA", project: "Caravel-Vue" });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-CA1.yaml"), yamlCA1);
  await writeFile(
    join(agentsDir, "alice", "tasks", "done", "TSK-CA2.yaml"),
    taskYaml({ id: "TSK-CA2", from: "kelly", parent: "TSK-PAR-CA" })
  );

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlCA1, "TSK-CA1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "alice")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "2a: exactly one consolidation continuation spawned");
  if (conts.length >= 1) {
    assert(
      conts[0]!.raw.includes("project: Caravel-Vue"),
      "2b: continuation carries project: Caravel-Vue"
    );
  }
}

// ── Section 3: Consolidation writer — parent scan fallback ───────────────────
//
// Current task has no project:; parent envelope has project: Caravel-Vue.

console.log("\nSection 3: Consolidation writer — parent scan fallback");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "open"), { recursive: true });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  await writeFile(
    join(agentsDir, "alice", "tasks", "open", "TSK-PAR-CB.yaml"),
    taskYaml({ id: "TSK-PAR-CB", status: "open", from: "alice", parent: null, project: "Caravel-Vue" })
  );
  const yamlCB1 = taskYaml({ id: "TSK-CB1", from: "kelly", parent: "TSK-PAR-CB" }); // no project
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-CB1.yaml"), yamlCB1);
  await writeFile(
    join(agentsDir, "alice", "tasks", "done", "TSK-CB2.yaml"),
    taskYaml({ id: "TSK-CB2", from: "kelly", parent: "TSK-PAR-CB" })
  );

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlCB1, "TSK-CB1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "alice")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "3a: consolidation continuation spawned");
  if (conts.length >= 1) {
    assert(
      conts[0]!.raw.includes("project: Caravel-Vue"),
      "3b: parent scan fallback — project inherited from parent envelope"
    );
  }
}

// ── Section 4: Consolidation writer — context inference fallback ──────────────
//
// Neither current task nor parent has project:; context entries point to
// Notes/Projects/Caravel-Vue/ — should be inferred.

console.log("\nSection 4: Consolidation writer — context inference fallback");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "open"), { recursive: true });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  await writeFile(
    join(agentsDir, "alice", "tasks", "open", "TSK-PAR-CC.yaml"),
    taskYaml({ id: "TSK-PAR-CC", status: "open", from: "alice", parent: null })
  );
  const yamlCC1 = taskYaml({
    id: "TSK-CC1",
    from: "kelly",
    parent: "TSK-PAR-CC",
    context: ["Notes/Projects/Caravel-Vue/FDP.md", "Notes/Projects/Caravel-Vue/Plan.md"],
  });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-CC1.yaml"), yamlCC1);
  await writeFile(
    join(agentsDir, "alice", "tasks", "done", "TSK-CC2.yaml"),
    taskYaml({ id: "TSK-CC2", from: "kelly", parent: "TSK-PAR-CC" })
  );

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlCC1, "TSK-CC1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "alice")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "4a: consolidation continuation spawned");
  if (conts.length >= 1) {
    assert(
      conts[0]!.raw.includes("project: Caravel-Vue"),
      "4b: context inference fallback — project inferred from context entries"
    );
  }
}

// ── Section 5: Consolidation writer — no project anywhere → field absent ──────

console.log("\nSection 5: Consolidation writer — no project → no project: line");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "open"), { recursive: true });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  await writeFile(
    join(agentsDir, "alice", "tasks", "open", "TSK-PAR-CD.yaml"),
    taskYaml({ id: "TSK-PAR-CD", status: "open", from: "alice", parent: null })
  );
  const yamlCD1 = taskYaml({ id: "TSK-CD1", from: "kelly", parent: "TSK-PAR-CD" });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-CD1.yaml"), yamlCD1);
  await writeFile(
    join(agentsDir, "alice", "tasks", "done", "TSK-CD2.yaml"),
    taskYaml({ id: "TSK-CD2", from: "kelly", parent: "TSK-PAR-CD" })
  );

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlCD1, "TSK-CD1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "alice")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "5a: consolidation continuation spawned");
  if (conts.length >= 1) {
    const hasProject = /^project:/m.test(conts[0]!.raw);
    assert(!hasProject, "5b: no project: line when nothing to inherit");
  }
}

// ── Section 6: Frontier writer — explicit project: on terminated task ──────────
//
// reply_to:bob → target=bob (in agents) → isUserTarget=false → frontier writer.
// Solo task (no siblings) → familyIds=[taskId] → frontier spawn to bob.

console.log("\nSection 6: Frontier writer — explicit project: field");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  const yamlFA1 = taskYaml({
    id: "TSK-FA1",
    from: "alice",
    reply_to: "bob",
    parent: null,
    project: "Caravel-Vue",
  });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-FA1.yaml"), yamlFA1);

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlFA1, "TSK-FA1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "bob")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "6a: exactly one frontier continuation spawned to bob");
  if (conts.length >= 1) {
    assert(
      conts[0]!.raw.includes("project: Caravel-Vue"),
      "6b: frontier continuation carries project: Caravel-Vue"
    );
  }
}

// ── Section 7: Frontier writer — parent scan fallback ─────────────────────────

console.log("\nSection 7: Frontier writer — parent scan fallback");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "open"), { recursive: true });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  await writeFile(
    join(agentsDir, "alice", "tasks", "open", "TSK-PAR-FB.yaml"),
    taskYaml({ id: "TSK-PAR-FB", status: "open", from: "alice", parent: null, project: "Caravel-Vue" })
  );
  const yamlFB1 = taskYaml({ id: "TSK-FB1", from: "alice", reply_to: "bob", parent: "TSK-PAR-FB" });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-FB1.yaml"), yamlFB1);

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlFB1, "TSK-FB1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "bob")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "7a: frontier continuation spawned");
  if (conts.length >= 1) {
    assert(
      conts[0]!.raw.includes("project: Caravel-Vue"),
      "7b: parent scan fallback — project inherited from parent envelope"
    );
  }
}

// ── Section 8: Frontier writer — no project → field absent ───────────────────

console.log("\nSection 8: Frontier writer — no project anywhere → no project: line");

{
  await buildFixture(root, { agents: { alice: [], bob: [], cliff: [] } });
  await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

  const yamlFC1 = taskYaml({ id: "TSK-FC1", from: "alice", reply_to: "bob", parent: null });
  await writeFile(join(agentsDir, "alice", "tasks", "done", "TSK-FC1.yaml"), yamlFC1);

  await loadGraphFn(agentsDir, agents);
  await checkFrontier(yamlFC1, "TSK-FC1", "alice", agents, agentsDir);

  const conts = (await openEnvelopes(agentsDir, "bob")).filter((e) => e.raw.includes("kind: continuation"));
  assert(conts.length === 1, "8a: frontier continuation spawned");
  if (conts.length >= 1) {
    const hasProject = /^project:/m.test(conts[0]!.raw);
    assert(!hasProject, "8b: no project: line when nothing to inherit");
  }
}

} catch (e) {
  console.error("UNEXPECTED ERROR:", e);
  process.exit(1);
}

// ── summary ────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${total} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log("PASS");
process.exit(0);
