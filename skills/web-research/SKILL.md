---
name: web-research
description: "Web research — fetch pages and search the web without permission prompts or API keys"
argument-hint: "search <query> | fetch <url> | multi <url1> <url2> | usage"
---

# Web Research

Token-efficient web fetch and search via a single Node.js script (no npm dependencies). Runs through bash so it doesn't trigger per-call MCP tool permission prompts.

## Script

```bash
SCRIPT=".claude/skills/web-research/script/web_research.mjs"
```

## Commands

### Search the web

```bash
node $SCRIPT search "postgres index bloat vacuum" --max-results 8
```

Returns: title, URL, and snippet for each result. Uses a provider chain (default: tavily → brave → scrape). First configured provider with results wins; falls through automatically on error, rate-limit, or empty results.

```bash
# Force a specific provider
node $SCRIPT search "query" --provider scrape
node $SCRIPT search "query" --provider tavily
node $SCRIPT search "query" --provider brave
```

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

### Check usage

```bash
node $SCRIPT usage
```

Prints month-to-date call counts per provider vs their monthly caps. Warns at >=80%.

## Options

| Option | Default | Description |
|---|---|---|
| `--max-chars N` | 15000 | Max characters of text output (per page for fetch, total for multi) |
| `--max-results N` | 8 | Max search results to return |
| `--provider NAME` | (chain) | Force a specific provider: `tavily`, `brave`, or `scrape` |

## Providers

### scrape (keyless, always-on)

Falls back through DDG Lite → DDG HTML → Bing. No API key, no config. Works out of the box with Node.js 18+.

### tavily (recommended if available)

Tavily Search API — structured results, optional AI answer. Free tier: 1000 searches/month.

1. Sign up at [app.tavily.com](https://app.tavily.com)
2. Add to `.claude/config.json`: `"web-research": { "tavily": { "api_key": "tvly-..." } }`
3. Or set env var: `TAVILY_API_KEY=tvly-...`

### brave

Brave Search API — clean results, independent index. Free tier: 2000 searches/month (credit card required even at $0).

1. Sign up at [brave.com/search/api](https://brave.com/search/api)
2. Add to `.claude/config.json`: `"web-research": { "brave": { "api_key": "BSA..." } }`
3. Or set env var: `BRAVE_API_KEY=BSA...`

## Config block

Add to `.claude/config.json`:

```json
"web-research": {
  "provider_order": ["tavily", "brave", "scrape"],
  "tavily": { "api_key": "" },
  "brave":  { "api_key": "" },
  "monthly_caps": { "tavily": 1000, "brave": 2000 }
}
```

Providers with empty keys are silently skipped. `provider_order` controls the failover chain.

## Usage monitoring

Each search call appends one JSONL record to `.caravel/web-research-usage.jsonl`:

```json
{"ts":"2026-07-27T10:00:00.000Z","provider":"scrape","status":"ok","result_count":8,"latency_ms":340,"query":"vue 3 ref vs reactive"}
```

Status values: `ok`, `failover`, `error`, `skipped-cap`.

## Requirements

Node.js 18+ (uses the built-in `fetch`). No npm install required. API keys are optional.

## When to use

Use this instead of built-in `WebFetch` / `WebSearch` tools when doing research that requires multiple web requests — it avoids per-call permission prompts and is more token-efficient (strips HTML, truncates).

**Typical research workflow:**
1. `search` to find relevant pages
2. `fetch` the most promising results
3. `multi` to compare several pages at once

## Limitations

- No JavaScript rendering (won't work on SPAs that require JS to display content)
- `scrape` path may return fewer results than paid APIs for niche queries
- Large pages are truncated — use `--max-chars` to control the budget
- Some sites block automated requests — if a fetch fails, try a different source
