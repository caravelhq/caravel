#!/usr/bin/env node
// WAL-63 Phase 1: backfill `project:` and `closed:` fields on existing task
// envelopes.
//
// Idempotent — safe to re-run. Scans every YAML envelope under
// `agents/*/tasks/*/*.yaml` (including `archived/`), inspects its current
// shape, and writes only the additive fields:
//
//   project:    inferred from `context:` paths matching `Notes/Projects/<X>/`.
//               Most-frequently-cited wins; ties broken by first-seen.
//               Skipped when the envelope already has an explicit `project:`.
//
//   closed:     applied by rule, never overwritten if a non-null block is
//               already present. Rules (in order):
//
//                 1. Envelope is in `archived/` →
//                      closed.status: closed
//                      closed.at:     file mtime
//                      closed.by:     auto-backfill-archive
//                      closed.reason: "archived prior to closed-field introduction"
//
//                 2. Envelope is a `done` and another envelope has it as a
//                    `parent:` (i.e. a Next-spawned child exists) →
//                      closed.status: superseded
//                      closed.at:     child's `created:` (oldest child wins)
//                      closed.by:     auto-backfill
//                      closed.reason: "child <child-id> exists"
//
//                 3. Otherwise → closed stays null (the envelope is left
//                    unchanged for `closed`; Kelly triages from the new
//                    Current view).
//
// Unresolved log: any envelope that ends up with `project: null` after
// inference (no Notes/Projects/<X>/ path in context) is appended to
// Notes/Projects/ClaudeClaw/2026-05-18_backfill-unresolved.md so Kelly can
// hand-tag the high-value ones.
//
// Usage:
//   node repos/claudeclaw/scripts/backfill-task-lifecycle.mjs        (apply)
//   node repos/claudeclaw/scripts/backfill-task-lifecycle.mjs --dry  (no writes)

import { readdir, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");
const UNRESOLVED_LOG = join(PROJECT_DIR, "Notes", "Projects", "ClaudeClaw", "2026-05-18_backfill-unresolved.md");

const BUCKETS = ["open", "waiting", "done", "failed", "archived"];

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!existsSync(AGENTS_DIR)) {
  console.error(`[backfill] no agents dir at ${AGENTS_DIR} — run from the repo root.`);
  process.exit(1);
}

// === Read pass: index every envelope =========================================

/**
 * @typedef {{
 *   id: string,
 *   agent: string,
 *   bucket: string,
 *   path: string,
 *   yaml: string,
 *   parent: string|null,
 *   project: string|null,
 *   status: string,
 *   closedStatus: string|null,
 *   created: string|null,
 *   contextProjects: string[],
 *   mtimeMs: number,
 * }} Envelope
 */

/** @type {Envelope[]} */
const envelopes = [];

async function listAgents() {
  const entries = await readdir(AGENTS_DIR);
  const out = [];
  for (const name of entries) {
    if (name.startsWith("_")) continue; // _shared
    const st = await stat(join(AGENTS_DIR, name)).catch(() => null);
    if (st?.isDirectory() && existsSync(join(AGENTS_DIR, name, "tasks"))) out.push(name);
  }
  return out;
}

function readField(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  let v = m[1].trim();
  if (!v) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v === "null" ? null : v;
}

function readNestedField(yaml, parentKey, key) {
  const blockRe = new RegExp(`^${parentKey}:\\s*\\n((?:[ \\t]+[^\\n]*\\n?)+)`, "m");
  const m = blockRe.exec(yaml);
  if (!m) return null;
  const inner = m[1] ?? "";
  const lineRe = new RegExp(`^[ \\t]+${key}:\\s*(.*)$`, "m");
  const km = lineRe.exec(inner);
  if (!km) return null;
  let v = km[1].trim();
  if (!v || v === "null") return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function readContextProjects(yaml) {
  // Pull `context:` block-form list entries that start with Notes/Projects/<X>/.
  const blockRe = /^context:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m;
  const m = blockRe.exec(yaml);
  if (!m) return [];
  const lines = m[1].split("\n");
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const lm = /^[ \t]+-\s*(.*)$/.exec(line);
    if (!lm) continue;
    let v = lm[1].trim();
    if (!v) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const pm = /^Notes\/Projects\/([^/]+)\//.exec(v);
    if (pm) out.push(pm[1]);
  }
  return out;
}

