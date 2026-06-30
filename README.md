<p align="center">
  <img src="images/claudeclaw-banner.svg" alt="ClaudeClaw Banner" />
</p>
<p align="center">
  <img src="images/claudeclaw-wordmark.png" alt="ClaudeClaw Wordmark" />
</p>

<p align="center">
  <img src="https://awesome.re/badge.svg" alt="Awesome" />
  <a href="https://github.com/moazbuilds/ClaudeClaw/stargazers">
    <img src="https://img.shields.io/github/stars/moazbuilds/ClaudeClaw?style=flat-square&color=f59e0b" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/moazbuilds/ClaudeClaw">
    <img src="https://img.shields.io/badge/downloads-~10k-2da44e?style=flat-square" alt="Downloads ~10k" />
  </a>
  <a href="https://github.com/moazbuilds/ClaudeClaw/commits/master">
    <img src="https://img.shields.io/github/last-commit/moazbuilds/ClaudeClaw?style=flat-square&color=0ea5e9" alt="Last Commit" />
  </a>
  <a href="https://github.com/moazbuilds/ClaudeClaw/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/moazbuilds/ClaudeClaw?style=flat-square&color=a855f7" alt="Contributors" />
  </a>
  <a href="https://x.com/moazbuilds">
    <img src="https://img.shields.io/badge/X-%40moazbuilds-000000?style=flat-square&logo=x" alt="X @moazbuilds" />
  </a>
</p>

<p align="center"><b>A lightweight, open-source OpenClaw version built into your Claude Code.</b></p>

ClaudeClaw turns your Claude Code into a personal assistant that never sleeps. It runs as a background daemon, executing tasks on a schedule, responding to messages on Telegram and Discord, transcribing voice commands, and integrating with any service you need.

> Note: Please don't use ClaudeClaw for hacking any bank system or doing any illegal activities. Thank you.

## Why ClaudeClaw?

| Category | ClaudeClaw | OpenClaw |
| --- | --- | --- |
| Anthropic Will Come After You | No | Yes |
| API Overhead | Directly uses your Claude Code subscription | Nightmare |
| Setup & Installation | ~5 minutes | Nightmare |
| Deployment | Install Claude Code on any device or VPS and run | Nightmare |
| Isolation Model | Folder-based and isolated as needed | Global by default (security nightmare) |
| Reliability | Simple reliable system for agents | Bugs nightmare |
| Feature Scope | Lightweight features you actually use | 600k+ LOC nightmare |
| Security | Average Claude Code usage | Nightmare |
| Cost Efficiency | Efficient usage | Nightmare |
| Memory | Uses Claude internal memory system + `CLAUDE.md` | Nightmare |

## Getting Started in 5 Minutes

```bash
claude plugin marketplace add moazbuilds/claudeclaw
claude plugin install claudeclaw
```
Then open a Claude Code session and run:
```
/claudeclaw:start
```
The setup wizard walks you through model, heartbeat, Telegram, Discord, and security, then your daemon is live with a web dashboard.

## Run from source (clone and run)

If you'd rather run this fork directly instead of installing it as a plugin:

```bash
git clone https://github.com/<your-org>/claudeclaw.git
cd claudeclaw
bun install
bun run start --web        # starts the daemon + web dashboard on http://127.0.0.1:4632
```

All configuration and secrets live in `.claude/claudeclaw/settings.json` (Telegram/Discord tokens, model selection, security level, web host/port). That directory is gitignored — nothing sensitive is ever committed. The first `start` writes a default settings file you can edit, or run `/claudeclaw:start` inside a Claude Code session to use the setup wizard.

