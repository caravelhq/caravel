// Multi-agent task pickup loop (WAL-63 phase 2).
//
// Additive module — wired in `commands/start.ts` only when the feature flag
// `CLAUDECLAW_MULTI_AGENT_RUNNER=1` is set (or settings.multiAgent.enabled is
// true). When the flag is off, this module is never imported by the daemon
// startup path; rolling back to phase-1 behaviour is a single env var flip.
//
// What it does each tick (default 30s):
//   1. Scans `agents/<name>/tasks/open/*.yaml` across all known agents.
//   2. For each task with `status: open`, claims it (sets lease, rewrites
//      status to `claimed`, appends a journal entry).
//   3. Spawns a worker by invoking the existing `streamUserMessage` runner
//      with the agent's profile loaded — the worker's CLAUDE.md and rules
//      are picked up automatically by the runner.
//   4. Captures the worker's response stream and parses for a single
//      `<task-done summary="...">` or `<task-failed reason="..." summary="...">`
//      directive.
//   5. On directive: rewrites YAML, moves the file to `tasks/done/` or
//      `tasks/failed/`, appends a final journal entry.
//
// What it does NOT do (yet):
//   - Lease-expiry sweep (a stale claim sits in tasks/open/ until a
//     human or follow-up phase moves it). Implementation hook is left as
//     a TODO so the rollback diff stays small.
//   - Direct Alice escalation tooling (phase 3).
//   - Dashboard wiring (phase 4).

import { readdir, readFile, writeFile, rename, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { streamUserMessage } from "./runner";
import { appendMessage } from "./ui/services/chats";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

// Default agent roster — kept in sync with .claude/skills/task/script/task.mjs.
// Override at runtime via CLAUDECLAW_MULTI_AGENT_AGENTS=alice,ray,...
const DEFAULT_AGENTS = ["alice", "ray", "adam", "sam", "bob", "mark", "cliff"];

const DEFAULT_TICK_MS = 30 * 1000;
const DEFAULT_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_PER_AGENT_CONCURRENCY = 1;
// How long a terminal/waiting task lives in its bucket before being moved
// to tasks/archived/<bucket>/. Keeps the working directories small without
// losing history. Override via CLAUDECLAW_MULTI_AGENT_ARCHIVE_DAYS.
const DEFAULT_ARCHIVE_DAYS = 7;
const ARCHIVABLE_BUCKETS = ["done", "failed", "waiting"] as const;

interface MultiAgentOptions {
  agents?: string[];
  tickMs?: number;
  leaseMs?: number;
  perAgentConcurrency?: number;
}

interface MultiAgentHandle {
  stop: () => void;
}

interface TaskFields {
  id: string;
  status: string;
  to: string;
  from: string;
  kind: string;
  parent: string | null;
}

// === YAML helpers (regex-based, mirrors task.mjs to avoid a YAML dep) =====

function readField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

function setField(yaml: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:\\s*.*$`, "m");
  if (re.test(yaml)) return yaml.replace(re, `${key}: ${value}`);
  return yaml + `\n${key}: ${value}\n`;
}

function setNestedField(yaml: string, parent: string, key: string, value: string): string {
  // Replaces `  <key>: ...` line under a `<parent>:` block. Adds the line if
  // the parent block exists but the key is missing. Leaves untouched if the
  // parent block is absent (envelope is malformed; let it fail in YAML lint).
  const lineRe = new RegExp(`^(${parent}:[\\s\\S]*?\\n)( {2}${key}:\\s*.*)$`, "m");
  if (lineRe.test(yaml)) {
    return yaml.replace(lineRe, (_m, head: string) => `${head}  ${key}: ${value}`);
  }
  // Parent exists but no key line — splice it in.
  const parentRe = new RegExp(`^(${parent}:.*)$`, "m");
  if (parentRe.test(yaml)) {
    return yaml.replace(parentRe, (_m, head: string) => `${head}\n  ${key}: ${value}`);
  }
  return yaml;
}

function appendHistory(yaml: string, entry: { ts: string; from: string; to: string; by: string; note: string }): string {
  const block =
    `  - ts: ${entry.ts}\n` +
    `    from: ${entry.from}\n` +
    `    to: ${entry.to}\n` +
    `    by: ${entry.by}\n` +
    `    note: ${JSON.stringify(entry.note)}\n`;
  // Block-form header already present (`history:` alone or `history:\n`).
  if (/^history:\s*$/m.test(yaml) || /^history:\s*\n/m.test(yaml)) {
    return yaml.replace(/^history:\s*\n?/m, (m) => m + block);
  }
  // Inline value (`history: []`, `history: null`, etc.) — replace with block
  // form. Appending list items below an inline value produces invalid YAML
  // (the inline `[]` declared an empty array; siblings can't follow).
  if (/^history:.*$/m.test(yaml)) {
    return yaml.replace(/^history:.*$/m, () => `history:\n${block.trimEnd()}`);
  }
  return yaml + `\nhistory:\n${block}`;
}

function parseFields(yaml: string, idFallback: string): TaskFields {
  const id = readField(yaml, "id") ?? idFallback;
  const status = readField(yaml, "status") ?? "open";
  const to = readField(yaml, "to") ?? "";
  const from = readField(yaml, "from") ?? "unknown";
  const kind = readField(yaml, "kind") ?? "other";
  const parentRaw = readField(yaml, "parent");
  const parent = parentRaw && parentRaw !== "null" ? parentRaw : null;
  return { id, status, to, from, kind, parent };
}

// Read `<parent>:` block's `<key>:` value. Returns null if either is absent or
// the value is the literal `null`.
function readNestedField(yaml: string, parent: string, key: string): string | null {
  const blockRe = new RegExp(`^${parent}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, "m");
  const blockMatch = blockRe.exec(yaml);
  if (!blockMatch) return null;
  const lineRe = new RegExp(`^[ \\t]+${key}:\\s*(.*)$`, "m");
  const lineMatch = lineRe.exec(blockMatch[1] ?? "");
  if (!lineMatch) return null;
  const raw = lineMatch[1].trim();
  if (!raw || raw === "null") return null;
  return raw;
}

