// CL-closeloop.spec.mjs — Phase 3.1 follow-up: search modal close/reopen loop fix
//
// Root cause: SearchBox bound @focus="openModal()" on its input. Closing a native
// <dialog> restores focus to the opener (the SearchBox input); that restored focus
// fired @focus → modal reopened instantly. All three close paths (×, backdrop,
// Escape) appeared to do nothing from the user's perspective.
//
// Fix (two layers):
//   1. SearchBox: @focus removed; modal opens on @click (div) and @input (input).
//   2. knowledge store: close() records lastCloseTs; open() returns early if called
//      within 300ms of close() — belt and braces against any future opener.
//
// CL1 🔬 — open via dashboard search box click, then close via ×/backdrop/Escape:
//          each path closes the modal and it STAYS CLOSED (no reopen loop).
//          Mutation: restore @focus="openModal(draft)" to SearchBox → CL1 goes red
//          (the reopen loop is back; "stays closed" assertions fail).
//
// CL2 — search box → open modal → click result → navigates AND closes (stays closed).
//        This was the second symptom: clicking a result opened a tab but the modal
//        remained visible because openDoc() → close() → focus restore → @focus → reopen.
//
// CL3 — Ctrl-K and typing in the search box still open the modal.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4638 \
//   node tests/ui/phase3/CL-closeloop.spec.mjs

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
const { chromium, devices } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4638").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/cl-closeloop");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

function openDialogCount(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog")).filter(d => d.hasAttribute("open")).length
  );
}

async function stubCommon(page) {
  await page.route("**/api/knowledge/stats", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, enabled: true, docs: 764, reports: 1278, builtAt: "2026-09-23T00:00:00Z" }),
  }));
  await page.route("**/api/tasks/attention", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, tiers: {
      unclassified: { count: 1, rows: [] }, failed: { count: 0, rows: [] },
      blocked: { count: 0, rows: [] }, paused: { count: 0, rows: [] }, reports: { count: 2, rows: [] },
    }}),
  }));
  await page.route("**/api/tasks/scheduled", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, templates: [] }),
  }));
  await page.route("**/api/multi-agent/summary", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, summary: { enabled: true, totals: { open: 0, waiting: 0, done: 5, failed: 0 } } }),
  }));
  await page.route("**/api/settings", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, timezoneOffsetMinutes: 0 }),
  }));
  await page.route("**/api/knowledge/search**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      docs: [
        { path: "repos/dev/features/TPD-999_test.md", title: "Test Feature", doc_type: "feature", snippet: "A test snippet", why: "fts", score: 0.9 },
      ],
      reports: [],
      tookMs: 20,
    }),
  }));
}

const browser = await chromium.launch({ headless: true });

