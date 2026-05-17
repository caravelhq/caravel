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

import { readdir, readFile, writeFile, rename, mkdir, stat, unlink, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { streamUserMessage } from "./runner";

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

// Global rate-limit gate. When Claude Code surfaces "You've hit your limit ·
// resets <time> (<tz>)" — an account-level Anthropic rate cap — the runner
// stops claiming work until the reset time has passed. Stored at the project
// root so it survives daemon restart and any worker can read it.
const LIMITS_GATE_FILE = join(PROJECT_DIR, ".claude", "claudeclaw", "limits-gate.json");

interface LimitsGate {
  reset_at: string; // ISO timestamp
  hit_at: string;
  source_agent?: string;
  source_task?: string;
  raw_message?: string;
}

async function readLimitsGate(): Promise<LimitsGate | null> {
  try {
    const raw = await readFile(LIMITS_GATE_FILE, "utf-8");
    const gate = JSON.parse(raw) as LimitsGate;
    if (!gate?.reset_at) return null;
    const resetMs = Date.parse(gate.reset_at);
    if (!Number.isFinite(resetMs)) return null;
    if (resetMs <= Date.now()) {
      // Gate expired — clean up and report clear.
      await clearLimitsGate().catch(() => {});
      return null;
    }
    return gate;
  } catch {
    return null;
  }
}

async function writeLimitsGate(gate: LimitsGate): Promise<void> {
  try {
    await mkdir(join(PROJECT_DIR, ".claude", "claudeclaw"), { recursive: true });
    await writeFile(LIMITS_GATE_FILE, JSON.stringify(gate, null, 2));
    console.log(
      `[${new Date().toLocaleTimeString()}] multi-agent: GLOBAL LIMITS GATE set — runner paused until ${gate.reset_at}` +
        (gate.source_agent ? ` (triggered by ${gate.source_agent}/${gate.source_task})` : "")
    );
  } catch (err) {
    console.error(`[multi-agent] failed to write limits gate:`, err);
  }
}

async function clearLimitsGate(): Promise<void> {
  try {
    await rm(LIMITS_GATE_FILE, { force: true });
    console.log(`[${new Date().toLocaleTimeString()}] multi-agent: limits gate cleared`);
  } catch {}
}

// Find the timezone offset (in minutes east of UTC) for the named IANA zone
// at a given moment. Uses Intl.DateTimeFormat's longOffset format which
// renders as e.g. "GMT+12:00".
function tzOffsetMinutes(tz: string, at: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    const parts = fmt.formatToParts(at);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (!tzPart) return null;
    const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(tzPart.value);
    if (!m) return tzPart.value === "GMT" ? 0 : null;
    const sign = m[1] === "+" ? 1 : -1;
    const h = parseInt(m[2]!, 10);
    const mn = parseInt(m[3] ?? "0", 10);
    return sign * (h * 60 + mn);
  } catch {
    return null;
  }
}

// Parse Claude Code's "resets <H:MMam/pm> (<IANA-TZ>)" rate-limit message
// into a JS Date (UTC moment). Returns null when the pattern doesn't match.
// If the named hour has already passed today in the target timezone, the
// reset is rolled forward by 24h (it's tomorrow's slot).
function parseResetTime(text: string): Date | null {
  const m = /resets\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*\(([^)]+)\)/i.exec(text);
  if (!m) return null;
  let hour = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const ampm = m[3]!.toLowerCase();
  if (hour === 12 && ampm === "am") hour = 0;
  else if (hour < 12 && ampm === "pm") hour += 12;
  const tz = m[4]!.trim();

  const now = new Date();
  const offsetMin = tzOffsetMinutes(tz, now);
  if (offsetMin === null) {
    // Unknown timezone — fall back to system local time. Good enough when
    // the daemon runs in the matching zone, which is the common case.
    const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
    if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1);
    return reset;
  }

  // Compute today's calendar date in the target timezone (independent of
  // the system zone).
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayInTz = dateFmt.format(now); // "YYYY-MM-DD"

  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const oH = String(Math.floor(absMin / 60)).padStart(2, "0");
  const oM = String(absMin % 60).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  const iso = `${todayInTz}T${hh}:${mm}:00${sign}${oH}:${oM}`;
  let reset = new Date(iso);
  if (!Number.isFinite(reset.getTime())) return null;
  if (reset.getTime() <= now.getTime()) {
    reset = new Date(reset.getTime() + 24 * 60 * 60 * 1000);
  }
  return reset;
}

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

