#!/usr/bin/env node
// run-cl.mjs — Phase 5 step 4: CL suite runner
//
// Starts the scratch fixture daemon on :4661, a test UI server on :4662
// (proxied to the fixture daemon), runs the CL suite, and optionally the
// three mutation proofs.
// Stops both servers in finally — even on crash.
//
// Usage:
//   cd repos/caravel && node tests/ui/phase5/run-cl.mjs
//   cd repos/caravel && node tests/ui/phase5/run-cl.mjs --mutation
//
// Mutation proofs:
//   CL-PROOF-1 (scroll guard): removes the atBottom guard from ChatMessageList.vue →
//     CL-b (scroll hold) goes red.
//   CL-PROOF-2 (chunk hook): removes __vmOnAssistantChunk call from stores/chat.ts →
//     CL-c1 goes red.
//   CL-PROOF-3 (raText): removes ui.raText write from ChatView.vue →
//     CL-c2 goes red.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = realpathSync(resolve(__dirname, "..", "..", ".."));
if (!existsSync(join(REPO, "package.json")) || !existsSync(join(REPO, "src", "ui"))) {
  console.error(`run-cl: refusing to run — ${REPO} is not the caravel repo`);
  process.exit(2);
}

const WS = "/home/walter/workspace";
const SKILL = join(WS, ".claude", "skills", "ui-test");
const LOGS_DIR = join(REPO, "tests", "ui", "phase5", ".runs", "cl-live-scroll-voice");
mkdirSync(LOGS_DIR, { recursive: true });

const PORT_DAEMON = 4661;
const PORT_UI = 4662;
const MUTATION_MODE = process.argv.includes("--mutation");

// ── Mutation targets ──────────────────────────────────────────────────────────

// CL-PROOF-1: ChatMessageList.vue — the atBottom guard in the scroll watch.
// The watch only calls scrollToBottom when atBottom is true. Remove that guard
// and the scroll ALWAYS moves to the bottom on any new message, so a user
// scrolled to the top sees their position yanked — CL-b goes red.
const MSG_LIST_SRC = join(REPO, "src", "ui", "app", "components", "chat", "ChatMessageList.vue");
const SCROLL_GUARD_LINE   = `  if (newLen > (oldLen ?? 0) && atBottom.value) {`;
const SCROLL_GUARD_MUTANT = `  if (newLen > (oldLen ?? 0) /* && atBottom.value — [MUTATION CL-PROOF-1: guard removed] */) {`;

// CL-PROOF-2: stores/chat.ts — the __vmOnAssistantChunk call in patchMessages.
const CHAT_STORE_SRC = join(REPO, "src", "ui", "app", "stores", "chat.ts");
const CHUNK_HOOK_LINE   = `        window.__vmOnAssistantChunk?.(lastChangedAssistant.text, done);`;
const CHUNK_HOOK_MUTANT = `        // [MUTATION CL-PROOF-2: __vmOnAssistantChunk removed] // window.__vmOnAssistantChunk?.(lastChangedAssistant.text, done);`;

// CL-PROOF-3: ChatView.vue — the ui.raText write in updateRaText.
const CHAT_VIEW_SRC = join(REPO, "src", "ui", "app", "views", "ChatView.vue");
const RATEXT_LINE   = `  ui.raText = lastDone?.text ?? null;`;
const RATEXT_MUTANT = `  // [MUTATION CL-PROOF-3: raText write removed] // ui.raText = lastDone?.text ?? null;`;

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

function stopDaemon(port) {
  const r = run("node", ["tests/ui/phase3/scratch-daemon.mjs", "stop", "--port", String(port)]);
  log(`scratch-daemon :${port} stop rc=${r.rc}`);
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
  return spawnSync("node", ["tests/ui/phase5/cl-live-scroll-voice.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
      ...env,
    },
    stdio: "inherit",
  });
}

function runSpecCapture(env = {}) {
  return spawnSync("node", ["tests/ui/phase5/cl-live-scroll-voice.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
      ...env,
    },
    stdio: "pipe",
  });
}

let exitCode = 0;

