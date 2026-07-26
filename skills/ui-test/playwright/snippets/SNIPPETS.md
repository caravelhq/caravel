# Snippet library — the reusable test toolkit

Reusable Playwright building blocks you compose into specs. Each snippet is a small, importable `.mjs` helper that walks one part of the app. Specs `import` these instead of re-deriving the same interactions, so authoring a new test is mostly gluing snippets together.

## Conventions

- One snippet = one self-contained capability (login, open a section, create X), exported as an `async` function taking `(page, opts)`.
- Every snippet file carries a header block:
  ```
  // snippet: <app> / <name>
  // area:     <part of the site>
  // authored: YYYY-MM-DD
  // verified: YYYY-MM-DD against <url>   |   PENDING
  ```
- **`verified` is the date a snippet last passed a live run.** When the app changes and a snippet breaks, re-fix it and bump the date. Treat `PENDING` snippets as unverified scaffolding.
- Snippets live under `snippets/<app>/`. Cross-app helpers go in `lib/`.

## Index

| Snippet | App | Area | Authored | Verified | Notes |
|---|---|---|---|---|---|
| `example/login.mjs` → `loginAsPersona` | example | auth | — | — | Generic email/password login built on `lib/auth.mjs`; reads a credential from `.claude/config.json#ui-test.<app>`. Adapt to your app. |

Add a row here for every snippet you graduate to verified.

## How a snippet graduates to "verified"

1. Author it referencing the real component markup.
2. Run a spec that uses it against the live app.
3. If it passes, set `verified: <today> against <url>` and add a row here.
4. If the app later changes and it breaks, fix + re-date. The date is the trust signal.
