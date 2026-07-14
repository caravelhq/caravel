#!/usr/bin/env bash
# Restart the Caravel daemon for a consuming project. Pulls the latest
# Caravel source from the configured branch, copies src/ into the plugin
# cache, then bounces the daemon.
#
# NOTE: The CLAUDECLAW_* env vars and the `.claude/plugins/cache/claudeclaw/...`
# plugin-cache path are legacy names that will be renamed to CARAVEL_* in a
# future release. The on-disk state directory (.claude/caravel/ or .claude/claudeclaw/
# for existing installs) is resolved automatically by the daemon — see src/paths.ts.
#
# Configuration (env vars; consuming projects pass via a thin caller):
#   CLAUDECLAW_PROJECT_DIR    (required) Project root the daemon serves.
#   CLAUDECLAW_REPO_DIR       (optional) claudeclaw repo checkout.
#                             Default: <project>/repos/claudeclaw
#   CLAUDECLAW_BRANCH         (optional) Branch to pull. Default: local
#   CLAUDECLAW_BUN            (optional) bun binary. Default: $HOME/.bun/bin/bun
#   CLAUDECLAW_PLUGIN_ENTRY   (optional) Plugin cache entry path.
#                             Default: $HOME/.claude/plugins/cache/claudeclaw/claudeclaw/1.0.0/src/index.ts
#   CLAUDECLAW_LOG_DIR        (optional) Daemon log dir.
#                             Default: <project>/.claude/claudeclaw/logs
#   CLAUDECLAW_WEB_PORT       (optional) Web UI port (display only). Default: 4632
#   CLAUDECLAW_PRESTART_HOOK  (optional) Shell command to run before restart
#                             (e.g. "tailscale up"). Empty = no hook.
#   CLAUDECLAW_SKIP_SYNC      (optional) "1" to skip the git pull + plugin copy.
#
# Args:
#   --stop-only          Stop the daemon, do not restart.
#   --foreground|--attach Run attached in the foreground, streaming logs live
#                        (and appending to daemon.log). Blocks for the life of
#                        the daemon — use for Windows/WSL auto-start. Default is
#                        backgrounded via nohup.
#   -h|--help            Show this header.

set -euo pipefail

: "${CLAUDECLAW_PROJECT_DIR:?CLAUDECLAW_PROJECT_DIR must be set (project root)}"

PROJECT_DIR="$CLAUDECLAW_PROJECT_DIR"
CLAW_REPO="${CLAUDECLAW_REPO_DIR:-${PROJECT_DIR}/repos/claudeclaw}"
BRANCH="${CLAUDECLAW_BRANCH:-local}"
BUN="${CLAUDECLAW_BUN:-${HOME}/.bun/bin/bun}"
CLAW_ENTRY="${CLAUDECLAW_PLUGIN_ENTRY:-${HOME}/.claude/plugins/cache/claudeclaw/claudeclaw/1.0.0/src/index.ts}"
LOG_DIR="${CLAUDECLAW_LOG_DIR:-${PROJECT_DIR}/.claude/caravel/logs}"
WEB_PORT="${CLAUDECLAW_WEB_PORT:-4632}"
PRESTART_HOOK="${CLAUDECLAW_PRESTART_HOOK:-}"
SKIP_SYNC="${CLAUDECLAW_SKIP_SYNC:-0}"

STOP_ONLY=0
FOREGROUND=0
for arg in "$@"; do
  case "$arg" in
    --stop-only) STOP_ONLY=1 ;;
    --foreground|--attach) FOREGROUND=1 ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$PRESTART_HOOK" ]]; then
  echo "Running pre-start hook: $PRESTART_HOOK"
  bash -c "$PRESTART_HOOK" || echo "  (pre-start hook failed; continuing)"
fi

if [[ ! -x "$BUN" ]]; then
  echo "Error: bun not found at $BUN (set CLAUDECLAW_BUN)" >&2
  exit 1
fi

CLAW_SRC_DIR="$(dirname "$CLAW_ENTRY")"

