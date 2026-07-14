---
name: task
description: Formulate a multi-agent task envelope and dispatch it to the right agent's tasks/open/. Use when the user says "/task", asks Alice to "delegate", "send to Ray", "ask Sam", or describes work that should run in another agent's queue rather than this chat. Also use when an in-progress chat needs to spawn a follow-up task for another agent.
---

# /task — formulate and dispatch a multi-agent task

Alice is the coordinator. The user invokes `/task` (or asks in plain language) to push work onto another agent's queue rather than doing it inline. This skill turns a rough request into a well-formed YAML envelope on disk.

The full schema lives at `agents/_shared/task-envelope.md`. Read it once if you're unsure about a field. Examples live in `agents/_shared/task-envelope-examples/`.

## When to use

Trigger when the user:
- Types `/task` (with or without args).
- Says "send this to Ray", "have Sam look at this", "queue this for Bob", etc.
- Describes work that's bigger than a single chat turn and could run while the user does something else.

Don't trigger when:
- the user wants the answer **now in this chat** — just answer.
- It's a casual question, decision, or note that doesn't need delegation.
- Alice is already mid-task and the user is steering — keep working, don't spawn.

## Procedure

### 1. Capture intent

Read what the user asked. If it's vague (`/task` with no body, or "ask Ray about X"), ask **one consolidated clarifying question** covering anything missing. Don't pepper the user with five questions in a row.

The fields you need:

- **headline** — ≤10 words, required. The label that appears in dashboards, notifications, and chat prompts. Read like a Jira summary, not a sentence. *"BLE plugin survey"* not *"Please survey BLE plugins for the capacitor app"*. The CLI rejects empty or over-length headlines.
- **target agent** — one of `ray` (Researcher), `sam` (Strategist), `bob` (Builder), `mark` (Marketing), `cliff` (Reviewer), `adam` (Advisor), or `alice` (Coordinator — i.e. self). If the user named one, use it. Otherwise infer from the work:
  - factual / web research → `ray`
  - synthesis, recommendations, decision memos → `sam`
  - code or implementation → `bob`
  - content / copy / marketing → `mark`
  - PR review, code-quality pass → `cliff`
  - tradeoffs, "what should I do" advice → `adam`
  - coordination / triage / cross-agent routing → `alice`
- **kind** — `research | code | review | summarise | decide | other`.
- **brief** — the *why* and the shape of *what*. Specific enough that two workers wouldn't duplicate effort. Free-form prose, multi-line.
- **output_format** — what "done" looks like. Required for `code` / `review` / `summarise`. Optional for exploratory `research`.
- **context** — file paths (relative to repo root), Jira keys (`jira:KEY`), or URLs. References, not inlined content.
- **priority** — P0 (the user blocked) → P3 (idle). Default P2.
- **deadline** — optional ISO-8601. Add when there's a real constraint.
- **budget** — `max_turns` (default 30 for research, 50 for code, 10 for decide), `max_subagents` (default 0 — sequential), `max_usd` (default null).
- **parent** — set if this is a sub-task of an existing task envelope. Otherwise null. **Setting `parent` triggers decimal sub-task IDs** — the dispatched envelope gets `<parent>.N` (e.g. `TSK-2026-05-04-0042.1`) instead of a fresh top-level id. Recursive: a sub-of-sub becomes `<parent>.M.K`.
- **reply_to** — where the result lands. Default to `from`. Override when Alice is delegating and wants results back to herself, not to the user.

If the user's `/task` body already includes everything (a long, specific brief), skip the clarifying question and go straight to draft.

### 2. Draft the envelope

Write a YAML file to a temp path (e.g. `/tmp/task-draft.yaml`). Use the schema in `agents/_shared/task-envelope.md`. Set `id`, `created`, `updated`, `status`, `lease`, `history` to placeholders — the helper script overwrites them.

Skeleton:

```yaml
id: PLACEHOLDER
headline: <≤10-word summary>       # required; appears in lists, notifications, chat prompts
created: PLACEHOLDER
updated: PLACEHOLDER

from: alice                        # or "user" if the user is the source
to: <target>
parent: null                       # or parent task id (triggers decimal sub-id)
reply_to: user                     # or "alice"

kind: <research|code|review|summarise|decide|other>
priority: P2
deadline: null                     # or ISO-8601

budget:
  max_turns: 30
  max_subagents: 0
  max_usd: null

brief: |
  <multi-line brief>

output_format: |
  <what done looks like>

context:
  - path/to/file.md
  - jira:WAL-XX

status: open
lease:
  holder: null
  expires: null
history: []

summary:
  brief: ""
  response: ""
report: ""
```

