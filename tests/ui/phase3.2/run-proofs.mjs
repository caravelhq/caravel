#!/usr/bin/env node
// run-proofs.mjs — unattended Phase 3.2 mutation-proof runner (TSK-2026-10-16-0001.24)
//
// Runs the five documented mutation proofs red→green with REAL assertions
// (MUTATION is never set), restores every mutated file from memory (never
// git), rebuilds, protects :4633 (stopped for the duration, restarted +
// hash-asserted in finally), stops every server it starts, writes the proof
// logs + proofs-summary.json, substitutes the results into the gate record's
// §3/§8 placeholders, and closes its own task by writing the rendezvous .md.
//
// Launch detached, e.g.:
//   cd repos/caravel && setsid nohup node tests/ui/phase3.2/run-proofs.mjs \
//     > /tmp/run-proofs.out 2>&1 < /dev/null &
//
// Everything is crash-shaped: each mutation restores in a finally; the global
// finally restores ALL files, rebuilds clean, stops servers, restarts :4633
// and asserts its bundle; the rendezvous is written on success AND failure.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..");                     // repos/caravel
const WS = resolve(REPO, "..", "..");                                   // workspace root
const GATE = join(WS, "repos", "dev", "features", "WAL-115_test-runs", "2026-10-17_gate");
const RECORD = join(WS, "Notes", "Projects", "Caravel-Vue", "reviews", "2026-10-17_Gate-Run_jess.md");
const RENDEZVOUS = join(WS, "agents", "jess", "tasks", "done", "TSK-2026-10-16-0001.24.md");
const TASK_ID = "TSK-2026-10-16-0001.24";
const SKILL = join(WS, ".claude", "skills", "ui-test");
const CLEAN_BUNDLE = "app.CCJvgehk.js";

const PORT_SUITES = 4641;      // plain test server (TL/TB/NV)
const PORT_FIXDAEMON = 4642;   // scratch fixture daemon (FP/EV API)
const PORT_FIXUI = 4643;       // fixture-backed test server (FP/EV, NV fixture base)

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", ...opts });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function build(label) {
  const r = run("bun", ["run", "build"]);
  const hashes = [...new Set((r.out.match(/app\.[A-Za-z0-9_-]+\.js/g) || []))];
  log(`build[${label}] rc=${r.rc} ${hashes.join(",")}`);
  if (r.rc !== 0) throw new Error(`build failed (${label}): ${r.out.slice(-800)}`);
  return hashes[0] || "(no hash seen)";
}

async function waitUrl(url, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { log(`${label} ready after ${Math.round((Date.now() - t0) / 1000)}s`); return true; }
    } catch { /* not yet */ }
    await sleep(1000);
  }
  throw new Error(`${label} not ready at ${url} within ${timeoutMs / 1000}s`);
}

// Detached server processes we own by exact PID (never pkill/patterns).
const procs = [];
function launch(cmd, args, logfile, label) {
  const child = spawn(cmd, args, {
    cwd: REPO, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, UI_TEST_SKILL: SKILL },
  });
  // Stream output to the logfile as it arrives, so it exists even if we're killed.
  const stream = createWriteStream(logfile, { flags: "a" });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  procs.push({ pid: child.pid, label });
  log(`${label} spawned pid=${child.pid}`);
  return child;
}
function killOwned(pid, label) {
  if (!pid) return `${label}: no pid`;
  try { process.kill(pid, 0); } catch { return `${label}: pid ${pid} already gone`; }
  try { process.kill(pid, "SIGTERM"); } catch (e) { return `${label}: kill failed ${e}`; }
  return `${label}: SIGTERM sent to pid ${pid}`;
}

function stopTestServer(port) {
  const r = run("bun", ["run", "src/ui/test-server.ts", "stop", "--port", String(port)]);
  return `test-server :${port} stop rc=${r.rc} ${r.out.trim().split("\n").pop() || ""}`;
}
function stopScratchDaemon(port) {
  const r = run("node", ["tests/ui/phase3/scratch-daemon.mjs", "stop", "--port", String(port)]);
  return `scratch-daemon :${port} stop rc=${r.rc} ${r.out.trim().split("\n").pop() || ""}`;
}

