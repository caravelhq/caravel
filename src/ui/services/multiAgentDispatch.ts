// Form-based task dispatch — used by the dashboard's "new task" UI to create
// a task envelope without going through Alice in chat. Same effect as
// `node .claude/skills/task/script/task.mjs new` but in-process so the daemon
// can react immediately and surface validation errors back to the form.

import { mkdir, readdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { loadChat } from "./chats";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

const KNOWN_AGENTS = ["alice", "ray", "adam", "sam", "bob", "mark", "cliff"];
const KNOWN_KINDS = ["research", "code", "review", "summarise", "decide", "other"];
const KNOWN_PRIORITIES = ["P0", "P1", "P2", "P3"];

interface CreateTaskInput {
  to?: string;
  from?: string;
  parent?: string | null;
  reply_to?: string;
  kind?: string;
  priority?: string;
  headline?: string;
  brief?: string;
  output_format?: string;
  context?: string[];
  budget?: { max_turns?: number; max_subagents?: number; max_usd?: number | null };
  chat_id?: string | null;
  auto_resume?: boolean;
}

export type CreateTaskResult =
  | { ok: true; id: string; path: string }
  | { ok: false; error: string };

function todayPrefix(): string {
  const d = new Date();
  return `TSK-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Single-level decimal sub-task scheme: a task with a parent gets
// `{root}.NN` (zero-padded 2 digits) where `root` is the parent's top-level
// id (everything before the first `.`) and NN is the next unused integer
// suffix among existing children of that root. This keeps orchestration trees
// readable — grandchildren become siblings rather than nested deeper:
//   TSK-2026-05-04-0001 → TSK-2026-05-04-0001.01, .02, .03, ...
// Top-level tasks (no parent) keep the flat date-prefixed counter.
async function nextTaskId(parent: string | null): Promise<string> {
  // Include `archived` so ids that were swept off the active dirs are still
  // reserved and never reissued.
  const SCAN_DIRS = ["open", "waiting", "done", "failed", "archived"];

  if (parent) {
    const root = parent.split(".")[0]!;
    const childRe = new RegExp(`^${escapeRegex(root)}\\.(\\d+)\\.yaml$`);
    let maxN = 0;
    for (const a of KNOWN_AGENTS) {
      for (const sub of SCAN_DIRS) {
        const dir = join(AGENTS_DIR, a, "tasks", sub);
        if (!existsSync(dir)) continue;
        const entries = await readdir(dir).catch(() => [] as string[]);
        for (const e of entries) {
          const m = childRe.exec(e);
          if (!m) continue;
          const n = Number.parseInt(m[1] ?? "", 10);
          if (Number.isFinite(n) && n > maxN) maxN = n;
        }
      }
    }
    return `${root}.${String(maxN + 1).padStart(2, "0")}`;
  }

  const prefix = todayPrefix();
  let maxN = 0;
  for (const a of KNOWN_AGENTS) {
    for (const sub of SCAN_DIRS) {
      const dir = join(AGENTS_DIR, a, "tasks", sub);
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const e of entries) {
        if (!e.startsWith(prefix) || !e.endsWith(".yaml")) continue;
        const tail = e.slice(prefix.length, -5);
        // Skip child ids (contain a dot before .yaml) — those belong to the
        // sub-task counter, not the top-level one.
        if (tail.includes(".")) continue;
        const n = Number.parseInt(tail, 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return prefix + String(maxN + 1).padStart(4, "0");
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");
}

function yamlEscape(value: string): string {
  return JSON.stringify(value);
}

async function appendJournal(agent: string, entry: Record<string, unknown>): Promise<void> {
  const path = join(AGENTS_DIR, agent, "tasks", "journal.ndjson");
  await mkdir(join(AGENTS_DIR, agent, "tasks"), { recursive: true });
  await writeFile(path, JSON.stringify(entry) + "\n", { flag: "a" });
}

export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  const to = (input.to ?? "").trim();
  const from = (input.from ?? "user").trim() || "user";
  const kind = (input.kind ?? "other").trim();
  const priority = (input.priority ?? "P2").trim();
  const brief = (input.brief ?? "").trim();
  const outputFormat = (input.output_format ?? "").trim();
  const replyTo = (input.reply_to ?? from).trim() || from;
  const parent = input.parent && input.parent !== "null" ? String(input.parent).trim() : null;
  const context = Array.isArray(input.context) ? input.context.map((c) => String(c).trim()).filter(Boolean) : [];

  const headline = (input.headline ?? "").trim();

  if (!KNOWN_AGENTS.includes(to)) return { ok: false, error: `unknown target agent: ${to || "(empty)"}` };
  if (!KNOWN_KINDS.includes(kind)) return { ok: false, error: `unknown kind: ${kind}` };
  if (!KNOWN_PRIORITIES.includes(priority)) return { ok: false, error: `unknown priority: ${priority}` };
  if (!headline) return { ok: false, error: "headline is required (≤10 words)" };
  const headlineWords = headline.split(/\s+/).filter(Boolean).length;
  if (headlineWords > 10) return { ok: false, error: `headline too long (${headlineWords} words; max 10)` };
  if (!brief) return { ok: false, error: "brief is required" };
  if ((kind === "code" || kind === "review" || kind === "summarise") && !outputFormat) {
    return { ok: false, error: `output_format is required for kind=${kind}` };
  }

  const id = await nextTaskId(parent);
  const now = new Date().toISOString();

  const budget = {
    max_turns: input.budget?.max_turns ?? (kind === "code" ? 50 : kind === "decide" ? 10 : 30),
    max_subagents: input.budget?.max_subagents ?? 0,
    max_usd: input.budget?.max_usd ?? null,
  };

  // Stamp the originating chat's metadata onto the envelope so the dashboard
  // can show "from chat <name> · <preview>" without an extra fetch round-trip
  // and so the runner has enough info to post status updates with full
  // context. Best-effort: if the chat lookup fails we still record chat_id.
  const dispatchLines: string[] = [];
  if (input.chat_id) {
    dispatchLines.push(`dispatch:`);
    dispatchLines.push(`  chat_id: ${input.chat_id}`);
    dispatchLines.push(`  chat_ts: ${now}`);
    try {
      const chat = await loadChat(input.chat_id);
      if (chat) {
        if (chat.name) dispatchLines.push(`  chat_name: ${yamlEscape(chat.name)}`);
        if (chat.preview) dispatchLines.push(`  chat_preview: ${yamlEscape(chat.preview)}`);
        if (chat.agentId) dispatchLines.push(`  chat_agent: ${yamlEscape(chat.agentId)}`);
      }
    } catch {
      // Lookup failure is non-fatal — proceed with chat_id only.
    }
    if (input.auto_resume === false) dispatchLines.push(`  auto_resume: false`);
  }

  const contextBlock = context.length === 0
    ? `context: []`
    : `context:\n${context.map((c) => `  - ${c}`).join("\n")}`;

  const yaml = [
    `id: ${id}`,
    `headline: ${headline}`,
    `created: ${now}`,
    `updated: ${now}`,
    ``,
    `from: ${from}`,
    `to: ${to}`,
    `parent: ${parent ?? "null"}`,
    `reply_to: ${replyTo}`,
    ``,
    `kind: ${kind}`,
    `priority: ${priority}`,
    `deadline: null`,
    ``,
    `budget:`,
    `  max_turns: ${budget.max_turns}`,
    `  max_subagents: ${budget.max_subagents}`,
    `  max_usd: ${budget.max_usd ?? "null"}`,
    ``,
    `brief: |`,
    indent(brief, "  "),
    ``,
    outputFormat
      ? `output_format: |\n${indent(outputFormat, "  ")}\n`
      : `output_format: ""`,
    ``,
    contextBlock,
    ``,
    `status: open`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history:`,
    `  - ts: ${now}`,
    `    from: null`,
    `    to: open`,
    `    by: ${from}`,
    `    note: ${yamlEscape("created via dashboard /api/tasks/new")}`,
    ``,
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
    `report: ""`,
    ...(dispatchLines.length > 0 ? ["", ...dispatchLines] : []),
    ``,
  ].join("\n");

  const openDir = join(AGENTS_DIR, to, "tasks", "open");
  await mkdir(openDir, { recursive: true });
  const outPath = join(openDir, `${id}.yaml`);
  await writeFile(outPath, yaml);

  await appendJournal(to, {
    ts: now,
    id,
    status: "open",
    kind,
    from,
    to,
    parent,
    summary: "",
  });

  return { ok: true, id, path: outPath };
}

