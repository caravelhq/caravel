---
description: How worker agents return results to the runner — file-as-output contract
---

# Task output — write a file, don't shout a tag

## The contract

When you've been spawned as a worker on a task envelope, your final action MUST be to write a single file at:

```
agents/<your-name>/tasks/<status>/<task-id>.md
```

where `<status>` is one of `done` or `failed`. **Never `waiting`** — post-Phase-3W workers do not park; see "Waiting is gone" below.

The file is your deliverable AND your closing signal. The runner watches for it and uses its frontmatter to decide what happened. No file = no signal = the runner waits for your lease to expire and marks `failed:timeout`.

**Writing the file *is* declaring done.** The runner closes on the file appearing in a terminal bucket — `status: in_progress` in the frontmatter will not hold it open. There is no "I'll finish this later" state.

So: **never write a report with a result marked "pending", "running", or "will be appended here".** There is no later. If a measurement takes longer than your turn, either run it to completion inline (turn budgets are generous — a long-running command is one call), or write "not run" plainly and dispatch a dedicated follow-up whose sole job is to run it and publish the number. A promise in a closed report is a lost result: on WAL-90 that pattern swallowed five separate eval runs before anyone noticed.

This is the new primary contract. The old `<task-done>/<task-failed>` XML directive is still honoured as a fallback (see `task-directives.md`) but the file is what the runner trusts first.

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

## Waiting is gone — except for launched-external-work

**`status: waiting` is no longer a valid worker output for most cases (Phase 3W, WAL-72).**

- **A question for the user is a `done` report that asks it.** Use `status: done` and put the question in the body. The user's answer comes back as a follow-up dispatch.
- **A dependency is an edge declared at dispatch (`needs:`/`after:`), not a park.** If your task genuinely depends on another, the orchestrator declares that at dispatch time. You don't park mid-run.
- **`waiting:on:limits` is runner-internal infrastructure.** Workers cannot emit it. The runner handles rate-limit parking automatically.

If you emit `status: waiting` for any of the above reasons, the runner will warn-journal it and convert it to `done` so it surfaces as a report anyway. Your summary is preserved. Don't rely on this — it's a safety net, not a path.

### The one valid exception: launched external work (WAL-120)

If your task explicitly **launched a background process that outlives your turn** — a CI pipeline, a long eval, a remote queue, a detached script — you may write a `waiting` rendezvous so the runner can park and resume when the work lands:

```markdown
---
status: waiting
waiting_on: script
deadline: 2026-10-18T10:00:00.000Z
watch: "PID 12345 or agents/bob/tasks/done/TSK-...-0042.md"
summary: Launched proof script (run-proofs.mjs) — will write done/failed rendezvous when complete.
---

# Context

(Describe what was launched, how to inspect it by hand, and what the expected outcome is.)
```

| Field | Required | Meaning |
|---|---|---|
| `status: waiting` | yes | tells the runner to park |
| `waiting_on: script` | yes | reason family (`script` is the only registered family today) |
| `deadline:` | yes | absolute ISO timestamp — runner fails the task with `failed:timeout` if no terminal file appears by then |
| `watch:` | no | human-readable descriptor of what to watch (PID, path, URL) |
| `summary:` | yes | one-line description shown in dashboard and chat |

**Use the `task-callback` skill rather than hand-rolling this.** `.claude/skills/task-callback/` provides the contract plus a bootstrapped wrapper in both Node and Python:

```bash
node .claude/skills/task-callback/script/callback.mjs wrap \
  --task <id> --agent <you> --deadline-mins 90 \
  --summary "Launched X; will report on completion" -- <your command>
```

One command writes the park record, launches the work detached, and writes the `done`/`failed` rendezvous when it exits. It also validates the task id and agent against the real envelope, which is the most common way this goes wrong.

**When the external work finishes, write a `done` or `failed` rendezvous** at `agents/<you>/tasks/done/<id>.md` or `agents/<you>/tasks/failed/<id>.md`. The runner's sweep loop picks it up on the next tick and transitions the envelope.

**Rules:**
- The `deadline:` must be honest and tight enough that a wedged park is visible within a reasonable window.
- The runner does not resurrect a task after `failed:timeout` even if the rendezvous arrives late — it logs a loud warning and leaves the task failed.
- Use this ONLY when the work genuinely cannot finish inline. A long-running command is not a valid reason — commands can run to completion in a single tool call.

## Where to write the file

Always:

- Path: `agents/<your-name>/tasks/<status>/<task-id>.md` where `<status>` is `done` or `failed`.
- Directory: pre-created for you (the runner ensures `done/` and `failed/` exist).
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
2. **Does the frontmatter have `status:` and `summary:`?** Required for both statuses.
3. **If failed, did I pick a real `reason:` from the allowed list?** Use `other` if nothing fits.
4. **Am I about to write `status: waiting`?** Only valid if you launched external work that genuinely outlives your turn — see "launched-external-work" above. For questions, dependencies, or anything else: turn it into a done report.
5. **Is the body the actual deliverable, or did I `report_path:` to it?** Don't leave the body empty AND omit `report_path:` — at minimum, write a sentence.

## What the runner does next

After your worker session ends, the runner:

1. Looks for `agents/<you>/tasks/{done,failed}/<id>.md`.
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
