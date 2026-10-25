---
description: Required frontmatter schema for every doc type and the discovery pattern agents use to scan it cheaply
---

# Frontmatter standard

Every markdown doc the team produces carries YAML frontmatter that identifies what it is, who owns it, and where it sits in the workflow. Frontmatter is the entry point — a single `Read(file, limit=20)` should tell any agent whether the body is worth opening.

## Required fields (all docs)

```yaml
---
title: <human-readable name>
description: <one-line summary, ≤140 chars, what shows in a file index>
doc_type: <readme | project_plan | fdp | gtm | decision | decision_log | review_brief | review | review_response | research | work | meeting_notes | transcript | file_note | daily_brief>
status: <draft | active | superseded | closed>
last_updated: <YYYY-MM-DD>
---
```

## Status — a fixed, closed vocabulary

**These four values are the only valid ones. Do not invent a fifth.** If none fits, the document is telling you something about its own shape — say so rather than coining a new status.

| Value | Meaning |
|---|---|
| `draft` | Being written. Not yet reliable to act on. |
| `active` | Current and live — the version to trust. |
| `superseded` | Replaced by a specific newer document. **Always pair with `superseded_by: <path>`.** |
| `closed` | Finished and no longer live, and not superseded by anything. The record stands; nothing is pending on it. |

`kg-gaps` validates `status` against this set exactly the way it validates `doc_type` (`.claude/skills/daily/script/daily.mjs`, `KNOWN_STATUSES`). An off-vocabulary value is a reported gap, not a silent pass.

Two distinctions worth keeping straight:

- **`status` describes the document, not the work.** A review whose verdict was "revise and resubmit" is not `draft` — the review itself was delivered. Use `verdict:`, `pr_status:` or the body for the work's state.
- **`superseded` vs `closed`.** `superseded` means a *named* successor exists. A review series that simply finished — nothing replaced the last round — ends `closed`.

For a series of reviews over the same artefact: each round a later round re-reviewed is `superseded` (pointing at its successor); the final round is `active` while the artefact is still in flight, `closed` once the work concluded.

**Not to be confused with task-envelope status.** `agents/*/tasks/**.yaml` carry a separate runner-owned execution vocabulary (`open`, `claimed`, `in_progress`, `waiting`, `done`, `failed`, `escalated`). That is a different field on a different kind of file, and this rule does not touch it.

## Optional fields (any doc)

- `jira: TPD-XXX` (or `WAL-XXX`) — link to the Jira ticket
- `parent: <path>` — parent doc (e.g. an FDP's parent project plan, or a review's target FDP)
- `supersedes: <path>` / `superseded_by: <path>` — for deprecated/superseded docs
- `summary: |` — 2–3 sentence skim summary (longer than `description`)
- `author: <agent>` — who created/owns it
- `related: [paths]` — sibling docs

## Type-specific fields

- **`project_plan`**: `appetite: <small | medium | large>`, `customer: <one-liner>`
- **`fdp`**: `modules: [array]`, `branches: [array]`, `pr_status: <none | open | merged>`
- **`gtm`**: `icp: <one-liner>`, `launch_target: YYYY-MM-DD`
- **`decision`**: a standalone document that reaches one ruling — an analysis with a verdict, not a survey. Optional `verdict: <one-liner>`. Distinct from `decision_log`, which is the append-only per-project log of Y-statement entries; a `decision` doc is a single ruling that may be summarised into the log.
- **`decision_log`**: not used at the file level — each entry has its own metadata header (see `decision-log.md`)
- **`review_brief` / `review` / `review_response`**: `review_round: <integer>`, `target: <jira-key or doc path>`, `target_type: <fdp | project_plan | gtm | other>`, `reviewer: <agent>` (for `review` docs), `author: <agent>` (for `brief` / `response` docs)
- **`transcript`**: `source: <pocket | whisper | manual>`, `source_id: <id in the source system>`, `recorded_at: <ISO timestamp>`, `duration_seconds: <integer>`, `speakers: [array]`. Machine-captured recordings — distinct from `meeting_notes`, which is the human-readable write-up. A Pocket recording that classifies as a meeting produces both, cross-linked via `related`. Written automatically by `/pocket`; see `.claude/skills/pocket/SKILL.md`.
- **`work`**: the live record of work being done — detailed plans, rollout trackers, implementation records, work-session logs. Distinct from `project_plan` (the intent for an initiative) and `fdp` (the spec for one feature): a `work` doc tracks execution and is expected to change as the work moves. Optional `branch:`, `author:`.
- **`file_note`**: no extra fields. Loose briefing notes and reference material dropped into a project folder.
- **`daily_brief`**: no extra fields. Produced unattended by the scheduled `/daily` run at `Notes/Daily/YYYY-MM-DD_Brief.md` — what changed, what was filed, what needs Kelly. Distinct from the hand-written daily note beside it.

## Discovery pattern — frontmatter first

When you encounter a referenced file, read just the frontmatter first:

```
Read(file_path="Notes/Projects/TPD-16_Custom-Report-Builder/Decision_Log.md", limit=20)
```

That returns the first 20 lines — enough to capture frontmatter on every standard doc. Decide from `description` + `summary` whether to open the body. See `context-discovery.md` for the full procedural pattern.

## Migration policy

We don't migrate everything overnight. Two practical rules:

1. **All new docs MUST have frontmatter** as of the rollout date.
2. **Existing docs get frontmatter when next edited.** Whoever opens an old doc to update it adds the frontmatter at the same time.

For high-traffic project folders (TPD-16, TPD-148, TPD-210), do a one-time sweep when convenient. Alice's old-project sweep gate (see her CLAUDE.md) intervenes automatically when a `/task` lands on a project whose `README.md` is missing or lacks `doc_type: readme` — she sweeps first, the worker proceeds after.

## Why this matters

Token budget is finite. A 30-token frontmatter scan that lets you skip a 5,000-token body is the highest-leverage move you can make per turn. Briefs reference 5–15 files routinely; reading them all in full evicts useful context and burns budget that should go toward better output. The fix: let frontmatter route you, body-load only what matches.