// === Close / Reopen (WAL-63 Phase 1) =======================================
//
// `closed` is the user-attention overlay on the envelope. It records that
// Kelly (or an automated rule on her behalf) has retired the task from the
// active inbox. Independent of the runner-owned `status` field — a closed
// task keeps whatever execution state it had when retired.
//
// The shape on disk is a top-level block:
//
//   closed:
//     status: closed | superseded | cancelled
//     at: <ISO-8601>
//     by: user | alice | runner | auto-on-next | auto-backfill | auto-backfill-archive
//     reason: "free-form note"
//
// Set to `null` (or omitted) means active. The dispatch writers below are the
// only path that mutates this field outside the backfill script and the
// runner's spawnNextTask / maybeCloseParentOnUserUnblock helpers.

export type ClosedStatus = "closed" | "superseded" | "cancelled";

export interface ClosedBlock {
  status: ClosedStatus;
  at: string;
  by: string;
  reason: string;
}

const TASK_BUCKETS = ["open", "waiting", "done", "failed"] as const;
type TaskBucket = (typeof TASK_BUCKETS)[number];

// Strip any existing `closed:` field from the YAML. Handles three shapes:
//   single-line scalar (`closed: null`, `closed: foo`)
//   inline mapping (`closed: { status: closed, ... }`)
//   block mapping (`closed:\n  status: ...\n  at: ...`)
// Returns the cleaned YAML. Idempotent — no-op when the field is absent.
function stripClosedBlock(yaml: string): string {
  // Block-mapping form first (multi-line, indented children).
  let next = yaml.replace(/^closed:\s*\n(?:[ \t]+[^\n]*\n?)+/m, "");
  // Then single-line scalar / inline mapping. Match the rest of the line
  // including its trailing newline so we don't leave a blank line behind.
  next = next.replace(/^closed:[^\n]*\n/m, "");
  return next;
}

function formatClosedBlock(closed: ClosedBlock): string {
  return (
    "closed:\n" +
    `  status: ${closed.status}\n` +
    `  at: ${closed.at}\n` +
    `  by: ${closed.by}\n` +
    `  reason: ${yamlEscape(closed.reason)}\n`
  );
}

