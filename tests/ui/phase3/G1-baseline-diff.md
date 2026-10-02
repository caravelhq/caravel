# G1 Geometry Baseline Diff — vanilla vs Phase 3 (post-layout-pass)

**Vanilla baseline:** `7e4b979` (last pre-Phase-2 commit, "lateen rig before the Phase 2 port")
**Branch head:** `feature/WAL-100-phase3` at node 10 (post measured layout pass)

Geometry fixtures: `tests/ui/phase3/G1-vanilla-geometry.json` and `tests/ui/phase3/G1-branch-geometry.json`.

The branch fixture was updated after the Phase 3 node 10 layout pass with `G_FIXTURE_NAME=G1-branch-post-layout` run against a scratch daemon.

## Summary: 0 active defects, 4 intentional deltas

| # | Element | Vanilla | Branch | Delta | Status |
|---|---------|---------|--------|-------|--------|
| D1 | `nav.tab-nav` y | 42 / 38 (mobile) | 42 / 38 ✓ | 0 | **Resolved** — stage padding-top restored |
| D2 | page panels y | 96 / 92 (mobile) | 126 / 122 | +30 px | **Intentional** — WorkspaceTabStrip adds 42px of chrome above ViewHost (Phase 3 architecture) |
| D3 | `#settings-modal` height (1440×900) | 741 | 517 | −224 px | **Intentional** — BaseModal-backed settings; vanilla-only rows not ported; fewer rows = less height |
| D4 | `#settings-modal` height (1024/390) | 661 | 517 | −144 px | **Intentional** — same as D3 |
| D5 | `nav.tab-nav` width (390×844) | 324 | 324 ✓ | 0 | **Resolved** — split toggle was removed from outer nav to TabStrip in node 6 |
| — | `nav.tab-nav` width (1440×900) | 450.6 | 409.5 | −41 px | **Intentional** — same cause as D5; split toggle only visible at desktop |

## D1 — Nav top clearance (RESOLVED)

Fix: `styles.ts` `.stage` padding-top `12px → 42px` (desktop); `8px → 38px` (mobile media query).

The CTA banner removal in Phase 2 stripped 30px of top clearance. The direct fix was to raise the stage padding-top to match vanilla. Confirmed at all three viewports.

## D2 — Page panel y (INTENTIONAL)

Phase 3 adds a `WorkspaceTabStrip` (42px high) between the outer nav and the page panel. Vanilla had a direct nav→panel layout. The net shift (+30px) is: TabStrip height (42px) minus the old stage-body gap (12px).

This is correct Phase 3 behaviour. The TabStrip is the workspace's tab management chrome. Panel y=126 at 1440×900 and 122 at 390×844 are the new expected values.

## D3/D4 — Settings modal height (INTENTIONAL)

The vanilla settings modal rendered at 741px (1440) / 661px (smaller) with a `settings-head` block and custom `.setting-item` rows. Phase 3 replaced it with BaseModal + SettingRow components. The modal is now fixed at 517px across all viewports.

Two reasons for the smaller height:
1. Vanilla-specific settings rows were not ported (reading-pane split toggle, repo CTA toggle, some developer options).
2. `SettingRow` component layout differs from the old `.setting-item` markup.

Eight rows are present and all functional. No missing user-facing settings from Phase 3 scope.

## D5 — Mobile nav width (RESOLVED)

At node 1 (G1-branch capture), the outer nav still had a reading-pane split toggle button, making it 35px wider than vanilla on mobile. Node 6 moved the split toggle into `TabStrip.vue` inside the Workspace. The outer nav now matches vanilla's button set: Dashboard/Dash, Chat, Tasks, Files, ⚙.

At 1440×900 the vanilla nav was 450.6px (had the split toggle at desktop label size). Branch is 409.5px without it. Intentional delta.

## Stable measurements (all viewports)

- Stage fills viewport exactly ✓
- Dock position and dimensions unchanged ✓
- Panel widths consistent ✓
- Settings modal x position and width unchanged ✓
- Nav height: 42px desktop, 46px mobile (unchanged) ✓
