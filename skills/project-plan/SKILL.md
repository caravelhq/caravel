---
name: project-plan
description: Write a Project Plan for a multi-feature initiative that spans weeks-to-months. Use when scoping a strategic effort that will contain several FDPs — not for individual features (use `/fdp` for those). Positioning lives at the top, go-to-market is downstream.
argument-hint: "[project-name]"
---

Write a tight, structured **Project Plan** — the strategic wrapper that sits above one or more Feature Development Plans (FDPs). The Plan opens with **Positioning** (who, problem, what, why-different, why-now) — every other section depends on it.

A Project Plan is a **2–4 page vision doc** for a multi-feature initiative. It exists to give a clear, reviewable shape to work that spans weeks or months, before the team commits to building any particular feature inside it. Each feature inside the project still gets its own FDP.

## When to use this skill vs `/fdp`

| Use **`/project-plan`** when… | Use **`/fdp`** when… |
|---|---|
| Multiple features will ship as one coherent initiative | A single feature with a clear scope |
| The work spans weeks-to-months | The work is a sprint or two |
| There's a vision / strategic choice to communicate | The value and approach are already obvious |
| You'd otherwise write 10+ pages of unstructured notes | An FDP's positioning summary + implementation plan is enough |
| You need to frame a *decision* (approach, architecture) | You're executing an understood path |

FDPs stay tight and feature-level; Project Plans stay strategic and vision-level. They reference each other but don't overlap. **Go-to-market content (pricing tiers, content cadence, launch sequence) lives in a `GTM_Strategy.md`, not in the Project Plan.**

## Where things live

Adapt these paths to your repo layout. The defaults assume a project folder holds the surrounding material and FDPs live alongside your code docs.

| What | Where (default) |
|---|---|
| Project plan output | `docs/projects/<KEY>_<slug>/Project_Plan.md` |
| Project README index | `docs/projects/<KEY>_<slug>/README.md` |
| Constituent FDPs | `docs/features/<KEY>_<slug>.md` |
| GTM Strategy (downstream) | `docs/projects/<KEY>_<slug>/GTM_Strategy.md` |
| Decision Log | `docs/projects/<KEY>_<slug>/Decision_Log.md` |
| Template | `.claude/skills/project-plan/template/project-plan.md` |

Folder slug convention: `<TICKET-KEY>_<Kebab-Case-Slug>` — underscore separates the key from the slug; words within the slug are joined with hyphens. Examples: `PROJ-16_Custom-Report-Builder`, `PROJ-210_IoT-Ingest`.

## Design principles

The framework is a synthesis of five well-known approaches — use the right lens for each section:

- **Working Backwards / PR-FAQ (Amazon)** — customer-first framing in the Positioning section
- **Shape Up (Basecamp)** — fixed appetite + explicit non-goals
- **Design docs (Google)** — alternatives considered, link to Decision Log
- **Project charter** — scope in/out, success criteria, stakeholders
- **RFC mindset** — open questions are first-class citizens

Core rules:

1. **Target 2–4 pages.** If a section has no substance, cut it — don't pad.
2. **Positioning is the gravity centre.** First major section, ≤500 words. Write it first; the approver's signoff on the Plan is implicit signoff on the positioning. Every subsequent section depends on it.
3. **Decisions with alternatives.** Material decisions get a short Y-statement entry in `Decision_Log.md`. The Plan carries pointers, not the decisions themselves.
4. **Link, don't duplicate.** FDPs own feature detail; the Plan links to them. GTM owns marketing detail; the Plan points at it.
5. **Keep it live.** Status, open questions, scope items update over time — keep them current. Decisions are append-only in the Decision Log.

## Instructions

### 1. Gather context

Get the project name and what it's trying to achieve. If it's already been described, proceed. Pull in supporting context: prior notes/proposals/research in the project folder, recent meeting notes, related FDPs if any already exist, and (for technical projects) the relevant architecture docs.

### 2. Optionally create a tracking Epic

For projects that span multiple tickets, consider creating an Epic in your issue tracker to group them. Epics are optional — for small multi-feature efforts the FDP tickets alone are fine.

### 3. Write Positioning first — gate everything else on it

Open the file, write the Positioning section, surface it for signoff, then continue with scope, decisions, risks. The five sub-sections, ≤500 words total:

