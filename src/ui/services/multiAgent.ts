// Read-only summary of the multi-agent task system (WAL-63 phase 4).
// Mirrors `node .claude/skills/task/script/task.mjs summary` output, but in
// the daemon process so the dashboard can render without shelling out.

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const PROJECT_DIR = process.cwd();
const AGENTS_DIR = join(PROJECT_DIR, "agents");

const DEFAULT_AGENTS = ["alice", "ray", "adam", "sam", "bob", "mark", "cliff"];

export interface MultiAgentSummary {
  enabled: boolean;
  byAgent: Record<string, { open: number; done: number; failed: number }>;
  totals: { open: number; done: number; failed: number };
  waitingUser: { agent: string; file: string; summary: string }[];
  escalated: { agent: string; file: string }[];
}

function readField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

function readNestedField(yaml: string, parent: string, key: string): string | null {
  // very small parser: find `<parent>:` line, then look at the next 2-space
  // indented block for `<key>:`.
  const re = new RegExp(`^${parent}:[\\s\\S]*?^ {2}${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1].trim() : null;
}

function envAgents(): string[] {
  const raw = process.env.CLAUDECLAW_MULTI_AGENT_AGENTS;
  if (!raw) return DEFAULT_AGENTS;
  const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_AGENTS;
}

export async function getMultiAgentSummary(): Promise<MultiAgentSummary> {
  const summary: MultiAgentSummary = {
    enabled: existsSync(AGENTS_DIR),
    byAgent: {},
    totals: { open: 0, done: 0, failed: 0 },
    waitingUser: [],
    escalated: [],
  };

  if (!summary.enabled) return summary;

  for (const agent of envAgents()) {
    const counts = { open: 0, done: 0, failed: 0 };
    for (const bucket of ["open", "done", "failed"] as const) {
      const dir = join(AGENTS_DIR, agent, "tasks", bucket);
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir).catch(() => [] as string[]);
      const yamls = entries.filter((e) => e.endsWith(".yaml"));
      counts[bucket] = yamls.length;
      summary.totals[bucket] += yamls.length;

      if (bucket === "open") {
        for (const f of yamls) {
          try {
            const yaml = await readFile(join(dir, f), "utf-8");
            const status = readField(yaml, "status") ?? "open";
            const brief = readNestedField(yaml, "summary", "brief") ?? readField(yaml, "brief") ?? "";
            if (status === "waiting:user") {
              summary.waitingUser.push({ agent, file: f, summary: brief.slice(0, 200) });
            }
          } catch {}
        }
      }
      if (bucket === "failed") {
        for (const f of yamls) {
          try {
            const yaml = await readFile(join(dir, f), "utf-8");
            const status = readField(yaml, "status") ?? "";
            if (status === "escalated") {
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
