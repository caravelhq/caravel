#!/usr/bin/env node
// Vesper's task-formulation helper (WAL-63).
//
// Mechanical operations only — the agent does the formulation, this script
// handles ID allocation, file placement, and journal append so the agent
// doesn't have to reason about race conditions or counter math.
//
//   node agents/vesper/skills/task/script/task.mjs new --target researcher --yaml /path/to/draft.yaml
//     Validate, assign next ID for today, write to the target's tasks/open/,
//     append to the target's journal. Prints the assigned ID on stdout.
//
//   node agents/vesper/skills/task/script/task.mjs next-id --target researcher
//     Print the next available task ID for today (no file written).
//
//   node agents/vesper/skills/task/script/task.mjs list --agent <name> [--status open|done|failed]
//     List tasks for an agent as JSON.
//
//   node agents/vesper/skills/task/script/task.mjs summary
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
const AGENTS = ["vesper", "researcher", "advisor", "strategist", "builder", "marketing", "reviewer"];

function tasksDir(agent) {
  return join(ROOT, "agents", agent, "tasks");
}

function todayPrefix() {
  const d = new Date();
  return `TSK-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-`;
}

async function listIdsForDay(agent, prefix) {
  const out = new Set();
  for (const sub of ["open", "done", "failed"]) {
    const dir = join(tasksDir(agent), sub);
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    for (const e of entries) {
      if (e.startsWith(prefix) && e.endsWith(".yaml")) {
        out.add(e.replace(/\.yaml$/, ""));
      }
    }
  }
  return out;
}

async function nextIdForAgent(agent) {
  const prefix = todayPrefix();
  // Scan all agents — IDs are globally unique per day, not per agent.
  let maxN = 0;
  for (const a of AGENTS) {
    const ids = await listIdsForDay(a, prefix);
    for (const id of ids) {
      const tail = id.slice(prefix.length);
      const n = Number.parseInt(tail, 10);
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
  const id = await nextIdForAgent(target);
  const now = new Date().toISOString();
  // Replace the id/created/updated fields if present, else prepend.
  let body = draft;
  body = body.replace(/^id:\s*.*$/m, `id: ${id}`);
  body = body.replace(/^created:\s*.*$/m, `created: ${now}`);
  body = body.replace(/^updated:\s*.*$/m, `updated: ${now}`);
  if (!/^id:\s/m.test(body)) body = `id: ${id}\ncreated: ${now}\nupdated: ${now}\n` + body;
  // Force status to open and clear lease.
  body = body.replace(/^status:\s*.*$/m, "status: open");

  const openDir = join(tasksDir(target), "open");
  await mkdir(openDir, { recursive: true });
  const outPath = join(openDir, `${id}.yaml`);
  await writeFile(outPath, body);

  const from = extractField(body, "from") ?? "unknown";
  const kind = extractField(body, "kind") ?? "other";
  const parent = extractField(body, "parent");
  await appendJournal(target, {
    ts: now,
    id,
    status: "open",
    kind,
    from,
    to: target,
    parent: parent === "null" || parent === null ? null : parent,
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
  const buckets = status ? [status] : ["open", "done", "failed"];
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
  const out = { byAgent: {}, escalated: [], waitingUser: [], totals: { open: 0, done: 0, failed: 0 } };
  for (const a of AGENTS) {
    const counts = { open: 0, done: 0, failed: 0 };
    for (const b of ["open", "done", "failed"]) {
      const dir = join(tasksDir(a), b);
      if (!existsSync(dir)) continue;
      const files = (await readdir(dir)).filter((x) => x.endsWith(".yaml"));
      counts[b] = files.length;
      out.totals[b] += files.length;
      if (b === "open") {
        for (const f of files) {
          const yaml = await readYaml(join(dir, f));
          const status = extractField(yaml, "status") ?? "open";
          const summaryBrief = extractField(yaml, "  brief") ?? extractField(yaml, "brief") ?? "";
          if (status === "waiting:user") {
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
      console.error(`usage: task.mjs next-id --target <agent>. known: ${AGENTS.join(", ")}`);
      process.exit(2);
    }
    console.log(await nextIdForAgent(target));
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