// Parses the `revisits:` block-form list into `{ ts, by, instruction }`
// entries. Returns [] when the field is absent, inline empty (`revisits: []`),
// or null. Robust to either `instruction: |` block scalars (6-space indented
// body lines) or inline `instruction: "..."` strings.
function readRevisits(yaml: string): { ts: string; by: string; instruction: string }[] {
  const blockRe = /^revisits:\s*\n((?:[ \t]+.*\n?)*)/m;
  const m = blockRe.exec(yaml);
  if (!m) return [];
  const body = m[1];
  const lines = body.split("\n");
  const out: { ts: string; by: string; instruction: string }[] = [];
  let cur: { ts: string; by: string; instruction: string } | null = null;
  let collecting: "block" | null = null;
  let blockBuf: string[] = [];
  const flushBlock = () => {
    if (cur && collecting === "block") {
      cur.instruction = blockBuf.join("\n").replace(/\s+$/, "");
    }
    blockBuf = [];
    collecting = null;
  };
  for (const line of lines) {
    const itemMatch = /^  - ts:\s*(.*)$/.exec(line);
    if (itemMatch) {
      flushBlock();
      if (cur) out.push(cur);
      cur = { ts: itemMatch[1].trim(), by: "", instruction: "" };
      continue;
    }
    if (!cur) continue;
    const byMatch = /^    by:\s*(.*)$/.exec(line);
    if (byMatch) {
      flushBlock();
      cur.by = byMatch[1].trim();
      continue;
    }
    const instInline = /^    instruction:\s*(.+)$/.exec(line);
    if (instInline) {
      flushBlock();
      let v = instInline[1].trim();
      if (v === "|" || v === "|-" || v === "|+") {
        collecting = "block";
        blockBuf = [];
      } else {
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        cur.instruction = v;
      }
      continue;
    }
    if (collecting === "block" && /^      /.test(line)) {
      blockBuf.push(line.replace(/^      /, ""));
    }
  }
  flushBlock();
  if (cur) out.push(cur);
  return out;
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
  // Use [ \t]* — strictly same-line whitespace — so the replace doesn't
  // greedily eat into the next list item's leading indent. The previous
  // `\s*\n?` would consume `\n  ` (newline + 2-space indent), then the
  // replacement re-prefixed two spaces, accumulating one indent level per
  // transition and stripping the next item's. Result: `      - ts: NEW`
  // (6 spaces) above `- ts: OLD` (0 spaces) — broken YAML that survived
  // because the runner's parsers are line-oriented.
  if (/^history:[ \t]*\n/m.test(yaml) || /^history:[ \t]*$/m.test(yaml)) {
    return yaml.replace(/^history:[ \t]*\n?/m, (m) => m + block);
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
      // that. Otherwise the report IS this .md file — store the relative leaf
      // (`<id>.md`) so the renderer can resolve against whichever bucket the
      // envelope is currently in. Bucket-bound paths break on revisit when the
      // envelope moves done → open. (See 2026-05-06_revisit-loses-report.md.)
      const report = reportPath || `${taskId}.md`;
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

// Normalise a worker-emitted `report=` path. When the worker points at its own
// rendezvous `.md` inside `agents/<who>/tasks/<bucket>/<id>.md`, persist only
// the relative leaf so the path stays valid across bucket transitions (e.g.
// done → open on revisit). Paths to deliverables outside the rendezvous tree
// (Notes/Projects/..., repos/dev/features/...) are kept as-is — those are
// repo-relative and don't move when the envelope does.
function normaliseReportPath(report: string | null): string | null {
  if (!report) return null;
  const trimmed = report.trim();
  if (!trimmed) return null;
  const m = /^agents\/[^/]+\/tasks\/(?:done|failed|waiting|open)\/([^/]+\.md)$/.exec(trimmed);
  return m ? m[1] : trimmed;
}

// Detect Anthropic API / Claude Code token-limit, rate-limit, and
// context-window error signatures in worker output or thrown error text.
// Used to route these into `waiting:on:limits` (gate-aware retry) instead
// of `failed:other` (dead-end). The Claude Code CLI surfaces account-level
// rate caps as a short user-facing message ("You've hit your limit · resets
// 6:30pm (Pacific/Auckland)") that we match explicitly so the parsed reset
// time can drive the global gate.
function detectLimitsHit(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("you've hit your limit") ||
    t.includes("you’ve hit your limit") || // curly apostrophe variant
    t.includes("prompt is too long") ||
    t.includes("context_length_exceeded") ||
    t.includes("rate_limit_error") ||
    t.includes("rate limit exceeded") ||
    t.includes("exceeded your per-minute") ||
    t.includes("exceeded your per-hour") ||
    t.includes("exceeded your per-day") ||
    t.includes("token limit") ||
    t.includes("max_tokens") && t.includes("must be at most") ||
    /\btokens?\s*>\s*\d+/.test(t) ||
    /\bhttp\s*429\b/.test(t) ||
    /\bstatus\s+code\s+429\b/.test(t)
  );
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
      report: normaliseReportPath(attrs.report ?? null),
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
  const revisits = readRevisits(yaml);
  const sections: string[] = [
    `You have been delegated task ${taskId}. The full envelope is at:`,
    `  agents/${agent}/tasks/open/${taskId}.yaml`,
    "",
    "Brief:",
    brief.trim() || "(see envelope)",
    "",
  ];
  if (revisits.length > 0) {
    sections.push("## Follow-up instructions (revisits)");
    sections.push("");
    sections.push(
      "This task was previously completed (or failed) and re-opened with the follow-up instructions below. Treat them as additive corrections to the original brief — **the latest revisit takes precedence** when it conflicts with earlier guidance. Update your prior deliverable in place rather than producing a duplicate."
    );
    sections.push("");
    revisits.forEach((r, i) => {
      const tag = `Revisit ${i + 1} of ${revisits.length} — ${r.ts}${r.by ? ` (by ${r.by})` : ""}`;
      sections.push(tag);
      sections.push(r.instruction.trim() || "(no instruction)");
      sections.push("");
    });
  }
  return [
    ...sections,
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
    `**DO NOT touch the YAML envelope** at \`agents/${agent}/tasks/open/${taskId}.yaml\`. The runner owns it — it will update the status field, append the history entry, and move the file to the matching bucket once it sees your .md report. If you move, rename, or rewrite the .yaml yourself, the runner's transition silently fails: no chat notification, no journal entry, no Alice continuation. Just write the .md and stop.`,
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

// On worker transition: enqueue an Alice continuation envelope when she was
// the dispatcher of a sub-task that's now done/failed, so she can decide the
// next step out-of-band. No chat surface — task status is visible in the
// dashboard's task panel and journal feed; posting assistant-role messages
// into Kelly's chat thread was just noise (see 2026-05-06 chat-mute fix).
// The dashboard's blocked-task UI is the channel for `waiting:on:user`; no
// chat post needed there either.
//
// Sibling consolidation: when Alice dispatches multiple parallel sub-tasks
// (same orchestration parent), the runner waits for ALL of them to land
// before enqueueing a single consolidated continuation listing every
// sibling's report. This avoids the "one continuation per child + N stand-
// downs" thrash that surfaces when 3 children each fire their own envelope.
async function notifyDispatchChat(
  yaml: string,
  agent: string,
  taskId: string,
  finalStatus: string,
  directive: TaskDirective
): Promise<void> {
  void finalStatus;
  const from = readField(yaml, "from");
  const to = readField(yaml, "to");
  if (
    from !== "alice" ||
    to === "alice" ||
    (directive.kind !== "done" && directive.kind !== "failed")
  ) {
    return;
  }

  const orchParent = readField(yaml, "parent");
  const knownAgents = readEnvAgents() ?? DEFAULT_AGENTS;

  try {
    // Gather every alice-dispatched sibling under this orchestration parent.
    // If any are still in flight we defer — the last one to land triggers
    // the consolidated continuation.
    const siblings = orchParent
      ? await listAliceDispatchedChildren(orchParent, knownAgents)
      : [{ id: taskId, agent, status: directive.kind, report: directive.report ?? null }];

    const inFlight = siblings.filter(
      (s) =>
        s.status !== "done" && !s.status.startsWith("failed") && s.status !== directive.kind
    );
    // The just-completed task may not yet show terminal status on disk if
    // there's a tiny race — patch it in by id.
    const stillInFlight = inFlight.filter((s) => s.id !== taskId);
    if (stillInFlight.length > 0) {
      console.log(
        `[multi-agent] alice continuation deferred — ${stillInFlight.length} sibling(s) of ${taskId} still in flight (${stillInFlight.map((s) => s.id).join(", ")})`
      );
      return;
    }

    // Dedupe: if alice already has a continuation envelope for this family
    // in any non-terminal bucket, don't enqueue another one. The existing
    // one will be unblocked or processed when ready.
    const familyIds = new Set(siblings.map((s) => s.id));
    const existing = await findExistingAliceContinuation(familyIds);
    if (existing) {
      console.log(
        `[multi-agent] alice continuation ${existing} already covers family of ${taskId} — skipping enqueue`
      );
      return;
    }

    const chatId = readNestedField(yaml, "dispatch", "chat_id");
    const chatName = readNestedField(yaml, "dispatch", "chat_name");
    const chatPreview = readNestedField(yaml, "dispatch", "chat_preview");
    const chatAgent = readNestedField(yaml, "dispatch", "chat_agent");

    await enqueueAliceContinuation({
      chatId,
      chatName,
      chatPreview,
      chatAgent,
      orchParent,
      lastCompletedTaskId: taskId,
      siblings,
    });
  } catch (err) {
    console.error(`[multi-agent] failed to enqueue alice continuation for ${taskId}:`, err);
  }
}

// Sibling info shape used by the consolidation logic.
type AliceSibling = {
  id: string;
  agent: string;
  status: "done" | "failed" | "open" | "claimed" | "waiting" | string;
  report: string | null;
  summary?: string;
  headline?: string;
};

// Scan all known agents' tasks/{open,claimed,waiting,done,failed} for sub-
// tasks dispatched from alice with `parent: <orchParent>`. Returns one entry
// per sibling with its current status + report path (when terminal).
async function listAliceDispatchedChildren(
  orchParent: string,
  knownAgents: string[]
): Promise<AliceSibling[]> {
  const buckets = ["open", "waiting", "done", "failed"];
  const out: AliceSibling[] = [];
  for (const a of knownAgents) {
    if (a === "alice") continue;
    for (const bucket of buckets) {
      const dir = join(AGENTS_DIR, a, "tasks", bucket);
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const fname of entries) {
        if (!fname.endsWith(".yaml")) continue;
        const fpath = join(dir, fname);
        let content: string;
        try {
          content = await readFile(fpath, "utf-8");
        } catch {
          continue;
        }
        const from = readField(content, "from");
        const parent = readField(content, "parent");
        if (from !== "alice" || parent !== orchParent) continue;
        const id = fname.replace(/\.yaml$/, "");
        const statusRaw = readField(content, "status") ?? bucket;
        const report = readField(content, "report")?.replace(/^"|"$/g, "") ?? null;
        const summary = readNestedField(content, "summary", "response")?.replace(/^"|"$/g, "");
        const headline = readField(content, "headline") ?? "";
        out.push({
          id,
          agent: a,
          status: statusRaw,
          report: report && report.length > 0 ? report : null,
          summary,
          headline,
        });
      }
    }
  }
  return out;
}

// Look for an existing alice continuation envelope whose `parent` matches one
// of the sibling ids in this family. Restricts to non-terminal buckets so a
// previously-processed continuation doesn't suppress a fresh one when a new
// sibling later lands. Returns the matched continuation id or null.
async function findExistingAliceContinuation(
  familyIds: Set<string>
): Promise<string | null> {
  const buckets = ["open", "waiting"];
  for (const bucket of buckets) {
    const dir = join(AGENTS_DIR, "alice", "tasks", bucket);
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const fname of entries) {
      if (!fname.endsWith(".yaml")) continue;
      const fpath = join(dir, fname);
      let content: string;
      try {
        content = await readFile(fpath, "utf-8");
      } catch {
        continue;
      }
      const kind = readField(content, "kind");
      if (kind !== "continuation") continue;
      const parent = readField(content, "parent");
      if (parent && familyIds.has(parent)) {
        return fname.replace(/\.yaml$/, "");
      }
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generate a task id for Alice's continuation queue.
//
// Decimal sub-task scheme (mirrors the dispatch service):
//   - When `parent` is provided (the normal continuation path), the new id is
//     `{root}.NN` (zero-padded 2 digits) where `root` is the parent flattened
//     to its top-level id (everything before the first `.`) and NN is the
//     next unused integer suffix among existing children of that root. This
//     enforces a single-level child scheme — grandchildren become siblings.
//   - When `parent` is null (defensive fallback), use the flat
//     TSK-YYYY-MM-DD-NNNN counter scoped to Alice's own dirs.
async function nextAliceTaskId(parent: string | null): Promise<string> {
  // Include `archived` so ids swept off the active dirs are still reserved.
  const SCAN_DIRS = ["open", "waiting", "done", "failed", "archived"];

  if (parent) {
    const root = parent.split(".")[0]!;
    const childRe = new RegExp(`^${escapeRegex(root)}\\.(\\d+)\\.yaml$`);
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
    return `${root}.${String(maxN + 1).padStart(2, "0")}`;
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
  chatId: string | null;
  chatName?: string | null;
  chatPreview?: string | null;
  chatAgent?: string | null;
  orchParent: string | null;
  lastCompletedTaskId: string;
  siblings: AliceSibling[];
}): Promise<void> {
  const {
    chatId,
    chatName,
    chatPreview,
    chatAgent,
    orchParent,
    lastCompletedTaskId,
    siblings,
  } = opts;
  // Use the most recent terminal task as parent so the continuation lives
  // in the same root family as its dispatched siblings.
  const parentForId = lastCompletedTaskId;
  const id = await nextAliceTaskId(parentForId);
  const now = new Date().toISOString();

  const isMulti = siblings.length > 1;
  const headline = isMulti
    ? `Briefing — ${siblings.length} sibling tasks landed (parent ${orchParent ?? "?"})`
    : `Continue after ${lastCompletedTaskId}`;

  const briefLines: string[] = [];
  briefLines.push(
    isMulti
      ? `${siblings.length} parallel sub-tasks dispatched under ${orchParent ?? "?"} have all landed:`
      : `Sub-task ${lastCompletedTaskId} landed.`
  );
  briefLines.push("");
  for (const s of siblings) {
    const verb = s.status === "done"
      ? "✓ done"
      : s.status.startsWith("failed")
        ? `✗ ${s.status}`
        : `· ${s.status}`;
    const headlinePart = s.headline ? ` — ${s.headline}` : "";
    briefLines.push(`  - ${verb} **${s.id}** (${s.agent})${headlinePart}`);
    if (s.summary) briefLines.push(`      summary: ${s.summary}`);
    if (s.report) briefLines.push(`      report: ${s.report}`);
  }
  briefLines.push("");
  briefLines.push("  Read each sibling's report, write a consolidated briefing for Kelly, and end your turn.");
  briefLines.push("");
  briefLines.push("  Directives — chat integration is currently OFF, so use these:");
  briefLines.push("    - Surface results to Kelly: emit <task-waiting on=\"user\" summary=\"...\">.");
  briefLines.push("      Kelly sees the task in the picker's \"Waiting on you\" section at the top.");
  briefLines.push("      Use this for orchestration completes — it's the default.");
  briefLines.push("    - More work to dispatch: run /task then emit <task-waiting on=\"task:TSK-...\"> to park.");
  briefLines.push("    - Stand-down (no Kelly action needed): emit <task-done summary=\"...\">. Closes silently.");

  const briefBlock = briefLines.map((l) => (l.length > 0 ? `  ${l}` : "  ")).join("\n");

  const contextLines: string[] = [];
  for (const s of siblings) {
    contextLines.push(`  - agents/${s.agent}/tasks/${s.status === "done" ? "done" : s.status.startsWith("failed") ? "failed" : "open"}/${s.id}.yaml`);
    if (s.report) contextLines.push(`  - ${s.report}`);
  }

  const body = [
    `id: ${id}`,
    `headline: ${headline}`,
    `created: ${now}`,
    `updated: ${now}`,
    "",
    "from: runner",
    "to: alice",
    `parent: ${parentForId}`,
    "reply_to: null",
    "",
    "kind: continuation",
    "priority: P2",
    "deadline: null",
    "",
    "budget:",
    `  max_turns: ${isMulti ? 12 : 6}`,
    "  max_subagents: 0",
    "  max_usd: null",
    "",
    "brief: |",
    briefBlock,
    "",
    `output_format: ""`,
    "",
    "context:",
    ...contextLines,
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
    `    note: \"continuation enqueued after ${lastCompletedTaskId} (${siblings.length} sibling(s))\"`,
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
  ].join("\n");

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
    parent: parentForId,
    summary: isMulti
      ? `consolidated continuation for ${siblings.length} siblings under ${orchParent ?? "?"}`
      : `enqueued after ${lastCompletedTaskId}`,
  });

  console.log(
    `[multi-agent] enqueued alice continuation ${id} (${siblings.length} sibling(s) under ${orchParent ?? "?"})`
  );
}

// Locate a task envelope, tolerating worker contract violations. Workers are
// supposed to leave the .yaml alone (the runner owns it), but defensive lookup
// across all buckets means the transition still completes — chat notification,
// journal entry, continuation enqueue and all — if the worker happened to move
// it. Logs at WARN when the envelope wasn't where it was expected so the slip
// is visible in the daemon log instead of being silently swallowed.
async function locateEnvelope(
  agent: string,
  taskId: string,
  preferredPath: string
): Promise<{ path: string; yaml: string } | null> {
  try {
    const yaml = await readFile(preferredPath, "utf-8");
    return { path: preferredPath, yaml };
  } catch {}

  const buckets = ["open", "done", "failed", "waiting", "archived"];
  for (const bucket of buckets) {
    const candidate = join(AGENTS_DIR, agent, "tasks", bucket, `${taskId}.yaml`);
    if (candidate === preferredPath) continue;
    try {
      const yaml = await readFile(candidate, "utf-8");
      console.warn(
        `[multi-agent] ${agent}/${taskId}: envelope not at expected ${preferredPath}, found at ${candidate} — likely worker contract violation (worker moved/renamed the YAML). Continuing transition from actual location.`
      );
      return { path: candidate, yaml };
    } catch {}
  }
  return null;
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

  const located = await locateEnvelope(agent, taskId, openPath);
  if (!located) {
    console.error(
      `[multi-agent] ${agent}/${taskId}: cannot locate envelope in any bucket — transitionToWaiting aborted. Chat notification skipped.`
    );
    return;
  }
  const { path: sourcePath, yaml } = located;
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
  // For `waiting:on:limits`, stamp the time the limit was hit and bump the
  // retry counter so sweepWaiting can decide when to auto-retry and when to
  // give up. limits_retry_count caps the bounce loop.
  if (onSpec === "limits") {
    next = setField(next, "limits_hit_at", now);
    const prevCount = Number(readField(next, "limits_retry_count") ?? "0") || 0;
    next = setField(next, "limits_retry_count", String(prevCount + 1));
  }
  next = appendHistory(next, {
    ts: now,
    from: "claimed",
    to: finalStatus,
    by: `runner-${process.pid}`,
    note: `worker waiting on ${onSpec}`,
  });

  await writeFile(sourcePath, next);
  if (sourcePath !== targetPath) {
    await rename(sourcePath, targetPath);
  }
  await cleanStaleRendezvous(agent, taskId, "waiting");

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

// Delete stale `<id>.md` rendezvous files from any rendezvous bucket other
// than the current one. Called after a YAML transitions between buckets so
// the runner's file-rendezvous reader (`readReportFile`, scans done → failed
// → waiting) doesn't pick up an outdated worker turn from a previous state.
// Revisit-archived files (`<id>.r{N}.md`) are NOT deleted — only the bare
// `<id>.md` gets cleaned. Open/waiting `.md`s are pure rendezvous and always
// safe to drop; done/failed `.md`s carry the report body, so they're left
// alone outside their own bucket only when stale (the runner only writes
// `<id>.md` to the bucket the YAML lands in, so any other bucket's `<id>.md`
// is by definition from a prior turn).
async function cleanStaleRendezvous(
  agent: string,
  taskId: string,
  keepBucket: "open" | "waiting" | "done" | "failed"
): Promise<void> {
  const buckets: Array<"open" | "waiting" | "done" | "failed"> = ["open", "waiting", "done", "failed"];
  for (const b of buckets) {
    if (b === keepBucket) continue;
    const stalePath = join(AGENTS_DIR, agent, "tasks", b, `${taskId}.md`);
    if (existsSync(stalePath)) {
      try { await unlink(stalePath); } catch {}
    }
  }
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

      let unblocked = false;
      if (spec === "limits") {
        // Gate-authoritative. The global limits gate is checked at the top
        // of tickOnce; if we got here the gate is clear, so any
        // waiting:on:limits task is free to retry. No per-task backoff cap
        // — if the same task hits the limit again, the next gate cycle
        // takes over. Logged once on the unblock so bouncing is visible.
        unblocked = true;
        console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} limits gate clear — unblocking`);
      } else {
        unblocked = await checkDependencyResolved(spec, opts.agents);
      }
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
      await cleanStaleRendezvous(agent, taskId, "open");

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

  const located = await locateEnvelope(agent, taskId, openPath);
  if (!located) {
    console.error(
      `[multi-agent] ${agent}/${taskId}: cannot locate envelope in any bucket — transitionToTerminal aborted. Chat notification skipped.`
    );
    return;
  }
  const { path: sourcePath, yaml } = located;
  const fields = parseFields(yaml, taskId);
  const now = new Date().toISOString();

  let next = setField(yaml, "status", finalStatus);
  next = setField(next, "updated", now);
  if (directive.summary) {
    next = setNestedField(next, "summary", "response", JSON.stringify(directive.summary));
  }
  if (directive.kind === "done" && directive.report) {
    // Worker produced a file — persist its path as a top-level scalar so the
    // dashboard can link directly to it. Strip ALL pre-existing `report:`
    // blocks (single-line or block-scalar) before appending. Global match
    // handles legacy envelopes where prior write attempts left duplicates.
    next = next.replace(/^report:[^\n]*(?:\n[ \t]+[^\n]*)*\n?/gm, "");
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

  await writeFile(sourcePath, next);
  if (sourcePath !== targetPath) {
    await rename(sourcePath, targetPath);
  }
  await cleanStaleRendezvous(agent, taskId, subdir);

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

  // Auto-close parent if this was a `closes_parent_on_done` child landing as
  // done. Spawned by Kelly via the "Next" button on a waiting:on:user task —
  // when the child succeeds, the parent question is answered and the parent
  // envelope can transition out of waiting/.
  if (directive.kind === "done") {
    await maybeCloseParentOnUserUnblock(next, taskId);
  }
}

// When a child task tagged `closes_parent_on_done: true` lands as done,
// transition its parent waiting:on:user envelope to `done`. Search all known
// agents' `waiting/` buckets so cross-agent parenting still resolves. No-op
// if the field is absent, the parent isn't in waiting/, or parent status
// isn't waiting:on:user.
async function maybeCloseParentOnUserUnblock(childYaml: string, childId: string): Promise<void> {
  const closesField = (readField(childYaml, "closes_parent_on_done") ?? "").trim().toLowerCase();
  if (closesField !== "true") return;
  const parentId = readField(childYaml, "parent");
  if (!parentId || parentId === "null") return;

  const agents = readEnvAgents() ?? DEFAULT_AGENTS;
  for (const a of agents) {
    const parentPath = join(AGENTS_DIR, a, "tasks", "waiting", `${parentId}.yaml`);
    if (!existsSync(parentPath)) continue;
    let parentYaml: string;
    try {
      parentYaml = await readFile(parentPath, "utf-8");
    } catch { continue; }
    const parentStatus = (readField(parentYaml, "status") ?? "").trim();
    if (parentStatus !== "waiting:on:user") {
      console.warn(`[multi-agent] auto-close: parent ${a}/${parentId} status is "${parentStatus}", not waiting:on:user — skipping`);
      return;
    }
    const now = new Date().toISOString();
    let next = setField(parentYaml, "status", "done");
    next = setField(next, "updated", now);
    next = appendHistory(next, {
      ts: now,
      from: "waiting:on:user",
      to: "done",
      by: `runner-${process.pid}`,
      note: `auto-closed by child ${childId} (closes_parent_on_done)`,
    });
    const doneDir = join(AGENTS_DIR, a, "tasks", "done");
    await mkdir(doneDir, { recursive: true });
    const targetPath = join(doneDir, `${parentId}.yaml`);
    await writeFile(parentPath, next);
    try {
      await rename(parentPath, targetPath);
    } catch {
      // If the rename fails (rare — same fs), the file is already updated
      // in place. The picker will still show status=done via readField.
    }
    await cleanStaleRendezvous(a, parentId, "done");
    const parentFields = parseFields(parentYaml, parentId);
    await appendJournal(a, {
      ts: now,
      id: parentId,
      status: "done",
      kind: parentFields.kind,
      from: parentFields.from,
      to: a,
      parent: parentFields.parent,
      summary: `auto-closed by child ${childId}`,
    });
    console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${a}/${parentId} → done (auto-closed by child ${childId})`);
    return;
  }
  // Parent not in any waiting/ bucket — already terminal, or never was a
  // waiting:on:user. Silent no-op; this code path runs for every done child,
  // most of which don't have parents in waiting/.
}

// === Worker invocation =====================================================

async function runWorker(agent: string, taskId: string, yaml: string): Promise<TaskDirective | null> {
  const prompt = buildWorkerPrompt(yaml, taskId);
  // Thread scope: rooted at the parent task and keyed by agent. All sub-tasks
  // under the same parent share one resumed Claude session per agent — the
  // agent doesn't re-read its CLAUDE.md, brief context, or the project
  // README on each sibling sub-task. Anthropic's prompt cache stays warm
  // across the project burst, and per-agent isolation prevents cross-agent
  // session collision (Cliff and Bob each get their own thread under the
  // same parent). Top-level tasks (no parent) thread on the task id itself.
  const fields = parseFields(yaml, taskId);
  const root = (fields.parent && fields.parent !== "null" ? fields.parent : taskId).split(".")[0]!;
  const threadId = `task-${root}-${agent}`;

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
    const errText = err instanceof Error ? err.message : String(err);
    if (detectLimitsHit(errText) || detectLimitsHit(captured)) {
      await maybeSetGlobalLimitsGate(`${errText}\n${captured}`, agent, taskId);
      console.warn(`[multi-agent] worker ${agent}/${taskId} hit a token/rate/context limit — routing to waiting:on:limits`);
      return {
        kind: "waiting",
        reason: "limits",
        summary: `worker hit an Anthropic API limit. Detail: ${errText.slice(0, 280)}`,
        body: "",
        report: null,
      };
    }
    console.error(`[multi-agent] worker ${agent}/${taskId} threw:`, err);
    return { kind: "failed", reason: "crash", summary: errText, body: "", report: null };
  }

  // Primary contract: a report file at agents/<agent>/tasks/<status>/<id>.md.
  // Survives output truncation; the file is what the runner trusts first.
  const fromFile = await readReportFile(agent, taskId);
  if (fromFile) {
    console.log(`[multi-agent] ${agent}/${taskId}: read result from report file (status=${fromFile.kind})`);
    return fromFile;
  }

  const parsed = parseDirective(captured);
  if (parsed) return parsed;

  // No file, no directive — but if the stream surfaced a limit error, route
  // to waiting:on:limits so it gets retried rather than dead-ended at
  // failed:other.
  if (detectLimitsHit(captured)) {
    await maybeSetGlobalLimitsGate(captured, agent, taskId);
    console.warn(`[multi-agent] ${agent}/${taskId}: no directive emitted but stream contains a limit signature — routing to waiting:on:limits`);
    return {
      kind: "waiting",
      reason: "limits",
      summary: "worker stream surfaced an Anthropic API limit and emitted no directive — gate set, will retry after reset",
      body: "",
      report: null,
    };
  }
  return null;
}

