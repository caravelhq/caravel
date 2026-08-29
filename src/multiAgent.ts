// Multi-agent task pickup loop (WAL-63 phase 2).
//
// Additive module — wired in `commands/start.ts` only when the feature flag
// `CARAVEL_MULTI_AGENT_RUNNER=1` is set (or settings.multiAgent.enabled is
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
import { load as yamlLoad } from "js-yaml";
import { streamUserMessage } from "./runner";
import { listAgentNamesSync } from "./agents";
import { resolveStateDir } from "./paths";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

// Track graph errors already surfaced via console.warn — prevents a per-tick
// log flood when a corrupt envelope or dangling edge persists across ticks.
const warnedGraphErrors = new Set<string>();

// Example roster used only when no agent profiles exist on disk and no env
// override is set — keeps a fresh clone runnable for a demo. Real deployments
// derive the roster from agents/<name>/agent.json (see knownAgents()).
const EXAMPLE_AGENTS = ["alice", "bob", "ray"];

// The live roster: an explicit env override wins; otherwise derive from the
// agent profiles on disk; fall back to the example roster only when both are
// empty. Deriving from disk means adding an agent profile is the only step —
// no source list to keep in sync (which is what used to drift).
function knownAgents(): string[] {
  const env = readEnvAgents();
  if (env) return env;
  const disk = listAgentNamesSync();
  return disk.length > 0 ? disk : EXAMPLE_AGENTS;
}

const DEFAULT_TICK_MS = 30 * 1000;
// Increased from 10 min to 30 min: real tasks routinely exceed 10 min, and
// a too-short lease was the proximate cause of the 2026-08-21 duplicate-work
// incident (TSK-2026-08-21-0001.04 / WAL-71 dimension 2). The inFlight check
// below is the primary guard; the longer default is belt-and-suspenders and
// also correctly signals "we expect workers to take up to 30 min" to operators.
const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_PER_AGENT_CONCURRENCY = 1;
// Maximum age of an inflightWorkers entry before the sweep treats it as a
// possible hang and proceeds with recovery anyway. Workers are expected to
// finish within their lease window; this ceiling prevents a hung worker (one
// that is technically alive but wedged) from blocking recovery indefinitely.
// The Claude subprocess timeout in runner.ts is a separate, earlier bound —
// this ceiling is a backstop for cases where that timeout itself hangs.
function readMaxWorkerLifetimeMs(): number {
  return readEnvNumber(
    "CARAVEL_MAX_WORKER_LIFETIME_MS",
    readEnvNumber("CLAUDECLAW_MAX_WORKER_LIFETIME_MS", 60 * 60 * 1000) // 1 hour default
  );
}
// How long a terminal/waiting task lives in its bucket before being moved
// to tasks/archived/<bucket>/. Keeps the working directories small without
// losing history. Override via CARAVEL_MULTI_AGENT_ARCHIVE_DAYS.
// WAL-63 Phase 1: archival is now gated on `closed.at`, not file mtime.
// Threshold bumped from 7 → 30 days because closed tasks are the audit
// trail in the Project view, not just queue cleanup. Active tasks
// (closed: null) never archive regardless of age.
const DEFAULT_ARCHIVE_DAYS = 30;
// Stale waiting:on:user tasks auto-transition to paused/ after this many days
// with no movement. Named constant so the threshold appears in exactly one place.
const AUTO_PAUSE_DAYS = 14;
// Closed-task sweep scans every bucket — even `open` and `archived` are
// candidates if some external process has retired them. The runner-owned
// status is preserved in the envelope; bucket placement is just the file
// home, and closed envelopes get folded to `archived/` once aged out.
// `paused` is intentionally excluded — paused tasks are not archivable;
// they stay visible until a human explicitly resumes or closes them.
const ARCHIVABLE_BUCKETS = ["done", "failed", "waiting", "open"] as const;

// === Mid-flight abort registry =============================================
// In-flight workers register their AbortController here keyed by
// `${agent}/${taskId}` while runWorker is awaiting the spawned Claude
// process. The web server (same daemon process — see commands/start.ts,
// which launches the runner and the dashboard together) reaches in via
// abortInflightWorker() to kill a worker mid-turn when Kelly hits Abort on
// a claimed task. The runner stays the sole writer of the envelope: aborting
// just kills the process and records intent; runWorker then returns a
// cancellation directive and the normal transition path finalises the file.
type InflightEntry = { controller: AbortController; aborted: boolean; by: string; reason: string; claimedAt: number };
const inflightWorkers = new Map<string, InflightEntry>();

function inflightKey(agent: string, taskId: string): string {
  return `${agent}/${taskId}`;
}

// Kill the live worker process for a claimed task. Returns true when a live
// worker was found and signalled, false when no worker is registered in this
// process (stale claim, different daemon, or the worker already landed) — in
// which case the caller falls back to writing the cancellation directly.
export function abortInflightWorker(
  agent: string,
  taskId: string,
  reason: string,
  by: string
): boolean {
  const entry = inflightWorkers.get(inflightKey(agent, taskId));
  if (!entry) return false;
  entry.aborted = true;
  entry.reason = reason;
  entry.by = by;
  try {
    entry.controller.abort();
  } catch {
    // AbortController.abort never throws in practice; guard anyway so a
    // bad state can't wedge the dashboard request.
  }
  return true;
}

// Global rate-limit gate. When Claude Code surfaces "You've hit your limit ·
// resets <time> (<tz>)" — an account-level Anthropic rate cap — the runner
// stops claiming work until the reset time has passed. Stored at the project
// root so it survives daemon restart and any worker can read it.
const LIMITS_GATE_FILE = join(resolveStateDir(), "limits-gate.json");
const HEALTH_FILE = join(resolveStateDir(), "runner-health.json");

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
    await mkdir(resolveStateDir(), { recursive: true });
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

// ── Tick health (Phase 4, pulled forward) ─────────────────────────────────────
//
// Records the outcome of each tick so a silent hang (sweep throws + claim pass
// never runs) is detectable via GET /api/health/runner. The 2026-08-26 incident
// — sweepArchive threw on every tick, nothing claimed, everything looked healthy
// — is the prototype for this failure class.

interface RunnerHealth {
  last_tick_at: string | null;
  last_tick_ok: boolean;
  last_error: { message: string; fn: string } | null;
  last_claim_at: string | null;
}

async function readRunnerHealth(): Promise<RunnerHealth> {
  try {
    const raw = await readFile(HEALTH_FILE, "utf-8");
    return JSON.parse(raw) as RunnerHealth;
  } catch {
    return { last_tick_at: null, last_tick_ok: true, last_error: null, last_claim_at: null };
  }
}

async function writeRunnerHealth(h: RunnerHealth): Promise<void> {
  try {
    await mkdir(resolveStateDir(), { recursive: true });
    await writeFile(HEALTH_FILE, JSON.stringify(h, null, 2));
  } catch (err) {
    console.error(`[multi-agent] failed to write runner health:`, err);
  }
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
  // Minutes are optional — the CLI writes both "resets 6:30pm (TZ)" and the
  // shorter "resets 6pm (TZ)". Missing minutes default to :00.
  const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i.exec(text);
  if (!m) return null;
  let hour = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
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
  needs: string[];   // Phase 1: ids that must be `done` before this task is ready
  after: string[];   // Phase 1: ids that must be terminal (done|failed) before this task is ready
  type: string | null; // Phase 1: reserved; carried, not branched on by the scheduler
}

// === YAML helpers (regex-based, mirrors task.mjs to avoid a YAML dep) =====

function readField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

