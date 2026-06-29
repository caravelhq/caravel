#!/usr/bin/env node
// Alice's task-formulation helper (WAL-63).
//
// Mechanical operations only — the agent does the formulation, this script
// handles ID allocation, file placement, and journal append so the agent
// doesn't have to reason about race conditions or counter math.
//
//   node .claude/skills/task/script/task.mjs new --target ray --yaml /path/to/draft.yaml
//     Validate, assign next ID for today, write to the target's tasks/open/,
//     append to the target's journal. Prints the assigned ID on stdout.
//
//   node .claude/skills/task/script/task.mjs next-id --target ray [--parent TSK-...]
//     Print the next available task ID for today (no file written). When
//     --parent is provided, returns a decimal sub-id like `<parent>.N`.
//
//   node .claude/skills/task/script/task.mjs list --agent <name> [--status open|done|failed]
//     List tasks for an agent as JSON.
//
//   node .claude/skills/task/script/task.mjs summary
//     Print a JSON summary across all agents — counts per status, recent
//     escalations, waiting:user list. Used by the dashboard widget.

import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return argv[i + 1] ?? fallback;
}

const ROOT = process.cwd();
const AGENTS = ["alice", "ray", "adam", "sam", "bob", "mark", "cliff", "jill"];
// Buckets scanned for ID-collision avoidance. `archived` is included so
// retired IDs are never reused by the next-id allocator.
const SCAN_BUCKETS = ["open", "waiting", "done", "failed", "archived"];

function tasksDir(agent) {
  return join(ROOT, "agents", agent, "tasks");
}

