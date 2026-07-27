#!/usr/bin/env bash
# jira_rest.sh — Jira CLI wrapper using Node.js REST client
# Usage: jira_rest.sh <command> <args>
# Delegates to atlassian_api.mjs for all operations

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
NODE_SCRIPT="$SCRIPT_DIR/atlassian_api.mjs"

cmd="$1"
shift || true

node "$NODE_SCRIPT" jira "$cmd" "$@"
