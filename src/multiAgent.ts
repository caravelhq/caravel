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

// === Persistent graph + frontier serialisation (FDP v1.19 §1) ==============
// One module-level graph, mutated by every tick rebuild and every spawn/extend
// between rebuilds. Frontier checks read here instead of a per-tick snapshot,
// so cross-tick sibling completions are visible without a filesystem scan.
let currentGraph: TaskGraph = { nodes: new Map(), dependants: new Map(), errors: [] };
// Serialises frontier checks — two near-simultaneous completions must not both
// read currentGraph before either updates it.
let frontierChain: Promise<void> = Promise.resolve();

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
    "where <status> is one of `done` or `failed`. The file is your deliverable AND your closing signal — the runner reads its frontmatter to decide what happened.",
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
    "Write this file with the Write tool, AS THE LAST THING IN YOUR TURN. Don't print the contents to chat — write the file.",
    "",
    `**DO NOT touch the YAML envelope** at \`agents/${agent}/tasks/open/${taskId}.yaml\`. The runner owns it — it will update the status field, append the history entry, and move the file to the matching bucket once it sees your .md report. If you move, rename, or rewrite the .yaml yourself, the runner's transition silently fails: no chat notification, no journal entry, no Alice continuation. Just write the .md and stop.`,
    "",
    // Phase 3W: a question for Kelly is a done report that asks it; a dependency
    // is an edge declared at dispatch (needs:/after:), not a park. Workers no
    // longer emit `waiting` for these; the runner converts any straggler to done.
    "**A question for Kelly is a `done` report that asks it; a dependency is an edge declared at dispatch (`needs:`/`after:`), not a park.**",
    "",
    "## Fallback (legacy)",
    "",
    "If for some reason you cannot write the file, you MAY end your response with one of these XML directives instead. The runner uses them only when the file is missing:",
    "",
    `  <task-done summary="..." report="path/to/produced/file.md">…optional inline body…</task-done>`,
    `  <task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>`,
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
  leaseHolder: string | null; // null = unclaimed; non-null = runner-<pid> while status: claimed
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
        // Phase 3W: depends_on → needs shim for legacy envelopes that pre-date
        // the graph-edge contract. A bare `depends_on: task:X` with no `needs:` is
        // treated as `needs: [X]` at load time — no file move to waiting/.
        if (needs.length === 0) {
          const rawDep = readField(content, "depends_on");
          if (rawDep && rawDep !== "null") {
            const trimmed = rawDep.trim();
            const depId = trimmed.startsWith("task:") ? trimmed.slice(5) : trimmed;
            if (depId) needs.push(depId);
          }
        }
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
        const leaseHolderRaw = readNestedField(content, "lease", "holder");
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
          leaseHolder: (leaseHolderRaw && leaseHolderRaw !== "null") ? leaseHolderRaw : null,
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

  // Reconcile pass: heal unclaimed non-terminal continuations whose after: does
  // not cover their current family. Covers hand-authored envelopes the runner
  // never saw arrive, and late siblings dispatched after the last spawn.
  //
  // Runs inside loadGraph so currentGraph is self-consistent before the claim
  // pass (FDP v1.19 §1 ordering invariant). Only extends unclaimed continuations
  // (status ∈ {open, waiting, paused, blocked} ∧ leaseHolder == null) — a
  // claimed continuation's after: must not be mutated while a worker reads it
  // (FDP v1.19 §2, DEC-21).
  for (const node of nodes.values()) {
    if (node.kind !== "continuation") continue;
    if (node.isTerminal) continue;
    if (node.leaseHolder !== null) continue;
    if (!node.parent) continue;

    const familyIds: string[] = [];
    for (const [sibId, sib] of nodes) {
      if (sib.parent === node.parent && sib.kind !== "continuation") {
        familyIds.push(sibId);
      }
    }

    const missing = familyIds.filter((id) => !node.after.includes(id));
    if (missing.length === 0) continue;

    const contPath = join(agentsDir, node.owner, "tasks", node.bucket, `${node.id}.yaml`);
    let contYaml: string;
    try { contYaml = await readFile(contPath, "utf-8"); } catch { continue; }

    await extendContinuationAfter(contPath, contYaml, familyIds);
    for (const memberId of missing) {
      if (!node.after.includes(memberId)) node.after.push(memberId);
      if (!dependants.has(memberId)) dependants.set(memberId, []);
      const deps = dependants.get(memberId)!;
      if (!deps.includes(node.id)) deps.push(node.id);
    }
    const reconcileTs = new Date().toISOString();
    const reconcileOwner = nodeOwner.get(node.id) ?? node.owner;
    await writeFile(
      join(agentsDir, reconcileOwner, "tasks", "journal.ndjson"),
      JSON.stringify({
        ts: reconcileTs,
        id: node.id,
        event: "reconcile",
        summary: `extended after: to cover [${missing.join(", ")}]`,
      }) + "\n",
      { flag: "a" }
    ).catch(() => {});
    console.log(
      `[multi-agent] reconcile: ${reconcileOwner}/${node.id} after: extended to cover [${missing.join(", ")}]`
    );
  }

  const result = { nodes, dependants, errors };
  currentGraph = result;
  return result;
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
  // Phase 3W: only waiting:on:limits is a valid runner-owned park. Workers may no
  // longer emit waiting:on:task or waiting:on:user — those are converted to done
  // at the call site before this function is reached.
  const onSpec = (directive.reason ?? "limits").trim() || "limits";
  if (onSpec !== "limits") {
    console.error(`[multi-agent] ${agent}/${taskId}: transitionToWaiting called with non-limits spec "${onSpec}" — BUG; straggler conversion should have fired at the call site`);
    return;
  }

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
  // Stamp the time the limit was hit and bump the retry counter so sweepWaiting
  // can decide when to auto-retry and when to give up. limits_retry_count caps
  // the bounce loop. (onSpec === "limits" is the only valid spec after Phase 3W.)
  next = setField(next, "limits_hit_at", now);
  const prevCount = Number(readField(next, "limits_retry_count") ?? "0") || 0;
  next = setField(next, "limits_retry_count", String(prevCount + 1));
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

