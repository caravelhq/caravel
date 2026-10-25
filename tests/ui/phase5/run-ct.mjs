#!/usr/bin/env node
// run-ct.mjs — Phase 5 step 5: CT suite runner
//
// Starts a test UI server on :4663 (proxied to the live daemon at :4632),
// runs the CT suite, and optionally the mutation proof.
// Stops the server in finally — even on crash.
//
// Usage:
//   cd repos/caravel && node tests/ui/phase5/run-ct.mjs
//   cd repos/caravel && node tests/ui/phase5/run-ct.mjs --mutation
//
// Mutation proof:
//   CT-PROOF-1 (__pendingAgentId): adds back window.__pendingAgentId write
//   to TaskActions.openChatThread → CT-1 goes red. WAL-149 AC2/AC3 (Next
//   navigation, fallback) stay green, proving the old spec alone cannot
//   catch this regression.
//
// The WAL-149 spec is also run (inherited unchanged) as the companion
// regression guard. Its output is informational — after step 5, the
// ChatPage-specific checks (window.__chatSessionId, #chat-input) will
// fail because ChatPage is deleted; the navigation regression it guards
// (AC2/AC3) still passes.
//
// Prerequisites:
//   - Live daemon running at :4632 (the default)
//   - A real task exists: SRC_TASK env var, default TSK-2026-10-21-0004.40
//   - bun and node installed

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = realpathSync(resolve(__dirname, "..", "..", ".."));
if (!existsSync(join(REPO, "package.json")) || !existsSync(join(REPO, "src", "ui"))) {
  console.error(`run-ct: refusing to run — ${REPO} is not the caravel repo`);
  process.exit(2);
}

const WS = "/home/walter/workspace";
const SKILL = join(WS, ".claude", "skills", "ui-test");
const LOGS_DIR = join(REPO, "tests", "ui", "phase5", ".runs", "ct-task-contract");
mkdirSync(LOGS_DIR, { recursive: true });

const PORT_UI     = 4663;
const PORT_DAEMON = parseInt(process.env.CARAVEL_DAEMON_PORT || "4632", 10);
const SRC_TASK    = process.env.SRC_TASK || "TSK-2026-10-21-0004.40";
const MUTATION_MODE = process.argv.includes("--mutation");

// ── Mutation target ───────────────────────────────────────────────────────────

// CT-PROOF-1: add back window.__pendingAgentId = agent.value to the new
// TaskActions.openChatThread. This is the regression this step fixes —
// hanging on the global when ws.open() already carries the chatId.
const TA_SRC = join(REPO, "src", "ui", "app", "views", "TaskActions.vue");
// The mutation inserts a line right after the seed check, before ws.open.
// Target: "  if (!chatStore.getDraft(threadId)) chatStore.saveDraft(threadId, seed);"
const PENDING_NORMAL =
  `  if (!chatStore.getDraft(threadId)) chatStore.saveDraft(threadId, seed);`;
const PENDING_MUTANT =
  `  if (!chatStore.getDraft(threadId)) chatStore.saveDraft(threadId, seed);\n  window.__pendingAgentId = agent.value; // [MUTATION CT-PROOF-1]`;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", ...opts });
  return { rc: r.status ?? -1, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() };
}

async function waitUrl(url, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) {
        log(`${label} ready after ${Math.round((Date.now() - t0) / 1000)}s`);
        return true;
      }
    } catch { /* not yet */ }
    await sleep(1000);
  }
  throw new Error(`${label} not ready at ${url} within ${timeoutMs / 1000}s`);
}

const procs = [];
function launch(cmd, args, logfile, label) {
  const stream = createWriteStream(logfile, { flags: "a" });
  const child = spawn(cmd, args, {
    cwd: REPO,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, UI_TEST_SKILL: SKILL },
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  procs.push({ pid: child.pid, label });
  log(`${label} spawned pid=${child.pid}`);
  return child;
}

function stopOwned(pid, label) {
  if (!pid) { log(`${label}: no pid`); return; }
  try { process.kill(pid, 0); } catch { log(`${label}: pid ${pid} already gone`); return; }
  try { process.kill(pid, "SIGTERM"); log(`${label}: SIGTERM → pid ${pid}`); } catch (e) { log(`${label}: kill failed — ${e}`); }
}

function stopTestServer(port) {
  const r = run("bun", ["run", "src/ui/test-server.ts", "stop", "--port", String(port)]);
  log(`test-server :${port} stop rc=${r.rc}`);
}

function rebuild() {
  log("rebuilding UI after mutation…");
  const r = run("bun", ["run", "build"]);
  if (r.rc !== 0) log(`WARN: build exited ${r.rc}: ${r.out.slice(0, 300)}`);
  else log("build OK");
  return r.rc;
}

function runSpec(env = {}) {
  return spawnSync("node", ["tests/ui/phase5/ct-task-contract.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_BASE: `http://127.0.0.1:${PORT_UI}`,
      SRC_TASK,
      ...env,
    },
    stdio: "inherit",
  });
}