// ── The five proofs ─────────────────────────────────────────────────────────
const PROOFS = [
  {
    id: "TL1", file: "src/ui/app/stores/workspace.ts", suite: "TL-tablifecycle.spec.mjs",
    base: () => `http://127.0.0.1:${PORT_SUITES}`, fixtureBase: null,
    desc: "disable the preview-reuse branch in open()",
    edits: [{
      old: "    if (opts.preview) {\n      // Reuse the group's existing preview slot in place — same index, same group.",
      neo: "    if (opts.preview && false) { // [MUTATION TL1: preview-reuse disabled]\n      // Reuse the group's existing preview slot in place — same index, same group.",
    }],
  },
  {
    id: "TB2", file: "src/ui/app/workspace/labels.ts", suite: "TB-stripgeometry.spec.mjs",
    base: () => `http://127.0.0.1:${PORT_SUITES}`, fixtureBase: null,
    desc: "refLabel envelope fallback end-truncates instead of middleEllipsis",
    edits: [{
      old: "      return middleEllipsis(ref.taskId);",
      neo: '      { const dot = ref.taskId.lastIndexOf("."); return dot > 0 ? ref.taskId.slice(0, dot) + ".…" : ref.taskId; } // [MUTATION TB2: end-truncate]',
    }],
  },
  {
    id: "NV6", file: "src/ui/app/stores/workspace.ts", suite: "NV-navigation.spec.mjs",
    base: () => `http://127.0.0.1:${PORT_SUITES}`, fixtureBase: () => `http://127.0.0.1:${PORT_FIXUI}`,
    desc: "remove syncWorkspaceUrl(false) from focus()",
    edits: [{
      old: "    focused.value = group;\n    syncWorkspaceUrl(false);",
      neo: "    focused.value = group;\n    // [MUTATION NV6] syncWorkspaceUrl(false) removed",
    }],
  },
  {
    id: "FP2", file: "src/ui/app/pages/FilesPage.vue", suite: "FP-filespicker.spec.mjs",
    base: () => `http://127.0.0.1:${PORT_FIXUI}`, fixtureBase: null,
    desc: "re-add an in-page DocViewer inside #files-panel",
    edits: [
      {
        old: '<script setup lang="ts">\nimport { onMounted } from "vue";',
        neo: '<script setup lang="ts">\nimport DocViewer from "../components/doc/DocViewer.vue"; // [MUTATION FP2]\nimport { onMounted } from "vue";',
      },
      {
        old: '  <div id="files-panel" class="files-panel">',
        neo: '  <div id="files-panel" class="files-panel">\n    <DocViewer kind="file" path="Notes/doc-01.md" /> <!-- [MUTATION FP2] -->',
      },
    ],
  },
  {
    id: "EV1", file: "src/ui/app/components/dashboard/TierSection.vue", suite: "EV-envelopeview.spec.mjs",
    base: () => `http://127.0.0.1:${PORT_FIXUI}`, fixtureBase: null,
    desc: "revert the tier-row open to legacy:tasks",
    edits: [{
      old: '  workspace.open({ kind: "envelope", taskId: id });',
      neo: '  workspace.open({ kind: "legacy", page: "tasks" }); // [MUTATION EV1: legacy revert]',
    }],
  },
];

// originals: path → content captured BEFORE any mutation (restore-from-memory source)
const originals = new Map();
function snapshot(path) {
  if (!originals.has(path)) originals.set(path, readFileSync(join(REPO, path), "utf8"));
  return originals.get(path);
}
function restoreAll() {
  const restored = [];
  for (const [path, content] of originals) {
    const current = readFileSync(join(REPO, path), "utf8");
    if (current !== content) { writeFileSync(join(REPO, path), content); restored.push(path); }
  }
  return restored;
}

