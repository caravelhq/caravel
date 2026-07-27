---
name: agent-email
description: Monitor and act on the agent's own Gmail inbox
argument-hint: [check | process | reply <messageId> | report]
---

This skill accesses the agent's Gmail inbox using a Node.js helper script. The agent's name, email, and credentials directory are configured in `.claude/config.json` (or via environment variables — see below).

Two auth modes are supported — see **Setup** below.

## Helper script

```bash
SCRIPT=".claude/skills/agent-email/script/agent_email.mjs"
```

Requires Node.js 18+.

```bash
# Search emails (returns formatted summary with message IDs, type DIRECT/CC, sender, subject)
node $SCRIPT search 'is:unread'              # default: unread, max 50
node $SCRIPT search 'is:unread newer_than:1d' 20  # custom query, max 20

# Read a single message (parsed body, headers, labels)
node $SCRIPT read <messageId>

# Read a full thread (all messages with parsed bodies)
node $SCRIPT thread <threadId>

# Print a message's raw text/html part (for extracting links the plain-text body hides)
node $SCRIPT html <messageId>

# Modify labels on a thread or message
node $SCRIPT label <threadId> Processed               # add label
node $SCRIPT label <threadId> Processed --remove UNREAD  # add + remove

# Reply to a message
node $SCRIPT reply <messageId> "Reply text here"

# Send a new email
node $SCRIPT send user@example.com "Subject" "Body text"

# List all labels / IMAP folders
node $SCRIPT labels

# Show auth info (and run OAuth2 setup if needed)
node $SCRIPT auth
```

**Note on message IDs:** In OAuth2 mode, IDs are Gmail REST message IDs (alphanumeric strings). In IMAP mode, IDs are IMAP UIDs (integers) — they are per-mailbox and not globally portable. Use the ID from `search` output in subsequent `read`, `label`, and `reply` calls in the same session.

## Auth modes

The script supports two auth modes, auto-selected from config:

| Mode | How it works | Deps |
|---|---|---|
| `oauth` | Gmail REST API via OAuth2 or service account | None |
| `imap` | Gmail App Password over IMAP (read/search) + SMTP (send) | imapflow + nodemailer |
| `auto` | Uses `imap` if `agent.imap.app_password` is non-empty; else `oauth` | — |

## Setup

### Option A — App Password + IMAP (simpler, no GCP project)

Supports all `agent-email` commands. Does **not** cover `agent-drive`.

1. Enable 2-Step Verification on your Google account.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → generate a 16-char app password.
3. Enable IMAP in Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP.
4. Install Node.js deps: `npm install` in the skill directory.
5. Add to `.claude/config.json`:

```json
"agent": {
  "name": "Agent",
  "email": "you@gmail.com",
  "email_auth": "imap",
  "imap": {
    "user": "you@gmail.com",
    "app_password": "xxxx xxxx xxxx xxxx"
  }
}
```

Verify: `node $SCRIPT auth` then `node $SCRIPT search 'is:unread' 5`

### Option B — Google OAuth2 (full API: Gmail + Drive + Calendar + Sheets)

Required for `agent-drive`. See `skills/agent-drive/SKILL.md` for the OAuth2 setup steps — agent-email shares the same credentials.

Add to `.claude/config.json`:

```json
"agent": {
  "name": "Agent",
  "email": "you@gmail.com",
  "credentials_dir": "~/.agent-email",
  "email_auth": "oauth"
}
```

### Configuration via environment variables

Alternatively, set env vars instead of a config file:

```bash
export AGENT_EMAIL="you@gmail.com"
export AGENT_NAME="Agent"
export AGENT_CREDENTIALS_DIR="~/.agent-email"
export AGENT_EMAIL_AUTH="oauth"          # or "imap" / "auto"
export AGENT_IMAP_USER="you@gmail.com"  # IMAP mode only
export AGENT_IMAP_APP_PASSWORD="xxxx"   # IMAP mode only
```

## Email categories

The agent's inbox typically has two types of email:

### 1. CC'd emails (informational)
The user CCs the agent to provide context. These should be:
- Read and understood
- Filed with label `Processed`
- Key information extracted and noted
- Summarised in the daily note if relevant

### 2. Direct emails (instructions)
Emails sent **directly to** the agent are instructions. These should be:
- Read immediately
- Acted on (create tasks, draft replies, research, update notes)
- Labelled `Processed` once actioned
- Responded to (reply confirming what was done)

## If called without an argument (or with "check")

### 1. Fetch new emails

```bash
node $SCRIPT search 'is:unread'
```

### 2. Categorise and process

For each unread email:

1. **Determine type**: The search output marks each message as `[DIRECT]` or `[CC]`
2. **Read the full message** if the snippet is insufficient
3. **For CC'd emails**: extract key info, mark read + label `Processed`, note anything relevant
4. **For direct emails**: parse the instruction, execute it, reply confirming completion, label `Processed`

### 3. Present summary

**Agent inbox check — [date]**

**Direct instructions received:**
- [sender] — [subject] — [action taken]

**CC'd for context:**
- [original sender] — [subject] — [key info extracted]

**Stats:** X emails processed

## If 'argument' === 'process'

Same as check, but also update daily notes with extracted information and create tasks for any action items.

## If 'argument' === 'reply'

Reply to a specific email from the agent's account. Match the tone of the original; for external recipients, check with the user before sending.

## If 'argument' === 'report'

Generate a summary of all emails processed in the past 7 days:

```bash
node $SCRIPT search 'label:Processed newer_than:7d' 100
```

## Labels

Create these labels on first use if they don't exist:

| Label | Purpose |
|---|---|
| `Processed` | Email has been read and actioned |
| `Action/Pending` | Instruction received but not yet completed |
| `Action/Done` | Instruction completed |

Verify labels exist: `node $SCRIPT labels`

## IMAP mode notes

- `search` passes queries to Gmail's X-GM-RAW extension — most Gmail search syntax works as-is.
- `thread` groups messages by X-GM-THRID (Gmail thread ID extension); pass the thread ID from `search` output.
- `label UNREAD` / `--remove UNREAD` maps to IMAP `\Seen` flag (inverse).
- `label STARRED` maps to IMAP `\Flagged` flag.
- Adding a custom Gmail label copies the message into that IMAP folder (standard Gmail IMAP behaviour).
- Removing a custom label via IMAP is not supported — use the Gmail web interface or switch to OAuth mode.
- `reply` and `send` use SMTP over `smtp.gmail.com:465` with the app password.

## Safety rules

- **Never send emails to external recipients** without the user's explicit approval
- **Never delete emails**
- If an instruction is ambiguous, ask the user for clarification rather than guessing
- If an email contains sensitive information (passwords, financial details, legal), flag it — do not act autonomously
- Always include context about what action was taken when replying

## General rules

- Never show full email bodies in output — subject and one-line summary only
- Process efficiently — batch label operations where possible
- Do not narrate your process — just do it and show the summary
