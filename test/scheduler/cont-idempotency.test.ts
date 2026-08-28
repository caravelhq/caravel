/**
 * Continuation idempotency tests (WAL-72 Phase 2 fix round, TSK-2026-08-27-0005.18).
 *
 * FDP v1.11: "exactly one continuation" is a statement about executions,
 * not files. The existence check (graph.nodes.has(id)) guards three failure
 * modes that Jess's test 1a cannot detect — it fires both transitions
 * back-to-back while the envelope sits untouched in open/ with status: open,
 * so it proves "exactly one FILE" but not "exactly one EXECUTION".
 *
 * The three cases that need the fix:
 *
 *   1. Continuation already CLAIMED — still in open/ with status: claimed
 *      and a held lease. A blind overwrite resets it to status: open and
 *      clears the lease, allowing the runner to claim it a second time while
 *      the first worker is still running.
 *
 *   2. Continuation already DONE — moved to done/. The open/ path is free,
 *      so a blind write creates a fresh envelope and the continuation re-runs.
 *
 *   3. Continuation already FAILED — moved to failed/. Same as DONE.
 *
 * Run with: bun run test/scheduler/cont-idempotency.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";

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

// ── setup: pin AGENTS_DIR via cwd BEFORE importing multiAgent ────────────────
// Must happen before the dynamic import so AGENTS_DIR = join(cwd, "agents").

const root = await (async () => {
  const { mkdtemp } = await import("fs/promises");
  return mkdtemp(join(tmpdir(), "caravel-cont-idempotency-"));
})();
process.chdir(root);
const agentsDir = join(root, "agents");

type FrontierFn = (
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir?: string
) => Promise<void>;

const ma = await import("../../src/multiAgent.ts");
const t = (ma.__testing ?? {}) as Record<string, unknown>;
if (typeof t.checkFrontierAndMaybeSpawnContinuation !== "function") {
  console.error("SKIP: __testing.checkFrontierAndMaybeSpawnContinuation not available");
  process.exit(0);
}
const checkFrontier = t.checkFrontierAndMaybeSpawnContinuation as FrontierFn;

async function countOpenFiles(agent: string): Promise<string[]> {
  const dir = join(agentsDir, agent, "tasks", "open");
  return (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
}

async function readTaskYaml(bucket: string, id: string): Promise<string> {
  return readFile(join(agentsDir, "alice", "tasks", bucket, `${id}.yaml`), "utf-8");
}

try {
  const agents = ["alice", "bob"];

  // ── Test 1: continuation already CLAIMED — lease must not be clobbered ─────
  //
  // The WAL-71 replay class combined with delay: first transition fires,
  // runner claims the continuation, then the original task's lease expires and
  // sweepStaleClaims re-opens it, firing the transition again. At that point
  // the continuation has a live worker. Without the fix, the re-spawn resets
  // status: open and holder: null, and the runner claims it again.

  console.log("\nTest 1: continuation already claimed — spawn must not clobber the live lease");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C1", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const c1Yaml = await readTaskYaml("done", "TSK-C1");

  // First transition: spawns TSK-C1-cont in bob/open/
  await checkFrontier(c1Yaml, "TSK-C1", "alice", agents, agentsDir);

  // Simulate the runner claiming the continuation
  const contPath = join(agentsDir, "bob", "tasks", "open", "TSK-C1-cont.yaml");
  const contYamlBefore = await readFile(contPath, "utf-8");
  const contDocBefore = yamlLoad(contYamlBefore) as Record<string, unknown>;
  const leaseExpiry = new Date(Date.now() + 3_600_000).toISOString(); // 1h from now
  const claimedDoc = {
    ...contDocBefore,
    status: "claimed",
    lease: { holder: "worker-test-0001", expires: leaseExpiry },
  };
  await writeFile(contPath, yamlDump(claimedDoc));

  // Second transition (stale-claim replay): must NOT reset the envelope
  await checkFrontier(c1Yaml, "TSK-C1", "alice", agents, agentsDir);

  const contYamlAfter = await readFile(contPath, "utf-8");
  const contDocAfter = yamlLoad(contYamlAfter) as Record<string, unknown>;
  const leaseAfter = contDocAfter["lease"] as Record<string, unknown> | null;

  assert(
    contDocAfter["status"] === "claimed",
    "1a: re-transition does not reset continuation status to open (lease intact)",
    `status after re-transition: ${String(contDocAfter["status"])}`
  );
  assert(
    leaseAfter?.["holder"] === "worker-test-0001",
    "1b: lease holder is unchanged (worker still owns the envelope)",
    `holder: ${String(leaseAfter?.["holder"])}`
  );
  assert(
    leaseAfter?.["expires"] === leaseExpiry,
    "1c: lease expiry is unchanged",
    `expires: ${String(leaseAfter?.["expires"])}`
  );
  assert(
    (await countOpenFiles("bob")).length === 1,
    "1d: still exactly one file in bob/open/ (no duplicate spawned)"
  );

  // ── Test 2: continuation already DONE — must not re-run ───────────────────
  //
  // The continuation completed and moved to done/. open/ is free. A blind
  // write creates a fresh envelope and the whole continuation re-executes.

  console.log("\nTest 2: continuation already done — must not spawn a fresh one");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C2", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const c2Yaml = await readTaskYaml("done", "TSK-C2");

  // First transition: spawns TSK-C2-cont
  await checkFrontier(c2Yaml, "TSK-C2", "alice", agents, agentsDir);

  // Move continuation to done/ (simulating completion)
  const contOpenPath2 = join(agentsDir, "bob", "tasks", "open", "TSK-C2-cont.yaml");
  const donePath2 = join(agentsDir, "bob", "tasks", "done");
  await mkdir(donePath2, { recursive: true });
  const doneDoc2 = { ...(yamlLoad(await readFile(contOpenPath2, "utf-8")) as object), status: "done" };
  await writeFile(join(donePath2, "TSK-C2-cont.yaml"), yamlDump(doneDoc2));
  await rm(contOpenPath2);

  // Second transition: open/ is now free — fix prevents re-spawn
  await checkFrontier(c2Yaml, "TSK-C2", "alice", agents, agentsDir);

  const bobOpenAfter2 = await countOpenFiles("bob");
  assert(
    bobOpenAfter2.length === 0,
    "2a: no new envelope in bob/open/ after done continuation (no re-execution)",
    `open files: [${bobOpenAfter2.join(", ")}]`
  );

  // ── Test 3: continuation already FAILED — must not re-run ─────────────────
  //
  // Same reasoning as DONE. A failed continuation should be investigated by a
  // human, not silently re-queued by a re-transition.

  console.log("\nTest 3: continuation already failed — must not spawn a fresh one");

  await buildFixture(root, {
    agents: {
      alice: [{ id: "TSK-C3", status: "done", from: "bob", kind: "code" }],
      bob: [],
    },
  });
  const c3Yaml = await readTaskYaml("done", "TSK-C3");

  // First transition: spawns TSK-C3-cont
  await checkFrontier(c3Yaml, "TSK-C3", "alice", agents, agentsDir);

  // Move continuation to failed/
  const contOpenPath3 = join(agentsDir, "bob", "tasks", "open", "TSK-C3-cont.yaml");
  const failedPath3 = join(agentsDir, "bob", "tasks", "failed");
  await mkdir(failedPath3, { recursive: true });
  const failedDoc3 = { ...(yamlLoad(await readFile(contOpenPath3, "utf-8")) as object), status: "failed" };
  await writeFile(join(failedPath3, "TSK-C3-cont.yaml"), yamlDump(failedDoc3));
  await rm(contOpenPath3);

  // Second transition: fix prevents re-spawn
  await checkFrontier(c3Yaml, "TSK-C3", "alice", agents, agentsDir);

  const bobOpenAfter3 = await countOpenFiles("bob");
  assert(
    bobOpenAfter3.length === 0,
    "3a: no new envelope in bob/open/ after failed continuation (no re-execution)",
    `open files: [${bobOpenAfter3.join(", ")}]`
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\ncont-idempotency: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