// Insert a `closed:` block (or `closed: null` when clearing) immediately
// after the top-level `status:` line. Stable placement keeps the envelope
// readable across re-writes. Falls back to appending at end-of-document
// when no `status:` line exists.
function setClosedField(yaml: string, closed: ClosedBlock | null): string {
  const cleaned = stripClosedBlock(yaml);
  const insertion = closed === null ? "closed: null\n" : formatClosedBlock(closed);
  const statusRe = /^status:[^\n]*\n/m;
  if (statusRe.test(cleaned)) {
    return cleaned.replace(statusRe, (m) => m + insertion);
  }
  return cleaned.trimEnd() + "\n" + insertion;
}

// Locate the envelope file for (agent, taskId) across the four runner-owned
// buckets. The 'archived' bucket is intentionally excluded — closing an
// already-archived task is meaningless; the file has already left the active
// directories.
async function locateActiveEnvelope(
  agent: string,
  taskId: string
): Promise<{ path: string; bucket: TaskBucket } | null> {
  for (const bucket of TASK_BUCKETS) {
    const p = join(AGENTS_DIR, agent, "tasks", bucket, `${taskId}.yaml`);
    if (existsSync(p)) return { path: p, bucket };
  }
  return null;
}

interface CloseTaskInput {
  agent: string;
  taskId: string;
  status?: ClosedStatus; // explicit override; otherwise inferred from runner status
  reason?: string;
  by?: string;           // default "user"
  cascade?: boolean;     // close all non-closed descendants too
}

export type CloseTaskResult =
  | { ok: true; id: string; closed: ClosedBlock; cascaded: string[] }
  | { ok: false; error: string };

// Close a task — write the `closed` block on the envelope. Refuses if the
// task is currently `claimed` (a worker is mid-turn; cancel via Abort, not
// Close). Returns the closed block actually written so the UI can echo it.
//
// Cascade walks the family tree (children of children of …) and closes any
// non-closed descendant with status `cancelled`, reason citing the parent
// closure. Stops at already-closed descendants — those stay as they were.
// No file moves — closing is a metadata flip, not an archival operation.
// The runner's sweepArchive picks closed envelopes up later based on age.
export async function closeTask(input: CloseTaskInput): Promise<CloseTaskResult> {
  const agent = (input.agent ?? "").trim();
  const taskId = (input.taskId ?? "").trim();

  if (!KNOWN_AGENTS.includes(agent)) {
    return { ok: false, error: `unknown agent: ${agent || "(empty)"}` };
  }
  if (!/^TSK-/.test(taskId)) {
    return { ok: false, error: `invalid task id: ${taskId}` };
  }

  const loc = await locateActiveEnvelope(agent, taskId);
  if (!loc) {
    return { ok: false, error: `task ${taskId} not found in agents/${agent}/tasks/{open,waiting,done,failed}/` };
  }

  let yaml: string;
  try {
    yaml = await readFile(loc.path, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read envelope: ${String(err)}` };
  }

  const runnerStatus = (/^status:\s*(.*)$/m.exec(yaml)?.[1] ?? "").trim();
  if (runnerStatus === "claimed") {
    return { ok: false, error: "cannot close a claimed task — a worker is mid-turn. Wait for it to land or abort the lease." };
  }

  // If the envelope already carries a non-null closed block, this is a
  // re-close (idempotent). We still rewrite with the new metadata so the
  // history reflects who pushed the most recent close.
  const inferredStatus: ClosedStatus = input.status
    ? input.status
    : runnerStatus === "done"
      ? "closed"
      : "cancelled";

  const now = new Date().toISOString();
  const closed: ClosedBlock = {
    status: inferredStatus,
    at: now,
    by: (input.by ?? "user").trim() || "user",
    reason: (input.reason ?? "").trim(),
  };

  let nextYaml = setClosedField(yaml, closed);
  nextYaml = setUpdated(nextYaml, now);
  nextYaml = appendHistoryEntry(nextYaml, {
    ts: now,
    from: runnerStatus || loc.bucket,
    to: runnerStatus || loc.bucket,
    by: closed.by,
    note: `closed: ${closed.status}${closed.reason ? ` — ${closed.reason}` : ""}`,
  });
  await writeFile(loc.path, nextYaml);

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: runnerStatus || loc.bucket,
    transition: `closed:${closed.status}`,
    by: closed.by,
    note: closed.reason || `closed via dashboard`,
  });

  const cascaded: string[] = [];
  if (input.cascade) {
    const descendants = await collectActiveDescendants(taskId);
    for (const d of descendants) {
      try {
        const dYaml = await readFile(d.path, "utf-8");
        if (hasNonNullClosed(dYaml)) continue;
        const dStatus = (/^status:\s*(.*)$/m.exec(dYaml)?.[1] ?? "").trim();
        if (dStatus === "claimed") continue; // never bulldoze an in-flight worker
        const dClosed: ClosedBlock = {
          status: "cancelled",
          at: now,
          by: closed.by,
          reason: `cascade-cancelled by parent ${taskId} closure`,
        };
        let nextD = setClosedField(dYaml, dClosed);
        nextD = setUpdated(nextD, now);
        nextD = appendHistoryEntry(nextD, {
          ts: now,
          from: dStatus || d.bucket,
          to: dStatus || d.bucket,
          by: closed.by,
          note: dClosed.reason,
        });
        await writeFile(d.path, nextD);
        await appendJournal(d.agent, {
          ts: now,
          id: d.id,
          status: dStatus || d.bucket,
          transition: `closed:cancelled`,
          by: closed.by,
          note: dClosed.reason,
        });
        cascaded.push(d.id);
      } catch {
        // Skip descendants we can't read — they'll surface on the next pass.
      }
    }
  }

  return { ok: true, id: taskId, closed, cascaded };
}

interface ReopenTaskInput {
  agent: string;
  taskId: string;
  by?: string;
}

export type ReopenTaskResult =
  | { ok: true; id: string; previousStatus: ClosedStatus | null }
  | { ok: false; error: string };

// Drop the `closed` block back to null. Appends a history entry referencing
// the prior closed.status so the audit trail is preserved. No file moves —
// reopen leaves the envelope in whatever bucket the runner had it in.
// The task becomes an active leaf again; if it was previously superseded by
// a Next child, Kelly can hit Next from the reopened task to spawn a fresh
// alternative line.
export async function reopenTask(input: ReopenTaskInput): Promise<ReopenTaskResult> {
  const agent = (input.agent ?? "").trim();
  const taskId = (input.taskId ?? "").trim();

  if (!KNOWN_AGENTS.includes(agent)) {
    return { ok: false, error: `unknown agent: ${agent || "(empty)"}` };
  }
  if (!/^TSK-/.test(taskId)) {
    return { ok: false, error: `invalid task id: ${taskId}` };
  }

  const loc = await locateActiveEnvelope(agent, taskId);
  if (!loc) {
    return { ok: false, error: `task ${taskId} not found in agents/${agent}/tasks/{open,waiting,done,failed}/` };
  }

  let yaml: string;
  try {
    yaml = await readFile(loc.path, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read envelope: ${String(err)}` };
  }

  const previousStatus = extractClosedStatus(yaml);
  if (previousStatus === null) {
    return { ok: false, error: `task ${taskId} is not closed (closed.status is null)` };
  }

  const now = new Date().toISOString();
  const by = (input.by ?? "user").trim() || "user";
  const runnerStatus = (/^status:\s*(.*)$/m.exec(yaml)?.[1] ?? "").trim();

  let next = setClosedField(yaml, null);
  next = setUpdated(next, now);
  next = appendHistoryEntry(next, {
    ts: now,
    from: runnerStatus || loc.bucket,
    to: runnerStatus || loc.bucket,
    by,
    note: `reopened (previous closed.status was ${previousStatus})`,
  });
  await writeFile(loc.path, next);

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: runnerStatus || loc.bucket,
    transition: `reopened`,
    by,
    note: `previous closed.status was ${previousStatus}`,
  });

  return { ok: true, id: taskId, previousStatus: previousStatus as ClosedStatus };
}

