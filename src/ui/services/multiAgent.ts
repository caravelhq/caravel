// Read-only summary of the multi-agent task system (WAL-63 phase 4).
// Mirrors `node .claude/skills/task/script/task.mjs summary` output, but in
// the daemon process so the dashboard can render without shelling out.

import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

const DEFAULT_AGENTS = ["alice", "ray", "adam", "sam", "bob", "mark", "cliff"];
const BUCKETS = ["open", "waiting", "done", "failed", "archived"] as const;
type Bucket = (typeof BUCKETS)[number];

type Counts = { open: number; waiting: number; done: number; failed: number; archived: number };

export interface MultiAgentSummary {
  enabled: boolean;
  byAgent: Record<string, Counts>;
  totals: Counts;
  waitingUser: { agent: string; file: string; summary: string }[];
  escalated: { agent: string; file: string }[];
}

export interface TaskRow {
  id: string;
  headline: string;
  agent: string;
  bucket: Bucket;
  status: string;
  kind: string;
  from: string;
  to: string;
  parent: string | null;
  priority: string | null;
  brief: string;
  summary: { brief: string; response: string };
  context: string[];
  dispatch: {
    chat_id: string | null;
    chat_name: string | null;
    chat_preview: string | null;
    chat_agent: string | null;
    auto_resume: string | null;
  };
  created: string | null;
  updated: string | null;
  envelopePath: string;
  reportPath: string | null;
}

export interface TaskChain {
  task: TaskRow | null;
  parent: TaskRow | null;
  children: TaskRow[];
  ancestors: TaskRow[];
}

// Strip surrounding double-quotes from a YAML scalar (chat_name etc. are
// written via JSON.stringify so they're always quoted). Returns null when
// the value is null/empty.
function unquote(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t === "null") return null;
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function readField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

function readNestedField(yaml: string, parent: string, key: string): string | null {
  // very small parser: find `<parent>:` line, then look at the next 2-space
  // indented block for `<key>:`.
  const re = new RegExp(`^${parent}:[\\s\\S]*?^ {2}${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

function readBlockScalar(yaml: string, key: string): string {
  // Parse a block scalar like `brief: |\n  line1\n  line2\n`.
  const re = new RegExp(`^${key}:\\s*\\|[+-]?\\s*\\n((?:[ \\t]+.*\\n?)+)`, "m");
  const m = re.exec(yaml);
  if (!m) return "";
  const lines = (m[1] ?? "").split("\n");
  // Strip the common leading indent (2 spaces by convention; tolerate 4).
  const indent = lines.find((l) => l.length > 0)?.match(/^[ \t]+/)?.[0] ?? "";
  return lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join("\n").trimEnd();
}

function readListField(yaml: string, key: string): string[] {
  // Parse `key:\n  - item\n  - item\n`. Skips empty / non-list values.
  const re = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-\\s+.*\\n?)+)`, "m");
  const m = re.exec(yaml);
  if (!m) return [];
  const out: string[] = [];
  for (const line of (m[1] ?? "").split("\n")) {
    const item = line.match(/^[ \t]+-\s+(.*)$/);
    if (item) out.push(item[1].trim());
  }
  return out;
}

function envAgents(): string[] {
  const raw = process.env.CLAUDECLAW_MULTI_AGENT_AGENTS;
  if (!raw) return DEFAULT_AGENTS;
  const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_AGENTS;
}

export async function getMultiAgentSummary(): Promise<MultiAgentSummary> {
  const summary: MultiAgentSummary = {
    enabled: existsSync(AGENTS_DIR),
    byAgent: {},
    totals: { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 },
    waitingUser: [],
    escalated: [],
  };

  if (!summary.enabled) return summary;

  for (const agent of envAgents()) {
    const counts: Counts = { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 };
    for (const bucket of BUCKETS) {
      const dir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir).catch(() => [] as string[]);
      const yamls = entries.filter((e) => e.endsWith(".yaml"));
      counts[bucket] = yamls.length;
      summary.totals[bucket] += yamls.length;

      if (bucket === "waiting") {
        for (const f of yamls) {
          try {
            const yaml = await readFile(join(dir, f), "utf-8");
            const status = readField(yaml, "status") ?? "";
            const brief = readNestedField(yaml, "summary", "brief") ?? readBlockScalar(yaml, "brief") ?? "";
            if (status === "waiting:on:user") {
              summary.waitingUser.push({ agent, file: f, summary: brief.slice(0, 200) });
            }
          } catch {}
        }
      }
      if (bucket === "failed") {
        for (const f of yamls) {
          try {
            const yaml = await readFile(join(dir, f), "utf-8");
            const status = readField(yaml, "status") ?? "";
            if (status === "escalated") {
              summary.escalated.push({ agent, file: f });
            }
          } catch {}
        }
      }
    }
    summary.byAgent[agent] = counts;
  }

  return summary;
}