// === Journal append ========================================================

async function appendJournal(
  agent: string,
  entry: Record<string, unknown>
): Promise<void> {
  const path = join(AGENTS_DIR, agent, "tasks", "journal.ndjson");
  await mkdir(join(AGENTS_DIR, agent, "tasks"), { recursive: true });
  await writeFile(path, JSON.stringify(entry) + "\n", { flag: "a" });
}

// === Directive parser =====================================================
//
// Workers signal completion by emitting a single directive in their final
// response. Two forms supported:
//
//   <task-done summary="≤2-line restatement of result">…optional body…</task-done>
//   <task-failed reason="budget|tool|refusal|context|dependency|crash|timeout|other"
//                summary="≤2-line restatement">…</task-failed>
//
// The body (if present) is the worker's full report. We strip the directive
// from any UI-visible output and persist it on the envelope.

interface TaskDirective {
  kind: "done" | "failed" | "waiting";
  reason: string | null;
  summary: string;
  body: string;
  report: string | null;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = m[2];
  return out;
}

// File-as-output rendezvous: workers are now contracted to write
// `agents/<agent>/tasks/<status>/<id>.md` with frontmatter as their primary
// completion signal. This survives output truncation in a way the XML
// directive does not. The runner checks for the file after the worker's
// session ends; if found, it synthesises a TaskDirective from the frontmatter.
//
// Looked-for paths (in order): done/<id>.md, failed/<id>.md, waiting/<id>.md.
// The first one that exists wins. Multiple is a worker bug — log and use done.
async function readReportFile(agent: string, taskId: string): Promise<TaskDirective | null> {
  const buckets: Array<"done" | "failed" | "waiting"> = ["done", "failed", "waiting"];
  for (const bucket of buckets) {
    const path = join(AGENTS_DIR, agent, "tasks", bucket, `${taskId}.md`);
    if (!existsSync(path)) continue;

    let content: string;
    try {
      content = await readFile(path, "utf-8");
    } catch {
      continue;
    }

    const fm = extractFrontmatter(content);
    if (!fm) {
      console.warn(`[multi-agent] ${agent}/${taskId}: report file at ${path} has no frontmatter — skipping`);
      continue;
    }

    const status = (fm.status ?? bucket).toLowerCase().trim();
    const summary = (fm.summary ?? "").trim();
    const body = stripFrontmatter(content).trim();

    if (status === "done" || bucket === "done") {
      const reportPath = (fm.report_path ?? "").trim();
      // If the worker pointed report_path at a sibling deliverable, link to
      // that. Otherwise the report IS this .md file — link there so the
      // dashboard can open it directly.
      const report = reportPath || `agents/${agent}/tasks/${bucket}/${taskId}.md`;
      return {
        kind: "done",
        reason: null,
        summary: summary || "(no summary)",
        body,
        report,
      };
    }
    if (status === "failed" || bucket === "failed") {
      const reason = (fm.reason ?? "other").toLowerCase().trim();
      return {
        kind: "failed",
        reason,
        summary: summary || `failed:${reason}`,
        body,
        report: null,
      };
    }
    if (status === "waiting" || bucket === "waiting") {
      const on = (fm.waiting_on ?? fm.on ?? "user").trim();
      return {
        kind: "waiting",
        reason: on,
        summary: summary || `waiting on ${on}`,
        body,
        report: null,
      };
    }
  }
  return null;
}

// Lightweight YAML frontmatter parser. Pulls top-level scalar key:value pairs
// from a `---`-fenced block at the start of a markdown file. Quotes are
// stripped; nested structures are ignored (return null for the key).
function extractFrontmatter(content: string): Record<string, string> | null {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[kv[1]] = value;
  }
  return out;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, "");
}