// Pull the `closed.status` value from an envelope's YAML, returning null
// when the field is absent or explicitly null. Used by reopenTask + cascade
// short-circuiting; not as strict as TaskRow parsing (no js-yaml dep).
function extractClosedStatus(yaml: string): string | null {
  const blockMatch = /^closed:\s*\n((?:[ \t]+[^\n]*\n?)+)/m.exec(yaml);
  if (blockMatch) {
    const sub = /^[ \t]+status:\s*(.*)$/m.exec(blockMatch[1] ?? "");
    if (!sub) return null;
    const v = sub[1].trim();
    if (!v || v === "null") return null;
    return v.replace(/^["']|["']$/g, "");
  }
  const inlineMatch = /^closed:[ \t]*(.*)$/m.exec(yaml);
  if (!inlineMatch) return null;
  const raw = inlineMatch[1].trim();
  if (!raw || raw === "null") return null;
  // Inline mapping form e.g. `closed: {status: closed, ...}` — pluck status.
  const mapMatch = /status:\s*([^,}\s]+)/.exec(raw);
  if (mapMatch) return mapMatch[1].replace(/^["']|["']$/g, "");
  return null;
}

function hasNonNullClosed(yaml: string): boolean {
  return extractClosedStatus(yaml) !== null;
}

// Collect every descendant of `rootId` across all agents' active buckets.
// Iterative BFS — handles arbitrarily deep nesting but in practice the
// dispatch service flattens to one level (TSK-X.NN). Returns each match
// with agent/bucket/path so closeTask can rewrite it.
interface DescendantHit {
  id: string;
  agent: string;
  bucket: TaskBucket;
  path: string;
}

async function collectActiveDescendants(rootId: string): Promise<DescendantHit[]> {
  // Index every active envelope by id once, with its parent pointer. Cheap
  // because the active buckets are small and BFS keeps the search bounded.
  const index: Array<{ id: string; parent: string | null; agent: string; bucket: TaskBucket; path: string }> = [];
  for (const agent of KNOWN_AGENTS) {
    for (const bucket of TASK_BUCKETS) {
      const dir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const fname of entries) {
        if (!fname.endsWith(".yaml")) continue;
        const id = fname.replace(/\.yaml$/, "");
        const path = join(dir, fname);
        let content: string;
        try {
          content = await readFile(path, "utf-8");
        } catch {
          continue;
        }
        const parentMatch = /^parent:\s*(.*)$/m.exec(content);
        const parentRaw = parentMatch ? parentMatch[1].trim() : "";
        const parent = parentRaw && parentRaw !== "null" ? parentRaw : null;
        index.push({ id, parent, agent, bucket, path });
      }
    }
  }

  const byParent = new Map<string, typeof index>();
  for (const entry of index) {
    if (!entry.parent) continue;
    const list = byParent.get(entry.parent);
    if (list) list.push(entry);
    else byParent.set(entry.parent, [entry]);
  }

  const out: DescendantHit[] = [];
  const queue: string[] = [rootId];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const kids = byParent.get(cur) ?? [];
    for (const kid of kids) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      out.push({ id: kid.id, agent: kid.agent, bucket: kid.bucket, path: kid.path });
      queue.push(kid.id);
    }
  }
  return out;
}

