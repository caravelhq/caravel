---
name: sync
description: Process loose notes, meeting transcripts, and update the task board and daily note.
disable-model-invocation: true
---

## Assumed workspace layout

- `Notes/TaskBoard.md` — the active task board
- `Notes/Daily/YYYY-MM-DD.md` — daily notes, one file per day
- `Notes/Scratch.md` — scratch pad for loose notes and imported reference material
- `Notes/Meetings/` — meeting transcripts (one file per meeting)
- `Notes/Projects/` — project-specific reference notes and working documents
- `memory/MEMORY.md` — persistent memory across sessions

Issue tracker: substitute your project keys wherever `OPS` (operational/admin) or `PROJ` (product/project) appear. The `jira` skill provides the REST client.

---

You are my executive assistant. I'm handing you a pile of loose notes — file everything properly. Be quiet about your process; just show me a short summary of what you did at the end.

## Steps

### First
- Pull data from git — it is likely that changes have been made remotely.

### 1. Process the Scratch Pad
- Read `Notes/Scratch.md`.
- If it has content beyond the template header, assess the content depth:
  - **Brief dot points / short items:** Extract action items, file reference material to the daily note, and clear.
  - **Extensive content (paragraphs, detailed reasoning, vision notes, context):** File the original content to an appropriate location *before* clearing:
    - Working session notes / conversation records → `Notes/Meetings/YYYY-MM-DD-topicName.md`
    - Project-specific detailed notes → relevant file in `Notes/Projects/`
    - Create a memory entry pointing to the filed content so it's referenced when working on related tasks.
  - Don't discard detailed notes — the original phrasing and context matters for future reference.
- Then extract and categorise:
  - **Reference material** — append to the relevant section of today's daily note.
  - **Action items / to-dos** — collect these for the TaskBoard update (step 5).
  - **Meeting-related notes** — file under the appropriate meeting note if one exists, otherwise attach to today's daily note.
- If the Scratch Pad is empty, skip this step.

### 2. Check daily notes for late updates
- Read today's daily note (`Notes/Daily/YYYY-MM-DD.md`) and yesterday's.
- Look at the top section (above any `### Sync` or `### End of Day` entries) for new or modified TODO/DONE items that haven't been reflected in the TaskBoard or memory yet.
- If there are new TODOs, add them to the TaskBoard in step 5.
- If there are new DONEs, note them for the sync summary.
- Update memory if anything changes context for upcoming work.

### 3. Process Meeting Transcripts
- List files in `Notes/Meetings/`.
- For each file that does **not** already start with a `## Summary` section:
  - Read the transcript.
  - Write a concise summary (3–5 bullets) and list any action items.
  - Prepend a `## Summary` and `## Action Items` section to the top of that file (keep the original transcript intact below).
  - Collect any action items for the TaskBoard update.

### 4. Comment on existing tracker tickets
Review all content processed in steps 1–3 (scratch pad entries, daily note updates, meeting summaries, action items). For each piece of information clearly relevant to an existing tracker ticket:
- Add a comment to that ticket summarising the new information:
  `bash skills/jira/script/jira_rest.sh comment <KEY> "<summary of the new info>"`
- Examples of what warrants a comment:
  - Meeting notes that discussed an existing ticket's topic
  - New context, decisions, or findings related to an open task
  - Progress updates referencing a ticket
  - A follow-up action that is clearly a continuation of an existing ticket
- For **follow-on tasks** that are clearly a continuation of an existing ticket (not a genuinely new piece of work), do **not** create a new ticket. Instead:
  - Add a comment to the existing ticket describing the next step or updated scope.
  - Update the ticket summary if the focus has shifted:
    `bash skills/jira/script/jira_rest.sh edit <KEY> --summary "Updated summary"`
  - This preserves the history and avoids duplicate tickets.
- Keep comments concise — a few sentences, not a wall of text.

### 5. Update the TaskBoard (with tracker sync)
- Read `Notes/TaskBoard.md`.
- Pull current tracker state to catch any changes made directly since the last sync:
  - `bash skills/jira/script/jira_rest.sh search 'project = OPS AND status not in (Done, Closed) ORDER BY updated DESC'`
  - `bash skills/jira/script/jira_rest.sh search 'project in (OPS, PROJ) AND status in (Done, Closed) AND updated >= -1d ORDER BY updated DESC'`
- Reconcile: mark board items as `[x]` if Done/Closed, update status groupings, add any missing tickets.
- For each **genuinely new** task identified in steps 1–3 (not a follow-on for an existing ticket), determine whether it is:
  - **Product / project work** (feature, bug, spike, technical work) → leave for manual ticket creation or note under `## Other`
  - **Administrative / operational** (business ops, follow-ups, internal tasks) → create a ticket in your tracker:
    `bash skills/jira/script/jira_rest.sh create OPS Task <summary>`
    and add it to the TaskBoard under the appropriate section.
- If a task already has a tracker ID (OPS or PROJ), use that as the Task ID.
- For tasks that don't warrant a tracker ticket (one-off or trivial items), use a two-character alpha prefix with three numbers (e.g. `TA001`). Infer the prefix from context or ask.
- Add new items using the format `- [ ] <ID> — task description`.

### 6. Update Today's Daily Note
- Open or create `Notes/Daily/YYYY-MM-DD.md` (use the current date).
- Append a timestamped sync entry summarising what was processed, e.g.:
  ```
  ### Sync — HH:MM
  - Processed scratch pad: [brief description of what was filed]
  - Daily notes: [new items picked up, or "no changes"]
  - Processed meeting transcript: [filename] — [one-line summary]
  - Added N new tasks to the board
  ```
- Keep any existing content in the daily note intact.

### 7. Clear the Scratch Pad
- Replace the contents of `Notes/Scratch.md` with just the template header:
  ```

  Notes imported from other files, as reference for todays notes

  ------


  ```
- Only do this **after** all content has been filed elsewhere.

### 8. Report back
Show a short summary:

**Sync complete.**
- Scratch pad: [what was processed, or "empty — nothing to process"]
- Meetings: [files processed, or "no new transcripts"]
- Tracker comments added: [list of tickets commented on, or "none"]
- New tasks added: [count, or "none"]
- Daily note: updated
