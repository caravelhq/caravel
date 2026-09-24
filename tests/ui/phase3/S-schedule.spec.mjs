// S-schedule.spec.mjs — Phase 3 node 4: schedule PATCH and recurring identity
//
// S1 green:  PATCH a template with comments → 200, comments survive in file
// S1 mut:    PATCH with invalid cron → 400, file byte-identical
// S2:        bumpTemplateFired round-trip — PATCH then bump, count increments,
//            comment still present in file
// S3:        Task listing: recurring_template field → recurring: true in row
//
// All tests run against the scratch daemon at http://127.0.0.1:4636.
// The fixture template with comments is:
//   tests/ui/phase3/fixture-ws/agents/agent-alpha/tasks/scheduled/weekly-review.yaml

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON = (process.env.CARAVEL_BASE || "http://127.0.0.1:4636").replace(/\/$/, "");
const FIXTURE_DIR = join(__dirname, "fixture-ws");
const TEMPLATE_PATH = join(FIXTURE_DIR, "agents/agent-alpha/tasks/scheduled/TSK-SCHED-FX-REVIEW.yaml");

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// Save a backup of the template before any mutations
const templateOriginal = readFileSync(TEMPLATE_PATH, "utf-8");
// The comments we expect to survive edits
const COMMENT_1 = "# Fires every Monday morning at 08:00, an hour after the daily run,";
const COMMENT_2 = "# skip_if_active prevents a second instance piling up";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiGet(path) {
  const r = await fetch(`${DAEMON}${path}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${DAEMON}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function apiPatch(path, body) {
  const r = await fetch(`${DAEMON}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// Restore the template to its original state
function restoreTemplate() {
  writeFileSync(TEMPLATE_PATH, templateOriginal, "utf-8");
}

// ── S1 green: PATCH preserves comments ───────────────────────────────────────

try {
  restoreTemplate();
  const before = readFileSync(TEMPLATE_PATH, "utf-8");
  const { status, body } = await apiPatch("/api/tasks/schedule/TSK-SCHED-FX-REVIEW", {
    agent: "agent-alpha",
    headline: "Fixture: weekly review run (edited)",
  });

  if (status !== 200) {
    fail("S1 green - PATCH returns 200", `got ${status}: ${JSON.stringify(body)}`);
  } else if (!body.ok) {
    fail("S1 green - PATCH returns ok:true", `body.ok=${body.ok}`);
  } else {
    const after = readFileSync(TEMPLATE_PATH, "utf-8");
    const comment1Survived = after.includes(COMMENT_1);
    const comment2Survived = after.includes(COMMENT_2);
    const headlineUpdated = after.includes("Fixture: weekly review run (edited)");
    const countPreserved = /count:\s*3/.test(after);
    const lastFiredPreserved = after.includes("2026-09-21T08:00:00.000Z");

    if (!comment1Survived) fail("S1 green - comment 1 survived", `missing: "${COMMENT_1}"`);
    else if (!comment2Survived) fail("S1 green - comment 2 survived", `missing: "${COMMENT_2}"`);
    else if (!headlineUpdated) fail("S1 green - headline updated", "new headline not found in file");
    else if (!countPreserved) fail("S1 green - count preserved", "count:3 not found");
    else if (!lastFiredPreserved) fail("S1 green - last_fired preserved", "last_fired not found");
    else {
      pass("S1 green - PATCH updates headline, preserves comments + count + last_fired");
      console.log(`    comment1: present; comment2: present; count:3 preserved; last_fired preserved`);
    }
  }

  // nextFires should be 3 ISO strings for a cron template
  if (body.ok && Array.isArray(body.nextFires) && body.nextFires.length === 3) {
    pass(`S1 green - nextFires returns 3 ISO strings: ${body.nextFires[0]}`);
  } else {
    fail("S1 green - nextFires", `got ${JSON.stringify(body.nextFires)}`);
  }

} catch (e) {
  fail("S1 green", String(e));
}

// ── S1 mutation: invalid cron → 400, file byte-identical ─────────────────────

try {
  restoreTemplate();
  const beforeBytes = readFileSync(TEMPLATE_PATH);
  const beforeStr = beforeBytes.toString();

  const { status, body } = await apiPatch("/api/tasks/schedule/TSK-SCHED-FX-REVIEW", {
    agent: "agent-alpha",
    recurrence: { cron: "not a valid cron" },
  });

  const afterBytes = readFileSync(TEMPLATE_PATH);
  const afterStr = afterBytes.toString();

  if (status !== 400) {
    fail("S1 🔬 mutation - invalid cron returns 400", `got status ${status}`);
  } else if (afterStr !== beforeStr) {
    fail("S1 🔬 mutation - file byte-identical on 400", "file changed despite 400");
  } else {
    pass(`S1 🔬 mutation - invalid cron returns 400, file byte-identical: "${body.error}"`);
  }
} catch (e) {
  fail("S1 mutation", String(e));
}

// ── S2 🔬: bumpTemplateFired via tickScheduler ────────────────────────────────
// Fire the fixture schedule through the real product path (tickScheduler) and
// assert count increments, last_fired moves, and comments survive.
//
// Mutation proof: revert bumpTemplateFired to a yamlLoad/yamlDump round-trip
// → comments are stripped → "comment 1 survived" assertion goes RED.
// (Run with scheduler.ts mutated to confirm, then restore for GREEN.)

try {
  restoreTemplate();

  const CARAVEL_ROOT = join(__dirname, "../../..");
  const OPEN_DIR = join(FIXTURE_DIR, "agents/agent-alpha/tasks/open");
  const beforeOpen = new Set(readdirSync(OPEN_DIR));

  // Fire via the real tickScheduler. The cron "0 8 * * 1" matches Monday 08:00 UTC.
  // Next Monday after 2026-09-21 is 2026-09-28.
  const tmpDir = mkdtempSync(join(tmpdir(), "s2-tick-"));
  const tickScriptPath = join(tmpDir, "tick.ts");
  writeFileSync(tickScriptPath, `
import { tickScheduler } from ${JSON.stringify(join(CARAVEL_ROOT, "src/scheduler.ts"))};
await tickScheduler(0, new Date("2026-09-28T08:00:00.000Z"));
  `.trim());

  const tickResult = spawnSync("bun", ["run", tickScriptPath], {
    cwd: FIXTURE_DIR,
    encoding: "utf-8",
    env: { ...process.env, HOME: process.env.HOME },
  });
  const tickOut = tickResult.stdout;
  const tickErr = tickResult.stderr;
  try { rmSync(tmpDir, { recursive: true }); } catch {}

  if (tickResult.status !== 0) {
    fail("S2 tick script", `exit ${tickResult.status}: ${tickErr.slice(0, 300)}`);
    throw new Error("tick script failed");
  }

  // Clean up the task spawned by tickScheduler
  const afterOpen = new Set(readdirSync(OPEN_DIR));
  for (const f of afterOpen) {
    if (!beforeOpen.has(f) && f.endsWith(".yaml")) {
      try { unlinkSync(join(OPEN_DIR, f)); } catch {}
    }
  }

  const afterTick = readFileSync(TEMPLATE_PATH, "utf-8");
  const countAfterMatch = afterTick.match(/count:\s*(\d+)/);
  const countAfter = countAfterMatch ? Number(countAfterMatch[1]) : -1;
  const commentsSurvived = afterTick.includes(COMMENT_1) && afterTick.includes(COMMENT_2);
  const lastFiredUpdated = afterTick.includes("2026-09-28T08:00:00.000Z");

  if (countAfter !== 4) {
    fail("S2 🔬 tickScheduler - count incremented", `expected 4, got ${countAfter}; tick output: ${tickOut.trim()}`);
  } else if (!commentsSurvived) {
    fail("S2 🔬 tickScheduler - comments survived", `missing after tick`);
  } else if (!lastFiredUpdated) {
    fail("S2 🔬 tickScheduler - last_fired updated", "expected 2026-09-28T08:00:00.000Z");
  } else {
    pass(`S2 🔬 GREEN - tickScheduler: count 3→${countAfter}, comments present, last_fired=2026-09-28T08:00:00.000Z`);
    if (tickOut.trim()) console.log(`    tick output: ${tickOut.trim()}`);
  }

} catch (e) {
  fail("S2 tickScheduler round-trip", String(e));
} finally {
  restoreTemplate();
}

// ── S3: recurring flag in task listing ───────────────────────────────────────
// TSK-FX-RECUR has recurring_template set → recurring: true in /api/tasks

try {
  const resp = await apiGet("/api/tasks");

  if (!resp.tasks) {
    fail("S3 recurring flag", `no tasks in response: ${JSON.stringify(resp).slice(0, 200)}`);
  } else {
    const recurTask = resp.tasks.find((t) => t.id === "TSK-FX-RECUR");
    const nonRecurTask = resp.tasks.find((t) => t.id === "TSK-FX-0001");

    if (!recurTask) {
      fail("S3 recurring flag", "TSK-FX-RECUR not found in task listing");
    } else if (recurTask.recurring !== true) {
      fail("S3 recurring flag - recurring task has recurring:true", `got recurring=${recurTask.recurring}`);
    } else if (nonRecurTask && nonRecurTask.recurring !== false) {
      fail("S3 recurring flag - non-recurring task has recurring:false", `got recurring=${nonRecurTask.recurring}`);
    } else {
      pass(`S3 recurring flag: TSK-FX-RECUR.recurring=${recurTask.recurring}, TSK-FX-0001.recurring=${nonRecurTask?.recurring}`);
    }
  }
} catch (e) {
  fail("S3 recurring flag", String(e));
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} specs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
