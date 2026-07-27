# ui-test

A deterministic Playwright harness for verifying that UI **actually renders and is visible** — not just present in the DOM. Author a small spec once; run it repeatedly with plain `node`, no API key and no MCP.

## Why

`isVisible()` passing does not mean the user can see an element. An overlay whose CSS was dropped still mounts, still passes `isVisible()`, and renders as an invisible zero/wrong-sized box. This harness makes you assert **expected geometry** (a fullscreen overlay ≈ viewport, a button ≈ its design size) and back it with a screenshot you read. See `SKILL.md` → "assert EXPECTED GEOMETRY".

## Install

```bash
npm install
npx playwright install --with-deps chromium   # --with-deps needs sudo for OS libs
```

## Two modes

### Mode A — Scaffold into a product repo (recommended)

Run `init` once per repo to install a portable, self-contained harness with no ongoing skill dependency.

```bash
# Scaffold into a product repo:
bash skills/ui-test/script/ui-test.sh init /path/to/repo

# Or directly:
node skills/ui-test/script/scaffold.mjs /path/to/repo

# Then in the repo:
cd /path/to/repo/tests/ui
npm install
npx playwright install --with-deps chromium
node run.mjs --out .runs/smoke specs/_example.smoke.mjs
```

See `SKILL.md` → Mode A for credential env vars and update workflow.

### Mode B — Run in-skill (ad-hoc)

```bash
# App shell smoke test:
node playwright/specs/_example.smoke.mjs --out .runs/smoke --headed

# The geometry lesson (adapt the selector to a real element first):
node playwright/specs/_example.geometry.mjs --out .runs/geom --headed

# Aggregate a whole directory into one report.md:
node playwright/run.mjs --out .runs --dir playwright/specs
```

Point specs at your app by editing `config/apps.json` (URL + viewport). For apps that need login, configure credentials in `.claude/config.json#ui-test.<app>` or pass via env vars. See `SKILL.md` → Config.

## Files

| Path | Purpose |
|---|---|
| `SKILL.md` | Full skill doc — workflow, geometry lesson, both modes. |
| `script/scaffold.mjs` | `init` command: scaffolds `tests/ui/` into a target repo. |
| `script/ui-test.sh` | Thin wrapper — exposes `init` subcommand + batch runner passthrough. |
| `script/config.mjs` | In-skill config: reads per-app URL/credentials from `.claude/config.json`. |
| `playwright/lib/harness.mjs` | `runTest()` — launches Chromium, runs steps, screenshots, writes result JSON. |
| `playwright/lib/auth.mjs` | Generic email/password login helper (adapt selectors to your app). |
| `playwright/run.mjs` | Runs one or more specs, aggregates a `report.md`. |
| `playwright/specs/_example.*.mjs` | Copy-me templates. |
| `playwright/snippets/` | Reusable flow fragments + `SNIPPETS.md` index. |
| `config/apps.json` | Per-app URL + viewport defaults (in-skill mode). |
