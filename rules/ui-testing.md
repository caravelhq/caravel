---
description: Browser-level UI verification with the ui-test skill — the gate for any user-facing change
---

# UI verification — the `ui-test` gate

Any change that renders, toggles, opens, or lays out UI is **not done until it has been driven in a real browser** and asserted to actually work. "It compiles", "the bundle builds", and "the element is in the DOM" are not verification. This gate exists because the opposite cost us: an invisible overlay shipped **three times** behind green checks.

The tool is the `ui-test` skill. Read its `SKILL.md` once. In short:

- **Plain-node Playwright specs. No API key, no MCP.** Write a `.mjs` spec, run it:
  `node .claude/skills/ui-test/playwright/run.mjs --out <dir> <spec.mjs>`
- Point it at the live build (your app dev server, or a preview build). It launches Chromium, drives the UI, screenshots each step, writes pass/fail JSON.

## THE rule: assert EXPECTED GEOMETRY, then read the screenshot

`isVisible()` is necessary but **not sufficient** — an unstyled `<div>` with deleted CSS still passes `isVisible()` (it isn't `display:none` and has a box). Presence (`count()`) is weaker still. Both have shipped broken UI behind green tests.

A spec that matters must assert the element's **expected geometry** and be backed by a screenshot someone reads:

- Fullscreen overlay → bounding box ≈ viewport.
- A button → ≈ its design size (e.g. a 120×120 record button), not merely present.
- Capture a PNG for the key states and actually look at it — pixels are the final judge.

See the worked example in the skill: `playwright/specs/_example.geometry.mjs`.

## Division of responsibility

- **Whoever builds the UI** — author `ui-test` specs as part of the work (the feature's UX test plan should become executable specs, not just prose), and **run them to verify your own implementation before declaring a UI change done.** Put the run result (pass/fail + screenshot paths) in your report. A UI task that hasn't been driven in a browser with geometry assertions is not finished.
- **Whoever reviews it** — for any PR with user-facing UI, develop the specs from the UX test plan and run them as part of review. A UI PR isn't approved until its specs pass with real geometry assertions. If specs already exist, verify they assert geometry (not bare `isVisible()`/presence) and re-run them yourself — don't take "verified" on trust.

## Prereq

Playwright + browsers: `npx --prefix .claude/skills/ui-test playwright install --with-deps chromium` (once per checkout).
