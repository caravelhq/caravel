---
title: {Project Title}
description: {One-sentence description of the project outcome for the customer — ≤140 chars}
doc_type: project_plan
status: draft
last_updated: {YYYY-MM-DD}
ticket: {PROJ-XXX}
appetite: {small | medium | large}
customer: {one-line ICP / customer summary}
---

# {Project Title}

## Positioning

**Who this is for:** {ICP — be specific about the target user/customer.}

**Problem they're trying to solve:** {The customer's daily pain in their words. Not what we want to build — what they're already failing at.}

**What we're delivering:** {The thing that solves it, in plain language.}

**Why it's different / better:** {Vs current alternatives — manual processes, competitor products, doing nothing.}

**Why now:** {What changed in the world or in the product that makes this the right moment.}

*≤500 words total across the five sub-sections. Anything longer is probably scope creep into messaging or implementation. If positioning is hard enough to need a multi-week investigation, spin out `<KEY>_Positioning_Research.md` and distil findings back here.*

## Goals & non-goals

**Goals**

- {Goal 1 — specific, outcome-oriented}
- {Goal 2}
- {Goal 3}

**Non-goals** *(equally important — these prevent scope creep)*

- {Something explicitly out of scope — and why}
- {Something that would be nice but isn't in this project}

## Success metrics

How we'll know this worked:

1. **{Leading metric}** — {target and how measured}
2. **{Lagging metric}** — {target and how measured}
3. *(optional)* **{Qualitative signal}** — {e.g. "positive feedback from 3 pilot customers"}

## Scope & constituent FDPs

Features included in this project:

| Feature | Ticket | FDP | Status |
|---|---|---|---|
| {Feature name} | PROJ-XXX | [`{filename}`](../../features/XXX_name.md) | Not started |
| {Feature name} | PROJ-YYY | *(FDP needed)* | Blocked on design |
| {Feature name} | — | *(out of scope — see Non-goals)* | Deferred |

**Deferred / future projects:** {What was considered for this project but pushed out — useful context for the next planning cycle.}

## Appetite & timeline

**Appetite:** {small | medium | large} — {e.g. "~3 months / 12 weeks"}. Beyond this we stop and re-scope.

**Phases** *(shape, not Gantt)*

1. **Phase 1 — {Name}** ({N weeks}) — {What this phase produces. Which FDPs it covers.}
2. **Phase 2 — {Name}** ({N weeks}) — …
3. **Phase 3 — {Name}** ({N weeks}) — …

## Approach & key decisions

### Approach

{2–4 paragraphs describing the chosen path. Focus on the shape of the solution, not implementation detail (that's what FDPs are for). Diagrams/sketches welcome.}

### Key decisions

Pointers to entries in [`Decision_Log.md`](Decision_Log.md):

- **DEC-NNNN** — {short title} *(why it matters in one line)*
- **DEC-NNNN** — {short title}
- **DEC-NNNN** — {short title}

The Y-statement, alternatives, and consequences live in the Decision Log per the per-project append-only rule. This Plan only carries pointers — keeps the doc tight and the rationale auditable.

## Risks, assumptions & open questions

**Risks** — things that could derail the project

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| {Risk} | Low/Med/High | Low/Med/High | {How we'll watch or reduce it} |

**Assumptions** — things we're taking as given

- {Assumption 1}
- {Assumption 2}

**Open questions** — things we still need to resolve

- [ ] {Question} — *(owner: {name}, by: {date or phase})*
- [ ] {Question} — *(owner: —)*

## Team, stakeholders & cadence

**Team**

- {Role} — {Name}
- {Role} — {Name}

**Approver / decision-maker:** {Name}

**Cadence:** {e.g. "Fortnightly check-in; status updates in this doc"}

**Related docs:**

- [`README.md`](README.md) — project folder index
- [`GTM_Strategy.md`](GTM_Strategy.md) — go-to-market plan *(when ready)*
- [`Decision_Log.md`](Decision_Log.md) — architectural decisions
- {Other linked docs}

---

## Retro *(fill in after project completes)*

- **Shipped what we planned?** {Yes / mostly / what changed}
- **Outcome vs success metrics:** {actuals}
- **What worked:** {…}
- **What we'd do differently:** {…}
- **Follow-up work:** {links to new projects/FDPs}
