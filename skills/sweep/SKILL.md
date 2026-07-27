---
name: sweep
description: Scan recent done-task reports, extract follow-ups, action admin tasks inline, file later-actions into the relevant project plan, and surface now-actions. Use when you type `/sweep` or `/sweep <project>`. Defaults to all projects when no arg; scopes to one project when arg given.
---

# /sweep — follow-up sweep across recent done tasks

> **Requires the Caravel multi-agent runner.** This skill reads from `agents/<name>/tasks/done/` — the output directories maintained by the Caravel runner. It will not find anything useful in a workspace that does not use the runner. The cursor state lives at `.caravel/sweep-cursor.json`.

Many agent reports include follow-up suggestions buried in sections like "What's needed next", "What I did NOT do", "Recommendations". The recipient reads the body for the substance and naturally misses the meta. This skill is a periodic pass to catch those threads and route them properly.

Invoke with `/sweep` (everything) or `/sweep <project>` (scoped — `PROJ-212`, `my-initiative`, etc.; fuzzy substring match against the project slug).

## When to use

Trigger when:
- You type `/sweep` or `/sweep <project>`.
- You ask to "catch up on follow-ups" or "see what's outstanding".
- During `/sync` or `/end`, if it's been more than a day since the last sweep (check with `node skills/sweep/script/sweep.mjs cursor`).

Don't trigger when:
- You are mid-task and steering — wait until the immediate work is parked.
- The dashboard is empty / no recent done tasks (cheap to check: if `candidates: []` in the scope output, just say so).

## Procedure

### 1. Determine scope

Run the helper to get candidate tasks since the last sweep:

```
node skills/sweep/script/sweep.mjs scope [--project <slug>]
```

- No `--project`: every done task across all agents since the global cursor.
- `--project PROJ-212`: just tasks tagged `project:` matching `PROJ-212` (fuzzy substring, case-insensitive). The script returns the canonical resolved slug in the `scope` field.

If candidates is empty, write a short done report ("No new completions since `<cursor_ts>`") and run `commit` to advance the cursor — nothing more to do.

### 2. Read each candidate's report

For each task in `candidates` (oldest first), `Read` its `report_path`. Look for follow-up signals — these are the canonical sections:

- `## What's needed next` / `## Next steps`
- `## What I did NOT do` / `## Deferred`
- `## Recommendations`
- `## Open questions` / `## Questions`
- `## Notes for the resident chat` / `## Notes`
- Inline `TODO:`, "follow up", "should consider", "needs a decision"

Don't worry about catching every nuance — the goal is to surface follow-ups that would otherwise be lost, not to produce a perfect audit. Skim, judge, classify.

### 3. Classify each finding

Three buckets:

- **Admin** — operational chores that don't need the user's input:
  - "commit changes" / "push the branch" — check git; if not done, do it (follow your workspace git conventions)
  - "update Decision_Log.md" / "update README index" — if simple and obvious, do it inline
  - "restart the daemon" — **do not restart the daemon without explicit user permission**. Flag in the sweep report as a recommendation instead.
  - "mark feature plan status: complete" — do it inline if the deliverable shipped
  - "add changelog entry" — do it inline if the change is genuinely complete
  - General rule: if the action is small, mechanical, and within your scope, just do it. Note what you did in the sweep report.

- **Now action** — needs the user's decision or input before anything else can move:
  - Architectural choices
  - Customer-facing copy or naming
  - Anything blocking another in-flight task
  - Surface as a recommendation in the sweep report with: source task id, what the question is, why it's blocking, your read on the right answer.

- **Later action** — sensible follow-up but not urgent:
  - Refactors, test backfills, polish, "consider X in the future"
  - Append to the relevant project's `Notes/Projects/<project>/Project_Plan.md` under a `## Follow-ups` section (create the section if missing). One bullet per item with: date, source task id, short description. Keep it terse.
  - If the project has no `Project_Plan.md` (only a README), append to the README under `## Follow-ups` instead.
  - If the task has no project / is unassigned, list the follow-up in the sweep report itself.

