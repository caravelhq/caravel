---
description: How agents should format markdown in task envelopes, reports, and notes
---

# Markdown formatting — line breaks and structure

## The rule

**Do not insert line breaks mid-sentence.** Word-wrap is the renderer's job, not yours. A paragraph is one continuous line in the source; the reader's renderer flows it to whatever width fits.

Insert a newline only when you mean one of these:

- **End of a paragraph** — followed by a blank line, then the next paragraph.
- **List item** — `- ` for bullets, `1. ` for numbered.
- **Heading** — `## Title` on its own line.
- **Code block** — fenced (```` ``` ````) or indented; newlines inside are preserved literally.
- **Table** — pipes and dashes form the structure.
- **Blockquote** — `> ` prefix on each line.
- **Hard break** — only when the layout genuinely requires `<br>` (rare; CommonMark uses two trailing spaces or a literal `<br>`).

## Why this matters

The ClaudeClaw dashboard renders markdown with `breaks: false` (CommonMark default). Mid-sentence newlines in the source collapse to single spaces — which is what we want. But authoring tools that hard-wrap at 80 columns produce sources that *look* fine in a terminal and *look broken* in the rendered HTML, with awkward early line breaks before the natural word-wrap kicks in.

By writing one paragraph as one source line, the rendered output flows correctly at any width — chat sidebar, file viewer, mobile, future surfaces.

## Practical examples

✅ **Good** (paragraphs as single lines):

```markdown
Sam scoped TPD-210 across six stages and Mark validated the marketing angle. Adam reviewed the trade-offs and recommended proceeding with Stage 1 first since the dependencies are clearest there.

The next step is Bob drafting the FDP for the RPC API endpoints.
```

❌ **Bad** (hard-wrapped at ~80 cols):

```markdown
Sam scoped TPD-210 across six stages and Mark validated the marketing angle.
Adam reviewed the trade-offs and recommended proceeding with Stage 1 first
since the dependencies are clearest there.

The next step is Bob drafting the FDP for the RPC API endpoints.
```

The bad version renders as three short lines stacked on top of each other in the dashboard, then a paragraph break, then another stack — rather than two flowing paragraphs.

## Where this applies

- Task envelopes — `brief`, `context`, `summary.response`, `output_format`.
- Reports filed to `Notes/Projects/<project>/`.
- Daily notes, meeting notes, scratch pad entries.
- Comments in Jira / GitHub / Bitbucket.
- Anything that will be read in a browser-rendered markdown surface.

## Where it doesn't apply

- **Code, YAML, JSON** — preserve exact formatting; the renderer treats fenced content literally.
- **Plain-text logs and shell output** — these aren't markdown.
- **Lists, tables, headings** — those use newlines structurally, not mid-sentence.

## Editor settings

If your editor auto-wraps markdown files at a fixed column, turn it off for `.md`. Soft-wrap (visual wrap that doesn't insert real newlines) is fine and recommended.
