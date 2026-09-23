# G1 Geometry Baseline Diff — vanilla vs Phase 2 + CSS tokens

**Vanilla baseline:** `7e4b979` (last pre-Phase-2 commit, "lateen rig before the Phase 2 port")
**Branch head:** `feature/WAL-100-phase3` at `7ded2f0` + CSS token declarations

These are the layout deltas Phase 3 step 7 is responsible for resolving. The fixtures are at
`tests/ui/phase3/.runs/geometry/G1-vanilla.json` and `tests/ui/phase3/.runs/geometry/G1-branch.json`.

## Summary: 5 deltas across 3 viewports

| # | Element | Dimension | Vanilla | Branch | Delta | Note |
|---|---------|-----------|---------|--------|-------|------|
| D1 | `nav.tab-nav` | y (top) | 42 | 12 | −30 px | Nav moved up across all viewports |
| D2 | page panels | y (top) | 96 | 66 | −30 px | Follows D1; panels start 30px higher |
| D3 | `#settings-modal` | height (1440×900) | 741 | 596 | −145 px | Settings modal significantly shorter |
| D4 | `#settings-modal` | height (1024×768, 390×844) | 661 | 596 | −65 px | Same at smaller viewports |
| D5 | `nav.tab-nav` | x + width (390×844) | x=33, w=324 | x=15, w=359 | wider, shifted left | Mobile nav fills full width in Phase 2 |

## D1 — Nav shifted up 30 px

| Viewport | Vanilla y | Branch y |
|---|---|---|
| 1440×900 | 42 | 12 |
| 1024×768 | 42 | 12 |
| 390×844 | 38 | 8 |

The vanilla app had `margin-top: 42px` (or equivalent) above the nav — likely from the repo CTA banner and grain overlay occupying that space. Phase 2 removed or hid the CTA banner and the nav lost its top clearance. Phase 2 reduced this to approximately `padding-top: 12px`. Step 7 should restore the vertical breathing room or confirm the reduced top gap is the intended new baseline.

## D2 — Page panels shifted up 30 px (consequence of D1)

All four page root panels (`#dashboard-panel`, `#tasks-panel`, `#chat-panel`, `#files-panel`) moved up with the nav. The `top` of the content area is `y = nav_top + nav_height`:

- Vanilla: 42 + 42 = 84 (measured as 96 with 12px padding in the stage body)
- Branch: 12 + 42 = 54 (measured as 66 with 12px padding in the stage body)

This is consistent and expected: fixing D1 resolves D2 automatically.

## D3/D4 — Settings modal height reduced

| Viewport | Vanilla h | Branch h | Delta |
|---|---|---|---|
| 1440×900 | 741 | 596 | −145 px |
| 1024×768 | 661 | 596 | −65 px |
| 390×844 | 661 | 596 | −65 px |

The vanilla settings modal was nearly full-height at large viewport (741 / 900 = 82%) and approached full-height at smaller viewports. The Phase 2 Vue `SettingsModal.vue` is fixed at 596px across all sizes. Two causes:

1. Several vanilla settings rows were not yet ported (the split-view toggle, the voice STT options, the repo CTA toggle — these were vanilla-specific UI).
2. The Phase 2 modal doesn't adjust height to content at large viewports the way vanilla's `aside` element does.

This may be intentional (fewer rows = less height). Step 7 should confirm whether the settings content is intentionally reduced or if rows are missing.

## D5 — Mobile nav geometry

| Metric | Vanilla | Branch |
|---|---|---|
| x | 33 | 15 |
| width | 324 | 359 |
| right edge | 357 | 374 |

In vanilla the nav was horizontally centred with side margins (~33px each side). In Phase 2 it fills nearly the full viewport width (15px left margin, 374 − 15 − 359 = 0px right margin). Step 7 should confirm whether the mobile nav is intentionally full-width.

## Non-differences (stable)

- **Stage dimensions** — both versions fill the full viewport in every size. ✓
- **Dock position and dimensions** — identical across both versions and all viewports. ✓
- **Panel widths** — same at each viewport (page panels fill the stage body width consistently). ✓
- **Settings modal x position and width** — same (x=1102, w=320 at 1440×900; proportionally correct at smaller sizes). ✓

## Action for step 7

The notable defects are **D1/D2** (nav too high — 30px top margin missing from Phase 2) and **D5** (mobile nav may be wider than intended). **D3/D4** needs a design decision: if the shorter settings modal is intentional, the fixture can be updated to match; if rows are missing, they should be ported.