// Parse a YAML list field into its string items. Handles both inline form
// (`key: [a, b]` or `key: []`) and block-sequence form:
//   key:
//     - a
//     - b
// Returns [] when the field is absent, empty, or explicitly `null`.
export function readList(yaml: string, key: string): string[] {
  // Strip a matching pair of surrounding single or double quotes from a
  // list item. Defensive against WAL-80: envelope writers that auto-quote
  // scalars may quote list items too, producing `needs: ["TSK-X"]` where
  // the intent is `TSK-X`. The literal `"TSK-X"` would never match the
  // graph node keyed as `TSK-X`, silently parking the task forever.
  function stripQuotes(s: string): string {
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  // Inline form: key: [item1, item2] or key: []
  const inlineRe = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m");
  const inlineM = inlineRe.exec(yaml);
  if (inlineM) {
    const inner = (inlineM[1] ?? "").trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => stripQuotes(s.trim()))
      .filter(Boolean);
  }
  // Block-sequence form: key:\n  - item
  const blockRe = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-[ \\t]+[^\\n]+\\n?)*)`, "m");
  const blockM = blockRe.exec(yaml);
  if (blockM) {
    return (blockM[1] ?? "")
      .split("\n")
      .map((line) => {
        const m = /^[ \t]+-[ \t]+(.+)$/.exec(line);
        return m ? stripQuotes(m[1].trim()) : "";
      })
      .filter(Boolean);
  }
  return [];
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
  // Match the key line plus any indented block children below it. Without
  // stripping those children, writing a scalar over a block-mapping key
  // leaves orphaned indented lines that produce invalid YAML (e.g. the
  // `lease: null\n  holder: ...\n  expires: ...` corruption from WAL-63).
  const re = new RegExp(`^${key}:[^\\n]*(?:\\n[ \\t]+[^\\n]*)*`, "m");
  if (re.test(yaml)) return yaml.replace(re, `${key}: ${value}`);
  return yaml + `\n${key}: ${value}\n`;
}

// WAL-63 Phase 1: rewrite the top-level `closed:` block on an envelope.
// Pass `null` to clear (writes `closed: null` so the field stays explicit
// and parser-friendly). Strips any pre-existing closed block (single-line
// or block-mapping form) before writing the new value. Inserts immediately
// after `status:` for stable layout. Mirrors the dispatch service helper
// (services/multiAgentDispatch.ts) — keep them in sync if the schema shifts.
interface ClosedBlockShape {
  status: string;
  at: string;
  by: string;
  reason: string;
}
function setClosedField(yaml: string, closed: ClosedBlockShape | null): string {
  // Strip block-mapping form first (multi-line indented children).
  let next = yaml.replace(/^closed:\s*\n(?:[ \t]+[^\n]*\n?)+/m, "");
  // Then any single-line scalar form (`closed: null`, etc.).
  next = next.replace(/^closed:[^\n]*\n/m, "");

  const insertion = closed === null
    ? "closed: null\n"
    : "closed:\n" +
      `  status: ${closed.status}\n` +
      `  at: ${closed.at}\n` +
      `  by: ${closed.by}\n` +
      `  reason: ${JSON.stringify(closed.reason)}\n`;

  const statusRe = /^status:[^\n]*\n/m;
  if (statusRe.test(next)) {
    return next.replace(statusRe, (m) => m + insertion);
  }
  return next.trimEnd() + "\n" + insertion;
}

function setNestedField(yaml: string, parent: string, key: string, value: string): string {
  // Replaces `  <key>: ...` line under a `<parent>:` block. Adds the line if
  // the parent block exists but the key is missing. Leaves untouched if the
  // parent block is absent (envelope is malformed; let it fail in YAML lint).
  const lineRe = new RegExp(`^(${parent}:[\\s\\S]*?\\n)( {2}${key}:\\s*.*)$`, "m");
  if (lineRe.test(yaml)) {
    return yaml.replace(lineRe, (_m, head: string) => `${head}  ${key}: ${value}`);
  }
  // Parent exists but no key line — splice it in. Strip any scalar/flow value
  // on the parent line so we produce a clean block form instead of appending
  // children under a scalar (e.g. `lease: null\n  holder: x` is invalid YAML).
  const parentRe = new RegExp(`^${parent}:.*$`, "m");
  if (parentRe.test(yaml)) {
    return yaml.replace(parentRe, `${parent}:\n  ${key}: ${value}`);
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
  const needs = readList(yaml, "needs");
  const after = readList(yaml, "after");
  const typeRaw = readField(yaml, "type");
  const type = typeRaw && typeRaw !== "null" ? typeRaw : null;
  return { id, status, to, from, kind, parent, needs, after, type };
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
  // Set when the worker was aborted mid-flight via the dashboard. The
  // transition still lands the envelope in failed/ (status: failed:aborted)
  // but additionally stamps a `closed: cancelled` overlay so it reads as a
  // deliberate cancellation, not a genuine failure needing retry.
  cancelled?: { by: string; reason: string };
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
    // "you've hit your <qualifier?> limit" — tolerate a qualifier between
    // "your" and "limit" (straight + curly apostrophe). Catches the bare
    // "you've hit your limit", "…your session limit" (the 2026-06-25 miss
    // that mis-routed to failed:crash), "…your usage limit", "…your 5-hour
    // limit", etc.
    /you[''’]ve hit your\b[^.\n]*\blimit/i.test(t) ||
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
  const headline = readField(yaml, "headline") ?? taskId;
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
    "## Before you start",
    "",
    "Work out a search term for this task, then run:",
    "",
    "    node .claude/skills/knowledge/script/knowledge.mjs query \"<your search term>\"",
    "",
    `Derive the term from the **brief** — 3–8 content words naming what this task is about: the system, feature, ticket, or concept. The headline is: *"${headline.replace(/"/g, '\\"')}"*. Use it when it is descriptive. Skip it when it matches a boilerplate pattern — "Briefing — N tasks landed", "Continue after TSK-…", "Follow-on: …" — those describe the task's shape, not its subject, and return generic project docs with no structural links.`,
    "",
    "This returns the most relevant documents and prior task reports in one call,",
    "including things the brief's `context:` list does not mention. The `context:`",
    "array is written from memory; this is not. Skim before opening any file.",
    "See `agents/_shared/rules/context-discovery.md` for why this comes first.",
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
    `**DO NOT touch the YAML envelope** at \`agents/${agent}/tasks/open/${taskId}.yaml\`. The runner owns it — it will update the status field, append the history entry, and move the file to the matching bucket once it sees your .md report. If you move, rename, or rewrite the .yaml yourself, the runner's transition silently fails: no chat notification, no journal entry, no Alice continuation. Just write the .md and stop.`,
    "",
    "Use `waiting` when you cannot proceed because you need another task's output, another agent's work, or the user's input. The runner parks your envelope and re-claims when the dependency clears. NEVER use `failed: dependency` — that's a worker bug; use `waiting` instead.",
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

// === Phase 1: task graph + deterministic ready-set ========================
//
// One scan per tick builds an in-memory index of all known tasks.  The
// reverse-index (dependants) lets the frontier check (Phase 2) be O(1)
// instead of scanning every bucket on each termination.
//
// `ready()` is a pure function of the graph — testable with fixture dirs,
// callable without spawning a worker.  Signature required by Jess's test
// suite (TSK-2026-08-27-0001):
//
//   const graph = await loadGraph(fixtureDir, ["alice", "bob"]);
//   ready("TSK-...", graph);  // → boolean

interface GraphNode {
  owner: string;        // which agent directory owns this envelope
  id: string;
  rawStatus: string;   // value of the `status:` field
  bucket: string;      // filesystem directory (open | waiting | done | failed | paused | archived)
  isDone: boolean;     // rawStatus === "done"
  isFailed: boolean;   // rawStatus starts with "failed:" (or === "failed")
  isTerminal: boolean; // isDone || isFailed
  needs: string[];
  after: string[];
  // Phase 2 fields: continuation target (reply_to ?? from) and sibling joins
  // (tasks sharing a parent) need these. Stored here so the graph is self-
  // contained and Phase 2 doesn't have to re-read envelopes from disk.
  to: string;
  parent: string | null;
  reply_to: string | null;
  kind: string;        // kind: field value — used by the continuation guard (Phase 3)
}

interface TaskGraph {
  nodes: Map<string, GraphNode>;
  dependants: Map<string, string[]>; // reverse index: depId → [ids that declare it in needs/after]
  errors: { id: string; problem: string }[]; // F1 (unparseable) + F2 (dangling edge)
}

// Build the task graph from disk.  Pass `agentsDir` explicitly so tests can
// point at a fixture directory rather than the live agents/ tree.
const GRAPH_SCAN_BUCKETS = ["open", "waiting", "done", "failed", "paused", "archived", "blocked"] as const;

export async function loadGraph(agentsDir: string, agents: string[]): Promise<TaskGraph> {
  const nodes = new Map<string, GraphNode>();
  const dependants = new Map<string, string[]>();
  const errors: { id: string; problem: string }[] = [];
  const nodeOwner = new Map<string, string>(); // taskId → agent, for journal writes

  for (const agent of agents) {
    for (const bucket of GRAPH_SCAN_BUCKETS) {
      const dir = join(agentsDir, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const fname of entries) {
        if (!fname.endsWith(".yaml")) continue;
        const taskId = fname.replace(/\.yaml$/, "");
        let content: string;
        try {
          content = await readFile(join(dir, fname), "utf-8");
        } catch { continue; }

        // F1: validate parseability before extracting any fields.  A corrupt
        // envelope whose `status:` line still regex-matches would otherwise
        // enter the graph as a ready node (WAL-79 class — nine envelopes
        // invisible for exactly this reason).  Parse-or-record-error, never
        // parse-or-ignore.
        try {
          yamlLoad(content);
        } catch (e) {
          const problem = `unparseable YAML: ${(e as Error).message.split("\n")[0]}`;
          errors.push({ id: taskId, problem });
          const key = `${taskId}:${problem}`;
          if (!warnedGraphErrors.has(key)) {
            warnedGraphErrors.add(key);
            console.warn(`[graph] ${taskId}: ${problem}`);
            // Journal for durable visibility (FDP §Graph errors). Must not
            // throw — a journal failure must never abort the claim pass.
            await writeFile(
              join(agentsDir, agent, "tasks", "journal.ndjson"),
              JSON.stringify({ ts: new Date().toISOString(), id: taskId, event: "graph-error", problem }) + "\n",
              { flag: "a" }
            ).catch(() => {});
          }
          continue; // exclude from graph — never admit as ready
        }

        const rawStatus = (readField(content, "status") ?? "open").trim();
        const isDone = rawStatus === "done";
        const isFailed = rawStatus === "failed" || rawStatus.startsWith("failed:");
        const needs = readList(content, "needs");
        const after = readList(content, "after");
        const toRaw = (readField(content, "to") ?? "").trim();
        const parentRaw = readField(content, "parent");
        const replyToRaw = readField(content, "reply_to");

        if (nodes.has(taskId)) {
          // Duplicate id across buckets (e.g. open/ + done/ after a crash between
          // the write and the unlink). Prefer the terminal copy — the open/ copy
          // is stale. Record in graph.errors so dependants don't block forever.
          const incomingIsTerminal = isDone || isFailed;
          const existing = nodes.get(taskId)!;
          const problem = incomingIsTerminal
            ? `duplicate id in ${existing.bucket}/ and ${bucket}/; preferring terminal ${bucket} copy`
            : `duplicate id in ${existing.bucket}/ and ${bucket}/; keeping ${existing.bucket} copy`;
          errors.push({ id: taskId, problem });
          const errKey = `${taskId}:graph-dup`;
          if (!warnedGraphErrors.has(errKey)) {
            warnedGraphErrors.add(errKey);
            console.warn(`[graph] ${taskId}: ${problem}`);
            await writeFile(
              join(agentsDir, agent, "tasks", "journal.ndjson"),
              JSON.stringify({ ts: new Date().toISOString(), id: taskId, event: "graph-error", problem }) + "\n",
              { flag: "a" }
            ).catch(() => {});
          }
          if (!incomingIsTerminal) continue; // keep existing; incoming is stale
          nodes.delete(taskId); // incoming is terminal — replace the stale non-terminal copy below
        }

        const kindRaw = (readField(content, "kind") ?? "").trim();
        const node: GraphNode = {
          id: taskId,
          owner: agent,
          rawStatus,
          bucket,
          isDone,
          isFailed,
          isTerminal: isDone || isFailed,
          needs,
          after,
          to: toRaw,
          parent: parentRaw && parentRaw !== "null" ? parentRaw : null,
          reply_to: replyToRaw && replyToRaw !== "null" ? replyToRaw : null,
          kind: kindRaw,
        };
        nodes.set(taskId, node);
        nodeOwner.set(taskId, agent);
      }
    }
  }

  // Second pass: build reverse index + F2/F3 edge validation.
  // Done after all nodes load so forward references resolve correctly.
  const graphRecordError = async (id: string, problem: string) => {
    errors.push({ id, problem });
    const key = `${id}:${problem}`;
    if (!warnedGraphErrors.has(key)) {
      warnedGraphErrors.add(key);
      console.warn(`[graph] ${id}: ${problem}`);
      const owner = nodeOwner.get(id);
      if (owner) {
        await writeFile(
          join(agentsDir, owner, "tasks", "journal.ndjson"),
          JSON.stringify({ ts: new Date().toISOString(), id, event: "graph-error", problem }) + "\n",
          { flag: "a" }
        ).catch(() => {});
      }
    }
  };

  for (const node of nodes.values()) {
    const allDeps = new Set([...node.needs, ...node.after]);
    for (const depId of allDeps) {
      // F3: self-reference — a task that depends on itself can never be ready.
      if (depId === node.id) {
        await graphRecordError(node.id, `self-reference in ${node.needs.includes(node.id) ? "needs" : "after"}`);
        continue;
      }
      if (!nodes.has(depId)) {
        // F2: dangling edge — the dep is not in the graph.
        await graphRecordError(node.id, `edge references unknown task ${depId}`);
        continue;
      }
      // Build reverse index — deduped.  A task declaring the same dep in
      // both `needs` and `after` appears once in dependants[dep].
      if (!dependants.has(depId)) dependants.set(depId, []);
      const list = dependants.get(depId)!;
      if (!list.includes(node.id)) list.push(node.id);
    }
  }

  // Third pass: cycle detection via DFS through forward edges.
  // F4: a cycle means all tasks in it can never become ready.
  {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = async (id: string): Promise<void> => {
      if (inStack.has(id)) {
        await graphRecordError(id, `cycle detected: ${[...inStack, id].join(" → ")}`);
        return;
      }
      if (visited.has(id)) return;
      inStack.add(id);
      const node = nodes.get(id);
      if (node) {
        for (const dep of [...node.needs, ...node.after]) {
          if (nodes.has(dep)) await dfs(dep); // only traverse known nodes
        }
      }
      inStack.delete(id);
      visited.add(id);
    };

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) await dfs(nodeId);
    }
  }

  return { nodes, dependants, errors };
}

