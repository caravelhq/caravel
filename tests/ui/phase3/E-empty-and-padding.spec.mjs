// E-empty-and-padding.spec.mjs — empty-tabs boot crash and stage padding
//
// E1 🔬 — empty workspace boot
//   Root cause: workspace.ts line 94 evaluated refKey(initialTabs[0]) as an
//   eager default argument. When all tabs are closed (workspace.tabs=[]) and
//   the user refreshes, initialTabs[0] is undefined; refKey hits switch(ref.kind)
//   on undefined → TypeError → Pinia store setup throws → Vue app fails to mount.
//   This is the empty-workspace state introduced by DEC-0014 D9 (Dashboard closable).
//
//   Fix (two layers):
//     1. workspace.ts: guard the default — initialTabs.length>0 ? refKey(...) : null
//     2. refs.ts: widen refKey signature to ResourceRef|undefined|null, return "" for absent input
//
//   Test: seed workspace.tabs=[] in localStorage, load the app, assert:
//     - no unhandled JS error at boot
//     - .tab-strip renders
//     - Open menu button is visible and clickable
//     - opening Dashboard from the Open menu adds a tab
//
//   Mutation: restore the eager `refKey(initialTabs[0])` default to workspace.ts
//   line 94 — the Pinia store throws during setup, the Vue app does not mount,
//   .tab-strip is not found, and E1 goes red with a pageerror event.
//
// E2 — stage top padding reduced 42px → 10px
//   The 42px came from a fixed header that no longer exists. Both the base rule
//   (styles.ts:104) and the narrow-viewport override (≤640px, styles.ts:5035)
//   have been reduced to 10px.
//
//   Test: measure computed padding-top of main.stage at 1440×900 and 390×844.
//   Both must be 10px.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4642 \
//   node tests/ui/phase3/E-empty-and-padding.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4642").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/e-empty-and-padding");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

async function stubCommon(page) {
  await page.route("**/api/knowledge/stats", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, enabled: true, docs: 764, reports: 1278, builtAt: "2026-09-23T00:00:00Z" }),
  }));
  await page.route("**/api/tasks/attention", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, tiers: {
      unclassified: { count: 0, rows: [] }, failed: { count: 0, rows: [] },
      blocked: { count: 0, rows: [] }, paused: { count: 0, rows: [] }, reports: { count: 0, rows: [] },
    }}),
  }));
  await page.route("**/api/tasks/scheduled", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, templates: [] }),
  }));
  await page.route("**/api/multi-agent/summary", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, summary: { enabled: true, totals: { open: 0, waiting: 0, done: 0, failed: 0 } } }),
  }));
  await page.route("**/api/settings", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, timezoneOffsetMinutes: 0 }),
  }));
}

const browser = await chromium.launch({ headless: true });

