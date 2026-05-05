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

// Decimal sub-task scheme: a task with a parent gets `{parent}.N` where N is
// the next unused integer suffix among existing siblings (children of the same
// parent). This lets reviewers trace orchestration trees from the id alone:
// TSK-2026-05-04-0001 → TSK-2026-05-04-0001.1 → TSK-2026-05-04-0001.1.2 etc.
// Top-level tasks (no parent) keep the flat date-prefixed counter.
async function nextTaskId(parent: string | null): Promise<string> {
  // Include `archived` so ids that were swept off the active dirs are still
  // reserved and never reissued.
  const SCAN_DIRS = ["open", "waiting", "done", "failed", "archived"];

  if (parent) {
    const childRe = new RegExp(`^${escapeRegex(parent)}\\.(\\d+)\\.yaml$`);
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
    return `${parent}.${maxN + 1}`;
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
  const from = (input.from ?? "kelly").trim() || "kelly";
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
    `\n--- kelly response (${now}) ---\n${response}\n`
  );
  next = setStatus(next, "open");
  next = setUpdated(next, now);
  next = appendHistoryEntry(next, {
    ts: now,
    from: "waiting:on:user",
    to: "open",
    by: "kelly",
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
    by: "kelly",
    note: "unblocked via dashboard",
  });

  return { ok: true, id: taskId, path: openPath };
}