function todayPrefix() {
  const d = new Date();
  return `TSK-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listAllIds(agent) {
  const out = new Set();
  for (const sub of SCAN_BUCKETS) {
    const dir = join(tasksDir(agent), sub);
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    for (const e of entries) {
      if (e.endsWith(".yaml")) out.add(e.replace(/\.yaml$/, ""));
    }
  }
  return out;
}

// Decimal-aware allocator. Mirrors the daemon's nextAliceTaskId logic so
// the runtime and the CLI never disagree on what the next id should be.
//   - parent === null  → next free top-level `<prefix>NNNN` (skips dotted ids)
//   - parent !== null  → next free integer suffix `<root>.NN` (zero-padded 2
//     digits) where root is parent flattened to top-level id. Grandchildren
//     become siblings; orchestration trees stay one level deep.
async function nextIdForAgent(_agent, parent = null) {
  if (parent) {
    const root = parent.split(".")[0];
    const re = new RegExp("^" + escapeRegex(root) + "\\.(\\d+)$");
    let maxN = 0;
    for (const a of AGENTS) {
      const ids = await listAllIds(a);
      for (const id of ids) {
        const m = re.exec(id);
        if (!m) continue;
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
    return `${root}.${String(maxN + 1).padStart(2, "0")}`;
  }

  const prefix = todayPrefix();
  // Top-level ids are exactly `<prefix>NNNN` with no dots in the suffix —
  // dotted ids are descendants and don't compete for the top counter.
  const re = new RegExp("^" + escapeRegex(prefix) + "(\\d+)$");
  let maxN = 0;
  for (const a of AGENTS) {
    const ids = await listAllIds(a);
    for (const id of ids) {
      const m = re.exec(id);
      if (!m) continue;
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  const next = String(maxN + 1).padStart(4, "0");
  return prefix + next;
}

async function appendJournal(agent, entry) {
  const path = join(tasksDir(agent), "journal.ndjson");
  await writeFile(path, "", { flag: "a" });
  await writeFile(path, JSON.stringify(entry) + "\n", { flag: "a" });
}

async function readYaml(path) {
  return await readFile(path, "utf-8");
}

function extractField(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

async function newTask() {
  const target = flag("target");
  const draftPath = flag("yaml");
  if (!target || !draftPath) {
    console.error("usage: task.mjs new --target <agent> --yaml <draft.yaml>");
    process.exit(2);
  }
  if (!AGENTS.includes(target)) {
    console.error(`unknown target agent: ${target}. known: ${AGENTS.join(", ")}`);
    process.exit(2);
  }
  if (!existsSync(draftPath)) {
    console.error(`draft not found: ${draftPath}`);
    process.exit(2);
  }
  const draft = await readYaml(draftPath);

  // Headline is required, ≤10 words. CLI flag wins over the YAML field so
  // dispatchers can supply it without rewriting the draft.
  const headlineFromFlag = flag("headline");
  const headlineFromYaml = extractField(draft, "headline");
  const headline = (headlineFromFlag ?? headlineFromYaml ?? "").trim();
  if (!headline) {
    console.error('headline is required (≤10 words). Pass --headline "…" or add `headline:` to the YAML.');
    process.exit(2);
  }
  const wordCount = headline.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) {
    console.error(`headline is too long (${wordCount} words; max 10). Tighten it.`);
    process.exit(2);
  }

  // Parent is taken from --parent flag or the YAML's `parent:` field.
  // Drives decimal sub-id allocation. `null`/empty means top-level.
  const parentFlag = flag("parent");
  const parentFromYaml = extractField(draft, "parent");
  const parentRaw = parentFlag ?? parentFromYaml;
  const parent = parentRaw && parentRaw !== "null" && parentRaw !== "" ? parentRaw.trim() : null;

  const id = await nextIdForAgent(target, parent);
  const now = new Date().toISOString();
  // Replace the id/headline/created/updated fields if present, else prepend.
  let body = draft;
  body = body.replace(/^id:\s*.*$/m, `id: ${id}`);
  body = body.replace(/^headline:\s*.*$/m, `headline: ${headline}`);
  body = body.replace(/^created:\s*.*$/m, `created: ${now}`);
  body = body.replace(/^updated:\s*.*$/m, `updated: ${now}`);
  if (!/^id:\s/m.test(body)) body = `id: ${id}\nheadline: ${headline}\ncreated: ${now}\nupdated: ${now}\n` + body;
  if (!/^headline:\s/m.test(body)) body = body.replace(/^id:\s.*$/m, (m) => `${m}\nheadline: ${headline}`);
  // Force status to open and clear lease.
  body = body.replace(/^status:\s*.*$/m, "status: open");

  // Stamp originating chat thread (if any) so the runner can post the
  // result back to the chat that spawned the task. CLI override via --chat
  // wins over the env var so dashboard / scripted dispatchers can supply
  // their own context.
  const chatId = flag("chat") ?? process.env.CLAUDECLAW_CHAT_ID ?? null;
  if (chatId && !/^dispatch:/m.test(body)) {
    const dispatchBlock = `\ndispatch:\n  chat_id: ${chatId}\n  chat_ts: ${now}\n`;
    body = body.trimEnd() + "\n" + dispatchBlock;
  }

  const openDir = join(tasksDir(target), "open");
  await mkdir(openDir, { recursive: true });
  const outPath = join(openDir, `${id}.yaml`);
  await writeFile(outPath, body);

  const from = extractField(body, "from") ?? "unknown";
  const kind = extractField(body, "kind") ?? "other";
  const journalParent = extractField(body, "parent");
  await appendJournal(target, {
    ts: now,
    id,
    status: "open",
    kind,
    from,
    to: target,
    parent: journalParent === "null" || journalParent === null ? null : journalParent,
    summary: "",
  });

  console.log(id);
}

async function listTasks() {
  const agent = flag("agent");
  const status = flag("status");
  if (!agent) {
    console.error("usage: task.mjs list --agent <name> [--status open|done|failed]");
    process.exit(2);
  }
  const buckets = status ? [status] : ["open", "waiting", "done", "failed"];
  const out = [];
  for (const b of buckets) {
    const dir = join(tasksDir(agent), b);
    if (!existsSync(dir)) continue;
    const files = await readdir(dir);
    for (const f of files.filter((x) => x.endsWith(".yaml")).sort()) {
      out.push({ agent, bucket: b, file: f });
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

async function summary() {
  const out = {
    byAgent: {},
    escalated: [],
    waitingUser: [],
    totals: { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 },
  };
  for (const a of AGENTS) {
    const counts = { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 };
    for (const b of ["open", "waiting", "done", "failed", "archived"]) {
      const dir = join(tasksDir(a), b);
      if (!existsSync(dir)) continue;
      const files = (await readdir(dir)).filter((x) => x.endsWith(".yaml"));
      counts[b] = files.length;
      out.totals[b] += files.length;
      if (b === "waiting") {
        for (const f of files) {
          const yaml = await readYaml(join(dir, f));
          const status = extractField(yaml, "status") ?? "";
          const summaryBrief = extractField(yaml, "  brief") ?? extractField(yaml, "brief") ?? "";
          if (status === "waiting:on:user") {
            out.waitingUser.push({ agent: a, file: f, summary: summaryBrief });
          }
        }
      }
      if (b === "failed") {
        for (const f of files) {
          const yaml = await readYaml(join(dir, f));
          const status = extractField(yaml, "status") ?? "";
          if (status === "escalated") {
            out.escalated.push({ agent: a, file: f });
          }
        }
      }
    }
    out.byAgent[a] = counts;
  }
  console.log(JSON.stringify(out, null, 2));
}

(async () => {
  if (cmd === "new") return newTask();
  if (cmd === "next-id") {
    const target = flag("target");
    if (!target || !AGENTS.includes(target)) {
      console.error(`usage: task.mjs next-id --target <agent> [--parent TSK-...]. known: ${AGENTS.join(", ")}`);
      process.exit(2);
    }
    const parent = flag("parent");
    console.log(await nextIdForAgent(target, parent || null));
    return;
  }
  if (cmd === "list") return listTasks();
  if (cmd === "summary") return summary();
  console.error("usage: task.mjs <new|next-id|list|summary> [...flags]");
  process.exit(2);
})().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
