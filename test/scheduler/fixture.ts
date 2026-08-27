/**
 * Fixture-directory harness for the scheduler suite (WAL-72).
 *
 * Builds a temp `agents/<name>/tasks/<bucket>/*.yaml` tree from a compact
 * declaration, so every ready-set case is a table entry: declare the graph,
 * run the scheduler, assert the ready ids. Cases live in ready.cases.ts.
 *
 * The envelope YAML is emitted with js-yaml `dump` (never hand-concatenated)
 * so fixture files are strict-parseable by construction — the suite must not
 * reproduce the WAL-63/WAL-79 corruption class it exists to guard.
 */

import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

// ── declaration format ───────────────────────────────────────────────────────

export type TaskDecl = {
  id: string;
  /** Envelope `status:` field. Defaults to "open". */
  status?: string;
  /** Bucket directory. Defaults to the bucket implied by `status`. */
  bucket?: string;
  /** FDP `needs:` — every entry must be `done`. Omitted when empty. */
  needs?: string[];
  /** FDP `after:` — every entry must be terminal (done | failed). Omitted when empty. */
  after?: string[];
  /** Envelope kind; "continuation" matters for the loop-guard cases. */
  kind?: string;
  from?: string;
  /** Node gate: "user" | "limits" | null. */
  gate?: string | null;
  parent?: string | null;
  /** ISO timestamp; defaults to a stable increasing fake from declaration order. */
  created?: string;
};

export type RawFile = {
  agent: string;
  bucket: string;
  name: string;
  content: string;
};

export type FixtureDecl = {
  /** agent name → its task declarations */
  agents: Record<string, TaskDecl[]>;
  /** Verbatim files written after the envelopes — for corruption cases. */
  rawFiles?: RawFile[];
};

// ── bucket derivation ────────────────────────────────────────────────────────

/** Maps an envelope status to the bucket directory it lives in. */
export function bucketFor(status: string): string {
  if (status.startsWith("waiting:")) return "waiting";
  if (status.startsWith("failed")) return "failed";
  if (status === "done") return "done";
  if (status === "paused") return "paused";
  if (status === "blocked") return "blocked";
  if (status === "claimed") return "open"; // claimed envelopes sit in open/ until terminal
  return "open";
}

// ── builder ─────────────────────────────────────────────────────────────────

/**
 * (Re)builds `<root>/agents/` from the declaration. Wipes any previous
 * fixture tree under root so one process can run many cases against the same
 * root — which matters because src/multiAgent.ts pins AGENTS_DIR to the cwd
 * at import time; the root IS the process cwd in the suite.
 */
export async function buildFixture(root: string, decl: FixtureDecl): Promise<string> {
  const agentsDir = join(root, "agents");
  if (existsSync(agentsDir)) await rm(agentsDir, { recursive: true, force: true });

  // Stable fake timestamps in declaration order, so (created, id) sorting in
  // the scheduler is deterministic without every case stating timestamps.
  let seq = 0;
  const nextCreated = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++seq)).toISOString();

  for (const [agent, tasks] of Object.entries(decl.agents)) {
    for (const t of tasks) {
      const status = t.status ?? "open";
      const bucket = t.bucket ?? bucketFor(status);
      const dir = join(agentsDir, agent, "tasks", bucket);
      await mkdir(dir, { recursive: true });

      const envelope: Record<string, unknown> = {
        id: t.id,
        headline: `fixture ${t.id}`,
        created: t.created ?? nextCreated(),
        updated: t.created ?? nextCreated(),
        from: t.from ?? "alice",
        to: agent,
        kind: t.kind ?? "code",
        parent: t.parent ?? null,
        gate: t.gate ?? null,
        status,
        lease: { holder: null, expires: null },
        history: [],
      };
      // Missing needs/after ⇒ no dependencies (FDP back-compat rule) — so
      // only emit the keys when they carry edges, like real dispatches will.
      if (t.needs && t.needs.length > 0) envelope.needs = t.needs;
      if (t.after && t.after.length > 0) envelope.after = t.after;

      await writeFile(join(dir, `${t.id}.yaml`), yamlDump(envelope));
    }
  }

  for (const raw of decl.rawFiles ?? []) {
    const dir = join(agentsDir, raw.agent, "tasks", raw.bucket);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, raw.name), raw.content);
  }
  return agentsDir;
}
