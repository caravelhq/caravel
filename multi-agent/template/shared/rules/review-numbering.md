---
description: Per-project two-digit review rounds, flat reviews/ folder, <DATE>_R<NN>_<role>_<agent>.md filename format
---

# Review numbering

Reviews come in triads: **brief** (asking for review) → **review** (the reviewer's response) → **response** (the author's reaction). Each triad shares a round number scoped to the project.

## Filename format

```
<DATE>_R<NN>_<role>_<agent>.md
```

- **`<DATE>`** — `YYYY-MM-DD`, the date the doc was written.
- **`R<NN>`** — two-digit round number, zero-padded (`R01`, `R02`, …, `R10`). Two digits so lex sort interleaves correctly.
- **`<role>`** — `brief`, `review`, or `response`.
- **`<agent>`** — the agent who wrote this specific doc (Bob, Cliff, Sam, the user, Mark, …).

## Round numbers are per-project, not per-FDP

A single project can have multiple FDPs, but reviews can also target Project Plans or GTM Strategies. Per-FDP rounds would leave Project Plan reviews and GTM reviews homeless. Per-project means **R01 is always the first review on this project, regardless of what's being reviewed.**

The `target` and `target_type` frontmatter fields tell agents what the review covers — agents filter by frontmatter, not by filename.

## Folder convention — flat reviews/

```
Notes/Projects/TPD-16_Custom-Report-Builder/
  reviews/
    2026-04-29_R01_brief_bob.md         # target: TPD-16 FDP
    2026-04-29_R01_review_cliff.md
    2026-04-29_R01_response_bob.md
    2026-04-30_R02_brief_bob.md         # target: TPD-207 FDP (different feature, same project)
    2026-04-30_R02_review_cliff.md
    2026-04-30_R02_response_bob.md
    2026-05-02_R03_brief_sam.md         # target: Project Plan (different artefact, same project)
    2026-05-02_R03_review_user.md
    2026-05-02_R03_response_sam.md
```

No per-feature subfolders. Flat. Filtering happens via frontmatter.

## Concurrent reviewers in the same round

If two agents review the same artefact in the same round (e.g. Cliff + Mark both reviewing an FDP), use the **same round number** — the role+agent in the filename and `target` in the frontmatter disambiguate:

- `2026-04-29_R01_review_cliff.md`
- `2026-04-29_R01_review_mark.md`

The author's response can roll both together (`2026-04-29_R01_response_bob.md` addressing both reviewers) or split them (`2026-04-29_R01_response_bob_cliff.md`, `2026-04-29_R01_response_bob_mark.md`) — author's call. Both are valid.

## Frontmatter on review docs

```yaml
---
title: <round-and-target>
description: <one-liner — what's being asked / what the verdict is>
doc_type: review_brief | review | review_response
status: active
last_updated: YYYY-MM-DD
review_round: 1                      # integer — displayed as R01 in filename
target: TPD-16                       # what's being reviewed: jira key, or doc path
target_type: fdp | project_plan | gtm | other
reviewer: cliff                      # for review docs (the reviewer)
author: bob                          # for brief / response docs (the author)
---
```

`target_type: other` covers research docs, launch packages, ad-hoc memos.

## Migration of existing reviews

When migrating a folder with un-numbered reviews:

1. Order reviews chronologically by `last_updated` (or filename date).
2. Group into triads (brief → review → response). If a brief is missing, the review still anchors the round.
3. Assign R01..RNN sequentially. If two triads share a date, sub-order by who wrote first (or alphabetically by agent).
4. Reviews of different targets get different rounds — round numbers always advance, never repeat.
5. Move all review files into a flat `reviews/` subfolder; rename per the format.

## Why the round-then-role-then-agent ordering

Lex sort of `2026-04-29_R01_brief_bob.md` puts every R01 file together, then groups by role (brief → response → review alphabetically — close enough), then by agent. Skim a folder listing and the round-by-round flow is visible without opening anything.