// === Unblock waiting:on:user tasks ========================================
//
// When a worker emits <task-waiting on="user">, the runner parks the envelope
// in `agents/<agent>/tasks/waiting/<id>.yaml` with status `waiting:on:user`.
// Kelly resolves the block by typing a response in the dashboard task panel;
// we append it to the brief, flip status back to `open`, and move the file
// into `tasks/open/` so the runner re-claims on its next tick.

const HISTORY_RE = /^history:\s*\n((?:[ \t]+-[^\n]*\n(?:[ \t]+[^\n-][^\n]*\n)*)+)/m;
const BRIEF_BLOCK_RE = /^(brief:\s*\|[+-]?\s*\n)((?:[ \t]+.*\n?)*)/m;

function setStatus(yaml: string, status: string): string {
  return yaml.replace(/^status:\s*.*$/m, `status: ${status}`);
}

function setUpdated(yaml: string, ts: string): string {
  return yaml.replace(/^updated:\s*.*$/m, `updated: ${ts}`);
}

function appendHistoryEntry(
  yaml: string,
  entry: { ts: string; from: string; to: string; by: string; note: string }
): string {
  const block =
    `  - ts: ${entry.ts}\n` +
    `    from: ${entry.from}\n` +
    `    to: ${entry.to}\n` +
    `    by: ${entry.by}\n` +
    `    note: ${JSON.stringify(entry.note)}\n`;
  if (HISTORY_RE.test(yaml)) {
    return yaml.replace(HISTORY_RE, (match, items: string) => {
      // Insert after existing items, preserving any trailing blank line that
      // separates `history:` from the next top-level field.
      const trimmed = items.replace(/\n+$/, "\n");
      return `history:\n${trimmed}${block}`;
    });
  }
  if (/^history:.*$/m.test(yaml)) {
    return yaml.replace(/^history:.*$/m, () => `history:\n${block.trimEnd()}`);
  }
  return yaml + `\nhistory:\n${block}`;
}

function appendToBrief(yaml: string, addition: string): string {
  // Find the brief block scalar and append the addition (already indented).
  if (BRIEF_BLOCK_RE.test(yaml)) {
    return yaml.replace(BRIEF_BLOCK_RE, (match, header: string, body: string) => {
      const trimmed = body.replace(/\n+$/, "\n"); // collapse trailing blanks
      const indented = addition
        .split("\n")
        .map((l) => (l.length > 0 ? `  ${l}` : ""))
        .join("\n");
      return `${header}${trimmed}${indented}\n`;
    });
  }
  // No block-scalar brief — leave untouched (envelope is malformed).
  return yaml;
}

interface UnblockTaskInput {
  agent: string;
  taskId: string;
  response: string;
}

export type UnblockTaskResult =
  | { ok: true; id: string; path: string }
  | { ok: false; error: string };

const MAX_REVISITS = 5;

// Counts top-level entries in a `revisits:` block. Indented (4-space) lines
// belong to the previous entry's instruction body; only `  - ts:` rows count.
function countRevisits(yaml: string): number {
  const re = /^revisits:\s*\n((?:[ \t]+.*\n)+)/m;
  const m = re.exec(yaml);
  if (!m) return 0;
  const body = m[1];
  let count = 0;
  for (const line of body.split("\n")) {
    if (/^  - ts:/.test(line)) count += 1;
  }
  return count;
}

function appendRevisitEntry(yaml: string, entry: { ts: string; by: string; instruction: string }): string {
  const indented = entry.instruction
    .split("\n")
    .map((l) => (l.length > 0 ? `      ${l}` : ""))
    .join("\n");
  const block =
    `  - ts: ${entry.ts}\n` +
    `    by: ${entry.by}\n` +
    `    instruction: |\n` +
    `${indented}\n`;
  // Block-form header already present.
  if (/^revisits:[ \t]*\n/m.test(yaml) || /^revisits:[ \t]*$/m.test(yaml)) {
    return yaml.replace(/^revisits:[ \t]*\n?/m, (m) => m + block);
  }
  // Inline (`revisits: []` / `revisits: null`) — replace with block form.
  if (/^revisits:.*$/m.test(yaml)) {
    return yaml.replace(/^revisits:.*$/m, () => `revisits:\n${block.trimEnd()}`);
  }
  // Field absent — splice it just before the dispatch block (if present) or
  // append at end. Prefer "before dispatch:" so the order matches the schema.
  if (/^dispatch:/m.test(yaml)) {
    return yaml.replace(/^dispatch:/m, () => `revisits:\n${block.trimEnd()}\n\ndispatch:`);
  }
  return yaml.trimEnd() + `\n\nrevisits:\n${block}`;
}

interface RevisitTaskInput {
  agent: string;
  taskId: string;
  instruction: string;
}

