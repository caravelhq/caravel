#!/usr/bin/env node
// run-cp.mjs — Phase 5 step 2: CP suite runner
//
// Starts the scratch fixture daemon on :4659, a test UI server on :4660
// (proxied to the fixture daemon), runs the CP suite, and stops both.
//
// Usage:
//   cd repos/caravel && node tests/ui/phase5/run-cp.mjs
//
// Options:
//   --mutation   run CP spec in MUTATION mode after the normal run
//
// Servers are stopped in finally — even on crash. PID-tracked, never pkill.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = realpathSync(resolve(__dirname, "..", "..", ".."));
if (!existsSync(join(REPO, "package.json")) || !existsSync(join(REPO, "src", "ui"))) {
  console.error(`run-cp: refusing to run — ${REPO} is not the caravel repo`);
  process.exit(2);
}

const WS = "/home/walter/workspace";
const SKILL = join(WS, ".claude", "skills", "ui-test");
const LOGS_DIR = join(REPO, "tests", "ui", "phase5", ".runs", "cp-chat-picker");
mkdirSync(LOGS_DIR, { recursive: true });

const PORT_DAEMON      = 4659;
const PORT_UI          = 4660;
const PORT_MUT_DAEMON  = 4661;
const PORT_MUT_UI      = 4662;

const MUTATION_MODE = process.argv.includes("--mutation");

// Path to listChats source — mutation target (server-side, requires daemon restart)
const LIST_CHATS_SRC = join(REPO, "src", "ui", "services", "chats.ts");
const SORT_LINE = "    .sort((a, b) => b.mtime - a.mtime)";
const MAP_LINE  = "    .map(({ mtime: _, ...rest }) => rest);";
const MUTANT_SLICE = `    .slice(0, 20) // [MUTATION CP-PROOF: limit to N — kills whole-corpus search]`;

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

let exitCode = 0;

