/**
 * Tests for src/cli/task.ts callback surface (WAL-123 Phase A, step 3).
 *
 * T1: park — writes waiting/.md with correct fields, warns at > 6h deadline
 * T2: park — rejects non-member spec (not in WORKER_WAITING_SPECS)
 * T3: done — writes done/.md with status and summary
 * T4: failed — writes failed/.md with reason and summary
 * T5: park-before-launch — assertEnvelope fails if envelope missing
 * T6: deadline default — omitting --deadline-mins uses DEFAULT (60 min), stays below warn
 * T7: deadline warn threshold is a warning, not a ceiling (> 6h warns but proceeds)
 *
 * Run with: bun run test/envelope-callback.test.ts
 */

import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function extractFm(content: string): Record<string, string> | null {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[kv[1]!] = value;
  }
  return out;
}

function minimalYaml(id: string, agent = "alice"): string {
  return [
    `id: ${id}`,
    `headline: "callback test"`,
    `created: 2026-01-01T00:00:00.000Z`,
    `updated: 2026-01-01T00:00:00.000Z`,
    `from: alice`,
    `to: ${agent}`,
    `kind: code`,
    `priority: high`,
    `project: null`,
    `brief: test`,
    `output_format: ""`,
    `status: claimed`,
    `budget:`,
    `  max_turns: 10`,
    `history: []`,
    `dispatch:`,
    `  chat_id: test`,
    `  chat_ts: 2026-01-01T00:00:00.000Z`,
    `lease:`,
    `  holder: runner-test`,
    `  expires: 2099-01-01T00:00:00.000Z`,
  ].join("\n") + "\n";
}

// ── setup ────────────────────────────────────────────────────────────────────

const tmp = await mkdtemp(join(tmpdir(), "callback-test-"));
const agent = "alice";
const root = tmp;

// Create bucket dirs
for (const bucket of ["open", "waiting", "done", "failed", "blocked", "paused"]) {
  await mkdir(join(root, "agents", agent, "tasks", bucket), { recursive: true });
}

// Set CARAVEL_WORKSPACE so the CLI resolves root correctly
process.env.CARAVEL_WORKSPACE = root;

// Helper to run CLI action without process.exit — we can't easily test exit codes
// in the same process. Instead we test the file-system output directly.

// Import after env var is set
const { runTaskCli } = await import("../src/cli/task");

// ── T1: park ─────────────────────────────────────────────────────────────────

console.log("envelope-callback (WAL-123 Phase A)");
console.log("\nT1 — park writes waiting/.md with correct fields:");

const t1Id = "TSK-CB-T1";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t1Id}.yaml`), minimalYaml(t1Id));

// Capture console.warn to detect the 6h warning
const warnMessages: string[] = [];
const origWarn = console.warn;
console.warn = (msg: string) => warnMessages.push(msg);

runTaskCli(["park", "--task", t1Id, "--agent", agent, "--deadline-mins", "30", "--summary", "test park"]);

console.warn = origWarn;

const parkPath = join(root, "agents", agent, "tasks", "waiting", `${t1Id}.md`);
assert(existsSync(parkPath), "T1: park record exists in waiting/");

const parkContent = await readFile(parkPath, "utf8");
const parkFm = extractFm(parkContent);
assertEqual(parkFm?.["status"] ?? "", "waiting", "T1: status = waiting");
assertEqual(parkFm?.["waiting_on"] ?? "", "script", "T1: waiting_on = script");
assert((parkFm?.["deadline"] ?? "").startsWith("2026"), "T1: deadline is set");
assertEqual(parkFm?.["summary"] ?? "", "test park", "T1: summary matches");

// ISO deadline must not be quoted (colons unquoted rule)
const deadlineLine = parkContent.split("\n").find((l) => l.startsWith("deadline:"));
assert(deadlineLine !== undefined && !deadlineLine.includes('"'), `T1: deadline not quoted (${deadlineLine ?? "not found"})`);

// No 6h warning for 30 mins
assert(warnMessages.length === 0, "T1: no warning at 30 mins");

// ── T2: park rejects non-member spec ─────────────────────────────────────────

console.log("\nT2 — park rejects non-member spec:");

const t2Id = "TSK-CB-T2";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t2Id}.yaml`), minimalYaml(t2Id));

let t2Exited = false;
const origExit = process.exit;
// @ts-ignore
process.exit = (code?: number) => { t2Exited = true; throw new Error(`exit:${code}`); };

try {
  runTaskCli(["park", "--task", t2Id, "--agent", agent, "--on", "bogus", "--deadline-mins", "30", "--summary", "bad spec"]);
} catch (e) {
  // expected: exit 1
}
// @ts-ignore
process.exit = origExit;

