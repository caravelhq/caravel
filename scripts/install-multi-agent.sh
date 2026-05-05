#!/usr/bin/env bash
# Install / refresh the ClaudeClaw multi-agent task envelope system into a
# consuming project's live instance.
#
# Source of truth: <repo>/multi-agent/template/
#
# What it does:
#   1. (optional) Pulls latest from the claudeclaw repo on the configured branch.
#   2. Copies template/skills/task/ → <project>/.claude/skills/task/
#   3. Copies template/shared/    → <project>/agents/_shared/
#   4. Ensures <project>/agents/<each>/tasks/{open,done,failed}/ + journal.ndjson
#
# Idempotent. Safe to re-run.
#
# Configuration (env vars; consuming projects pass via a thin caller):
#   CLAUDECLAW_PROJECT_DIR  (required) Project root that receives the install.
#   CLAUDECLAW_REPO_DIR     (optional) Path to the claudeclaw repo checkout.
#                           Default: <project>/repos/claudeclaw
#   CLAUDECLAW_BRANCH       (optional) Branch to pull from. Default: local
#   CLAUDECLAW_AGENTS       (optional) Space-separated agent names.
#                           Default: alice ray adam sam bob mark cliff
#
# Args:
#   --no-pull   Skip the git pull step.
#   --dry-run   Show what would happen without writing.
#   -h|--help   Show this header.

set -euo pipefail

: "${CLAUDECLAW_PROJECT_DIR:?CLAUDECLAW_PROJECT_DIR must be set (project root)}"

PROJECT_DIR="$CLAUDECLAW_PROJECT_DIR"
CLAW_REPO="${CLAUDECLAW_REPO_DIR:-${PROJECT_DIR}/repos/claudeclaw}"
BRANCH="${CLAUDECLAW_BRANCH:-local}"
AGENTS_RAW="${CLAUDECLAW_AGENTS:-alice ray adam sam bob mark cliff}"
read -r -a AGENTS <<<"$AGENTS_RAW"

SRC_DIR="${CLAW_REPO}/multi-agent/template"
DEST_SKILL="${PROJECT_DIR}/.claude/skills/task"
DEST_SHARED="${PROJECT_DIR}/agents/_shared"

NO_PULL=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) NO_PULL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  + $*"
  else
    "$@"
  fi
}

if [[ ! -d "$CLAW_REPO/.git" ]]; then
  echo "Error: claudeclaw repo not found at $CLAW_REPO" >&2
  echo "       clone the claudeclaw fork into that path or set CLAUDECLAW_REPO_DIR" >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: multi-agent template not found at $SRC_DIR" >&2
  echo "       are you on the right claudeclaw branch? expected: $BRANCH" >&2
  exit 1
fi

if [[ $NO_PULL -eq 0 ]]; then
  CURRENT_BRANCH=$(git -C "$CLAW_REPO" branch --show-current)
  if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    echo "claudeclaw is on branch '$CURRENT_BRANCH', expected '$BRANCH' — skipping pull"
  else
    echo "Pulling latest from claudeclaw $BRANCH branch..."
    git -C "$CLAW_REPO" pull --ff-only origin "$BRANCH" 2>/dev/null || \
      echo "  (pull skipped — may be offline or up to date)"
  fi
fi

# Skill — .claude/skills/task/
echo "Installing /task skill → ${DEST_SKILL#$PROJECT_DIR/}"
run mkdir -p "$DEST_SKILL/script"
run cp "$SRC_DIR/skills/task/SKILL.md" "$DEST_SKILL/SKILL.md"
run cp "$SRC_DIR/skills/task/script/task.mjs" "$DEST_SKILL/script/task.mjs"
run chmod +x "$DEST_SKILL/script/task.mjs"

# Shared schema + examples — agents/_shared/
echo "Installing shared envelope spec → ${DEST_SHARED#$PROJECT_DIR/}"
run mkdir -p "$DEST_SHARED/task-envelope-examples"
run cp "$SRC_DIR/shared/task-envelope.md" "$DEST_SHARED/task-envelope.md"
for f in "$SRC_DIR"/shared/task-envelope-examples/*.yaml; do
  run cp "$f" "$DEST_SHARED/task-envelope-examples/$(basename "$f")"
done

# Shared rules — agents/_shared/rules/
if [[ -d "$SRC_DIR/shared/rules" ]]; then
  echo "Installing shared rules → ${DEST_SHARED#$PROJECT_DIR/}/rules"
  run mkdir -p "$DEST_SHARED/rules"
  for f in "$SRC_DIR"/shared/rules/*.md; do
    [[ -e "$f" ]] || continue
    run cp "$f" "$DEST_SHARED/rules/$(basename "$f")"
  done
fi

# Per-agent task directories
echo "Ensuring per-agent task directories..."
for agent in "${AGENTS[@]}"; do
  agent_dir="${PROJECT_DIR}/agents/${agent}/tasks"
  for sub in open done failed waiting; do
    if [[ ! -d "$agent_dir/$sub" ]]; then
      run mkdir -p "$agent_dir/$sub"
      echo "  created agents/${agent}/tasks/${sub}/"
    fi
  done
  if [[ ! -f "$agent_dir/journal.ndjson" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  + touch $agent_dir/journal.ndjson"
    else
      : > "$agent_dir/journal.ndjson"
    fi
    echo "  created agents/${agent}/tasks/journal.ndjson"
  fi
done

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "Dry run — no changes written."
else
  echo
  echo "Multi-agent task system installed. Try:"
  echo "  node ${DEST_SKILL#$PROJECT_DIR/}/script/task.mjs summary"
fi
