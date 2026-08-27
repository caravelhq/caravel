# Scheduler test suite — design (WAL-72)

Design basis: FDP v1.5 (`Notes/Projects/caravel/2026-08-23_FDP_Workflow-Graph-Engine.md`).
The cases and the reference oracle were first written from the FDP **only**,
before any Phase 1 code existed (TSK-2026-08-27-0002). Per the
build-review pipeline (`agents/_shared/rules/build-review-pipeline.md`) the
suite now runs **post-build**: Phase 1 landed as `9db3ba8`
(`feature/WAL-72-phase1-graph`), the adapter binds the same FDP-derived
cases against the real `loadGraph`/`ready`, and disagreement is a finding —
the expectations stay FDP-derived, never implementation-derived.

## Architecture

```
ready.cases.ts    data: the case table (declaration → expected ready-set)
fixture.ts        declaration → temp agents/<name>/tasks/<bucket>/*.yaml tree
reference.ts      the FDP §"The scheduler" semantics as executable code (oracle)
adapter.ts        binds the same cases to src/multiAgent.ts __testing exports
ready.test.ts     runner: fixture → loadGraph → readySet → assert; + real impl
```

Why both a reference and an adapter: the cases must be judged against the
FDP's *semantics*, not against whatever the current implementation does —
otherwise the suite faithfully reproduces the implementation's bugs and
proves nothing. `reference.ts` is those semantics, written from the doc. When
Phase 1 exports `loadGraph`/`ready`, the adapter runs every case against the
real code too; disagreement is a **finding against the runner** (reported,
never fixed here — the runner is WAL-72's to change).

The adapter composes the two exported functions (`loadGraph(dir, agents)` +
`ready(taskId, graph)`) and asks `ready()` about each id the case declared —
it needs no knowledge of the graph's in-memory shape, only the public
surface. If the exports move or change shape, the adapter reports
`incompatible` rather than crashing the suite.

### Fixture declaration format

```ts
{
  agents: {
    bob: [
      { id: "A", status: "done" },
      { id: "B", needs: ["A"] },          // must succeed first
      { id: "C", after: ["A"], gate: "user" },  // must finish, either way
    ],
  },
  rawFiles: [ /* verbatim corruption fixtures, e.g. unparseable YAML */ ],
}
```

- `status` defaults to `open`; the bucket directory is derived from it
  (`waiting:*` → waiting/, `failed*` → failed/, `paused` → paused/, …) and
  can be overridden with `bucket` to build deliberate mismatch states.
- `needs`/`after` are emitted as YAML lists **only when non-empty** — missing
  keys mean no dependencies, per the FDP back-compat rule.
- Envelopes are emitted with `js-yaml dump`, never string concatenation, so
  fixtures are strict-parseable by construction (the suite must not
  reproduce the WAL-63/WAL-79 corruption class it guards).
- One tmp root per process, rebuilt per case. This is forced by
  `src/multiAgent.ts`, which pins `AGENTS_DIR = cwd()/agents` at import
  time — the root **is** the cwd, and the adapter's import happens after
  the chdir.

### Failure policy

- Reference-implementation failure → suite failure (this suite's own
  correctness).
- Real-implementation disagreement → **finding**, advisory until Bob/Cliff
  disposition the open findings from the consolidation pass
  (TSK-2026-08-27-0005). `--strict` / `CARAVEL_SCHED_STRICT=1` promotes
  findings to failures — flip on once Phase 1's findings are resolved.

## Case list

### Implemented now (`ready.cases.ts`, 24 cases)

Each runs against the reference **and** the real scheduler when bound.

| # | Case | Pins |
|---|---|---|
| 1 | No edges at all → ready | FDP back-compat: missing needs/after ⇒ no deps |
| 2 | `needs` on done → ready | §The scheduler |
| 3 | `needs` on open → not ready | §The scheduler |
| 4 | `needs` on failed → not ready | §Failure — blocked |
| 5 | `needs` on paused → not ready | DEC-0004 inheritance |
| 6 | `after` on failed → ready | the `needs`/`after` difference |
| 7 | `after` on `failed:<reason>` → ready | real statuses carry prefixes |
| 8 | `after` on done → ready | §The scheduler |
| 9 | `after` on open → not ready | §The scheduler |
| 10 | **Paused + every dep satisfied → NOT ready** | DEC-0004; 37 live tasks in paused/ |
| 11 | Paused envelope sitting in open/ (bucket mismatch) → NOT ready | DEC-0004 hazard |
| 11b | Open-status envelope sitting in paused/ (mismatch, other way) → NOT ready | bucket is the source of truth |
| 12 | `gate: user` → **ready in Phase 1** (gate evaluation is Phase 3 per v1.5 formula; PHASE-3-FLIP marker in cases file) | §Gates |
| 13 | Cycle A→B→A → terminates, nothing ready | watchdog-guarded |
| 14 | Edge to unknown id → error recorded, sibling still ready | §Validation |
| 15 | Diamond, sources open → root ready; dependants resolved once | reverse index dedupe |
| 16 | Diamond, one branch done → other branch gates join | fan-in |
| 17 | Diamond, all done → join ready | fan-in |
| 18 | Linear chain → only head ready | FDP test plan #1 |
| 19 | Claimed dependency → dependant not ready; claimed task itself formula-ready (claim pass guards it separately) | claim skip set |
| 20 | `waiting:on:user` dependency → not ready | waiting ≠ done |
| 21 | Mixed needs+after: conjunction of all clauses | §The scheduler |
| 22 | Unparseable sibling envelope → error recorded, others ready | the 29-envelope class |
| 23 | Two agents, cross-agent edge → ready-set spans roster | §The scheduler tick |

### Designed, deferred until the phase that ships them

| Case | Needs | FDP test plan |
|---|---|---|
| Regression `.05`/`.06`: `.06 needs [.05]` never claimed while `.05` open/claimed; ready within one tick of done | tick-level runner (claim pass) | #3 |
| Failed dep ⇒ dependant moves to `blocked/` with `blocked_by`, error event journaled, no cascade | Phase 3 blocked bucket | #4 |
| Frontier: terminal with empty reverse index → continuation to `reply_to ?? from`; downstream present → nothing; `from: user` → surface, no spawn | Phase 2 | #5 |
| Loop guard: a `kind: continuation` node terminating with nothing downstream spawns **nothing** | Phase 2 | #5b |
| Dispatch validation: unknown id, cycle, self-reference rejected at `createTask` before anything is written | Phase 3 | #6 |
| Concurrency: `concurrency: 2` claims two ready tasks same tick; `1` claims one | per-agent concurrency | #7 |
| Tick resilience: injected throw in each sweep → claim pass still runs, `last_tick_ok` false | Phase 4 tick health | #9 |
| Archive safety: `waiting:on:user`/`blocked` aged past threshold not archived; `done` is | Phase 3 | #10 |
| Claim drought: ready work exists, `last_claim_at` stale → surfaced | Phase 4 | — |

The tick-level cases share this harness: same fixture builder, one extra
step — run `tickOnce` (or its Phase-N successor) against the root instead of
calling `ready()` directly, then assert on **disk effects** (which envelopes
moved to claimed/done/blocked), never on the absence of a throw.

## Part 3 — catching the silent-failure class

Two of this week's worst bugs were invisible to every test we had. What
shape of test fires on that class?

### 1. The tick that completes but does no work (2026-08-26 sweepArchive throw)

**Shape: assert effects, not absence-of-throw.** `tickOnce` returns `void`;
"did not throw" is vacuously true of a tick whose claim pass never ran. The
test is: build a fixture with **known ready work**, run one tick, then read
the fixture tree back and assert the *specific disk transitions* — envelope
X now `status: claimed` with a lease holder, envelopes Y and Z untouched.
That assertion goes red the moment anything upstream of the claim pass
aborts the tick, whatever the mechanism — a `ReferenceError` in a sweep, a
new gate added between two stages, an early return someone adds "to be
safe". It pins the invariant ("a tick with ready work claims work") rather
than any one code path.

Two companions make it robust:

- **Stage fault injection** (FDP test plan #9): inject a throw into each
  sweep in turn, assert the claim pass still runs and `last_tick_ok` goes
  false. This is the regression *as a test* — it pins the isolation
  property, not just the incident.
- **A canary claim** (cheap version, needs no fault injection): one
  synthetic ready envelope in the fixture that must always be claimed
  within N ticks. If the runner can't pick up guaranteed-ready work, the
  tick is lying — this is the "claim drought" alert as a test.

Why it would have fired on 2026-08-26: the throw aborted `tickOnce` before
the claim pass, so zero envelopes would have transitioned to claimed — the
effects assertion fails on the first tick, and the stage-injection test
names the culprit sweep. No daemon, dashboard, or log introspection needed.

### 2. State on disk that the system can't see (29 unparseable envelopes)

**Shape: an accounting invariant — the reader must account for every file.**
For any tree the system serves: `count of *.yaml under agents/**/tasks/**`
must equal `count of tasks the listing returns + count of tasks the reader
explicitly reported as unreadable`. Silently skipping an unparseable file
(the UI's behaviour) breaks the equality and the test goes red, naming the
file. The parse half already exists — `scripts/validate-envelopes.ts` — and
is now self-tested and part of `test:all`; what it must additionally become
is a **gate on the live workspace** (pre-restart / pre-deploy step), because
the incident was about *production* state, not fixtures.

The defence needs both ends:

- **Writer end** (exists): `set-field` / `envelope-yaml-safety` suites pin
  that the runner's field-writing primitives never emit strict-parse
  failures. WAL-79 fixed the writer; these keep it fixed.
- **Reader end** (proposed): parse-or-report, never parse-or-skip, plus the
  count invariant above so "skipped" can't quietly become "dropped".

The scheduler suite carries the same principle at the graph level: case 22
asserts an unparseable envelope becomes a recorded `graph.errors` entry,
not an invisible absence from the index.

Both shapes share one idea, worth stating because it generalises: **every
"nothing happened" outcome must be distinguishable from "something happened
and it worked"** — by counting files, reading statuses, and asserting on
the disk state a human would eventually discover. Absence of an error is
not a signal.