### 4. Take the actions

- For each Admin item you can action: do it. Note in your running log.
- For each Now item: collect into a "Recommendations" section for the sweep report.
- For each Later item: append the bullet to `Project_Plan.md` (or README) immediately. Don't batch — partial progress is recoverable if interrupted.

### 5. Advance the cursor

Once you've processed all candidates:

```
node skills/sweep/script/sweep.mjs commit [--project <slug>]
```

This stamps the cursor (per-project when `--project` given, otherwise the global cursor) so the next sweep starts where this one finished. Run this **before** writing your done report — that way if you crash, the work you did is preserved, and the next sweep won't re-process the same tasks.

### 6. Write the sweep report

Write a task done report at `agents/<your-agent>/tasks/done/<task-id>.md` with frontmatter:

```yaml
---
status: done
summary: Swept N tasks for <project | all> — M admin actions taken, K now-recommendations, L later-actions filed
---
```

Body shape:

```markdown
# Sweep — <date> — <project | all>

## Scope
- Cursor: `<previous_ts>` → `<new_ts>`
- Candidates: N tasks scanned
- Filter: `<project slug>` (or "all projects")

## Action taken (admin)
- ✓ Committed and pushed `<file>`
- ✓ Marked feature plan status: complete
- (if none: "No admin actions this sweep.")

## Now — recommendations

### From TSK-..., <agent>, "<headline>"
**Question**: <one-line statement of what needs to be decided>
**My read**: <recommendation + the trade-off>
**Source**: [report path](path) §section

(repeat per item)

(if none: "No items needing your immediate input.")

## Later — filed in project plans
- [PROJ-212_*] Unit tests for `fill_missing_credentials_from_env` (from .02) → `Notes/Projects/PROJ-212.../Project_Plan.md`
- (if any unassigned: list inline here)

## Tasks scanned this round
| ID | Agent | Project | Headline |
|---|---|---|---|
| TSK-... | agent-name | PROJ-212 | R13 fixes implemented |
| ... |
```

## Output destinations

- **Sweep report**: `agents/<your-agent>/tasks/done/<id>.md` (this skill's deliverable)
- **Later-action bullets**: `Notes/Projects/<project>/Project_Plan.md` (or `README.md` if no plan) under `## Follow-ups`
- **Cursor state**: `.caravel/sweep-cursor.json` (managed by the helper script)

## What NOT to do

- **Don't spawn child tasks for every follow-up.** That defeats the purpose. Use child tasks only for genuine "Now" actions when the brief is concrete and the work is clear; everything else goes in the project plan or the sweep report.
- **Don't re-process tasks already swept.** The cursor is there for a reason. If you want to re-scan, ask the user first.
- **Don't restart the daemon** as part of "admin" actions. That's the user's call.
- **Don't write recommendations for tasks that are already in-flight.** Check the project plan for existing Follow-ups before adding new bullets; dedupe.
- **Don't make architectural calls** for the user. Surface them — don't bake them into the project plan as decisions.

## Common patterns

### `/sweep` with nothing new

Write a one-line done report ("No completions since `<ts>` — cursor is current") and close the task. Quick, no fuss.

### `/sweep PROJ-225`

Scoped sweep. Read all candidates for that project, classify, file later-actions in `Notes/Projects/PROJ-225.../Project_Plan.md`, surface now-actions in the sweep report. Cursor only advances for that project — the global cursor and other projects' cursors are unchanged.

### Mid-sweep interruption

If you run out of turns or get interrupted: the cursor stays where it was at the start (you only commit at the end). Later-action bullets you've already appended to project plans stay there (immediate writes). The next sweep will re-scan the same set — appended bullets won't be re-added because you'll see they're already there. Slightly chatty but recoverable.