```markdown
## Positioning

**Who this is for:** <ICP — be specific about the target user/customer.>

**Problem they're trying to solve:** <The customer's daily pain in their words.
Not what we want to build — what they're already failing at.>

**What we're delivering:** <The thing that solves it, in plain language.>

**Why it's different / better:** <Vs current alternatives — manual processes,
competitor products, doing nothing.>

**Why now:** <What changed in the world or in the product that makes this the
right moment.>
```

Anything longer than 500 words is probably scope creep into messaging or implementation. If positioning needs a multi-week investigation, spin out a separate `<KEY>_Positioning_Research.md` and distil findings back into this section once done.

### 4. Frame the rest of the Plan

Before writing the remaining sections:

- Identify the 1–2 key decisions the project pivots on (architecture? delivery model? audience?). These get Y-statement entries in the Decision Log; the Plan carries pointers.
- Note explicit non-goals — what you're *not* doing. Non-goals prevent scope creep more than any process will.
- List what's unknown and would block progress if unresolved.

### 5. Write the plan

Create `docs/projects/<KEY>_<slug>/Project_Plan.md` using the template at `.claude/skills/project-plan/template/project-plan.md`. Frontmatter must carry:

```yaml
---
title: <Project Title>
description: <one-line summary, ≤140 chars>
doc_type: project_plan
status: draft | active | review | approved | deprecated
last_updated: YYYY-MM-DD
ticket: PROJ-XXX
appetite: small | medium | large
customer: <one-liner>
---
```

**Section order:**

```markdown
## Positioning            ← FIRST. Gates the rest.
## Goals & non-goals
## Success metrics
## Scope & constituent FDPs
## Appetite & timeline
## Approach & key decisions  ← pointers to Decision_Log.md
## Risks, assumptions, open questions
## Team & cadence
```

Section guidance:

- **Positioning** — five sub-sections per the template above. ≤500 words.
- **Goals & non-goals** — explicit non-goals are mandatory. One bullet list each.
- **Success metrics** — 2–4 measurable outcomes. Mix leading and lagging.
- **Scope & constituent FDPs** — table linking each feature to its FDP (or flagging "FDP needed"). What's deferred.
- **Appetite & timeline** — a shape, not a Gantt. "~3 months across 3 phases" beats a day-level schedule you won't keep.
- **Approach & key decisions** — 2–4 paragraphs on the chosen path, then **pointers** to Decision Log entries. Do **not** put the Y-statements inline; the log carries them.
- **Risks, assumptions, open questions** — what could sink it, what we're assuming, what we haven't resolved yet. Open questions get owners + by-when.
- **Team & cadence** — who's on it, who approves, how reviews happen. Short.

### 6. What does NOT go in the Plan

These belong in other docs:

- **GTM content** — pricing tiers, content cadence, launch sequence → `GTM_Strategy.md`. Plan can reference; Plan does not contain.
- **Decision rationale** — Y-statements, alternatives-considered details → `Decision_Log.md`. Plan carries pointers.
- **Multi-revision history** — that's noise. Use git and the Decision Log; don't accumulate "Revision 1.1, 1.2, …" in the Plan body.
- **Press releases, walkthrough scripts, demo copy** — FDP/marketing artefact concerns, not Plan concerns.

### 7. Link it in

- Update the project folder's `README.md` index — add a row pointing at `Project_Plan.md` with type/status/last-updated/description.
- If any FDPs already exist, add a "See: <Project> Project Plan" breadcrumb at the top of each.

### 8. Log decisions

If writing this Plan surfaced architectural decisions, append Y-statement entries to `Decision_Log.md`. The Plan's "Approach & key decisions" section then carries pointers, not the decisions themselves.

### 9. Branch and PR

Project plans are substantive documents — put them on a branch and open a PR for review.

### 10. Keep it live

As the project progresses: tick off scope items and add FDP links as they're created; move open questions into Decision Log entries (with the answer recorded as a Y-statement); update status and metrics periodically; on completion, mark `status: approved` (or `deprecated` if cancelled) and add a short retro block at the bottom.

## Quality checks

Before sharing the plan, verify:

- It fits in 2–4 pages (if longer, push detail to FDPs, GTM, or the Decision Log)
- Positioning is the first major section and ≤500 words
- Every goal has a corresponding non-goal somewhere
- Every key decision has a Decision Log entry referenced (not duplicated)
- Success metrics are measurable, not aspirational
- Every FDP in the scope table has either a link or "FDP needed" marker
- Open questions have owners or next-step notes
- Frontmatter carries `doc_type: project_plan` and the required fields
- No GTM content has crept into the Plan body — pointer to `GTM_Strategy.md` only
