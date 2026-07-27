#!/usr/bin/env node
// Sweep helper — cursor management + task discovery for the /sweep skill.
//
// Mechanical work for the /sweep skill — Alice does the judgement,
// this script does cursor management + task discovery so Alice
// doesn't have to reason about timestamps or filesystem walks.
//
//   node .claude/skills/sweep/script/sweep.mjs scope [--project SLUG]
//     List candidate done tasks since the cursor (per-project when
//     --project is given, otherwise the global cursor). JSON to stdout:
//     [{ id, agent, project, updated, report_path, headline }, ...]
//
//   node .claude/skills/sweep/script/sweep.mjs commit [--project SLUG] [--ts ISO]
//     Advance the cursor for the project (or global) to the given ts
//     (defaults to now). Idempotent.
//
//   node .claude/skills/sweep/script/sweep.mjs projects
//     List distinct project slugs in use across all envelopes. Useful
//     for disambiguating /sweep PROJ-212 when multiple projects start
//     with the same key.
//
//   node .claude/skills/sweep/script/sweep.mjs cursor
//     Print the current cursor state (JSON map of project → timestamp).

import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return argv[i + 1] ?? fallback;
}

const ROOT = process.cwd();
const AGENTS_DIR = join(ROOT, "agents");
const CURSOR_PATH = join(ROOT, ".caravel", "sweep-cursor.json");
// Roster derived from disk (agents/<name>/agent.json) so adding an agent needs
// no edit here — matches listAgentNamesSync() in the daemon and AGENTS in the
// /task helper. Previously a hardcoded list that drifted (missed fabio).
const KNOWN_AGENTS = (() => {
  if (!existsSync(AGENTS_DIR)) return [];
  try {
    return readdirSync(AGENTS_DIR).filter(
      (name) =>
        !name.startsWith("_") &&
        !name.startsWith(".") &&
        statSync(join(AGENTS_DIR, name)).isDirectory() &&
        existsSync(join(AGENTS_DIR, name, "agent.json")),
    );
  } catch {
    return [];
  }
})();

// Read the cursor file. Returns `{ "_global": ts, "<slug>": ts, ... }`.
// Empty object when the file doesn't exist or is unparseable.
async function readCursor() {
  if (!existsSync(CURSOR_PATH)) return {};
  try {
    const raw = await readFile(CURSOR_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCursor(cursor) {
  await mkdir(join(ROOT, ".caravel"), { recursive: true });
  await writeFile(CURSOR_PATH, JSON.stringify(cursor, null, 2) + "\n");
}

// Cheap field extraction from envelope YAML — same shape used by the
// /task helper. Avoids js-yaml dep; the fields we care about are all
// top-level scalars.
function extractField(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  const v = m[1].trim();
  if (!v || v === "null" || v === '""' || v === "''") return null;
  return v.replace(/^["']|["']$/g, "");
}

// Walk every agent's done/ bucket. Returns `[{path, yaml}, ...]`.
async function listDoneEnvelopes() {
  const out = [];
  for (const agent of KNOWN_AGENTS) {
    const dir = join(AGENTS_DIR, agent, "tasks", "done");
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir).catch(() => []);
    for (const fname of entries) {
      if (!fname.endsWith(".yaml")) continue;
      const path = join(dir, fname);
      let yaml;
      try { yaml = await readFile(path, "utf-8"); }
      catch { continue; }
      out.push({ path, yaml, agent, fname });
    }
  }
  return out;
}

// Match `--project` arg against known project slugs. Fuzzy: an arg of
// "PROJ-212" matches "PROJ-212_lighthouse-deployment" and "PROJ-212-02_*"
// (substring, case-insensitive). Returns the canonical slug when one
// match, throws when ambiguous or unknown.
function resolveProjectSlug(arg, knownSlugs) {
  if (!arg) return null;
  const needle = arg.toLowerCase();
  const exact = knownSlugs.find((s) => s.toLowerCase() === needle);
  if (exact) return exact;
  const matches = knownSlugs.filter((s) => s.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`ambiguous --project "${arg}": matches ${matches.join(", ")}`);
  }
  throw new Error(`unknown --project "${arg}". Known: ${knownSlugs.join(", ")}`);
}

async function scope() {
  const projectArg = flag("project");
  const envelopes = await listDoneEnvelopes();

  // Build known-project set for fuzzy match.
  const knownProjects = new Set();
  for (const e of envelopes) {
    const p = extractField(e.yaml, "project");
    if (p) knownProjects.add(p);
  }

  let scopedSlug = null;
  if (projectArg) {
    scopedSlug = resolveProjectSlug(projectArg, [...knownProjects]);
  }

  const cursor = await readCursor();
  const cursorKey = scopedSlug ?? "_global";
  const cursorTs = cursor[cursorKey] ?? "1970-01-01T00:00:00.000Z";
  const cursorMs = Date.parse(cursorTs);

  const out = [];
  for (const e of envelopes) {
    const project = extractField(e.yaml, "project");
    if (scopedSlug && project !== scopedSlug) continue;
    const updated = extractField(e.yaml, "updated");
    if (!updated) continue;
    const updatedMs = Date.parse(updated);
    if (!Number.isFinite(updatedMs) || updatedMs <= cursorMs) continue;
    const id = extractField(e.yaml, "id") ?? e.fname.replace(/\.yaml$/, "");
    const headline = extractField(e.yaml, "headline") ?? "";
    const reportPath = e.path.replace(/\.yaml$/, ".md");
    const reportRel = reportPath.replace(ROOT + "/", "");
    out.push({
      id,
      agent: e.agent,
      project: project ?? null,
      updated,
      headline,
      report_path: existsSync(reportPath) ? reportRel : null,
    });
  }

  // Sort oldest first so Alice reads in chronological order.
  out.sort((a, b) => (a.updated || "").localeCompare(b.updated || ""));
  console.log(JSON.stringify({
    scope: scopedSlug ? { kind: "project", slug: scopedSlug } : { kind: "global" },
    cursor_ts: cursorTs,
    candidates: out,
  }, null, 2));
}

async function commit() {
  const projectArg = flag("project");
  const ts = flag("ts") ?? new Date().toISOString();
  const cursor = await readCursor();
  let key = "_global";
  if (projectArg) {
    // Resolve fuzzy → canonical slug
    const envelopes = await listDoneEnvelopes();
    const knownProjects = new Set();
    for (const e of envelopes) {
      const p = extractField(e.yaml, "project");
      if (p) knownProjects.add(p);
    }
    key = resolveProjectSlug(projectArg, [...knownProjects]);
  }
  cursor[key] = ts;
  await writeCursor(cursor);
  console.log(JSON.stringify({ ok: true, key, ts }, null, 2));
}

async function projects() {
  const envelopes = await listDoneEnvelopes();
  const counts = {};
  for (const e of envelopes) {
    const p = extractField(e.yaml, "project") ?? "__unassigned";
    counts[p] = (counts[p] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify({
    projects: sorted.map(([slug, count]) => ({ slug, count })),
  }, null, 2));
}

async function cursorCmd() {
  console.log(JSON.stringify(await readCursor(), null, 2));
}

async function main() {
  try {
    if (cmd === "scope") return await scope();
    if (cmd === "commit") return await commit();
    if (cmd === "projects") return await projects();
    if (cmd === "cursor") return await cursorCmd();
    console.error("usage: sweep.mjs {scope|commit|projects|cursor} [--project SLUG] [--ts ISO]");
    process.exit(2);
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }
}

main();
