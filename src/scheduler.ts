// Recurring task scheduler — Jobs-to-Tasks merge, Phase 2.
// Called from the daemon's 60s setInterval tick in src/commands/start.ts.
// Loads templates from agents/<agent>/tasks/scheduled/, evaluates cron and
// interval cadences, and spawns child instances via createTask().
//
// Decisions implemented (from the Jobs-to-Tasks FDP):
//   DEC-1: skip_if_active — skip fire while a prior instance is still open/waiting
//   DEC-2: no backfill — fire only for the current minute's match
//   DEC-3: templates live in agents/<agent>/tasks/scheduled/
//   DEC-4: hybrid cadence — cron string OR interval { start, every_hours }
//   DEC-5: no Telegram/Discord notify on instance completion
//   DEC-6: from field carries template owner so the runner's continuation gate works

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";
import { listAgentNamesSync } from "./agents";
import { cronMatches } from "./cron";
import { shiftDateToOffset } from "./timezone";
import { createTask } from "./ui/services/multiAgentDispatch";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

export interface RecurrenceBlock {
  cron?: string;
  interval?: { start: string; every_hours: number };
  enabled: boolean;
  count: number;
  last_fired: string | null;
  skip_if_active: boolean;
}

interface ScheduledTemplate {
  id: string;
  headline: string;
  to: string;
  from: string;
  kind: string;
  priority: string;
  project: string | null;
  brief: string;
  budget?: { max_turns?: number; max_subagents?: number; max_usd?: number | null };
  recurrence: RecurrenceBlock;
  agent: string;
  path: string;
}

function asStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

async function loadScheduledTemplates(): Promise<ScheduledTemplate[]> {
  const agents = listAgentNamesSync();
  const out: ScheduledTemplate[] = [];
  for (const agent of agents) {
    const dir = join(AGENTS_DIR, agent, "tasks", "scheduled");
    if (!existsSync(dir)) continue;
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const f of files) {
      if (!f.endsWith(".yaml")) continue;
      const path = join(dir, f);
      let content: string;
      try { content = await readFile(path, "utf-8"); } catch { continue; }
      let doc: Record<string, any> | null = null;
      try { doc = yamlLoad(content, { json: true }) as Record<string, any>; } catch { continue; }
      if (!doc || typeof doc !== "object") continue;
      const recRaw = doc.recurrence;
      if (!recRaw || typeof recRaw !== "object") continue;
      const recurrence: RecurrenceBlock = {
        cron: typeof recRaw.cron === "string" ? recRaw.cron : undefined,
        interval: (recRaw.interval && typeof recRaw.interval === "object")
          ? {
              start: asStr(recRaw.interval.start),
              every_hours: Number(recRaw.interval.every_hours) || 0,
            }
          : undefined,
        enabled: recRaw.enabled !== false,
        count: Number(recRaw.count) || 0,
        last_fired: typeof recRaw.last_fired === "string" ? recRaw.last_fired : null,
        skip_if_active: recRaw.skip_if_active !== false,
      };
      const project = asStr(doc.project);
      out.push({
        id: asStr(doc.id) || f.replace(/\.yaml$/, ""),
        headline: asStr(doc.headline),
        to: asStr(doc.to) || agent,
        from: asStr(doc.from) || "user",
        kind: asStr(doc.kind) || "other",
        priority: asStr(doc.priority) || "P2",
        project: project || null,
        brief: asStr(doc.brief),
        budget: (doc.budget && typeof doc.budget === "object") ? doc.budget as any : undefined,
        recurrence,
        agent,
        path,
      });
    }
  }
  return out;
}

// DEC-1: check if any child instance of this template is still in open/ or waiting/.
// A "claimed" task lives in open/ with status: claimed, so scanning open/ covers it.
// templateId must be a root ID (e.g. TSK-2026-07-23-0001) — no decimal component.
async function hasActiveInstance(templateId: string): Promise<boolean> {
  const agents = listAgentNamesSync();
  const root = templateId.split(".")[0]!;
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const childRe = new RegExp(`^${escapedRoot}\\.(\\d+)\\.yaml$`);
  for (const agent of agents) {
    for (const bucket of ["open", "waiting"] as const) {
      const dir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const f of files) {
        if (childRe.test(f)) return true;
      }
    }
  }
  return false;
}