try {
  // 1. Start fixture daemon.
  launch("node", [
    "tests/ui/phase3/scratch-daemon.mjs", "start",
    "--src", "src/index.ts",
    "--ws-dir", "tests/ui/phase3/fixture-ws",
    "--port", String(PORT_DAEMON),
  ], join(LOGS_DIR, `daemon-${PORT_DAEMON}.log`), `fixture daemon :${PORT_DAEMON}`);
  await waitUrl(`http://127.0.0.1:${PORT_DAEMON}/api/state`, 45000, `fixture daemon :${PORT_DAEMON}`);

  // 2. Start test UI server.
  launch("bun", [
    "run", "src/ui/test-server.ts", "start",
    "--port", String(PORT_UI),
    "--daemon", `http://127.0.0.1:${PORT_DAEMON}`,
    "--ttl", "0",
  ], join(LOGS_DIR, `ui-${PORT_UI}.log`), `test UI server :${PORT_UI}`);
  await waitUrl(`http://127.0.0.1:${PORT_UI}/`, 30000, `test UI server :${PORT_UI}`);

  // 3. Normal CL run.
  log("── running CL suite (normal) ──");
  const clResult = runSpec();
  if (clResult.status !== 0) exitCode = 1;

  if (!MUTATION_MODE) {
    log("skipping mutation proofs (pass --mutation to enable)");
  } else {
    // ── CL-PROOF-1: scroll guard ────────────────────────────────────────────────
    log("\n── CL-PROOF-1: scroll guard removed → CL-b must go red ──");
    let origMsgList = null;
    try {
      if (!existsSync(MSG_LIST_SRC)) {
        log("WARN: ChatMessageList.vue not found — skipping CL-PROOF-1");
      } else {
        origMsgList = readFileSync(MSG_LIST_SRC, "utf-8");
        const mutant = origMsgList.replace(SCROLL_GUARD_LINE, SCROLL_GUARD_MUTANT);
        if (mutant === origMsgList) {
          log("WARN: CL-PROOF-1 pattern not found in ChatMessageList.vue — skipping");
        } else {
          writeFileSync(MSG_LIST_SRC, mutant, "utf-8");
          log("CL-PROOF-1 mutant written — atBottom guard removed");
          rebuild();

          const out1 = runSpecCapture({ MUTATION: "1" });
          const text1 = (out1.stdout ?? "") + (out1.stderr ?? "");
          const clbFailed = /✗.*CL-b/.test(text1);
          if (clbFailed) {
            log("✓ CL-PROOF-1: CL-b went red (removed atBottom guard → scroll jumps) ✓");
          } else {
            log("✗ CL-PROOF-1: CL-b did NOT go red — proof is invalid");
            log(text1.slice(0, 600));
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origMsgList !== null) {
        writeFileSync(MSG_LIST_SRC, origMsgList, "utf-8");
        log("CL-PROOF-1 source restored from memory");
        rebuild();
      }
    }

    // ── CL-PROOF-2: __vmOnAssistantChunk removed ────────────────────────────────
    log("\n── CL-PROOF-2: __vmOnAssistantChunk removed → CL-c1 must go red ──");
    let origChatStore = null;
    try {
      if (!existsSync(CHAT_STORE_SRC)) {
        log("WARN: stores/chat.ts not found — skipping CL-PROOF-2");
      } else {
        origChatStore = readFileSync(CHAT_STORE_SRC, "utf-8");
        const mutant = origChatStore.replace(CHUNK_HOOK_LINE, CHUNK_HOOK_MUTANT);
        if (mutant === origChatStore) {
          log("WARN: CL-PROOF-2 pattern not found in stores/chat.ts — skipping");
        } else {
          writeFileSync(CHAT_STORE_SRC, mutant, "utf-8");
          log("CL-PROOF-2 mutant written — __vmOnAssistantChunk removed from patchMessages");
          rebuild();

          const out2 = runSpecCapture({ MUTATION: "1" });
          const text2 = (out2.stdout ?? "") + (out2.stderr ?? "");
          const clc1Failed = /✗.*CL-c1/.test(text2);
          if (clc1Failed) {
            log("✓ CL-PROOF-2: CL-c1 went red (removed chunk hook → spy not fired) ✓");
          } else {
            log("✗ CL-PROOF-2: CL-c1 did NOT go red — proof is invalid");
            log(text2.slice(0, 600));
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origChatStore !== null) {
        writeFileSync(CHAT_STORE_SRC, origChatStore, "utf-8");
        log("CL-PROOF-2 source restored from memory");
        rebuild();
      }
    }

    // ── CL-PROOF-3: ui.raText write removed ────────────────────────────────────
    log("\n── CL-PROOF-3: ui.raText write removed → CL-c2 must go red ──");
    let origChatView = null;
    try {
      if (!existsSync(CHAT_VIEW_SRC)) {
        log("WARN: ChatView.vue not found — skipping CL-PROOF-3");
      } else {
        origChatView = readFileSync(CHAT_VIEW_SRC, "utf-8");
        const mutant = origChatView.replace(RATEXT_LINE, RATEXT_MUTANT);
        if (mutant === origChatView) {
          log("WARN: CL-PROOF-3 pattern not found in ChatView.vue — skipping");
        } else {
          writeFileSync(CHAT_VIEW_SRC, mutant, "utf-8");
          log("CL-PROOF-3 mutant written — ui.raText write removed from updateRaText");
          rebuild();

          const out3 = runSpecCapture({ MUTATION: "1" });
          const text3 = (out3.stdout ?? "") + (out3.stderr ?? "");
          const clc2Failed = /✗.*CL-c2/.test(text3);
          if (clc2Failed) {
            log("✓ CL-PROOF-3: CL-c2 went red (removed raText write → speaker disabled) ✓");
          } else {
            log("✗ CL-PROOF-3: CL-c2 did NOT go red — proof is invalid");
            log(text3.slice(0, 600));
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origChatView !== null) {
        writeFileSync(CHAT_VIEW_SRC, origChatView, "utf-8");
        log("CL-PROOF-3 source restored from memory");
        rebuild();
      }
    }
  }

} finally {
  for (const { pid, label } of procs) stopOwned(pid, label);
  await sleep(1000);
  stopTestServer(PORT_UI);
  stopDaemon(PORT_DAEMON);
  await sleep(500);
  log("servers stopped");
}

process.exit(exitCode);
