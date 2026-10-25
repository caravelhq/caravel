---
name: task-tree
description: Guide for agents on how to orchestrate multi-step task graphs — when to use needs:/after: edges, how the runner handles sequencing, and how to use caravel task batch to lint and dispatch a connected task set atomically. Use when you need to coordinate tasks that have ordering or dependency relationships.
---


# /task-tree — orchestrating connected task graphs

> **Not about git worktrees.** This skill is about *task* trees — dependency graphs between task envelopes. For a second working directory on another branch, you want the **`worktree`** skill and `agents/_shared/rules/worktrees.md`. The two were conflated during WAL-123; they are unrelated.

When an agent needs a series of tasks to run in a specific order — or some tasks to run in parallel and then converge — the envelope schema has built-in graph support. The runner handles sequencing automatically; you declare the edges, it does the rest.

## The two dependency edges

Both live directly in the envelope YAML:

```yaml
needs:
  - TSK-2026-10-23-0001    # must reach "done" before this task is claimable
  - TSK-2026-10-23-0002

after:
  - TSK-2026-10-23-0003    # must reach "done" OR "failed" before this task is claimable
```

| Edge | Waits for | Use when |
|---|---|---|
| `needs:` | dep is `done` | work genuinely depends on output from the dep |
| `after:` | dep is `done` or `failed` | cleanup / teardown / "summarise regardless of outcome" |

Both can be mixed freely. A task can depend on `needs:` and `after:` in the same envelope.

## How the runner handles sequencing

