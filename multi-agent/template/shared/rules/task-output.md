---
description: How worker agents return results to the runner — file-as-output contract
---

# Task output — write a file, don't shout a tag

## The contract

When you've been spawned as a worker on a task envelope, your final action MUST be to write a single file at:

```
agents/<your-name>/tasks/<status>/<task-id>.md
```

where `<status>` is one of `done`, `failed`, or `waiting`.

The file is your deliverable AND your closing signal. The runner watches for it and uses its frontmatter to decide what happened. No file = no signal = the runner waits for your lease to expire and marks `failed:timeout`.

This is the new primary contract. The old `<task-done>/<task-failed>/<task-waiting>` XML directive is still honoured as a fallback (see `task-directives.md`) but the file is what the runner trusts first.

## Why a file beats a tag

A tag is a magic string fished out of a possibly-truncated prose stream. If your final response runs past the model's output cap, the closing tag gets cut off — the runner sees no directive and synthesises `failed:other` even though your work is on disk. Three months of `failed:other` envelopes in the journal trace back to this single failure mode.

A file is atomic. Either it's there or it isn't. It can't be half-written by the model. It survives turn truncation. The body of the file IS the report — no duplication between "summary" and "actual content".

## File format

YAML frontmatter, then a markdown body. The frontmatter carries machine-readable status; the body is your writeup.

### Done

```markdown
---
status: done
summary: One-line restatement of what you produced and where it landed.
report_path: optional/path/to/separate/deliverable.md  # omit if the body IS the deliverable
---

# Task report

(Your full writeup. This file IS the report unless `report_path` points elsewhere.)
```

`summary` is what surfaces in the dashboard, the chat status notification, and the parent orchestrator's brief. Keep it to one line.

`report_path` is optional. Use it when your real deliverable lives somewhere else (an FDP in `repos/dev/features/`, a code change on a branch, a research brief in a project folder). The dashboard deep-links to it.

### Failed

```markdown
---
status: failed
reason: budget | tool | refusal | context | crash | timeout | other
summary: One-line explanation of what blocked you.
---

(Optional: longer explanation of what was attempted, what tooling failed, what the model refused on.)
```

`reason` must be one of the listed values. The runner uses it to pick the failure-handling rule (see `failure-handling.md` in Alice's directory). Don't invent reasons; if nothing fits, use `other` and explain in the summary.

**Never `failed:dependency`** — that's a worker bug. If you need another task's output, use `waiting` instead.

### Waiting

```markdown
---
status: waiting
waiting_on: task:TSK-2026-05-04-0050 | agent:bob | user
summary: One-line statement of what you're waiting on and why.
---

(Optional: notes about what to do once the dependency clears.)
```

The lease releases. The runner re-claims your envelope automatically when the dependency resolves (the awaited task lands in `done/`, the agent has any output, or — for `user` — when Alice picks it up).

## Where to write the file

Always:

- Path: `agents/<your-name>/tasks/<status>/<task-id>.md`
- Directory: pre-created for you (the runner ensures `done/`, `failed/`, `waiting/` exist).
- Use the `Write` tool. One write call. Don't append, don't edit-after-the-fact, don't use Bash to move files.
- Filename = task id with `.md` extension (e.g. `TSK-2026-05-04-0042.md` or `TSK-2026-05-04-0042.1.md`).

Do this AS THE LAST THING IN YOUR TURN. The runner reads the file once your session ends. Earlier writes are fine but the contents at session-end is what counts.

## The original envelope

The original envelope at `agents/<you>/tasks/open/<task-id>.yaml` keeps its YAML format. The runner moves it to the matching bucket once it sees your `.md` report. Don't touch the YAML envelope yourself.

After completion the bucket directory holds two files for the task:

```
agents/<you>/tasks/done/TSK-...-0042.yaml   # envelope, runner-managed
agents/<you>/tasks/done/TSK-...-0042.md     # your report, you wrote this
```

## Procedural checklist

Before you stop typing, ask yourself:

1. **Did I write `agents/<me>/tasks/<status>/<id>.md`?** Use the Write tool. Don't print it to the chat — write the file.
2. **Does the frontmatter have `status:` and `summary:`?** Required for all three statuses.
3. **If failed, did I pick a real `reason:` from the allowed list?** Not `dependency` — that's `waiting`.
4. **If waiting, did I include `waiting_on:`?** With the right `task:` / `agent:` / `user:` form.
5. **Is the body the actual deliverable, or did I `report_path:` to it?** Don't leave the body empty AND omit `report_path:` — at minimum, write a sentence.

## What the runner does next

After your worker session ends, the runner:

1. Looks for `agents/<you>/tasks/{done,failed,waiting}/<id>.md`.
2. If found: reads the frontmatter, sets the envelope status accordingly, moves the `.yaml` to the matching bucket, posts the chat status notification (if dispatched from a chat), enqueues an Alice continuation (if Alice was the dispatcher).
3. If not found: falls back to scanning your final response for an XML directive (legacy path).
4. If neither found: marks the envelope `failed:other` with summary "no output file or directive — worker session ended without producing a result".

The file path is the canonical signal. Make sure you write it.

## Where this applies

- **Every spawned worker turn** — when you've been claimed from `tasks/open/` or invoked as a continuation from your own queue.
- **Both first-time work and revisions** — a revision is still a worker turn.
- **Both successful and failed work** — closing a failure correctly is just as important as closing a success.

## Where it doesn't apply

- **Live chat with the user** — you're not a spawned worker; no envelope to close. Talk normally.
- **Your own internal scratch / scripts** — only the worker's final state matters.
