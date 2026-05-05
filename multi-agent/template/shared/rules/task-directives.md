---
description: Legacy — XML directive as fallback signal. The primary contract is now `task-output.md` (write a file).
---

# Task directives — fallback signal (legacy)

> **NOTE (2026-05-04):** The primary contract is now `task-output.md` — write `agents/<you>/tasks/<status>/<id>.md` with frontmatter. The XML directive described below is the **fallback** signal the runner uses when no report file is found. Workers can still emit a directive (and probably should during the transition), but the file is what the runner trusts first. New worker prompts should optimise for the file write; the directive becomes a defence-in-depth marker.

## The rule (legacy form)

**When you've been spawned as a worker on a task envelope, your reply may end with one of these directives:**

```
<task-done summary="..." report="path/to/file">…optional inline body…</task-done>
<task-failed reason="budget|tool|refusal|context|crash|timeout|other" summary="…">…</task-failed>
<task-waiting on="task:<id>|agent:<name>|user" summary="why blocked">…optional notes…</task-waiting>
```

No directive AND no report file = the runner has no idea what happened. It marks `failed:other` and the envelope ends up in `tasks/failed/` even when your deliverable shipped fine to disk. This has bitten Bob (TSK-2026-05-04-0003), Mark (TSK-2026-05-03-0008), and Alice's continuation (TSK-2026-05-04-0006). The file-as-output contract was introduced precisely to break this pattern.

## Why this matters

The runner can't read your mind. It can only read your final message. The closing directive is the **single signal** that:

1. Tells the runner which folder to move the envelope to (`done/`, `failed/`, `waiting/`).
2. Sets the `status:` field other agents (and the dashboard) read.
3. Populates `summary.response` so the parent orchestrator knows what happened.
4. Records `report:` so the dashboard can deep-link to your output.
5. Releases the lease so other workers/runs aren't blocked.

Silence breaks all five. The deliverable on disk doesn't matter if the envelope says "claimed" forever.

## Choosing the right directive

**`<task-done>` — you finished the work.**
- Required: `summary="..."` (≤2 lines, what you produced and where it landed).
- Strongly recommended: `report="path/to/produced/file.md"` if you wrote a file. The dashboard links straight to it.
- Optional inline body for short results that don't deserve a file.
- Even if the work was trivial — *especially* if it was trivial — say done.

**`<task-failed reason="…" summary="…">` — you genuinely couldn't complete the task.**
- `reason` must be one of: `budget`, `tool`, `refusal`, `context`, `crash`, `timeout`, `other`.
- **Never `failed:dependency`** — that's a worker bug. Use `<task-waiting on="…">` instead.
- `summary` should explain what blocked you so the coordinator can re-route or escalate.
- Use this when you tried and the work can't be done in this attempt — not when you forgot to close.

**`<task-waiting on="…" summary="…">` — you need something before you can continue.**
- `on="task:TSK-XYZ"` — you've dispatched a sub-task and need its result.
- `on="agent:bob"` — you need a specific agent to finish their current work.
- `on="user"` — you need Kelly's input to proceed.
- The lease releases. The runner re-claims when the dependency resolves.

## Procedural checklist (run this before you stop typing)

Before ending any worker turn, ask:

1. **Did I produce the deliverable?** Wrote a file, made the change, sent the message — yes or no?
2. **Where did it land?** Path, branch, ticket. Have it ready for `report=` and `summary=`.
3. **Am I genuinely blocked, or did I just finish?** If finished → `<task-done>`. If blocked → `<task-waiting>` (not failed). If actually failed → `<task-failed>`.
4. **Did I write the closing directive in my final message?** Check before submitting. The runner reads the last message of your turn.

## Common slip patterns to watch for

- **"I'll just summarise what I did and that's enough."** No. The summary IS the directive — wrap it in `<task-done summary="…">`.
- **Writing the deliverable file, then ending with prose.** The runner won't infer success from a `git diff`. Close the envelope.
- **Continuation envelopes feel different — they're not.** A continuation envelope is still a worker turn. Same rules. Decide → emit one of the three directives.
- **Long reasoning chains that trail off.** If your turn ran long and you're worried about budget, that's exactly when to be deliberate about closing. `<task-failed reason="budget" summary="…">` is honest. Silence is worse.
- **Hand-off vs. blocking.** If you're handing the next step to a human or another agent and your work is done, that's `<task-done>`, not `<task-waiting on="user">`. Only use waiting when you genuinely cannot proceed without input.

## Where this applies

- **Every spawned worker turn.** Whether you were claimed by the multi-agent runner from `tasks/open/` or invoked as a continuation receiver from your own queue.
- **Both first-time work and revisions.** "Bob revising the FDP" is still a worker turn — close it.
- **Both successful and failed work.** Closing a failure correctly is just as important as closing a success.

## Where it doesn't apply

- **Live chat with Kelly** — you're not a spawned worker; no envelope to close. Talk normally.
- **Your own internal scratch / scripts you run between worker turns** — only the worker reply needs the directive.
- **Tool output and shell commands** — directives go in the assistant's text reply, not in tool blocks.

## If you forgot to close (post-mortem only)

If you discover later that you forgot to close a turn, the recovery is manual: edit the envelope's `status:`, append a `history:` entry noting the recovery, set `summary.response` and `report`, then move the file from `open/` (or `failed/`) into `done/`. Don't pretend it didn't happen — the journal entry helps the team see how often this still happens and decide whether to harden the runner.
