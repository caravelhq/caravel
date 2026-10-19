/**
 * Single source of truth for envelope schema constants.
 *
 * Imported by multiAgent.ts (runner), scheduler.ts, validate-envelopes.ts, and the CLI.
 * Nothing here pins paths at module load time — callers that need a workspace root
 * pass it as a parameter or resolve lazily.
 *
 * The grep gate in test/envelope-drift.test.ts fails if bucket literals or spec lists
 * reappear in src/ or scripts/ outside this file.
 */

export { listAgentNamesSync } from "../agents.js";

// ── Bucket layout ─────────────────────────────────────────────────────────────

/** Every valid envelope bucket. */
export const BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "paused",
  "blocked",
  "archived",
  "scheduled",
] as const;

export type Bucket = (typeof BUCKETS)[number];

/** Buckets swept by sweepArchive. paused is excluded: stays visible until a human resumes or closes it. */
export const ARCHIVABLE_BUCKETS = ["done", "failed", "waiting", "open"] as const;

/** Full bucket scan for graph construction. Does not include scheduled (template, not a live task). */
export const GRAPH_SCAN_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "paused",
  "archived",
  "blocked",
] as const;

/** Buckets searched by locateEnvelope when the preferred path misses. Does not include paused/blocked/scheduled. */
export const LOCATE_ENVELOPE_BUCKETS = [
  "open",
  "done",
  "failed",
  "waiting",
  "archived",
] as const;

/** Buckets searched by cleanStaleRendezvous. Typed for compatibility with the keepBucket union. */
export const STALE_RENDEZVOUS_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "paused",
] as const satisfies ReadonlyArray<"open" | "waiting" | "done" | "failed" | "paused">;

/** Seven-bucket scan for nextContTaskId — includes paused and blocked to prevent id reuse. */
export const ALLOCATION_SCAN_DIRS = [
  "open",
  "waiting",
  "done",
  "failed",
  "paused",
  "archived",
  "blocked",
] as const;

/** All operational buckets validated by validate-envelopes (now includes paused and blocked). */
export const VALIDATE_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "archived",
  "scheduled",
  "paused",
  "blocked",
] as const;

/** Buckets where a terminal report file (.md) may appear: done, failed, or waiting. */
export const REPORT_FILE_BUCKETS = ["done", "failed", "waiting"] as const satisfies ReadonlyArray<Bucket>;

/** Live buckets scanned by assertEnvelope and similar CLI guards. Excludes archived/scheduled (terminal/template). */
export const ASSERT_ENVELOPE_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "blocked",
  "paused",
] as const satisfies ReadonlyArray<Bucket>;

/** Live task buckets (not terminal, not template): open, waiting, paused. */
export const LIVE_TASK_BUCKETS = ["open", "waiting", "done", "failed", "paused"] as const satisfies ReadonlyArray<Bucket>;

/** Buckets scanned for attention tiers (WAL-84). Excludes archived/ and scheduled/. */
export const ATTENTION_SCAN_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "paused",
  "blocked",
] as const satisfies ReadonlyArray<Bucket>;

/** Buckets included in task summary counts (all user-visible operational buckets). */
export const SUMMARY_BUCKETS = [
  "open",
  "waiting",
  "done",
  "failed",
  "archived",
  "scheduled",
  "paused",
] as const satisfies ReadonlyArray<Bucket>;

// ── Waiting specs ─────────────────────────────────────────────────────────────

/**
 * Valid waiting:on:<spec> values accepted by the runner.
 * `limits` is runner-internal (emitted on limit detection, not by workers).
 * `script` is the worker-emittable park spec.
 * Extend this set and SWEEP_PREDICATES in multiAgent.ts together.
 */
export const VALID_WAITING_SPECS = new Set(["limits", "script"]);

/** Specs a worker or CLI client may emit. limits is runner-internal only. */
export const WORKER_WAITING_SPECS = new Set(["script"]);

// ── Failure reasons ───────────────────────────────────────────────────────────

export const VALID_FAILURE_REASONS = [
  "budget",
  "tool",
  "refusal",
  "context",
  "crash",
  "timeout",
  "other",
] as const;

export type FailureReason = (typeof VALID_FAILURE_REASONS)[number];

// ── Usage recording ───────────────────────────────────────────────────────────

/** Per-task usage stamped on the envelope at terminal transition (F3). */
export interface WorkerUsage {
  turns: number;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
  };
  cost_usd: number;
  duration_ms: number;
}

// ── Required fields ───────────────────────────────────────────────────────────

/** Minimum required top-level frontmatter fields for a valid envelope by status. */
export const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  open: ["id", "headline", "status", "from", "to"],
  waiting: ["id", "headline", "status", "from", "to", "waiting_on", "deadline"],
  done: ["id", "headline", "status", "from", "to", "summary"],
  failed: ["id", "headline", "status", "from", "to", "reason", "summary"],
  paused: ["id", "headline", "status", "from", "to"],
  blocked: ["id", "headline", "status", "from", "to"],
  archived: ["id", "headline", "status", "from", "to"],
  scheduled: ["id", "headline", "status", "from", "to"],
};
