---
name: agent-drive
description: Access Google Drive, Docs, Sheets, and Calendar — read, create, search, and update
argument-hint: "search <name> | read <fileId> | docs-read <docId> | sheets-read <id> <range>"
---

This skill accesses Google Drive, Docs, Sheets, and Calendar using a Node.js helper script. Credentials are shared with the `agent-email` skill.

**Requires Google OAuth2 setup (Option B)** — no App Password path for Drive. See `skills/agent-email/SKILL.md` for the full setup instructions.

## Helper script

```bash
SCRIPT=".claude/skills/agent-drive/script/agent_drive.mjs"
```

Requires Node.js 18+. If auth fails, re-authenticate with:
```bash
node $SCRIPT auth
```

This is the **centralised auth** for all Google APIs (Gmail, Drive, Calendar, Sheets, Docs).

## Setup

Requires a GCP project with OAuth2 credentials. Quick summary:

1. Create a GCP project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the APIs you need: Gmail, Drive, Docs, Sheets, Calendar.
3. OAuth consent screen → External → add your agent account as a test user.
4. Create credentials → OAuth client ID → Desktop app → download JSON as `~/.agent-email/gcp-oauth.keys.json`.
5. Add to `.claude/config.json`:
   ```json
   "agent": {
     "name": "Agent",
     "email": "agent@gmail.com",
     "credentials_dir": "~/.agent-email",
     "email_auth": "oauth"
   }
   ```
6. Mint the token: `node $SCRIPT auth` — visit the printed URL, complete sign-in, paste the `code=` value back.

See `skills/agent-email/SKILL.md` → "Option B" for the full step-by-step.

## Drive commands

```bash
# File metadata
node $SCRIPT get <fileId>

# Read/export file content to stdout (Google Docs export as txt by default)
node $SCRIPT read <fileId> [format]          # format: txt, html, csv, md, pdf

# List files (most recent first)
node $SCRIPT list                             # recent 20 files
node $SCRIPT list "name contains 'Budget'" 10 # Drive search query, max 10

# Search by name
node $SCRIPT search "quarterly report"

# Download to local file (export format inferred from extension)
node $SCRIPT download <fileId> /path/to/output.txt
```

### Extracting file IDs from Google URLs

File IDs are between `/d/` and the next `/` in any Google Docs/Sheets/Drive URL:
```
https://docs.google.com/document/d/FILE_ID_HERE/edit
https://docs.google.com/spreadsheets/d/FILE_ID_HERE/edit
https://drive.google.com/file/d/FILE_ID_HERE/view
```

## Docs commands

```bash
# Read a Google Doc as plain text (extracts from structured content, handles tables)
node $SCRIPT docs-read <docId>

# Create a new Google Doc
node $SCRIPT docs-create "My Document"
node $SCRIPT docs-create "My Document" "Initial content here"

# Append text to end of a document
node $SCRIPT docs-append <docId> "Text to append at the end"

# Insert text at a specific character index
node $SCRIPT docs-insert <docId> 1 "Text at the start"
```

## Sheets commands

```bash
# Spreadsheet metadata (title, sheet names, dimensions)
node $SCRIPT sheets-get <spreadsheetId>

# Read a range (output as TSV)
node $SCRIPT sheets-read <spreadsheetId> "Sheet1!A1:D10"
node $SCRIPT sheets-read <spreadsheetId> "Sheet1"          # entire sheet

# Write values to a range (2D JSON array)
node $SCRIPT sheets-write <spreadsheetId> "Sheet1!A1" '[["Name","Age"],["Alice","30"]]'

# Append rows after last data in range
node $SCRIPT sheets-append <spreadsheetId> "Sheet1!A:D" '[["Bob","25","NZ","Active"]]'

# Create a new spreadsheet
node $SCRIPT sheets-create "My Spreadsheet"
node $SCRIPT sheets-create "My Spreadsheet" "Data Sheet"   # with custom first sheet name
```

## Common workflows

### Read a Google Doc shared via email
1. Extract the file ID from the URL in the email
2. `node $SCRIPT docs-read <fileId>` to read structured content
3. Or `node $SCRIPT download <fileId> /local/path.txt` to save locally

### Find a file by name
1. `node $SCRIPT search "quarterly report"`
2. Note the file ID from results
3. `node $SCRIPT read <fileId>` or `node $SCRIPT docs-read <fileId>`

### Read spreadsheet data for processing
1. `node $SCRIPT sheets-get <id>` to see sheet names and dimensions
2. `node $SCRIPT sheets-read <id> "Sheet1!A1:Z100"` to read data
3. Process data, then write results back if needed

### Create and populate a new spreadsheet
1. `node $SCRIPT sheets-create "Report Title" "Data"`
2. `node $SCRIPT sheets-write <id> "Data!A1" '[["Header1","Header2"],["val1","val2"]]'`

## When to use `read` vs `docs-read`

- **`read`** — Uses the Drive export API. Good for getting raw text quickly. Works for any Google file type (Docs, Sheets as CSV, Slides).
- **`docs-read`** — Uses the Docs API. Better for structured content — handles tables properly (as TSV), preserves document structure. Only works for Google Docs.

For most Google Docs, prefer `docs-read`. For spreadsheets, use `sheets-read` with a range. For other file types or quick exports, use `read`.

## Calendar commands

Calendar defaults to the email address in `user.email` in your config. Pass a different calendar ID to override.

```bash
# Today's events
node $SCRIPT cal-today

# Next 7 days
node $SCRIPT cal-week

# Custom date range
node $SCRIPT cal-range 2026-04-01 2026-04-07

# Full event details (attendees, description, Meet link)
node $SCRIPT cal-get <eventId>

# List all accessible calendars
node $SCRIPT cal-list
```

Calendar access is **read-only**.

## Safety rules

- **Never delete files** from Google Drive
- **Never overwrite existing document content** without reading it first — use `docs-read` or `sheets-read` before writing
- **For shared/team documents**, confirm with the user before writing changes
- **When writing to sheets**, always read the current data first to understand the structure and avoid overwriting
- If a script fails with auth errors, run: `node $SCRIPT auth`

## General rules

- Do not narrate your process — just do it and show the summary
- When downloading files to the repo, save to an appropriate location under `Notes/`
- For large spreadsheets, always specify a range rather than reading entire sheets
- File IDs are stable — if you've resolved one, you can reuse it without searching again