Requirements: [Bun](https://bun.sh) and the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) on your PATH.

## Multi-agent mode

This fork adds a **multi-agent task system** on top of the daemon. Instead of one assistant, you define a roster of agents — each with its own identity, rules, and memory — and dispatch work to them as tasks. A coordinator agent triages requests, hands tasks to specialists, and consolidates the results. The dashboard shows every agent's queue, and tasks flow through `open → claimed → done/failed/waiting` buckets on disk.

### How it works

- **Agents live on disk.** Each agent is a directory at `agents/<name>/` containing `agent.json` (manifest: name, display name, emoji, description) and `CLAUDE.md` (its identity prompt). Optional `rules/*.md` and `memory/` are picked up automatically. The roster is derived from this directory — add an agent and it appears everywhere (runner, dashboard, task picker) with no code changes.
- **Tasks are YAML envelopes.** Each agent has `tasks/{open,done,failed,waiting}/` and an append-only `journal.ndjson`. The runner claims open tasks, spawns the agent to work them, and moves the file as the status changes.
- **The coordinator** (named `alice` by default) receives consolidated continuations when a family of dispatched sub-tasks completes. Keep one coordinator in your roster.

### Set it up

```bash
# from your project root (the directory the daemon runs in)
CLAUDECLAW_PROJECT_DIR="$PWD" \
CLAUDECLAW_REPO_DIR="/path/to/claudeclaw" \
CLAUDECLAW_AGENTS="alice bob ray" \
  bash /path/to/claudeclaw/scripts/install-multi-agent.sh
```

This scaffolds the `/task` skill, the shared task-envelope spec, and per-agent `tasks/` directories. For any agent name that doesn't already have a profile, it seeds an example one (coordinator / builder / researcher) from `multi-agent/template/agents/` so you start with a runnable roster. Edit those profiles — or add your own under `agents/<name>/` — to define your team. Enable the runner with `CLAUDECLAW_MULTI_AGENT_RUNNER=1`.

See [`multi-agent/README.md`](multi-agent/README.md) for the full task-envelope schema and dispatch model.

## What Would Be Built Next?

> **Mega Post:** Help shape the next ClaudeClaw features.
> Vote, suggest ideas, and discuss priorities in **[this post](https://github.com/moazbuilds/claudeclaw/issues/14)**.

<p align="center">
  <a href="https://github.com/moazbuilds/claudeclaw/issues/14">
    <img src="https://img.shields.io/badge/Roadmap-Mega%20Post-blue?style=for-the-badge&logo=github" alt="Roadmap Mega Post" />
  </a>
</p>

## Features

### Automation
- **Heartbeat:** Periodic check-ins with configurable intervals, quiet hours, and editable prompts.
- **Cron Jobs:** Timezone-aware schedules for repeating or one-time tasks with reliable execution.

### Communication
- **Telegram:** Text, image, and voice support.
- **Discord:** DMs, server mentions/replies, slash commands, voice messages, and image attachments.
- **Time Awareness:** Message time prefixes help the agent understand delays and daily patterns.

### Multi-Session Threads (Discord)
- **Independent Thread Sessions:** Each Discord thread gets its own Claude CLI session, fully isolated from the main channel.
- **Parallel Processing:** Thread conversations run concurrently — messages in different threads don't block each other.
- **Auto-Create:** First message in a new thread automatically bootstraps a fresh session. No setup needed.
- **Session Cleanup:** Thread sessions are automatically cleaned up when threads are deleted or archived.
- **Backward Compatible:** DMs and main channel messages continue using the global session.

See [docs/MULTI_SESSION.md](docs/MULTI_SESSION.md) for technical details.

### Reliability and Control
- **GLM Fallback:** Automatically continue with GLM models if your primary limit is reached.
- **Web Dashboard:** Manage jobs, monitor runs, and inspect logs in real time.
- **Security Levels:** Four access levels from read-only to full system access.
- **Model Selection:** Switch models based on your workload.

## FAQ

<details open>
  <summary><strong>Can ClaudeClaw do &lt;something&gt;?</strong></summary>
  <p>
    If Claude Code can do it, ClaudeClaw can do it too. ClaudeClaw adds cron jobs,
    heartbeats, and Telegram/Discord bridges on top. You can also give your ClaudeClaw new
    skills and teach it custom workflows.
  </p>
</details>

<details open>
  <summary><strong>Is this project breaking Anthropic ToS?</strong></summary>
  <p>
    No. ClaudeClaw is local usage inside the Claude Code ecosystem. It wraps Claude Code
    directly and does not require third-party OAuth outside that flow.
    If you build your own scripts to do the same thing, it would be the same.
  </p>
</details>

<details open>
  <summary><strong>Will Anthropic sue you for building ClaudeClaw?</strong></summary>
  <p>
    I hope not.
  </p>
</details>

<details open>
  <summary><strong>Are you ready to change this project name?</strong></summary>
  <p>
    If it bothers Anthropic, I might rename it to OpenClawd. Not sure yet.
  </p>
</details>

## Screenshots

### Claude Code Folder-Based Status Bar
![Claude Code folder-based status bar](images/bar.png)

### Cool UI to Manage and Check Your ClaudeClaw
![Cool UI to manage and check your ClaudeClaw](images/dashboard.png)

## Contributors

Thanks for helping make ClaudeClaw better.

<a href="https://github.com/moazbuilds/claudeclaw/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=moazbuilds/claudeclaw" />
</a>