### 3. Dispatch

Call the helper script. It assigns the next ID for today (decimal sub-id if `parent:` is set, top-level otherwise), writes to the target's `tasks/open/<id>.yaml`, and appends to that agent's `tasks/journal.ndjson`.

```
node .claude/skills/task/script/task.mjs new --target <target> --yaml /tmp/task-draft.yaml
```

The script prints the assigned task ID to stdout. Capture it.

You can also override the parent on the CLI without rewriting the YAML:

```
node .claude/skills/task/script/task.mjs new --target ray --yaml /tmp/draft.yaml --parent TSK-2026-05-04-0042
```

### 4. Confirm to the user

Reply with:
- The assigned task ID.
- The target agent.
- A 1-line summary of what was queued.
- Anything that's still unclear (only if it genuinely matters — don't manufacture concerns).

Format: short. One paragraph or a tight bulleted line. No ceremony.

Example (top-level):

> Queued **TSK-2026-04-28-0042** for Ray — survey of BLE central plugins for Capacitor, output as a markdown table with maintenance signals. Should pick up on next heartbeat.

Example (sub-task of an existing envelope):

> Queued **TSK-2026-05-04-0042.1** for Bob — implement the routing rule Sam recommended in 0042. Parent stays open until this returns.

## Failure modes

- **Target agent doesn't exist** — the helper script rejects unknown agents. Names: `alice`, `ray`, `sam`, `bob`, `cliff`, `mark`, `adam`. Ask the user to pick one.
- **Brief is one sentence** — push back. Either flesh it out with a clarifying question or refuse to dispatch ("this is too thin to delegate; tell me more about..."). A bad brief produces a bad result and burns turns.
- **`/task` with empty body** — don't guess. Ask the user what work to dispatch.
- **`max_subagents > 0`** — flag explicitly. Parallel sub-agents 5–15× the token spend. Confirm before dispatching.

## Helpful commands

```
# what's the next top-level ID for an agent?
node .claude/skills/task/script/task.mjs next-id --target ray

# what's the next sub-task ID under a given parent?
node .claude/skills/task/script/task.mjs next-id --target ray --parent TSK-2026-05-04-0042

# list a single agent's tasks
node .claude/skills/task/script/task.mjs list --agent ray --status open

# cross-agent summary (counts + escalations + waiting:user)
node .claude/skills/task/script/task.mjs summary
```

The summary now reports five buckets: `open`, `waiting`, `done`, `failed`, `archived`. Tasks older than the daemon's archive threshold (default 7 days, configurable via `CLAUDECLAW_MULTI_AGENT_ARCHIVE_DAYS`) get swept from done/failed/waiting into `tasks/archived/` flat. Archived envelopes still count for ID-collision avoidance, so retired IDs are never reused.

## Notes for Alice

- This skill creates the envelope. The runner picks it up on a heartbeat and the worker agent claims it. the user may or may not see the result land back in his inbox depending on `reply_to`.
- If a worker escalates back to Alice (status `escalated`, target `alice`), it'll surface as a `tasks/open/` entry in Alice's queue. Handle it like any other inbound task: read, decide, either answer or escalate to the user via a `<task-waiting on="user">` directive.
- Always restate the brief tightly in your confirmation message. If you can't restate it, you didn't understand it well enough to dispatch — go back to step 1.

## Worker directives — what your tasks should produce

Whatever workflow you brief the worker, the runner expects exactly one of these at the end of the worker's final turn:

```
<task-done summary="…">…optional report…</task-done>
<task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>
<task-waiting on="task:<id>|agent:<name>|user" summary="why blocked">…</task-waiting>
```

When dispatching a task whose worker is *expected* to depend on another task's output (e.g. Mark needs Ray's survey), include that explicitly in the brief: "If `<file>` doesn't exist or is incomplete, end your response with `<task-waiting on=\"task:TSK-...\">`. Do NOT use `<task-failed reason=\"dependency\">`." The runner parks waiting envelopes and re-emits them automatically when the dependency clears.
