# Relative paths for skill scripts

Always use relative paths (e.g. `.claude/skills/...`) when calling skill scripts via Bash, not absolute paths. Permission allow-lists are typically configured for the relative path, and absolute paths (which include a machine-specific home directory) won't match — so they trigger a prompt or get denied.

Example:
- Correct: `node .claude/skills/agent-drive/script/agent_drive.mjs cal-today`
- Wrong: `node /home/you/workspace/.claude/skills/agent-drive/script/agent_drive.mjs cal-today`