export type RevisitTaskResult =
  | { ok: true; id: string; path: string; revisitCount: number }
  | { ok: false; error: string; code?: "cap" };

// Re-open a `done` or `failed` task with a follow-up instruction. Mirrors
// `unblockTask()` but the source bucket is done/ or failed/, the original
// brief is left untouched, and the new instruction is appended to a parallel
// `revisits:` array. Capped at MAX_REVISITS — past that, scope has drifted
// and the caller should use createTask({ parent: oldId, ... }) to spawn a
// child task instead.
export async function revisitTask(input: RevisitTaskInput): Promise<RevisitTaskResult> {
  const agent = (input.agent ?? "").trim();
  const taskId = (input.taskId ?? "").trim();
  const instruction = (input.instruction ?? "").trim();

  if (!KNOWN_AGENTS.includes(agent)) return { ok: false, error: `unknown agent: ${agent || "(empty)"}` };
  if (!/^TSK-/.test(taskId)) return { ok: false, error: `invalid task id: ${taskId}` };
  if (!instruction) return { ok: false, error: "instruction is required" };

  const donePath = join(AGENTS_DIR, agent, "tasks", "done", `${taskId}.yaml`);
  const failedPath = join(AGENTS_DIR, agent, "tasks", "failed", `${taskId}.yaml`);
  const openPath = join(AGENTS_DIR, agent, "tasks", "open", `${taskId}.yaml`);

  let sourcePath: string;
  let sourceBucket: "done" | "failed";
  if (existsSync(donePath)) {
    sourcePath = donePath;
    sourceBucket = "done";
  } else if (existsSync(failedPath)) {
    sourcePath = failedPath;
    sourceBucket = "failed";
  } else {
    return { ok: false, error: `task ${taskId} is not in agents/${agent}/tasks/{done,failed}/` };
  }

  let yaml: string;
  try {
    yaml = await readFile(sourcePath, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read envelope: ${String(err)}` };
  }

  const existingCount = countRevisits(yaml);
  if (existingCount >= MAX_REVISITS) {
    return {
      ok: false,
      code: "cap",
      error: `task already has ${existingCount} revisits (max ${MAX_REVISITS}); use Spawn Follow-up to create a child task instead`,
    };
  }

  const statusMatch = /^status:\s*(.*)$/m.exec(yaml);
  const currentStatus = statusMatch ? statusMatch[1].trim() : "";

  const now = new Date().toISOString();

  // Archive the prior run's `.md` rendezvous file by renaming to
  // `<id>.r{N}.md` in the same bucket (N = revisit count being created, 0-based
  // before increment). The runner only inspects `<id>.md` so this neutralises
  // any stale-signal risk while preserving Kelly's view of prior deliverables.
  // For task reports — where the `.md` body IS the deliverable — this prevents
  // the deletion bug fixed in 2026-05-06_revisit-loses-report.md.
  const sourceReportPath = join(AGENTS_DIR, agent, "tasks", sourceBucket, `${taskId}.md`);
  if (existsSync(sourceReportPath)) {
    const archivedPath = join(AGENTS_DIR, agent, "tasks", sourceBucket, `${taskId}.r${existingCount}.md`);
    try { await rename(sourceReportPath, archivedPath); } catch {}
  }

  let next = yaml;
  next = appendRevisitEntry(next, { ts: now, by: "user", instruction });
  next = setStatus(next, "open");
  next = setUpdated(next, now);
  // Clear the lease — the prior run's claim must not carry forward.
  next = next.replace(/^(lease:[\s\S]*?\n)( {2}holder:\s*.*)$/m, (_match, head, _line) => `${head}  holder: null`);
  next = next.replace(/^(lease:[\s\S]*?\n[\s\S]*?\n)( {2}expires:\s*.*)$/m, (_match, head, _line) => `${head}  expires: null`);
  next = appendHistoryEntry(next, {
    ts: now,
    from: currentStatus || sourceBucket,
    to: "open",
    by: "user",
    note: "revisit via dashboard",
  });

  await mkdir(join(AGENTS_DIR, agent, "tasks", "open"), { recursive: true });
  await writeFile(openPath, next);
  try {
    await unlink(sourcePath);
  } catch {
    // The new file is in place; the stale source copy is the only artefact.
  }

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: "open",
    transition: `${currentStatus || sourceBucket}→open`,
    by: "user",
    note: "revisit via dashboard",
    revisit_count: existingCount + 1,
  });

  return { ok: true, id: taskId, path: openPath, revisitCount: existingCount + 1 };
}

export async function unblockTask(input: UnblockTaskInput): Promise<UnblockTaskResult> {
  const agent = (input.agent ?? "").trim();
  const taskId = (input.taskId ?? "").trim();
  const response = (input.response ?? "").trim();

  if (!KNOWN_AGENTS.includes(agent)) return { ok: false, error: `unknown agent: ${agent || "(empty)"}` };
  if (!/^TSK-/.test(taskId)) return { ok: false, error: `invalid task id: ${taskId}` };
  if (!response) return { ok: false, error: "response is required" };

  const waitingPath = join(AGENTS_DIR, agent, "tasks", "waiting", `${taskId}.yaml`);
  const openPath = join(AGENTS_DIR, agent, "tasks", "open", `${taskId}.yaml`);

  if (!existsSync(waitingPath)) {
    return { ok: false, error: `task ${taskId} is not in agents/${agent}/tasks/waiting/` };
  }

  let yaml: string;
  try {
    yaml = await readFile(waitingPath, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read envelope: ${String(err)}` };
  }

  // Refuse to unblock anything not specifically waiting on user input.
  const statusMatch = /^status:\s*(.*)$/m.exec(yaml);
  const currentStatus = statusMatch ? statusMatch[1].trim() : "";
  if (currentStatus !== "waiting:on:user") {
    return { ok: false, error: `task status is "${currentStatus}", not "waiting:on:user"` };
  }

  const now = new Date().toISOString();

  // Also clear the worker's last waiting `.md` rendezvous file so the runner
  // doesn't re-trigger on stale signal when it claims again.
  const waitingReportPath = join(AGENTS_DIR, agent, "tasks", "waiting", `${taskId}.md`);
  if (existsSync(waitingReportPath)) {
    try { await unlink(waitingReportPath); } catch {}
  }

  let next = yaml;
  next = appendToBrief(
    next,
    `\n--- user response (${now}) ---\n${response}\n`
  );
  next = setStatus(next, "open");
  next = setUpdated(next, now);
  next = appendHistoryEntry(next, {
    ts: now,
    from: "waiting:on:user",
    to: "open",
    by: "user",
    note: "unblocked via dashboard",
  });

  // Write the modified content to the new location, then remove the old file.
  // Two-step (write + unlink) instead of rename-after-modify so a crash
  // mid-step leaves the envelope visible somewhere rather than corrupted.
  await mkdir(join(AGENTS_DIR, agent, "tasks", "open"), { recursive: true });
  await writeFile(openPath, next);
  try {
    await unlink(waitingPath);
  } catch (err) {
    // The new file is in place; the stale waiting copy is the only artefact.
    // Surface as a soft warning via the result rather than failing the call.
    return {
      ok: true,
      id: taskId,
      path: openPath,
    };
  }

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: "open",
    transition: "waiting:on:user→open",
    by: "user",
    note: "unblocked via dashboard",
  });

  return { ok: true, id: taskId, path: openPath };
}