try {
  // ──────────────────────────────────────────────────────────────────────────
  // E1 🔬 — empty workspace boots without error; tab strip + Open menu present
  // ──────────────────────────────────────────────────────────────────────────
  for (const [label, vpOpts] of [
    ["1440x900", { width: 1440, height: 900 }],
    ["Pixel7", { ...devices["Pixel 7"] }],
  ]) {
    const pageErrors = [];
    const page = await browser.newPage(vpOpts);
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await stubCommon(page);

    // Seed workspace.tabs=[] in localStorage before any JS runs (addInitScript fires
    // on every navigation before page scripts, so the store reads "[]" on first load).
    await page.addInitScript(() => {
      localStorage.setItem("workspace.tabs", "[]");
      localStorage.removeItem("workspace.active0");
      localStorage.removeItem("workspace.active1");
      localStorage.removeItem("workspace.splitOn");
      localStorage.removeItem("workspace.splitIndex");
    });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Assert: no unhandled JS errors during boot.
    // Without the fix, the Pinia store throws TypeError: Cannot read properties of
    // undefined (reading 'kind') and the app does not mount.
    const bootErrors = pageErrors.filter(m =>
      m.includes("Cannot read properties of undefined") ||
      m.includes("refKey") ||
      m.includes("workspace") ||
      m.includes("Pinia")
    );
    if (bootErrors.length === 0) {
      pass(`E1 🔬 ${label} — no boot error with empty tabs`);
    } else {
      fail(`E1 🔬 ${label} — no boot error with empty tabs`, bootErrors[0]);
    }

    // Assert: .tab-strip renders (Vue app mounted).
    const strip = page.locator(".tab-strip");
    const stripVisible = await strip.isVisible().catch(() => false);
    if (stripVisible) {
      pass(`E1 🔬 ${label} — tab strip renders with empty workspace`);
    } else {
      fail(`E1 🔬 ${label} — tab strip renders with empty workspace`, "not visible");
    }

    // Assert: Open menu button is visible.
    const openBtn = page.locator(".open-menu-btn");
    const openBtnVisible = await openBtn.isVisible().catch(() => false);
    if (openBtnVisible) {
      pass(`E1 🔬 ${label} — Open menu button visible`);
    } else {
      fail(`E1 🔬 ${label} — Open menu button visible`, "not visible");
    }

    // Assert: clicking Open menu reveals Dashboard item.
    await openBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    const dashItem = page.locator("#tab-dashboard");
    const dashItemVisible = await dashItem.isVisible().catch(() => false);
    if (dashItemVisible) {
      pass(`E1 🔬 ${label} — Open menu shows Dashboard item`);
    } else {
      fail(`E1 🔬 ${label} — Open menu shows Dashboard item`, "not visible after open click");
    }

    // Assert: clicking Dashboard opens a tab.
    await dashItem.click().catch(() => {});
    await page.waitForTimeout(500);
    const dashTab = page.locator(".ts-tab");
    const dashTabCount = await dashTab.count().catch(() => 0);
    if (dashTabCount > 0) {
      pass(`E1 🔬 ${label} — Dashboard tab opens from empty workspace`);
    } else {
      fail(`E1 🔬 ${label} — Dashboard tab opens from empty workspace`, "no .ts-tab after opening Dashboard");
    }

    await page.screenshot({ path: join(SHOTS_DIR, `01-e1-${label}-after-open.png`) });
    await page.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // E2 — stage padding-top is 10px at both 1440×900 and 390×844 (Pixel 7)
  // ──────────────────────────────────────────────────────────────────────────
  for (const [label, vpOpts] of [
    ["1440x900", { width: 1440, height: 900 }],
    ["Pixel7", { ...devices["Pixel 7"] }],
  ]) {
    const page = await browser.newPage(vpOpts);
    await stubCommon(page);

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Measure computed padding-top on main.stage.
    const paddingTop = await page.evaluate(() => {
      const el = document.querySelector("main.stage");
      if (!el) return null;
      return window.getComputedStyle(el).paddingTop;
    });

    if (paddingTop === "10px") {
      pass(`E2 ${label} — stage padding-top is 10px`);
    } else if (paddingTop === null) {
      fail(`E2 ${label} — stage padding-top is 10px`, "main.stage not found");
    } else {
      fail(`E2 ${label} — stage padding-top is 10px`, `got ${paddingTop}`);
    }

    // Assert nothing above the workspace appears clipped.
    // The tab-strip should be fully visible (bounding box y >= 0).
    const stripBox = await page.locator(".tab-strip").boundingBox().catch(() => null);
    if (stripBox && stripBox.y >= 0) {
      pass(`E2 ${label} — tab strip not clipped (y=${Math.round(stripBox.y)})`);
    } else if (!stripBox) {
      fail(`E2 ${label} — tab strip not clipped`, "no bounding box");
    } else {
      fail(`E2 ${label} — tab strip not clipped`, `y=${stripBox.y} < 0`);
    }

    await page.screenshot({ path: join(SHOTS_DIR, `02-e2-${label}-padding.png`) });
    await page.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