function inferProject(contextProjects) {
  if (contextProjects.length === 0) return null;
  /** @type {string[]} */
  const order = [];
  const counts = new Map();
  for (const p of contextProjects) {
    if (!counts.has(p)) order.push(p);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best = order[0];
  let bestCount = counts.get(best);
  for (const p of order) {
    const c = counts.get(p);
    if (c > bestCount) { best = p; bestCount = c; }
  }
  return best;
}

function readClosedStatus(yaml) {
  const blockRe = /^closed:\s*\n((?:[ \t]+[^\n]*\n?)+)/m;
  const m = blockRe.exec(yaml);
  if (m) {
    const sub = /^[ \t]+status:\s*(.*)$/m.exec(m[1] ?? "");
    if (sub) {
      const v = sub[1].trim().replace(/^["']|["']$/g, "");
      return v && v !== "null" ? v : null;
    }
    return null;
  }
  const inline = /^closed:[ \t]*(.*)$/m.exec(yaml);
  if (!inline) return null;
  const raw = inline[1].trim();
  if (!raw || raw === "null") return null;
  const mapMatch = /status:\s*([^,}\s]+)/.exec(raw);
  if (mapMatch) return mapMatch[1].replace(/^["']|["']$/g, "");
  return null;
}

async function scanAgent(agent) {
  for (const bucket of BUCKETS) {
    const dir = join(AGENTS_DIR, agent, "tasks", bucket);
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir).catch(() => []);
    for (const fname of entries) {
      if (!fname.endsWith(".yaml")) continue;
      const path = join(dir, fname);
      let yaml;
      try {
        yaml = await readFile(path, "utf-8");
      } catch {
        continue;
      }
      let mtimeMs = 0;
      try {
        const st = await stat(path);
        mtimeMs = st.mtimeMs;
      } catch {}
      const id = readField(yaml, "id") ?? fname.replace(/\.yaml$/, "");
      const parent = readField(yaml, "parent");
      const project = readField(yaml, "project");
      const status = readField(yaml, "status") ?? bucket;
      const created = readField(yaml, "created");
      const contextProjects = readContextProjects(yaml);
      envelopes.push({
        id,
        agent,
        bucket,
        path,
        yaml,
        parent,
        project,
        status,
        closedStatus: readClosedStatus(yaml),
        created,
        contextProjects,
        mtimeMs,
      });
    }
  }
}

// === Write helpers ===========================================================

function stripClosedBlock(yaml) {
  let next = yaml.replace(/^closed:\s*\n(?:[ \t]+[^\n]*\n?)+/m, "");
  next = next.replace(/^closed:[^\n]*\n/m, "");
  return next;
}

function setClosedField(yaml, closed) {
  const cleaned = stripClosedBlock(yaml);
  const insertion =
    "closed:\n" +
    `  status: ${closed.status}\n` +
    `  at: ${closed.at}\n` +
    `  by: ${closed.by}\n` +
    `  reason: ${JSON.stringify(closed.reason)}\n`;
  const statusRe = /^status:[^\n]*\n/m;
  if (statusRe.test(cleaned)) {
    return cleaned.replace(statusRe, (m) => m + insertion);
  }
  return cleaned.trimEnd() + "\n" + insertion;
}

function stripProjectLine(yaml) {
  return yaml.replace(/^project:[^\n]*\n/m, "");
}

function setProjectField(yaml, project) {
  const cleaned = stripProjectLine(yaml);
  const insertion = `project: ${project}\n`;
  // Place after `priority:` or `deadline:` (close to envelope-nature block),
  // falling back to after `kind:` and finally end-of-file.
  for (const anchor of [/^deadline:[^\n]*\n/m, /^priority:[^\n]*\n/m, /^kind:[^\n]*\n/m]) {
    if (anchor.test(cleaned)) {
      return cleaned.replace(anchor, (m) => m + insertion);
    }
  }
  return cleaned.trimEnd() + "\n" + insertion;
}

// === Main backfill pass ======================================================

async function run() {
  const agents = await listAgents();
  console.log(`[backfill] scanning ${agents.length} agent(s): ${agents.join(", ")}${DRY_RUN ? " (dry run)" : ""}`);
  for (const a of agents) await scanAgent(a);
  console.log(`[backfill] indexed ${envelopes.length} envelope(s)`);

  // Build parent → children index (oldest-first by created).
  /** @type {Map<string, Envelope[]>} */
  const byParent = new Map();
  for (const e of envelopes) {
    if (!e.parent) continue;
    const list = byParent.get(e.parent) ?? [];
    list.push(e);
    byParent.set(e.parent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
  }

  let projectUpdates = 0;
  let closedArchiveUpdates = 0;
  let closedSupersededUpdates = 0;
  let unchanged = 0;
  /** @type {{ id: string, agent: string, bucket: string, status: string, path: string, headline: string }[]} */
  const unresolved = [];

  for (const e of envelopes) {
    let nextYaml = e.yaml;
    let dirty = false;

    // --- Project inference ---
    if (!e.project) {
      const inferred = inferProject(e.contextProjects);
      if (inferred) {
        nextYaml = setProjectField(nextYaml, inferred);
        projectUpdates += 1;
        dirty = true;
      } else {
        // No project tag and none could be inferred — log for manual review.
        // Only log envelopes that aren't already in archived/ to keep the
        // hand-tag worklist short.
        if (e.bucket !== "archived") {
          const headline = readField(e.yaml, "headline") ?? "(no headline)";
          unresolved.push({
            id: e.id,
            agent: e.agent,
            bucket: e.bucket,
            status: e.status,
            path: relative(PROJECT_DIR, e.path),
            headline,
          });
        }
      }
    }

    // --- Closed inference ---
    if (e.closedStatus === null) {
      let closedBlock = null;
      if (e.bucket === "archived") {
        const atIso = e.mtimeMs > 0
          ? new Date(e.mtimeMs).toISOString()
          : new Date().toISOString();
        closedBlock = {
          status: "closed",
          at: atIso,
          by: "auto-backfill-archive",
          reason: "archived prior to closed-field introduction",
        };
        closedArchiveUpdates += 1;
      } else if (e.status === "done") {
        const kids = byParent.get(e.id) ?? [];
        const firstKid = kids[0]; // oldest by created
        if (firstKid) {
          const atIso = firstKid.created ?? e.created ?? new Date().toISOString();
          closedBlock = {
            status: "superseded",
            at: atIso,
            by: "auto-backfill",
            reason: `child ${firstKid.id} exists`,
          };
          closedSupersededUpdates += 1;
        }
      }
      if (closedBlock) {
        nextYaml = setClosedField(nextYaml, closedBlock);
        dirty = true;
      }
    }

    if (dirty) {
      if (!DRY_RUN) await writeFile(e.path, nextYaml);
    } else {
      unchanged += 1;
    }
  }

  // --- Unresolved log ---
  if (unresolved.length > 0) {
    const header = [
      "---",
      "title: Backfill — unresolved envelopes (no project tag)",
      "description: Envelopes the 2026-05-18 backfill couldn't auto-project-tag. Hand-tag the high-value ones; the rest can stay null.",
      "doc_type: research",
      "status: open",
      "last_updated: " + new Date().toISOString().slice(0, 10),
      "jira: WAL-63",
      "---",
      "",
      "# Backfill — unresolved envelopes",
      "",
      "Run: `node repos/claudeclaw/scripts/backfill-task-lifecycle.mjs`  (" + new Date().toISOString() + ")",
      "",
      "Each row below is an active envelope with no `Notes/Projects/<X>/` path in its `context:`. The backfill left `project: null`. Hand-edit the YAML to tag the ones that matter; the rest can stay untagged and show up in the Phase 4 \"Unassigned\" bucket.",
      "",
      "| Agent | Task | Status | Bucket | Headline | Path |",
      "|---|---|---|---|---|---|",
    ];
    unresolved.sort((a, b) => a.agent.localeCompare(b.agent) || a.id.localeCompare(b.id));
    for (const u of unresolved) {
      const safeHeadline = (u.headline || "").replace(/\|/g, "\\|").slice(0, 80);
      header.push(`| ${u.agent} | ${u.id} | ${u.status} | ${u.bucket} | ${safeHeadline} | \`${u.path}\` |`);
    }
    header.push("");
    if (!DRY_RUN) {
      await mkdir(join(PROJECT_DIR, "Notes", "Projects", "ClaudeClaw"), { recursive: true });
      await writeFile(UNRESOLVED_LOG, header.join("\n"));
    }
  }

  console.log(`[backfill] project: ${projectUpdates} tagged · closed (archive): ${closedArchiveUpdates} · closed (superseded): ${closedSupersededUpdates} · unchanged: ${unchanged} · unresolved: ${unresolved.length}`);
  if (DRY_RUN) {
    console.log("[backfill] DRY RUN — no files were modified");
  } else if (unresolved.length > 0) {
    console.log(`[backfill] wrote unresolved log to ${relative(PROJECT_DIR, UNRESOLVED_LOG)}`);
  }
}

run().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