async function readTaskFile(agent: string, bucket: Bucket, file: string): Promise<TaskRow | null> {
  const path = join(AGENTS_DIR, agent, "tasks", bucket, file);
  let yaml: string;
  try {
    yaml = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  const id = readField(yaml, "id") ?? file.replace(/\.yaml$/, "");
  const headline = readField(yaml, "headline") ?? "";
  const status = readField(yaml, "status") ?? "";
  const kind = readField(yaml, "kind") ?? "other";
  const from = readField(yaml, "from") ?? "";
  const to = readField(yaml, "to") ?? agent;
  const parentRaw = readField(yaml, "parent");
  const parent = parentRaw && parentRaw !== "null" ? parentRaw : null;
  const priority = readField(yaml, "priority");
  const brief = readBlockScalar(yaml, "brief");
  const summaryBrief = readNestedField(yaml, "summary", "brief") ?? "";
  const summaryResponse = readNestedField(yaml, "summary", "response") ?? "";
  const context = readListField(yaml, "context");
  const dispatchChat = readNestedField(yaml, "dispatch", "chat_id");
  const dispatchAutoResume = readNestedField(yaml, "dispatch", "auto_resume");
  const dispatchChatName = unquote(readNestedField(yaml, "dispatch", "chat_name"));
  const dispatchChatPreview = unquote(readNestedField(yaml, "dispatch", "chat_preview"));
  const dispatchChatAgent = unquote(readNestedField(yaml, "dispatch", "chat_agent"));
  const created = readField(yaml, "created");
  const updated = readField(yaml, "updated");
  const envelopePath = `agents/${agent}/tasks/${bucket}/${file}`;
  // `report:` is a top-level field — the worker sets it via
  // <task-done report="path/to/produced/file.md"/>. If empty / unset, no
  // produced report exists and the dashboard hides the Report button.
  const reportRaw = readField(yaml, "report");
  let reportPath = reportRaw && reportRaw !== '""' && reportRaw !== "''" ? reportRaw.replace(/^["']|["']$/g, "") : null;
  // v1.2 file-rendezvous contract: workers write `tasks/<bucket>/<id>.md`
  // as the canonical deliverable. Auto-discover it when the YAML's `report:`
  // field is empty so the dashboard surfaces the worker's writeup without a
  // manual frontmatter step.
  if (!reportPath) {
    const candidate = join(AGENTS_DIR, agent, "tasks", bucket, `${file.replace(/\.yaml$/, "")}.md`);
    if (existsSync(candidate)) {
      reportPath = `agents/${agent}/tasks/${bucket}/${file.replace(/\.yaml$/, "")}.md`;
    }
  }

  return {
    id,
    headline,
    agent,
    bucket,
    status,
    kind,
    from,
    to,
    parent,
    priority,
    brief,
    summary: { brief: summaryBrief, response: summaryResponse },
    context,
    dispatch: {
      chat_id: dispatchChat,
      chat_name: dispatchChatName,
      chat_preview: dispatchChatPreview,
      chat_agent: dispatchChatAgent,
      auto_resume: dispatchAutoResume,
    },
    created,
    updated,
    envelopePath,
    reportPath,
  };
}

async function listAllTasks(includeArchived = false): Promise<TaskRow[]> {
  if (!existsSync(AGENTS_DIR)) return [];
  const out: TaskRow[] = [];
  const buckets = includeArchived ? BUCKETS : BUCKETS.filter((b) => b !== "archived");
  for (const agent of envAgents()) {
    for (const bucket of buckets) {
      const dir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const files = (await readdir(dir).catch(() => [] as string[]))
        .filter((e) => e.endsWith(".yaml"));
      for (const f of files) {
        const row = await readTaskFile(agent, bucket, f);
        if (row) out.push(row);
      }
    }
  }
  // Sort by `updated` desc so the most-recently-touched tasks float to the top.
  out.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  return out;
}

export async function listTasks(opts?: {
  since?: string;
  limit?: number;
  includeArchived?: boolean;
}): Promise<TaskRow[]> {
  const all = await listAllTasks(opts?.includeArchived ?? false);
  const filtered = opts?.since ? all.filter((t) => (t.updated ?? "") >= opts.since!) : all;
  return opts?.limit ? filtered.slice(0, opts.limit) : filtered;
}

export async function getTaskChain(taskId: string): Promise<TaskChain> {
  // Include archived so links to older tasks (parent/children) still resolve.
  const all = await listAllTasks(true);
  const byId = new Map(all.map((t) => [t.id, t]));
  const task = byId.get(taskId) ?? null;

  // Build ancestors chain (root → ... → parent).
  const ancestors: TaskRow[] = [];
  let cur = task?.parent ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = byId.get(cur);
    if (!p) break;
    ancestors.unshift(p);
    cur = p.parent;
  }
  const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  const children = all.filter((t) => t.parent === taskId);
  return { task, parent, children, ancestors };
}