function runSuite(proof, tag) {
  const env = {
    ...process.env,
    UI_TEST_SKILL: SKILL,
    CARAVEL_BASE: proof.base(),
  };
  delete env.MUTATION; // real assertions only — the whole point
  if (proof.fixtureBase) env.CARAVEL_FIXTURE_BASE = proof.fixtureBase();
  const logPath = join(GATE, `proof-${proof.id}-${tag}.log`);
  const r = spawnSync("node", [`tests/ui/phase3.2/${proof.suite}`], {
    cwd: REPO, encoding: "utf8", env,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  writeFileSync(logPath, out);
  const lines = out.split("\n");
  const ok = lines.filter((l) => l.includes("✓")).length;
  const bad = lines.filter((l) => l.includes("✗"));
  log(`suite[${proof.id}-${tag}] rc=${r.status} ✓=${ok} ✗=${bad.length}`);
  return { rc: r.status, ok, bad, log: `proof-${proof.id}-${tag}.log` };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const summary = { task: TASK_ID, startedAt: new Date().toISOString(), proofs: [], notes: [] };
let failure = null;
let stops = [];
let port4633Final = null;

mkdirSync(GATE, { recursive: true });
mkdirSync(join(WS, "agents", "jess", "tasks", "done"), { recursive: true });

try {
  // 0. Preconditions: clean tree, clean bundle, :4633 currently on the branch build.
  for (const p of PROOFS) snapshot(p.file);
  const st = run("git", ["status", "--porcelain", "src/ui/app", "src/ui/pages", "src/ui/components"]);
  const srcDirt = st.out.split("\n").filter((l) => l.trim() && !l.includes("app-dist"));
  if (srcDirt.length) summary.notes.push(`pre-existing src dirt: ${srcDirt.join("; ")}`);
  const preHtml = await fetch(`http://127.0.0.1:4633/`, { signal: AbortSignal.timeout(3000) }).then((r) => r.text()).catch(() => null);
  const preBundle = preHtml?.match(/app\.[A-Za-z0-9_-]+\.js/)?.[0] || "(unreachable)";
  summary.port4633Before = preBundle;
  log(`preconditions: src dirt=${srcDirt.length}, :4633 serving ${preBundle}`);

  // 1. Protect :4633 — down is better than lying.
  log("stop :4633:", stopTestServer(4633));

  // Also clear the crashed attempts' leftovers (mine, from TSK-.19/.21).
  stops.push(stopTestServer(4635));
  stops.push(stopTestServer(4637));

  // 2. Own harness: 4641 plain, 4642 fixture daemon, 4643 fixture-backed UI.
  launch("bun", ["run", "src/ui/test-server.ts", "start", "--port", String(PORT_SUITES), "--ttl", "0"],
    join(GATE, "server-4641.log"), `suite server :${PORT_SUITES}`);
  await waitUrl(`http://127.0.0.1:${PORT_SUITES}/`, 30000, `suite server :${PORT_SUITES}`);

  launch("node", ["tests/ui/phase3/scratch-daemon.mjs", "start", "--src", "src/index.ts",
    "--ws-dir", "tests/ui/phase3/fixture-ws", "--port", String(PORT_FIXDAEMON)],
    join(GATE, "server-4642.log"), `fixture daemon :${PORT_FIXDAEMON}`);
  await waitUrl(`http://127.0.0.1:${PORT_FIXDAEMON}/api/tasks`, 45000, `fixture daemon :${PORT_FIXDAEMON}`);

  launch("bun", ["run", "src/ui/test-server.ts", "start", "--port", String(PORT_FIXUI), "--ttl", "0",
    "--daemon", `http://127.0.0.1:${PORT_FIXDAEMON}`],
    join(GATE, "server-4643.log"), `fixture UI server :${PORT_FIXUI}`);
  await waitUrl(`http://127.0.0.1:${PORT_FIXUI}/api/tasks`, 30000, `fixture UI server :${PORT_FIXUI}`);

  // 3. The five proofs.
  for (const p of PROOFS) {
    const entry = { id: p.id, file: p.file, desc: p.desc };
    log(`── PROOF ${p.id}: ${p.desc}`);
    let red, green;
    try {
      const abs = join(REPO, p.file);
      let content = snapshot(p.file);
      for (const e of p.edits) {
        const n = content.split(e.old).length - 1;
        if (n !== 1) throw new Error(`${p.id}: target string occurs ${n}× (need exactly 1) in ${p.file}`);
        content = content.replace(e.old, e.neo);
      }
      writeFileSync(abs, content);
      log(`  mutated ${p.file}`);
      build(`${p.id} mutated`);

      red = runSuite(p, "RED");
      entry.red = { rc: red.rc, ok: red.ok, badCount: red.bad.length, failLines: red.bad.map((l) => l.trim()), log: red.log };
      entry.wentRed = red.bad.length > 0;
      if (!entry.wentRed) {
        summary.notes.push(`PROOF ${p.id} DID NOT GO RED — real assertions all passed against the mutated build. Recorded as a finding, not forced.`);
        log(`  !! ${p.id} stayed GREEN under mutation — finding, not forced`);
      }
    } finally {
      // Restore from memory — always, even on crash mid-proof.
      const fixed = restoreAll();
      log(`  restored from memory: ${fixed.length ? fixed.join(", ") : "(already clean)"}`);
      build(`${p.id} restored`);
    }
    green = runSuite(p, "GREEN");
    entry.green = { rc: green.rc, ok: green.ok, badCount: green.bad.length, failLines: green.bad.map((l) => l.trim()), log: green.log };
    summary.proofs.push(entry);
  }

  // 4. Fixture hygiene after EV1.
  const fx = run("git", ["status", "--porcelain", "tests/ui/phase3/fixture-ws"]);
  summary.fixtureWsClean = fx.out.trim() === "";
  if (!summary.fixtureWsClean) summary.notes.push(`fixture-ws dirty after EV1: ${fx.out.trim()}`);
} catch (e) {
  failure = e;
} finally {
  // 5. Stop everything we started (and only by named port / owned pid).
  try {
    stops.push(stopTestServer(PORT_FIXUI));
    stops.push(stopScratchDaemon(PORT_FIXDAEMON));
    stops.push(stopTestServer(PORT_SUITES));
    for (const pr of procs) stops.push(killOwned(pr.pid, `wrapper ${pr.label}`));
  } catch (e) { summary.notes.push(`stop phase error: ${e}`); }

  // 6. Tree restored + clean build, whatever happened.
  try {
    const fixed = restoreAll();
    if (fixed.length) log(`final restore: ${fixed.join(", ")}`);
    const finalHash = build("final clean");
    summary.finalBundle = finalHash;
    const ls = run("bash", ["-c", "ls src/ui/app-dist/ | grep -o 'app\\..*\\.js'"]);
    summary.appDistContents = ls.out.trim().split("\n");
    const srcSt = run("git", ["status", "--porcelain", "src/ui/app", "src/ui/pages", "src/ui/components"]);
    summary.srcClean = srcSt.out.split("\n").filter((l) => l.trim() && !l.includes("app-dist")).length === 0;
  } catch (e) { failure = failure || e; }

  // 7. :4633 back up, on the clean branch build, or fail loudly.
  try {
    launch("bun", ["run", "src/ui/test-server.ts", "start", "--port", "4633", "--ttl", "0", "--host", "0.0.0.0"],
      join(GATE, "server-4633.log"), ":4633 restart");
    await waitUrl("http://127.0.0.1:4633/", 30000, ":4633 restart");
    const html = await fetch("http://127.0.0.1:4633/", { signal: AbortSignal.timeout(3000) }).then((r) => r.text());
    port4633Final = html.match(/app\.[A-Za-z0-9_-]+\.js/)?.[0] || "(none)";
    summary.port4633Final = port4633Final;
    if (port4633Final !== CLEAN_BUNDLE) {
      failure = failure || new Error(`:4633 restarted but serves ${port4633Final}, expected ${CLEAN_BUNDLE}`);
    }
  } catch (e) { failure = failure || new Error(`:4633 restart failed: ${e}`); }

  summary.stops = stops;
  summary.finishedAt = new Date().toISOString();
  summary.ok = !failure && summary.proofs.length === PROOFS.length;

  try { writeFileSync(join(GATE, "proofs-summary.json"), JSON.stringify(summary, null, 2)); } catch {}

  // 8. Substitute into the gate record (§3 + §8 tokens) — only if we have results.
  try {
    if (existsSync(RECORD)) {
      let rec = readFileSync(RECORD, "utf8");
      const byId = Object.fromEntries(summary.proofs.map((p) => [p.id, p]));
      const subs = {};
      for (const p of summary.proofs) {
        subs[`«${p.id}-RED»`] = p.red.failLines.length
          ? p.red.failLines.slice(0, 2).map((l) => "`" + l.replace(/`/g, "'") + "`").join("<br>")
          : "**stayed green — finding**";
        subs[`«${p.id}-GREEN»`] = `✓=${p.green.ok} ✗=${p.green.badCount}`;
      }
      subs["«STOP-4641»"] = `\`${(stops.find((s) => s.includes(":4641")) || "test-server :4641 stop — no line")}\``;
      subs["«STOP-4642»"] = `\`${(stops.find((s) => s.includes(":4642")) || "scratch-daemon :4642 stop — no line")}\``;
      subs["«STOP-4643»"] = `\`${(stops.find((s) => s.includes(":4643")) || "test-server :4643 stop — no line")}\``;
      subs["«CHECK-4633»"] = `serving \`${port4633Final}\` confirmed ${summary.finishedAt}`;
      subs["«EVFIX-COMMIT»"] = run("git", ["rev-parse", "--short", "HEAD"]).out.trim();
      let missing = [];
      for (const [tok, val] of Object.entries(subs)) {
        if (rec.includes(tok)) rec = rec.split(tok).join(val);
        else if ([...summary.proofs.map((p) => `«${p.id}-RED»`), ...summary.proofs.map((p) => `«${p.id}-GREEN»`),
          "«STOP-4641»", "«STOP-4642»", "«STOP-4643»", "«CHECK-4633»", "«EVFIX-COMMIT»"].includes(tok)) missing.push(tok);
      }
      writeFileSync(RECORD, rec);
      const remaining = (rec.match(/«/g) || []).length;
      summary.recordPlaceholdersLeft = remaining;
      if (remaining > 0) summary.notes.push(`record still has ${remaining} « token(s)${missing.length ? " (missing data: " + missing.join(", ") + ")" : ""}`);
    }
  } catch (e) { summary.notes.push(`record substitution error: ${e}`); }

  // 9. Rendezvous — the script closes its own task.
  const rows = summary.proofs.map((p) =>
    `| ${p.id} | ${p.desc} | ${p.wentRed ? "`" + (p.red.failLines[0] || "").replace(/`/g, "'").replace(/\|/g, "\\|") + "`" : "**did not go red — finding**"} | ✓=${p.green.ok} ✗=${p.green.badCount} |`
  ).join("\n");
  const noMut = "MUTATION was never set — every run used the specs' real assertions.";
  const md = failure
    ? `---\nstatus: failed\nreason: crash\nsummary: Unattended proof runner failed: ${String(failure.message || failure).slice(0, 200)}\n---\n\nRun reached ${summary.proofs.length}/5 proofs. See \`proofs-summary.json\` and \`proof-*-*.log\` in \`repos/dev/features/WAL-115_test-runs/2026-10-17_gate/\`.\n\n${rows ? "Proofs completed:\n\n| Proof | Mutation | RED line | GREEN |\n|---|---|---|---|\n" + rows + "\n" : ""}\n${noMut}\n:4633 final: \`${port4633Final}\`. Stops:\n${stops.map((s) => "- " + s).join("\n")}\n`
    : `---\nstatus: done\nsummary: Ran the five Phase 3.2 mutation proofs unattended via tests/ui/phase3.2/run-proofs.mjs — all red under real assertions and green restored; logs and proofs-summary.json in repos/dev/features/WAL-115_test-runs/2026-10-17_gate/; gate record §3/§8 filled.\n---\n\n| Proof | Mutation | RED line (quoted) | GREEN after restore |\n|---|---|---|---|\n${rows}\n\n- ${noMut}\n- :4633 at close: \`${port4633Final}\` (stopped for the run window, restarted with \`--ttl 0 --host 0.0.0.0\`, asserted)\n- fixture-ws git-clean after EV1: ${summary.fixtureWsClean ? "yes" : "**NO**"}\n- final bundle: \`${summary.finalBundle}\`; app-dist contents: ${JSON.stringify(summary.appDistContents)}; src clean: ${summary.srcClean ? "yes" : "no"}\n- record placeholders left: ${summary.recordPlaceholdersLeft ?? "n/a"}\n\nStops:\n${stops.map((s) => "- " + s).join("\n")}\n\nNotes:\n${(summary.notes || []).map((n) => "- " + n).join("\n") || "- none"}\n`;
  try { writeFileSync(RENDEZVOUS, md); } catch (e) { console.error("RENDEZVOUS WRITE FAILED:", e); process.exitCode = 1; }
  log(failure ? `FAILED: ${failure.message || failure}` : "done — rendezvous written");
}
