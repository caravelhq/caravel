#!/usr/bin/env bash
# ui-test.sh — thin entry-point for the ui-test skill.
#
# Subcommands:
#   init <target-repo-path> [--force]   Scaffold a portable harness into the repo.
#
# All other invocations pass through to playwright/run.mjs.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "init" || "${1:-}" == "scaffold" ]]; then
  TARGET="${2:?Usage: $0 init <target-repo-path> [--force]}"
  exec node "$SKILL_DIR/script/scaffold.mjs" "$TARGET" "${@:3}"
fi

# Default: pass args to the batch runner
exec node "$SKILL_DIR/playwright/run.mjs" "$@"
