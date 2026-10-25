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
#   --force     Overwrite managed files that have local edits since the last
#               install. Default: abort rather than destroy local changes.
#   --adopt-existing
#               Keep the workspace copies of any divergent managed files and
#               record them as the install baseline. Use once when migrating
#               an existing workspace onto the manifest.
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
FORCE=0
ADOPT_EXISTING=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) NO_PULL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --adopt-existing) ADOPT_EXISTING=1 ;;
    -h|--help)
      sed -n '2,35p' "$0"
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

if [[ ! -e "$CLAW_REPO/.git" ]]; then
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

# ── Install manifest ────────────────────────────────────────────────────────
# The gate compares each destination against WHAT THE INSTALLER LAST WROTE,
# recorded in .caravel/install-manifest.sha256 — not against the template.
#
# Comparing against the template was wrong: the template is deliberately
# generic ("the user", generic project names) while a live workspace is
# install-specific, so the two differ permanently and the gate fired on every
# run. That made --force mandatory to use the tool at all, which is no gate.
#
# Classification per managed file:
#   new        destination absent                      -> write
#   clean      matches last-installed hash             -> write (template may differ; fine)
#   adopt      no manifest entry, identical to template-> write + record
#   modified   has entry, content changed since install-> CONFLICT (locally edited)
#   unmanaged  no entry, differs from template         -> CONFLICT (unknown provenance)
#   pinned     adopted via --adopt-existing             -> keep workspace copy
#
# A pinned entry means "this workspace owns this file" and survives every
# refresh until --force explicitly unpins it. Without pinning, --adopt-existing
# would only defer the overwrite by one run, which is worse than no flag.
MANIFEST="${PROJECT_DIR}/.caravel/install-manifest.sha256"
CONFLICTS=0
declare -a WRITE_SRC=()    # parallel arrays of files cleared to write
declare -a WRITE_DST=()
declare -a KEEP_HASHES=()  # manifest lines to carry forward untouched

hash_of() { sha256sum "$1" | cut -d' ' -f1; }
rel_of()  { echo "${1#$PROJECT_DIR/}"; }

manifest_lookup() {
  [[ -f "$MANIFEST" ]] || return 0
  local rel="$1" line
  while IFS= read -r line; do
    [[ "${line#*  }" == "$rel" ]] && { echo "${line%%  *}"; return 0; }
  done < "$MANIFEST"
}

classify() {
  local src="$1" dst="$2" rel rec cur
  rel="$(rel_of "$dst")"
  if [[ ! -f "$dst" ]]; then echo new; return; fi
  rec="$(manifest_lookup "$rel")"
  cur="$(hash_of "$dst")"
  if [[ "$rec" == pinned:* ]]; then echo pinned; return; fi
  if [[ -z "$rec" ]]; then
    cmp -s "$src" "$dst" && echo adopt || echo unmanaged
  elif [[ "$cur" == "$rec" ]]; then
    echo clean
  else
    echo modified
  fi
}

plan_file() {
  local src="$1" dst="$2" verdict
  verdict="$(classify "$src" "$dst")"
  case "$verdict" in
    pinned)
      if [[ $FORCE -eq 1 ]]; then
        WRITE_SRC+=("$src"); WRITE_DST+=("$dst")
        echo "  unpinning and overwriting: $(rel_of "$dst")" >&2
      else
        KEEP_HASHES+=("pinned:$(hash_of "$dst")  $(rel_of "$dst")")
        echo "  pinned (keeping workspace copy): $(rel_of "$dst")"
      fi ;;
    new|clean|adopt)
      WRITE_SRC+=("$src"); WRITE_DST+=("$dst") ;;
    modified|unmanaged)
      if [[ $ADOPT_EXISTING -eq 1 ]]; then
        # Baseline the workspace as-is: do not overwrite, just record its hash
        # so future runs can tell a real local edit from template movement.
        KEEP_HASHES+=("pinned:$(hash_of "$dst")  $(rel_of "$dst")")
        echo "  adopting existing: $(rel_of "$dst") (not overwritten)"
      elif [[ $FORCE -eq 1 ]]; then
        WRITE_SRC+=("$src"); WRITE_DST+=("$dst")
        echo "  overwriting ($verdict): $(rel_of "$dst")" >&2
      else
        echo "  conflict ($verdict): $(rel_of "$dst")" >&2
        [[ "$verdict" == modified ]] && \
          echo "            locally edited since the last install" >&2 || \
          echo "            not installed by this tool and differs from the template" >&2
        KEEP_HASHES+=("$(manifest_lookup "$(rel_of "$dst")")  $(rel_of "$dst")")
        CONFLICTS=$((CONFLICTS + 1))
      fi ;;
  esac
}