// Pure ready predicate — DEC-0004 and Phase 1 spec.
//
// ready = open ∧ ¬paused ∧ all needs done ∧ all after terminal
//
// "open" means the task is in the open/ bucket (not paused/, waiting/, etc.).
// "¬paused" is an explicit guard: a paused task whose deps all resolved must
// NEVER start itself — the whole point of DEC-0004 is that it surfaces for
// a human first (auto-pause re-readies itself on resume, not on dep resolution).
//
// Caller invariant: the caller must ensure the task is not currently claimed
// before calling this predicate. `ready()` does not check for claimed status.
// In `tickOnce`, the `isClaimed || isTerminalish` guard runs before this call,
// so claimed tasks never reach it. In tests, fixtures should only build
// non-claimed tasks in open/. A future caller that skips the claim guard would
// incorrectly double-claim a task — do not remove the guard from tickOnce.
export function ready(taskId: string, graph: TaskGraph): boolean {
  const node = graph.nodes.get(taskId);
  if (!node) return false;

  // Must be in open/ bucket and not paused (DEC-0004 — paused outranks edges).
  if (node.bucket !== "open" || node.rawStatus === "paused") return false;

  // All needs must be done.
  for (const depId of node.needs) {
    const dep = graph.nodes.get(depId);
    if (!dep?.isDone) return false;
  }

  // All after must be terminal (done or failed).
  for (const depId of node.after) {
    const dep = graph.nodes.get(depId);
    if (!dep?.isTerminal) return false;
  }

  return true;
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
    kind: readField(yaml, "kind") ?? "unknown",
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: "auto-claimed",
  });
  return fields;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// Note: an earlier `handoffToContinuation` helper used to short-circuit
// waiting:on:task:X by spawning a sibling continuation immediately and
// marking the parent done. Removed 2026-05-25 (see TSK-2026-05-25-0002.06).
// The continuation model was later redesigned in v1.15 (WAL-72 Phase 3+4).

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

  const sm = (directive.summary || "").replace(/\s+/g, " ").trim().slice(0, 120);
  console.log(`[${new Date().toLocaleTimeString()}] [task] ⏸ ${finalStatus} ${agent}/${taskId}${sm ? ` — ${sm}` : ""}`);

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
    kind: readField(yaml, "kind") ?? "unknown",
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: directive.summary || `waiting on ${onSpec}`,
  });
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
//
// "archived" is intentionally excluded from the bucket list. That bucket is
// managed exclusively by sweepArchive() and must not be touched during live
// active-bucket transitions — including during a waiting→done move.
async function cleanStaleRendezvous(
  agent: string,
  taskId: string,
  keepBucket: "open" | "waiting" | "done" | "failed" | "paused"
): Promise<void> {
  const buckets: Array<"open" | "waiting" | "done" | "failed" | "paused"> = ["open", "waiting", "done", "failed", "paused"];
  const keepDir = join(AGENTS_DIR, agent, "tasks", keepBucket);
  const keepPath = join(keepDir, `${taskId}.md`);

  // If the report isn't in the keep bucket yet, find the best copy and promote
  // it via rename (atomic, same filesystem). Without this step the old code
  // would delete the only existing copy — the bug that destroyed nine reports.
  if (!existsSync(keepPath)) {
    const found: Array<{ bucket: string; path: string; mtime: number }> = [];
    for (const b of buckets) {
      if (b === keepBucket) continue;
      const p = join(AGENTS_DIR, agent, "tasks", b, `${taskId}.md`);
      if (existsSync(p)) {
        let mtime = 0;
        try { mtime = (await stat(p)).mtimeMs; } catch {}
        found.push({ bucket: b, path: p, mtime });
      }
    }
    if (found.length > 0) {
      found.sort((a, b) => b.mtime - a.mtime);
      const winner = found[0]!;
      const rest = found.slice(1);
      if (rest.length > 0) {
        console.warn(
          `[rendezvous] ${taskId}: multiple copies (${found.map((c) => c.bucket).join(", ")}); ` +
          `promoting ${winner.bucket} → ${keepBucket}, discarding ${rest.map((c) => c.bucket).join(", ")}`
        );
      }
      await mkdir(keepDir, { recursive: true });
      await rename(winner.path, keepPath);
      for (const copy of rest) {
        try { await unlink(copy.path); } catch {}
      }
    }
  }

  // Delete any remaining stale copies from non-keep buckets (handles the
  // case where keepPath already existed and duplicates need clearing).
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

      const closedBy = readNestedField(yaml, "closed", "by");
      const closedStatus = readNestedField(yaml, "closed", "status");
      if (closedStatus) {
        if (closedBy !== "auto-on-waiting-task") {
          // Some other tombstone — leave for sweepArchive.
          continue;
        }
        // Park marker (closedBy === "auto-on-waiting-task"): fall through to
        // the dependency check. The closed block is cleared on unblock so the
        // task returns to active leaves.
      }

      let unblocked = false;
      if (spec === "limits") {
        // Check the limits gate directly; sweeps now run regardless of gate state.
        const limitsGate = await readLimitsGate();
        unblocked = limitsGate === null;
        if (unblocked) {
          console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} limits gate clear — unblocking`);
        }
      } else {
        unblocked = await checkDependencyResolved(spec, opts.agents);
      }
      if (!unblocked) continue;

      const fields = parseFields(yaml, taskId);
      const now = new Date().toISOString();
      let next = setField(yaml, "status", "open");
      next = setField(next, "updated", now);
      // Clear the park-marker tombstone for worker tasks that were stamped by
      // transitionToWaiting. Without this, the task returns to open/ but still
      // carries closed.status:superseded — the active-leaves view would hide it.
      if (closedBy === "auto-on-waiting-task") {
        next = setClosedField(next, null);
      }
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
        kind: readField(yaml, "kind") ?? "unknown",
        from: fields.from,
        to: agent,
        parent: fields.parent,
        summary: `unblocked from ${spec}`,
      });

      console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} unblocked (${spec})`);
    }
  }
}