function parseDirective(text: string): TaskDirective | null {
  const doneMatch = /<task-done([^>]*)>([\s\S]*?)<\/task-done>/.exec(text);
  if (doneMatch) {
    const attrs = parseAttrs(doneMatch[1] ?? "");
    return {
      kind: "done",
      reason: null,
      summary: (attrs.summary ?? "").trim(),
      body: (doneMatch[2] ?? "").trim(),
      report: attrs.report ? attrs.report.trim() : null,
    };
  }
  const failMatch = /<task-failed([^>]*)>([\s\S]*?)<\/task-failed>/.exec(text);
  if (failMatch) {
    const attrs = parseAttrs(failMatch[1] ?? "");
    return {
      kind: "failed",
      reason: attrs.reason ?? "other",
      summary: (attrs.summary ?? "").trim(),
      body: (failMatch[2] ?? "").trim(),
      report: null,
    };
  }
  const waitMatch = /<task-waiting([^>]*)>([\s\S]*?)<\/task-waiting>/.exec(text);
  if (waitMatch) {
    const attrs = parseAttrs(waitMatch[1] ?? "");
    return {
      kind: "waiting",
      reason: attrs.on ?? "user",
      summary: (attrs.summary ?? "").trim(),
      body: (waitMatch[2] ?? "").trim(),
      report: null,
    };
  }
  return null;
}

// === Worker prompt =========================================================

function buildWorkerPrompt(yaml: string, taskId: string): string {
  // The worker has its own CLAUDE.md and rules already loaded by the runner.
  // The prompt is the brief itself plus the file-as-output contract.
  const brief = readField(yaml, "brief") ?? "";
  const agent = readField(yaml, "to") ?? "<self>";
  return [
    `You have been delegated task ${taskId}. The full envelope is at:`,
    `  agents/${agent}/tasks/open/${taskId}.yaml`,
    "",
    "Brief:",
    brief.trim() || "(see envelope)",
    "",
    "## How to return your result (primary contract)",
    "",
    `Your final action MUST be a Write call that creates this file:`,
    "",
    `  agents/${agent}/tasks/<status>/${taskId}.md`,
    "",
    "where <status> is one of `done`, `failed`, or `waiting`. The file is your deliverable AND your closing signal — the runner reads its frontmatter to decide what happened.",
    "",
    "Frontmatter shapes:",
    "",
    "Done:",
    "```",
    "---",
    "status: done",
    "summary: One-line restatement of what you produced and where it landed.",
    "report_path: optional/path/to/separate/deliverable.md  # omit if the body IS the deliverable",
    "---",
    "(your full writeup; this file IS the report unless report_path points elsewhere)",
    "```",
    "",
    "Failed:",
    "```",
    "---",
    "status: failed",
    "reason: budget | tool | refusal | context | crash | timeout | other",
    "summary: One-line explanation of what blocked you.",
    "---",
    "(optional: longer explanation)",
    "```",
    "",
    "Waiting:",
    "```",
    "---",
    "status: waiting",
    "waiting_on: task:TSK-... | agent:<name> | user",
    "summary: One-line statement of what you're waiting on.",
    "---",
    "(optional notes)",
    "```",
    "",
    "Write this file with the Write tool, AS THE LAST THING IN YOUR TURN. Don't print the contents to chat — write the file.",
    "",
    "Use `waiting` when you cannot proceed because you need another task's output, another agent's work, or Kelly's input. The runner parks your envelope and re-claims when the dependency clears. NEVER use `failed: dependency` — that's a worker bug; use `waiting` instead.",
    "",
    "Delegation: if your brief requires inputs you don't have (deeper research, code review, etc.) you can dispatch sub-tasks via the `/task` skill. After dispatching, write a `waiting` file with `waiting_on: task:TSK-...`. The runner re-claims your envelope when the sub-task lands in `done/`.",
    "",
    "## Fallback (legacy)",
    "",
    "If for some reason you cannot write the file, you MAY end your response with one of these XML directives instead. The runner uses them only when the file is missing:",
    "",
    `  <task-done summary="..." report="path/to/produced/file.md">…optional inline body…</task-done>`,
    `  <task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>`,
    `  <task-waiting on="task:<id>|agent:<name>|user" summary="why blocked">…optional notes…</task-waiting>`,
    "",
    "The file is preferred because it survives output-truncation; a directive at the end of a long response can get cut off and lost.",
  ].join("\n");
}

// === Claim + transition =====================================================

