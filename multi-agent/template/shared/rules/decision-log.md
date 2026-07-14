---
description: One Decision_Log.md per project, append-only Y-statement entries, sequential DEC-NNNN numbering
---

# Decision log

Every project folder under `Notes/Projects/<KEY>_<slug>/` carries a `Decision_Log.md` that captures architecturally-significant decisions in MADR-light + Y-statement form. The log is append-only — never edit a prior entry; supersede it with a new entry that links back.

## Why a rule, not a skill

Writing a decision entry is a single `Edit(Decision_Log.md, append the entry)` — a normal agent action, not a workflow. The rule defines the format; the act of writing is just text editing. Lower surface area than a skill, picked up by every agent at start.

## File location and frontmatter

One file per project: `Notes/Projects/<KEY>_<slug>/Decision_Log.md`.

```yaml
---
title: <Project name> — Decision Log
description: Architecturally-significant decisions for <project>, append-only.
doc_type: decision_log
status: active
last_updated: YYYY-MM-DD
jira: TPD-XXX
---
```

The body is a sequence of H2 sections — one per decision — with no introductory prose. Newest entries at the bottom.

## Entry format (Y-statement + MADR-light)

```markdown
## DEC-NNNN — <short title>

- **Date:** YYYY-MM-DD
- **Status:** accepted | proposed | rejected | superseded by DEC-MMMM
- **Deciders:** <user, sam, bob, …>
- **Jira:** TPD-XXX (optional)

**Decision (Y-statement):** In the context of <use case>, facing <concern>, we decided for <option> over <alternative>, to achieve <quality>, accepting <downside>.

**Context:** <2–4 sentences on why this came up now.>

**Alternatives considered:**
- <option> — <one line on why rejected>
- <option> — <one line on why rejected>

**Consequences:** <What becomes easier; what becomes harder; what we'll need to revisit.>

---
```

For very small decisions a Y-statement alone is enough — Context, Alternatives, Consequences can be one-liners or omitted. For load-bearing architectural decisions, expand fully.

## Numbering

- Sequential per project: `DEC-0001`, `DEC-0002`, …, `DEC-0042`.
- Four digits, zero-padded — sortable, plenty of room.
- **Per-project**, not global. TPD-16 has its own DEC-0001; TPD-148 has its own DEC-0001. The Jira key in frontmatter prevents collision when entries are referenced cross-project.

## Append-only — supersede, don't edit

If a decision changes:

1. Add a **new entry** with the next DEC-NNNN.
2. The new entry's body explains the new choice.
3. The new entry's `Status:` stays `accepted`.
4. **Edit the prior entry's `Status:` line** to `superseded by DEC-MMMM` — that's the only edit allowed on a prior entry.
5. The new entry's body should reference the prior decision: "Supersedes DEC-NNNN — see [link]."

Reviewers can walk the log forwards or backwards and reconstruct the decision history without diffing markdown.

## Where decisions get referenced

- **Project Plan** — has a `Approach & key decisions` section that lists pointers, e.g. "Key decisions: see `Decision_Log.md` DEC-0007, DEC-0012." No content duplicated.
- **FDP** — has an `Alternatives considered` section that links to Decision Log entries for the formal write-up. The FDP doesn't carry the Y-statement; the log does.

## What counts as a decision

Architecturally-significant choices (ASRs in MADR terminology) — the ones a reader in 6 months would actually want to know:

- Build vs buy on a meaningful component.
- Architecture splits — single-tenant vs multi-tenant, monolith vs split, sync vs async.
- Schema or contract choices that downstream code locks into.
- Tooling / library / framework adoption.
- Trade-offs accepted (eventual consistency, latency budget, cost ceiling).

What's NOT a decision worth logging:

- Variable names, file names, code organisation within a feature.
- Anything fully described inside a single FDP — keep it there.
- Operational choices already documented in the relevant doc (e.g. branch naming).

The Y-statement format is self-policing: if you can't write a coherent "we decided X over Y, to achieve Z, accepting W", it's not a decision worth logging.

## Where it doesn't apply

- **Cross-project / company-wide decisions** — those go in a top-level decision repository (TBD; not in scope here). For now, log them in the most relevant project folder and reference from siblings.
- **Personal preference / styling** — those live in agent CLAUDE.md or the project's CONTRIBUTING-equivalent.
