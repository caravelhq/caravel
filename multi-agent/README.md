# multi-agent — orchestration scaffold

Canonical source for the multi-agent task envelope system: schema, examples, the `/task` skill that Alice uses to formulate envelopes, and the helper script that allocates IDs and writes files.

This directory is the *source of truth*. The live instance is populated by `scripts/install-multi-agent.sh` in the Caravel repo (or a thin caller wrapper in the consuming project), which copies files from `template/` into `.claude/skills/task/`, `agents/_shared/`, and per-agent task directories.

## Layout

```
multi-agent/
  README.md                              # this file
  template/
    skills/                              # → .claude/skills/
      task/                              # → .claude/skills/task/
        SKILL.md                         #   procedure Alice follows for /task
        script/
          task.mjs                       #   ID allocator + dispatcher (also serves list/summary)
    shared/                              # → agents/_shared/
      task-envelope.md                   #   canonical schema spec
      task-envelope-examples/
        simple-research.yaml             #   user → Ray (simple research request)
        coordinator-delegation.yaml      #   Alice → Sam (post-research)
        escalation-back.yaml             #   Ray → Alice (decision needed)
        waiting-on-user.yaml             #   Alice parked, waiting on user
      rules/                             #   shared agent rules
        task-output.md                   #   file-as-output worker contract (primary)
        task-directives.md               #   XML directive fallback
        context-discovery.md
        decision-log.md
        frontmatter.md
        markdown-formatting.md
        project-folders.md
        review-numbering.md
    agents/                              # example agent profiles (seeded on fresh install)
      alice/
        agent.json
        CLAUDE.md
      bob/
        agent.json
        CLAUDE.md
      ray/
        agent.json
        CLAUDE.md
```

## Concept

Each agent has a `tasks/` directory with four active buckets and an append-only journal:

```
agents/<name>/tasks/
  open/       # claimable; runner picks these up each tick
  waiting/    # parked on a dependency; runner auto-unblocks when satisfied
  done/       # completed
  failed/     # failed:* (includes failed:aborted for mid-flight kills)
  archived/   # aged-out closed tasks (default: 30 days after closed.at)
  journal.ndjson   # append-only state-transition log
```

A task is a YAML file. The runner moves files between directories on status transitions; the path and the `status:` field must always agree.

Alice is the default coordinator. The user invokes `/task` (or asks in plain language) to dispatch work. The skill formulates the envelope and writes it to the target's `tasks/open/`. Workers (any agent — Alice, Ray, Bob, Sam, Mark, Cliff, Adam, etc.) pick tasks up on heartbeat, claim by setting a lease, work to completion, and land in `done/`, `failed/`, or `waiting/`. When Alice dispatches sub-tasks to other agents, the runner enqueues a `continuation` task for Alice once all siblings in the family land.

Full schema: `template/shared/task-envelope.md`.

## Install

From the Caravel repo (or the thin wrapper in the consuming project):

```bash
CARAVEL_PROJECT_DIR=/path/to/project bash scripts/install-multi-agent.sh
```

The install script:
1. (Optional) Pulls latest from the `local` branch of the Caravel repo.
2. Copies `template/skills/task/` → `<project>/.claude/skills/task/`.
3. Copies `template/shared/` → `<project>/agents/_shared/` (schema, examples, and shared rules).
4. For each known agent, ensures `agents/<name>/tasks/{open,done,failed,waiting}/` exists and creates an empty `journal.ndjson` if missing.
5. Seeds `agent.json` and `CLAUDE.md` from `template/agents/<name>/` for any agent that has a matching template but no existing profile — never overwrites existing profiles.
6. Reports what changed.

The script is idempotent — re-running it after template edits just refreshes the skill and shared files.

Configuration env vars:

| Var | Default | Notes |
|---|---|---|
| `CARAVEL_PROJECT_DIR` | — | **Required.** Project root that receives the install. |
| `CARAVEL_REPO_DIR` | `<project>/repos/claudeclaw` | Path to the Caravel repo checkout. |
| `CARAVEL_BRANCH` | `local` | Branch to pull from. |
| `CARAVEL_AGENTS` | `alice bob ray` | Space-separated agent names to provision. |

Legacy aliases `CLAUDECLAW_*` are still accepted for existing callers.

Flags: `--no-pull` skips the git pull; `--dry-run` shows what would change without writing anything.

## Enabling the runner

The multi-agent runner is a polling loop inside the Caravel daemon. It is **off by default**. To enable it, set the env var before starting the daemon:

```bash
export CARAVEL_MULTI_AGENT_RUNNER=1
```

The thin caller `setup/restart-claw.sh` in the consuming project can set this — uncomment the relevant `export` line in the wrapper.

Optional overrides:

| Env | Default | Notes |
|---|---|---|
| `CARAVEL_MULTI_AGENT_RUNNER` | `0` | `1` or `true` enables the loop |
| `CARAVEL_MULTI_AGENT_AGENTS` | *(auto-discovered from disk)* | Comma- or space-separated agent names to scan. When unset the runner discovers agents from `agents/<name>/agent.json` files. Falls back to the example roster (`alice,bob,ray`) only on a fresh install with no profiles. |
| `CARAVEL_MULTI_AGENT_ARCHIVE_DAYS` | `30` | Days after `closed.at` before a terminal task is moved to `archived/`. Active tasks (no `closed:` block) never archive. |

Tick cadence (30s) and per-agent concurrency (1 active task per agent) are currently compile-time constants.

## Status lifecycle

```
open
 └─▶ claimed          (runner sets lease + holder)
      ├─▶ done        (worker completed successfully)
      ├─▶ failed:*    (worker failed — see reason codes)
      └─▶ waiting:on:*  (worker parked on a dependency)
                           └─▶ open  (runner unblocks when dependency clears)
```

`failed:*` reasons: `budget`, `tool`, `refusal`, `context`, `crash`, `timeout`, `aborted`, `other`.

`waiting:on:<spec>` specs:
- `task:<id>` — auto-resolves when that task id appears in any agent's `done/`
- `agent:<name>` — auto-resolves when the named agent has any task in `done/` (heuristic)
- `limits` — auto-resolves when the global rate-limit gate clears
- `user` — never auto-resolves; requires Alice or the user to unblock

Terminal tasks (`done`, `failed:*`, `waiting:on:user`) accumulate a `closed:` block when retired (via dashboard, Alice continuation, or mid-flight abort). The `closed:` block is the user-attention layer:

```yaml
closed:
  status: closed | cancelled | superseded
  at: 2026-05-04T10:00:00Z
  by: user | alice | runner
  reason: "..."
```

Tasks with a `closed:` block move to `archived/` after `CARAVEL_MULTI_AGENT_ARCHIVE_DAYS`.

## Worker completion contract

Workers signal completion by **writing a file**. The XML directive format is legacy fallback only.

### Primary contract — file-as-output

Write this as the **last action** of your worker turn:

```
agents/<your-name>/tasks/<status>/<task-id>.md
```

The file has YAML frontmatter and a markdown body:

**Done:**
```markdown
---
status: done
summary: One-line restatement of what you produced and where it landed.
report_path: optional/path/to/separate/deliverable.md  # omit if body IS the deliverable
---

(Your full writeup here.)
```

**Failed:**
```markdown
---
status: failed
reason: budget | tool | refusal | context | crash | timeout | other
summary: One-line explanation of what blocked you.
---

(Optional: longer explanation.)
```

**Waiting:**
```markdown
---
status: waiting
waiting_on: task:TSK-... | agent:<name> | user
summary: One-line statement of what you're waiting on.
---

(Optional notes for when the dependency clears.)
```

The runner reads the file after the worker session ends. If found, it synthesises the transition from the frontmatter. This survives output truncation — a tag at the end of a long response can get cut off; a file cannot.

