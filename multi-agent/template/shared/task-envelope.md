# Task Envelope — schema and conventions (WAL-63)

A task envelope is a YAML file that lives in `agents/<name>/tasks/{open,done,failed,waiting}/<id>.yaml`. It is the unit of orchestration for the multi-agent system: created by Kelly or by another agent, claimed by the target agent, transitioned through statuses, and ultimately archived, parked while waiting on a dependency, or escalated.

## File location

```
agents/<target-agent>/tasks/
  open/      TSK-2026-04-28-0042.yaml       # waiting to be claimed
             TSK-2026-04-28-0043.yaml       # claimed, in_progress
  waiting/   TSK-2026-04-28-0044.yaml       # parked on a dependency (auto-resumed when satisfied)
  done/      TSK-2026-04-28-0040.yaml       # completed
  failed/    TSK-2026-04-28-0039.yaml       # failed:* or escalated
  journal.ndjson                             # append-only state-transition log
```

The runner moves files between directories on status transitions; the path is the source of truth alongside the `status:` field.

## ID format

`TSK-YYYY-MM-DD-NNNN` where `NNNN` is a zero-padded counter for that day. The runner allocates the next free counter at creation time. Globally unique across all agents.

## YAML schema

```yaml
# === identity ===
id: TSK-2026-04-28-0042            # required; assigned at creation
headline: BLE plugin survey         # required; ≤10 words. The label everyone sees in lists and notifications.
created: 2026-04-28T22:30:00+12    # required ISO-8601 with offset
updated: 2026-04-28T22:30:00+12    # touched on every transition

# === routing ===
from: kelly                         # required; "kelly" or an agent name (alice, ray, sam, bob, cliff, mark, adam)
to: ray                             # required; target agent name
parent: null                        # task id this is a sub-task / reply of, or null
reply_to: alice                     # where the result lands (default: from)

# === nature ===
kind: research                      # research | code | review | summarise | decide | other
priority: P2                        # P0 (Kelly blocked) → P3 (idle)
deadline: 2026-04-30T17:00:00+12    # optional ISO-8601

# === budget — hard-enforced by runner ===
budget:
  max_turns: 30                     # hard cap on conversation turns
  max_subagents: 0                  # 0 = sequential (default); >0 requires explicit Kelly approval
  max_usd: null                     # optional dollar cap (null = unlimited within max_turns)

# === specification ===
brief: |
  Free-text statement of the objective and constraints. The "why" and the
  shape of "what". Worker reads this first. Should be specific enough that
  two workers wouldn't duplicate effort.
output_format: |
  What "done" looks like. Concrete deliverables, file paths, schemas,
  citation requirements, length limits. Empty only when the task is
  exploratory and the worker is expected to propose a format.
context:                            # references, not inlined content
  - Notes/Projects/Trakk_Collector/BT_Plugin_Research_Brief.md
  - jira:TPD-189
  - https://example.com/relevant-spec

# === state ===
status: open                        # see status table below
lease:                              # set when status moves to claimed
  holder: null                      # chat thread id that claimed it
  expires: null                     # ISO-8601; runner releases on expiry
history:                            # append-only state log; runner writes
  - ts: 2026-04-28T22:30:00+12
    from: null
    to: open
    by: kelly
    note: created via /task

# === summaries (for dashboard) ===
summary:
  brief: ""                         # ≤2 lines; worker fills on claim — restates the goal in their own words
  response: ""                      # ≤2 lines; worker fills on done/failed — restates the result
report: ""                          # path to the produced output file (set by worker via <task-done report="..."/>),
                                    # OR a block-scalar with the inline report body. Empty until the worker finishes.
```

## Status values

| Status | Meaning | File location |
|---|---|---|
| `open` | created, awaiting claim | `tasks/open/` |
| `claimed` | a worker has claimed it; not yet started | `tasks/open/` (lease set) |
| `in_progress` | worker actively running | `tasks/open/` |
| `waiting:on:user` | blocked on Kelly | `tasks/waiting/` |
| `waiting:on:task:<id>` | blocked until that task is in any agent's `done/` | `tasks/waiting/` |
| `waiting:on:agent:<name>` | blocked until that agent has any `done/` task (heuristic) | `tasks/waiting/` |
| `done` | completed; report written | `tasks/done/` |
| `failed:<reason>` | terminal failure; see Alice's failure-rule table | `tasks/failed/` |
| `escalated` | sent to Kelly with a structured decision request | `tasks/failed/` |

`<reason>` for `failed:` — one of: `budget`, `tool`, `refusal`, `context`, `crash`, `timeout`, `other`. **`failed:dependency` is no longer a valid reason** — workers blocked on a dependency must use `<task-waiting on="...">` so the runner can park and auto-resume the envelope.

