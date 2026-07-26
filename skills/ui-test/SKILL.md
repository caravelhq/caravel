---
name: ui-test
description: Drive a live web build in a real browser (Playwright) to verify UI actually works — elements render and are VISIBLE, flows complete, no console errors — via deterministic plain-node scripts. No API key, no MCP. Captures screenshots + a per-test pass/fail report. Works against any local or dev build.
argument-hint: "[--app <name>] [--persona <name>] [--viewport mobile|desktop] [--specs <dir>] [--start-app] [--dry-run]"
---

Drive a running build in a real browser and assert it works. **The thinking happens once — when authoring a spec. Running the spec is plain `node` + Playwright: deterministic, repeatable, no per-step model calls.**

## The workflow: write a spec, run it, read the evidence

One mechanism, nothing to configure between engines:

1. **Write a spec** — a plain `.mjs` under `playwright/specs/` using the `runTest()` harness. It's ordinary Playwright: navigate, click, and **assert visibility**, screenshotting each step.
2. **Run it** — `node playwright/run.mjs --out <dir> <spec.mjs>` (or run the spec file directly). Playwright launches Chromium headless, walks the steps, captures console errors + screenshots, and writes `results/{id}.json` + a `report.md`.
3. **Read the evidence** — pass/fail JSON, `report.md`, and PNG screenshots. Look at the screenshots.

That's it — a self-contained node + Playwright harness with no external services.

## THE lesson: assert EXPECTED GEOMETRY, not just "visible"

The whole reason this skill exists as a hard gate: **an element being in the DOM — or even passing `isVisible()` — does not mean the user can see it.**

The incident that proved it: an overlay component mounted correctly but its CSS had been deleted, so it rendered as an unstyled, transparent, wrongly-sized `<div>` — visually nothing. A spec that checked `count() > 0` passed. A spec that checked **`isVisible()` also passed** — because Playwright's `isVisible()` only means "not `display:none`/`visibility:hidden`/`opacity:0` and has *a* box." An unstyled block div satisfies all of that. The bug shipped repeatedly behind green checks.

So `isVisible()` is necessary but **not sufficient**. A spec that matters must assert the element's **expected geometry** and be backed by a screenshot you actually read:

```js
const vp = t.page.viewportSize();
const el = t.page.locator('.my-overlay').first();
t.check('overlay visible', await el.isVisible(), 'isVisible() was false');
const box = await el.boundingBox();
// The real check: is it the SIZE the design demands? (fullscreen overlay ≈ viewport)
t.check('overlay is fullscreen',
        box && box.width >= vp.width - 2 && box.height >= vp.height - 2,
        `box=${JSON.stringify(box)} vp=${vp.width}x${vp.height}`);
await t.screenshot('overlay'); // capture AND look at it — pixels are the final judge
```

For a button, assert it's ~its design size (e.g. a 120×120 record button), not just present. Presence checks (`count()`, `toBeAttached`) and bare `isVisible()` both let invisible elements pass — geometry + screenshot is the gate.

## When to use

- Before calling any UI change "done" — especially anything that renders/toggles/opens.
- Before merging a branch that touches user-facing flows.
- Regression check after a build/restart.
- On demand ("does the task-creator modal still open?").

## Layout

```
ui-test/
├── SKILL.md
├── package.json                # single dependency: playwright
├── config/
│   └── apps.example.json        # viewport defaults per app (copy to apps.json)
└── playwright/                  # the harness — this is the whole thing
    ├── lib/
    │   ├── harness.mjs          # runTest(): launch, steps, screenshots, one JSON result
    │   └── auth.mjs             # generic login() for apps that need it
    ├── snippets/                # reusable, date-stamped flow fragments (SNIPPETS.md = index)
    ├── specs/                   # authored specs (_example.smoke.mjs / _example.geometry.mjs = templates)
    └── run.mjs                  # run spec(s) → results/*.json + report.md
```

## Invocation

