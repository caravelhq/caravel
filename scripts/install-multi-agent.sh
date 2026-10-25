#!/usr/bin/env bash
# Install / refresh the Caravel multi-agent task envelope system into a
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
#   CARAVEL_PROJECT_DIR  (required) Project root that receives the install.
#   CARAVEL_REPO_DIR     (optional) Path to the caravel repo checkout.
#                        Default: <project>/repos/claudeclaw
#   CARAVEL_BRANCH       (optional) Branch to pull from. Default: local
#   CARAVEL_AGENTS       (optional) Space-separated agent names.
#                        Default: alice ray adam sam bob mark cliff
#
# Legacy aliases (still accepted for existing callers):
#   CLAUDECLAW_PROJECT_DIR, CLAUDECLAW_REPO_DIR, CLAUDECLAW_BRANCH, CLAUDECLAW_AGENTS
#
# Args:
#   --no-pull   Skip the git pull step.
#   --dry-run   Show what would happen without writing.
#   -h|--help   Show this header.

set -euo pipefail

# Accept new CARAVEL_* names, falling back to legacy CLAUDECLAW_* for existing callers.
CARAVEL_PROJECT_DIR="${CARAVEL_PROJECT_DIR:-${CLAUDECLAW_PROJECT_DIR:-}}"
CARAVEL_REPO_DIR="${CARAVEL_REPO_DIR:-${CLAUDECLAW_REPO_DIR:-}}"
CARAVEL_BRANCH="${CARAVEL_BRANCH:-${CLAUDECLAW_BRANCH:-}}"
CARAVEL_AGENTS="${CARAVEL_AGENTS:-${CLAUDECLAW_AGENTS:-}}"

: "${CARAVEL_PROJECT_DIR:?CARAVEL_PROJECT_DIR (or CLAUDECLAW_PROJECT_DIR) must be set (project root)}"

PROJECT_DIR="$CARAVEL_PROJECT_DIR"
CLAW_REPO="${CARAVEL_REPO_DIR:-${PROJECT_DIR}/repos/claudeclaw}"
if [[ -n "${CARAVEL_BRANCH:-}" ]]; then
  BRANCH="$CARAVEL_BRANCH"
else
  BRANCH="$(git -C "$CLAW_REPO" branch --show-current 2>/dev/null || echo "master")"
fi
AGENTS_RAW="${CARAVEL_AGENTS:-alice bob ray}"
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
      sed -n '2,32p' "$0"
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
  echo "Error: caravel repo not found at $CLAW_REPO" >&2
  echo "       clone the caravel repo into that path or set CARAVEL_REPO_DIR" >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: multi-agent template not found at $SRC_DIR" >&2
  echo "       are you on the right branch? expected: $BRANCH" >&2
  exit 1
fi

if [[ $NO_PULL -eq 0 ]]; then
  CURRENT_BRANCH=$(git -C "$CLAW_REPO" branch --show-current)
  if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    echo "caravel is on branch '$CURRENT_BRANCH', expected '$BRANCH' — skipping pull"
  else
    echo "Pulling latest from caravel $BRANCH branch..."
    git -C "$CLAW_REPO" pull --ff-only origin "$BRANCH" 2>/dev/null || \
      echo "  (pull skipped — may be offline or up to date)"
  fi
fi

# Skills — .claude/skills/<name>/ for every skill in the template.
# Was hardcoded to skills/task only, so any other template skill (task-tree,
# sweep, ...) was tracked in the repo but never installed. WAL-154.
for skill_src in "$SRC_DIR"/skills/*/; do
  [[ -d "$skill_src" ]] || continue
  skill_name="$(basename "$skill_src")"
  skill_dest="${PROJECT_DIR}/.claude/skills/${skill_name}"
  echo "Installing /${skill_name} skill → ${skill_dest#$PROJECT_DIR/}"
  run mkdir -p "$skill_dest"
  [[ -f "$skill_src/SKILL.md" ]] && run cp "$skill_src/SKILL.md" "$skill_dest/SKILL.md"
  if [[ -d "$skill_src/script" ]]; then
    run mkdir -p "$skill_dest/script"
    for f in "$skill_src"script/*; do
      [[ -f "$f" ]] || continue
      run cp "$f" "$skill_dest/script/$(basename "$f")"
      run chmod +x "$skill_dest/script/$(basename "$f")"
    done
  fi
done

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

  # Seed an example profile (agent.json + CLAUDE.md) only when one isn't
  # already present, so a fresh install has a runnable roster but existing
  # profiles are never overwritten.
  example_src="${SRC_DIR}/agents/${agent}"
  profile_dir="${PROJECT_DIR}/agents/${agent}"
  if [[ -d "$example_src" && ! -f "$profile_dir/agent.json" ]]; then
    for f in agent.json CLAUDE.md; do
      [[ -e "$example_src/$f" ]] || continue
      run cp "$example_src/$f" "$profile_dir/$f"
    done
    echo "  seeded example profile agents/${agent}/ (agent.json + CLAUDE.md)"
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
