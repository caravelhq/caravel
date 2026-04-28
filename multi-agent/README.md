# multi-agent — orchestration scaffold (WAL-63)

Canonical source for the multi-agent task envelope system: schema, examples, the `/task` skill that Vesper uses to formulate envelopes, and the helper script that allocates IDs and writes files.

This directory is the *source of truth*. The live instance is populated by `setup/install-multi-agent.sh` in the consuming repo (the assistant repo for Kelly's setup), which copies files from `template/` into `.claude/skills/task/` and `agents/_shared/`, and creates per-agent `tasks/{open,done,failed}/` directories with empty `journal.ndjson` files.

## Layout

```
multi-agent/
  README.md                              # this file
  template/
    skill-task/                          # → .claude/skills/task/
      SKILL.md                           #   procedure Vesper follows for /task
      script/
        task.mjs                         #   ID allocator + dispatcher (also serves list/summary)
    shared/                              # → agents/_shared/
      task-envelope.md                   #   canonical schema spec
      task-envelope-examples/
        simple-research.yaml             #   Kelly → researcher
        coordinator-delegation.yaml      #   vesper → strategist (post-research)
        escalation-back.yaml             #   researcher → vesper (decision needed)
        waiting-on-user.yaml             #   vesper parking on Kelly
```

## Concept

Each agent has a `tasks/` directory with three buckets — `open/`, `done/`, `failed/` — and an append-only `journal.ndjson` index. A task is a YAML file. The runner moves files between buckets on status transitions; the path is always consistent with the `status:` field.

Vesper is the coordinator. Kelly invokes `/task` (or asks in plain language) to dispatch work. The skill formulates the envelope and the helper script writes it to the target's `tasks/open/`.

Workers (researcher, advisor, strategist, builder, marketing, reviewer) pick tasks up on heartbeat, claim by setting a lease, work to completion, and either land in `done/` (with a `report:` body) or `failed/` (with a `failed:<reason>` status). Workers can escalate back to Vesper as a `decide` task; Vesper either decides or parks as `waiting:user` for Kelly.

Full schema: `template/shared/task-envelope.md`.

## Install

From the consuming repo:

```bash
bash setup/install-multi-agent.sh
```

The install script:
1. Pulls latest from `repos/claudeclaw/local`.
2. Copies `template/skill-task/` → `.claude/skills/task/`.
3. Copies `template/shared/` → `agents/_shared/`.
4. For each known agent, ensures `agents/<name>/tasks/{open,done,failed}/` exists and creates an empty `journal.ndjson` if missing.
5. Reports what changed.

The script is idempotent — re-running it after edits just refreshes the skill and shared files.

## Phasing

- **Phase 1** (this directory): schema, examples, /task skill, install script. Done.
- **Phase 2**: runner pickup + claim/lease + status journal writes. Lives in `repos/claudeclaw/src/runner.ts` extensions, not here.
- **Phase 3**: Vesper delegation + escalation tools + failure-rule prompt. Lives in `agents/vesper/rules/` and `agents/vesper/skills/`.
- **Phase 4**: ClaudeClaw "New task" form + dashboard summary widget + Files-tab links. Lives in `repos/claudeclaw/src/ui/`.

See `Notes/Projects/ClaudeClaw/Multi-Agent-Orchestration-Design-Review.md` in the assistant repo for the design rationale.
