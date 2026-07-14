# Project folders — shared collaboration convention

All agents collaborate inside the same folder for any given project. Project-scoped work
(reviews, briefs, reports, plans, launch packages, decisions) lives in a single project folder
under `Notes/Projects/` — never fragmented across agent-named subfolders.

This rule applies to every agent (Alice, Ray, Sam, Adam, Bob, Mark, Cliff). When an agent's
own CLAUDE.md says "write X to `Notes/Projects/<agent-folder>/...`" for project-scoped work,
this rule overrides it: write to the project folder instead.

## When to create a project folder

Any of these triggers a project folder:

- A new initiative, epic, feature programme, or significant body of work is starting.
- Multiple agents will produce artifacts for the same body of work.
- The work needs a permanent home that survives a single chat session.

A project folder is `Notes/Projects/<KEY>_<slug>/`. **Naming convention (v1.2):**

- **Jira-keyed** — `<JIRA-KEY>_<Kebab-Case-Slug>`. The Jira key and the slug are separated
  by a single **underscore**; words within the slug are joined with **hyphens**.
  Examples: `TPD-16_Custom-Report-Builder/`, `TPD-148_RPC-API-Completion/`,
  `TPD-210_IoT-Ingest/`, `WAL-63_Multi-Agent-Orchestration/`.
- **Descriptive short name** — when no Jira ticket exists yet. Same kebab-case style:
  `Mobile-App/`, `Billing-Service/`. Rename to add the Jira prefix
  once a ticket lands.

## What lives in a project folder

The five canonical doc types (see `frontmatter.md` for the schema):

- **`README.md`** (`doc_type: readme`) — required. Index for the folder: status, file
  index, branches, gating items. The first agent to add a second file creates the README.
  Whoever adds new files updates it. **The README is the discovery surface** — agents
  landing on a project folder read this first.
- **`Project_Plan.md`** (`doc_type: project_plan`) — strategy: positioning, problem,
  appetite, scope, success metrics, risks. Sam writes the first draft. Reviewed at
  major scope changes. **FDPs are different — they live in `repos/dev/features/`.**
- **`GTM_Strategy.md`** (`doc_type: gtm`) — go-to-market: messaging pillars, channels,
  launch sequence. Cites positioning from the Project Plan; doesn't redefine it.
  Mark owns. Triggered by Alice or the user once the Project Plan has strategic direction
  and the user has signed off on it.
- **`Decision_Log.md`** (`doc_type: decision_log`) — append-only Y-statement entries,
  sequential `DEC-NNNN` per project. See `decision-log.md` for the format.
- **`reviews/`** — flat folder, files named `<DATE>_R<NN>_<role>_<agent>.md`.
  Per-project two-digit round numbers. See `review-numbering.md`.

Plus supporting docs (research briefs, options memos, launch packages, post-launch
analysis, vision/positioning iterations, meeting summaries) — anything that contributes
to the project, regardless of which agent produced it.

A project folder belongs to the project, not to any agent. Any agent can add files
to it. **Always update the README index when you do.**

## What does NOT live in a project folder

- **Feature Development Plans (FDPs)** belong in `repos/dev/features/`. They're the
  detailed implementation plan for a single feature stage and they live with the code.
  The project folder may reference an FDP from the README index, but doesn't contain it.
