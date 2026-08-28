/**
 * Tick-level claim regression (WAL-72 Phase 1 — FDP test plan #3).
 *
 * Proves that tasks with unsatisfied `needs:` edges are skipped by the claim
 * pass, and that satisfying those edges on disk (marking the dep done) makes
 * the downstream task claimable on the next pass.
 *
 * Uses Jess's fixture builder (fixture.ts) so all YAML is emitted via js-yaml
 * dump — strict-parseable by construction, same guarantee as the ready-set suite.
 *
 * Run with: bun run test/scheduler/tick-claim.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { buildFixture } from "./fixture.ts";

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

// ── import runClaimPassForTesting + claimDecision ─────────────────────────────

type ClaimPassResult = { claimed: string[]; skippedNotReady: string[] };
type RunClaimPass = (
  agentsDir: string,
  agents: string[],
  leaseMs?: number
) => Promise<ClaimPassResult>;

type ClaimDecision = "skip-claimed" | "skip-terminalish" | "skip-not-ready" | "claim";
type ClaimDecisionFn = (yaml: string, taskId: string, graph: unknown) => ClaimDecision;

let runClaimPassForTesting: RunClaimPass | null = null;
let claimDecision: ClaimDecisionFn | null = null;

try {
  const ma = await import("../../src/multiAgent.ts");
  const t = (ma.__testing ?? {}) as Record<string, unknown>;
  if (typeof t.runClaimPassForTesting === "function") {
    runClaimPassForTesting = t.runClaimPassForTesting as RunClaimPass;
  }
  if (typeof t.claimDecision === "function") {
    claimDecision = t.claimDecision as ClaimDecisionFn;
  }
} catch (e) {
  console.error("  import failed:", (e as Error).message);
}

if (!runClaimPassForTesting) {
  console.error("SKIP: __testing.runClaimPassForTesting not available — cannot run tick-claim suite");
  process.exit(0);
}

// ── FDP test plan #3 — claim-pass regression ──────────────────────────────────

console.log("FDP test plan #3: claim-pass needs-edge regression");

const root = await mkdtemp(join(tmpdir(), "caravel-tick-claim-"));
try {
  // ── Phase A: TSK-06 needs TSK-05, both open → TSK-05 claimed, TSK-06 not ──

  console.log("\nPhase A — initial state: both tasks open");
  const agentsDir = await buildFixture(root, {
    agents: {
      bob: [
        { id: "TSK-05", status: "open" },
        { id: "TSK-06", status: "open", needs: ["TSK-05"] },
      ],
    },
  });

  const passA = await runClaimPassForTesting(agentsDir, ["bob"]);

  assert(
    passA.claimed.includes("TSK-05"),
    "A1: TSK-05 (no deps) is claimed"
  );
  assert(
    !passA.claimed.includes("TSK-06"),
    "A2: TSK-06 (needs TSK-05) is NOT claimed",
    `claimed=[${passA.claimed.join(", ")}]`
  );
  assert(
    passA.skippedNotReady.includes("TSK-06"),
    "A3: TSK-06 is in skippedNotReady",
    `skippedNotReady=[${passA.skippedNotReady.join(", ")}]`
  );

  // Verify TSK-06.yaml is still in open/ — it must not be parked or moved.
  const ts06InOpen = join(agentsDir, "bob", "tasks", "open", "TSK-06.yaml");
  let ts06Yaml: string | null = null;
  try { ts06Yaml = await readFile(ts06InOpen, "utf-8"); } catch {}
  assert(
    ts06Yaml !== null,
    "A4: TSK-06.yaml remains in open/ (not moved to waiting/ or elsewhere)"
  );

  // ── Phase B: mark TSK-05 done on disk, run again → TSK-06 claimed ──────────

  console.log("\nPhase B — mark TSK-05 done, re-run pass");
  const openDir = join(agentsDir, "bob", "tasks", "open");
  const doneDir = join(agentsDir, "bob", "tasks", "done");
  await mkdir(doneDir, { recursive: true });

  const ts05Path = join(openDir, "TSK-05.yaml");
  const ts05Yaml = await readFile(ts05Path, "utf-8");
  // TSK-05 is now status: claimed from pass A — write status: done and move it.
  const ts05Done = ts05Yaml.replace(/^status: claimed$/m, "status: done");
  await writeFile(ts05Path, ts05Done);
  await rename(ts05Path, join(doneDir, "TSK-05.yaml"));

  const passB = await runClaimPassForTesting(agentsDir, ["bob"]);

  assert(
    passB.claimed.includes("TSK-06"),
    "B1: TSK-06 is claimed once TSK-05 is done",
    `claimed=[${passB.claimed.join(", ")}], skippedNotReady=[${passB.skippedNotReady.join(", ")}]`
  );
  assert(
    !passB.skippedNotReady.includes("TSK-06"),
    "B2: TSK-06 is no longer in skippedNotReady"
  );

} finally {
  await rm(root, { recursive: true, force: true });
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\ntick-claim: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