// DEC-4 interval mode: fires at `start` time and then every `every_hours` hours.
// Evaluated against the local time (project timezone).
function intervalFiresNow(
  interval: { start: string; every_hours: number },
  now: Date,
  tzOffsetMinutes: number
): boolean {
  const parts = interval.start.split(":");
  const startHour = Number(parts[0]);
  const startMinute = Number(parts[1] ?? "0");
  const periodMinutes = Math.round(interval.every_hours * 60);
  if (
    periodMinutes <= 0 ||
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    startHour < 0 || startHour > 23 ||
    startMinute < 0 || startMinute > 59
  ) return false;
  const shifted = shiftDateToOffset(now, tzOffsetMinutes);
  const nowMinutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const startMinutes = startHour * 60 + startMinute;
  // How many minutes since the start time (wraps around midnight)?
  const diff = (nowMinutes - startMinutes + 1440) % 1440;
  return diff % periodMinutes === 0;
}

// Bump count and last_fired in the template file using targeted line replacement
// so the rest of the YAML formatting is preserved. Assumes createScheduledTemplate()
// writes both fields indented inside the recurrence: block — if the format drifts, the
// regex won't match and we bail rather than write back an unchanged (or corrupted) file.
async function bumpTemplateFired(template: ScheduledTemplate, now: Date): Promise<void> {
  let content: string;
  try { content = await readFile(template.path, "utf-8"); } catch { return; }
  const nowIso = now.toISOString();
  const newCount = template.recurrence.count + 1;
  const afterCount = content.replace(/^(\s+count:\s*).*$/m, `$1${newCount}`);
  if (afterCount === content) {
    console.error(`[scheduler] bumpTemplateFired: count line not found in ${template.path} — skipping write`);
    return;
  }
  const afterFired = afterCount.replace(/^(\s+last_fired:\s*).*$/m, `$1${nowIso}`);
  if (afterFired === afterCount) {
    console.error(`[scheduler] bumpTemplateFired: last_fired line not found in ${template.path} — skipping write`);
    return;
  }
  try { await writeFile(template.path, afterFired); } catch {}
}

async function writeSkipJournal(agent: string, templateId: string, reason: string, now: Date): Promise<void> {
  const journalPath = join(AGENTS_DIR, agent, "tasks", "journal.ndjson");
  const entry = JSON.stringify({
    ts: now.toISOString(),
    id: templateId,
    status: "scheduled",
    transition: "skip",
    note: reason,
  });
  try {
    await mkdir(join(AGENTS_DIR, agent, "tasks"), { recursive: true });
    await writeFile(journalPath, entry + "\n", { flag: "a" });
  } catch {}
}

// Main scheduler tick — called from the daemon's 60s setInterval.
// DEC-2: fires only for the current minute's cron/interval match; no backfill.
export async function tickScheduler(tzOffsetMinutes: number, now: Date): Promise<void> {
  let templates: ScheduledTemplate[];
  try { templates = await loadScheduledTemplates(); } catch { return; }

  for (const template of templates) {
    if (!template.recurrence.enabled) continue;

    const { cron, interval } = template.recurrence;
    let fires = false;
    if (cron) {
      fires = cronMatches(cron, now, tzOffsetMinutes);
    } else if (interval) {
      fires = intervalFiresNow(interval, now, tzOffsetMinutes);
    }
    if (!fires) continue;

    // DEC-1: skip if a prior instance is still active
    if (template.recurrence.skip_if_active) {
      let active = false;
      try { active = await hasActiveInstance(template.id); } catch {}
      if (active) {
        await writeSkipJournal(
          template.agent,
          template.id,
          `Skipped fire — prior instance still active (skip_if_active)`,
          now
        );
        console.log(`[scheduler] skip ${template.id} — prior instance still active`);
        continue;
      }
    }

    // Spawn a child instance. from = template.from so DEC-6 continuation
    // gate picks up the right owner (alice-owned templates raise continuations;
    // user-owned templates complete silently unless worker emits waiting:on:user).
    try {
      const result = await createTask({
        to: template.to,
        from: template.from,
        parent: template.id,
        kind: template.kind,
        priority: template.priority,
        headline: template.headline,
        brief: template.brief,
        budget: template.budget,
        project: template.project,
      });
      if (result.ok) {
        console.log(`[scheduler] spawned ${result.id} from template ${template.id}`);
        await bumpTemplateFired(template, now);
      } else {
        console.error(`[scheduler] failed to spawn from ${template.id}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[scheduler] error spawning from ${template.id}:`, err);
    }
  }
}
