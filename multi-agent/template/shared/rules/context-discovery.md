---
description: Read frontmatter first; only read full file content when you actually need it. Project README is the entry point for any project folder.
---

# Context discovery — frontmatter first, body second

## The principle

Briefs you receive will reference files (`context: [...]` in the envelope, paths in the brief body). Don't reflexively read every one in full. **Scan the frontmatter first; read the body only if it's relevant to your task.**

This keeps your turns cheap and your context window clean. A well-tagged reference doc tells you in 30 tokens whether the 5,000-token body is worth opening.

## Why this matters

Token budget is finite. Per-turn output, per-task budget, and the prompt cache all reward economy. The current pattern — workers reading every referenced file in full at the start of a task — wastes tokens on files that turn out to be tangential, evicts useful prior context, and burns budget that could have gone toward better output.

The fix isn't to brief shorter (briefs need to be precise). It's to let workers decide what they actually need.

## How to read frontmatter cheaply

The `Read` tool's `limit` parameter exists for this. Read just the frontmatter:

```
Read(file_path="Notes/Projects/TPD-148_RPC-API-Completion/reviews/2026-05-04_R02_review_cliff.md", limit=20)
```

That returns the first 20 lines — enough to capture frontmatter on every standard reference doc (see `frontmatter.md` for the schema).

Standard frontmatter you'll see (or should populate when you write):

```yaml
---
title: TPD-148 v1.1 review (Cliff)
description: Code-review pass on the FDP after the HMAC rewrite. Verdict: revise.
doc_type: review
summary: Three Should-fixes around secret storage; one Must-fix on §6.4 (hash-only vs HMAC).
tags: [TPD-148, code-review, security]
last_updated: 2026-05-04
---
```

The `description` and `summary` together tell you whether the body is the right thing to read for your current task.

## Project README is the entry point

For project folders (`Notes/Projects/<JIRA-KEY>_<slug>/`), the `README.md` is your index — **always read it first.** It carries `doc_type: readme` frontmatter and a file-index table that lists every doc in the folder with type, status, last-updated, and a one-line description. From the README you can decide which sibling docs are worth opening.

If a project folder lacks a README, or the README is missing `doc_type: readme` frontmatter, that's a signal: **the project hasn't been swept to v1.2 conventions.** When you're a worker landing on such a folder, flag it back to Alice (she has a sweep gate that handles this automatically — when she dispatched your task, the gate should have intervened first).

## When to read full content

After scanning frontmatter, read the full body when:

- Frontmatter explicitly matches your brief (same Jira key, same topic, same artifact you're updating).
- The summary is too vague to decide and the file is small (<200 lines).
- Your brief explicitly says "use the recommendations from X" — read X.

When NOT to read full content:

- Frontmatter shows the file is about a different ticket / topic than your task.
- The file is a long index (`README.md`, `MEMORY.md`) and you can navigate it from the frontmatter / first headings alone.
- The file is a sibling artifact (Mark's launch package when you're doing the FDP) — you can pull specific sections later if needed.

## Frontmatter description + summary should suffice for routing

If you find yourself reading bodies just to decide whether they're relevant, the upstream docs need better frontmatter. When you write a doc, treat the `description` (≤140 chars, what shows in a file index) and the optional `summary` (2–3 sentences, the takeaway) as your primary investments — they're the routing signal for every future agent.

## When you write reference material

Always include frontmatter per `frontmatter.md`. Minimum fields:

```yaml
---
title: <human-readable title>
description: <1-line purpose — what is this doc and who's it for>
doc_type: <readme | project_plan | fdp | gtm | decision_log | review | research | meeting_notes | …>
status: <draft | active | review | approved | deprecated | superseded>
last_updated: YYYY-MM-DD
---
```

Plus optional `summary`, `tags`, `author`, `related`, `jira`, `parent`, `supersedes`, `superseded_by`.

`title` is what shows in lists; `description` is the elevator pitch (what + audience); `summary` is the takeaway (conclusions, recommendations, key points). The next worker who scans this file's frontmatter should decide in 5 seconds whether they need the body.

For docs you're updating, bump `last_updated` to the date of your change.

## Procedural pattern

When you receive a brief with `context: [...]` references:

1. **First pass — scan frontmatter on every entry.** One `Read(..., limit=20)` per file. Cheap. **If the brief points at a project folder, start with its `README.md`** — the file index there gives you the whole landscape in one read.
2. **Second pass — read the body** of the 1–3 files that match your brief. Skip the rest.
3. **Third pass — open siblings** (via project README, parent folder, related links in the body) only if step 2 surfaced a concrete need.

A brief with 8 context entries should rarely cost more than 3 full-file reads. If you find yourself reading all 8, your brief is over-broad — push back to the dispatcher or scope your work tighter.

## Where this applies

- **Every spawned worker turn** with context references.
- **Continuation envelopes** — Alice scanning her own queue should also frontmatter-first the failed/done envelopes the runner cites.

## Where it doesn't apply

- **Files explicitly named in the brief body** as "read this end-to-end" — read fully.
- **Code files** — frontmatter convention is for markdown / docs. For code, skim by symbol or section rather than reading 5KB blindly.
- **Live chat** — you're not budgeted; behave naturally.
