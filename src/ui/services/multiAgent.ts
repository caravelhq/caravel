// Read-only summary of the multi-agent task system (WAL-63 phase 4).
// Mirrors `node .claude/skills/task/script/task.mjs summary` output, but in
// the daemon process so the dashboard can render without shelling out.

import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";
import { listAgentNamesSync } from "../../agents";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

// Example roster used only when no agent profiles exist on disk and no env
// override is set. Real deployments derive the roster from agents/<name>/.
const EXAMPLE_AGENTS = ["alice", "bob", "ray"];
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

export interface TaskClosed {
  status: string; // closed | superseded | cancelled
  at: string | null;
  by: string | null;
  reason: string | null;
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
  // WAL-63 Phase 1: project tag for the Projects view. Auto-inferred from
  // context: paths when the envelope doesn't carry an explicit `project:`
  // field. Null means "unassigned" (or no Notes/Projects/<X>/ path found in
  // the context array).
  project: string | null;
  // WAL-63 Phase 1: user-attention overlay. Null until Kelly (or an
  // auto-rule) retires the task from the active inbox.
  closed: TaskClosed | null;
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
  // Additional deliverable paths surfaced via the YAML `report:` field
  // when it points to an external artefact (e.g. an FDP in repos/dev/...).
  // The task's own <id>.md rendezvous file is always the primary
  // reportPath when it exists; everything else flows here so the UI can
  // mount them as secondary tabs without dropping the worker's writeup.
  deliverables: string[];
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
// Quote any plain-scalar value that starts with a YAML reserved indicator
// (backtick or `@`). YAML forbids these at the start of a plain scalar, but
// briefs and `why:` annotations routinely paste code identifiers wrapped in
// backticks (e.g. `attributesByType()`). Without this pre-pass the entire
// envelope fails to parse and the task vanishes from the picker.
function quoteReservedScalarStarts(content: string): string {
  return content.replace(
    /^(\s+[a-z_][a-z0-9_]*:\s+)([`@][^\n]*)$/gm,
    (_m, key, val) => `${key}${JSON.stringify(val)}`
  );
}

// Repair runner-write artefact where a top-level key was written as both
// `lease: null` AND then immediately followed by indented sub-keys. YAML
// treats this as a conflict. Strip the `null` so the indented mapping wins.
function repairNullOverwrittenMappings(content: string): string {
  return content.replace(
    /^([a-z_][a-z0-9_]*):\s*null\s*\n(?=\s+[a-z_][a-z0-9_]*:)/gm,
    "$1:\n"
  );
}

// The hand-rolled regex helpers above are still used as a last-resort fallback
// when js-yaml gives up entirely.
function parseEnvelope(content: string): Record<string, any> | null {
  const sanitized = repairNullOverwrittenMappings(
    content.replace(/^history:[\s\S]*?(?=^[a-z][a-z_]*:)/m, "history: []\n")
  );
  const sanitizedQuoted = quoteReservedScalarStarts(sanitized);
  // `json: true` enables JSON-superset mode: duplicate mapping keys take
  // last-wins semantics instead of throwing. Some legacy envelopes have
  // duplicate `report:` keys from a runner write bug; we want to read them.
  try {
    const doc = yamlLoad(sanitizedQuoted, { json: true });
    if (doc && typeof doc === "object") return doc as Record<string, any>;
  } catch {}
  try {
    const doc = yamlLoad(sanitized, { json: true });
    if (doc && typeof doc === "object") return doc as Record<string, any>;
  } catch {}
  try {
    const doc = yamlLoad(quoteReservedScalarStarts(content), { json: true });
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

// WAL-63 Phase 1: scan context: paths for Notes/Projects/<X>/... entries and
// return the most-frequently-cited project folder. Stable on ties (first
// distinct project wins). Null when no context path resolves into a project
// folder. Anchored on the canonical `Notes/Projects/` prefix; relative paths
// like `../Notes/Projects/...` are deliberately ignored — context entries
// are repo-relative by contract.
const PROJECT_PATH_RE = /^Notes\/Projects\/([^/]+)\//;
function inferProjectFromContext(context: string[]): string | null {
  if (!context.length) return null;
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const entry of context) {
    const m = PROJECT_PATH_RE.exec(entry);
    if (!m) continue;
    const project = m[1];
    if (!counts.has(project)) order.push(project);
    counts.set(project, (counts.get(project) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  if (counts.size === 1) return order[0]!;
  let best = order[0]!;
  let bestCount = counts.get(best)!;
  for (const name of order) {
    const c = counts.get(name)!;
    if (c > bestCount) {
      best = name;
      bestCount = c;
    }
  }
  return best;
}

function envAgents(): string[] {
  const raw = process.env.CLAUDECLAW_MULTI_AGENT_AGENTS;
  if (raw) {
    const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  // Derive the roster from disk; fall back to the example set only when empty.
  const disk = listAgentNamesSync();
  return disk.length > 0 ? disk : EXAMPLE_AGENTS;
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

  // WAL-63 Phase 1: project tag — explicit field wins, else infer from
  // context paths. Inference picks the most-frequently-cited Notes/Projects/
  // <X>/ folder; ties broken by first-seen order.
  const explicitProject = asNullableString(doc.project);
  const project = explicitProject ?? inferProjectFromContext(context);

  // WAL-63 Phase 1: closed lifecycle block. Tolerates missing / null /
  // partially-filled shapes. A non-null `closed` requires `status` at
  // minimum; everything else is best-effort.
  const closedRaw = doc.closed;
  let closed: TaskClosed | null = null;
  if (closedRaw && typeof closedRaw === "object" && !Array.isArray(closedRaw)) {
    const closedObj = closedRaw as Record<string, any>;
    const closedStatus = asString(closedObj.status).trim();
    if (closedStatus) {
      closed = {
        status: closedStatus,
        at: asNullableString(closedObj.at),
        by: asNullableString(closedObj.by),
        reason: asNullableString(closedObj.reason),
      };
    }
  }

  const envelopePath = `agents/${agent}/tasks/${bucket}/${file}`;
  const taskIdLeaf = file.replace(/\.yaml$/, "");
  // Resolution rules (Kelly's 2026-05-18 fix):
  //
  //   primary `reportPath` is ALWAYS the worker's own rendezvous file
  //   `agents/<a>/tasks/<bucket>/<id>.md` when it exists. That's where
  //   the worker's done-writeup, summary, and frontmatter live — it
  //   must never be dropped from the panel.
  //
  //   any path from the YAML `report:` field (worker-set via
  //   <task-done report="…"/>) that points at a different file is folded
  //   into the `deliverables` array as a secondary tab. Common case:
  //   bob sets report to the FDP in repos/dev/features/; the task .md
  //   stays primary, the FDP becomes a sibling tab.
  //
  //   if the rendezvous .md doesn't exist (rare — legacy envelope or
  //   worker bug), fall back to whatever `report:` resolves to so the
  //   panel isn't empty.
  const rendezvousAbs = join(AGENTS_DIR, agent, "tasks", bucket, `${taskIdLeaf}.md`);
  const rendezvousRel = existsSync(rendezvousAbs)
    ? `agents/${agent}/tasks/${bucket}/${taskIdLeaf}.md`
    : null;

  const declaredReport = asNullableString(doc.report);
  let declaredResolved: string | null = null;
  if (declaredReport) {
    const looksLikeLeaf = !declaredReport.includes("/");
    const looksLikeBucketBound = /^agents\/[^/]+\/tasks\/(?:done|failed|waiting|open)\/[^/]+\.md$/.test(declaredReport);
    if (looksLikeLeaf) {
      const candidate = join(AGENTS_DIR, agent, "tasks", bucket, declaredReport);
      if (existsSync(candidate)) declaredResolved = `agents/${agent}/tasks/${bucket}/${declaredReport}`;
    } else if (looksLikeBucketBound) {
      const literal = join(AGENTS_DIR, declaredReport.replace(/^agents\//, ""));
      if (existsSync(literal)) {
        declaredResolved = declaredReport;
      } else {
        const leaf = declaredReport.split("/").pop() || "";
        const candidate = join(AGENTS_DIR, agent, "tasks", bucket, leaf);
        if (existsSync(candidate)) declaredResolved = `agents/${agent}/tasks/${bucket}/${leaf}`;
      }
    } else {
      // Full repo-relative path (Notes/..., repos/...). Trust the worker;
      // the dashboard's file-serve endpoint will surface the 404 if it's
      // wrong.
      declaredResolved = declaredReport;
    }
  }

  const reportPath: string | null = rendezvousRel ?? declaredResolved;
  const deliverables: string[] = [];
  if (declaredResolved && declaredResolved !== reportPath) {
    deliverables.push(declaredResolved);
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
    project,
    closed,
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
    deliverables,
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
