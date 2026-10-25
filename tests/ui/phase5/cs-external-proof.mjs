// cs-external-proof.mjs — external fresh-process driver for the CS mutation proof.
//
// The in-spec proof (cs-chat-store.spec.mjs) cannot re-run the suite after
// mutating — Bun caches the module within the same process. This driver:
//   1. Mutates stores/chat.ts in memory (setMessages → "__single__" key)
//   2. Runs `bun test cs-chat-store.spec.mjs` in a fresh process → observes red
//   3. Restores from memory in finally
//   4. Runs `bun test cs-chat-store.spec.mjs` again → observes green
//
// Exit 0 on success (real red observed + real green restored), 1 on failure.
//
// Run from the repo root:
//   node tests/ui/phase5/cs-external-proof.mjs

import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, "../../..");
const STORE_PATH = join(REPO_ROOT, "src/ui/app/stores/chat.ts");
const SPEC_PATH  = join(REPO_ROOT, "tests/ui/phase5/cs-chat-store.spec.mjs");

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function runSpec(label) {
  const result = spawnSync("bun", ["test", SPEC_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 60000,
  });
  const out = (result.stdout ?? "") + (result.stderr ?? "");
  // Extract summary line "N passed, M failed"
  const m = out.match(/(\d+) passed.*?(\d+) failed/s);
  const passCount = m ? parseInt(m[1], 10) : -1;
  const failCount = m ? parseInt(m[2], 10) : -1;
  console.log(`${ts()} ${label} rc=${result.status} — ${passCount} passed, ${failCount} failed`);
  // Print the failing test names
  if (result.status !== 0) {
    const lines = out.split("\n").filter((l) => l.includes("✗") || l.includes("FAIL"));
    lines.slice(0, 10).forEach((l) => console.log(`${ts()}   ${l.trim()}`));
  }
  return { rc: result.status ?? 1, passCount, failCount };
}

const original = readFileSync(STORE_PATH, "utf-8");

// The mutation: setMessages writes to "__single__" instead of per-chat key.
// Anchored on the setMessages-specific suffix (messages, isSending:) to avoid
// matching setMeta and patchMessages which share the same structural prefix.
const ANCHOR = "[chatId]: { ...existing, messages, isSending:";
const MUTANT  = '["__single__"]: { ...existing, messages, isSending:';

const occurrences = (original.match(new RegExp(ANCHOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
if (occurrences !== 1) {
  console.error(`cs-external-proof: anchor pattern occurs ${occurrences}× (expected 1) — source may have changed`);
  process.exit(1);
}

const mutated = original.replace(ANCHOR, MUTANT);
let proofOk = false;

try {
  writeFileSync(STORE_PATH, mutated, "utf-8");
  console.log(`${ts()} mutant written — per-chat map collapsed to single slot`);

  const red = runSpec("RED run");
  if (red.rc === 0) {
    console.error("cs-external-proof: mutant did NOT cause a red run — proof invalid");
    process.exit(1);
  }

  writeFileSync(STORE_PATH, original, "utf-8");
  console.log(`${ts()} source restored from memory`);

  const green = runSpec("GREEN run");
  if (green.rc !== 0) {
    console.error("cs-external-proof: restored run is not green — spec has a pre-existing failure");
    process.exit(1);
  }

  console.log(`${ts()} ✓ CS external proof: real ✗ observed red, restored, green`);
  proofOk = true;
} finally {
  // Always restore, even on unexpected throw.
  const current = readFileSync(STORE_PATH, "utf-8");
  if (current !== original) {
    writeFileSync(STORE_PATH, original, "utf-8");
    console.log(`${ts()} source restored in finally`);
  }
}

process.exit(proofOk ? 0 : 1);