## Journal format

`agents/<name>/tasks/journal.ndjson` is one JSON object per line, append-only:

```json
{"ts":"2026-04-28T22:30:00+12","id":"TSK-2026-04-28-0042","status":"open","kind":"research","from":"kelly","to":"ray","parent":null,"summary":""}
{"ts":"2026-04-28T22:35:12+12","id":"TSK-2026-04-28-0042","status":"claimed","by":"chat-1234abcd","summary":"Survey BT plugins for Capacitor coverage tracking"}
{"ts":"2026-04-28T23:42:08+12","id":"TSK-2026-04-28-0042","status":"done","summary":"Survey BT plugins for Capacitor coverage tracking","response":"5 candidates; only @capacitor-community/bluetooth-le has active maintainers and BLE central support. Recommend that one."}
```

The journal is the dashboard widget's data source. The full YAML is the click-through detail.

## Field rules

- **`headline`** — required, non-empty, **≤10 words**. The short label that appears in dashboards, notifications, and chat prompts. Should read like a Jira summary, not a sentence — *"BLE plugin survey"* not *"Please survey BLE plugins for the capacitor app"*.
- **`brief`** — required, non-empty. Free-form prose. The worker's primary instruction.
- **`output_format`** — empty allowed only for `kind: research` exploratory work. For `code` / `review` tasks, this is mandatory.
- **`context`** — list of file paths (relative to repo root), Jira keys (`jira:KEY`), or URLs. The worker reads these on claim. Inline content is not allowed — keep envelopes small.
- **`summary.brief`** / **`summary.response`** — ≤2 lines (≤180 chars each). The runner truncates if longer.
- **`history`** — never edited by the agent; the runner appends transitions.
- **`report`** — only present in the `done/` directory; can be long.

## Claim semantics

When an agent picks up a task:

1. The runner moves `<id>.yaml` keeping it in `open/` and sets:
   - `status: claimed`
   - `lease.holder: <chat-thread-id>`
   - `lease.expires: now + 30min` (default; can be overridden via `budget.lease_minutes`)
2. The agent transitions `claimed → in_progress` on its first substantive action.
3. The lease is renewed on every status update.
4. If the lease expires without a transition, the runner reverts to `open`, clears the lease, and increments a `retry_count` (max 1 before failing as `failed:timeout`).

Two heartbeats can never both claim the same task because the file move is atomic.

## Worker directives

Workers signal completion or blocking by emitting a single directive at the end of their final response. The runner parses the captured stream and acts on the directive.

```
<task-done summary="≤2 lines" report="path/to/produced/file.md">…optional inline report body…</task-done>
<task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>
<task-waiting on="task:<id>|agent:<name>|user" summary="why blocked">…optional notes…</task-waiting>
```

- `<task-done>` → file moves to `tasks/done/`, status `done`. The optional `report` attribute is the **path to a file you produced** (e.g. `Notes/Projects/X/recommendation.md`); persisted as the `report:` field on the envelope so the dashboard can link straight to your output. If you didn't produce a file, omit the attribute and put a short inline body instead.
- `<task-failed>` → file moves to `tasks/failed/`, status `failed:<reason>`. See the failure-handling rule for next steps.
- `<task-waiting>` → file moves to `tasks/waiting/`, status `waiting:on:<spec>`. The lease is released. The runner sweeps `tasks/waiting/` each tick and moves the envelope back to `tasks/open/` for re-claim once the dependency resolves.

`<task-waiting on="...">` spec types:

- `task:<id>` — resolved when `<id>.yaml` exists in any agent's `done/`
- `agent:<name>` — resolved when `<name>` has at least one task in their `done/` (heuristic — refine to "newer than this task's claim time" if needed)
- `user` — never auto-resolves; only Kelly (or Alice on his behalf) moves it back

If a worker emits no directive at all, the envelope stays `claimed` in `tasks/open/` and a human/coordinator must intervene.

## Validation

Tasks are validated by the runner on creation and on every transition. Invalid envelopes are rejected and logged but not auto-corrected.

Required fields: `id`, `headline`, `created`, `updated`, `from`, `to`, `kind`, `priority`, `budget`, `brief`, `status`, `history`, `summary`. The `headline` field is rejected if longer than 10 words.

## Examples

See `agents/_shared/task-envelope-examples/` for canonical examples of:

- `simple-research.yaml` — a one-shot research task
- `coordinator-delegation.yaml` — Alice delegating to a specialist
- `escalation-back.yaml` — a worker escalating to Alice for a decision
- `waiting-on-user.yaml` — a task parked waiting for Kelly's input
