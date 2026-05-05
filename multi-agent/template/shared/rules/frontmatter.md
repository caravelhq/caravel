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
doc_type: <readme | project_plan | fdp | gtm | decision_log | review_brief | review | review_response | research | meeting_notes>
status: <draft | active | review | approved | deprecated | superseded>
last_updated: <YYYY-MM-DD>
---
```

## Optional fields (any doc)

- `jira: TPD-XXX` (or `WAL-XXX`) — link to the Jira ticket
- `parent: <path>` — parent doc (e.g. an FDP's parent project plan, or a review's target FDP)
- `supersedes: <path>` / `superseded_by: <path>` — for deprecated/superseded docs
- `summary: |` — 2–3 sentence skim summary (longer than `description`)
- `tags: [array]` — for cross-cutting discovery
- `author: <agent>` — who created/owns it
- `related: [paths]` — sibling docs

## Type-specific fields

- **`project_plan`**: `appetite: <small | medium | large>`, `customer: <one-liner>`
- **`fdp`**: `modules: [array]`, `branches: [array]`, `pr_status: <none | open | merged>`
- **`gtm`**: `icp: <one-liner>`, `launch_target: YYYY-MM-DD`
- **`decision_log`**: not used at the file level — each entry has its own metadata header (see `decision-log.md`)
- **`review_brief` / `review` / `review_response`**: `review_round: <integer>`, `target: <jira-key or doc path>`, `target_type: <fdp | project_plan | gtm | other>`, `reviewer: <agent>` (for `review` docs), `author: <agent>` (for `brief` / `response` docs)

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
