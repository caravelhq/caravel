#!/usr/bin/env node
// run-cv.mjs — Phase 5 step 3: CV suite runner
//
// Starts the scratch fixture daemon on :4659, a test UI server on :4660
// (proxied to the fixture daemon), runs the CV suite, and the two mutation proofs.
// Stops both servers in finally — even on crash.
//
// Usage:
//   cd repos/caravel && node tests/ui/phase5/run-cv.mjs
//
// Options:
//   --mutation   run mutation proofs after the normal CV run
//
// Mutation proofs:
//   CV-PROOF-1 (draft): removes emit("update:draft") from ChatComposer.onInput →
//     draft assertion goes red.
//   CV-PROOF-2 (scroll): removes scroll-compensation line from ChatMessageList.loadEarlier →
//     scroll-jump assertion goes red.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = realpathSync(resolve(__dirname, "..", "..", ".."));
if (!existsSync(join(REPO, "package.json")) || !existsSync(join(REPO, "src", "ui"))) {
  console.error(`run-cv: refusing to run — ${REPO} is not the caravel repo`);
  process.exit(2);
}

const WS = "/home/walter/workspace";
const SKILL = join(WS, ".claude", "skills", "ui-test");
const LOGS_DIR = join(REPO, "tests", "ui", "phase5", ".runs", "cv-chat-view");
mkdirSync(LOGS_DIR, { recursive: true });

const PORT_DAEMON = 4659;
const PORT_UI = 4660;

const MUTATION_MODE = process.argv.includes("--mutation");

// ── Mutation targets ──────────────────────────────────────────────────────────

// CV-PROOF-1: ChatComposer.vue — emit("update:draft", el.value) line.
const COMPOSER_SRC = join(REPO, "src", "ui", "app", "components", "chat", "ChatComposer.vue");
// The exact line to mutate (comment it out).
const DRAFT_EMIT_LINE  = `  emit("update:draft", el.value);`;
const DRAFT_EMIT_MUTANT = `  // [MUTATION CV-PROOF-1: draft emit removed] // emit("update:draft", el.value);`;

// CV-PROOF-2: ChatMessageList.vue — scroll compensation line.
const MSG_LIST_SRC = join(REPO, "src", "ui", "app", "components", "chat", "ChatMessageList.vue");
const SCROLL_COMP_LINE  = `  el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);`;
const SCROLL_COMP_MUTANT = `  // [MUTATION CV-PROOF-2: scroll compensation removed] // el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);`;

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

// Run a single build (required when source files are mutated).
function rebuild() {
  log("rebuilding UI after mutation…");
  const r = run("bun", ["run", "build"], {});
  if (r.rc !== 0) log(`WARN: build exited ${r.rc}: ${r.out.slice(0, 300)}`);
  else log("build OK");
  return r.rc;
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

  // 3. Normal CV suite run.
  log("── running CV suite (normal) ──");
  const cvResult = spawnSync("node", ["tests/ui/phase5/cv-chat-view.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
    },
    stdio: "inherit",
  });
  if (cvResult.status !== 0) exitCode = 1;

  if (!MUTATION_MODE) {
    log("skipping mutation proofs (pass --mutation to enable)");
  } else {
    // ── CV-PROOF-1: Draft proof ─────────────────────────────────────────────────
    log("\n── CV-PROOF-1: draft proof ──");
    let origComposer = null;
    try {
      if (!existsSync(COMPOSER_SRC)) {
        log("WARN: ChatComposer.vue not found — skipping CV-PROOF-1");
      } else {
        origComposer = readFileSync(COMPOSER_SRC, "utf-8");
        const mutant = origComposer.replace(DRAFT_EMIT_LINE, DRAFT_EMIT_MUTANT);
        if (mutant === origComposer) {
          log("WARN: CV-PROOF-1 mutation pattern not found in ChatComposer.vue — skipping");
        } else {
          writeFileSync(COMPOSER_SRC, mutant, "utf-8");
          log("CV-PROOF-1 mutant written — emit('update:draft') removed");
          rebuild();

          const proof1Result = spawnSync("node", ["tests/ui/phase5/cv-chat-view.spec.mjs"], {
            cwd: REPO,
            encoding: "utf8",
            env: {
              ...process.env,
              UI_TEST_SKILL: SKILL,
              CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
              MUTATION: "1",
            },
            stdio: "pipe",
          });
          const out1 = proof1Result.stdout + proof1Result.stderr;
          const cv4Failed = /✗.*CV-4/.test(out1);
          if (cv4Failed) {
            log("✓ CV-PROOF-1: draft assertion went red (remove emit('update:draft') → CV-4 fails) ✓");
          } else {
            log("✗ CV-PROOF-1: draft assertion did NOT go red — proof is invalid");
            log(out1.slice(0, 500));
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origComposer !== null) {
        writeFileSync(COMPOSER_SRC, origComposer, "utf-8");
        log("CV-PROOF-1 source restored from memory");
        rebuild();
      }
    }

    // ── CV-PROOF-2: Scroll compensation proof ──────────────────────────────────
    log("\n── CV-PROOF-2: scroll compensation proof ──");
    let origMsgList = null;
    try {
      if (!existsSync(MSG_LIST_SRC)) {
        log("WARN: ChatMessageList.vue not found — skipping CV-PROOF-2");
      } else {
        origMsgList = readFileSync(MSG_LIST_SRC, "utf-8");
        const mutant = origMsgList.replace(SCROLL_COMP_LINE, SCROLL_COMP_MUTANT);
        if (mutant === origMsgList) {
          log("WARN: CV-PROOF-2 mutation pattern not found in ChatMessageList.vue — skipping");
        } else {
          writeFileSync(MSG_LIST_SRC, mutant, "utf-8");
          log("CV-PROOF-2 mutant written — scroll compensation removed");
          rebuild();

          const proof2Result = spawnSync("node", ["tests/ui/phase5/cv-chat-view.spec.mjs"], {
            cwd: REPO,
            encoding: "utf8",
            env: {
              ...process.env,
              UI_TEST_SKILL: SKILL,
              CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
              MUTATION: "1",
            },
            stdio: "pipe",
          });
          const out2 = proof2Result.stdout + proof2Result.stderr;
          const cv7Failed = /✗.*CV-7/.test(out2);
          if (cv7Failed) {
            log("✓ CV-PROOF-2: scroll-jump assertion went red (remove compensation → CV-7 fails) ✓");
          } else {
            log("✗ CV-PROOF-2: scroll-jump assertion did NOT go red — proof is invalid");
            log(out2.slice(0, 500));
            exitCode = 1;
          }
        }
      }
    } finally {
      if (origMsgList !== null) {
        writeFileSync(MSG_LIST_SRC, origMsgList, "utf-8");
        log("CV-PROOF-2 source restored from memory");
        rebuild();
      }
    }
  }
} finally {
  // Stop servers — always.
  for (const { pid, label } of procs) stopOwned(pid, label);
  await sleep(1000);
  stopTestServer(PORT_UI);
  stopDaemon(PORT_DAEMON);
  await sleep(500);
  log("servers stopped");
}

process.exit(exitCode);
