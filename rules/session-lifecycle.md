---
description: Rules for session start, sync, and end-of-day workflows
---

# Session lifecycle rules

Pairs with the `start`, `sync`, and `end` skills. Adapt the tracker and paths to your workspace.

## Session start
1. Pull and merge branches per your git conventions.
2. Read `memory/MEMORY.md` to load persistent context.
3. **Check the multi-agent runner daemon** (if you run one). Verify it's alive (its pid file + listening port). If it's down, remind the user to start it. If healthy, say nothing.
4. Present the startup checklist (which prompts the user to run `/start`).

## During /start
The `/start` skill handles: reading context, syncing the tracker to the task board, and a morning briefing.
- Read memory files relevant to the daily briefing (user profile, active projects, feedback).
- Use memory to personalise the briefing — don't ask questions you already know the answer to.
- Includes a **tracker sync step** — pull open and recently-closed tickets, reconcile the task board, and flag any changes made directly in the tracker.

## During /sync
The `/sync` skill handles: processing notes/emails/meetings, creating tickets, and updating the task board.
- Includes a **tracker sync step** — pull current state, reconcile the board, then add new tasks (creating tickets for actionable items).

## During /end
The `/end` skill handles: catching stragglers, closing the daily note, and persisting context.
- Includes a **tracker sync step** — transition completed tasks to Done, pull current state, reconcile the board, verify all tasks have tickets.
- Identify anything learned during the session that should persist and save/update memory files.

## Key principle
The issue tracker is the permanent record. The task board is the working view. `/start`, `/sync`, and `/end` each include a tracker-sync step to keep the two aligned.
