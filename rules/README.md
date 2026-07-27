# Operating rules

Generic operating rules that pair with the skills in this bundle. Drop them into your agent's rule set (e.g. reference them from your `CLAUDE.md`) and adapt the paths to your workspace.

These are the *operational* rules. The **multi-agent framework** rules (task envelope, task directives, decision log, frontmatter, project folders, markdown formatting, review numbering, context discovery) ship separately in `multi-agent/template/shared/rules/`.

| Rule | Pairs with | What it governs |
|---|---|---|
| `memory.md` | — | Reading/writing persistent agent memory |
| `relative-paths.md` | all script skills | Call skill scripts by relative path |
| `ticket-quality.md` | `jira` | Writing meaningful issue-tracker tickets + comments |
| `session-lifecycle.md` | `start`, `sync`, `end` | The daily operating loop |
| `daemon-restart.md` | multi-agent runner | Never restart the runner daemon without permission |
| `ui-testing.md` | `ui-test` | Browser-level verification gate for UI changes |

Not included (workspace-specific — write your own): git workflow conventions, issue-tracker sync rules, base-repo commit access. These depend on your repo layout and tracker.
