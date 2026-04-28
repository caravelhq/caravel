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

import { readdir, readFile, writeFile, rename, mkdir } from "fs/promises";
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
  if (/^history:\s*$/m.test(yaml) || /^history:\s*\n/m.test(yaml)) {
    return yaml.replace(/^history:\s*\n?/m, (m) => m + block);
  }
  if (/^history:/m.test(yaml)) {
    return yaml.replace(/^history:.*$/m, (m) => `${m}\n${block.trimEnd()}`);
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
  kind: "done" | "failed";
  reason: string | null;
  summary: string;
  body: string;
}

function parseDirective(text: string): TaskDirective | null {
  const doneMatch = /<task-done(?:\s+summary="([^"]*)")?\s*>([\s\S]*?)<\/task-done>/.exec(text);
  if (doneMatch) {
    return {
      kind: "done",
      reason: null,
      summary: (doneMatch[1] ?? "").trim(),
      body: (doneMatch[2] ?? "").trim(),
    };
  }
  const failMatch = /<task-failed\s+reason="([^"]*)"(?:\s+summary="([^"]*)")?\s*>([\s\S]*?)<\/task-failed>/.exec(text);
  if (failMatch) {
    return {
      kind: "failed",
      reason: failMatch[1] ?? "other",
      summary: (failMatch[2] ?? "").trim(),
      body: (failMatch[3] ?? "").trim(),
    };
  }
  return null;
}

// === Worker prompt =========================================================

function buildWorkerPrompt(yaml: string, taskId: string): string {
  // The worker has its own CLAUDE.md and rules already loaded by the runner.
  // The prompt is the brief itself plus a contract reminder.
  const brief = readField(yaml, "brief") ?? "";
  return [
    `You have been delegated task ${taskId}. The full envelope is at:`,
    `  agents/${readField(yaml, "to") ?? "<self>"}/tasks/open/${taskId}.yaml`,
    "",
    "Brief:",
    brief.trim() || "(see envelope)",
    "",
    "When you finish (or cannot finish), end your response with a single directive:",
    `  <task-done summary="one or two line restatement of the result">…optional report body…</task-done>`,
    `  <task-failed reason="budget|tool|refusal|context|dependency|crash|timeout|other" summary="…">…</task-failed>`,
    "",
    "Do not emit the directive until you are truly finished. The runner will move your envelope to done/ or failed/ and append the journal entry.",
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
  if (directive.body && directive.kind === "done") {
    // Append report to the bottom — keep the YAML lean.
    next = next.replace(/^report:\s*.*$/m, (m) => m); // no-op if already there
    if (!/^report:/m.test(next)) next += `\nreport: |\n  ${directive.body.replace(/\n/g, "\n  ")}\n`;
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
    return { kind: "failed", reason: "crash", summary: String(err), body: "" };
  }

  return parseDirective(captured);
}

// === Tick ==================================================================

async function tickOnce(opts: Required<MultiAgentOptions>, inFlight: Map<string, number>): Promise<void> {
  if (!existsSync(AGENTS_DIR)) return;

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
          if (!directive) {
            console.warn(`[multi-agent] ${agent}/${taskId} finished without a directive — leaving claimed`);
            return;
          }
          await transitionToTerminal(agent, taskId, filePath, directive);
          console.log(`[${new Date().toLocaleTimeString()}] multi-agent: ${agent}/${taskId} → ${directive.kind === "done" ? "done" : `failed:${directive.reason}`}`);
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
  appendHistory,
  buildWorkerPrompt,
};
