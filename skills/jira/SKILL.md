---
name: jira
description: Manage Jira tickets — view, search, comment, transition, create, edit, and assign.
argument-hint: "[Action] [Jira Ticket] [Comment]"
---

This skill provides you with the ability to query and update Jira tickets using a pure Node.js REST client (no binary dependencies, Node 18+).

**Important:** Always run the script using a path relative to your project root. Do not `cd` into the skill directory.

After executing any action, update your task board and memory files accordingly.

## Setup

### 1. Get an API token

Go to https://id.atlassian.com/manage-profile/security/api-tokens, click "Create API token", label it (e.g. "my-assistant"), and copy the token — it's only shown once.

### 2. Configure credentials

**Option A — environment variables (recommended for CI or shared installs):**
```bash
export ATLASSIAN_EMAIL="you@example.com"
export ATLASSIAN_API_TOKEN="your-token"
export ATLASSIAN_SITE="your-org.atlassian.net"
```

**Option B — `config.json` at your project root (gitignore this file):**
```json
{
  "atlassian": {
    "email": "you@example.com",
    "token": "your-token",
    "site": "your-org.atlassian.net"
  }
}
```

**Option C — `~/.atlassian-token.json` (per-user, any project):**
```json
{
  "email": "you@example.com",
  "token": "your-token",
  "site": "your-org.atlassian.net"
}
```

Credentials are checked in the order: env vars → `ATLASSIAN_CONFIG` env var → `config.json` → `~/.atlassian-token.json`.

### 3. Optional: Bitbucket credentials

If you use Bitbucket and want separate credentials (Atlassian API tokens can be scoped per app):
```json
{
  "atlassian": {
    "email": "you@example.com",
    "token": "jira-token",
    "site": "your-org.atlassian.net",
    "bitbucketToken": "bitbucket-token",
    "bitbucketEmail": "you@example.com"
  }
}
```

### 4. Scoped API tokens (advanced)

If you use a scoped Atlassian API token (available on some plans), add your Cloud ID to config — find it at `https://<your-site>/_edge/tenant_info`:
```json
{
  "atlassian": {
    "cloudId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "email": "you@example.com",
    "token": "your-scoped-token",
    "site": "your-org.atlassian.net"
  }
}
```

### 5. Test
```bash
bash skills/jira/script/jira_rest.sh search 'project = OPS AND status not in (Done) ORDER BY updated DESC'
```

---

## Script commands reference

```
bash skills/jira/script/jira_rest.sh view <KEY>                              # view a single ticket
bash skills/jira/script/jira_rest.sh search '<JQL>'                          # search (max 10 results)
bash skills/jira/script/jira_rest.sh comment <KEY> <body text>               # add comment
bash skills/jira/script/jira_rest.sh transition <KEY> <status>               # move ticket status
bash skills/jira/script/jira_rest.sh create <PROJECT> <TYPE> <summary text>  # create ticket (auto-assigns to me)
bash skills/jira/script/jira_rest.sh edit <KEY> --summary "..." --labels "." # edit ticket
bash skills/jira/script/jira_rest.sh assign <KEY> [assignee]                 # assign ticket (defaults to @me)
```

## Bitbucket (via same Node.js client)

```
node skills/jira/script/atlassian_api.mjs bitbucket pr-create <workspace/repo> <source> <dest> <title> [body]
node skills/jira/script/atlassian_api.mjs bitbucket pr-list <workspace/repo>
```

## JQL quick reference

Use `not in` instead of `!=` for status filters.

```
# My open work, most recently updated first
assignee = currentUser() AND status not in (Done) ORDER BY updated DESC

# Tickets due this week
assignee = currentUser() AND due >= startOfWeek() AND due <= endOfWeek()

# High-priority items in a project
project = PROJ AND priority in (High, Highest) AND status not in (Done)

# Recently created in last 7 days
project = PROJ AND created >= -7d ORDER BY created DESC

# Sprint work
sprint in openSprints() AND assignee = currentUser()

# Open operational/admin tasks
project = OPS AND status not in (Done) ORDER BY updated DESC

# Recently created operational tasks
project = OPS AND created >= -7d ORDER BY created DESC
```

Replace `OPS` and `PROJ` with your actual Jira project keys.

## Syncing the TaskBoard

After any action that retrieves or changes tickets (search, view, create, transition), update `Notes/TaskBoard.md` to reflect the current Jira state. Group Jira tickets by project and status under headed sections using the format `## Jira — <PROJECT> — <Status>` (e.g. `## Jira — PROJ — In Progress`, `## Jira — OPS — To Do`). Preserve any non-Jira items under `## Other`. Use the format:

```
- [ ] <KEY> — Summary text
```

Mark completed/done tickets with `- [x]`. Remove tickets that no longer appear in Jira results.

## Project key conventions (adapt to your setup)

The example project keys used throughout this skill are:
- `PROJ` — product development (features, bugs, spikes)
- `OPS` — administrative & operational tasks (business ops, follow-ups, internal tasks)

Replace these with your actual Jira project keys.

## If the user calls without an argument

- Search for open work across your projects:
  ```
  bash skills/jira/script/jira_rest.sh search 'assignee = currentUser() AND project = PROJ AND status not in (Done) ORDER BY updated DESC'
  bash skills/jira/script/jira_rest.sh search 'assignee = currentUser() AND project = OPS AND status not in (Done) ORDER BY updated DESC'
  ```
- Review the results and provide a summary of outstanding work, grouped by project.
- Update `Notes/TaskBoard.md` with the current ticket state.

## If 'Action' === 'view'

- Run: `bash skills/jira/script/jira_rest.sh view <KEY>`
- Extract and summarise:
  1. Description and acceptance criteria
  2. Recent comments (focus on last 1-2 updates)
  3. Current status, assignee, priority
  4. Attachments if available

## If 'Action' === 'comment'

- Second argument is the Jira ticket key.
- If a third argument is provided, that is the comment body.
- If no comment body, suggest one based on recent context or ask the user.
- Submit: `bash skills/jira/script/jira_rest.sh comment <KEY> <body>`

## If 'Action' === 'transition'

- Second argument is the ticket key, third is the target status name.
- Common statuses: "To Do", "In Progress", "Done" (project-specific — check if unsure).
- Run: `bash skills/jira/script/jira_rest.sh transition <KEY> "<status>"`

## If 'Action' === 'create'

- Ask the user for: project key, type (Task/Bug/Story), and summary.
- Before creating, search for existing tickets with similar summary in the same project. If a near-duplicate exists, surface it to the user instead of creating.
- Run: `bash skills/jira/script/jira_rest.sh create <PROJECT> <TYPE> <summary>`
- For description or labels, use edit after creation:
  `bash skills/jira/script/jira_rest.sh edit <KEY> --description "..." --labels "label1,label2"`

## If 'Action' === 'edit'

- Second argument is the ticket key.
- Pass any edit flags: `--summary`, `--description`, `--labels`, `--assignee`.
- Example: `bash skills/jira/script/jira_rest.sh edit OPS-45 --summary "Updated title" --labels "urgent"`

## If 'Action' === 'assign'

- Second argument is the ticket key.
- Optional third argument is the assignee email (defaults to @me).
- Run: `bash skills/jira/script/jira_rest.sh assign <KEY> [assignee]`

## If 'Action' === 'plan'

- Get a single ticket (if specified) or search for current/due tickets.
- Create a summary of ticket requirements.
- Propose priorities and suggest a plan of execution.

Do not narrate steps. Execute directly.