// === Spawn-next child task ================================================
//
// Replaces the in-place mutation of revisitTask + unblockTask. Instead of
// re-opening the parent envelope, we leave it terminal (done/failed/waiting:
// on:user) and create a fresh child task with:
//
//   - parent: <parent id>
//   - to: same worker agent as parent
//   - brief: a tight envelope that says "continuation/rework of <parent>"
//     plus Kelly's instruction, with cross-links to the parent's report
//     and envelope for the agent's reference
//   - kind / priority / budget / dispatch: copied from parent
//   - context: empty (the agent's session thread already has the full
//     prior reasoning + file reads in cache, no need to re-prime)
//   - closes_parent_on_done: true when source=="unblock" — the runner
//     auto-closes the parent waiting:on:user envelope when this child
//     completes successfully
//
// The parent envelope gets a single history entry pointing at the child;
// its status, brief, and report are unchanged.

export type SpawnNextTaskInput = {
  agent: string;
  taskId: string;
  instruction: string;
  source: "revisit" | "unblock";
};

export type SpawnNextTaskResult =
  | { ok: true; id: string; path: string; parentId: string }
  | { ok: false; error: string };

export async function spawnNextTask(input: SpawnNextTaskInput): Promise<SpawnNextTaskResult> {
  const agent = (input.agent ?? "").trim();
  const taskId = (input.taskId ?? "").trim();
  const instruction = (input.instruction ?? "").trim();
  const source = input.source;

  if (!KNOWN_AGENTS.includes(agent)) return { ok: false, error: `unknown agent: ${agent || "(empty)"}` };
  if (!/^TSK-/.test(taskId)) return { ok: false, error: `invalid task id: ${taskId}` };
  if (!instruction) return { ok: false, error: "instruction is required" };
  if (source !== "revisit" && source !== "unblock") return { ok: false, error: `invalid source: ${source}` };

  // Locate parent envelope across the three terminal-ish buckets.
  const buckets = ["waiting", "done", "failed"] as const;
  type Bucket = typeof buckets[number];
  let parentPath: string | null = null;
  let parentBucket: Bucket | null = null;
  for (const b of buckets) {
    const p = join(AGENTS_DIR, agent, "tasks", b, `${taskId}.yaml`);
    if (existsSync(p)) {
      parentPath = p;
      parentBucket = b;
      break;
    }
  }
  if (!parentPath || !parentBucket) {
    return { ok: false, error: `parent task ${taskId} not in waiting/done/failed bucket for ${agent}` };
  }

  let parentYaml: string;
  try {
    parentYaml = await readFile(parentPath, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read parent envelope: ${String(err)}` };
  }

  const parentStatus = (/^status:\s*(.*)$/m.exec(parentYaml)?.[1] ?? "").trim();

  // Validate source against parent's bucket / status.
  if (source === "unblock") {
    if (parentBucket !== "waiting" || parentStatus !== "waiting:on:user") {
      return { ok: false, error: `unblock requires parent status waiting:on:user (got status="${parentStatus}", bucket=${parentBucket})` };
    }
  } else {
    if (parentBucket === "waiting") {
      return { ok: false, error: `revisit requires parent in done/failed (parent is in waiting/${parentStatus})` };
    }
  }

  const childId = await nextTaskId(taskId);
  const now = new Date().toISOString();

  // Copy across kind / priority / budget / dispatch from parent.
  const kind = (/^kind:\s*(.*)$/m.exec(parentYaml)?.[1] ?? "other").trim() || "other";
  const priority = (/^priority:\s*(.*)$/m.exec(parentYaml)?.[1] ?? "P2").trim() || "P2";
  const budgetBlock = parentYaml.match(/^budget:\s*\n((?:[ \t]+[^\n]+\n?)+)/m)?.[1]
    ?? "  max_turns: 30\n  max_subagents: 0\n  max_usd: null\n";
  const dispatchMatch = parentYaml.match(/^dispatch:\s*\n((?:[ \t]+[^\n]+\n?)+)/m);
  const dispatchBlock = dispatchMatch ? dispatchMatch[0].trimEnd() : "";

  // Cross-link parent's report path into the child's brief (if any).
  const reportMatch = /^report:\s*(?:"([^"]*)"|([^\n]*))/m.exec(parentYaml);
  const parentReport = ((reportMatch?.[1] ?? reportMatch?.[2] ?? "") + "").trim().replace(/^["']|["']$/g, "");
  const parentEnvelopePath = `agents/${agent}/tasks/${parentBucket}/${taskId}.yaml`;

  const parentHeadline = ((/^headline:\s*(.*)$/m.exec(parentYaml)?.[1] ?? "").trim() || taskId).slice(0, 56);
  const childHeadline = source === "unblock"
    ? `${parentHeadline} — continue with response`
    : `${parentHeadline} — rework`;

  const root = taskId.split(".")[0];
  const sessionHint = `Same session thread \`task-${root}-${agent}\` is resumed — your prior reasoning, file reads, and context remain in cache.`;

  const briefBody = source === "unblock"
    ? [
        `Continuation of **${taskId}** — you previously parked on \`waiting:on:user\` and Kelly has now responded.`,
        ``,
        sessionHint,
        ``,
        parentReport ? `Your prior report: \`${parentReport}\`` : `Parent envelope: \`${parentEnvelopePath}\``,
        ``,
        `### Kelly's response`,
        ``,
        instruction,
      ].filter((l) => l !== undefined).join("\n")
    : [
        `Rework of **${taskId}** (was status \`${parentStatus}\`). Kelly has new instructions below.`,
        ``,
        sessionHint,
        ``,
        parentReport ? `Your prior deliverable: \`${parentReport}\`` : `Parent envelope: \`${parentEnvelopePath}\``,
        ``,
        `### Kelly's rework instruction`,
        ``,
        instruction,
      ].filter((l) => l !== undefined).join("\n");

  const closesParent = source === "unblock";

  const childYaml = [
    `id: ${childId}`,
    `headline: ${yamlEscape(childHeadline)}`,
    `created: ${now}`,
    `updated: ${now}`,
    ``,
    `from: user`,
    `to: ${agent}`,
    `parent: ${taskId}`,
    `reply_to: user`,
    ``,
    `kind: ${kind}`,
    `priority: ${priority}`,
    `deadline: null`,
    ``,
    `budget:`,
    budgetBlock.trimEnd(),
    ``,
    `brief: |`,
    indent(briefBody, "  "),
    ``,
    `output_format: ""`,
    `context: []`,
    ``,
    `closes_parent_on_done: ${closesParent ? "true" : "false"}`,
    `parent_source: ${source}`,
    ``,
    `status: open`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history:`,
    `  - ts: ${now}`,
    `    from: null`,
    `    to: open`,
    `    by: user`,
    `    note: ${yamlEscape(`spawned as ${source} child of ${taskId}`)}`,
    ``,
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
    `report: ""`,
    ...(dispatchBlock ? ["", dispatchBlock] : []),
    ``,
  ].join("\n");

  const openDir = join(AGENTS_DIR, agent, "tasks", "open");
  await mkdir(openDir, { recursive: true });
  const childPath = join(openDir, `${childId}.yaml`);
  await writeFile(childPath, childYaml);

  // Append a history entry to the parent noting the child was spawned.
  // Parent stays in its bucket; runner status unchanged.
  const updatedParentYaml = appendHistoryEntry(parentYaml, {
    ts: now,
    from: parentStatus || parentBucket,
    to: parentStatus || parentBucket,
    by: "user",
    note: `spawned ${source} child ${childId}`,
  });
  // Bump updated so the picker re-sorts the parent.
  const bumpedParentYaml = setUpdated(updatedParentYaml, now);
  // WAL-63 Phase 1: auto-close-on-next. The child has taken over the
  // workflow slot, so the parent moves to `closed.status: superseded`
  // unconditionally — across all Next sources. The parent's runner status
  // is unchanged; this is purely a user-attention transition. If Kelly
  // later decides the child was the wrong direction, the Reopen button
  // drops the closed block and the parent re-surfaces as an active leaf.
  const supersededParentYaml = setClosedField(bumpedParentYaml, {
    status: "superseded",
    at: now,
    by: "auto-on-next",
    reason: `spawned child ${childId} via ${source}`,
  });
  await writeFile(parentPath, supersededParentYaml);

  await appendJournal(agent, {
    ts: now,
    id: childId,
    status: "open",
    kind,
    from: "user",
    to: agent,
    parent: taskId,
    summary: `${source} child of ${taskId}`,
  });

  return { ok: true, id: childId, path: childPath, parentId: taskId };
}