// Phase 3W: sweepWaiting handles ONLY waiting:on:limits — the sole runner-owned
// infrastructure park. All other waiting:on:* specs were either converted to done
// at the call site (worker stragglers) or are bugs. Any non-limits spec found in
// waiting/ is logged as a warning and skipped.
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

      // Any non-limits spec in waiting/ is unexpected after Phase 3W.
      if (spec !== "limits") {
        console.warn(`[multi-agent] sweepWaiting: ${agent}/${taskId} has unexpected spec "${spec}" — only limits expected after Phase 3W; skipping`);
        continue;
      }

      // Skip tasks with a closed.status — leave for sweepArchive.
      const closedStatus = readNestedField(yaml, "closed", "status");
      if (closedStatus) continue;

      // Check the limits gate directly; sweeps now run regardless of gate state.
      const limitsGate = await readLimitsGate();
      const unblocked = limitsGate === null;
      if (!unblocked) continue;
      console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} limits gate clear — unblocking`);

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

// Continuation model — FDP v1.19 (Kelly, 2026-08-29). Supersedes v1.15–v1.18.
//
// Spawn rule: when task `t` reaches a terminal state —
//   1. Guard: dependants[t] in currentGraph contains any non-terminal node → skip.
//      (currentGraph is persistent and updated at every spawn, reconcile, and
//      tick rebuild, so this correctly sees continuations spawned on earlier ticks.)
//   2. target := reply_to ?? from. If user/runner/unknown:
//      a. kind:continuation → report flag (DEC-23; DEC-12 never fires for this case).
//      b. count frontier leaves (family members with no non-continuation dependants).
//         1 leaf → flag; 2+ leaves → spawn one consolidation to coordinator.
//   3. Spawnable agent target:
//      DEC-12 backstop: kind:continuation + spawnable target → warn + return (loop guard).
//      Otherwise: build family (DEC-20 one per family), spawn one continuation.
//
// familyIds excludes kind:continuation nodes (v1.18, load-bearing — including a
// continuation in its own after: causes a self-reference that prevents ready()).
// Frontier checks are serialised via frontierChain (§1 ordering).

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
  // R02-F2: normalise via readList and replace whichever form exists — block or
  // inline. The old regex matched only block form (`after:\n  - id`), so an
  // inline `after: [TSK-A]` didn't match and a second `after:` key was appended,
  // producing a duplicate mapping key and making the envelope unparseable.
  const blockRe = /^after:\s*\n(?:[ \t]+-[^\n]*\n)*/m;
  const inlineRe = /^after:[^\n]*\n/m;
  let next: string;
  if (blockRe.test(contYaml)) {
    next = contYaml.replace(blockRe, newBlock);
  } else if (inlineRe.test(contYaml)) {
    next = contYaml.replace(inlineRe, newBlock);
  } else {
    next = `${contYaml}\n${newBlock}`;
  }
  next = setField(next, "updated", new Date().toISOString());
  await writeFile(contPath, next);
}

async function checkFrontierAndMaybeSpawnContinuation(
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir: string = AGENTS_DIR
): Promise<void> {
  let resolveMyTurn!: () => void;
  const myTurn = new Promise<void>((r) => { resolveMyTurn = r; });
  // .finally fires resolveMyTurn regardless of outcome; .catch absorbs so the chain never rejects.
  frontierChain = frontierChain
    .then(() => _doFrontierCheck(yaml, taskId, agent, agents, agentsDir))
    .finally(resolveMyTurn)
    .catch((e) => console.error("[frontier] uncaught error in _doFrontierCheck:", e));
  return myTurn;
}

async function _doFrontierCheck(
  yaml: string,
  taskId: string,
  agent: string,
  agents: string[],
  agentsDir: string
): Promise<void> {
  // Pure edge guard (FDP v1.19 §2, DEC-19): if currentGraph has any non-terminal
  // node in dependants[t], something downstream is still pending — skip.
  const downstreams = currentGraph.dependants.get(taskId) ?? [];
  const hasNonTerminalDownstream = downstreams.some((depId) => {
    const n = currentGraph.nodes.get(depId);
    return n ? !n.isTerminal : false;
  });
  if (hasNonTerminalDownstream) {
    console.log(
      `[multi-agent] ${agent}/${taskId}: non-terminal downstream in currentGraph — skipping continuation spawn`
    );
    return;
  }

  const kind = (readField(yaml, "kind") ?? "").trim();
  const replyToRaw = readField(yaml, "reply_to");
  const fromRaw = readField(yaml, "from");
  const target = (
    (replyToRaw && replyToRaw !== "null" ? replyToRaw : null) ??
    (fromRaw && fromRaw !== "null" ? fromRaw : null) ??
    ""
  ).trim();
  const parentRaw = readField(yaml, "parent");
  const parent = parentRaw && parentRaw !== "null" ? parentRaw.trim() : null;
  const isUserTarget = !target || target === "user" || target === "runner" || !agents.includes(target);

  if (isUserTarget) {
    // kind:continuation + user target → always report-flag, no spawn (DEC-23).
    // The continuation IS the synthesis; its completion IS the report.
    // DEC-12 never fires for this path.
    if (kind === "continuation") {
      console.log(
        `[multi-agent] ${agent}/${taskId}: kind:continuation, user target — report-flag (DEC-23; DEC-12 not triggered)`
      );
      await appendJournal(agent, {
        ts: new Date().toISOString(),
        id: taskId,
        // R02-F4: use the actual terminal status from the envelope, not a hardcoded "done".
        status: readField(yaml, "status") ?? "done",
        kind: "continuation",
        from: fromRaw ?? "runner",
        to: agent,
        parent,
        summary: "frontier: report-flag — continuation IS the report, no further spawn",
      });
      return;
    }

    // Count frontier leaves: family members with no non-continuation dependants.
    const familyIds: string[] = [];
    if (parent) {
      for (const [sibId, node] of currentGraph.nodes) {
        if (node.parent === parent && node.kind !== "continuation") familyIds.push(sibId);
      }
    }
    if (familyIds.length === 0) familyIds.push(taskId);

    const frontierLeaves = familyIds.filter((sibId) => {
      const deps = currentGraph.dependants.get(sibId) ?? [];
      // R02-F3: disqualify ALL non-continuation dependants, regardless of
      // terminal status. The old predicate excluded terminal ones (`!n.isTerminal`),
      // which made interior nodes count as leaves once the family was fully
      // terminal — causing a needless consolidation on linear chains.
      return !deps.some((depId) => {
        const n = currentGraph.nodes.get(depId);
        return n && n.kind !== "continuation";
      });
    });

    if (frontierLeaves.length <= 1) {
      // Single leaf → flag as report, no spawn.
      console.log(
        `[multi-agent] ${agent}/${taskId}: frontier — user target, single leaf — report-flag (DEC-23)`
      );
      await appendJournal(agent, {
        ts: new Date().toISOString(),
        id: taskId,
        // R02-F4: use the actual terminal status, not a hardcoded "done".
        status: readField(yaml, "status") ?? "done",
        kind: kind || "unknown",
        from: fromRaw ?? "user",
        to: agent,
        parent,
        summary: "frontier: report-flag — single leaf, no continuation spawned",
      });
      return;
    }

    // 2+ frontier leaves → spawn ONE consolidation continuation to coordinator.
    const coordinator = (() => {
      if (parent) {
        const parentNode = currentGraph.nodes.get(parent);
        if (parentNode?.reply_to && agents.includes(parentNode.reply_to)) return parentNode.reply_to;
      }
      return agents.includes("alice") ? "alice" : agents[0] ?? "alice";
    })();

    const id = await nextContTaskId(parent, coordinator, currentGraph, agentsDir);
    const now = new Date().toISOString();
    const q = (v: string) => JSON.stringify(v);
    const headlineRaw = (readField(yaml, "headline") ?? "").trim();
    const hl = (/^".*"$/.test(headlineRaw) ? headlineRaw.slice(1, -1) : headlineRaw) || `Continue after ${taskId}`;
    const afterBlock = `after:\n${familyIds.map((s) => `  - ${s}`).join("\n")}\n`;

    const body = [
      `id: ${id}`,
      `headline: ${q(`Consolidate: ${hl.slice(0, 64)}`)}`,
      `created: ${now}`,
      `updated: ${now}`,
      "",
      `from: runner`,
      `to: ${coordinator}`,
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
      `  Read the family reports and write a consolidated briefing for the user, then emit`,
      `  <task-done summary="...">. A question for Kelly is a done report that asks it.`,
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
      `    note: ${q(`consolidation continuation after ${taskId} (${frontierLeaves.length} frontier leaves)`)}`,
      "",
      `summary:`,
      `  brief: ""`,
      `  response: ""`,
      `report: ""`,
      "",
    ].filter(Boolean).join("\n");

    const openDir = join(agentsDir, coordinator, "tasks", "open");
    await mkdir(openDir, { recursive: true });
    await writeFile(join(openDir, `${id}.yaml`), body);

    const newNode: GraphNode = {
      id, owner: coordinator, rawStatus: "open", bucket: "open",
      isDone: false, isFailed: false, isTerminal: false,
      needs: [], after: familyIds, to: coordinator,
      parent: parent ?? taskId, reply_to: null, kind: "continuation", leaseHolder: null,
    };
    currentGraph.nodes.set(id, newNode);
    for (const memberId of familyIds) {
      const deps = currentGraph.dependants.get(memberId) ?? [];
      if (!deps.includes(id)) deps.push(id);
      currentGraph.dependants.set(memberId, deps);
    }
    await appendJournal(coordinator, {
      ts: now, id, status: "open", kind: "continuation", from: "runner", to: coordinator,
      parent: parent ?? taskId,
      summary: `consolidation continuation after ${taskId} (${frontierLeaves.length} frontier leaves)`,
    });
    console.log(
      `[multi-agent] ${agent}/${taskId}: frontier — ${frontierLeaves.length} user-target leaves → consolidation ${coordinator}/${id}`
    );
    return;
  }

  // Spawnable agent target.
  // DEC-12 backstop: kind:continuation + spawnable target would create a chain loop.
  // (Normal termination via user-target is handled above via the report-flag path.)
  if (kind === "continuation") {
    console.warn(
      `[multi-agent] ${agent}/${taskId}: kind:continuation targeted at spawnable agent "${target}" — NOT spawning (DEC-12 backstop)`
    );
    return;
  }

  // Build family = all non-continuation nodes sharing the same parent (DEC-20 one per family).
  // Excluding kind:continuation (v1.18, load-bearing — self-reference prevents ready()).
  const familyIds: string[] = [];
  if (parent) {
    for (const [sibId, node] of currentGraph.nodes) {
      if (node.parent === parent && node.kind !== "continuation") familyIds.push(sibId);
    }
  }
  if (familyIds.length === 0) familyIds.push(taskId);

  const id = await nextContTaskId(parent, target, currentGraph, agentsDir);
  const now = new Date().toISOString();
  const q = (v: string) => JSON.stringify(v);
  const headlineRaw = (readField(yaml, "headline") ?? "").trim();
  const firstHeadline = /^".*"$/.test(headlineRaw) ? headlineRaw.slice(1, -1) : headlineRaw;
  const headline = firstHeadline ? `Continue: ${firstHeadline.slice(0, 64)}` : `Continue after ${taskId}`;
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
    `  <task-done summary="...">. A question for Kelly is a done report that asks it.`,
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
  ].filter(Boolean).join("\n");

  const openDir = join(agentsDir, target, "tasks", "open");
  await mkdir(openDir, { recursive: true });
  await writeFile(join(openDir, `${id}.yaml`), body);

  // Insert into currentGraph so subsequent transitions in the same tick see it.
  const newNode: GraphNode = {
    id, owner: target, rawStatus: "open", bucket: "open",
    isDone: false, isFailed: false, isTerminal: false,
    needs: [], after: familyIds, to: target,
    parent: parent ?? taskId, reply_to: null, kind: "continuation", leaseHolder: null,
  };
  currentGraph.nodes.set(id, newNode);
  for (const memberId of familyIds) {
    const deps = currentGraph.dependants.get(memberId) ?? [];
    if (!deps.includes(id)) deps.push(id);
    currentGraph.dependants.set(memberId, deps);
  }

  await appendJournal(target, {
    ts: now, id, status: "open", kind: "continuation", from: "runner", to: target,
    parent: parent ?? taskId, summary: `frontier continuation after ${taskId}`,
  });
  console.log(`[multi-agent] ${agent}/${taskId}: frontier → spawned continuation ${target}/${id}`);
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

  // Mark this task terminal in currentGraph before the frontier check reads
  // dependants. The guard's correctness requires the completing task to be
  // visible as terminal when sibling continuations look it up.
  const completingNode = currentGraph.nodes.get(taskId);
  if (completingNode) {
    completingNode.rawStatus = finalStatus;
    completingNode.isDone = directive.kind === "done";
    completingNode.isFailed = directive.kind !== "done";
    completingNode.isTerminal = true;
    completingNode.bucket = subdir;
  }

  // Frontier check: spawn a continuation if nothing downstream declares this task.
  await checkFrontierAndMaybeSpawnContinuation(next, taskId, agent, knownAgents(), AGENTS_DIR);

  // Auto-close parent if this was a `closes_parent_on_done` child landing as done.
  if (directive.kind === "done") {
    await maybeCloseParentOnUserUnblock(next, taskId);
  }

  // When a task fails, move its needs-dependants to blocked/.
  if (directive.kind !== "done") {
    await sweepBlockedDependants(taskId, currentGraph, AGENTS_DIR);
  }
}

// sweepBlocked: symmetric to sweepWaiting. A task in blocked/ whose `needs`
// deps are now all `done` is re-opened so the work can proceed. This is the
// "retry the upstream → the continuation proceeds as planned" path (FDP v1.19
// §Failure, DEC-22). `after:` satisfaction is done|failed only — blocked is
// strictly non-terminal; no special case in ready() (that strictness is the
// decision, not an oversight).
async function sweepBlocked(opts: Required<MultiAgentOptions>): Promise<void> {
  for (const agent of opts.agents) {
    const blockedDir = join(AGENTS_DIR, agent, "tasks", "blocked");
    if (!existsSync(blockedDir)) continue;

    const entries = await readdir(blockedDir).catch(() => [] as string[]);
    for (const fname of entries.filter((e) => e.endsWith(".yaml")).sort()) {
      const taskId = fname.replace(/\.yaml$/, "");
      const filePath = join(blockedDir, fname);

      let yaml: string;
      try { yaml = await readFile(filePath, "utf-8"); } catch { continue; }

      const needs = readList(yaml, "needs");
      if (needs.length === 0) continue;

      // All needs deps must be in done/ for some known agent.
      let allDone = true;
      for (const depId of needs) {
        let found = false;
        for (const a of opts.agents) {
          if (existsSync(join(AGENTS_DIR, a, "tasks", "done", `${depId}.yaml`))) {
            found = true;
            break;
          }
        }
        if (!found) { allDone = false; break; }
      }
      if (!allDone) continue;

      const fields = parseFields(yaml, taskId);
      const prevStatus = (readField(yaml, "status") ?? "blocked").trim();
      const now = new Date().toISOString();
      let next = setField(yaml, "status", "open");
      next = setField(next, "updated", now);
      next = next.replace(/^blocked_by:[^\n]*\n?/m, "");
      next = appendHistory(next, {
        ts: now,
        from: prevStatus,
        to: "open",
        by: `runner-${process.pid}`,
        note: "sweepBlocked: all needs deps are done",
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
        summary: "sweepBlocked: all needs deps done → re-opened",
      });
      console.log(
        `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} unblocked (sweepBlocked: all needs deps done)`
      );
    }
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

// When a child task tagged `closes_parent_on_done: true` lands as done, write a
// `closed` overlay on the parent if it is in `done/` with `closed: null` (the
// Phase 3W "report awaiting review" state). Search all known agents' `done/`
// buckets so cross-agent parenting still resolves. No-op if the field is absent,
// the parent isn't in done/, or the parent already has a closed.status.
async function maybeCloseParentOnUserUnblock(childYaml: string, childId: string): Promise<void> {
  const closesField = (readField(childYaml, "closes_parent_on_done") ?? "").trim().toLowerCase();
  if (closesField !== "true") return;
  const parentId = readField(childYaml, "parent");
  if (!parentId || parentId === "null") return;

  const agents = knownAgents();
  for (const a of agents) {
    // Phase 3W: parent is now done ∧ closed:null (report-state), not waiting:on:user.
    const parentPath = join(AGENTS_DIR, a, "tasks", "done", `${parentId}.yaml`);
    if (!existsSync(parentPath)) continue;
    let parentYaml: string;
    try {
      parentYaml = await readFile(parentPath, "utf-8");
    } catch { continue; }
    const parentStatus = (readField(parentYaml, "status") ?? "").trim();
    const parentClosedStatus = readNestedField(parentYaml, "closed", "status");
    if (parentStatus !== "done" || parentClosedStatus !== null) {
      if (parentStatus !== "done") {
        console.warn(`[multi-agent] auto-close: parent ${a}/${parentId} status is "${parentStatus}", not done — skipping`);
      }
      return;
    }
    const now = new Date().toISOString();
    // Stamp the closed overlay in place — parent is already in done/.
    let next = setClosedField(parentYaml, {
      status: "closed",
      at: now,
      by: "runner",
      reason: `auto-closed by child ${childId} (closes_parent_on_done)`,
    });
    next = setField(next, "updated", now);
    next = appendHistory(next, {
      ts: now,
      from: "done",
      to: "done",
      by: `runner-${process.pid}`,
      note: `closed overlay written by child ${childId} (closes_parent_on_done)`,
    });
    await writeFile(parentPath, next);
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
    console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${a}/${parentId} — closed overlay written (auto-closed by child ${childId})`);
    return;
  }
  // Parent not in any done/ bucket — already had a closed overlay, or was
  // never a report-state parent. Silent no-op; runs for every done child.
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
          // Phase 3W straggler: a report file with status:waiting (non-limits) from
          // a pre-cutover worker is converted to done. waiting:on:limits is still
          // valid — honour it by calling transitionToWaiting and moving on.
          if (fromReport.kind === "waiting") {
            const onSpec = (fromReport.reason ?? "user").trim() || "user";
            if (onSpec !== "limits") {
              const stragglerSpec = `waiting:on:${onSpec}`;
              console.warn(`[multi-agent] ${agent}/${taskId} stale-claim: report file has ${stragglerSpec} — Phase 3W straggler, converting to done`);
              await appendJournal(agent, {
                ts: now,
                id: taskId,
                status: stragglerSpec,
                level: "warn",
                kind: readField(yaml, "kind") ?? "unknown",
                from: fields.from,
                to: agent,
                parent: fields.parent,
                summary: `Phase 3W straggler (stale-claim): converted ${stragglerSpec} to done — ${fromReport.summary || ""}`,
              });
              fromReport.kind = "done";
            } else {
              // limits: park via transitionToWaiting (uses the open/ path directly).
              const dummyDirective: TaskDirective = { kind: "waiting", reason: "limits", summary: fromReport.summary || "", body: "", report: null };
              await transitionToWaiting(agent, taskId, path, dummyDirective);
              console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → waiting:on:limits (stale-claim recovery, limits park)`);
              continue;
            }
          }
          const termBucket: "done" | "failed" =
            fromReport.kind === "done" ? "done" : "failed";
          const termStatus =
            fromReport.kind === "done" ? "done"
            : `failed:${fromReport.reason ?? "other"}`;
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
          // Active task — never archive.
          continue;
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

export type ClaimDecision = "skip-claimed" | "skip-terminalish" | "skip-not-ready" | "skip-closed" | "claim";

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
  // Phase 3W: a task cancelled (or otherwise closed) while still in open/ must not
  // be claimed — the cancellation is a human decision and the runner must honour it.
  const closedStatus = readNestedField(yaml, "closed", "status");
  if (closedStatus !== null) return "skip-closed";
  if (!ready(taskId, graph)) return "skip-not-ready";
  return "claim";
}

// ── Shared per-task claim-pass body (WAL-72 Phase 2) ──────────────────────
//
// Both tickOnce (production) and runClaimPassForTesting (test wrapper) call
// this function.  The skip-not-ready enforcement lives here and exactly here —
// deleting the return below must turn the tick-claim suite red.
//
// Phase 3W: checkDependsOn removed — depends_on handled at graph-load time (needs shim).
type ClaimPassItemOutcome =
  | "skip-claimed"
  | "skip-terminalish"
  | "skip-not-ready"
  | "skip-closed"
  | "claimed"
  | "claim-failed";

async function executeClaimPassItem(opts: {
  yaml: string;
  taskId: string;
  graph: TaskGraph;
  onUnrecognizedStatus?: (rawStatus: string) => void;
  doClaimFn: () => Promise<"claimed" | "claim-failed">;
}): Promise<ClaimPassItemOutcome> {
  const { yaml, taskId, graph } = opts;
  const decision = claimDecision(yaml, taskId, graph);
  if (decision === "skip-claimed" || decision === "skip-terminalish" || decision === "skip-closed") return decision;
  if (opts.onUnrecognizedStatus) {
    const rawStatus = (readField(yaml, "status") ?? "open").trim();
    if (rawStatus !== "open") opts.onUnrecognizedStatus(rawStatus);
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
    ["sweepBlocked", () => sweepBlocked(opts)],
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

  // Rebuild + reconcile the graph. currentGraph is updated as a side effect of
  // loadGraph (FDP v1.19 §1). The ordering invariant: this await must complete
  // before the claim pass below. A newly dispatched sibling cannot terminate
  // without first being claimed, and cannot be claimed before a rebuild has
  // seen it — so the reconcile always runs before that sibling's terminal
  // transition reads dependants. The sequential await here is the structural
  // guarantee; moving the claim loop above this line silently regresses the guard.
  currentGraph = await loadGraph(AGENTS_DIR, opts.agents);

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
        graph: currentGraph,
        onUnrecognizedStatus: (rawStatus) => {
          console.warn(
            `[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} has unrecognised status "${rawStatus}" in open/ — treating as open`
          );
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
            summary: "worker completed but emitted no directive — likely forgot the closing <task-done>/<task-failed> tag. The deliverable (if any) may still be on disk; check the worker's output destination before re-dispatching.",
            body: "",
            report: null,
          };
          if (!directive) {
            console.warn(`[multi-agent] ${agent}/${taskId} finished without a directive — synthesising failed:other`);
          }
          if (effective.kind === "waiting") {
            const onSpec = (effective.reason ?? "user").trim() || "user";
            if (onSpec !== "limits") {
              // Phase 3W straggler conversion: a worker that still emits waiting:on:task
              // or waiting:on:user predates the cutover. Convert to done so it surfaces
              // as a report (terminal ∧ closed:null) rather than parking invisibly.
              const stragglerSpec = `waiting:on:${onSpec}`;
              console.warn(`[multi-agent] ${agent}/${taskId} emitted ${stragglerSpec} — Phase 3W straggler, converting to done`);
              await appendJournal(agent, {
                ts: new Date().toISOString(),
                id: taskId,
                status: stragglerSpec,
                level: "warn",
                kind: readField(claimedYaml, "kind") ?? "unknown",
                from: readField(claimedYaml, "from") ?? "unknown",
                to: agent,
                parent: readField(claimedYaml, "parent") ?? null,
                summary: `Phase 3W straggler: converted ${stragglerSpec} to done — ${effective.summary || ""}`,
              });
              const converted: TaskDirective = { kind: "done", reason: null, summary: effective.summary, body: effective.body ?? "", report: effective.report };
              await transitionToTerminal(agent, taskId, filePath, converted);
              console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → done (straggler from ${stragglerSpec})`);
            } else {
              await transitionToWaiting(agent, taskId, filePath, effective);
              console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → waiting:on:limits`);
            }
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

  // Alert on claim drought — uses currentGraph (already rebuilt this tick).
  if (health.last_claim_at) {
    const droughtMs = Date.now() - Date.parse(health.last_claim_at);
    if (droughtMs > opts.tickMs * 5) {
      const hasReady = [...currentGraph.nodes.values()].some(
        (n) => n.bucket === "open" && n.rawStatus !== "paused" && ready(n.id, currentGraph)
      );
      if (hasReady) {
        console.warn(
          `[multi-agent] claim drought: last claim was ${Math.round(droughtMs / 1000)}s ago but ready tasks exist`
        );
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
  // Frontier check — WAL-72 Phase 2+.  Takes explicit agentsDir for fixture tests.
  // v1.19: graph parameter dropped; uses module-level currentGraph.
  checkFrontierAndMaybeSpawnContinuation,
  // v1.16 helper retained for reconcile (called from loadGraph) and direct tests.
  extendContinuationAfter,
  // Blocked-dependant sweep — WAL-72 Phase 3 (moves tasks TO blocked on failure).
  sweepBlockedDependants,
  // v1.19: auto-reopen blocked tasks whose needs are all done.
  sweepBlocked,
  // Phase 3W: parent auto-close on done∧closed:null shape. Exported for direct unit testing.
  maybeCloseParentOnUserUnblock,
};
