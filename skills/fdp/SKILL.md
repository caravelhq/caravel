---
name: fdp
description: Create a Feature Development Plan for a non-trivial feature — one that spans multiple files or involves architectural decisions. A tight, implementation-focused doc; positioning is summarised at the top with a link to the parent Project Plan.
argument-hint: "[feature-name]"
---

Create a Feature Development Plan (FDP). FDPs are the canonical specification for feature work — they drive development, testing, and code review. Marketing artefacts (press release, walkthrough script, social posts) live in a Go-to-Market plan at the project level, not inside the FDP.

An FDP is a **3–6 page implementation-focused doc**. Positioning is summarised at the top (4 lines + link to the Project Plan), then the doc gets straight to the implementation plan, edge cases, and sprint status.

## Where things live

Adapt these paths to your repo layout. The defaults assume the FDP lives alongside your code docs and the surrounding project material lives in a project folder.

| What | Where (default) |
|---|---|
| FDP output | `docs/features/<KEY>_<slug>.md` |
| Project Plan (cite from) | `docs/projects/<KEY>_<slug>/Project_Plan.md` |
| Project README index | `docs/projects/<KEY>_<slug>/README.md` |
| Reviews | `docs/projects/<KEY>_<slug>/reviews/<DATE>_R<NN>_<role>.md` |
| Decision log | `docs/projects/<KEY>_<slug>/Decision_Log.md` |
| Architecture docs | your repo's architecture/reference docs |
| Development standards | your repo's contributing/standards doc |
| Source code | your app + backend source trees |

## What's IN an FDP

- **Frontmatter** — `doc_type: fdp` + standard fields, plus FDP-specific (`modules`, `branches`, `pr_status`).
- **Positioning Summary** — 4 lines (Who, Problem, What, Success looks like) + a link to `Project_Plan.md#positioning`. Echoes the Plan; does not redefine.
- **Non-goals** — explicit bullet list.
- **Alternatives considered** — ≤3 alternatives, one paragraph each, link to Decision Log entries for the formal write-up.
- **Implementation Plan** — Context, Complexity, file table, key challenges, edge cases.
- **UX Test Plan** — manual test cases that cover unwritten user assumptions.
- **Sprint Status & Review** — current state, branches, review rounds, PR links.

## What's OUT of an FDP

- **Press Release** → Go-to-Market plan.
- **Walkthrough Video Script** → Go-to-Market plan.
- **Social Posts** → Go-to-Market plan / marketing.
- **Multi-revision history** → Decision Log + git history. The FDP shows current state only.

If the feature is so substantial that it needs all of those, the project owns them — the FDP is the implementation half of a larger Project Plan + Go-to-Market bundle.

## Instructions

### 1. Gather context

Get the feature name and a brief description of what it does and who it's for. If it's already been described, proceed.

If the feature belongs to a known project, **read the Project Plan first** — frontmatter + Positioning section. The FDP's Positioning Summary echoes the Plan.

Check any meeting notes or prior discussion for context on this feature.

### 2. Create or find the tracking ticket

Before writing the plan, ensure a tracking ticket exists in your issue tracker. Note the ticket key (e.g. `PROJ-165`) — this becomes the **filename prefix**.

### 3. Research the codebase

Before writing the plan, explore the relevant code to understand:

- Current state of related functionality
- Existing patterns the feature should follow (CRITICAL for consistency)
- Files that will need modification
- Data-model implications (schema, state, component props)

### 4. Read reference documentation

Read the relevant architecture and standards docs before planning, so the plan follows established conventions rather than inventing new ones.

### 5. Write the FDP

Write to `docs/features/<KEY>_<slug>.md` (e.g. `docs/features/PROJ-165_video-survey-report.md`). Use the template at `template/fdp.md` as a starting structure. Required frontmatter:

```yaml
---
title: <Feature Title>
description: <≤140 char one-liner>
doc_type: fdp
status: draft | active | review | merged | deprecated
last_updated: YYYY-MM-DD
ticket: PROJ-XXX
parent: ../projects/<KEY>_<slug>/Project_Plan.md   # if part of a multi-feature project
modules:
  - <path/to/file1> (<what it does or changes>)
  - <path/to/file2> (<what it does or changes>)
branches: []
pr_status: none | open | merged
---
```

**Section order:**

```markdown
## Positioning Summary       ← FIRST. 4 lines + link.
## Non-goals
## Alternatives considered    ← ≤3, link to Decision_Log.md entries
## Implementation Plan
   - Context
   - Complexity
   - File-by-file changes
   - Key challenges
   - Edge cases
## UX Test Plan
## Sprint Status & Review
```

Section guidance:

- **Positioning Summary** — four lines, then a link. Working-Backwards principle: devs need to understand what they're trying to achieve before reading the modules table.

  ```markdown
  ## Positioning Summary

  **Who:** <target user, one line — copy from Project Plan>
  **Problem:** <one line — what the user is failing at today>
  **What we're delivering:** <one line — the feature, in user language>
  **Success looks like:** <one line — what changes for the user once shipped>

  See [Project_Plan.md#positioning](../projects/<KEY>_<slug>/Project_Plan.md#positioning) for the full picture.
  ```

  Echo the Plan, don't redefine. If there's no parent Project Plan (single-feature work), write the four lines from scratch — but consider whether a small Project Plan would help.

- **Non-goals** — explicit bullet list. What this feature is *not* doing.

- **Alternatives considered** — ≤3 alternatives, one paragraph each. Each ends with "→ See DEC-NNNN in `Decision_Log.md` for the formal write-up." The full context and consequences live in the log; the FDP only summarises.

- **Implementation Plan** — Context (current state), Complexity (Low/Med/High + file count), file-by-file table with effort, key challenges, edge cases. Include data migration, offline behaviour, backwards compatibility.

- **UX Test Plan** — manual test cases. Cover unwritten user assumptions, not just explicit requirements. Each test has steps + expected result + dev notes. (Pair with the `ui-test` skill to make these executable.)

- **Sprint Status & Review** — populated as work progresses. Status, branches (with commits), review rounds, PR links.

### 6. Log decisions

If the FDP surfaced architectural decisions (build vs buy, schema choice, sync vs async), append entries to the project's `Decision_Log.md`. The FDP's "Alternatives considered" section then references DEC-NNNN — it doesn't duplicate the rationale.

### 7. Update the project README index

If the FDP belongs to a project folder, add a row to that project's `README.md` file index pointing at the FDP with the right type/status/last-updated/description.

### 8. Branch and PR

FDPs and their code go on a feature branch:

```
git checkout -b feature/<KEY>-<slug>
```

Commit, push, open a PR for review.

### 9. Comment on the tracking ticket

Note in the ticket that the FDP is complete, with a brief summary of scope and approach.

### 10. Quality checks

Before sharing:

- Frontmatter has `doc_type: fdp` + required fields
- Positioning Summary is 4 lines + link, echoing the Project Plan (not redefining)
- Non-goals are explicit
- Alternatives considered references DEC-NNNN entries (not duplicating them inline)
- File table covers every modified or new file
- UX tests cover unwritten user assumptions, not just explicit requirements
- Edge cases include data migration, offline behaviour, backwards compatibility
- No marketing content (press release, video script, social posts) — that's Go-to-Market
- No multi-revision history — the FDP shows current state only

### 11. Present for review

Show the completed plan for review before any implementation begins.

## Naming convention

Forward-looking FDPs use `<KEY>_<kebab-slug>.md` (e.g. `PROJ-165_video-survey-report.md`). Retrospective FDPs (documenting an existing feature after the fact) use `_retro-<feature_name>.md`.
