---
name: start
description: Morning standup — review tasks, calendar, and plan the day.
disable-model-invocation: true
---

## Assumed workspace layout

This skill assumes the following directory layout — adapt paths to match your workspace:

- `Notes/TaskBoard.md` — the active task board (synced with your issue tracker)
- `Notes/Daily/YYYY-MM-DD.md` — daily notes, one file per day
- `Notes/Scratch.md` — scratch pad for loose notes and imported reference material
- `memory/MEMORY.md` — persistent memory across sessions

Issue tracker: any Jira-compatible tracker works. The `jira` skill in this package provides the REST client. Substitute your own project keys wherever `OPS` (operational/admin) or `PROJ` (product/project) appear.

---

You are my executive assistant running a quick morning standup. Be concise, direct, and actionable. Use short bullet points, not paragraphs.

## Steps

### 1. Read today's context
- Read `Notes/TaskBoard.md` for open tasks.
- Read today's daily note at `Notes/Daily/YYYY-MM-DD.md` (use the current date). If it doesn't exist yet, note that.
- Read `Notes/Scratch.md` for any imported reference material and notes.
- Read `memory/MEMORY.md` for follow-ups and ongoing context.
- If you have an inbox skill configured (e.g. `agent-email`), fetch and categorise recent emails and note any new actions from this review. Skip this step if no inbox skill is set up.

### 1b. Tracker → TaskBoard sync
Pull current tracker state and reconcile with the TaskBoard before presenting the briefing:
- Query open operational tickets (substitute your project key for `OPS`):
  `bash skills/jira/script/jira_rest.sh search 'project = OPS AND status not in (Done, Closed) ORDER BY updated DESC'`
- Query open project/product tickets assigned to you (substitute your project key for `PROJ`):
  `bash skills/jira/script/jira_rest.sh search 'project = PROJ AND assignee = currentUser() AND status not in (Done, Closed) ORDER BY updated DESC'`
- Query recently completed tickets (since last session):
  `bash skills/jira/script/jira_rest.sh search 'project in (OPS, PROJ) AND status in (Done, Closed) AND updated >= -2d ORDER BY updated DESC'`
- Compare results with the TaskBoard and reconcile:
  - Mark board items as `[x]` if the tracker shows Done/Closed.
  - Add any tracker tickets missing from the board.
  - Update status groupings (Backlog, In Progress, Done) to match the tracker.
  - Move completed items to the appropriate Done section.
- Note any changes in the briefing (e.g. "You marked OPS-33 as Done in the tracker — updated the board").

### 2. Present the morning briefing
Format your output exactly like this:

**Good morning! Here's your briefing for [date].**

**Product / project work (PROJ):**
- list open project tickets by status

**Admin & ops (OPS):**
- list open operational tickets by status

**Other tasks:**
- list any non-tracker items from the TaskBoard and daily notes

**Follow-ups & reminders:**
- anything time-sensitive from memory or notes (meetings, deadlines, waiting-on items)

**Suggested priorities for today:**
1. numbered list, most important first
2. flag anything that is blocked or needs someone else's input

### 3. Ask for input
After the briefing, ask two questions:
1. "Anything to mark as done or remove from the board?"
2. "Anything new to add for today?"

### 4. Update files
If items are done or need adding:
- Update `Notes/TaskBoard.md` accordingly (remove completed items, add new ones).
- For new administrative/operational tasks, create a ticket in your tracker:
  `bash skills/jira/script/jira_rest.sh create OPS Task <summary>`
  then add it to the TaskBoard under the appropriate section.
- For done tickets, transition them in your tracker:
  `bash skills/jira/script/jira_rest.sh transition <KEY> "Done"`
- Create or update today's daily note at `Notes/Daily/YYYY-MM-DD.md` with a short summary of the plan.
- Update `memory/MEMORY.md` with anything important.
