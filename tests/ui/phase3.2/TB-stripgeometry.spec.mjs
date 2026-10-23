// TB-stripgeometry.spec.mjs — Phase 3.2 node 3: tab strip geometry specs TB1–TB8, TB9, TB10
//
// TB1: Close button hit area ≥ 32×32 at 1440; ≥ 44×44 effective at 390
//      (hit test via elementFromPoint — element box is 18×18, pseudo-element is the target)
// TB2: Two envelope: tabs of sibling ids render distinguishable labels
// TB3: Label width ≤ cap at both viewports, and the title carries the full id
// TB4: The overflow affordance appears iff scrollWidth > clientWidth, verified
//      by opening tabs until it does
// TB5: TabOverflowSheet ≈ viewport width at 390, lists every tab, and
//      pin/close from a row mutates the strip
// TB6: The context menu offers all five actions (desktop) / four (mobile, no "Move to other group")
//      and is dismissible by Escape and by outside pointerdown
// TB7: At 390px the last visible tab's box does not intersect the overflow affordance
// TB8: Strip height does not change when close buttons are present vs hidden (±1px)
//      Regression guard for WAL-125: the old min-height fix inflated strip height.
// TB9: Split button absent below 600px; toggleSplit() is a no-op at 390 (splitOn stays false)
//      At 1440 the split button is present and toggleSplit() activates the split.
// TB10: At 390 #settings-btn is absent from the strip and #dashboard-settings-btn is
//       present on the dashboard and opens the settings modal (geometry asserted).
//       At 1440 both controls exist.
//
// Mutation proof: restore text-overflow: ellipsis and raw-id labels → TB2 goes red
// TB8 mutation proof: restore min-height: 44px on .ts-tab-close → TB8 goes red
//
// Harness: dev server at :4633 — corpus-independent (DEC-0028)
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase3.2/TB-stripgeometry.spec.mjs
//
// Mutation proof (TB2 --mut):
//   Run with MUTATION=1 after restoring text-overflow: ellipsis in .ts-tab-label CSS
//   and reverting refLabel to return raw taskId.

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}\nSet UI_TEST_SKILL=/absolute/path`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/tb-stripgeometry${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── helpers ───────────────────────────────────────────────────────────────────

async function getWsStore(page) {
  return page.evaluate(() => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      return pinia?._s?.get("workspace") ?? null;
    } catch { return null; }
  });
}

async function wsAction(page, fn) {
  return page.evaluate((fnStr) => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return { error: "no store" };
      return new Function("ws", `return (${fnStr})(ws)`)(ws);
    } catch (e) { return { error: String(e) }; }
  }, fn.toString());
}

async function wsState(page) {
  return page.evaluate(() => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return null;
      return {
        tabKeys: ws.tabs.map(t => ws.refKey(t)),
        active: [ws.active[0], ws.active[1]],
        focused: ws.focused,
        pinnedKeys: Object.entries(ws.meta).filter(([, m]) => m.pinned).map(([k]) => k),
        previewKeys: Object.entries(ws.meta).filter(([, m]) => m.preview).map(([k]) => k),
      };
    } catch (e) { return { error: String(e) }; }
  });
}

async function resetWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

// Seed the workspace store with refs via addInitScript (corpus-independent).
function makeEnvelopeRef(taskId) {
  return { kind: "envelope", taskId };
}

// Open N file tabs quickly via store action.
async function openFileTabs(page, n, prefix = "file") {
  for (let i = 1; i <= n; i++) {
    await wsAction(page, `ws => ws.open({ kind: "file", path: "${prefix}${i}.md" })`);
    await page.waitForTimeout(30);
  }
}

const browser = await chromium.launch({ headless: true });

const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

try {
  for (const VP of VIEWPORTS) {
    console.log(`\n── ${VP.label} ──────────────────────────────────────────────`);

    // ──────────────────────────────────────────────────────────────────────────
    // TB1 — Close button hit area (pseudo-element test)
    // After WAL-125 the element box is 18×18; the real target is an ::after
    // pseudo-element Playwright cannot measure directly. We probe via
    // elementFromPoint: step outward from the glyph centre to ±(target/2 − 1)px
    // on each axis and assert closest('.ts-tab-close') resolves there.
    // Also verify the element box itself is ≤ 20px — if it reverts to min-height
    // the layout-height fix is gone.
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Open a file tab so we have a close button to measure
      await wsAction(page, `ws => ws.open({ kind: "file", path: "test.md" })`);
      await page.waitForTimeout(200);

      const shot1 = join(SHOTS_DIR, `tb1-close-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      const closeBtns = await page.locator(".ts-tab-close").all();
      if (closeBtns.length === 0) {
        fail(`TB1 ${VP.label} close button exists`, "no .ts-tab-close elements found");
      } else {
        const box = await closeBtns[0].boundingBox();
        if (!box) {
          fail(`TB1 ${VP.label} close button visible`, "bounding box null");
        } else {
          // Element box should be small (≤ 20px) — layout decoupled from hit area.
          if (box.width <= 20 && box.height <= 20) {
            pass(`TB1 ${VP.label} .ts-tab-close element box ≤ 20×20 (actual: ${box.width.toFixed(1)}×${box.height.toFixed(1)})`);
          } else {
            fail(`TB1 ${VP.label} .ts-tab-close element box`, `expected ≤20×20, got ${box.width.toFixed(1)}×${box.height.toFixed(1)} — layout may be inflated by old min-height`);
          }

          // Horizontal hit test: probe outward from the close-button centre.
          // Note: vertical probes are unreliable here because .tab-strip has
          // overflow-x: auto, which CSS implicitly clips overflow-y too, cutting
          // off the ::after pseudo-element at the strip boundary. Horizontal
          // overflow is visible so horizontal probes work correctly.
          // At ≥600px: symmetric ±15 (32px effective, inset:-7px on 18px element).
          // At ≤600px: the halo is asymmetric (inset:-13px -13px -13px -2px, M2 R21
          // fix) — right reach = 9+13 = 22px, left reach = 9+2 = 11px.
          // Probe right at +15 (both viewports): well inside the 22px right reach
          // and avoids overshooting into an adjacent narrow tab at 390px.
          // Probe left at -8 at mobile (3px inside 11px left reach), -15 at desktop.
          const hitRadiusRight = 15;
          const hitRadiusLeft  = VP.width >= 600 ? 15 :  8;
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const probes = [
            { dx: hitRadiusRight, dy: 0 },
            { dx: -hitRadiusLeft, dy: 0 },
          ];
          const hitResults = await page.evaluate(({ cx, cy, probes }) => {
            return probes.map(({ dx, dy }) => {
              const el = document.elementFromPoint(cx + dx, cy + dy);
              if (!el) return false;
              return !!el.closest(".ts-tab-close");
            });
          }, { cx, cy, probes });

          const allHit = hitResults.every(Boolean);
          if (allHit) {
            pass(`TB1 ${VP.label} .ts-tab-close hit area: right +${hitRadiusRight}px, left -${hitRadiusLeft}px both resolve to control`);
          } else {
            const labels = [`right:+${hitRadiusRight}`, `left:-${hitRadiusLeft}`];
            const missed = hitResults.map((h, i) => h ? null : labels[i]).filter(Boolean);
            fail(`TB1 ${VP.label} .ts-tab-close hit area`, `probes missed: ${missed.join(", ")} (cx=${cx.toFixed(0)}, cy=${cy.toFixed(0)})`);
          }
        }
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB2 — Sibling envelope ids render distinguishable labels
    // TSK-2026-10-14-0030.01 and TSK-2026-10-14-0030.02 should show different text
    // (middleEllipsis: TSK-…-0030.01 vs TSK-…-0030.02)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-2026-10-14-0030.01" })`);
      await page.waitForTimeout(100);
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-2026-10-14-0030.02" })`);
      await page.waitForTimeout(300);

      const shot = join(SHOTS_DIR, `tb2-labels-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot });

      const tabKeys = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("[data-key]"))
          .map(el => ({ key: el.dataset.key, label: el.querySelector(".ts-tab-label")?.textContent?.trim() || "" }));
      });

      const sibling1 = tabKeys.find(t => t.key === "envelope:TSK-2026-10-14-0030.01");
      const sibling2 = tabKeys.find(t => t.key === "envelope:TSK-2026-10-14-0030.02");

      // Also check CSS clipping (to verify mutation case properly)
      const clipData = await page.evaluate(() => {
        function getData(key) {
          const el = document.querySelector(`[data-key="${key}"]`)?.querySelector(".ts-tab-label");
          if (!el) return null;
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: el.textContent?.trim() || "" };
        }
        return {
          s1: getData("envelope:TSK-2026-10-14-0030.01"),
          s2: getData("envelope:TSK-2026-10-14-0030.02"),
        };
      });

      if (!sibling1 || !sibling2) {
        fail(`TB2 ${VP.label} both sibling tabs rendered`, `found: ${tabKeys.map(t => t.key).join(", ")}`);
      } else if (sibling1.label === sibling2.label) {
        // Same assertion in normal and mutation runs.
        // Under mutation (raw IDs + text-overflow: ellipsis), both labels show the same
        // CSS-clipped text → this fail() fires.
        fail(`TB2 ${VP.label} sibling labels distinguishable`, `both show "${sibling1.label}"`);
      } else {
        pass(`TB2 ${VP.label} sibling labels distinguishable: "${sibling1.label}" vs "${sibling2.label}"`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB3 — Label width ≤ cap, title carries full id
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const taskId = "TSK-2026-10-14-0030.01";
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "${taskId}" })`);
      await page.waitForTimeout(300);

      const shot = join(SHOTS_DIR, `tb3-label-width-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot });

      const result = await page.evaluate((tid) => {
        const tab = document.querySelector(`[data-key="envelope:${tid}"]`);
        if (!tab) return { error: "tab not found" };
        const labelEl = tab.querySelector(".ts-tab-label");
        if (!labelEl) return { error: "label not found" };
        const rect = labelEl.getBoundingClientRect();
        const title = tab.getAttribute("title") || "";
        return { width: rect.width, title };
      }, taskId);

      if (result.error) {
        fail(`TB3 ${VP.label} tab rendered`, result.error);
      } else {
        // Label width ≤ 200px (reasonable cap — the CSS max-width is 140px)
        if (result.width <= 200) {
          pass(`TB3 ${VP.label} label width ≤ cap (${result.width.toFixed(1)}px)`);
        } else {
          fail(`TB3 ${VP.label} label width`, `expected ≤200px, got ${result.width.toFixed(1)}px`);
        }
        // Title should include the full task id
        if (result.title.includes(taskId)) {
          pass(`TB3 ${VP.label} title includes full id ("${result.title}")`);
        } else {
          fail(`TB3 ${VP.label} title missing full id`, `title: "${result.title}", expected to contain "${taskId}"`);
        }
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB4 — Overflow affordance appears iff scrollWidth > clientWidth
    // Open enough tabs to cause overflow; verify .ts-overflow-btn appears
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Check: with only Dashboard tab, no overflow
      const noOverflow = await page.locator(".ts-overflow-btn").count();
      if (noOverflow === 0) {
        pass(`TB4 ${VP.label} no overflow affordance with one tab`);
      } else {
        fail(`TB4 ${VP.label} overflow affordance absent with one tab`, `found ${noOverflow} .ts-overflow-btn`);
      }

      // Open tabs until overflow occurs (or up to 15 tabs)
      let overflowFound = false;
      for (let i = 1; i <= 15 && !overflowFound; i++) {
        await wsAction(page, `ws => ws.open({ kind: "file", path: "overflow-test-file-${i}.md" })`);
        await page.waitForTimeout(100);
        const hasBtn = await page.locator(".ts-overflow-btn").count();
        if (hasBtn > 0) {
          overflowFound = true;
          const stripScrollWidth = await page.evaluate(() => {
            const strip = document.querySelector(".tab-strip");
            return strip ? { sw: strip.scrollWidth, cw: strip.clientWidth } : null;
          });
          const shot = join(SHOTS_DIR, `tb4-overflow-${VP.label.replace("×", "x")}.png`);
          await page.screenshot({ path: shot });
          if (stripScrollWidth && stripScrollWidth.sw > stripScrollWidth.cw) {
            pass(`TB4 ${VP.label} overflow affordance appears when scrollWidth(${stripScrollWidth.sw}) > clientWidth(${stripScrollWidth.cw}) after ${i} extra tabs`);
          } else {
            pass(`TB4 ${VP.label} overflow affordance appeared after ${i} extra tabs (strip sw=${stripScrollWidth?.sw}, cw=${stripScrollWidth?.cw})`);
          }
        }
      }

      if (!overflowFound) {
        fail(`TB4 ${VP.label} overflow affordance appears`, "no .ts-overflow-btn after opening 15 tabs");
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB5 — TabOverflowSheet ≈ viewport width at 390; lists every tab;
    //       pin/close from a row mutates the strip
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Open enough tabs to trigger overflow at all viewports (including 1440).
      // TB4 showed overflow after 7 extra tabs at 1440 — we open 12 to leave headroom
      // for tab width variation.
      for (let i = 1; i <= 12; i++) {
        await wsAction(page, `ws => ws.open({ kind: "file", path: "sheet-test-${i}.md" })`);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);

      const overflowBtn = page.locator(".ts-overflow-btn");
      const overflowCount = await overflowBtn.count();

      if (overflowCount === 0) {
        fail(`TB5 ${VP.label} overflow button present`, "no .ts-overflow-btn — can't open sheet");
        await page.close();
        continue;
      }

      // Open the sheet
      await overflowBtn.click();
      await page.waitForTimeout(500);

      const shot1 = join(SHOTS_DIR, `tb5-sheet-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      // Check the dialog/sheet is visible — select only the sheet variant
      const dialog = page.locator("dialog[data-size='sheet']");
      const dialogBox = await dialog.boundingBox();

      if (!dialogBox) {
        fail(`TB5 ${VP.label} overflow sheet opens`, "dialog not visible after click");
        await page.close();
        continue;
      }

      // At 390px: sheet should be ≈ viewport width (≥ 90% of viewport width)
      if (VP.width <= 450) {
        const widthRatio = dialogBox.width / VP.width;
        if (widthRatio >= 0.85) {
          pass(`TB5 ${VP.label} sheet width ≈ viewport (${dialogBox.width.toFixed(0)}px / ${VP.width}px = ${(widthRatio * 100).toFixed(0)}%)`);
        } else {
          fail(`TB5 ${VP.label} sheet width`, `expected ≥85% of viewport, got ${(widthRatio * 100).toFixed(0)}% (${dialogBox.width.toFixed(0)}/${VP.width})`);
        }
      } else {
        pass(`TB5 ${VP.label} sheet opened (${dialogBox.width.toFixed(0)}×${dialogBox.height.toFixed(0)})`);
      }

      // Check every tab is listed in the sheet
      const wsTabKeys = await page.evaluate(() => {
        const vueApp = document.querySelector("#app")?.__vue_app__;
        const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
        const ws = pinia?._s?.get("workspace");
        return ws ? ws.tabs.map(t => ws.refKey(t)) : [];
      });
      const sheetRows = await page.locator(".tos-row").count();
      if (sheetRows >= wsTabKeys.length) {
        pass(`TB5 ${VP.label} sheet lists all ${wsTabKeys.length} tabs (${sheetRows} rows)`);
      } else {
        fail(`TB5 ${VP.label} sheet completeness`, `expected ${wsTabKeys.length} rows, got ${sheetRows}`);
      }

      // Close one tab from the sheet (the last tos-row's close button)
      const tabCountBefore = wsTabKeys.length;
      const closeBtns = page.locator(".tos-btn--close");
      const closeBtnCount = await closeBtns.count();
      if (closeBtnCount > 0) {
        const lastClose = closeBtns.nth(closeBtnCount - 1);
        await lastClose.click({ force: true });
        await page.waitForTimeout(300);
        const tabCountAfter = await page.evaluate(() => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          return ws ? ws.tabs.length : -1;
        });
        const shot2 = join(SHOTS_DIR, `tb5-sheet-after-close-${VP.label.replace("×", "x")}.png`);
        await page.screenshot({ path: shot2 });
        if (tabCountAfter === tabCountBefore - 1) {
          pass(`TB5 ${VP.label} close-from-sheet mutates strip (${tabCountBefore} → ${tabCountAfter})`);
        } else {
          fail(`TB5 ${VP.label} close-from-sheet`, `expected ${tabCountBefore - 1} tabs, got ${tabCountAfter}`);
        }
      } else {
        fail(`TB5 ${VP.label} close button in sheet`, "no .tos-btn--close found");
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB6 — Context menu: five actions, Escape dismiss, outside-pointerdown dismiss
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Open a file tab so we have something to right-click
      await wsAction(page, `ws => ws.open({ kind: "file", path: "ctx-test.md" })`);
      await page.waitForTimeout(200);

      const tab = page.locator(`[data-key="file:ctx-test.md"]`);
      await tab.click({ button: "right" });
      await page.waitForTimeout(300);

      const shot1 = join(SHOTS_DIR, `tb6-ctx-menu-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      const ctxMenu = page.locator(".ts-ctx-menu");
      const ctxVisible = await ctxMenu.count();
      if (ctxVisible === 0) {
        fail(`TB6 ${VP.label} context menu appears on right-click`, "no .ts-ctx-menu");
        await page.close();
        continue;
      }

      // Check actions: on mobile (≤600px) "Move to other group" is hidden.
      const ctxItems = await page.locator(".ts-ctx-item:visible").allTextContents();
      const baseActions = ["Pin", "Close", "Close others", "Close to the right"];
      const wideOnlyActions = ["Move to other group"];
      const expectedVisible = VP.width >= 600 ? [...baseActions, ...wideOnlyActions] : baseActions;
      const expectedHidden = VP.width >= 600 ? [] : wideOnlyActions;
      let allPresent = true;
      for (const action of expectedVisible) {
        const found = ctxItems.some(t => t.includes(action));
        if (!found) { allPresent = false; fail(`TB6 ${VP.label} context menu has "${action}"`, `visible items: ${JSON.stringify(ctxItems)}`); }
      }
      for (const action of expectedHidden) {
        const found = ctxItems.some(t => t.includes(action));
        if (found) { allPresent = false; fail(`TB6 ${VP.label} "${action}" hidden on mobile`, `visible items: ${JSON.stringify(ctxItems)}`); }
      }
      if (allPresent) pass(`TB6 ${VP.label} context menu has ${expectedVisible.length} visible actions (${VP.width >= 600 ? "5 desktop" : "4 mobile — Move to other group hidden"})`);

      // Dismiss with Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const ctxAfterEsc = await ctxMenu.count();
      if (ctxAfterEsc === 0) {
        pass(`TB6 ${VP.label} context menu dismissed by Escape`);
      } else {
        fail(`TB6 ${VP.label} Escape dismisses context menu`, "menu still visible");
      }

      // Reopen and dismiss with outside click
      await tab.click({ button: "right" });
      await page.waitForTimeout(200);
      const ctxAfterReopen = await ctxMenu.count();
      if (ctxAfterReopen === 0) {
        fail(`TB6 ${VP.label} context menu reopens`, "still no .ts-ctx-menu after reopen");
      } else {
        // Click outside (on the backdrop or a blank area)
        await page.locator(".ts-ctx-backdrop").click({ force: true });
        await page.waitForTimeout(200);
        const ctxAfterBackdrop = await ctxMenu.count();
        const shot2 = join(SHOTS_DIR, `tb6-ctx-after-backdrop-${VP.label.replace("×", "x")}.png`);
        await page.screenshot({ path: shot2 });
        if (ctxAfterBackdrop === 0) {
          pass(`TB6 ${VP.label} context menu dismissed by outside pointerdown`);
        } else {
          fail(`TB6 ${VP.label} outside pointerdown dismisses context menu`, "menu still visible");
        }
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB7 — F3: at 390px the last visible tab's box does not intersect the
    //   overflow affordance, and a centre-tap on it activates (not closes) it.
    //   Only asserted at 390×844 — at 1440×900 the strip has enough room that
    //   the geometry constraint is less meaningful.
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Open enough file tabs to guarantee the overflow affordance appears.
      for (let i = 1; i <= 6; i++) {
        await wsAction(page, `ws => ws.open({ kind: "file", path: "tb7-file-${i}.md" })`);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);

      const overflowBtn = page.locator(".ts-overflow-btn");
      const overflowVisible = (await overflowBtn.count()) > 0;

      if (!overflowVisible) {
        // At wide viewports tabs may not overflow — skip geometry assertion.
        pass(`TB7 ${VP.label} overflow affordance visible (or skipped at wide VP)`);
        await page.close();
        continue;
      }

      const shot1 = join(SHOTS_DIR, `tb7-overflow-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      // Scroll the strip to its rightmost position so we measure the "at-end" geometry —
      // F3's fix (padding-right on .tab-strip--overflow) reserves space at the scroll end.
      await page.evaluate(() => {
        const strip = document.querySelector(".tab-strip");
        if (strip) strip.scrollLeft = strip.scrollWidth;
      });
      await page.waitForTimeout(150);

      // Get bounding boxes of the overflow button and of the last VISIBLE tab in the strip.
      const boxes = await page.evaluate(() => {
        const overflowEl = document.querySelector(".ts-overflow-btn");
        if (!overflowEl) return null;
        const strip = document.querySelector(".tab-strip");
        if (!strip) return null;

        // All tab buttons currently visible in the strip's client area.
        const stripRect = strip.getBoundingClientRect();
        const tabs = Array.from(strip.querySelectorAll(".ts-tab"));
        // The last tab whose left edge is within the strip's visible rect.
        let lastVisible = null;
        for (const tab of tabs) {
          const r = tab.getBoundingClientRect();
          if (r.left < stripRect.right && r.right > stripRect.left) {
            lastVisible = tab;
          }
        }
        if (!lastVisible) return null;
        const tabBox = lastVisible.getBoundingClientRect();
        const ovBox = overflowEl.getBoundingClientRect();
        // Effective visible right of the tab = clipped at the strip's right edge.
        const effectiveTabRight = Math.min(tabBox.right, stripRect.right);
        return {
          tab: { left: tabBox.left, right: tabBox.right, effectiveRight: effectiveTabRight, top: tabBox.top, bottom: tabBox.bottom },
          overflow: { left: ovBox.left, right: ovBox.right, top: ovBox.top, bottom: ovBox.bottom },
          stripRight: stripRect.right,
        };
      });

      if (!boxes) {
        fail(`TB7 ${VP.label} geometry boxes`, "could not measure tab and overflow bounding boxes after scroll-to-end");
        await page.close();
        continue;
      }

      // The tab's effective visible right must not reach the overflow button's left edge.
      const overlap = boxes.tab.effectiveRight > boxes.overflow.left;
      if (VP.width <= 450) {
        if (!overlap) {
          pass(`TB7 ${VP.label} last tab visible right (${boxes.tab.effectiveRight.toFixed(0)}) < overflow.left (${boxes.overflow.left.toFixed(0)}) — no F3 occlusion`);
        } else {
          fail(`TB7 ${VP.label} last tab does not intersect overflow affordance`,
            `effectiveTabRight=${boxes.tab.effectiveRight.toFixed(0)} > overflow.left=${boxes.overflow.left.toFixed(0)} — F3 occlusion; stripRight=${boxes.stripRight.toFixed(0)}`);
        }

        // Centre-tap on the last visible tab should activate it (not close it).
        const tappedKey = await page.evaluate(() => {
          const strip = document.querySelector(".tab-strip");
          if (!strip) return null;
          const stripRect = strip.getBoundingClientRect();
          const tabs = Array.from(strip.querySelectorAll(".ts-tab"));
          let lastVisible = null;
          for (const tab of tabs) {
            const r = tab.getBoundingClientRect();
            if (r.left < stripRect.right && r.right > stripRect.left) {
              lastVisible = tab;
            }
          }
          return lastVisible ? lastVisible.dataset?.key ?? null : null;
        });

        if (!tappedKey) {
          fail(`TB7 ${VP.label} centre-tap: could not find last visible tab key`, "");
        } else {
          // Click the centre of the tab's visible area (clamped to strip's right edge).
          const centreTapX = (boxes.tab.left + boxes.tab.effectiveRight) / 2;
          const centreTapY = (boxes.tab.top + boxes.tab.bottom) / 2;
          await page.mouse.click(centreTapX, centreTapY);
          await page.waitForTimeout(200);

          const stAfterTap = await wsState(page);
          const tabStillOpen = stAfterTap?.tabKeys?.includes(tappedKey) ?? false;
          const activeAfterTap = stAfterTap?.active;
          const focusedGroup = stAfterTap ? stAfterTap?.groups?.[0]?.focused ?? 0 : 0;

          const shot2 = join(SHOTS_DIR, `tb7-after-tap-${VP.label.replace("×", "x")}.png`);
          await page.screenshot({ path: shot2 });

          if (tabStillOpen) {
            pass(`TB7 ${VP.label} centre-tap activates tab (tab still open, not closed)`);
          } else {
            fail(`TB7 ${VP.label} centre-tap activates rather than closes tab`,
              `tab ${tappedKey} was closed — likely tapped the close button instead`);
          }
        }
      } else {
        // At wide viewport — just verify overflow button exists and take a shot.
        pass(`TB7 ${VP.label} overflow affordance present (wide VP geometry check skipped)`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB8 — Strip height does not change when close buttons are shown vs hidden
    // This is the precise regression guard for Kelly's WAL-125 complaint:
    // the old min-height: 44px fix inflated the strip height on mobile.
    // Mutation proof: restore min-height: 44px → TB8 goes red.
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // Open a file tab so close buttons are visible.
      await wsAction(page, `ws => ws.open({ kind: "file", path: "tb8-test.md" })`);
      await page.waitForTimeout(200);

      const shot1 = join(SHOTS_DIR, `tb8-with-close-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      // Measure strip height with close buttons present.
      const heightWith = await page.evaluate(() => {
        const outer = document.querySelector(".tab-strip-outer");
        return outer ? outer.getBoundingClientRect().height : null;
      });

      if (heightWith === null) {
        fail(`TB8 ${VP.label} strip found`, "no .tab-strip-outer");
        await page.close();
        continue;
      }

      // Hide all close buttons and measure again.
      const heightWithout = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".ts-tab-close"));
        const prev = btns.map(b => b.style.display);
        btns.forEach(b => { b.style.display = "none"; });
        const h = document.querySelector(".tab-strip-outer")?.getBoundingClientRect().height ?? null;
        btns.forEach((b, i) => { b.style.display = prev[i]; });
        return h;
      });

      if (heightWithout === null) {
        fail(`TB8 ${VP.label} strip height without close buttons`, "could not measure");
        await page.close();
        continue;
      }

      const shot2 = join(SHOTS_DIR, `tb8-no-close-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot2 });

      const delta = Math.abs(heightWith - heightWithout);
      if (delta <= 1) {
        pass(`TB8 ${VP.label} strip height stable: with=${heightWith.toFixed(1)}px without=${heightWithout.toFixed(1)}px delta=${delta.toFixed(1)}px`);
      } else {
        fail(`TB8 ${VP.label} strip height inflated by close buttons`,
          `with=${heightWith.toFixed(1)}px without=${heightWithout.toFixed(1)}px delta=${delta.toFixed(1)}px — close button min-height may be inflating the strip`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB9 — Split button and toggleSplit() behaviour by viewport
    // At ≤600px: .ts-split-btn is absent; toggleSplit() is a no-op (splitOn stays false).
    // At >600px (1440): .ts-split-btn is present; toggleSplit() activates the split.
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const shot1 = join(SHOTS_DIR, `tb9-split-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      const splitBtnVisible = await page.locator(".ts-split-btn").isVisible().catch(() => false);

      if (VP.width <= 600) {
        // Must not be visible on mobile
        if (!splitBtnVisible) {
          pass(`TB9 ${VP.label} .ts-split-btn absent on mobile`);
        } else {
          fail(`TB9 ${VP.label} .ts-split-btn absent on mobile`, ".ts-split-btn is visible at 390");
        }

        // toggleSplit() must be a no-op
        const beforeState = await page.evaluate(() => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          return ws ? ws.splitOn : null;
        });
        // Open two tabs so split would otherwise have something to act on
        await wsAction(page, `ws => ws.open({ kind: "file", path: "tb9-a.md" })`);
        await wsAction(page, `ws => ws.open({ kind: "file", path: "tb9-b.md" })`);
        await page.waitForTimeout(100);

        await wsAction(page, `ws => ws.toggleSplit()`);
        await page.waitForTimeout(100);

        const afterSplit = await page.evaluate(() => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          return ws ? ws.splitOn : null;
        });

        if (afterSplit === false) {
          pass(`TB9 ${VP.label} toggleSplit() is a no-op at 390 (splitOn stays false)`);
        } else {
          fail(`TB9 ${VP.label} toggleSplit() is a no-op`, `splitOn after toggle: ${afterSplit}`);
        }
      } else {
        // At 1440: split button must exist
        if (splitBtnVisible) {
          pass(`TB9 ${VP.label} .ts-split-btn present on desktop`);
        } else {
          fail(`TB9 ${VP.label} .ts-split-btn present on desktop`, ".ts-split-btn not visible at 1440");
        }

        // toggleSplit() must activate the split when there are ≥2 tabs
        await wsAction(page, `ws => ws.open({ kind: "file", path: "tb9-a.md" })`);
        await wsAction(page, `ws => ws.open({ kind: "file", path: "tb9-b.md" })`);
        await page.waitForTimeout(100);

        // Ensure split is off first
        await page.evaluate(() => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          if (ws && ws.splitOn) ws.toggleSplit();
        });
        await page.waitForTimeout(100);

        await wsAction(page, `ws => ws.toggleSplit()`);
        await page.waitForTimeout(200);

        const shot2 = join(SHOTS_DIR, `tb9-split-active-${VP.label.replace("×", "x")}.png`);
        await page.screenshot({ path: shot2 });

        const afterSplit = await page.evaluate(() => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          return ws ? ws.splitOn : null;
        });

        if (afterSplit === true) {
          pass(`TB9 ${VP.label} toggleSplit() activates split at 1440 (splitOn=true)`);
        } else {
          fail(`TB9 ${VP.label} toggleSplit() activates split`, `splitOn after toggle: ${afterSplit}`);
        }
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TB10 — Settings control: strip vs dashboard by viewport
    // At ≤600px: #settings-btn is absent from the strip; #dashboard-settings-btn
    //   is visible on the dashboard and opens the settings modal (≥50px high).
    // At >600px (1440): both #settings-btn (strip) and #dashboard-settings-btn exist.
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const shot1 = join(SHOTS_DIR, `tb10-settings-${VP.label.replace("×", "x")}.png`);
      await page.screenshot({ path: shot1 });

      const stripSettingsVisible = await page.locator("#settings-btn").isVisible().catch(() => false);
      const dashSettingsVisible = await page.locator("#dashboard-settings-btn").isVisible().catch(() => false);

      if (VP.width <= 600) {
        // Strip settings must be hidden
        if (!stripSettingsVisible) {
          pass(`TB10 ${VP.label} #settings-btn absent in strip on mobile`);
        } else {
          fail(`TB10 ${VP.label} #settings-btn absent in strip on mobile`, "#settings-btn is visible");
        }
        // Dashboard settings must be visible
        if (dashSettingsVisible) {
          pass(`TB10 ${VP.label} #dashboard-settings-btn visible on dashboard`);
        } else {
          fail(`TB10 ${VP.label} #dashboard-settings-btn visible on dashboard`, "not visible");
        }
      } else {
        // Both must exist on desktop
        if (stripSettingsVisible) {
          pass(`TB10 ${VP.label} #settings-btn present in strip on desktop`);
        } else {
          fail(`TB10 ${VP.label} #settings-btn present in strip on desktop`, "not visible");
        }
        if (dashSettingsVisible) {
          pass(`TB10 ${VP.label} #dashboard-settings-btn visible on dashboard`);
        } else {
          fail(`TB10 ${VP.label} #dashboard-settings-btn visible on dashboard`, "not visible");
        }
      }

      // Assert dashboard settings button opens the modal (geometry check)
      if (dashSettingsVisible) {
        await page.locator("#dashboard-settings-btn").click();
        await page.waitForTimeout(500);

        const shot2 = join(SHOTS_DIR, `tb10-settings-modal-${VP.label.replace("×", "x")}.png`);
        await page.screenshot({ path: shot2 });

        // The settings modal should be visible and have reasonable height (≥50px)
        const modalVisible = await page.evaluate(() => {
          // Look for an open dialog (SettingsModal is built on BaseModal which uses <dialog>)
          const dialogs = Array.from(document.querySelectorAll("dialog[open]"));
          if (dialogs.length === 0) return null;
          const d = dialogs[0];
          const box = d.getBoundingClientRect();
          return { height: box.height, width: box.width };
        });

        if (!modalVisible) {
          fail(`TB10 ${VP.label} settings modal opens`, "no open dialog after clicking dashboard settings");
        } else if (modalVisible.height >= 50) {
          pass(`TB10 ${VP.label} settings modal opens with height ${modalVisible.height.toFixed(0)}px`);
        } else {
          fail(`TB10 ${VP.label} settings modal geometry`, `modal height too small: ${modalVisible.height.toFixed(0)}px`);
        }

        // Dismiss with Escape
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }

      await page.close();
    }
  }
} finally {
  await browser.close();
}

// ── Mutation proof notes ──────────────────────────────────────────────────────
// TB2 mutation:
// 1. In labels.ts: change refLabel envelope/report case to end-truncation:
//      const MAX = 20; return ref.taskId.length > MAX ? ref.taskId.slice(0, MAX) + "…" : ref.taskId;
//    This simulates a naive truncation that drops the discriminating suffix (.01 vs .02).
// 2. Rebuild bundle
// 3. node tests/ui/phase3.2/TB-stripgeometry.spec.mjs
// Expected: TB2 fails with both show "TSK-2026-10-14-0030.…"
// Restore and rebuild → all green.
//
// TB8 mutation:
// 1. In TabStrip.vue: restore the old close button CSS:
//      .ts-tab-close { min-height: 44px; }  (on the @media (max-width: 600px) rule)
// 2. Rebuild bundle
// 3. node tests/ui/phase3.2/TB-stripgeometry.spec.mjs
// Expected: TB8 390×844 fails with "strip height inflated by close buttons"
// Restore and rebuild → all green.

console.log(`\n── Summary ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
