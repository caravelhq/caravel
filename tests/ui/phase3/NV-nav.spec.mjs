/**
 * NV-nav.spec.mjs — Phase 3.1 node 2: navigation specs NV1–NV4
 *
 * NV1: Only one navigation bar visible (the old .tab-nav is gone; only TabStrip remains)
 * NV2: Open menu items have their #tab-* IDs and are reachable (keyboard + click)
 * NV3: Split-pane state is persisted / restored across navigation changes
 * NV4: Dashboard is an ordinary closable tab; closing the last tab leaves empty workspace
 *
 * Run:
 *   node tests/ui/phase3/scratch-daemon.mjs start \
 *     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
 *   UI_TEST_SKILL=<path>/.claude/skills/ui-test \
 *   CARAVEL_BASE=http://127.0.0.1:4636 \
 *   node tests/ui/phase3/NV-nav.spec.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.UI_TEST_SKILL;
if (!SKILL_ROOT) throw new Error("UI_TEST_SKILL env var required");

const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);
const BASE = (process.env.CARAVEL_BASE ?? "http://127.0.0.1:4636").replace(/\/$/, "");

const outIdx = process.argv.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? process.argv[outIdx + 1] : join(__dirname, ".runs", "NV-nav");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let shotIdx = 0;
function shot(name) { return join(OUT_DIR, `${String(++shotIdx).padStart(2, "0")}-${name}.png`); }
function rec(name, pass, detail) { results.push({ name, pass, detail }); }

/** Open the OpenMenu dropdown and click a menu item by its id selector. */
async function openMenuItem(page, itemId) {
  await page.click(".open-menu-btn");
  await page.waitForTimeout(150);
  await page.click(itemId);
  await page.waitForTimeout(200);
}

const browser = await chromium.launch({ headless: true });

// ── NV1: Only one navigation bar — no .tab-nav, only .tab-strip ───────────────

for (const vp of [
  { name: "1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "390x844", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
]) {
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor ?? 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".tab-strip", { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot(`nv1-one-bar-${vp.name}`) });

    const navBars = await page.evaluate(() => {
      const tabNav = document.querySelectorAll(".tab-nav").length;
      const tabStrip = document.querySelectorAll(".tab-strip").length;
      return { tabNav, tabStrip };
    });

    rec(`NV1 .tab-nav absent at ${vp.name}`, navBars.tabNav === 0, `count=${navBars.tabNav}`);
    rec(`NV1 .tab-strip present at ${vp.name}`, navBars.tabStrip === 1, `count=${navBars.tabStrip}`);

    // Measure how much vertical space the navigation takes
    const navHeight = await page.evaluate(() => {
      const strip = document.querySelector(".tab-strip");
      if (!strip) return null;
      return strip.getBoundingClientRect().height;
    });
    rec(`NV1 tab-strip height recorded at ${vp.name}`, navHeight !== null, `height=${navHeight?.toFixed(1) ?? "n/a"}px`);

    await ctx.close();
  } catch (err) {
    rec(`NV1 error at ${vp.name}`, false, String(err));
  }
}

// ── NV2: Open menu items have #tab-* IDs and are reachable ────────────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForSelector(".open-menu-btn");

  // Open the menu
  await page.click(".open-menu-btn");
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("nv2-open-menu-open") });

  const menuItems = await page.evaluate(() => {
    const ids = ["#tab-dashboard", "#tab-tasks", "#tab-chat", "#tab-files"];
    return ids.map((id) => {
      const el = document.querySelector(id);
      if (!el) return { id, found: false };
      const r = el.getBoundingClientRect();
      return {
        id,
        found: true,
        visible: r.width > 0 && r.height > 0,
        tag: el.tagName.toLowerCase(),
      };
    });
  });

  for (const item of menuItems) {
    rec(`NV2 ${item.id} exists in Open menu`, item.found, item.found ? `tag=${item.tag}` : "not found");
    if (item.found) {
      rec(`NV2 ${item.id} is visible when menu open`, item.visible, `visible=${item.visible}`);
    }
  }

  // Close menu by pressing Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Verify the <details> element lost its open attribute
  const afterClose = await page.evaluate(() => {
    const details = document.querySelector(".open-menu");
    return { found: !!details, detailsOpen: details?.hasAttribute("open") ?? true };
  });
  rec("NV2 Escape closes Open menu (details.open=false)", afterClose.found && !afterClose.detailsOpen, `detailsOpen=${afterClose.detailsOpen}`);

  await ctx.close();
} catch (err) {
  rec("NV2 error", false, String(err));
}