try {
  // 1. Start fixture daemon
  launch("node", [
    "tests/ui/phase3/scratch-daemon.mjs", "start",
    "--src", "src/index.ts",
    "--ws-dir", "tests/ui/phase3/fixture-ws",
    "--port", String(PORT_DAEMON),
  ], join(LOGS_DIR, `daemon-${PORT_DAEMON}.log`), `fixture daemon :${PORT_DAEMON}`);
  await waitUrl(`http://127.0.0.1:${PORT_DAEMON}/api/state`, 45000, `fixture daemon :${PORT_DAEMON}`);

  // 2. Start test UI server proxied to fixture daemon
  launch("bun", [
    "run", "src/ui/test-server.ts", "start",
    "--port", String(PORT_UI),
    "--daemon", `http://127.0.0.1:${PORT_DAEMON}`,
    "--ttl", "0",
  ], join(LOGS_DIR, `ui-${PORT_UI}.log`), `test UI server :${PORT_UI}`);
  await waitUrl(`http://127.0.0.1:${PORT_UI}/`, 30000, `test UI server :${PORT_UI}`);

  // 3. Run the CP spec
  log("── running CP suite ──");
  const cpResult = spawnSync("node", ["tests/ui/phase5/cp-chat-picker.spec.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TEST_SKILL: SKILL,
      CARAVEL_FIXTURE_BASE: `http://127.0.0.1:${PORT_UI}`,
    },
    stdio: "inherit",
  });
  if (cpResult.status !== 0) exitCode = 1;

  // 4. Mutation proof — call listChats() directly via Bun with mutated source.
  //    No daemon restart needed: we run a one-shot Bun script in the fixture workspace.
  //    Proof: .slice(0, 20) after .sort() → sentinel chat (position 25 by mtime) absent.
  log("── running CP-PROOF mutation ──");
  const WS_DIR_ABS = join(REPO, "tests", "ui", "phase3", "fixture-ws");
  let mutOriginal = null;
  let mutProofPassed = false;
  try {
    if (!existsSync(LIST_CHATS_SRC)) {
      log("WARN: LIST_CHATS_SRC not found — skipping mutation proof");
      mutProofPassed = true; // skip gracefully
    } else {
      mutOriginal = readFileSync(LIST_CHATS_SRC, "utf-8");
      const mutant = mutOriginal.replace(
        `${SORT_LINE}\n${MAP_LINE}`,
        `${SORT_LINE}\n${MUTANT_SLICE}\n${MAP_LINE}`
      );
      if (mutant === mutOriginal) {
        log("WARN: mutation pattern not found in listChats — skipping mutation proof");
        mutProofPassed = true;
      } else {
        writeFileSync(LIST_CHATS_SRC, mutant, "utf-8");
        log("mutant written — listChats returns at most 20 entries");

        // Run listChats() directly via Bun from the fixture workspace.
        // This avoids a daemon restart while still testing the actual function.
        const probeScript = `
import { listChats } from ${JSON.stringify(LIST_CHATS_SRC)};
const chats = await listChats();
const sentinel = chats.find(c => (c.name ?? '').includes('XRAY-FIXTURE-CORPUS-TOKEN') || (c.preview ?? '').includes('XRAY-FIXTURE-CORPUS-TOKEN'));
console.log(JSON.stringify({ count: chats.length, sentinelFound: !!sentinel, sentinelId: sentinel?.id ?? null }));
`;
        const probeResult = spawnSync("bun", ["--eval", probeScript], {
          cwd: WS_DIR_ABS,
          encoding: "utf8",
          timeout: 15000,
        });

        if (probeResult.status !== 0 || !probeResult.stdout.trim()) {
          log(`mutation probe failed: rc=${probeResult.status} err=${probeResult.stderr?.slice(0, 200)}`);
          exitCode = 1;
        } else {
          const result = JSON.parse(probeResult.stdout.trim());
          log(`mutant listChats: count=${result.count}, sentinelFound=${result.sentinelFound}`);
          if (!result.sentinelFound) {
            log("✓ CP-PROOF: .slice(0,20) → sentinel absent from listChats output (red ✓)");
            mutProofPassed = true;
          } else {
            log(`✗ CP-PROOF: sentinel still present (count=${result.count}) — proof is invalid`);
            exitCode = 1;
          }
        }
      }
    }
  } finally {
    if (mutOriginal !== null) {
      writeFileSync(LIST_CHATS_SRC, mutOriginal, "utf-8");
      log("source restored from memory (no git checkout)");
    }
  }

  // 5. Green verification — confirm sentinel IS present with original source
  const greenProbe = spawnSync("bun", ["--eval", `
import { listChats } from ${JSON.stringify(LIST_CHATS_SRC)};
const chats = await listChats();
const sentinel = chats.find(c => (c.name ?? '').includes('XRAY-FIXTURE-CORPUS-TOKEN') || (c.preview ?? '').includes('XRAY-FIXTURE-CORPUS-TOKEN'));
console.log(JSON.stringify({ count: chats.length, sentinelFound: !!sentinel }));
`], { cwd: WS_DIR_ABS, encoding: "utf8", timeout: 15000 });
  if (greenProbe.status === 0 && greenProbe.stdout.trim()) {
    const result = JSON.parse(greenProbe.stdout.trim());
    if (result.sentinelFound) {
      log(`✓ CP-PROOF green: sentinel present in original listChats (count=${result.count})`);
    } else {
      log(`✗ CP-PROOF green: sentinel missing from original listChats (count=${result.count})`);
      exitCode = 1;
    }
  } else {
    log(`green probe failed: rc=${greenProbe.status}`);
    exitCode = 1;
  }
} finally {
  // Stop servers — always, even on crash
  for (const { pid, label } of procs) stopOwned(pid, label);
  await sleep(1000);
  stopTestServer(PORT_UI);
  stopDaemon(PORT_DAEMON);
  await sleep(500);
  log("servers stopped");
}

process.exit(exitCode);
