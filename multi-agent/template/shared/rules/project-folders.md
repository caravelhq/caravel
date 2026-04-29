# Project folders — shared collaboration convention

All agents collaborate inside the same folder for any given project. Project-scoped work
(reviews, briefs, reports, plans, launch packages) lives in a single project folder under
`Notes/Projects/` — never fragmented across agent-named subfolders.

This rule applies to every agent (Alice, Ray, Sam, Adam, Bob, Mark, Cliff). When an agent's
own CLAUDE.md says "write X to `Notes/Projects/<agent-folder>/...`" for project-scoped work,
this rule overrides it: write to the project folder instead.

## When to create a project folder

Any of these triggers a project folder:

- A new initiative, epic, feature programme, or significant body of work is starting.
- Multiple agents will produce artifacts for the same body of work.
- The work needs a permanent home that survives a single chat session.

A project folder is `Notes/Projects/<name>/`. Naming, in order of preference:

1. **Jira-keyed** — `WAL-63_Multi-Agent-Orchestration/`, `TPD-189_BT-Plugin/`,
   `EPIC-XX_<short-name>/`. Use this whenever the work is tied to a Jira ticket or epic.
2. **Descriptive short name** — e.g. `Trakk_Collector/`, `FM_Building_Compliance/`,
   `Trakk_Share/`. Use when no Jira ticket exists yet, or when the project predates
   Jira tracking.

If a project later gets a Jira key, rename the folder to add the prefix.

## What lives in a project folder

- **`README.md`** — required. Up-to-date list of every doc in the folder, with a one-line
  description and current status next to each. The first agent to add a second file
  to a project folder creates the README. Whoever adds new files updates it.
- **`Project_Plan.md`** — the project plan, when one exists. Sam writes the first draft
  (stage 3 of the workflow). Mark and Adam review in place. This is the running
  reference for overall progress.
- **Research briefs, options memos, advisor reviews, marketing review notes,
  launch packages, post-launch analysis, vision/positioning iterations,
  meeting summaries, decision logs** — anything that contributes to the project,
  regardless of which agent produced it.

A project folder belongs to the project, not to any agent. Any agent can add files
to it. Always update the README when you do.

## What does NOT live in a project folder

- **Feature Development Plans (FDPs)** belong in `repos/dev/features/`. They're the
  detailed implementation plan for a single feature stage and they live with the code.
  The project folder may reference an FDP, but doesn't contain it.
- **Bugfix docs** belong in `repos/dev/bugfix/`.
- **Daily notes, TaskBoard, scratch pad** — `Notes/Daily/`, `Notes/TaskBoard.md`,
  `Notes/Scratch.md` (Alice's territory).
- **Agent-private memory** — each agent's `agents/<name>/memory/`.

## Standing reference libraries (existing exceptions)

Some folders predate this rule and remain valid because they hold cross-project
reference material rather than project work:

- `Notes/Projects/Competitors/` — competitor profiles
- `Notes/Projects/MarketingAgent/Trakk_ICP_Pitch.md`,
  `Trakk_Vision_Roadmap.md`, `Feature_Dev_Plans.md`,
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
- **README.md first, then content.** When you create a new project folder, create the
  README at the same time. Even a stub is better than no index.
- **FDPs go to `repos/dev/features/`.** Project Plans stay in the project folder.
  These are different documents — don't conflate them. The Project Plan is the
  high-level, multi-stage plan; an FDP is the detailed plan for one feature stage.
- **Migration is opportunistic, not mandatory.** If you discover existing project work
  in an agent-named folder while doing other work, move it when convenient. Don't run
  bulk migrations.

## Workflow integration

The 10-step Trakk product workflow maps to project folders like this:

| Stage | Owner | Output | Where |
|---|---|---|---|
| 1 | Sam + Ray | Vision / direction docs | Project folder (or `Strategy/Vision/` for cross-project) |
| 3 | Sam | `Project_Plan.md` | Project folder |
| 4 | Mark | Project plan review | Inline / appended in `Project_Plan.md` |
| 5 | Bob | FDP | `repos/dev/features/` |
| 6 | Mark | FDP review | Inline / appended in the FDP |
| 7 | Bob + Mark | FDP iteration | Inline in the FDP |
| 8 | Bob, Cliff | Code, PR review | Repo + chat |
| 9 | Mark | Launch package | Project folder (e.g. `<project>/launch/`) |

Anywhere "project folder" appears, the same folder is used across stages. Don't
create a new folder per agent or per stage.