// Generate a child task id for any agent using the decimal sub-task scheme.
// Frontier check + continuation (WAL-72 Phase 2+3, FDP v1.15).
//
// Called after every terminal transition.  If nothing downstream declares
// `taskId` in `needs` or `after` (empty reverse index = frontier task), and
// the task is not itself a continuation (DEC-12 loop guard), spawn a single
// continuation envelope addressed to `target(t) := reply_to ?? from`.
//
// agentsDir defaults to the module-level AGENTS_DIR so the live path needs
// no extra argument.  Tests pass an explicit fixture dir.
// Allocate a fresh task id for a frontier continuation.
//
// Uses the tick-scoped graph (which includes in-memory insertions from earlier
// spawns in the same tick) plus a quick filesystem scan of the target agent's
// open/ dir.  Graph-first means tests using fixture agentsDir get consistent ids.
// Filesystem scan catches files written by the current tick that aren't yet
// in the next tick's graph.
async function nextContTaskId(
  parentId: string | null,
  targetAgent: string,
  graph: TaskGraph,
  agentsDir: string
): Promise<string> {
  const SCAN_DIRS = ["open", "waiting", "done", "failed", "paused", "archived", "blocked"];

  if (parentId) {
    const root = parentId.split(".")[0]!;
    const childRe = new RegExp(`^${escapeRegex(root)}\\.(\\d+)$`);
    let maxN = 0;
    // First: scan graph nodes (in-memory, includes this tick's spawned nodes)
    for (const id of graph.nodes.keys()) {
      const m = childRe.exec(id);
      if (!m) continue;
      const n = Number.parseInt(m[1] ?? "", 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
    // Then: filesystem scan for files written after the graph was loaded
    for (const sub of SCAN_DIRS) {
      const dir = join(agentsDir, targetAgent, "tasks", sub);
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const fname of entries) {
        const m = new RegExp(`^${escapeRegex(root)}\\.(\\d+)\\.yaml$`).exec(fname);
        if (!m) continue;
        const n = Number.parseInt(m[1] ?? "", 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
    return `${root}.${String(maxN + 1).padStart(2, "0")}`;
  }

  // Top-level id: TSK-YYYY-MM-DD-NNNN, scoped across all agents
  const d = new Date();
  const datePart =
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `TSK-${datePart}-`;
  let maxN = 0;
  for (const id of graph.nodes.keys()) {
    if (!id.startsWith(prefix)) continue;
    const tail = id.slice(prefix.length);
    if (tail.includes(".")) continue;
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  // Filesystem scan across all agents for files written after graph load
  const agentDirs = (await readdir(agentsDir).catch(() => [] as string[])).filter((a) => {
    return !a.startsWith(".");
  });
  for (const a of agentDirs) {
    for (const sub of SCAN_DIRS) {
      const dir = join(agentsDir, a, "tasks", sub);
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const fname of entries) {
        if (!fname.startsWith(prefix) || !fname.endsWith(".yaml")) continue;
        const tail = fname.slice(prefix.length, -5);
        if (tail.includes(".")) continue;
        const n = Number.parseInt(tail, 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return `${prefix}${String(maxN + 1).padStart(4, "0")}`;
}

// Continuation model — FDP v1.15 (Kelly, 2026-08-28).
//
// Spawn rule: when task `t` reaches a terminal state —
//   1. target := t.reply_to ?? t.from.  If not a spawnable agent, surface and return.
//   2. family := all tasks sharing t.parent (just {t} when parent is null).
//   3. If a non-terminal continuation already exists with parent==t.parent and to==target, skip.
//      (Non-terminal means bucket != done and bucket != failed.)
//   4. Spawn with to:target, parent:t.parent, after:[every member of family INCLUDING t itself].
//      The self-edge is what puts the continuation into dependants[t], which is what makes
//      the existing `downstreams.length > 0` guard refuse a second spawn. Without it the
//      guard is blind. This inverts Jess's assertion 2e (frontier-integrity.test.ts) —
//      the completing task IS its own continuation dependency per v1.15.
//
// Uses after: not needs: — a continuation reports what happened, so a failed sibling must
// not block the briefing that exists to surface that failure.
//
// The graph parameter is the tick-scoped graph, hoisted from tickOnce and passed through
// transitionToTerminal. After spawning, the new node is inserted into graph (both nodes and
// dependants) so a second transition in the same tick sees it and skips.
//
// DEC-12 guard: a kind:continuation node must never spawn another continuation.
// Alice gate removed (Phase 3 deletion).

// v1.16: scan target agent's open/ and waiting/ for a non-terminal continuation
// whose parent matches familyParent. Used at transition time rather than relying
// on the tick-scoped graph (F1b: graph is claim-tick-scoped, not transition-time).
async function findExistingContinuation(
  familyParent: string,
  target: string,
  agentsDir: string
): Promise<{ id: string; path: string; yaml: string } | null> {
  // paused/ and blocked/ are also non-terminal — DEC-0004 may auto-pause a stale
  // continuation. Scanning all four ensures a paused hold is respected (extend +
  // leave paused) rather than bypassed by a fresh open spawn (v1.17).
  for (const bucket of ["open", "waiting", "paused", "blocked"] as const) {
    const dir = join(agentsDir, target, "tasks", bucket);
    let entries: string[];
    try { entries = await readdir(dir); } catch { continue; }
    for (const fname of entries.filter((f) => f.endsWith(".yaml"))) {
      const path = join(dir, fname);
      let yaml: string;
      try { yaml = await readFile(path, "utf-8"); } catch { continue; }
      if ((readField(yaml, "kind") ?? "").trim() !== "continuation") continue;
      if ((readField(yaml, "parent") ?? "").trim() !== familyParent) continue;
      return { id: fname.replace(/\.yaml$/, ""), path, yaml };
    }
  }
  return null;
}

// v1.16: extend an existing continuation's after: to include late siblings.
// When a sibling completes after the first continuation was already spawned,
// we add it to the existing continuation's after: list rather than spawning
// a duplicate (F1a: staggered families).
async function extendContinuationAfter(
  contPath: string,
  contYaml: string,
  familyIds: string[]
): Promise<void> {
  const existing = readList(contYaml, "after");
  const merged = [...new Set([...existing, ...familyIds])];
  if (merged.length === existing.length && familyIds.every((id) => existing.includes(id))) return;
  const newBlock = `after:\n${merged.map((id) => `  - ${id}`).join("\n")}\n`;
  const afterRe = /^after:\s*\n(  - [^\n]+\n)*/m;
  let next = afterRe.test(contYaml) ? contYaml.replace(afterRe, newBlock) : `${contYaml}\n${newBlock}`;
  next = setField(next, "updated", new Date().toISOString());
  await writeFile(contPath, next);
}

// F3: when the completing task has no spawnable target, write a notification
// task to the coordinator (alice) so the completion is dashboard-visible.
async function spawnUnresolvableNotification(
  yaml: string,
  taskId: string,
  agent: string,
  graph: TaskGraph,
  agentsDir: string
): Promise<void> {
  const coordinator = "alice";
  const openDir = join(agentsDir, coordinator, "tasks", "open");
  try { await mkdir(openDir, { recursive: true }); } catch { return; }
  const id = await nextContTaskId(null, coordinator, graph, agentsDir);
  const now = new Date().toISOString();
  const q = (v: string) => JSON.stringify(v);
  const headlineRaw = (readField(yaml, "headline") ?? "").trim();
  const headline = /^".*"$/.test(headlineRaw) ? headlineRaw.slice(1, -1) : headlineRaw;
  const fromRaw = (readField(yaml, "from") ?? "user").trim();
  const body = [
    `id: ${id}`,
    `headline: ${q(`Completed: ${(headline || taskId).slice(0, 64)}`)}`,
    `created: ${now}`,
    `updated: ${now}`,
    ``,
    `from: runner`,
    `to: ${coordinator}`,
    `parent: ${taskId}`,
    `reply_to: null`,
    ``,
    `kind: notification`,
    `deadline: null`,
    ``,
    `budget:`,
    `  max_turns: 2`,
    `  max_subagents: 0`,
    `  max_usd: null`,
    ``,
    `brief: |`,
    `  Task ${taskId} (agent: ${agent}, dispatched by: ${fromRaw}) has reached a terminal state.`,
    `  Read agents/${agent}/tasks/done/${taskId}.yaml and emit:`,
    `  <task-done summary="one sentence"> or <task-waiting on="user" summary="...">`,
    ``,
    `context:`,
    `  - agents/${agent}/tasks/done/${taskId}.yaml`,
    ``,
    `status: open`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history:`,
    `  - ts: ${now}`,
    `    from: null`,
    `    to: open`,
    `    by: runner`,
    `    note: ${q(`completion notification — ${agent}/${taskId} had unresolvable target`)}`,
    ``,
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
    `report: ""`,
    ``,
  ].join("\n");
  await writeFile(join(openDir, `${id}.yaml`), body);
  await appendJournal(coordinator, {
    ts: now,
    id,
    status: "open",
    kind: "notification",
    from: "runner",
    to: coordinator,
    parent: taskId,
    summary: `completion notification for ${agent}/${taskId}`,
  });
}

async function checkFrontierAndMaybeSpawnContinuation(
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  graph: TaskGraph,
  agentsDir: string = AGENTS_DIR
): Promise<void> {
  // DEC-12: a continuation must never spawn another continuation.
  const kind = (readField(yaml, "kind") ?? "").trim();
  if (kind === "continuation") {
    console.warn(
      `[multi-agent] ${agent}/${taskId}: kind:continuation reached frontier with no downstream — NOT spawning (DEC-12 loop guard)`
    );
    return;
  }

  const replyToRaw = readField(yaml, "reply_to");
  const fromRaw = readField(yaml, "from");
  const target = (
    (replyToRaw && replyToRaw !== "null" ? replyToRaw : null) ??
    (fromRaw && fromRaw !== "null" ? fromRaw : null) ??
    ""
  ).trim();

  // F3: if target is not a known spawnable agent, spawn a notification task to
  // the coordinator (alice) so the completion is dashboard-visible rather than
  // being a silent console.log.
  if (!target || target === "user" || target === "runner" || !agents.includes(target)) {
    await spawnUnresolvableNotification(yaml, taskId, agent, graph, agentsDir);
    console.log(
      `[multi-agent] ${agent}/${taskId}: frontier — unresolvable target "${target}" — completion notification queued`
    );
    return;
  }

  // Non-continuation join-task guard: if T has a downstream that is NOT a
  // continuation, something else manages the flow — skip the spawn.
  // Continuations are NOT checked here; they are scanned from the filesystem
  // below (v1.16), avoiding the claim-tick-scoped graph blindspot (F1b).
  const parentRaw = readField(yaml, "parent");
  const parent = parentRaw && parentRaw !== "null" ? parentRaw.trim() : null;
  const downstreams = graph.dependants.get(taskId) ?? [];
  const hasJoinDownstream = downstreams.some((depId) => {
    const node = graph.nodes.get(depId);
    if (!node) return true;
    return node.kind !== "continuation";
  });
  if (hasJoinDownstream) {
    console.log(
      `[multi-agent] ${agent}/${taskId}: has non-continuation downstream — skipping continuation spawn`
    );
    return;
  }

  // Build family = completing task + all siblings sharing the same parent.
  // The after: block includes t (self-edge).
  const familyIds: string[] = [taskId]; // always includes the completing task (self-edge)
  if (parent) {
    for (const [sibId, node] of graph.nodes) {
      if (sibId !== taskId && node.parent === parent) familyIds.push(sibId);
    }
  }

  // v1.16: scan filesystem for an existing non-terminal continuation with matching
  // (parent, target) at transition time. This is correct across ticks (F1b) and
  // across different-target siblings in the same family (F2).
  const contParent = parent ?? taskId;
  const existing = await findExistingContinuation(contParent, target, agentsDir);
  if (existing) {
    // Extend the existing continuation's after: to include the late sibling (F1a).
    await extendContinuationAfter(existing.path, existing.yaml, familyIds);
    // Reflect the extension in the tick-scoped graph so same-tick transitions see it.
    const existingNode = graph.nodes.get(existing.id);
    if (existingNode) {
      for (const memberId of familyIds) {
        if (!existingNode.after.includes(memberId)) existingNode.after.push(memberId);
        const deps = graph.dependants.get(memberId) ?? [];
        if (!deps.includes(existing.id)) deps.push(existing.id);
        graph.dependants.set(memberId, deps);
      }
    }
    console.log(
      `[multi-agent] ${agent}/${taskId}: found existing continuation ${existing.id} — extended after: with [${familyIds.join(", ")}]`
    );
    return;
  }

  const id = await nextContTaskId(parent, target, graph, agentsDir);
  const now = new Date().toISOString();
  const q = (v: string) => JSON.stringify(v);
  const firstHeadlineRaw = (readField(yaml, "headline") ?? "").trim();
  const firstHeadline = /^".*"$/.test(firstHeadlineRaw)
    ? firstHeadlineRaw.slice(1, -1)
    : firstHeadlineRaw;
  const headline = firstHeadline ? `Continue: ${firstHeadline.slice(0, 64)}` : `Continue after ${taskId}`;

  // after: not needs: — a continuation reports what happened; failed siblings must not block it.
  const afterBlock = `after:\n${familyIds.map((s) => `  - ${s}`).join("\n")}\n`;

  const body = [
    `id: ${id}`,
    `headline: ${q(headline)}`,
    `created: ${now}`,
    `updated: ${now}`,
    "",
    `from: runner`,
    `to: ${target}`,
    parent ? `parent: ${parent}` : `parent: ${taskId}`,
    `reply_to: null`,
    "",
    `kind: continuation`,
    `deadline: null`,
    "",
    `budget:`,
    `  max_turns: 6`,
    `  max_subagents: 0`,
    `  max_usd: null`,
    "",
    `brief: |`,
    `  Sub-task ${taskId} (${agent}) has landed as terminal.`,
    `  Read the report and write a consolidated briefing for the user, then emit`,
    `  <task-done summary="..."> or surface a <task-waiting on="user" summary="...">.`,
    "",
    afterBlock.trimEnd(),
    "",
    `context:`,
    `  - agents/${agent}/tasks/done/${taskId}.yaml`,
    "",
    `status: open`,
    `lease:`,
    `  holder: null`,
    `  expires: null`,
    `history:`,
    `  - ts: ${now}`,
    `    from: null`,
    `    to: open`,
    `    by: runner`,
    `    note: ${q(`frontier continuation after ${taskId}`)}`,
    "",
    `summary:`,
    `  brief: ""`,
    `  response: ""`,
    `report: ""`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const openDir = join(agentsDir, target, "tasks", "open");
  await mkdir(openDir, { recursive: true });
  await writeFile(join(openDir, `${id}.yaml`), body);

  // Insert the new continuation node into the tick-scoped graph so subsequent
  // transitions in the same tick see it and skip. Both nodes and dependants maps
  // must be updated — the dependants entry is what makes `downstreams.length > 0` fire.
  const newNode: GraphNode = {
    id,
    owner: target,
    rawStatus: "open",
    bucket: "open",
    isDone: false,
    isFailed: false,
    isTerminal: false,
    needs: [],
    after: familyIds,
    to: target,
    parent: parent ?? taskId,
    reply_to: null,
    kind: "continuation",
  };
  graph.nodes.set(id, newNode);
  for (const memberId of familyIds) {
    const deps = graph.dependants.get(memberId) ?? [];
    if (!deps.includes(id)) deps.push(id);
    graph.dependants.set(memberId, deps);
  }

  await appendJournal(target, {
    ts: now,
    id,
    status: "open",
    kind: "continuation",
    from: "runner",
    to: target,
    parent: parent ?? taskId,
    summary: `frontier continuation after ${taskId}`,
  });

  console.log(`[multi-agent] ${agent}/${taskId}: frontier → spawned continuation ${target}/${id}`);
}

async function transitionToTerminal(
  agent: string,
  taskId: string,
  openPath: string,
  directive: TaskDirective,
  graph: TaskGraph
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

  const icon = directive.kind === "done" ? "✓" : "✗";
  const sm = (directive.summary || "").replace(/\s+/g, " ").trim().slice(0, 120);
  console.log(`[${new Date().toLocaleTimeString()}] [task] ${icon} ${finalStatus} ${agent}/${taskId}${sm ? ` — ${sm}` : ""}`);

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
  // Mid-flight abort: stamp a `closed: cancelled` overlay so the task reads
  // as a deliberate cancellation (not an active leaf, not a failure needing
  // retry). The bucket is still failed/ and status failed:aborted preserves
  // the lifecycle truth; the closed block is the user-attention layer.
  if (directive.cancelled) {
    next = setClosedField(next, {
      status: "cancelled",
      at: now,
      by: directive.cancelled.by || "user",
      reason: directive.cancelled.reason || "aborted mid-flight via dashboard",
    });
  }

  next = appendHistory(next, {
    ts: now,
    from: "claimed",
    to: finalStatus,
    by: `runner-${process.pid}`,
    note: directive.cancelled
      ? `worker aborted mid-flight by ${directive.cancelled.by || "user"}${directive.cancelled.reason ? ` — ${directive.cancelled.reason}` : ""}`
      : directive.kind === "done" ? "worker completed" : `worker reported ${finalStatus}`,
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
    kind: readField(yaml, "kind") ?? "unknown",
    from: fields.from,
    to: agent,
    parent: fields.parent,
    summary: directive.summary,
  });

  // Frontier check: spawn a continuation if nothing downstream declares this
  // task and it is not itself a continuation (DEC-12 loop guard).
  await checkFrontierAndMaybeSpawnContinuation(next, taskId, agent, knownAgents(), graph);

  // Auto-close parent if this was a `closes_parent_on_done` child landing as
  // done. Spawned by Kelly via the "Next" button on a waiting:on:user task —
  // when the child succeeds, the parent question is answered and the parent
  // envelope can transition out of waiting/.
  if (directive.kind === "done") {
    await maybeCloseParentOnUserUnblock(next, taskId);
  }

  // When a task fails, move its needs-dependants to blocked/ so they don't
  // sit in open/ forever. Does not cascade — dependants of blocked tasks stay open.
  if (directive.kind !== "done") {
    await sweepBlockedDependants(taskId, graph, AGENTS_DIR);
  }
}

// When a failed task has dependants that declared `needs:` on it (not `after:`),
// those dependants can never become ready — move them to blocked/.
// No auto-cascade: dependants of the blocked task stay in open/ (DEC-13/14).
async function sweepBlockedDependants(
  failedId: string,
  graph: TaskGraph,
  agentsDir: string
): Promise<void> {
  const deps = graph.dependants.get(failedId) ?? [];
  for (const depId of deps) {
    const node = graph.nodes.get(depId);
    if (!node) continue;
    if (!node.needs.includes(failedId)) continue; // after: doesn't block
    if (node.bucket !== "open" && node.bucket !== "waiting") continue; // already terminal
    if (node.rawStatus === "blocked") continue;

    const srcPath = join(agentsDir, node.owner, "tasks", node.bucket, `${depId}.yaml`);
    let yaml: string;
    try {
      yaml = await readFile(srcPath, "utf-8");
    } catch { continue; }

    const now = new Date().toISOString();
    let next = setField(yaml, "status", "blocked");
    next = setField(next, "updated", now);
    next = setField(next, "blocked_by", failedId);
    next = appendHistory(next, {
      ts: now,
      from: node.rawStatus,
      to: "blocked",
      by: `runner-${process.pid}`,
      note: JSON.stringify(`needs: dep ${failedId} reached failed — task can never become ready`),
    });

    const blockedDir = join(agentsDir, node.owner, "tasks", "blocked");
    await mkdir(blockedDir, { recursive: true });
    const destPath = join(blockedDir, `${depId}.yaml`);
    await writeFile(srcPath, next);
    await rename(srcPath, destPath);

    await appendJournal(node.owner, {
      ts: now,
      id: depId,
      status: "blocked",
      kind: node.kind || "unknown",
      from: node.owner,
      to: node.owner,
      parent: node.parent ?? null,
      summary: `blocked: needs dep ${failedId} failed`,
      level: "error",
    });

    // Update in-memory graph so subsequent checks in this tick see the new state.
    node.bucket = "blocked";
    node.rawStatus = "blocked";

    console.error(
      `[multi-agent] ${node.owner}/${depId}: moved to blocked/ — needs dep ${failedId} reached failed`
    );
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

  const agents = knownAgents();
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
    // WAL-63 Phase 1: also flip the user-attention overlay to `closed`.
    // The runner status transition (waiting:on:user → done) is preserved
    // unchanged; this is the additional user-attention closure that puts
    // the parent in the audit trail rather than leaving it as a stale
    // "done but not triaged" leaf in the Current view.
    next = setClosedField(next, {
      status: "closed",
      at: now,
      by: "runner",
      reason: `auto-closed by child ${childId} (waiting:on:user resolved)`,
    });
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

  const headline = (yaml.match(/^headline:\s*(.*)$/m)?.[1] ?? "").replace(/^["']|["']$/g, "").trim();
  console.log(`[${new Date().toLocaleTimeString()}] [task] ▶ start ${agent}/${taskId}${headline ? ` — ${headline}` : ""}`);

  // Register an AbortController so the dashboard can kill this worker
  // mid-turn (see abortInflightWorker). Cleared in the finally below.
  const key = inflightKey(agent, taskId);
  const entry: InflightEntry = { controller: new AbortController(), aborted: false, by: "", reason: "", claimedAt: Date.now() };
  inflightWorkers.set(key, entry);

  try {
  let captured = "";
  // Out-of-band diagnostic stream: stderr + result-event text + exit marker.
  // These carry usage-limit signatures that never reach the assistant-text
  // `captured` stream (stderr-only messages, error result events after prior
  // output, immediate non-zero exits). Kept separate so it doesn't pollute
  // directive parsing, but fed to detectLimitsHit alongside captured.
  let diag = "";
  try {
    await streamUserMessage(
      `multi-agent:${taskId}`,
      prompt,
      (chunk) => { captured += chunk; },
      () => {},
      entry.controller.signal,
      threadId,
      agent,
      (d) => { diag += d; }
    );
  } catch (err) {
    if (entry.aborted) {
      // The spawn was killed by an abort signal — the thrown error is the
      // kill, not a real crash. Fall through to the cancellation directive.
      console.warn(`[multi-agent] worker ${agent}/${taskId} aborted by ${entry.by || "user"} mid-turn`);
      return {
        kind: "failed",
        reason: "aborted",
        summary: entry.reason
          ? `Aborted mid-flight by ${entry.by || "user"}: ${entry.reason}`
          : `Aborted mid-flight by ${entry.by || "user"}.`,
        body: "",
        report: null,
        cancelled: { by: entry.by || "user", reason: entry.reason },
      };
    }
    const errText = err instanceof Error ? err.message : String(err);
    if (detectLimitsHit(errText) || detectLimitsHit(captured) || detectLimitsHit(diag)) {
      await maybeSetGlobalLimitsGate(`${errText}\n${captured}\n${diag}`, agent, taskId);
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

  // Abort that resolved rather than threw: proc.kill() ends the stream
  // reader cleanly, so streamUserMessage returns normally. Catch that here
  // so an aborted worker can't fall through and get read as a (likely
  // empty) success / failed:other.
  if (entry.aborted) {
    console.warn(`[multi-agent] worker ${agent}/${taskId} aborted by ${entry.by || "user"} (stream closed cleanly)`);
    return {
      kind: "failed",
      reason: "aborted",
      summary: entry.reason
        ? `Aborted mid-flight by ${entry.by || "user"}: ${entry.reason}`
        : `Aborted mid-flight by ${entry.by || "user"}.`,
      body: "",
      report: null,
      cancelled: { by: entry.by || "user", reason: entry.reason },
    };
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

  // No file, no directive — but if the stream OR the diagnostic channel
  // (stderr / result-event / exit marker) surfaced a limit error, route to
  // waiting:on:limits so it gets retried rather than dead-ended at
  // failed:other. The diag channel is what catches the two shapes that
  // bit us on 2026-06-20: a stderr-only limit message on immediate exit,
  // and an error result event after a long-running worker already emitted
  // text (which suppressed the result-text fallback in captured).
  if (detectLimitsHit(captured) || detectLimitsHit(diag)) {
    await maybeSetGlobalLimitsGate(`${captured}\n${diag}`, agent, taskId);
    console.warn(`[multi-agent] ${agent}/${taskId}: no directive emitted but a limit signature was found (captured or diagnostic) — routing to waiting:on:limits`);
    return {
      kind: "waiting",
      reason: "limits",
      summary: "worker hit an Anthropic API limit and emitted no directive — gate set, will retry after reset",
      body: "",
      report: null,
    };
  }
  // Non-zero exit with no directive and no limit signature: a genuine crash
  // (not a clean "forgot the tag" turn). Surface it as failed:crash with the
  // exit detail so it's diagnosable, rather than the misleading "forgot the
  // closing tag" failed:other synthesised by the caller.
  if (/\[claude exited \d+\]/.test(diag)) {
    const tail = diag.slice(-400).trim();
    console.warn(`[multi-agent] ${agent}/${taskId}: worker exited non-zero with no directive — failed:crash`);
    return {
      kind: "failed",
      reason: "crash",
      summary: `worker process exited non-zero with no directive/report. Diagnostic tail: ${tail || "(empty)"}`,
      body: "",
      report: null,
    };
  }
  // No file, no directive, no limit signature, clean exit. Genuinely opaque:
  // either the worker forgot the closing tag, or it hit a limit/error whose
  // message form detectLimitsHit doesn't recognise yet. DON'T discard the
  // evidence — log the diagnostic + captured tails so the next opaque failure
  // is diagnosable, and carry them into the envelope summary so the
  // dashboard shows what happened instead of the vague "forgot the tag" guess.
  // (Returning a directive here replaces the caller's synthesised
  // failed:other with this richer one.)
  const diagTail = diag.slice(-600).trim();
  const capTail = captured.slice(-400).trim();
  const respondedNote = capTail
    ? `worker emitted ${captured.length} chars of text but no directive/report (likely forgot the closing tag)`
    : `worker emitted NO text and no directive/report (silent turn — possible undetected limit/error)`;
  console.warn(
    `[multi-agent] ${agent}/${taskId}: no directive, clean exit — ${respondedNote}.\n` +
    `  diagnostic tail: ${diagTail || "(empty)"}\n` +
    `  captured tail: ${capTail || "(empty)"}`
  );
  return {
    kind: "failed",
    reason: "other",
    summary: `${respondedNote}. Diagnostic tail: ${diagTail || "(none — no stderr/result/exit signal)"}`,
    body: "",
    report: null,
  };
  } finally {
    inflightWorkers.delete(key);
  }
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

// WAL-63 Phase 1: archive sweep is now gated on the `closed` block.
//
// Old predicate: anything in done/, failed/, waiting/ with `updated:` older
// than 7 days archived. That treated runner-terminal state as "user has
// retired this" — wrong. A `waiting:on:user` task you haven't replied to in
// 8 days would silently archive while still actively asking for attention.
//
// New predicate:
//   archive iff:
//     closed.status is non-null
//     AND (now - closed.at) > CARAVEL_MULTI_AGENT_ARCHIVE_DAYS  (default 30)
//
// Active tasks (closed: null) never archive regardless of age. Closed tasks
// fade gradually — visible in the Projects view's Closed section for 30 days
// post-close, then move to archived/ and only surface via "Show archived".
// Recover envelopes stranded in `tasks/open/` with `status: claimed` after
// a daemon crash, restart, or any other process death that killed the
// worker before it could emit a directive. Two recovery paths:
//
//   - If the envelope has a populated `summary.response` (the worker
//     actually finished its turn but the runner died before transitioning
//     the file), promote it to `status: done` directly. Captures the
//     "looks finished but stuck in claimed" case that left
//     TSK-2026-05-23-0001.13 in limbo across last night's outage.
//
//   - Otherwise re-open the envelope so the runner re-claims it on the
//     next tick. Worker context (session thread, files in cache) is
//     gone with the dead process, but the brief is still valid.
//
// `includeUnexpired = false` (default, every tick): only recover when the
// lease window has elapsed — anything within the window may still be a
// live worker on this daemon.
//
// `includeUnexpired = true` (startup only): claim any claimed envelope
// regardless of lease, because at startup the only live worker is the
// freshly-spawned daemon, so any pre-existing claim is from the prior
// process by definition.
async function sweepStaleClaims(
  opts: Required<MultiAgentOptions>,
  includeUnexpired = false
): Promise<void> {
  for (const agent of opts.agents) {
    const openDir = join(AGENTS_DIR, agent, "tasks", "open");
    if (!existsSync(openDir)) continue;
    const entries = await readdir(openDir).catch(() => [] as string[]);
    for (const fname of entries.filter((e) => e.endsWith(".yaml"))) {
      const path = join(openDir, fname);
      let yaml: string;
      try {
        yaml = await readFile(path, "utf-8");
      } catch {
        continue;
      }
      const status = (readField(yaml, "status") ?? "").trim();
      if (status !== "claimed") continue;

      const expiresRaw = readNestedField(yaml, "lease", "expires");
      const expiresMs = expiresRaw ? Date.parse(expiresRaw) : NaN;
      const expired = Number.isFinite(expiresMs) && expiresMs < Date.now();
      if (!includeUnexpired && !expired) continue;

      const taskId = fname.replace(/\.yaml$/, "");

      // Guard: skip envelopes whose worker is live on THIS daemon. The
      // inflightWorkers map is populated by runWorker() and cleared in its
      // finally block — so a present entry means the Claude subprocess is
      // currently running. Without this check, the every-tick sweep re-opens
      // a claimed envelope underneath its own still-running worker once the
      // lease expires, producing a duplicate claim on the next tick. (WAL-71)
      //
      // At startup (includeUnexpired=true) inflightWorkers is empty because
      // the new process has spawned no workers yet, so this check is a no-op
      // and all pre-existing claims are still recovered correctly.
      //
      // Hang ceiling: if the entry has been alive past MAX_WORKER_LIFETIME_MS
      // the worker may be wedged. Let recovery proceed — the subprocess timeout
      // in runner.ts is the primary bound; this ceiling is the backstop.
      const liveEntry = inflightWorkers.get(inflightKey(agent, taskId));
      if (liveEntry) {
        const ageMs = Date.now() - liveEntry.claimedAt;
        const maxMs = readMaxWorkerLifetimeMs();
        if (ageMs < maxMs) {
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} lease expired but worker is live on this daemon (${Math.round(ageMs / 1000)}s / ${Math.round(maxMs / 1000)}s max) — skipping`
          );
          continue;
        }
        console.warn(
          `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} worker has been live for ${Math.round(ageMs / 1000)}s (max ${Math.round(maxMs / 1000)}s) — possible hang, proceeding with recovery`
        );
      }

      const fields = parseFields(yaml, taskId);
      const summaryResponseRaw = readNestedField(yaml, "summary", "response") ?? "";
      const summaryResponse = summaryResponseRaw.trim().replace(/^"|"$/g, "");
      const now = new Date().toISOString();

      if (summaryResponse) {
        // Worker had emitted a completion summary — treat as done.
        let next = setField(yaml, "status", "done");
        next = setField(next, "updated", now);
        next = setNestedField(next, "lease", "holder", "null");
        next = setNestedField(next, "lease", "expires", "null");
        next = appendHistory(next, {
          ts: now,
          from: "claimed",
          to: "done",
          by: `runner-${process.pid}`,
          note: includeUnexpired
            ? "stale-claim recovery on startup: worker had populated summary.response — promoting to done"
            : "stale-claim recovery: lease expired with summary.response populated — promoting to done",
        });
        const doneDir = join(AGENTS_DIR, agent, "tasks", "done");
        await mkdir(doneDir, { recursive: true });
        await writeFile(path, next);
        try {
          await rename(path, join(doneDir, fname));
        } catch {}
        await cleanStaleRendezvous(agent, taskId, "done");
        await appendJournal(agent, {
          ts: now,
          id: taskId,
          status: "done",
          kind: readField(yaml, "kind") ?? "unknown",
          from: fields.from,
          to: agent,
          parent: fields.parent,
          summary: "stale-claim recovery (worker had completed)",
        });
        console.log(
          `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → done (stale-claim recovery, summary populated)`
        );
      } else {
        // Before re-opening, check for a rendezvous file written by the worker
        // before the daemon died. The file-as-output contract (task-output.md)
        // requires workers to write agents/<agent>/tasks/<status>/<id>.md as
        // their primary completion signal. reconcileWorkerResult reads that file
        // via readReportFile() and then populates summary.response and moves the
        // YAML. If the daemon died in the window between file-write and
        // reconciliation, summary.response stays empty but the file is on disk.
        // Without this check, sweepStaleClaims re-opens already-completed tasks
        // and they run a second time against a codebase that has moved on. (WAL-71)
        const fromReport = await readReportFile(agent, taskId);
        if (fromReport) {
          const termBucket: "done" | "failed" | "waiting" =
            fromReport.kind === "done" ? "done"
            : fromReport.kind === "failed" ? "failed"
            : "waiting";
          const termStatus =
            fromReport.kind === "done" ? "done"
            : fromReport.kind === "failed" ? `failed:${fromReport.reason ?? "other"}`
            : `waiting:on:${fromReport.reason || "user"}`;
          let next = setField(yaml, "status", termStatus);
          next = setField(next, "updated", now);
          next = setNestedField(next, "lease", "holder", "null");
          next = setNestedField(next, "lease", "expires", "null");
          if (fromReport.summary) {
            next = setNestedField(next, "summary", "response", JSON.stringify(fromReport.summary));
          }
          if (fromReport.kind === "done" && fromReport.report) {
            next = next.replace(/^report:[^\n]*(?:\n[ \t]+[^\n]*)*\n?/gm, "");
            next = next.trimEnd() + `\nreport: ${JSON.stringify(fromReport.report)}\n`;
          }
          next = appendHistory(next, {
            ts: now,
            from: "claimed",
            to: termStatus,
            by: `runner-${process.pid}`,
            note: includeUnexpired
              ? `stale-claim recovery on startup: rendezvous file found in ${termBucket}/ — promoting without re-run`
              : `stale-claim recovery: lease expired, rendezvous file found in ${termBucket}/ — promoting without re-run`,
          });
          const termDir = join(AGENTS_DIR, agent, "tasks", termBucket);
          await mkdir(termDir, { recursive: true });
          await writeFile(path, next);
          try {
            await rename(path, join(termDir, fname));
          } catch {}
          await cleanStaleRendezvous(agent, taskId, termBucket);
          await appendJournal(agent, {
            ts: now,
            id: taskId,
            status: termStatus,
            kind: readField(yaml, "kind") ?? "unknown",
            from: fields.from,
            to: agent,
            parent: fields.parent,
            summary: `stale-claim recovery (rendezvous file in ${termBucket}/)`,
          });
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → ${termBucket} (stale-claim recovery, rendezvous file found)`
          );
        } else {
          // No completion signal, no rendezvous file — reset to open.
          let next = setField(yaml, "status", "open");
          next = setField(next, "updated", now);
          next = setNestedField(next, "lease", "holder", "null");
          next = setNestedField(next, "lease", "expires", "null");
          next = appendHistory(next, {
            ts: now,
            from: "claimed",
            to: "open",
            by: `runner-${process.pid}`,
            note: includeUnexpired
              ? "stale-claim recovery on startup: re-opening for fresh claim"
              : "stale-claim recovery: lease expired with no completion signal — re-opening",
          });
          await writeFile(path, next);
          await appendJournal(agent, {
            ts: now,
            id: taskId,
            status: "open",
            kind: readField(yaml, "kind") ?? "unknown",
            from: fields.from,
            to: agent,
            parent: fields.parent,
            summary: "stale-claim recovery (re-opened for fresh claim)",
          });
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} stale claim → open (re-queued)`
          );
        }
      }
    }
  }
}

// Auto-pause a stale waiting:on:user task: stamp paused: block, record
// paused_from:, move to tasks/paused/. Called by sweepArchive when the task
// has no closed.status and its updated: timestamp exceeds AUTO_PAUSE_DAYS.
async function autoPauseTask(
  agent: string,
  taskId: string,
  srcPath: string,
  fname: string,
  yaml: string,
  priorStatus: string
): Promise<void> {
  const now = new Date().toISOString();
  let next = setField(yaml, "status", "paused");
  next = setField(next, "updated", now);
  next = setField(next, "paused_from", priorStatus);
  // Add paused: null first so setNestedField can find the parent key and
  // convert it to a block mapping. Without this, setNestedField is a no-op
  // when the parent key is absent.
  next = setField(next, "paused", "null");
  next = setNestedField(next, "paused", "at", now);
  next = setNestedField(next, "paused", "by", "runner-auto");
  next = setNestedField(next, "paused", "reason", `no movement for ${AUTO_PAUSE_DAYS} days`);
  next = appendHistory(next, {
    ts: now,
    from: priorStatus,
    to: "paused",
    by: "runner-auto",
    note: `auto-paused: no movement for ${AUTO_PAUSE_DAYS} days`,
  });

  const pausedDir = join(AGENTS_DIR, agent, "tasks", "paused");
  await mkdir(pausedDir, { recursive: true });
  await writeFile(srcPath, next);
  await rename(srcPath, join(pausedDir, fname));
  await cleanStaleRendezvous(agent, taskId, "paused");
  await appendJournal(agent, {
    ts: now,
    id: taskId,
    event: "auto-paused",
    agent,
    status: "paused",
    paused_from: priorStatus,
    note: `no movement for ${AUTO_PAUSE_DAYS} days`,
  });
  console.log(
    `[${new Date().toLocaleTimeString()}] multi-agent: auto-paused ${agent}/waiting/${taskId} ` +
    `(${AUTO_PAUSE_DAYS}d threshold, prior status: ${priorStatus})`
  );
}

async function sweepArchive(opts: Required<MultiAgentOptions>): Promise<void> {
  const days = readEnvNumber("CARAVEL_MULTI_AGENT_ARCHIVE_DAYS",
    readEnvNumber("CLAUDECLAW_MULTI_AGENT_ARCHIVE_DAYS", DEFAULT_ARCHIVE_DAYS));
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

        const closedStatus = readNestedField(yaml, "closed", "status");
        if (!closedStatus) {
          // Active task — never archive. But if it's a stale waiting:on:user
          // task, auto-pause it so it stays visible rather than sitting
          // silently in waiting/. All other active tasks are left alone.
          const rawStatus = readField(yaml, "status") ?? "";
          if (rawStatus === "waiting:on:user" && bucket === "waiting") {
            const updatedRaw = readField(yaml, "updated");
            const updatedMs = updatedRaw
              ? Date.parse(updatedRaw.replace(/^["']|["']$/g, ""))
              : NaN;
            const ageMs = Number.isFinite(updatedMs) ? Date.now() - updatedMs : NaN;
            if (Number.isFinite(ageMs) && ageMs > AUTO_PAUSE_DAYS * 24 * 60 * 60 * 1000) {
              // `taskId` is derived here — sweepArchive's loop variable is
              // `fname`, and referencing an undeclared `taskId` threw on every
              // tick, which killed the whole tickOnce chain before the claim
              // pass ran (WAL-76 regression: no agent got any task claimed).
              const taskId = fname.replace(/\.yaml$/, "");
              await autoPauseTask(agent, taskId, srcPath, fname, yaml, rawStatus);
            }
          }
          continue; // active — never archive
        }

        const closedAtRaw = readNestedField(yaml, "closed", "at");
        let closedMs = NaN;
        if (closedAtRaw) {
          // YAML's bare ISO-8601 dates round-trip cleanly; quoted forms keep
          // their surrounding quote chars in the regex-based reader.
          const cleaned = closedAtRaw.replace(/^["']|["']$/g, "");
          const parsed = Date.parse(cleaned);
          if (Number.isFinite(parsed)) closedMs = parsed;
        }
        if (!Number.isFinite(closedMs)) {
          // Closed without a parseable `at:` — fall back to file mtime so an
          // orphan envelope still eventually leaves the working dirs, but
          // log so the data gap is visible.
          try {
            const st = await stat(srcPath);
            closedMs = st.mtimeMs;
            console.warn(
              `[multi-agent] archive: ${agent}/${bucket}/${fname} has closed.status=${closedStatus} but unparseable closed.at — falling back to file mtime`
            );
          } catch { continue; }
        }
        if (closedMs > cutoff) continue;

        // Archive flat into tasks/archived/. The envelope's `status:` field
        // already records the original bucket (`done`, `failed:*`,
        // `waiting:on:*`), and `closed:` records who retired it and when,
        // so no provenance is lost.
        const archiveDir = join(AGENTS_DIR, agent, "tasks", "archived");
        await mkdir(archiveDir, { recursive: true });
        const targetPath = join(archiveDir, fname);
        try {
          await rename(srcPath, targetPath);
          // Move the rendezvous .md too if present so the archived row keeps
          // its deliverable. Pre-Phase-1 sweep ignored these; the new gate
          // means closed reports are valuable history, not stale debris.
          const mdPath = join(srcDir, `${fname.replace(/\.yaml$/, "")}.md`);
          if (existsSync(mdPath)) {
            const mdTarget = join(archiveDir, `${fname.replace(/\.yaml$/, "")}.md`);
            try { await rename(mdPath, mdTarget); } catch {}
          }
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: archived ${agent}/${bucket}/${fname} (closed.status=${closedStatus}, ${days}d threshold)`
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

// === Per-task claim decision (WAL-72 Phase 1) ==================================
//
// Pure, synchronous predicate: given the raw YAML of a task envelope, its id,
// and the in-memory task graph, returns one of four outcomes:
//
//   skip-claimed     — status: claimed; another worker holds the lease.
//   skip-terminalish — status: done|failed:*|waiting:on:*; stale file-move race.
//   skip-not-ready   — open, but needs/after edges not yet satisfied.
//   claim            — open and all edges satisfied; caller may claim.
//
// The async depends_on pre-park gate stays in tickOnce because it has file-move
// side effects.  Everything else — the two earlier status guards and the Phase 1
// ready() gate — lives here, exactly once.  Both tickOnce and
// runClaimPassForTesting call this function; there is no second copy of the
// guard logic anywhere in this file.

export type ClaimDecision = "skip-claimed" | "skip-terminalish" | "skip-not-ready" | "claim";

export function claimDecision(yaml: string, taskId: string, graph: TaskGraph): ClaimDecision {
  const rawStatus = (readField(yaml, "status") ?? "open").trim();
  if (rawStatus === "claimed") return "skip-claimed";
  if (
    rawStatus === "done" ||
    rawStatus.startsWith("failed:") ||
    rawStatus.startsWith("waiting:on:")
  ) {
    return "skip-terminalish";
  }
  if (!ready(taskId, graph)) return "skip-not-ready";
  return "claim";
}

// ── Shared per-task claim-pass body (WAL-72 Phase 2) ──────────────────────
//
// Both tickOnce (production) and runClaimPassForTesting (test wrapper) call
// this function.  The skip-not-ready enforcement lives here and exactly here —
// deleting the return below must turn the tick-claim suite red.
//
// checkDependsOn is null in the test wrapper: the depends_on gate has
// file-move side effects and belongs only in the live tick path.
type ClaimPassItemOutcome =
  | "skip-claimed"
  | "skip-terminalish"
  | "skip-not-ready"
  | "parked"
  | "claimed"
  | "claim-failed";

async function executeClaimPassItem(opts: {
  yaml: string;
  taskId: string;
  graph: TaskGraph;
  onUnrecognizedStatus?: (rawStatus: string) => void;
  checkDependsOn?: () => Promise<"parked" | "proceed">;
  doClaimFn: () => Promise<"claimed" | "claim-failed">;
}): Promise<ClaimPassItemOutcome> {
  const { yaml, taskId, graph } = opts;
  const decision = claimDecision(yaml, taskId, graph);
  if (decision === "skip-claimed" || decision === "skip-terminalish") return decision;
  if (opts.onUnrecognizedStatus) {
    const rawStatus = (readField(yaml, "status") ?? "open").trim();
    if (rawStatus !== "open") opts.onUnrecognizedStatus(rawStatus);
  }
  if (opts.checkDependsOn) {
    const gate = await opts.checkDependsOn();
    if (gate === "parked") return "parked";
  }
  // THE KEY ENFORCEMENT: deleting this line must turn tick-claim suite red.
  // Both tickOnce and runClaimPassForTesting reach this via doClaimFn — no
  // second copy of the guard exists anywhere in this file.
  if (decision === "skip-not-ready") return "skip-not-ready";
  return opts.doClaimFn();
}

async function tickOnce(
  opts: Required<MultiAgentOptions>,
  inFlight: Map<string, number>,
  isFirstTick = false
): Promise<void> {
  if (!existsSync(AGENTS_DIR)) return;

  // Read prior health so we can carry last_claim_at forward across ticks.
  const health = await readRunnerHealth();
  health.last_tick_at = new Date().toISOString();
  health.last_tick_ok = true;
  health.last_error = null;

  // Wrap each sweep so a throw in one is logged, recorded, and stepped over —
  // the claim pass must still run even if a sweep fails. This is the 2026-08-26
  // regression as a structural guarantee: a broken sweep degrades the system,
  // it does not stop it.
  const sweeps: Array<[string, () => Promise<void>]> = [
    ["sweepStaleClaims", () => sweepStaleClaims(opts, isFirstTick)],
    ["sweepWaiting", () => sweepWaiting(opts)],
    ["sweepArchive", () => sweepArchive(opts)],
  ];
  for (const [name, fn] of sweeps) {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${new Date().toLocaleTimeString()}] multi-agent: ${name} threw — claim pass continues:`, err);
      health.last_tick_ok = false;
      health.last_error = { message, fn: name };
    }
  }

  // Wrap loadGraph + claim loop so a throw records last_tick_ok: false and
  // writeRunnerHealth still runs. This closes the F5 gap: previously a throw
  // anywhere between loadGraph and the end of the claim loop would abort the
  // tick before health was written, leaving last_tick_ok: true from the prior tick.
  try {

  // Phase 1: build the task graph once per tick.  `ready()` uses this to
  // evaluate needs/after edges without re-reading the filesystem per task.
  // The reverse index is carried for Phase 2 (frontier check).
  const graph = await loadGraph(AGENTS_DIR, opts.agents);

  // Global rate-limit gate: skip the claim loop but let sweeps run.
  // readLimitsGate auto-clears when reset_at lapses so the runner self-recovers.
  const gate = await readLimitsGate();
  if (gate) {
    console.log(
      `[${new Date().toLocaleTimeString()}] multi-agent: limits gate active until ${gate.reset_at} — skipping claim pass`
    );
    return; // finally writes health
  }

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

      // Delegate the per-task claim decision to the shared function.
      // The bucket (open/) is the source of truth; status: field is metadata.
      // All guard logic — claimed/terminalish skip, unrecognised-status warn,
      // depends_on pre-park, skip-not-ready enforcement — lives inside
      // executeClaimPassItem; there is no second copy in this loop.
      let claimedYaml = "";
      const outcome = await executeClaimPassItem({
        yaml,
        taskId,
        graph,
        onUnrecognizedStatus: (rawStatus) => {
          console.warn(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} has unrecognised status "${rawStatus}" in open/ — treating as open`
          );
        },
        checkDependsOn: async () => {
          // Pre-claim depends_on gate: park to waiting/ without spawning a
          // worker when the structured dependency isn't resolved yet.
          // sweepWaiting() unblocks the task when the dependency lands.
          const rawDependsOn = readField(yaml, "depends_on");
          const dependsOn = rawDependsOn && rawDependsOn !== "null" ? rawDependsOn.trim() : null;
          if (!dependsOn) return "proceed";
          const depResolved = await checkDependencyResolved(dependsOn, opts.agents);
          if (depResolved) return "proceed";
          const now2 = new Date().toISOString();
          const rawStatus = (readField(yaml, "status") ?? "open").trim();
          const waitStatus = `waiting:on:${dependsOn}`;
          let parkedYaml = setField(yaml, "status", waitStatus);
          parkedYaml = setField(parkedYaml, "updated", now2);
          parkedYaml = appendHistory(parkedYaml, {
            ts: now2,
            from: rawStatus,
            to: waitStatus,
            by: `runner-${process.pid}`,
            note: `pre-claim gate: depends_on ${dependsOn} not yet resolved`,
          });
          const waitDirPath = join(AGENTS_DIR, agent, "tasks", "waiting");
          await mkdir(waitDirPath, { recursive: true });
          const waitTarget = join(waitDirPath, fname);
          await writeFile(filePath, parkedYaml);
          await rename(filePath, waitTarget);
          await cleanStaleRendezvous(agent, taskId, "waiting");
          await appendJournal(agent, {
            ts: now2,
            id: taskId,
            status: waitStatus,
            kind: readField(yaml, "kind") ?? "other",
            from: readField(yaml, "from") ?? "unknown",
            to: agent,
            parent: readField(yaml, "parent") ?? null,
            summary: `pre-claim park: depends_on ${dependsOn} not resolved`,
          });
          console.log(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} pre-claim parked — depends_on ${dependsOn} not resolved`
          );
          return "parked";
        },
        doClaimFn: async () => {
          const fields = await claimTask(agent, taskId, filePath, opts.leaseMs);
          if (!fields) return "claim-failed";
          const cy = await readFile(filePath, "utf-8").catch(() => "");
          if (!cy) return "claim-failed";
          claimedYaml = cy;
          return "claimed";
        },
      });
      if (outcome !== "claimed") continue;

      inFlight.set(agent, active + 1);
      health.last_claim_at = new Date().toISOString();
      console.log(`[${new Date().toLocaleTimeString()}] multi-agent: claimed ${agent}/${taskId} (kind=${readField(yaml, "kind") ?? "unknown"})`);

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
            await transitionToTerminal(agent, taskId, filePath, effective, graph);
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

  // Alert on claim drought — inside the try so a loadGraph failure here is caught.
  if (health.last_claim_at) {
    const droughtMs = Date.now() - Date.parse(health.last_claim_at);
    if (droughtMs > opts.tickMs * 5) {
      const graph2 = await loadGraph(AGENTS_DIR, opts.agents).catch(() => null);
      if (graph2) {
        const hasReady = [...graph2.nodes.values()].some(
          (n) => n.bucket === "open" && n.rawStatus !== "paused" && ready(n.id, graph2)
        );
        if (hasReady) {
          console.warn(
            `[multi-agent] claim drought: last claim was ${Math.round(droughtMs / 1000)}s ago but ready tasks exist`
          );
        }
      }
    }
  }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toLocaleTimeString()}] multi-agent: tickOnce body threw:`, err);
    health.last_tick_ok = false;
    health.last_error = { message, fn: "tickOnce" };
  } finally {
    // Always persist health so last_tick_ok / last_error reflect this tick.
    await writeRunnerHealth(health);
  }
}

// === Testable claim pass (WAL-72 Phase 1 test export) =====================
//
// Thin wrapper for Jess's tick-level regression suite (TESTPLAN.md Part 3).
// Drives graph-load → claimDecision() → claim-pass against an explicit
// agentsDir without the three sweeps (sweepStaleClaims, sweepWaiting,
// sweepArchive), which use the module-level AGENTS_DIR and would contaminate
// a fixture run.
//
// All guard logic delegates to claimDecision() — the same function tickOnce
// calls.  There is exactly one copy of the guard in this file.
//
// Signature:
//   const { claimed, skippedNotReady } = await __testing.runClaimPassForTesting(
//     fixtureDir, ["alice", "bob"]
//   );
//   // claimed: ids whose yaml is now `status: claimed` on disk
//   // skippedNotReady: ids that were open but claimDecision returned skip-not-ready
async function runClaimPassForTesting(
  agentsDir: string,
  agents: string[],
  leaseMs = DEFAULT_LEASE_MS
): Promise<{ claimed: string[]; skippedNotReady: string[] }> {
  if (!existsSync(agentsDir)) return { claimed: [], skippedNotReady: [] };

  const graph = await loadGraph(agentsDir, agents);
  const claimed: string[] = [];
  const skippedNotReady: string[] = [];

  for (const agent of agents) {
    const openDir = join(agentsDir, agent, "tasks", "open");
    if (!existsSync(openDir)) continue;

    const entries = await readdir(openDir).catch(() => [] as string[]);
    for (const fname of entries.filter((e) => e.endsWith(".yaml")).sort()) {
      const taskId = fname.replace(/\.yaml$/, "");
      const filePath = join(openDir, fname);

      let yaml: string;
      try {
        yaml = await readFile(filePath, "utf-8");
      } catch { continue; }

      // Delegate to executeClaimPassItem() — the same function tickOnce calls.
      // checkDependsOn is null here: the gate has file-move side effects and
      // belongs only in the live tick path, not in fixture-dir tests.
      const outcome = await executeClaimPassItem({
        yaml,
        taskId,
        graph,
        doClaimFn: async () => {
          // Claim inline (without appendJournal, which uses module-level
          // AGENTS_DIR).  The yaml claim is the observable in tests.
          const now = new Date().toISOString();
          const expires = new Date(Date.now() + leaseMs).toISOString();
          const holder = `runner-test-${process.pid}`;
          let next = setField(yaml, "status", "claimed");
          next = setField(next, "updated", now);
          next = setNestedField(next, "lease", "holder", holder);
          next = setNestedField(next, "lease", "expires", expires);
          next = appendHistory(next, {
            ts: now,
            from: "open",
            to: "claimed",
            by: holder,
            note: "claimed in test pass",
          });
          await writeFile(filePath, next);
          return "claimed";
        },
      });
      if (outcome === "skip-not-ready") { skippedNotReady.push(taskId); continue; }
      if (outcome === "claimed") { claimed.push(taskId); continue; }
    }
  }

  return { claimed, skippedNotReady };
}

// === Public API ============================================================

export function startMultiAgentRunner(options: MultiAgentOptions = {}): MultiAgentHandle {
  const opts: Required<MultiAgentOptions> = {
    agents: options.agents ?? knownAgents(),
    tickMs: options.tickMs ?? DEFAULT_TICK_MS,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    perAgentConcurrency: options.perAgentConcurrency ?? DEFAULT_PER_AGENT_CONCURRENCY,
  };
  const inFlight = new Map<string, number>();
  let stopped = false;
  let isFirstTick = true;

  console.log(`[${new Date().toLocaleTimeString()}] multi-agent runner: enabled (tick ${opts.tickMs}ms, agents: ${opts.agents.join(",")})`);

  const loop = async () => {
    if (stopped) return;
    try {
      await tickOnce(opts, inFlight, isFirstTick);
    } catch (err) {
      console.error("[multi-agent] tick error:", err);
    }
    isFirstTick = false;
    if (!stopped) setTimeout(loop, opts.tickMs);
  };
  setTimeout(loop, opts.tickMs);

  return {
    stop: () => { stopped = true; },
  };
}

function readEnvAgents(): string[] | null {
  const raw = process.env.CARAVEL_MULTI_AGENT_AGENTS ?? process.env.CLAUDECLAW_MULTI_AGENT_AGENTS;
  if (!raw) return null;
  const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

export function isMultiAgentEnabled(): boolean {
  const flag = process.env.CARAVEL_MULTI_AGENT_RUNNER ?? process.env.CLAUDECLAW_MULTI_AGENT_RUNNER ?? "";
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
  sweepStaleClaims,
  sweepWaiting,
  readReportFile,
  inflightWorkers,
  readMaxWorkerLifetimeMs,
  // Phase 1 graph engine — also exported top-level for direct use in tests.
  readList,
  loadGraph,
  ready,
  // Per-task claim decision — pure function, single source of truth for the guard.
  claimDecision,
  // Tick-level claim pass for WAL-72 Phase 1 regression suite (TESTPLAN.md Part 3).
  // Takes an explicit agentsDir so tests can drive it against a fixture directory.
  runClaimPassForTesting,
  // Frontier check — WAL-72 Phase 2.  Takes explicit agentsDir for fixture tests.
  checkFrontierAndMaybeSpawnContinuation,
  // v1.16 helpers — tested directly in frontier-v116.test.ts.
  findExistingContinuation,
  extendContinuationAfter,
  // Blocked-dependant sweep — WAL-72 Phase 3.  No test coverage before v1.16 fix batch.
  sweepBlockedDependants,
};