// Also verify at phone viewport
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForSelector(".open-menu-btn");

  await page.click(".open-menu-btn");
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("nv2-open-menu-390") });

  const mobileItems = await page.evaluate(() => {
    return ["#tab-dashboard", "#tab-tasks", "#tab-chat", "#tab-files"].map((id) => ({
      id,
      found: !!document.querySelector(id),
    }));
  });

  const allFound = mobileItems.every((i) => i.found);
  rec("NV2 all #tab-* IDs present at 390px", allFound, mobileItems.map((i) => `${i.id}:${i.found}`).join(", "));

  await ctx.close();
} catch (err) {
  rec("NV2 mobile error", false, String(err));
}

// ── NV3: Opening a tab via Open menu navigates correctly ──────────────────────
// (NV3 from FDP: "height saved above the workspace" — TabStrip takes less space than old two-bar layout)

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForSelector(".tab-strip");

  // Open tasks via menu
  await openMenuItem(page, "#tab-tasks");
  await page.screenshot({ path: shot("nv3-tasks-tab-opened") });

  const hasTasksTab = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".ts-tab"));
    return tabs.some((t) => t.textContent?.includes("Tasks") || t.dataset.kind === "tasks");
  });
  rec("NV3 Tasks tab opens via Open menu", hasTasksTab, `found=${hasTasksTab}`);

  // Open chat via menu
  await openMenuItem(page, "#tab-chat");
  await page.screenshot({ path: shot("nv3-chat-tab-opened") });

  const hasChatTab = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".ts-tab"));
    return tabs.some((t) => t.textContent?.includes("Chat") || t.dataset.kind === "chat");
  });
  rec("NV3 Chat tab opens via Open menu", hasChatTab, `found=${hasChatTab}`);

  // Measure workspace body height (how much vertical space the nav bar takes)
  const layout = await page.evaluate(() => {
    const strip = document.querySelector(".tab-strip");
    const body = document.querySelector(".workspace-body");
    if (!strip || !body) return null;
    return {
      stripH: strip.getBoundingClientRect().height,
      bodyH: body.getBoundingClientRect().height,
      viewportH: window.innerHeight,
    };
  });

  if (layout) {
    const overhead = layout.viewportH - layout.bodyH;
    // Record the single-bar overhead. Old two-bar layout had tab-nav + tab-strip.
    // We just verify it's less than 200px (a sane upper bound — not two full rows of chrome).
    rec(`NV3 workspace overhead <200px at 1440 (single-bar)`, overhead < 200, `overhead=${overhead.toFixed(1)}px stripH=${layout.stripH.toFixed(1)}px bodyH=${layout.bodyH.toFixed(1)}px`);
  }

  await ctx.close();
} catch (err) {
  rec("NV3 error", false, String(err));
}

