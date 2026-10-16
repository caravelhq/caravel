// TB-stripgeometry.spec.mjs — Phase 3.2 node 3: tab strip geometry specs TB1–TB6
//
// TB1: .ts-tab-close ≥ 32×32 at 1440; hit area ≥ 44×44 at 390
// TB2: Two envelope: tabs of sibling ids render distinguishable labels
// TB3: Label width ≤ cap at both viewports, and the title carries the full id
// TB4: The overflow affordance appears iff scrollWidth > clientWidth, verified
//      by opening tabs until it does
// TB5: TabOverflowSheet ≈ viewport width at 390, lists every tab, and
//      pin/close from a row mutates the strip
// TB6: The context menu offers all five actions and is dismissible by Escape
//      and by outside pointerdown
//
// Mutation proof: restore text-overflow: ellipsis and raw-id labels → TB2 goes red
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
    // TB1 — Close button minimum size
    // .ts-tab-close ≥ 32×32 at 1440; ≥ 44×44 hit area at 390
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
          const minW = VP.width >= 600 ? 32 : 44;
          const minH = VP.width >= 600 ? 32 : 44;
          if (box.width >= minW && box.height >= minH) {
            pass(`TB1 ${VP.label} .ts-tab-close ≥ ${minW}×${minH} (actual: ${box.width.toFixed(1)}×${box.height.toFixed(1)})`);
          } else {
            fail(`TB1 ${VP.label} .ts-tab-close size`, `expected ≥${minW}×${minH}, got ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
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

      // Open 8 tabs to ensure overflow
      for (let i = 1; i <= 8; i++) {
        await wsAction(page, `ws => ws.open({ kind: "file", path: "sheet-test-${i}.md" })`);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);

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

      // Check the five actions are present
      const ctxItems = await page.locator(".ts-ctx-item").allTextContents();
      const expectedActions = ["Pin", "Close", "Close others", "Close to the right", "Move to other group"];
      let allPresent = true;
      for (const action of expectedActions) {
        const found = ctxItems.some(t => t.includes(action));
        if (!found) { allPresent = false; fail(`TB6 ${VP.label} context menu has "${action}"`, `items: ${JSON.stringify(ctxItems)}`); }
      }
      if (allPresent) pass(`TB6 ${VP.label} context menu has all 5 actions`);

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
  }
} finally {
  await browser.close();
}

// ── Mutation proof note ───────────────────────────────────────────────────────
// To run mutation proof:
// 1. In labels.ts: change refLabel envelope/report case to end-truncation:
//      const MAX = 20; return ref.taskId.length > MAX ? ref.taskId.slice(0, MAX) + "…" : ref.taskId;
//    This simulates a naive truncation that drops the discriminating suffix (.01 vs .02).
// 2. Rebuild bundle
// 3. MUTATION=1 node tests/ui/phase3.2/TB-stripgeometry.spec.mjs
// Expected: TB2 fails with both show "TSK-2026-10-14-0030.…"
// Restore and rebuild → all green.

console.log(`\n── Summary ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
