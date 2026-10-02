#!/usr/bin/env node
// scratch-daemon.mjs — start/stop a scratch Caravel daemon for Phase 3 specs.
//
// The daemon runs from the given checkout (--src) with cwd set to the fixture
// workspace (--ws-dir). CARAVEL_MULTI_AGENT_RUNNER is unset so the runner
// never starts and open/ envelopes in the fixture workspace are never claimed.
// The web port comes from the fixture workspace's .caravel/settings.json.
//
// Usage:
//   node tests/ui/phase3/scratch-daemon.mjs start \
//     --src /path/to/repos/caravel/src/index.ts \
//     --ws-dir tests/ui/phase3/fixture-ws \
//     --port 4636
//
//   node tests/ui/phase3/scratch-daemon.mjs stop --port 4636
//
// Stop is always by PID — never pkill, never killall.
// See .claude/rules/daemon-restart.md.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const command = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "start";
const PORT = Number(flag("port", "4636"));
const WS_DIR = flag("ws-dir", join(__dirname, "fixture-ws"));
const SRC = flag("src", null);
const PIDFILE = join(__dirname, `.scratch-daemon-${PORT}.pid`);

async function waitReady(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return true;
    } catch {
      // not yet ready
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Scratch daemon on :${port} did not become ready within ${timeoutMs}ms`);
}

function stop() {
  if (!existsSync(PIDFILE)) {
    console.log(`No scratch daemon pidfile for port ${PORT} (${PIDFILE}).`);
    process.exit(0);
  }
  const pid = Number(readFileSync(PIDFILE, "utf8").trim());
  if (!pid) {
    console.log(`Empty pidfile — removing.`);
    unlinkSync(PIDFILE);
    process.exit(0);
  }
  try {
    process.kill(pid, 0); // liveness check only
  } catch {
    console.log(`PID ${pid} is not running — removing stale pidfile.`);
    unlinkSync(PIDFILE);
    process.exit(0);
  }
  process.kill(pid, "SIGTERM");
  unlinkSync(PIDFILE);
  console.log(`Stopped scratch daemon PID ${pid} on :${PORT}.`);
  process.exit(0);
}

async function start() {
  if (!SRC) {
    console.error("--src is required: path to repos/caravel/src/index.ts");
    process.exit(1);
  }
  const srcAbs = resolve(process.cwd(), SRC);
  if (!existsSync(srcAbs)) {
    console.error(`--src not found: ${srcAbs}`);
    process.exit(1);
  }
  const wsAbs = resolve(process.cwd(), WS_DIR);
  if (!existsSync(wsAbs)) {
    console.error(`--ws-dir not found: ${wsAbs}`);
    process.exit(1);
  }

  // Update the fixture workspace settings.json with the requested port.
  const settingsPath = join(wsAbs, ".caravel", "settings.json");
  const settings = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, "utf8"))
    : {};
  settings.web = { ...settings.web, enabled: true, host: "127.0.0.1", port: PORT };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  console.log(`Starting scratch daemon from ${srcAbs}`);
  console.log(`  Workspace: ${wsAbs}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Runner: disabled (CARAVEL_MULTI_AGENT_RUNNER unset)`);

  const env = { ...process.env };
  // Ensure the runner never starts.
  delete env.CARAVEL_MULTI_AGENT_RUNNER;
  delete env.CLAUDECLAW_MULTI_AGENT_RUNNER;

  const child = spawn("bun", ["run", srcAbs, "start", "--web", "--web-port", String(PORT)], {
    cwd: wsAbs,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  child.stdout.on("data", (d) => process.stdout.write(`[scratch] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[scratch] ${d}`));

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Scratch daemon exited with code ${code}`);
    }
  });

  writeFileSync(PIDFILE, String(child.pid));
  child.unref();

  console.log(`Scratch daemon started (PID ${child.pid}), waiting for :${PORT}...`);
  await waitReady(PORT);
  console.log(`Ready: CARAVEL_BASE=http://127.0.0.1:${PORT}`);
  console.log(`PID ${child.pid} written to ${PIDFILE}`);
  console.log(`To stop: node ${import.meta.url.replace("file://", "")} stop --port ${PORT}`);
}

if (command === "stop") {
  stop();
} else if (command === "start") {
  start().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}. Use start or stop.`);
  process.exit(1);
}
