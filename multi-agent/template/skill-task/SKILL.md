---
name: task
description: Formulate a multi-agent task envelope and dispatch it to the right agent's tasks/open/. Use when Kelly says "/task", asks Vesper to "delegate", "send to researcher", "ask the strategist", or describes work that should run in another agent's queue rather than this chat. Also use when an in-progress chat needs to spawn a follow-up task for another agent.
---

# /task — formulate and dispatch a multi-agent task

Vesper is the coordinator. Kelly invokes `/task` (or asks in plain language) to push work onto another agent's queue rather than doing it inline. This skill turns a rough request into a well-formed YAML envelope on disk.

The full schema lives at `agents/_shared/task-envelope.md`. Read it once if you're unsure about a field. Examples live in `agents/_shared/task-envelope-examples/`.

## When to use

Trigger when Kelly:
- Types `/task` (with or without args).
- Says "send this to the researcher", "have the strategist look at this", "queue this for the builder", etc.
- Describes work that's bigger than a single chat turn and could run while Kelly does something else.

Don't trigger when:
- Kelly wants the answer **now in this chat** — just answer.
- It's a casual question, decision, or note that doesn't need delegation.
- Vesper is already mid-task and Kelly is steering — keep working, don't spawn.

## Procedure

### 1. Capture intent

Read what Kelly asked. If it's vague (`/task` with no body, or "ask the researcher about X"), ask **one consolidated clarifying question** covering anything missing. Don't pepper Kelly with five questions in a row.

The fields you need:

- **target agent** — `researcher`, `advisor`, `strategist`, `builder`, `marketing`, `reviewer`, or `vesper`. If Kelly named one, use it. Otherwise infer from the work:
  - factual / web research → `researcher`
  - synthesis, recommendations, decision memos → `strategist`
  - code or implementation → `builder`
  - content / copy / marketing → `marketing`
  - PR review, code-quality pass → `reviewer`
  - tradeoffs, "what should I do" advice → `advisor`
  - coordination / triage / cross-agent routing → `vesper`
- **kind** — `research | code | review | summarise | decide | other`.
- **brief** — the *why* and the shape of *what*. Specific enough that two workers wouldn't duplicate effort. Free-form prose, multi-line.
- **output_format** — what "done" looks like. Required for `code` / `review` / `summarise`. Optional for exploratory `research`.
- **context** — file paths (relative to repo root), Jira keys (`jira:KEY`), or URLs. References, not inlined content.
- **priority** — P0 (Kelly blocked) → P3 (idle). Default P2.
- **deadline** — optional ISO-8601. Add when there's a real constraint.
- **budget** — `max_turns` (default 30 for research, 50 for code, 10 for decide), `max_subagents` (default 0 — sequential), `max_usd` (default null).
- **parent** — set if this is a sub-task of an existing task envelope. Otherwise null.
- **reply_to** — where the result lands. Default to `from`. Override when Vesper is delegating and wants results back to herself, not to Kelly.

If Kelly's `/task` body already includes everything (a long, specific brief), skip the clarifying question and go straight to draft.

### 2. Draft the envelope

Write a YAML file to a temp path (e.g. `/tmp/task-draft.yaml`). Use the schema in `agents/_shared/task-envelope.md`. Set `id`, `created`, `updated`, `status`, `lease`, `history` to placeholders — the helper script overwrites them.

Skeleton:

```yaml
id: PLACEHOLDER
created: PLACEHOLDER
updated: PLACEHOLDER

from: vesper                       # or "kelly" if Kelly is the source
to: <target>
parent: null                       # or parent task id
reply_to: kelly                    # or "vesper"

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

Call the helper script. It assigns the next ID for today, writes to the target's `tasks/open/<id>.yaml`, and appends to that agent's `tasks/journal.ndjson`.

```
node .claude/skills/task/script/task.mjs new --target <target> --yaml /tmp/task-draft.yaml
```

The script prints the assigned task ID to stdout. Capture it.

### 4. Confirm to Kelly

Reply with:
- The assigned task ID.
- The target agent.
- A 1-line summary of what was queued.
- Anything that's still unclear (only if it genuinely matters — don't manufacture concerns).

Format: short. One paragraph or a tight bulleted line. No ceremony.

Example:

> Queued **TSK-2026-04-28-0042** for the researcher — survey of BLE central plugins for Capacitor, output as a markdown table with maintenance signals. Should pick up on next heartbeat.

## Failure modes

- **Target agent doesn't exist** — the helper script rejects unknown agents. Names: `vesper`, `researcher`, `advisor`, `strategist`, `builder`, `marketing`, `reviewer`. Ask Kelly to pick one.
- **Brief is one sentence** — push back. Either flesh it out with a clarifying question or refuse to dispatch ("this is too thin to delegate; tell me more about..."). A bad brief produces a bad result and burns turns.
- **`/task` with empty body** — don't guess. Ask Kelly what work to dispatch.
- **`max_subagents > 0`** — flag explicitly. Parallel sub-agents 5–15× the token spend. Confirm before dispatching.

## Helpful commands

```
# what's the next ID for an agent?
node .claude/skills/task/script/task.mjs next-id --target researcher

# list a single agent's tasks
node .claude/skills/task/script/task.mjs list --agent researcher --status open

# cross-agent summary (counts + escalations + waiting:user)
node .claude/skills/task/script/task.mjs summary
```

## Notes for Vesper

- This skill creates the envelope. The runner picks it up on a heartbeat and the worker agent claims it. Kelly may or may not see the result land back in her inbox depending on `reply_to`.
- If a worker escalates back to Vesper (status `escalated`, target `vesper`), it'll surface as a `tasks/open/` entry in Vesper's queue. Handle it like any other inbound task: read, decide, either answer or escalate to Kelly via a `waiting:user` task.
- Always restate the brief tightly in your confirmation message. If you can't restate it, you didn't understand it well enough to dispatch — go back to step 1.