Tasks with unmet deps are written to `open/` immediately (so they're visible on the dashboard) but the scheduler's `ready()` check returns false until all edges are satisfied. There's no separate "waiting" state for graph deps — the task sits in `open/` and the tick loop skips it until it's claimable.

Once all deps are satisfied, the task becomes claimable on the next scheduler tick (within a few seconds). No manual intervention needed.

## Parallel execution

Tasks with no dependency on each other are picked up concurrently by the runner. This is the default — don't add a `needs:` edge unless work genuinely depends on the output of the dep.

```
fetch-a ─┐
          ├──► combine (needs: both)
fetch-b ─┘
```

Both `fetch-a` and `fetch-b` will be claimed immediately. `combine` waits until both are done.

## Continuation and frontier check

When a task completes, the runner's frontier check fires. If the completed task is the last leaf of a family (all siblings with the same `parent:` are terminal), the runner spawns a **consolidation continuation** to gather the results. This is automatic — you don't need to wire it up. The continuation targets the coordinator (the `from:` agent of the parent task) and lists all family IDs in its `after:` field.

The continuation mechanism applies to **family trees** (tasks sharing a `parent:`). The `needs:`/`after:` graph is orthogonal — it works across unrelated tasks without a shared parent.

## The atomic dispatch problem

Dispatching a graph task-by-task with `caravel task new` has a race: you dispatch task A, it gets claimed and starts running, and then you discover a lint error in task C. Now task A is in flight and you can't easily undo it.

**Use `caravel task batch` to avoid this.** It lints the entire graph, detects cycles and dangling references, and only writes any envelope to disk when every task passes. A single failure aborts the whole batch — nothing is dispatched.

## caravel task batch — usage

Create a batch spec YAML:

```yaml
# Optional top-level defaults (inherited by all tasks unless overridden)
from: alice
project: WAL-63_Multi-Agent

tasks:
  fetch-data:
    headline: "Fetch external dataset"
    to: bob
    kind: code
    brief: |
      Download the dataset from the external API.
    output_format: agents/bob/tasks/done/<id>.md

  process-data:
    headline: "Process and normalise data"
    to: bob
    kind: code
    needs:
      - fetch-data       # local label — substituted with the real ID on dispatch
    brief: |
      Normalise the downloaded dataset.
    output_format: agents/bob/tasks/done/<id>.md

  generate-report:
    headline: "Generate summary report"
    to: alice
    kind: report
    needs:
      - process-data
    brief: |
      Write the final report from the processed data.
    output_format: agents/alice/tasks/done/<id>.md
```

Then dispatch:

```bash
caravel task batch --yaml batch-spec.yaml
```

Output: one real TSK ID per line (in insertion order). The printed IDs are the dispatched task IDs in the same order as the `tasks:` map.

Errors (dangling refs, cycles, lint failures) are reported to stderr and exit non-zero. Nothing is written on failure.

### Linking batched tasks to a parent

Set a top-level `parent:` field on the spec to attach all tasks to an existing parent envelope. When a parent is given, the allocated IDs become `<parent-root>.NN` decimal children (matching `caravel task new --parent`) rather than flat `TSK-<date>-NNNN` ids. This is what makes them appear as a family on the dashboard and participate in the continuation mechanism.

```yaml
from: alice
project: WAL-63_Multi-Agent
parent: TSK-2026-10-22-0001    # existing parent task

tasks:
  step1:
    headline: "Step 1"
    to: bob
    kind: code
    brief: Do step 1.
    output_format: agents/bob/tasks/done/<id>.md
```

A per-task `parent:` overrides the top-level default. **The `parent:` value must be a real `TSK-…` id — not a local batch label.** Intra-batch parenting is not supported.

### What batch validates

Before writing a single file:

1. **Structural** — all `needs:` and `after:` references are labels that exist within the batch; `parent:` is not a local batch label.
2. **Cycles** — Kahn's topological sort; a cycle causes an immediate abort with the cyclic labels named.
3. **Intra-batch W1** — for each pair of tasks with no `needs:`/`after:` edge between them, `touches:` are compared. Overlapping files without an ordering edge produce a warning.
4. **Policy lint** — every task is run through the same `doLintNewEnvelope` checks as `caravel task new`: unknown agent (H1), missing fields (H2), headline length (H3), second-retry guard (H5, active when the batch has a `parent:` and existing children are found on disk), touches overlap with already-dispatched siblings (W1), parallel siblings without `touches:` (W2), budget (W3), context references (W4), output_format (W6).

A parented batch is subject to at least as strict lint as `caravel task new --parent` — H5 fires when a parent already has a child on disk (use `--force` to bypass), and W1 compares against both already-dispatched siblings AND the other tasks within the same batch.

### Flags

- `--force` — bypasses the second-retry hard-fail (H5, same semantics as `caravel task new --force`). The bypass is logged in the journal.

### Top-level defaults

`from:`, `to:`, `project:`, and `parent:` at the spec root are inherited by every task that doesn't set those fields explicitly. Useful for homogeneous batches where all tasks go to the same agent or parent.

## Patterns

### Sequential chain

```yaml
tasks:
  step-1:
    headline: "Step 1"
    to: bob
    kind: code
    brief: Do step 1.
    output_format: agents/bob/tasks/done/<id>.md

  step-2:
    headline: "Step 2"
    to: bob
    kind: code
    needs: [step-1]
    brief: Do step 2 after step 1.
    output_format: agents/bob/tasks/done/<id>.md

  step-3:
    headline: "Step 3"
    to: bob
    kind: code
    needs: [step-2]
    brief: Do step 3 after step 2.
    output_format: agents/bob/tasks/done/<id>.md
```

### Fan-out then converge

```yaml
tasks:
  shard-a:
    headline: "Process shard A"
    to: bob
    kind: code
    brief: Process shard A.
    output_format: agents/bob/tasks/done/<id>.md

  shard-b:
    headline: "Process shard B"
    to: bob
    kind: code
    brief: Process shard B.
    output_format: agents/bob/tasks/done/<id>.md

  merge:
    headline: "Merge processed shards"
    to: alice
    kind: report
    needs: [shard-a, shard-b]
    brief: Merge results from both shards.
    output_format: agents/alice/tasks/done/<id>.md
```

`shard-a` and `shard-b` run in parallel. `merge` waits for both.

### Cleanup regardless of outcome

```yaml
tasks:
  risky-work:
    headline: "Run risky migration"
    to: bob
    kind: code
    brief: Run the migration.
    output_format: agents/bob/tasks/done/<id>.md

  cleanup:
    headline: "Cleanup after migration"
    to: bob
    kind: code
    after: [risky-work]     # runs even if risky-work fails
    brief: Clean up temp files and locks.
    output_format: agents/bob/tasks/done/<id>.md
```

## Anti-patterns

**Don't dispatch task-by-task when tasks are interdependent.** If task A is already running when you find an error in task C, recovery is painful. Use `caravel task batch` for the whole set.

**Don't add `needs:` edges unnecessarily.** Unnecessary edges serialize work that could run in parallel. Add an edge only when task B genuinely needs output from task A.

**Don't use a local batch label as `parent:`.** `parent:` must reference a real `TSK-…` id that already exists. Intra-batch parenting (one task in the batch being the parent of another) is not supported — `batch` will reject it with an error. Dispatch the parent first with `caravel task new`, then batch the children with `parent: <that-id>`.

**Don't use `after:` when you mean `needs:`.** If you need the dependency's *successful output*, use `needs:` — `after:` fires even on failure and the dep's output may be incomplete.

## Delegation — when a task's obligations must transfer

Sometimes the task that was supposed to satisfy a `needs:` edge can't complete. The edge-rewriting primitive is `caravel task delegate`:

```bash
caravel task delegate --original <id> --to <id> [--add]
```

**What it does:**
- Rewrites every `needs:` and `after:` field across all agents and all buckets that reference `--original`, replacing with `--to`.
- Stamps `delegated_to: <to-id>` on the original's envelope WITHOUT changing its status (a failed task stays failed — audit trail intact).
- Writes a journal entry recording the delegation.
- Refuses: cycles, self-reference, and delegating to a task in `failed/` or `archived/` (which can never satisfy a `needs:` edge).
- With `--add`: adds the delegate alongside the original rather than replacing (use when the original might still complete or multiple tasks must satisfy the edge).

**Note on `done/` delegates:** Delegating to a task already in `done/` is allowed and is the correct incident-recovery path. After the rewrite, `sweepBlocked` will release any blocked dependants on the next tick because all their `needs:` are now satisfied.

**`sweepBlocked` is the release mechanism.** After `delegate` rewrites the edges, the blocked dependants are not moved immediately — `sweepBlocked` (runner tick) scans `blocked/` and moves tasks to `open/` when all their `needs:` are satisfied. If the delegate is already in `done/`, this happens on the very next tick.

### Scenario 1 — failure recovery (coordinator-driven)

X failed, X' replaces it. Everything blocked on X must wait for X' instead.

```bash
# X failed; X' (its replacement) completed successfully
caravel task delegate --original TSK-2026-10-24-0005 --to TSK-2026-10-24-0005.01
```

All tasks in `blocked/` with `needs: [TSK-2026-10-24-0005]` now have `needs: [TSK-2026-10-24-0005.01]`. Since X' is in `done/`, `sweepBlocked` releases them immediately on the next tick.

### Scenario 2 — self-delegation at turn end (via directive)

An agent discovers mid-task that a prerequisite Y must be created first. The agent cannot safely rewrite its own claimed envelope via the CLI. Instead it uses the `<task-delegate>` directive alongside a terminal directive:

```
<task-done summary="Y must complete before I can continue; delegating to Y." />
<task-delegate delegate="TSK-2026-10-24-0007" mode="replace" />
```

The runner applies the directive after `transitionToTerminal` — it calls `rewriteDelegationEdges` with the completed task as the original, and the named delegate as the target. The original ends up in `done/` with `delegated_to: TSK-2026-10-24-0007`. Dependants' edges are rewritten to point at Y; once Y completes, `sweepBlocked` releases them.

**Limitation:** this directive handles "I'm done, transfer my obligations to Y", NOT "I need Y first before I can continue". The latter would require a separate `task-reblock` primitive (not yet implemented). For mid-task discovery of a blocker, the current option is to fail with a clear reason and let the coordinator dispatch a recovery via scenario 1.

### Scenario 3 — script-callback completion (coordinator-driven)

A parked task is waiting for a callback, but completion will instead be handled by a task the callback dispatches. Same pattern as scenario 1 — coordinator calls `delegate` to re-point dependants at the new task.

### Anti-patterns

**Don't delegate to a failed task.** `delegate` refuses this — a `failed/` target can never satisfy a `needs:` edge, so you'd be permanently blocking the dependants.

**Don't use the CLI for self-delegation mid-turn.** The runner holds a lease on the claimed envelope; rewriting it mid-turn breaks the transition journal and continuation logic. Use the `<task-delegate>` directive instead.

**Don't use `--add` when the original will never complete.** The `--add` flag keeps the original edge alongside the delegate, meaning the dependant won't be released until both are done. Only use `--add` when the original might still independently complete.

## Checking graph state

To see what's open and its dependency status:

```bash
caravel task list --agent alice
caravel task summary
```

The dashboard (`:4632`) shows the full task graph with status colour-coding.
