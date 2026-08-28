/**
 * Frontier check + continuation loop guard tests (WAL-72 Phase 2 — FDP test plan 5b).
 *
 * Proves:
 *   1. A `kind: continuation` task reaching the frontier with nothing downstream
 *      does NOT spawn another continuation (DEC-12 loop guard).
 *   2. A normal frontier task (kind != continuation, non-Alice from, valid target in
 *      agents list) DOES spawn a continuation envelope to the target agent.
 *   3. A task with declared downstream (non-empty reverse index) does NOT spawn.
 *   4. A task whose target is not in the agents list does NOT spawn.
 *
 * Run with: bun run test/scheduler/frontier.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, readdir, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── setup: pin AGENTS_DIR before import ───────────────────────────────────────
//
// multiAgent.ts resolves AGENTS_DIR = join(process.cwd(), "agents") at module
// load time.  chdir FIRST, then import — same pattern as the ready-set suite.

const root = await mkdtemp(join(tmpdir(), "caravel-frontier-"));
process.chdir(root);

type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir?: string
) => Promise<void>;

let checkFrontier: FrontierFn | null = null;

try {
  const ma = await import("../../src/multiAgent.ts");
  const t = (ma.__testing ?? {}) as Record<string, unknown>;
  if (typeof t.checkFrontierAndMaybeSpawnContinuation === "function") {
    checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;
  }
} catch (e) {
  console.error("  import failed:", (e as Error).message);
}

if (!checkFrontier) {
  console.error("SKIP: __testing.checkFrontierAndMaybeSpawnContinuation not available");
  process.exit(0);
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function countOpenFiles(agentsDir: string, agent: string): Promise<number> {
  const openDir = join(agentsDir, agent, "tasks", "open");
  try {
    const entries = await readdir(openDir);
    return entries.filter((e) => e.endsWith(".yaml")).length;
  } catch { return 0; }
}

function makeYaml(fields: Record<string, unknown>): string {
  return yamlDump({
    id: "TSK-TEST",
    headline: "fixture task",
    created: "2026-01-01T00:00:01.000Z",
    updated: "2026-01-01T00:00:01.000Z",
    status: "done",
    lease: { holder: null, expires: null },
    history: [],
    ...fields,
  });
}

try {
  // Agents used across tests
  const agents = ["alice", "bob"];

  // ── Test 1: DEC-12 loop guard — continuation must not spawn another ─────────

  console.log("\nTest 1: DEC-12 loop guard — kind:continuation → no spawn");

  {
    const agentsDir = join(root, "agents");
    await mkdir(join(agentsDir, "alice", "tasks", "done"), { recursive: true });

    const yaml = makeYaml({
      id: "TSK-CONT",
      from: "bob",
      to: "alice",
      kind: "continuation",
      reply_to: null,
      parent: null,
    });

    const bobOpenBefore = await countOpenFiles(agentsDir, "bob");
    await checkFrontier!(yaml, "TSK-CONT", "alice", agents, agentsDir);
    const bobOpenAfter = await countOpenFiles(agentsDir, "bob");

    assert(
      bobOpenAfter === bobOpenBefore,
      "1a: kind:continuation at frontier → no new envelope spawned",
      `open count: before=${bobOpenBefore} after=${bobOpenAfter}`
    );
    assert(
      bobOpenAfter === 0,
      "1b: bob's open/ remains empty (loop guard fires, not waiting-on-user path)"
    );
  }

  // ── Test 2: Basic frontier — non-continuation spawns a continuation ─────────

  console.log("\nTest 2: Basic frontier — kind:code, target in agents → spawn");

  {
    const agentsDir2 = join(root, "agents2");
    // Empty graph: no tasks reference TSK-WORK → reverse index empty → frontier
    await mkdir(join(agentsDir2, "alice", "tasks", "done"), { recursive: true });
    await mkdir(join(agentsDir2, "bob", "tasks", "open"), { recursive: true });

    // Task dispatched by bob to alice (non-Alice from, so Alice gate doesn't fire).
    // When alice completes it, target = reply_to ?? from = null ?? "bob" = "bob".
    const yaml2 = makeYaml({
      id: "TSK-WORK",
      from: "bob",
      to: "alice",
      kind: "code",
      reply_to: null,
      parent: null,
    });

    const bobOpenBefore = await countOpenFiles(agentsDir2, "bob");
    await checkFrontier!(yaml2, "TSK-WORK", "alice", agents, agentsDir2);
    const bobOpenAfter = await countOpenFiles(agentsDir2, "bob");

    assert(
      bobOpenAfter === bobOpenBefore + 1,
      "2a: frontier task spawns one continuation to bob",
      `open count: before=${bobOpenBefore} after=${bobOpenAfter}`
    );

    // Verify the spawned envelope is a continuation with the right fields.
    if (bobOpenAfter > 0) {
      const bobOpen = join(agentsDir2, "bob", "tasks", "open");
      const files = (await readdir(bobOpen)).filter((f) => f.endsWith(".yaml"));
      const content = await import("fs/promises").then((fs) =>
        fs.readFile(join(bobOpen, files[0]!), "utf-8")
      );
      assert(
        content.includes("kind: continuation"),
        "2b: spawned envelope has kind: continuation"
      );
      assert(
        content.includes("to: bob"),
        "2c: spawned envelope is addressed to bob"
      );
      assert(
        content.includes("from: runner"),
        "2d: spawned envelope is from: runner"
      );
    }
  }

  // ── Test 3: Non-frontier — task has downstream → no spawn ──────────────────

  console.log("\nTest 3: Non-frontier — downstream declared → no spawn");

  {
    const agentsDir3 = join(root, "agents3");
    // TSK-WORK3 in alice's done (just completed); TSK-JOIN in alice's open with needs: [TSK-WORK3]
    await mkdir(join(agentsDir3, "alice", "tasks", "done"), { recursive: true });
    await mkdir(join(agentsDir3, "alice", "tasks", "open"), { recursive: true });
    await mkdir(join(agentsDir3, "bob", "tasks", "open"), { recursive: true });

    // Write TSK-WORK3 into done/ — it was just completed, which is the state at
    // the time checkFrontierAndMaybeSpawnContinuation is called.  Without this the
    // graph can't build the reverse index and sees TSK-JOIN's dep as dangling (F2).
    await writeFile(
      join(agentsDir3, "alice", "tasks", "done", "TSK-WORK3.yaml"),
      yamlDump({
        id: "TSK-WORK3",
        headline: "fixture work task",
        created: "2026-01-01T00:00:01.000Z",
        updated: "2026-01-01T00:00:02.000Z",
        from: "bob",
        to: "alice",
        kind: "code",
        status: "done",
        lease: { holder: null, expires: null },
        history: [],
      })
    );

    // Write TSK-JOIN which declares needs: [TSK-WORK3]
    await writeFile(
      join(agentsDir3, "alice", "tasks", "open", "TSK-JOIN.yaml"),
      yamlDump({
        id: "TSK-JOIN",
        headline: "join task",
        created: "2026-01-01T00:00:02.000Z",
        updated: "2026-01-01T00:00:02.000Z",
        from: "bob",
        to: "alice",
        kind: "code",
        status: "open",
        needs: ["TSK-WORK3"],
        lease: { holder: null, expires: null },
        history: [],
      })
    );

    const yaml3 = makeYaml({
      id: "TSK-WORK3",
      from: "bob",
      to: "alice",
      kind: "code",
      reply_to: null,
      parent: null,
    });

    const bobOpenBefore = await countOpenFiles(agentsDir3, "bob");
    await checkFrontier!(yaml3, "TSK-WORK3", "alice", agents, agentsDir3);
    const bobOpenAfter = await countOpenFiles(agentsDir3, "bob");

    assert(
      bobOpenAfter === bobOpenBefore,
      "3a: task with downstream (TSK-JOIN needs TSK-WORK3) → no continuation spawned",
      `open count: before=${bobOpenBefore} after=${bobOpenAfter}`
    );
  }

  // ── Test 4: Target not in agents list → no spawn ───────────────────────────

  console.log("\nTest 4: Target not in agents list → no spawn (waiting-on-user)");

  {
    const agentsDir4 = join(root, "agents4");
    await mkdir(join(agentsDir4, "alice", "tasks", "done"), { recursive: true });

    // from: kelly → target = kelly → not in ["alice", "bob"] → no spawn
    const yaml4 = makeYaml({
      id: "TSK-KELLY",
      from: "kelly",
      to: "alice",
      kind: "code",
      reply_to: null,
      parent: null,
    });

    const aliceOpenBefore = await countOpenFiles(agentsDir4, "alice");
    const bobOpenBefore2 = await countOpenFiles(agentsDir4, "bob");
    await checkFrontier!(yaml4, "TSK-KELLY", "alice", agents, agentsDir4);
    const aliceOpenAfter = await countOpenFiles(agentsDir4, "alice");
    const bobOpenAfter2 = await countOpenFiles(agentsDir4, "bob");

    assert(
      aliceOpenAfter === aliceOpenBefore && bobOpenAfter2 === bobOpenBefore2,
      "4a: target 'kelly' not in agents list → no continuation spawned"
    );
  }

} finally {
  await rm(root, { recursive: true, force: true });
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\nfrontier: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
