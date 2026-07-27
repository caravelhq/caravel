---
description: Never restart the multi-agent runner daemon without the user's explicit permission in this session
---

# Runner daemon restart rule

**Never restart the multi-agent runner daemon without explicit permission from the user.**

The daemon hosts the runner that's actively claiming and processing task envelopes. Restarting it interrupts in-flight worker runs, drops claimed leases mid-turn, and can corrupt envelope state if a worker was about to write its rendezvous `.md`.

## What counts as a restart

- Any restart script (`restart-*.sh`) against the live install
- `kill <daemon-pid>` followed by re-launch
- Starting a new instance with `--replace-existing` against the live install
- Any start/stop skill that cycles the daemon

## When to restart

Only when the user says so, **in this session** — explicit go-ahead like "go ahead and restart", "you can restart now".

A user instruction from a *prior* session does not carry over. If you've been working on a change that needs a restart to land (a code change the runner reads at boot, an updated rule), **stage the work, commit it, and tell the user the restart command**. Don't run it.

## When NOT to restart

- After landing a code change. Tell the user the change is ready and what command picks it up.
- After updating a template or shared rule. Same — surface the install/restart command.
- "Just to clear state" / "to verify it works" — never restart for testing without explicit permission.
- When agents are visibly busy or there's a `claimed` / `in_progress` envelope. Even with permission, double-check first.

## How to surface a needed restart

When a change is ready and a restart would activate it, end your turn with a clear note:

> Code is committed. To activate, run: `<restart command>`
> Holding off on running this — say the word.

Don't bury the command in a long status report. Don't pre-stage it in a tool call. Don't auto-trigger after a code change "to be safe."

## Diagnostic exceptions

Inspecting state, reading logs, or hitting the HTTP API is not a restart and doesn't need permission:

- Tailing the daemon logs
- Curling the local HTTP API
- Reading `agents/<x>/tasks/...` files
- Checking `ps -p <pid>` for liveness

These are read-only; use them freely.