async function claimTask(
  agent: string,
  taskId: string,
  filePath: string,
  leaseMs: number
): Promise<TaskFields | null> {
  let yaml: string;
  try {
    yaml = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const fields = parseFields(yaml, taskId);
  if (fields.status !== "open") return null;

  const now = new Date().toISOString();
  const expires = new Date(Date.now() + leaseMs).toISOString();
  const holder = `runner-${process.pid}`;

  let next = setField(yaml, "status", "claimed");
  next = setField(next, "updated", now);
  next = setNestedField(next, "lease", "holder", holder);
  next = setNestedField(next, "lease", "expires", expires);
  next = appendHistory(next, {
    ts: now,
    from: "open",
    to: "claimed",
    by: holder,
    note: "auto-claimed by multi-agent runner",
  });

  await writeFile(filePath, next);
  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: "claimed",
    kind: fields.kind,
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: "auto-claimed",
  });
  return fields;
}

// Post a passive status notification to the chat that originally spawned this
// task (if any), and — if Alice was the dispatcher — enqueue a continuation
// envelope in her own queue so the runner wakes her out-of-band rather than
// impersonating Kelly with a synthetic user message. The chat_id is stamped on
// the envelope at /task dispatch time. No-ops cleanly when the chat doesn't
// exist (e.g. dashboard-spawned tasks without a chat thread).
//
// Behaviour:
//   - assistant-role status message ALWAYS posts (visible to Kelly,
//     non-interrupting).
//   - If `from: alice` AND `to: <not alice>` AND directive is `done` or
//     `failed`, write a continuation envelope to agents/alice/tasks/open/
//     so Alice's normal worker tick processes the result and decides next
//     step. She surfaces back to chat by completing her continuation with
//     a `<task-done>` summary, which posts as the next assistant status.
//   - `<task-waiting on="user">` from Alice's continuation is the only
//     channel that should ask Kelly for input; the status message says so
//     and Kelly's next chat turn naturally fires the chat processor.
async function notifyDispatchChat(
  yaml: string,
  agent: string,
  taskId: string,
  finalStatus: string,
  directive: TaskDirective
): Promise<void> {
  const chatId = readNestedField(yaml, "dispatch", "chat_id");
  if (!chatId) return;

  const verb = directive.kind === "done"
    ? "completed"
    : directive.kind === "waiting"
    ? "is waiting"
    : "failed";
  const headline = `**Task ${taskId}** (${agent}) ${verb}.`;
  const status = `Status: \`${finalStatus}\``;
  const summary = directive.summary ? `\nSummary: ${directive.summary}` : "";

  const subdir = directive.kind === "waiting"
    ? "waiting"
    : directive.kind === "done"
    ? "done"
    : "failed";
  const envelopePath = `agents/${agent}/tasks/${subdir}/${taskId}.yaml`;
  const reportLine = directive.kind === "done" && directive.report
    ? `\nReport: \`${directive.report}\`\nEnvelope: \`${envelopePath}\``
    : `\nEnvelope: \`${envelopePath}\``;

  const notificationText = `${headline}\n${status}${summary}${reportLine}`;

  try {
    await appendMessage(chatId, {
      role: "assistant",
      text: notificationText,
      state: "done",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error(`[multi-agent] failed to notify chat ${chatId}:`, err);
    return;
  }

  // Continuation: if Alice dispatched this sub-task, enqueue a follow-up in
  // her own queue. The runner ticks alice/tasks/open/ on the normal cadence,
  // so she wakes there — never via a synthetic user prompt in Kelly's chat.
  // Skip when Alice was the worker herself (her own completion IS the chat
  // surface — the assistant status message above already conveys it).
  const from = readField(yaml, "from");
  const to = readField(yaml, "to");
  if (
    from === "alice" &&
    to !== "alice" &&
    (directive.kind === "done" || directive.kind === "failed")
  ) {
    try {
      // Carry the chat metadata stamped on the parent through to the
      // continuation envelope so the dashboard / runner has full context
      // without a re-fetch.
      const chatName = readNestedField(yaml, "dispatch", "chat_name");
      const chatPreview = readNestedField(yaml, "dispatch", "chat_preview");
      const chatAgent = readNestedField(yaml, "dispatch", "chat_agent");
      await enqueueAliceContinuation({
        chatId,
        chatName,
        chatPreview,
        chatAgent,
        completedTaskId: taskId,
        completedAgent: agent,
        completedSubdir: subdir,
        directive,
      });
    } catch (err) {
      console.error(`[multi-agent] failed to enqueue alice continuation for ${taskId}:`, err);
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generate a task id for Alice's continuation queue.
//
// Decimal sub-task scheme (mirrors the dispatch service):
//   - When `parent` is provided (the normal continuation path), the new id is
//     `{parent}.N` where N is the next unused integer suffix among existing
//     children of that parent. Scans every agent's task dirs because children
//     of an Alice-dispatched task may live anywhere.
//   - When `parent` is null (defensive fallback), use the flat
//     TSK-YYYY-MM-DD-NNNN counter scoped to Alice's own dirs.
async function nextAliceTaskId(parent: string | null): Promise<string> {
  // Include `archived` so ids swept off the active dirs are still reserved.
  const SCAN_DIRS = ["open", "waiting", "done", "failed", "archived"];

  if (parent) {
    const childRe = new RegExp(`^${escapeRegex(parent)}\\.(\\d+)\\.yaml$`);
    let maxN = 0;
    const knownAgents = readEnvAgents() ?? DEFAULT_AGENTS;
    for (const a of knownAgents) {
      for (const sub of SCAN_DIRS) {
        const dir = join(AGENTS_DIR, a, "tasks", sub);
        const entries = await readdir(dir).catch(() => [] as string[]);
        for (const fname of entries) {
          const m = childRe.exec(fname);
          if (!m) continue;
          const n = Number.parseInt(m[1] ?? "", 10);
          if (Number.isFinite(n) && n > maxN) maxN = n;
        }
      }
    }
    return `${parent}.${maxN + 1}`;
  }

  const d = new Date();
  const datePart =
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `TSK-${datePart}-`;
  let max = 0;
  for (const sub of SCAN_DIRS) {
    const dir = join(AGENTS_DIR, "alice", "tasks", sub);
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const fname of entries) {
      if (!fname.startsWith(prefix)) continue;
      const tail = fname.slice(prefix.length).replace(/\.yaml$/, "");
      if (tail.includes(".")) continue;
      const n = parseInt(tail, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function enqueueAliceContinuation(opts: {
  chatId: string;
  chatName?: string | null;
  chatPreview?: string | null;
  chatAgent?: string | null;
  completedTaskId: string;
  completedAgent: string;
  completedSubdir: string;
  directive: TaskDirective;
}): Promise<void> {
  const {
    chatId,
    chatName,
    chatPreview,
    chatAgent,
    completedTaskId,
    completedAgent,
    completedSubdir,
    directive,
  } = opts;
  const id = await nextAliceTaskId(completedTaskId);
  const now = new Date().toISOString();
  const subEnvelope = `agents/${completedAgent}/tasks/${completedSubdir}/${completedTaskId}.yaml`;
  const reportLine = directive.report
    ? `\n  - ${directive.report}`
    : "";
  const briefSummary = directive.summary || "(no summary)";
  const verb = directive.kind === "done" ? "completed" : "failed";

  const body = [
    `id: ${id}`,
    `headline: Continue chat after ${completedTaskId}`,
    `created: ${now}`,
    `updated: ${now}`,
    "",
    "from: runner",
    "to: alice",
    `parent: ${completedTaskId}`,
    "reply_to: null",
    "",
    "kind: continuation",
    "priority: P2",
    "deadline: null",
    "",
    "budget:",
    "  max_turns: 6",
    "  max_subagents: 0",
    "  max_usd: null",
    "",
    "brief: |",
    `  Sub-task ${completedTaskId} (${completedAgent}) ${verb}.`,
    `  Summary: ${briefSummary}`,
    "",
    `  Envelope: ${subEnvelope}`,
    directive.report ? `  Report: ${directive.report}` : "",
    "",
    `  You're orchestrating chat ${chatId}. Decide the next step:`,
    "    - To continue the orchestration: dispatch another /task and emit",
    "      <task-waiting on=\"task:TSK-...\"> so this continuation parks.",
    "    - To surface the outcome to Kelly: emit <task-done summary=\"...\">.",
    "      The summary is what Kelly will see in the chat.",
    "    - To request Kelly's input: emit <task-waiting on=\"user\" summary=\"...\">.",
    "      The summary will surface as a status message in the chat; Kelly's",
    "      next typed reply naturally re-engages this orchestration.",
    "",
    `output_format: ""`,
    "",
    "context:",
    `  - ${subEnvelope}`,
    directive.report ? `  - ${directive.report}` : "",
    "",
    "status: open",
    "lease:",
    "  holder: null",
    "  expires: null",
    "history:",
    `  - ts: ${now}`,
    "    from: null",
    "    to: open",
    "    by: runner",
    `    note: \"continuation enqueued after ${completedTaskId}\"`,
    "",
    "summary:",
    "  brief: \"\"",
    "  response: \"\"",
    "report: \"\"",
    "",
    "dispatch:",
    `  chat_id: ${chatId}`,
    `  chat_ts: ${now}`,
    chatName ? `  chat_name: ${JSON.stringify(chatName)}` : "",
    chatPreview ? `  chat_preview: ${JSON.stringify(chatPreview)}` : "",
    chatAgent ? `  chat_agent: ${JSON.stringify(chatAgent)}` : "",
    "",
  ]
    .filter((line) => line !== "" || true) // preserve blanks
    .join("\n");

  // Drop empty placeholder lines (from optional report fields).
  const cleanedBody = body
    .split("\n")
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  const openDir = join(AGENTS_DIR, "alice", "tasks", "open");
  await mkdir(openDir, { recursive: true });
  const outPath = join(openDir, `${id}.yaml`);
  await writeFile(outPath, cleanedBody);

  await appendJournal("alice", {
    ts: now,
    id,
    status: "open",
    kind: "continuation",
    from: "runner",
    to: "alice",
    parent: completedTaskId,
    summary: `enqueued after ${completedTaskId} ${verb}`,
  });

  console.log(
    `[multi-agent] enqueued alice continuation ${id} (parent ${completedTaskId} ${verb})`
  );
}

async function transitionToWaiting(
  agent: string,
  taskId: string,
  openPath: string,
  directive: TaskDirective
): Promise<void> {
  const targetDir = join(AGENTS_DIR, agent, "tasks", "waiting");
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${taskId}.yaml`);

  let yaml: string;
  try {
    yaml = await readFile(openPath, "utf-8");
  } catch {
    return;
  }
  const fields = parseFields(yaml, taskId);
  const now = new Date().toISOString();
  const onSpec = (directive.reason ?? "user").trim() || "user";
  const finalStatus = `waiting:on:${onSpec}`;

  let next = setField(yaml, "status", finalStatus);
  next = setField(next, "updated", now);
  // Release the lease so a stale claim-holder doesn't block re-claim.
  next = setNestedField(next, "lease", "holder", "null");
  next = setNestedField(next, "lease", "expires", "null");
  if (directive.summary) {
    next = setNestedField(next, "summary", "response", JSON.stringify(directive.summary));
  }
  next = appendHistory(next, {
    ts: now,
    from: "claimed",
    to: finalStatus,
    by: `runner-${process.pid}`,
    note: `worker waiting on ${onSpec}`,
  });

  await writeFile(openPath, next);
  await rename(openPath, targetPath);

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: finalStatus,
    kind: fields.kind,
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: directive.summary || `waiting on ${onSpec}`,
  });

  await notifyDispatchChat(next, agent, taskId, finalStatus, directive);
}

// Resolve a `waiting:on:<spec>` dependency. Returns true when the task can be
// moved back to `tasks/open/` for re-claim. Spec types:
//   task:<id>      → resolved iff that exact task id is in any agent's done/
//   agent:<name>   → resolved iff <name> has any task in their done/ (heuristic;
//                    refined later by claim-time filter if needed)
//   user           → never auto-resolves; only Kelly (or Alice acting on his
//                    behalf) can move it back
async function checkDependencyResolved(
  spec: string,
  knownAgents: string[]
): Promise<boolean> {
  if (spec === "user") return false;
  const colon = spec.indexOf(":");
  if (colon === -1) return false;
  const type = spec.slice(0, colon);
  const value = spec.slice(colon + 1);
  if (!type || !value) return false;

  if (type === "task") {
    for (const a of knownAgents) {
      if (existsSync(join(AGENTS_DIR, a, "tasks", "done", `${value}.yaml`))) return true;
    }
    return false;
  }
  if (type === "agent") {
    const path = join(AGENTS_DIR, value, "tasks", "done");
    if (!existsSync(path)) return false;
    const entries = await readdir(path).catch(() => [] as string[]);
    return entries.some((e) => e.endsWith(".yaml"));
  }
  return false;
}

async function sweepWaiting(opts: Required<MultiAgentOptions>): Promise<void> {
  for (const agent of opts.agents) {
    const waitDir = join(AGENTS_DIR, agent, "tasks", "waiting");
    if (!existsSync(waitDir)) continue;

    const entries = await readdir(waitDir).catch(() => [] as string[]);
    for (const fname of entries.filter((e) => e.endsWith(".yaml")).sort()) {
      const taskId = fname.replace(/\.yaml$/, "");
      const filePath = join(waitDir, fname);

      let yaml: string;
      try {
        yaml = await readFile(filePath, "utf-8");
      } catch { continue; }

      const status = readField(yaml, "status") ?? "";
      if (!status.startsWith("waiting:on:")) continue;
      const spec = status.slice("waiting:on:".length);

      const unblocked = await checkDependencyResolved(spec, opts.agents);
      if (!unblocked) continue;

      const fields = parseFields(yaml, taskId);
      const now = new Date().toISOString();
      let next = setField(yaml, "status", "open");
      next = setField(next, "updated", now);
      next = appendHistory(next, {
        ts: now,
        from: status,
        to: "open",
        by: `runner-${process.pid}`,
        note: `dependency resolved (${spec})`,
      });

      const openDir = join(AGENTS_DIR, agent, "tasks", "open");
      await mkdir(openDir, { recursive: true });
      const targetPath = join(openDir, fname);

      await writeFile(filePath, next);
      await rename(filePath, targetPath);

      await appendJournal(agent, {
        ts: now,
        id: taskId,
        status: "open",
        kind: fields.kind,
        from: fields.from,
        to: agent,
        parent: fields.parent,
        summary: `unblocked from ${spec}`,
      });

      console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} unblocked (${spec})`);
    }
  }
}

async function transitionToTerminal(
  agent: string,
  taskId: string,
  openPath: string,
  directive: TaskDirective
): Promise<void> {
  const subdir = directive.kind === "done" ? "done" : "failed";
  const finalStatus = directive.kind === "done" ? "done" : `failed:${directive.reason ?? "other"}`;
  const targetDir = join(AGENTS_DIR, agent, "tasks", subdir);
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${taskId}.yaml`);

  let yaml: string;
  try {
    yaml = await readFile(openPath, "utf-8");
  } catch {
    return;
  }
  const fields = parseFields(yaml, taskId);
  const now = new Date().toISOString();

  let next = setField(yaml, "status", finalStatus);
  next = setField(next, "updated", now);
  if (directive.summary) {
    next = setNestedField(next, "summary", "response", JSON.stringify(directive.summary));
  }
  if (directive.kind === "done" && directive.report) {
    // Worker produced a file — persist its path as a top-level scalar so the
    // dashboard can link directly to it. Strip any pre-existing `report:` block.
    next = next.replace(/^report:[\s\S]*?(?=^\S|\Z)/m, "");
    next = next.trimEnd() + `\nreport: ${JSON.stringify(directive.report)}\n`;
  } else if (directive.body && directive.kind === "done") {
    // No produced file — fall back to the inline body so we don't lose the
    // worker's writeup. Block scalar form.
    if (!/^report:/m.test(next)) {
      next += `\nreport: |\n  ${directive.body.replace(/\n/g, "\n  ")}\n`;
    }
  }
  next = appendHistory(next, {
    ts: now,
    from: "claimed",
    to: finalStatus,
    by: `runner-${process.pid}`,
    note: directive.kind === "done" ? "worker completed" : `worker reported ${finalStatus}`,
  });

  await writeFile(openPath, next);
  await rename(openPath, targetPath);

  await appendJournal(agent, {
    ts: now,
    id: taskId,
    status: finalStatus,
    kind: fields.kind,
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: directive.summary,
  });

  await notifyDispatchChat(next, agent, taskId, finalStatus, directive);
}

// === Worker invocation =====================================================

async function runWorker(agent: string, taskId: string, yaml: string): Promise<TaskDirective | null> {
  const prompt = buildWorkerPrompt(yaml, taskId);
  const threadId = `task-${taskId}`;

  let captured = "";
  try {
    await streamUserMessage(
      `multi-agent:${taskId}`,
      prompt,
      (chunk) => { captured += chunk; },
      () => {},
      undefined,
      threadId,
      agent
    );
  } catch (err) {
    console.error(`[multi-agent] worker ${agent}/${taskId} threw:`, err);
    return { kind: "failed", reason: "crash", summary: String(err), body: "", report: null };
  }

  // Primary contract: a report file at agents/<agent>/tasks/<status>/<id>.md.
  // Survives output truncation; the file is what the runner trusts first.
  const fromFile = await readReportFile(agent, taskId);
  if (fromFile) {
    console.log(`[multi-agent] ${agent}/${taskId}: read result from report file (status=${fromFile.kind})`);
    return fromFile;
  }

  return parseDirective(captured);
}

// === Tick ==================================================================

async function sweepArchive(opts: Required<MultiAgentOptions>): Promise<void> {
  const days = readEnvNumber("CLAUDECLAW_MULTI_AGENT_ARCHIVE_DAYS", DEFAULT_ARCHIVE_DAYS);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const agent of opts.agents) {
    for (const bucket of ARCHIVABLE_BUCKETS) {
      const srcDir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(srcDir)) continue;
      const entries = await readdir(srcDir).catch(() => [] as string[]);
      for (const fname of entries.filter((e) => e.endsWith(".yaml"))) {
        const srcPath = join(srcDir, fname);
        let yaml: string;
        try {
          yaml = await readFile(srcPath, "utf-8");
        } catch { continue; }

        // Prefer the envelope's `updated:` timestamp (set on every transition);
        // fall back to file mtime if missing.
        const updatedRaw = readField(yaml, "updated");
        let stamp = NaN;
        if (updatedRaw) {
          const parsed = Date.parse(updatedRaw);
          if (Number.isFinite(parsed)) stamp = parsed;
        }
        if (!Number.isFinite(stamp)) {
          try {
            const st = await stat(srcPath);
            stamp = st.mtimeMs;
          } catch { continue; }
        }
        if (stamp > cutoff) continue;

        // Archive flat into tasks/archived/. The envelope's `status:` field
        // already records the original bucket (`done`, `failed:*`,
        // `waiting:on:*`), so the source dir info isn't lost.
        const archiveDir = join(AGENTS_DIR, agent, "tasks", "archived");
        await mkdir(archiveDir, { recursive: true });
        const targetPath = join(archiveDir, fname);
        try {
          await rename(srcPath, targetPath);
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: archived ${agent}/${bucket}/${fname}`
          );
        } catch (err) {
          console.error(`[multi-agent] archive failed for ${srcPath}:`, err);
        }
      }
    }
  }
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function tickOnce(opts: Required<MultiAgentOptions>, inFlight: Map<string, number>): Promise<void> {
  if (!existsSync(AGENTS_DIR)) return;

  // Sweep waiting tasks first — any unblock will land them in tasks/open/ in
  // time for the same tick's claim pass.
  await sweepWaiting(opts);

  // Archive old terminal tasks (done/failed/waiting older than the threshold)
  // into tasks/archived/<bucket>/. Keeps the working dirs lean.
  await sweepArchive(opts);

  for (const agent of opts.agents) {
    const openDir = join(AGENTS_DIR, agent, "tasks", "open");
    if (!existsSync(openDir)) continue;

    const entries = await readdir(openDir).catch(() => [] as string[]);
    const yamls = entries.filter((e) => e.endsWith(".yaml")).sort();

    for (const fname of yamls) {
      const active = inFlight.get(agent) ?? 0;
      if (active >= opts.perAgentConcurrency) break;

      const taskId = fname.replace(/\.yaml$/, "");
      const filePath = join(openDir, fname);

      let yaml: string;
      try {
        yaml = await readFile(filePath, "utf-8");
      } catch { continue; }
      if ((readField(yaml, "status") ?? "open") !== "open") continue;

      const fields = await claimTask(agent, taskId, filePath, opts.leaseMs);
      if (!fields) continue;

      const claimedYaml = await readFile(filePath, "utf-8").catch(() => "");
      if (!claimedYaml) continue;

      inFlight.set(agent, active + 1);
      console.log(`[${new Date().toLocaleTimeString()}] multi-agent: claimed ${agent}/${taskId} (kind=${fields.kind})`);

      // Fire-and-forget the worker; record completion when it returns.
      runWorker(agent, taskId, claimedYaml)
        .then(async (directive) => {
          // No directive emitted is a worker bug: the response either dropped
          // the closing tag or the worker ended without one entirely. We must
          // not leave the envelope in `claimed` forever — that strands the
          // orchestration with no recovery path. Transition to `failed:other`
          // so Alice's continuation queue (or Kelly via the dashboard) can
          // notice and re-dispatch with a stronger reminder.
          const effective: TaskDirective = directive ?? {
            kind: "failed",
            reason: "other",
            summary: "worker completed but emitted no directive — likely forgot the closing <task-done>/<task-failed>/<task-waiting> tag. The deliverable (if any) may still be on disk; check the worker's output destination before re-dispatching.",
            body: "",
            report: null,
          };
          if (!directive) {
            console.warn(`[multi-agent] ${agent}/${taskId} finished without a directive — synthesising failed:other`);
          }
          if (effective.kind === "waiting") {
            await transitionToWaiting(agent, taskId, filePath, effective);
            console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → waiting:on:${effective.reason}`);
          } else {
            await transitionToTerminal(agent, taskId, filePath, effective);
            console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → ${effective.kind === "done" ? "done" : `failed:${effective.reason}`}`);
          }
        })
        .catch((err) => {
          console.error(`[multi-agent] ${agent}/${taskId} transition failed:`, err);
        })
        .finally(() => {
          inFlight.set(agent, Math.max(0, (inFlight.get(agent) ?? 1) - 1));
        });
    }
  }
}