const t2Path = join(root, "agents", agent, "tasks", "waiting", `${t2Id}.md`);
assert(t2Exited, "T2: process.exit called for bad spec");
assert(!existsSync(t2Path), "T2: no park record written for bad spec");

// ── T3: done ─────────────────────────────────────────────────────────────────

console.log("\nT3 — done writes done/.md:");

const t3Id = "TSK-CB-T3";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t3Id}.yaml`), minimalYaml(t3Id));

runTaskCli(["done", "--task", t3Id, "--agent", agent, "--summary", "work completed"]);

const donePath = join(root, "agents", agent, "tasks", "done", `${t3Id}.md`);
assert(existsSync(donePath), "T3: done record exists in done/");

const doneContent = await readFile(donePath, "utf8");
const doneFm = extractFm(doneContent);
assertEqual(doneFm?.["status"] ?? "", "done", "T3: status = done");
assertEqual(doneFm?.["summary"] ?? "", "work completed", "T3: summary matches");

// ── T4: failed ────────────────────────────────────────────────────────────────

console.log("\nT4 — failed writes failed/.md with reason:");

const t4Id = "TSK-CB-T4";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t4Id}.yaml`), minimalYaml(t4Id));

runTaskCli(["failed", "--task", t4Id, "--agent", agent, "--reason", "budget", "--summary", "budget exceeded"]);

const failedPath = join(root, "agents", agent, "tasks", "failed", `${t4Id}.md`);
assert(existsSync(failedPath), "T4: failed record exists in failed/");

const failedContent = await readFile(failedPath, "utf8");
const failedFm = extractFm(failedContent);
assertEqual(failedFm?.["status"] ?? "", "failed", "T4: status = failed");
assertEqual(failedFm?.["reason"] ?? "", "budget", "T4: reason = budget");
assertEqual(failedFm?.["summary"] ?? "", "budget exceeded", "T4: summary matches");

// ── T5: park-before-launch — assertEnvelope ───────────────────────────────────

console.log("\nT5 — park fails if envelope missing:");

let t5Exited = false;
// @ts-ignore
process.exit = (code?: number) => { t5Exited = true; throw new Error(`exit:${code}`); };

try {
  runTaskCli(["park", "--task", "TSK-NONEXISTENT", "--agent", agent, "--deadline-mins", "30", "--summary", "should fail"]);
} catch {
  // expected
}
// @ts-ignore
process.exit = origExit;

const missingPath = join(root, "agents", agent, "tasks", "waiting", "TSK-NONEXISTENT.md");
assert(t5Exited, "T5: process.exit called for missing envelope");
assert(!existsSync(missingPath), "T5: no park record written for missing envelope");

// ── T6: default deadline ──────────────────────────────────────────────────────

console.log("\nT6 — omitting --deadline-mins defaults to 60 min:");

const t6Id = "TSK-CB-T6";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t6Id}.yaml`), minimalYaml(t6Id));

const beforeMs = Date.now();

const t6Warns: string[] = [];
console.warn = (msg: string) => t6Warns.push(msg);
runTaskCli(["park", "--task", t6Id, "--agent", agent, "--summary", "default deadline"]);
console.warn = origWarn;

const t6Path = join(root, "agents", agent, "tasks", "waiting", `${t6Id}.md`);
assert(existsSync(t6Path), "T6: park record created");

const t6Content = await readFile(t6Path, "utf8");
const t6Fm = extractFm(t6Content);
const dl = new Date(t6Fm?.["deadline"] ?? "").getTime();
const diffMins = (dl - beforeMs) / 60_000;
assert(diffMins >= 55 && diffMins <= 65, `T6: deadline ~60 min away (got ${diffMins.toFixed(1)} min)`);
assert(t6Warns.length === 0, "T6: no warning for default deadline (60 min < 6h threshold)");

// ── T7: deadline warn threshold — warns and proceeds ─────────────────────────

console.log("\nT7 — deadline > 6h warns but proceeds:");

const t7Id = "TSK-CB-T7";
await writeFile(join(root, "agents", agent, "tasks", "open", `${t7Id}.yaml`), minimalYaml(t7Id));

const t7Warns: string[] = [];
console.warn = (msg: string) => t7Warns.push(msg);
runTaskCli(["park", "--task", t7Id, "--agent", agent, "--deadline-mins", "720", "--summary", "long deadline"]);
console.warn = origWarn;

const t7Path = join(root, "agents", agent, "tasks", "waiting", `${t7Id}.md`);
assert(existsSync(t7Path), "T7: park record still written (warn is not a ceiling)");
assert(t7Warns.some((m) => m.includes("warning") || m.includes("12.0h")), `T7: warning emitted (got: ${JSON.stringify(t7Warns)})`);

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