```bash
# Run one spec against a live build:
node playwright/specs/_example.smoke.mjs --out .runs/smoke

# Run several / a whole dir, aggregated:
node playwright/run.mjs --out .runs playwright/specs/_example.smoke.mjs

# See a run headed (local debugging):
node playwright/specs/my-test.mjs --out .runs/mytest --headed
```

The target build must already be serving (your app's dev server, a preview build, or a deployed URL). Point the spec at that URL. Apps with no login can be driven directly; apps that need a login/URL/credentials are configured per the Config section below.

## How it works

1. **Author** — copy `_example.smoke.mjs`. Compose reusable **snippets** (`snippets/…`) plus test-specific Playwright. The intelligence is here, spent once.
2. **Run** — `run.mjs` spawns each spec as its own `node` process (isolation: one crash doesn't sink the batch), sharing an `--out` dir. Each spec's `runTest()` launches Chromium, runs the steps, screenshots each, captures console errors, writes `results/{id}.json` + exit code.
3. **Report** — `run.mjs` aggregates into `report.md`; failures point at the failing step; PNGs land under the out dir.
4. **Graduate snippets** — when a fresh flow passes live, distil the reusable part into a dated `verified:` snippet in `SNIPPETS.md` so authoring gets cheaper over time.

## Config (apps that need login)

Per-app URL / run-command / credentials live in a project config file the harness reads. By default `harness.mjs` looks for `.claude/config.json` at the repo root under a `ui-test` key, and falls back to `config/apps.json` for the URL. Point either at your app:

```jsonc
"ui-test": {
  "<appName>": {
    "run": "npm run dev", "cwd": ".",
    "url": "http://localhost:3000/",
    "credentials": [ { "name": "Dev1", "email": "you@example.com", "password": "…", "roles": ["editor"] } ]
  }
}
```

- `--persona <x>` picks a credential by name/role; the password is injected at runtime only, never persisted or logged. Prefer sourcing passwords from environment variables over committing them.
- `--start-app` launches `run` in `cwd`, waits for `url`, tears down on exit. Without it the app is assumed already serving.
- No login? Just point the spec at the running URL — no credentials needed.

The bundled `auth.mjs` is a tolerant generic login (email + password fields, a submit button, success detected by the password field disappearing). Adapt its selectors to your app's login markup, or replace it with your own snippet.

## Authoring gotchas (framework-agnostic)

- **Assert visible, not present** (see above). This is the one that keeps biting.
- **Modals: several can be mounted at once.** A bare `.modal-content` selector can grab a hidden one — target the *open* one (e.g. `.modal.show .modal-content`) and confirm with `isVisible()` + a screenshot.
- **Icon-only buttons need accessible names.** A `<button>` with only an icon exposes as a bare `button` — add `title`/`aria-label` so specs can target it by role+name (also an a11y win).
- **Aria snapshot is a cheap structural signal:** `await locator.ariaSnapshot()` — assert against it, and capture a PNG when you need pixels (and to eyeball visibility).
- **Dev-server error overlays intercept clicks.** Some bundlers inject a full-page error overlay on benign dev-only `pageerror`s; it covers the page and swallows clicks. Remove it after navigation (it does not exist in a production build).
- **Canvas / map UIs** (OpenLayers, Leaflet, WebGL) need real pixel coordinates and often a settle delay between clicks to disambiguate single- vs double-click. Compute the click point from the canvas bounding box; prefer flows that don't depend on hit-testing a specific rendered feature.

## Prerequisite — Playwright

The harness depends only on `playwright`. Install once per checkout:

```bash
npm install                                   # pulls playwright
npx playwright install --with-deps chromium   # browser + OS libs (--with-deps needs sudo)
```

Browsers cache under `~/.cache/ms-playwright`. After that, normal runs need nothing else.

## Status

Script workflow verified working against live builds — a full spec run passes end-to-end under plain `node`, no API key. See `playwright/specs/_example.smoke.mjs` and `_example.geometry.mjs` for worked templates.