- **Bugfix docs** belong in `repos/dev/bugfix/`.
- **Daily notes, TaskBoard, scratch pad** — `Notes/Daily/`, `Notes/TaskBoard.md`,
  `Notes/Scratch.md` (Alice's territory).
- **Agent-private memory** — each agent's `agents/<name>/memory/`.

## Frontmatter standard

Every doc in a project folder carries the frontmatter described in `frontmatter.md`:

```yaml
---
title: <human-readable name>
description: <≤140 char one-liner>
doc_type: <readme | project_plan | fdp | gtm | decision_log | …>
status: <draft | active | review | approved | deprecated | superseded>
last_updated: YYYY-MM-DD
---
```

This is what makes the README index meaningful — every entry can be summarised from
its target doc's frontmatter without opening the body.

## README index requirement

The README is the project's table of contents. Required sections:

```markdown
---
title: <project name>
description: <one-liner>
doc_type: readme
status: active
last_updated: YYYY-MM-DD
jira: TPD-XXX
---

# <Project name>

## Status

<2–3 sentences on where we are>

## File index

| Doc | Type | Status | Last updated | Description |
|---|---|---|---|---|
| Project_Plan.md | project_plan | active | 2026-05-04 | The strategic plan |
| GTM_Strategy.md | gtm | draft | 2026-05-02 | Go-to-market |
| Decision_Log.md | decision_log | active | 2026-05-05 | DEC-0001 to DEC-0014 |

## Stage status (optional — for staged projects)

## Branches & PRs (optional — for active dev work)

## Current state / gating items / follow-ups

## Pairs with

<Other projects this one depends on or relates to>
```

Maintenance: whoever adds a doc updates the index entry. Alice's daemon will eventually
detect drift (file exists but not indexed, index entry without a file) — for now,
manual discipline.

## Standing reference libraries (existing exceptions)

Some folders predate this rule and remain valid because they hold cross-project
reference material rather than project work:

- `Notes/Projects/Competitors/` — competitor profiles
- `Notes/Projects/Marketing/ICP_Pitch.md`,
  `Vision_Roadmap.md`, `Feature_Dev_Plans.md`,
  `Notes/Projects/MarketingAgent/evergreen/`,
  `Notes/Projects/MarketingAgent/customer-insights/` —
  Mark's evergreen brand voice and customer-knowledge library
- `Notes/Projects/Strategy/Vision/Futures/`,
  `Notes/Projects/Strategy/Pivots/`,
  `Notes/Projects/Strategy/Models/`,
  `Notes/Projects/Strategy/signals.md` —
  Sam's strategic library (vision options, pivot watch, financial models, signal log)
- `Notes/Projects/Advisor/<topic>.md` and `Notes/Projects/Advisor/reference/` —
  Adam's standing operational practice notes and schema/report reference tables

These stay where they are. **Project-scoped work does not go here.** A launch
package for Feature X, a project plan for Initiative Y, an advisor review of Project Z —
those go in the project folder for X / Y / Z.

If you're producing work that's clearly cross-project (a generic ICP refresh, a
new operational practice note, a new pivot scenario), the standing-library home is
correct.

## Rules of thumb

- **One folder per major piece of work.** Don't split a project across
  `Strategy/<initiative>/` + `MarketingAgent/launches/<initiative>/` +
  `Advisor/<initiative>/`. One folder, multi-agent.
- **If you find yourself writing into your agent-named folder for a specific project,**
  stop and ask whether it should go in the project folder instead. Default: yes.
- **README first, then content.** When you create a new project folder, create the
  README at the same time with `doc_type: readme` frontmatter. Even a stub is better
  than no index.
- **FDPs go to `repos/dev/features/`.** Project Plans stay in the project folder.
  These are different documents — don't conflate them.
- **Migration is opportunistic, not mandatory.** If you discover existing project work
  in an agent-named folder while doing other work, move it when convenient. Don't run
  bulk migrations. Alice's old-project sweep gate handles the high-traffic cases
  automatically when a `/task` lands.

## Workflow integration

A product workflow maps to project folders like this:

| Stage | Owner | Output | Where |
|---|---|---|---|
| 1 | Sam + Ray | Vision / direction docs | Project folder (or `Strategy/Vision/` for cross-project) |
| 3 | Sam | `Project_Plan.md` (incl. Positioning) | Project folder |
| 4 | Mark | Project plan review | `reviews/` in project folder |
| 5 | Bob | FDP | `repos/dev/features/` |
| 6 | Mark / Cliff | FDP review | `reviews/` in project folder |
| 7 | Bob | FDP iteration | Inline in the FDP |
| 8 | Bob, Cliff | Code, PR review | Repo + chat |
| 9 | Mark | GTM strategy + launch package | `GTM_Strategy.md` + `launch/` in project folder |

Anywhere "project folder" appears, the same folder is used across stages. Don't
create a new folder per agent or per stage. **Decisions surfacing in any of these
stages get logged in `Decision_Log.md`** — see `decision-log.md`.