**Never touch the YAML envelope** at `agents/<you>/tasks/open/<id>.yaml`. The runner owns it — writing to it yourself causes the transition to silently fail (no journal entry, no chat notification, no Alice continuation).

### Legacy fallback — XML directive

When no file is found, the runner scans the worker's final response for one of these tags:

```
<task-done summary="…" report="optional/path.md">…optional inline body…</task-done>
<task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>
<task-waiting on="task:<id>|agent:<name>|user" summary="why blocked">…optional notes…</task-waiting>
```

The file is always preferred. Use the XML fallback only when you cannot write a file (tool error, permission issue, etc.).

## Tick behaviour

Each tick (default 30s):

1. **Limits gate check.** If a global rate-limit gate is active, skip the entire tick (claim pass + waiting sweep). The gate self-clears when its `reset_at` timestamp passes.
2. **Stale-claim recovery.** On the first tick after daemon startup, all `claimed` envelopes from the previous process are reset. On subsequent ticks, only leases whose `expires:` has elapsed are recovered. If `summary.response` is populated (the worker finished but the runner died before transition), the task is promoted to `done`; otherwise it is re-opened for fresh claim.
3. **Waiting sweep.** Envelopes in `tasks/waiting/` are checked for resolved dependencies. `task:<id>` resolves when the id appears in any agent's `done/`; `limits` resolves when the gate is clear; `user` never auto-resolves. Tasks with a `closed.status: superseded` overlay are skipped (they're tombstoned parents; their continuation is the active leaf).
4. **Archive sweep.** Envelopes with a `closed:` block older than `CARAVEL_MULTI_AGENT_ARCHIVE_DAYS` are moved to `tasks/archived/`. Their companion `.md` report file moves with them.
5. **Claim pass.** For each agent (in roster order), for each `.yaml` in `tasks/open/` with status `open` (file-system bucket is source of truth; unrecognised statuses are treated as open with a warning), claim up to the per-agent concurrency limit. Claiming writes `status: claimed`, `lease.holder`, and `lease.expires`, and appends a journal entry.
6. **Worker invocation.** Each claimed task spawns a worker: `streamUserMessage` with the agent's profile and a constructed prompt that embeds the brief and the file-as-output contract. Workers in the same family (same parent root, same agent) share a resumed Claude session thread so the prompt cache stays warm.

## Alice continuation

When Alice dispatches sub-tasks to other agents (`from: alice`), the runner enqueues a `continuation` task for Alice once all siblings in the same orchestration family have landed. The continuation brief lists every sibling's status and report path. Sibling consolidation means Alice gets **one** wake-up per family, not one per child.

When a worker parks on a sibling task (`waiting:on:task:<id>`), the parent gets `closed.status: superseded` so it drops off the active-task view. The continuation created when all siblings land is the new active leaf.

## Mid-flight abort

The dashboard can kill a claimed worker mid-turn. `abortInflightWorker(agent, taskId, reason, by)` signals the worker's `AbortController`. The runner catches the abort, synthesises a `failed:aborted` directive, and stamps `closed.status: cancelled` on the envelope so it reads as a deliberate cancellation rather than a retryable failure.

## Rate-limit gate

When any worker encounters an Anthropic API rate or account limit, the runner:
1. Parses the reset time from the error message (`resets 6:30pm (Pacific/Auckland)`).
2. Writes a gate file at `.claude/claudeclaw/state/limits-gate.json` with `reset_at`.
3. Parks the triggering task at `waiting:on:limits`.
4. Skips all subsequent ticks until the gate clears (checked at tick start; the gate file is deleted automatically when `reset_at` passes).

## Rollback

The feature flag `CARAVEL_MULTI_AGENT_RUNNER` is the primary rollback lever. Set it to `0` (or unset it) and restart the daemon — the runner code is dormant, no behaviour change.

To fully disable the runner code: `git revert <commit>` in the Caravel repo, then restart the daemon.
