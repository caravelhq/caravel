# ui-test

A deterministic Playwright harness for verifying that UI **actually renders and is visible** — not just present in the DOM. Author a small spec once; run it repeatedly with plain `node`, no API key and no MCP.

## Why

`isVisible()` passing does not mean the user can see an element. An overlay whose CSS was dropped still mounts, still passes `isVisible()`, and renders as an invisible zero/wrong-sized box. This harness makes you assert **expected geometry** (a fullscreen overlay ≈ viewport, a button ≈ its design size) and back it with a screenshot you read. See `SKILL.md` → "assert EXPECTED GEOMETRY".

## Install

```bash
npm install
npx playwright install --with-deps chromium   # --with-deps needs sudo for OS libs
```

## Run the examples

```bash
# App shell smoke test:
node playwright/specs/_example.smoke.mjs --out .runs/smoke --headed

# The geometry lesson (adapt the selector to a real element first):
node playwright/specs/_example.geometry.mjs --out .runs/geom --headed

# Aggregate a whole directory into one report.md:
node playwright/run.mjs --out .runs --dir playwright/specs
```

Point specs at your app by editing `config/apps.json` (URL + viewport) and, for apps that need login, `.claude/config.json#ui-test.<app>` (credentials — keep secrets in env vars). See `SKILL.md` → Config.

## Files

| Path | Purpose |
|---|---|
| `SKILL.md` | Full skill doc — the workflow, the geometry lesson, authoring gotchas. |
| `playwright/lib/harness.mjs` | `runTest()` — launches Chromium, runs steps, screenshots, writes result JSON. |
| `playwright/lib/auth.mjs` | Generic email/password login helper (adapt selectors to your app). |
| `playwright/run.mjs` | Runs one or more specs, aggregates a `report.md`. |
| `playwright/specs/_example.*.mjs` | Copy-me templates. |
| `playwright/snippets/` | Reusable flow fragments + `SNIPPETS.md` index. |
| `script/config.mjs` | Reads per-app URL/credentials from project config. |
| `config/apps.json` | Per-app URL + viewport defaults. |
