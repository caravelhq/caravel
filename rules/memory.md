---
description: Rules for reading and writing persistent agent memory files
---

# Memory rules

## Location
Persistent memory lives in a dedicated `memory/` directory (e.g. `agents/<name>/memory/` per agent, or a single `memory/` at the workspace root). Each agent reads and writes only its own memory.

## Reading memory
- Read `memory/MEMORY.md` (the index) at the start of every session.
- Before acting on a memory that references a specific file, function, or resource — verify it still exists.
- If a memory conflicts with current state, trust what you observe now and update the memory.

## Writing memory
- Save memories that will be useful in **future sessions** — not ephemeral task details.
- Check `MEMORY.md` for duplicates before creating a new file. Update existing files when the topic already exists.
- Each memory is its own `.md` file with frontmatter: `name`, `description`, `type`.
- Add a one-line pointer in `MEMORY.md` for every new memory file.
- Keep `MEMORY.md` under ~30 entries; archive or consolidate if it grows beyond that.

## What to save
- **user**: Role, preferences, expertise, working style — things that shape how you should collaborate.
- **feedback**: Corrections or confirmations about your approach. Include *why* so edge cases can be judged.
- **project**: Ongoing work context, decisions, deadlines. Convert relative dates to absolute.
- **reference**: Pointers to external systems (issue trackers, dashboards, contacts).

## What NOT to save
- Code patterns, architecture, file paths — derive these from the repo.
- Git history or recent changes — use `git log`.
- Anything already in `CLAUDE.md` or config files.
- Temporary in-progress state — use tasks instead.
