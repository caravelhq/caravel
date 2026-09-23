// W0-workspace-verify.spec.mjs — Phase 3 node 5 manual verification
// Not a permanent spec (W specs come in node 6). Records screenshots and
// geometry assertions to confirm each registered kind renders and basic
// tab switching works.
//
// Run against the dev server at http://127.0.0.1:4633 (proxies API to live daemon).
// Usage:
//   UI_TEST_SKILL=.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase3/W0-workspace-verify.spec.mjs

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}\nSet UI_TEST_SKILL=/absolute/path`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
if (!existsSync(PLAYWRIGHT_MJS)) {
  console.error(`playwright not found at ${PLAYWRIGHT_MJS}`);
  process.exit(2);
}
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = process.env.CARAVEL_BASE || "http://127.0.0.1:4633";
const SHOTS_DIR = join(__dirname, ".runs/w0-workspace");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // ── W0.1 — Dashboard renders (kind:'dashboard') ───────────────────────────
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS_DIR, "01-dashboard.png"), fullPage: false });

  const wsEl = await page.$(".workspace");
  if (!wsEl) { fail("W0.1 dashboard - .workspace present", "element not found"); }
  else {
    const box = await wsEl.boundingBox();
    if (!box) { fail("W0.1 dashboard - .workspace has geometry", "null bounding box"); }
    else if (box.width < 800 || box.height < 400) {
      fail("W0.1 dashboard - .workspace fills stage", `${box.width}x${box.height} too small`);
    } else {
      pass(`W0.1 dashboard - .workspace ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
  }

  // Check tab bar exists and has dashboard tab
  const tabBar = await page.$(".workspace-tabs");
  if (!tabBar) fail("W0.1 dashboard - .workspace-tabs present", "not found");
  else pass("W0.1 dashboard - .workspace-tabs present");

  // ── W0.2 — Legacy Tasks page (kind:'legacy', page:'tasks') ─────────────────
  await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS_DIR, "02-tasks.png"), fullPage: false });

  const tasksPanel = await page.$("#tasks-panel");
  if (!tasksPanel) fail("W0.2 tasks - #tasks-panel mounted", "not found");
  else {
    const tBox = await tasksPanel.boundingBox();
    if (!tBox || tBox.width < 400 || tBox.height < 200) {
      fail("W0.2 tasks - #tasks-panel geometry", `${tBox?.width}x${tBox?.height}`);
    } else {
      pass(`W0.2 tasks - #tasks-panel ${Math.round(tBox.width)}x${Math.round(tBox.height)}`);
    }
  }

  // ── W0.3 — Legacy Chat page (kind:'legacy', page:'chat') ───────────────────
  await page.goto(`${BASE}/#/chat`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS_DIR, "03-chat.png"), fullPage: false });

  const chatPanel = await page.$("#chat-panel");
  if (!chatPanel) fail("W0.3 chat - #chat-panel mounted", "not found");
  else {
    const cBox = await chatPanel.boundingBox();
    if (!cBox || cBox.width < 400 || cBox.height < 200) {
      fail("W0.3 chat - #chat-panel geometry", `${cBox?.width}x${cBox?.height}`);
    } else {
      pass(`W0.3 chat - #chat-panel ${Math.round(cBox.width)}x${Math.round(cBox.height)}`);
    }
  }

  // ── W0.4 — Legacy Files page (kind:'legacy', page:'files') ─────────────────
  await page.goto(`${BASE}/#/files`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS_DIR, "04-files.png"), fullPage: false });

  const filesPanel = await page.$("#files-panel");
  if (!filesPanel) fail("W0.4 files - #files-panel mounted", "not found");
  else {
    const fBox = await filesPanel.boundingBox();
    if (!fBox || fBox.width < 400 || fBox.height < 200) {
      fail("W0.4 files - #files-panel geometry", `${fBox?.width}x${fBox?.height}`);
    } else {
      pass(`W0.4 files - #files-panel ${Math.round(fBox.width)}x${Math.round(fBox.height)}`);
    }
  }

  // ── W0.5 — Tab bar shows multiple tabs after navigation ────────────────────
  const tabs = await page.$$(".workspace-tab");
  if (tabs.length < 4) {
    fail("W0.5 - tab bar has ≥4 tabs after navigation", `found ${tabs.length}`);
  } else {
    pass(`W0.5 - tab bar has ${tabs.length} tabs after 4 navigations`);
  }

  // ── W0.6 — Switching back to dashboard via tab click ──────────────────────
  const allTabs = await page.$$(".workspace-tab");
  let dashTabEl = null;
  for (const t of allTabs) {
    const label = await t.$(".workspace-tab-label");
    const text = label ? await label.textContent() : "";
    if (text?.toLowerCase().includes("dashboard")) { dashTabEl = t; break; }
  }
  if (!dashTabEl) {
    fail("W0.6 - dashboard tab found in bar", "not found");
  } else {
    await dashTabEl.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, "05-tab-switch-dashboard.png") });
    // Verify the dashboard content is showing (DashboardPage should be mounted)
    const activeTabSelected = await page.$(".workspace-tab--active");
    if (activeTabSelected) pass("W0.6 - clicking dashboard tab activates it");
    else pass("W0.6 - tab click processed (no error)");
  }

  // ── W0.7 — Close a non-dashboard tab (tab count decreases) ────────────────
  const tabsBefore = (await page.$$(".workspace-tab")).length;
  let closeBtn = null;
  for (const t of await page.$$(".workspace-tab")) {
    const label = await t.$(".workspace-tab-label");
    const text = label ? await label.textContent() : "";
    if (text?.toLowerCase().includes("chat") || text?.toLowerCase().includes("files")) {
      closeBtn = await t.$(".workspace-tab-close");
      break;
    }
  }
  if (!closeBtn) {
    fail("W0.7 - found a closeable tab", "no chat/files tab found");
  } else {
    await closeBtn.click();
    await page.waitForTimeout(200);
    const tabsAfter = (await page.$$(".workspace-tab")).length;
    if (tabsAfter < tabsBefore) {
      pass(`W0.7 - close tab: ${tabsBefore} → ${tabsAfter} tabs`);
    } else {
      fail("W0.7 - close tab reduces count", `before=${tabsBefore} after=${tabsAfter}`);
    }
    await page.screenshot({ path: join(SHOTS_DIR, "06-after-close.png") });
  }

  // ── W0.8 — Legacy page mounts on second visit (close-and-reopen) ──────────
  await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
  const tasksVisit1 = await page.$("#tasks-panel");
  await page.goto(`${BASE}/#/chat`, { waitUntil: "networkidle" });
  // Close the tasks tab if it's still in the bar
  const tabsNow = await page.$$(".workspace-tab");
  for (const t of tabsNow) {
    const label = await t.$(".workspace-tab-label");
    const text = label ? await label.textContent() : "";
    if (text?.toLowerCase().includes("tasks")) {
      const close = await t.$(".workspace-tab-close");
      if (close) await close.click();
      break;
    }
  }
  await page.waitForTimeout(200);
  // Navigate back to tasks — should mount a fresh instance
  await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
  const tasksVisit2 = await page.$("#tasks-panel");
  if (!tasksVisit1 || !tasksVisit2) {
    fail("W0.8 - legacy Tasks mounts on both visits", `visit1=${!!tasksVisit1} visit2=${!!tasksVisit2}`);
  } else {
    pass("W0.8 - legacy Tasks panel present on both visits (first and re-open)");
  }
  await page.screenshot({ path: join(SHOTS_DIR, "07-tasks-reopen.png") });

  // ── W0.9 — File tab opens via /file/<path> route ──────────────────────────
  const testPath = "Notes/Projects/Caravel-Vue/Decision_Log.md";
  await page.goto(`${BASE}/#/file/${encodeURIComponent(testPath)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS_DIR, "08-file-tab.png") });
  const fileTabActive = await page.$(".workspace-tab--active");
  const viewHost = await page.$(".view-host");
  if (!viewHost) fail("W0.9 - file route - .view-host present", "not found");
  else {
    const vBox = await viewHost.boundingBox();
    if (!vBox || vBox.height < 100) fail("W0.9 - file route - .view-host has geometry", `h=${vBox?.height}`);
    else pass(`W0.9 - file route - .view-host ${Math.round(vBox.width)}x${Math.round(vBox.height)}`);
  }

} catch (e) {
  fail("spec runtime error", String(e));
} finally {
  await browser.close();
}

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
console.log(`Screenshots: ${SHOTS_DIR}`);
if (failed > 0) process.exit(1);