// Parse the reset time from a limit-hit message and write the global gate.
// No-op if the text doesn't contain a parseable reset time (the gate stays
// untouched and individual tasks still get parked in waiting:on:limits).
async function maybeSetGlobalLimitsGate(
  text: string,
  agent: string,
  taskId: string
): Promise<void> {
  const resetAt = parseResetTime(text);
  if (!resetAt) {
    console.warn(`[multi-agent] ${agent}/${taskId}: limit detected but no reset time in message — gate not set`);
    return;
  }
  await writeLimitsGate({
    reset_at: resetAt.toISOString(),
    hit_at: new Date().toISOString(),
    source_agent: agent,
    source_task: taskId,
    raw_message: text.slice(0, 500),
  });
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

  // Global rate-limit gate. Skip all claim passes (and the waiting-sweep,
  // which would just bounce limits-tagged tasks back to open prematurely)
  // until the reset moment has passed. readLimitsGate clears the file
  // automatically when its reset_at lapses, so the runner self-recovers.
  const gate = await readLimitsGate();
  if (gate) {
    console.log(
      `[${new Date().toLocaleTimeString()}] multi-agent: limits gate active until ${gate.reset_at} — skipping tick`
    );
    return;
  }

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

      // Bucket is the source of truth — file is in open/, so it's claimable.
      // The `status:` field is metadata; tolerate worker-side typos and
      // unrecognised values (e.g. "in_progress" — not part of the runner's
      // taxonomy) by treating anything that isn't a recognised non-open
      // status as `open`. Stops envelopes from being stranded forever when
      // an agent writes a custom status manually in a chat session.
      const rawStatus = (readField(yaml, "status") ?? "open").trim();
      const isClaimed = rawStatus === "claimed";
      const isTerminalish =
        rawStatus === "done" ||
        rawStatus.startsWith("failed:") ||
        rawStatus.startsWith("waiting:on:");
      if (isClaimed || isTerminalish) {
        // `claimed` = worker mid-flight (lease check below handles re-claim).
        // Terminalish in open/ = stale file move race, sweep will reconcile.
        continue;
      }
      if (rawStatus !== "open") {
        console.warn(
          `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} has unrecognised status "${rawStatus}" in open/ — treating as open`
        );
      }

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