// === Public API ============================================================

export function startMultiAgentRunner(options: MultiAgentOptions = {}): MultiAgentHandle {
  const opts: Required<MultiAgentOptions> = {
    agents: options.agents ?? readEnvAgents() ?? DEFAULT_AGENTS,
    tickMs: options.tickMs ?? DEFAULT_TICK_MS,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    perAgentConcurrency: options.perAgentConcurrency ?? DEFAULT_PER_AGENT_CONCURRENCY,
  };
  const inFlight = new Map<string, number>();
  let stopped = false;

  console.log(`[${new Date().toLocaleTimeString()}] multi-agent runner: enabled (tick ${opts.tickMs}ms, agents: ${opts.agents.join(",")})`);

  const loop = async () => {
    if (stopped) return;
    try {
      await tickOnce(opts, inFlight);
    } catch (err) {
      console.error("[multi-agent] tick error:", err);
    }
    if (!stopped) setTimeout(loop, opts.tickMs);
  };
  setTimeout(loop, opts.tickMs);

  return {
    stop: () => { stopped = true; },
  };
}

function readEnvAgents(): string[] | null {
  const raw = process.env.CLAUDECLAW_MULTI_AGENT_AGENTS;
  if (!raw) return null;
  const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

export function isMultiAgentEnabled(): boolean {
  const flag = process.env.CLAUDECLAW_MULTI_AGENT_RUNNER ?? "";
  return flag === "1" || flag.toLowerCase() === "true";
}

// Exported for tests.
export const __testing = {
  parseDirective,
  parseFields,
  setField,
  setNestedField,
  readNestedField,
  appendHistory,
  buildWorkerPrompt,
  checkDependencyResolved,
};