if [[ "$SKIP_SYNC" != "1" ]]; then
  if [[ ! -d "$CLAW_REPO/.git" ]]; then
    echo "Error: claudeclaw repo not found at $CLAW_REPO" >&2
    echo "       clone the claudeclaw fork there or set CLAUDECLAW_REPO_DIR" >&2
    exit 1
  fi

  CURRENT_BRANCH=$(git -C "$CLAW_REPO" branch --show-current)
  if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    echo "Switching claudeclaw repo to $BRANCH branch..."
    git -C "$CLAW_REPO" checkout "$BRANCH"
  fi
  echo "Pulling latest from $BRANCH branch..."
  git -C "$CLAW_REPO" pull --ff-only origin "$BRANCH" 2>/dev/null || \
    echo "  (pull skipped — may be offline or up to date)"

  if [[ ! -d "$CLAW_SRC_DIR" ]]; then
    echo "Error: plugin cache dir not found at $CLAW_SRC_DIR" >&2
    echo "       set CLAUDECLAW_PLUGIN_ENTRY or install the plugin first" >&2
    exit 1
  fi
  echo "Copying src/ from claudeclaw repo to plugin cache..."
  cp -r "$CLAW_REPO/src"/. "$CLAW_SRC_DIR"/

  # Bun.build (used at runtime to bundle browser entries like marked) needs
  # to resolve dependencies declared in the repo's package.json. The plugin
  # cache has the manifest but no node_modules — symlink to the repo's
  # install so we don't duplicate the dependency tree.
  CLAW_CACHE_ROOT="$(dirname "$CLAW_SRC_DIR")"
  if [[ -d "$CLAW_REPO/node_modules" ]]; then
    if [[ ! -e "$CLAW_CACHE_ROOT/node_modules" ]] || \
       [[ "$(readlink "$CLAW_CACHE_ROOT/node_modules" 2>/dev/null)" != "$CLAW_REPO/node_modules" ]]; then
      echo "Linking node_modules into plugin cache..."
      rm -rf "$CLAW_CACHE_ROOT/node_modules"
      ln -s "$CLAW_REPO/node_modules" "$CLAW_CACHE_ROOT/node_modules"
    fi
  else
    echo "  (warning: $CLAW_REPO/node_modules missing — run 'bun install' in the repo)"
  fi
fi

echo "Stopping daemon..."
"$BUN" run "$CLAW_ENTRY" --stop 2>/dev/null || echo "  (no daemon was running)"

if [[ $STOP_ONLY -eq 1 ]]; then
  echo "Done."
  exit 0
fi

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"
if [[ $FOREGROUND -eq 1 ]]; then
  # Foreground / attached mode: run the daemon in the foreground, streaming
  # logs live to this terminal AND appending to daemon.log. The shell blocks
  # here for the life of the daemon, which keeps the launching process (and,
  # under `wsl <cmd>`, the whole WSL instance) alive — required for a Windows
  # auto-start entry like `wsl ~/work/setup/start-claw.sh`. SIGINT/teardown
  # propagates to the daemon for a graceful shutdown (pidfile cleaned).
  echo "Starting daemon (foreground) in ${PROJECT_DIR}..."
  echo "Web UI: http://127.0.0.1:${WEB_PORT}  —  Ctrl-C to stop"
  exec "$BUN" run "$CLAW_ENTRY" start --web 2>&1 | tee -a "${LOG_DIR}/daemon.log"
fi

echo "Starting daemon in ${PROJECT_DIR}..."
nohup "$BUN" run "$CLAW_ENTRY" start --web > "${LOG_DIR}/daemon.log" 2>&1 &

sleep 1
if grep -q "daemon started" "${LOG_DIR}/daemon.log" 2>/dev/null; then
  PID=$(cat "${PROJECT_DIR}/.claude/caravel/daemon.pid" "${PROJECT_DIR}/.claude/claudeclaw/daemon.pid" 2>/dev/null | head -1 || echo "?")
  echo "Caravel running (PID ${PID})"
  echo "Web UI: http://127.0.0.1:${WEB_PORT}"
else
  echo "Check log: ${LOG_DIR}/daemon.log"
fi
