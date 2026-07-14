# multi-agent — orchestration scaffold

Canonical source for the multi-agent task envelope system: schema, examples, the `/task` skill that Alice uses to formulate envelopes, and the helper script that allocates IDs and writes files.

This directory is the *source of truth*. The live instance is populated by `setup/install-multi-agent.sh` in the consuming repo, which copies files from `template/` into `.claude/skills/task/` and `agents/_shared/`, and creates per-agent `tasks/{open,done,failed}/` directories with empty `journal.ndjson` files.

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
```

## Concept

Each agent has a `tasks/` directory with three buckets — `open/`, `done/`, `failed/` — and an append-only `journal.ndjson` index. A task is a YAML file. The runner moves files between buckets on status transitions; the path is always consistent with the `status:` field.

Alice is the coordinator. The user invokes `/task` (or asks in plain language) to dispatch work. The skill formulates the envelope and the helper script writes it to the target's `tasks/open/`.

Workers (Ray, Adam, Sam, Bob, Mark, Cliff — directory keys `ray`, `adam`, `sam`, `bob`, `mark`, `cliff`) pick tasks up on heartbeat, claim by setting a lease, work to completion, and either land in `done/` (with a `report:` body) or `failed/` (with a `failed:<reason>` status). Workers can escalate back to Alice as a `decide` task; Alice either decides or parks as `waiting:user` for the user.

Full schema: `template/shared/task-envelope.md`.

## Install

From the consuming repo:

```bash
bash setup/install-multi-agent.sh
```

The install script:
1. Pulls latest from `repos/claudeclaw/local`.
2. Copies `template/skills/task/` → `.claude/skills/task/`.
3. Copies `template/shared/` → `agents/_shared/`.
4. For each known agent, ensures `agents/<name>/tasks/{open,done,failed}/` exists and creates an empty `journal.ndjson` if missing.
5. Reports what changed.

The script is idempotent — re-running it after edits just refreshes the skill and shared files.

## Phasing

- **Phase 1** (this directory): schema, examples, /task skill, install script. Done.
- **Phase 2**: runner pickup + claim/lease + status journal writes. Implemented as `repos/claudeclaw/src/multiAgent.ts` (additive module, off by default).
- **Phase 3**: Alice delegation + escalation tools + failure-rule prompt. Lives in `agents/alice/rules/`.
- **Phase 4**: Caravel "New task" form + dashboard summary widget + Files-tab links. Lives in `repos/claudeclaw/src/ui/`.

See `multi-agent/template/shared/task-envelope.md` for the full schema and `multi-agent/template/shared/task-envelope-examples/` for worked examples of each task type.

## Phase 2 — runner extension

The multi-agent runner is a polling loop inside the Caravel daemon. Default tick is 30s. Each tick:

1. Scans `agents/<name>/tasks/open/*.yaml` for tasks with `status: open`.
2. Claims the next task by setting `status: claimed`, writing `lease.holder` / `lease.expires`, and appending a journal entry.
3. Spawns the worker by calling the existing per-agent runner (`streamUserMessage` with the worker's `agentId`). The worker's CLAUDE.md and rules are loaded automatically.
4. Reads the worker's response stream for a single directive:
   - `<task-done summary="…">…body…</task-done>`
   - `<task-failed reason="budget|tool|refusal|context|dependency|crash|timeout|other" summary="…">…</task-failed>`
5. On directive: rewrites the YAML, moves the file to `tasks/done/` or `tasks/failed/`, appends a final journal entry.

### Feature flag

The runner is **off by default**. To enable, set the env var before starting the daemon:

```bash
export CLAUDECLAW_MULTI_AGENT_RUNNER=1
```

The thin caller `setup/restart-claw.sh` in the assistant repo can set this — uncomment the relevant `export` line in the wrapper if you want it on for that machine.

Optional overrides:

| Env | Default | Notes |
|---|---|---|
| `CLAUDECLAW_MULTI_AGENT_RUNNER` | `0` | `1` or `true` enables the loop |
| `CLAUDECLAW_MULTI_AGENT_AGENTS` | `alice,ray,adam,sam,bob,mark,cliff` | comma- or space-separated agent names to scan |

Per-tick cadence and concurrency are currently constants (30s, 1 active task per agent) — promote to env if needed.

### Rollback

Three levels, fastest first:

1. **Disable the flag** — set `CLAUDECLAW_MULTI_AGENT_RUNNER=0` (or unset) and restart the daemon. The new code is dormant; no behaviour change.
2. **Revert the wiring** — `git revert <phase-2-commit>` in `repos/claudeclaw`. Leaves `multiAgent.ts` in place but unwired.
3. **Hard reset** — `git -C repos/claudeclaw reset --hard multi-agent-pre-phase-2`. The `multi-agent-pre-phase-2` tag points at the last commit before the runner extension. Use only if commit history needs to be clean.

After any of the above, run `bash setup/restart-claw.sh` to bounce the daemon.

### Worker contract

For phase 2 to actually transition a task, the worker must end its response with a directive. The directive is parsed verbatim — wrong attribute names or missing attributes mean the task stays `claimed` until manually moved. Workers are expected to be primed via their CLAUDE.md / rules to emit the directive; phase 3 will formalise this for Alice's delegation flow.