for skill_src in "$SRC_DIR"/skills/*/; do
  [[ -d "$skill_src" ]] || continue
  skill_dest="${PROJECT_DIR}/.claude/skills/$(basename "$skill_src")"
  [[ -f "$skill_src/SKILL.md" ]] && plan_file "$skill_src/SKILL.md" "$skill_dest/SKILL.md"
  if [[ -d "$skill_src/script" ]]; then
    for f in "$skill_src"script/*; do
      [[ -f "$f" ]] || continue
      plan_file "$f" "$skill_dest/script/$(basename "$f")"
    done
  fi
done

[[ -f "$SRC_DIR/shared/task-envelope.md" ]] && \
  plan_file "$SRC_DIR/shared/task-envelope.md" "$DEST_SHARED/task-envelope.md"

if [[ -d "$SRC_DIR/shared/rules" ]]; then
  for f in "$SRC_DIR"/shared/rules/*.md; do
    [[ -e "$f" ]] || continue
    plan_file "$f" "$DEST_SHARED/rules/$(basename "$f")"
  done
fi

if [[ $CONFLICTS -gt 0 ]]; then
  echo >&2
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "Dry run — $CONFLICTS file(s) would be SKIPPED as locally modified." >&2
  else
    echo "Error: $CONFLICTS managed file(s) have local edits since the last install." >&2
    echo "       Re-run with --force to overwrite them, or --adopt-existing to keep" >&2
    echo "       the workspace copies and baseline them for future runs." >&2
    exit 1
  fi
fi

# ── Execute the write plan ──────────────────────────────────────────────────
# Only files cleared by plan_file() are written. Everything written has its
# resulting hash recorded in the manifest, so the next run can distinguish a
# local edit from the template simply having moved on.
NEW_HASHES=()
if [[ ${#WRITE_SRC[@]} -gt 0 ]]; then
  echo "Installing ${#WRITE_SRC[@]} managed file(s)..."
  for idx in "${!WRITE_SRC[@]}"; do
    src="${WRITE_SRC[$idx]}"; dst="${WRITE_DST[$idx]}"
    echo "  ${dst#$PROJECT_DIR/}"
    run mkdir -p "$(dirname "$dst")"
    run cp "$src" "$dst"
    [[ "$dst" == *"/script/"* ]] && run chmod +x "$dst"
    if [[ $DRY_RUN -eq 0 ]]; then
      NEW_HASHES+=("$(hash_of "$src")  $(rel_of "$dst")")
    fi
  done
else
  echo "No managed files needed writing."
fi

# Envelope examples are additive reference material, not tracked by the manifest.
if [[ -d "$SRC_DIR/shared/task-envelope-examples" ]]; then
  run mkdir -p "$DEST_SHARED/task-envelope-examples"
  for f in "$SRC_DIR"/shared/task-envelope-examples/*; do
    [[ -f "$f" ]] || continue
    run cp "$f" "$DEST_SHARED/task-envelope-examples/$(basename "$f")"
  done
fi

# Write the manifest: freshly-written files plus any carried-forward entries
# for files we deliberately left alone.
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$(dirname "$MANIFEST")"
  { for h in "${NEW_HASHES[@]}";  do [[ -n "$h" ]] && echo "$h"; done
    for h in "${KEEP_HASHES[@]}"; do [[ -n "${h%%  *}" ]] && echo "$h"; done
  } | sort -u -k2 > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"
  echo "Manifest: ${MANIFEST#$PROJECT_DIR/} ($(wc -l < "$MANIFEST") entries)"
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