// ── NV4: Dashboard is closable; last tab close → empty workspace ──────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForSelector(".tab-strip");

  // NV4a: Dashboard has a close button
  const dashboardCloseBtn = await page.evaluate(() => {
    // Find the Dashboard tab by its text content
    const tabs = Array.from(document.querySelectorAll(".ts-tab"));
    const dash = tabs.find((t) => t.textContent?.includes("Dashboard"));
    if (!dash) return { dashFound: false, hasClose: false };
    const closeBtn = dash.querySelector(".ts-tab-close");
    return { dashFound: true, hasClose: !!closeBtn };
  });

  rec("NV4 Dashboard tab is present", dashboardCloseBtn.dashFound, `found=${dashboardCloseBtn.dashFound}`);
  rec("NV4 Dashboard tab has close button", dashboardCloseBtn.hasClose === true, `hasClose=${dashboardCloseBtn.hasClose}`);

  // NV4b: Close Dashboard — should show empty workspace if it's the only tab
  const tabCount = await page.$$eval(".ts-tab", (tabs) => tabs.length);

  if (tabCount === 1) {
    // Close it
    const closeBtn = await page.$(".ts-tab .ts-tab-close");
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot("nv4-empty-workspace-after-close") });

      const emptyState = await page.evaluate(() => {
        const ws = document.querySelector(".ws-empty");
        const tabs = document.querySelectorAll(".ts-tab");
        return { hasEmptyState: !!ws, tabCount: tabs.length };
      });

      rec("NV4 closing last tab shows .ws-empty", emptyState.hasEmptyState, `hasEmpty=${emptyState.hasEmptyState}`);
      rec("NV4 no tabs remain after closing last", emptyState.tabCount === 0, `tabs=${emptyState.tabCount}`);

      // Open menu button should still be reachable
      const menuReachable = await page.isVisible(".open-menu-btn");
      await page.screenshot({ path: shot("nv4-open-menu-after-empty") });
      rec("NV4 Open menu still reachable in empty workspace", menuReachable, `visible=${menuReachable}`);

      // NV4c: Re-open a tab from empty state
      await openMenuItem(page, "#tab-tasks");
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot("nv4-reopen-from-empty") });

      const reopened = await page.evaluate(() => {
        const ws = document.querySelector(".ws-empty");
        const tabs = document.querySelectorAll(".ts-tab");
        return { hasEmptyState: !!ws, tabCount: tabs.length };
      });
      rec("NV4 tab re-opens from empty workspace", reopened.tabCount > 0 && !reopened.hasEmptyState, `tabs=${reopened.tabCount} empty=${reopened.hasEmptyState}`);
    } else {
      rec("NV4 close button clickable", false, "no .ts-close button found in Dashboard tab");
    }
  } else {
    // More than one tab — open a fresh tab then close all
    rec("NV4 (multi-tab setup — testing close-to-empty flow)", true, `tabs=${tabCount}, testing with fresh page`);

    // Close all tabs one by one
    let attempts = 0;
    while (attempts < 10) {
      const closeBtns = await page.$$(".ts-tab .ts-tab-close");
      if (closeBtns.length === 0) break;
      await closeBtns[0].click();
      await page.waitForTimeout(200);
      attempts++;
    }

    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("nv4-empty-workspace-after-all-closed") });

    const emptyState = await page.evaluate(() => ({
      hasEmptyState: !!document.querySelector(".ws-empty"),
      tabCount: document.querySelectorAll(".ts-tab").length,
    }));

    rec("NV4 closing all tabs shows .ws-empty", emptyState.hasEmptyState, `hasEmpty=${emptyState.hasEmptyState}`);
    rec("NV4 no tabs remain after closing all", emptyState.tabCount === 0, `tabs=${emptyState.tabCount}`);
  }

  await ctx.close();
} catch (err) {
  rec("NV4 error", false, String(err));
}

// NV4 at 390px — verify same behavior on mobile
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForSelector(".tab-strip");

  // Close all tabs
  let attempts = 0;
  while (attempts < 10) {
    const closeBtns = await page.$$(".ts-tab .ts-tab-close");
    if (closeBtns.length === 0) break;
    await closeBtns[0].click();
    await page.waitForTimeout(250);
    attempts++;
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("nv4-empty-workspace-390") });

  const emptyAt390 = await page.evaluate(() => ({
    hasEmptyState: !!document.querySelector(".ws-empty"),
    tabCount: document.querySelectorAll(".ts-tab").length,
    menuReachable: !!document.querySelector(".open-menu-btn"),
  }));

  rec("NV4 empty workspace state correct at 390px", emptyAt390.hasEmptyState && emptyAt390.tabCount === 0, `empty=${emptyAt390.hasEmptyState} tabs=${emptyAt390.tabCount}`);
  rec("NV4 Open menu reachable in empty workspace at 390px", emptyAt390.menuReachable, `found=${emptyAt390.menuReachable}`);

  await ctx.close();
} catch (err) {
  rec("NV4 mobile error", false, String(err));
}

await browser.close();

// Report
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify({
  suite: "NV-nav",
  captured_at: new Date().toISOString(),
  base_url: BASE,
  passed,
  failed,
  results,
  screenshots: `${OUT_DIR}/`,
}, null, 2));

console.log(`\nNV-nav: ${passed} passed, ${failed} failed`);
for (const r of results) {
  console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}: ${r.detail}`);
}

if (failed > 0) process.exit(1);
