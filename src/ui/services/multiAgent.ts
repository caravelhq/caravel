// Read-only summary of the multi-agent task system (WAL-63 phase 4).
// Mirrors `node .claude/skills/task/script/task.mjs summary` output, but in
// the daemon process so the dashboard can render without shelling out.

import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";

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

// js-yaml is the source of truth for parsing. Some legacy envelopes have
// corrupt `history:` blocks (the runner's pre-fix appendHistory left mangled
// indentation). Since the dashboard never displays history, we strip that
// section before parsing so display stays robust against past corruption.
// The hand-rolled regex helpers above are still used as a last-resort fallback
// when js-yaml gives up entirely.
function parseEnvelope(content: string): Record<string, any> | null {
  const sanitized = content.replace(/^history:[\s\S]*?(?=^[a-z][a-z_]*:)/m, "history: []\n");
  // `json: true` enables JSON-superset mode: duplicate mapping keys take
  // last-wins semantics instead of throwing. Some legacy envelopes have
  // duplicate `report:` keys from a runner write bug; we want to read them.
  try {
    const doc = yamlLoad(sanitized, { json: true });
    if (doc && typeof doc === "object") return doc as Record<string, any>;
  } catch {}
  try {
    const doc = yamlLoad(content, { json: true });
    if (doc && typeof doc === "object") return doc as Record<string, any>;
  } catch {}
  return null;
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value === "" ? null : value;
  // js-yaml parses ISO-8601 timestamps into Date objects. Re-emit as ISO so
  // string comparisons (sort, since-filter) stay chronological. `String(Date)`
  // produces locale-formatted output like "Thu May 07 2026 …" that doesn't
  // sort correctly.
  if (value instanceof Date) return value.toISOString();
  return String(value);
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
            const content = await readFile(join(dir, f), "utf-8");
            const doc = parseEnvelope(content);
            if (!doc) continue;
            const status = asString(doc.status);
            const brief = asString(doc.summary?.brief) || asString(doc.brief);
            if (status === "waiting:on:user") {
              summary.waitingUser.push({ agent, file: f, summary: brief.slice(0, 200) });
            }
          } catch {}
        }
      }
      if (bucket === "failed") {
        for (const f of yamls) {
          try {
            const content = await readFile(join(dir, f), "utf-8");
            const doc = parseEnvelope(content);
            if (!doc) continue;
            if (asString(doc.status) === "escalated") {
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
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  const doc = parseEnvelope(content);
  if (!doc) return null;

  const id = asString(doc.id) || file.replace(/\.yaml$/, "");
  const parentVal = doc.parent;
  const parent =
    parentVal == null || parentVal === "null" || parentVal === "" ? null : String(parentVal);

  const ctxRaw = Array.isArray(doc.context) ? doc.context : [];
  const context = ctxRaw.map((c) => asString(c)).filter(Boolean);

  const dispatch = (doc.dispatch && typeof doc.dispatch === "object" ? doc.dispatch : {}) as Record<string, any>;
  const summary = (doc.summary && typeof doc.summary === "object" ? doc.summary : {}) as Record<string, any>;

  const envelopePath = `agents/${agent}/tasks/${bucket}/${file}`;
  const taskIdLeaf = file.replace(/\.yaml$/, "");
  // `report:` is a top-level field — the worker sets it via
  // <task-done report="path/to/produced/file.md"/>. Three forms accepted:
  //   (a) relative leaf "<id>.md" — resolve against current bucket (preferred,
  //       v1.2+; survives bucket transitions on revisit).
  //   (b) full repo-relative path to a sibling deliverable (Notes/..., repos/...) —
  //       use as-is.
  //   (c) legacy bucket-bound "agents/<a>/tasks/<bucket>/<id>.md" — try as-is,
  //       fall back to current bucket if the file moved (revisit case).
  // If `report:` is empty/unset, fall back to the v1.2 file-rendezvous
  // convention (`<id>.md` in the current bucket).
  let reportPath: string | null = asNullableString(doc.report);
  if (reportPath) {
    const looksLikeLeaf = !reportPath.includes("/");
    const looksLikeBucketBound = /^agents\/[^/]+\/tasks\/(?:done|failed|waiting|open)\/[^/]+\.md$/.test(reportPath);
    if (looksLikeLeaf) {
      const candidate = join(AGENTS_DIR, agent, "tasks", bucket, reportPath);
      reportPath = existsSync(candidate)
        ? `agents/${agent}/tasks/${bucket}/${reportPath}`
        : null;
    } else if (looksLikeBucketBound) {
      // Legacy form: try literal path; if missing (envelope moved between
      // buckets), retry as a leaf in the current bucket.
      const literal = join(AGENTS_DIR, reportPath.replace(/^agents\//, ""));
      if (!existsSync(literal)) {
        const leaf = reportPath.split("/").pop() || "";
        const candidate = join(AGENTS_DIR, agent, "tasks", bucket, leaf);
        if (existsSync(candidate)) {
          reportPath = `agents/${agent}/tasks/${bucket}/${leaf}`;
        }
      }
    }
  }
  if (!reportPath) {
    const candidate = join(AGENTS_DIR, agent, "tasks", bucket, `${taskIdLeaf}.md`);
    if (existsSync(candidate)) {
      reportPath = `agents/${agent}/tasks/${bucket}/${taskIdLeaf}.md`;
    }
  }

  return {
    id,
    headline: asString(doc.headline),
    agent,
    bucket,
    status: asString(doc.status),
    kind: asString(doc.kind) || "other",
    from: asString(doc.from),
    to: asString(doc.to) || agent,
    parent,
    priority: asNullableString(doc.priority),
    brief: asString(doc.brief),
    summary: {
      brief: asString(summary.brief),
      response: asString(summary.response),
    },
    context,
    dispatch: {
      chat_id: asNullableString(dispatch.chat_id),
      chat_name: asNullableString(dispatch.chat_name),
      chat_preview: asNullableString(dispatch.chat_preview),
      chat_agent: asNullableString(dispatch.chat_agent),
      auto_resume: asNullableString(dispatch.auto_resume),
    },
    created: asNullableString(doc.created),
    updated: asNullableString(doc.updated),
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