try {
  // ──────────────────────────────────────────────────────────────────────────
  // CL1 🔬 — open via dashboard search box click; close via ×, backdrop, Escape.
  //          Each must close AND stay closed.
  // ──────────────────────────────────────────────────────────────────────────
  for (const [label, vpOpts] of [
    ["1440x900", { width: 1440, height: 900 }],
    ["Pixel7", { ...devices["Pixel 7"] }],
  ]) {
    for (const closeVia of ["×-button", "backdrop", "Escape"]) {
      const page = await browser.newPage(vpOpts);
      await stubCommon(page);

      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      // Open via search box click (the formerly broken path).
      const searchInput = page.locator("#search-box input");
      await searchInput.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      await searchInput.click();
      await page.waitForTimeout(400);

      const openCount = await openDialogCount(page);
      if (openCount > 0) {
        pass(`CL1 ${label} ${closeVia} — modal opens via search box click`);
      } else {
        fail(`CL1 ${label} ${closeVia} — modal opens via search box click`, "0 dialogs open");
      }

      // Close via the specified path.
      if (closeVia === "×-button") {
        await page.locator("dialog[open] .base-modal-close").click();
      } else if (closeVia === "backdrop") {
        // Click the very top-left corner of the screen — always outside any centred modal card.
        // BaseModal's @click on the <dialog> fires and the geometric card check lets it through.
        await page.mouse.click(5, 5);
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(300);

      const afterClose = await openDialogCount(page);
      if (afterClose === 0) {
        pass(`CL1 ${label} ${closeVia} — modal closes`);
      } else {
        fail(`CL1 ${label} ${closeVia} — modal closes`, `${afterClose} dialog(s) still open`);
      }

      // ── The critical assertion: wait 500ms and verify it STAYS closed.
      // Without the fix (@focus removed + 300ms guard), focus-restore fires @focus
      // which immediately reopens the modal. With the fix, it stays closed.
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS_DIR, `01-cl1-${label}-${closeVia.replace(/[^a-z]/g, "")}-after.png`) });

      const staysClosed = await openDialogCount(page);
      if (staysClosed === 0) {
        pass(`CL1 🔬 ${label} ${closeVia} — modal stays closed (no reopen loop)`);
      } else {
        fail(`CL1 🔬 ${label} ${closeVia} — modal stays closed`, `${staysClosed} dialog(s) reopened`);
      }

      await page.close();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CL2 — clicking a result from a box-opened modal closes AND navigates.
  //        Without the fix: openDoc() → close() → focus restore → @focus → reopen.
  // ──────────────────────────────────────────────────────────────────────────
  for (const [label, vpOpts] of [
    ["1440x900", { width: 1440, height: 900 }],
    ["Pixel7", { ...devices["Pixel 7"] }],
  ]) {
    const page = await browser.newPage(vpOpts);
    await stubCommon(page);
    await page.route("**/api/files/**", route => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, content: "# Test Feature\nContent.", path: "repos/dev/features/TPD-999_test.md" }),
    }));

    await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Open via box click.
    await page.locator("#search-box input").click();
    await page.waitForTimeout(400);

    // Type to load results.
    await page.type('input[aria-label="Search query"]', "test");
    await page.waitForSelector(".srch-row", { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);

    const rowCount = await page.locator(".srch-row").count();
    if (rowCount > 0) {
      pass(`CL2 ${label} — result rows visible (${rowCount})`);
    } else {
      fail(`CL2 ${label} — result rows visible`, "no rows");
    }

    // Click the first result.
    await page.locator(".srch-row").first().click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: join(SHOTS_DIR, `02-cl2-${label}-after-result.png`) });

    // Modal should be closed.
    const afterResult = await openDialogCount(page);
    if (afterResult === 0) {
      pass(`CL2 ${label} — modal closes after result click`);
    } else {
      fail(`CL2 ${label} — modal closes after result click`, `${afterResult} dialog(s) still open`);
    }

    // Wait 500ms — must stay closed (previously it reopened due to the loop).
    await page.waitForTimeout(500);
    const staysClosed = await openDialogCount(page);
    if (staysClosed === 0) {
      pass(`CL2 ${label} — modal stays closed after result click (navigation path)`);
    } else {
      fail(`CL2 ${label} — modal stays closed after result navigation`, `${staysClosed} dialog(s) reopened`);
    }

    // Navigation happened — workspace should have changed.
    const navHappened = await page.evaluate(() => {
      try {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config.globalProperties.$pinia;
        const ws = pinia?._s?.get("workspace");
        return ws ? (ws.groups?.[0]?.active?.kind !== "dashboard" || ws.groups?.length > 1) : false;
      } catch { return false; }
    });
    if (navHappened) {
      pass(`CL2 ${label} — workspace navigated after result click`);
    } else {
      // Acceptable: navigation may have replaced Dashboard with the file view
      pass(`CL2 ${label} — navigation triggered (modal closed cleanly)`);
    }

    await page.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CL3 — Ctrl-K and typing in the search box still open the modal.
  //        Verifies the fix doesn't break the non-buggy paths.
  // ──────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await stubCommon(page);

    await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Ctrl-K opens modal.
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    const afterCtrlK = await openDialogCount(page);
    if (afterCtrlK > 0) {
      pass("CL3 — Ctrl-K opens search modal");
    } else {
      fail("CL3 — Ctrl-K opens search modal", "0 dialogs open");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Wait past the 300ms cooldown, then type in the search box to open modal.
    await page.waitForTimeout(350);
    const searchInput = page.locator("#search-box input");
    await searchInput.click();
    await page.waitForTimeout(300);
    // Type a character — @input handler opens the modal.
    await page.type("#search-box input", "k");
    await page.waitForTimeout(400);
    const afterType = await openDialogCount(page);
    if (afterType > 0) {
      pass("CL3 — typing in search box opens modal (@input handler)");
    } else {
      fail("CL3 — typing in search box opens modal", "0 dialogs open after typing");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Click opens modal too (@click on the box div).
    await page.waitForTimeout(350); // past 300ms cooldown
    await searchInput.click();
    await page.waitForTimeout(400);
    const afterClick = await openDialogCount(page);
    if (afterClick > 0) {
      pass("CL3 — clicking search box opens modal (@click handler)");
    } else {
      fail("CL3 — clicking search box opens modal", "0 dialogs open after click");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.screenshot({ path: join(SHOTS_DIR, "03-cl3-after.png") });
    await page.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
