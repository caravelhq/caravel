---
title: {Feature Title}
description: {≤140 char one-liner — feature scope and the user benefit}
doc_type: fdp
status: draft
last_updated: {YYYY-MM-DD}
ticket: {PROJ-XXX}
parent: ../projects/{KEY}_{slug}/Project_Plan.md
modules:
  - {path/to/file1} ({what it does or changes})
  - {path/to/file2} ({what it does or changes})
branches: []
pr_status: none
---

# {Feature Title}

## Positioning Summary

**Who:** {target user, one line — copy from Project Plan}
**Problem:** {one line — what the user is failing at today}
**What we're delivering:** {one line — the feature, in user language}
**Success looks like:** {one line — what changes for the user once shipped}

See [Project_Plan.md#positioning](../projects/{KEY}_{slug}/Project_Plan.md#positioning) for the full picture.

## Non-goals

What this feature is explicitly NOT doing:

- {Non-goal 1}
- {Non-goal 2}
- {Non-goal 3}

## Alternatives considered

Up to three alternatives, one paragraph each. Full rationale lives in the Decision Log.

### Alternative 1 — {Short name}

{One paragraph: what this alternative would look like, why we considered it, why we rejected it.}

→ See **DEC-NNNN** in [`Decision_Log.md`](../projects/{KEY}_{slug}/Decision_Log.md) for the formal write-up.

### Alternative 2 — {Short name}

{One paragraph.}

→ See **DEC-NNNN** in [`Decision_Log.md`](../projects/{KEY}_{slug}/Decision_Log.md).

### Alternative 3 — {Short name} *(optional)*

{One paragraph.}

→ See **DEC-NNNN**.

---

## Implementation Plan

### Context

{Current state of related functionality. What exists today. What needs to change.}

### Complexity: {Low | Medium | High} ({N} files new/modified)

| File | Change | Effort |
|------|--------|--------|
| {path} | {description} | {Small/Medium/Large} |
| {path} | {description} | {Small/Medium/Large} |

### {Numbered sections for each area of change}

{Detailed implementation notes with code examples where helpful.}

### Key Challenges

{Numbered list of non-obvious difficulties and how to address them.}

### Edge Cases

- {Edge case — how it should be handled}
- {Edge case — how it should be handled}
- {Data migration for existing records}
- {Offline behaviour}
- {Backwards compatibility}

---

## UX Test Plan

### Test 1 — {Description}

**Steps:**

1. {Step}
2. {Step}

**Expected:** {Observable result}

{Dev notes where relevant}

### Test 2 — {Description}

**Steps:**

1. {Step}
2. {Step}

**Expected:** {Observable result}

---

## Sprint Status & Review

**Status:** Not started

**Branches:**

| Repo | Branch | Latest commit | Notes |
|---|---|---|---|
| {repo} | `feature/{KEY}-{slug}` | — | — |

**Reviews** *(link to `reviews/` in the project folder)*

| Round | Reviewer | Verdict | Notes |
|---|---|---|---|
| R01 | — | — | — |

**PR status:**

- {Repo} PR — {link or "none"}

**Last updated:** {YYYY-MM-DD}
