// Pocket recorder sync — Phase 3 of the Pocket FDP.
// Notes/Projects/caravel/2026-08-21_FDP_Pocket-Recorder-Sync.md
//
// Called from the daemon's 60s tick in src/commands/start.ts. Shells out to
// the workspace's /pocket skill script rather than reimplementing the API
// client here — one implementation owns the API shape, the renderer and the
// file layout, and the agent-facing CLI and the daemon stay in lockstep.
//
// Feature flag: `pocket.sync` in .claude/caravel settings. Disabled by default.
// The script has its own independent gate (pocket.sync.enabled in
// .claude/config.json) and refuses to write unless that is true as well.

import { existsSync } from "fs";
import { join } from "path";
import { cronMatches } from "./cron";

const PROJECT_DIR = process.cwd();
const SCRIPT = join(PROJECT_DIR, ".claude", "skills", "pocket", "script", "pocket.mjs");

export interface PocketSyncConfig {
  /** Master switch. When false the tick is a no-op. */
  enabled: boolean;
  /** Cron expression, evaluated in the daemon's configured timezone. */
  cron: string;
  /** Give up on a run that hangs — the next tick will retry. */
  timeoutMs: number;
}

export const DEFAULT_POCKET_SYNC: PocketSyncConfig = {
  enabled: false,
  cron: "*/30 6-20 * * *",
  timeoutMs: 120_000,
};

interface SyncReport {
  filed: Array<{ id: string; title?: string; transcript?: string; meeting?: string }>;
  updated: Array<{ id: string; title?: string }>;
  skipped: Array<{ id: string; reason: string }>;
  errors: Array<{ id: string; error: string }>;
  dry_run: boolean;
  more_pending: boolean;
}

// A run in flight must not be started twice — a slow sync overlapping the next
// tick would double-fetch and race on the state file.
let running = false;

/**
 * Evaluate the schedule and run a sync if it matches. Safe to call every
 * minute; returns null when it did not run.
 */
export async function tickPocketSync(
  cfg: PocketSyncConfig,
  timezoneOffsetMinutes: number,
  now: Date,
): Promise<SyncReport | null> {
  if (!cfg.enabled) return null;
  if (!cronMatches(cfg.cron, now, timezoneOffsetMinutes)) return null;
  if (running) {
    console.log("[pocket] previous sync still running — skipping this tick");
    return null;
  }
  if (!existsSync(SCRIPT)) {
    console.error(`[pocket] script not found at ${SCRIPT} — is the /pocket skill installed?`);
    return null;
  }

  running = true;
  try {
    return await runSync(cfg.timeoutMs);
  } finally {
    running = false;
  }
}

/** Run `pocket.mjs sync --json` and summarise the result to the daemon log. */
export async function runSync(timeoutMs = DEFAULT_POCKET_SYNC.timeoutMs): Promise<SyncReport | null> {
  const proc = Bun.spawn(["node", SCRIPT, "sync", "--json"], {
    cwd: PROJECT_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => {
    console.error(`[pocket] sync exceeded ${timeoutMs}ms — killing`);
    proc.kill();
  }, timeoutMs);

  let stdout = "";
  let stderr = "";
  try {
    [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
  } finally {
    clearTimeout(timer);
  }

  let report: SyncReport | null = null;
  try {
    report = JSON.parse(stdout) as SyncReport;
  } catch {
    // Non-JSON stdout means the script failed before it could report — most
    // likely a missing API key or a network error. Surface it and move on.
    console.error(`[pocket] sync produced no report (exit ${proc.exitCode}): ${(stderr || stdout).trim().slice(0, 300)}`);
    return null;
  }

  const { filed, updated, skipped, errors } = report;
  if (filed.length || updated.length || errors.length) {
    console.log(
      `[pocket] sync: ${filed.length} filed, ${updated.length} updated, ` +
      `${skipped.length} skipped, ${errors.length} error(s)` +
      (report.dry_run ? " (dry run — pocket.sync.enabled is false)" : "") +
      (report.more_pending ? " · more pending" : "")
    );
    for (const f of filed) console.log(`[pocket]   + ${f.title || f.id} → ${f.transcript}`);
    for (const e of errors) console.error(`[pocket]   ! ${e.id}: ${e.error}`);
  }
  return report;
}
