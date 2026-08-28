/**
 * Ready-set cases for the scheduler suite, derived from FDP v1.5. Every case
 * is data: declare the graph, state the expected ready ids. The cases were
 * first authored from the FDP alone (TSK-2026-08-27-0002, pre-build); per
 * the build-review pipeline they now run post-build against Bob's Phase 1
 * (9db3ba8) via adapter.ts — the expectations stay FDP-derived, never
 * implementation-derived. Tick-level, continuation and validation-at-dispatch
 * cases remain in TESTPLAN.md until their phases land.
 */

import type { FixtureDecl } from "./fixture.ts";

export type ReadyCase = {
  name: string;
  /** FDP section / decision the case pins. */
  pins: string;
  decl: FixtureDecl;
  /** Expected ready ids, compared as a set. */
  expectReady: string[];
  /** Expected graph errors: id → substring of the problem. */
  expectErrors?: { id: string; contains: string }[];
  /** Expected reverse-index entries (the "resolved once" check). */
  expectDependants?: Record<string, string[]>;
  /** Termination watchdog, ms. Default 2000. */
  watchdogMs?: number;
};

const bob = (tasks: FixtureDecl["agents"]["bob"]) => ({ agents: { bob: tasks } });

export const CASES: ReadyCase[] = [
  {
    name: "no edges at all → ready (back-compat)",
    pins: "FDP back-compat: missing needs/after ⇒ no dependencies",
    decl: bob([
      { id: "A" },
      { id: "B" },
      { id: "C" },
    ]),
    expectReady: ["A", "B", "C"],
  },
  {
    name: "needs on a done task → ready",
    pins: "§The scheduler: ∀ d ∈ needs : status(d) == done",
    decl: bob([
      { id: "A", status: "done" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: ["B"],
  },
  {
    name: "needs on an open task → not ready",
    pins: "§The scheduler",
    decl: bob([
      { id: "A" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: ["A"],
  },
  {
    name: "needs on a failed task → not ready (blocked class)",
    pins: "§Failure — blocked, and visible",
    decl: bob([
      { id: "A", status: "failed" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: [],
  },
  {
    name: "needs on a paused task → not ready",
    pins: "DEC-0004 / FDP paused inheritance",
    decl: bob([
      { id: "A", status: "paused" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: [],
  },
  {
    name: "after on a failed task → ready (the difference from needs)",
    pins: "§The scheduler: ∀ d ∈ after : status(d) ∈ {done, failed}",
    decl: bob([
      { id: "A", status: "failed" },
      { id: "B", after: ["A"] },
    ]),
    expectReady: ["B"],
  },
  {
    name: "after on failed:<reason> (prefixed status) → ready",
    pins: "real envelopes carry failed:timeout etc.",
    decl: bob([
      { id: "A", status: "failed:timeout" },
      { id: "B", after: ["A"] },
    ]),
    expectReady: ["B"],
  },
  {
    name: "after on a done task → ready",
    pins: "§The scheduler",
    decl: bob([
      { id: "A", status: "done" },
      { id: "B", after: ["A"] },
    ]),
    expectReady: ["B"],
  },
  {
    name: "after on an open task → not ready",
    pins: "§The scheduler",
    decl: bob([
      { id: "A" },
      { id: "B", after: ["A"] },
    ]),
    expectReady: ["A"],
  },
  {
    name: "PAUSED with every dependency satisfied → NOT ready",
    pins: "DEC-0004 — paused outranks edge resolution; 37 live tasks in paused/",
    decl: bob([
      { id: "A", status: "done" },
      { id: "B", status: "paused", needs: ["A"] },
    ]),
    expectReady: [],
  },
  {
    name: "paused envelope sitting in open/ (bucket mismatch) → NOT ready",
    pins: "DEC-0004 hazard: today's claim predicate treats unrecognised statuses as open",
    decl: bob([
      { id: "P", status: "paused", bucket: "open" },
      { id: "A" },
    ]),
    expectReady: ["A"],
  },
  {
    name: "open-status envelope sitting in paused/ (bucket mismatch, other way) → NOT ready",
    pins: "DEC-0004 — the bucket is the source of truth; paused/ never readies",
    decl: bob([
      { id: "P", status: "open", bucket: "paused" },
      { id: "A" },
    ]),
    expectReady: ["A"],
  },
  {
    // PHASE-3-FLIP: when gate evaluation lands, this becomes ["B"].
    name: "gate: user → ready in Phase 1 (gate is Phase 3 per v1.5 formula)",
    pins: "§Gates — v1.5 formula annotates t.gate == none as 'Phase 3; not evaluated in Phase 1'",
    decl: bob([
      { id: "A", gate: "user" },
      { id: "B" },
    ]),
    expectReady: ["A", "B"],
  },
  {
    name: "cycle A→B→A → terminates, nothing ready",
    pins: "brief: must not hang or infinitely recurse",
    decl: bob([
      { id: "A", needs: ["B"] },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: [],
    watchdogMs: 2000,
  },
  {
    name: "edge naming a task that doesn't exist → defined behaviour, not a crash",
    pins: "§Validation at dispatch (scheduler-side: error recorded, never ready)",
    decl: bob([
      { id: "A", needs: ["TSK-does-not-exist"] },
      { id: "B" },
    ]),
    expectReady: ["B"],
    expectErrors: [{ id: "A", contains: "unknown task" }],
  },
  {
    name: "diamond, sources open → only the root ready",
    pins: "brief: two paths to one dependency, resolved once",
    decl: bob([
      { id: "A" },
      { id: "B", needs: ["A"] },
      { id: "C", needs: ["A"] },
      { id: "D", needs: ["B", "C"] },
    ]),
    expectReady: ["A"],
    expectDependants: { A: ["B", "C"] },
  },
  {
    name: "diamond, one branch done → the other branch still gates the join",
    pins: "FDP test plan #2 fan-in",
    decl: bob([
      { id: "A", status: "done" },
      { id: "B", status: "done" },
      { id: "C", needs: ["A"] },
      { id: "D", needs: ["B", "C"] },
    ]),
    expectReady: ["C"],
  },
  {
    name: "diamond, all branches done → join ready",
    pins: "FDP test plan #2",
    decl: bob([
      { id: "A", status: "done" },
      { id: "B", status: "done" },
      { id: "C", status: "done" },
      { id: "D", needs: ["B", "C"] },
    ]),
    expectReady: ["D"],
  },
  {
    name: "linear chain A→B→C → only A ready",
    pins: "FDP test plan #1",
    decl: bob([
      { id: "A" },
      { id: "B", needs: ["A"] },
      { id: "C", needs: ["B"] },
    ]),
    expectReady: ["A"],
  },
  {
    name: "claimed dependency → dependant not ready; the claimed task itself is formula-ready",
    pins: "§The scheduler — claimed is not done. The claimed task sits in open/, so the pure formula reads it ready; the live claim pass skips it via its own isClaimed guard (tickOnce), a layer this suite deliberately does not model.",
    decl: bob([
      { id: "A", status: "claimed" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: ["A"],
  },
  {
    name: "waiting:on:user dependency → dependant not ready",
    pins: "waiting is not done",
    decl: bob([
      { id: "A", status: "waiting:on:user" },
      { id: "B", needs: ["A"] },
    ]),
    expectReady: [],
  },
  {
    name: "needs + after mixed: after satisfied, needs not → not ready",
    pins: "§The scheduler — conjunction of all clauses",
    decl: bob([
      { id: "X", status: "done" },
      { id: "Y", status: "failed" },
      { id: "Z" },
      { id: "W", needs: ["Z"], after: ["X", "Y"] },
    ]),
    expectReady: ["Z"],
  },
  {
    name: "unparseable sibling envelope → error recorded, others still ready",
    pins: "the 29-unparseable class: state on disk must never silently vanish",
    decl: {
      agents: { bob: [{ id: "A" }] },
      rawFiles: [
        {
          agent: "bob",
          bucket: "open",
          name: "B.yaml",
          content: "id: B\nheadline: Continue: unquoted colon\nstatus: open\n",
        },
      ],
    },
    expectReady: ["A"],
    expectErrors: [{ id: "B", contains: "unparseable YAML" }],
  },
  {
    name: "two agents: ready-set spans the roster",
    pins: "§The scheduler tick: for each agent in roster order",
    decl: {
      agents: {
        bob: [
          { id: "B1", needs: ["A1"] },
        ],
        clara: [
          { id: "A1", status: "done" },
          { id: "C1" },
        ],
      },
    },
    expectReady: ["B1", "C1"],
  },
];
