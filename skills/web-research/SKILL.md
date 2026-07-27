---
name: web-research
description: "Web research — fetch pages and search the web without permission prompts or API keys"
argument-hint: "search <query> | fetch <url> | multi <url1> <url2>"
---

# Web Research

Token-efficient web fetch and search via a single Node.js script (no dependencies, no API key). Runs through bash so it doesn't trigger per-call MCP tool permission prompts.

## Script

```bash
SCRIPT=".claude/skills/web-research/script/web_research.mjs"
```

## Commands

### Search the web

```bash
node $SCRIPT search "postgres index bloat vacuum" --max-results 8
```

Returns: title, URL, and snippet for each result. Uses DuckDuckGo (no API key needed).

### Fetch a single page

```bash
node $SCRIPT fetch https://example.com --max-chars 15000
```

Returns: cleaned text content (HTML stripped, scripts/nav/footer removed). Truncated to `--max-chars` (default 15000) for token efficiency.

### Fetch multiple pages

```bash
node $SCRIPT multi https://example.com https://other.com --max-chars 20000
```

Fetches all URLs in parallel. Total output split evenly across pages within `--max-chars` budget.

## Options

| Option | Default | Description |
|---|---|---|
| `--max-chars N` | 15000 | Max characters of text output (per page for fetch, total for multi) |
| `--max-results N` | 8 | Max search results to return |

## When to use

Use this instead of built-in `WebFetch` / `WebSearch` tools when doing research that requires multiple web requests — it avoids per-call permission prompts and is more token-efficient (strips HTML, truncates).

**Typical research workflow:**
1. `search` to find relevant pages
2. `fetch` the most promising results
3. `multi` to compare several pages at once

## Requirements

Node.js 18+ (uses the built-in `fetch`). No npm install, no API key.

## Limitations

- No JavaScript rendering (won't work on SPAs that require JS to display content)
- DuckDuckGo search may return fewer results than Google for niche queries
- Large pages are truncated — use `--max-chars` to control the budget
- Some sites block automated requests — if a fetch fails, try a different source