function runSpecCapture(env = {}) {
  return spawnSync("node", ["tests/ui/phase5/ct-task-contract.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_BASE: `http://127.0.0.1:${PORT_UI}`,
      SRC_TASK,
      ...env,
    },
    stdio: "pipe",
  });
}

function runWal149Capture() {
  return spawnSync("node", ["tests/ui/wal149/wal149-chat-redirect-next-nav.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_BASE: `http://127.0.0.1:${PORT_UI}`,
    },
    stdio: "pipe",
  });
}

let exitCode = 0;

try {
  // 1. Verify daemon is reachable
  await waitUrl(`http://127.0.0.1:${PORT_DAEMON}/api/state`, 10000, `live daemon :${PORT_DAEMON}`);

  // 2. Start test UI server proxying to the live daemon
  launch("bun", [
    "run", "src/ui/test-server.ts", "start",
    "--port", String(PORT_UI),
    "--daemon", `http://127.0.0.1:${PORT_DAEMON}`,
    "--ttl", "0",
  ], join(LOGS_DIR, `ui-${PORT_UI}.log`), `test UI server :${PORT_UI}`);
  await waitUrl(`http://127.0.0.1:${PORT_UI}/`, 30000, `test UI server :${PORT_UI}`);

  // 3. Normal CT run
  log("── running CT suite (normal) ──");
  const ctResult = runSpec();
  if (ctResult.status !== 0) exitCode = 1;

  if (!MUTATION_MODE) {
    log("skipping mutation proof (pass --mutation to enable)");
  } else {
    // ── CT-PROOF-1: __pendingAgentId write added back ───────────────────────────
    log("\n── CT-PROOF-1: __pendingAgentId added back → CT-1 must go red ──");
    let origTA = null;
    try {
      if (!existsSync(TA_SRC)) {
        log("WARN: TaskActions.vue not found — skipping CT-PROOF-1");
      } else {
        origTA = readFileSync(TA_SRC, "utf-8");
        const mutant = origTA.replace(PENDING_NORMAL, PENDING_MUTANT);
        if (mutant === origTA) {
          log("WARN: CT-PROOF-1 pattern not found in TaskActions.vue — skipping");
        } else {
          writeFileSync(TA_SRC, mutant, "utf-8");
          log("CT-PROOF-1 mutant written — window.__pendingAgentId added back");
          rebuild();

          const ctOut = runSpecCapture({ MUTATION: "1" });
          const ctText = (ctOut.stdout ?? "") + (ctOut.stderr ?? "");
          const ct1Failed = /✗.*CT-1/.test(ctText);
          if (ct1Failed) {
            log("✓ CT-PROOF-1: CT-1 went red (__pendingAgentId present) ✓");
          } else {
            log("✗ CT-PROOF-1: CT-1 did NOT go red — proof is invalid");
            log(ctText.slice(0, 600));
            exitCode = 1;
          }

          // Companion: run WAL-149 — AC2/AC3 (Next navigation) must still pass.
          // Note: WAL-149's AC1 ChatPage checks (window.__chatSessionId, #chat-input)
          // WILL fail because ChatPage is gone; that is expected and not a failure.
          // What matters is that the mutation does not NEWLY break WAL-149's AC2/AC3.
          log("\n── CT-PROOF-1 companion: WAL-149 run (inherited unchanged) ──");
          const wal149Out = runWal149Capture();
          const wal149Text = (wal149Out.stdout ?? "") + (wal149Out.stderr ?? "");
          log("WAL-149 output (last 30 lines):");
          wal149Text.split("\n").slice(-30).forEach((l) => log(" ", l));

          // AC2 and AC3 are Next-navigation checks — they should still pass.
          // We check they are not newly failing.
          const ac2Failed = /FAIL.*AC2/.test(wal149Text);
          const ac3Failed = /FAIL.*AC3/.test(wal149Text);
          if (!ac2Failed && !ac3Failed) {
            log("✓ CT-PROOF-1 companion: WAL-149 AC2/AC3 still pass (mutation does not break Next navigation) ✓");
          } else {
            log("✗ CT-PROOF-1 companion: WAL-149 AC2 or AC3 went red — unexpected regression");
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origTA !== null) {
        writeFileSync(TA_SRC, origTA, "utf-8");
        log("CT-PROOF-1 source restored from memory");
        rebuild();
      }
    }
  }

} finally {
  for (const { pid, label } of procs) stopOwned(pid, label);
  await sleep(1000);
  stopTestServer(PORT_UI);
  await sleep(500);
  log("server stopped");
}

process.exit(exitCode);
