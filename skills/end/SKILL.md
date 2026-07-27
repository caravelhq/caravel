---
name: end
description: End-of-day wrap-up — process stragglers, close out the daily note, and persist context for tomorrow.
disable-model-invocation: true
---

## Assumed workspace layout

- `Notes/TaskBoard.md` — the active task board
- `Notes/Daily/YYYY-MM-DD.md` — daily notes, one file per day
- `Notes/Scratch.md` — scratch pad for loose notes
- `Notes/Meetings/` — meeting transcripts
- `memory/MEMORY.md` — persistent memory

Issue tracker: substitute your project keys wherever `OPS` or `PROJ` appear. The `jira` skill provides the REST client.

---

You are my executive assistant closing out the workday. Nothing should fall through the cracks. Be thorough but concise.

## Steps

### 1. Final sync — catch any stragglers
- Read `Notes/Scratch.md`. If there is unprocessed content, file it exactly as the `/sync` skill would: reference material to the daily note, action items to the TaskBoard, and clear.
- Check `Notes/Meetings/` for any files missing a `## Summary` section. Summarise them and extract action items, same as `/sync`.
- Clear the Scratch Pad back to its template header after processing.

### 2. Comment on existing tracker tickets
Review all content from today's daily note, any processed scratch pad or meeting notes from step 1, and any work completed during the day. For each piece of information clearly relevant to an existing tracker ticket:
- Add a comment to that ticket summarising the new information:
  `bash skills/jira/script/jira_rest.sh comment <KEY> "<summary of the new info>"`
- For **follow-on tasks** that are clearly a continuation of an existing ticket, do **not** create a new ticket. Instead:
  - Add a comment to the existing ticket describing the next step or updated scope.
  - Update the ticket summary if the focus has shifted:
    `bash skills/jira/script/jira_rest.sh edit <KEY> --summary "Updated summary"`
- Keep comments concise — a few sentences, not a wall of text.
- Do not duplicate comments already added during an earlier `/sync` in the same day.

### 3. Update the TaskBoard (with tracker sync)
- Read `Notes/TaskBoard.md`.
- Add any new to-dos discovered in step 1. For administrative/operational tasks, create tracker tickets:
  `bash skills/jira/script/jira_rest.sh create OPS Task <summary>`
  and add under the appropriate section.
- For any tasks completed during today's session that are still open in the tracker, transition them:
  `bash skills/jira/script/jira_rest.sh transition <KEY> "Done"`
- Pull current tracker state to catch any changes made directly in the tracker:
  - `bash skills/jira/script/jira_rest.sh search 'project = OPS AND status not in (Done, Closed) ORDER BY updated DESC'`
  - `bash skills/jira/script/jira_rest.sh search 'project = PROJ AND assignee = currentUser() AND status not in (Done, Closed) ORDER BY updated DESC'`
  - `bash skills/jira/script/jira_rest.sh search 'project in (OPS, PROJ) AND status in (Done, Closed) AND updated >= -1d ORDER BY updated DESC'`
- Reconcile the board: mark items as `[x]` if Done/Closed, update status groupings, add any missing tickets.
- Verify every task on the board has a corresponding tracker ticket (except items under `## Other`). Create missing tickets if needed.

### 4. Close out today's daily note
- Read today's daily note at `Notes/Daily/YYYY-MM-DD.md` (current date).
- Append an end-of-day section:
  ```
  ### End of Day
  **Completed:**
  - list items marked DONE today

  **Still open:**
  - list items still on the board or marked TODO

  **Carried forward:**
  - anything that needs attention tomorrow or later this week
  ```
- If the daily note doesn't exist yet, create it with this section.

### 5. Persist context for tomorrow
- Read `memory/MEMORY.md`.
- Update it with anything tomorrow's `/start` will need to know:
  - Follow-ups waiting on other people
  - Upcoming deadlines or meetings
  - Decisions made today that affect ongoing work
  - Items carried forward
- Remove any memory entries that are now resolved or no longer relevant.
- Keep the memory file concise — context, not a diary.

### 6. End-of-day report
Show a brief summary:

**Day closed — [date]**

**Done today:**
- bullet list

**Carrying forward:**
- bullet list

**Saved to memory for tomorrow:**
- bullet list of what was persisted

Have a good evening!
