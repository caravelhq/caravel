// G-geometry.spec.mjs — Phase 3 geometry baseline spec.
//
// Records bounding boxes and screenshots of the stage, tab nav, dock,
// each page's root panel, and the settings overlay at three viewports.
//
// Runs against a scratch daemon (CARAVEL_BASE=http://127.0.0.1:4636) — never
// against the live daemon, because the live daemon has none of Phase 3's API
// routes and its data is Kelly's real workspace.
//
// Prerequisites:
//   1. Start the scratch daemon:
//      node tests/ui/phase3/scratch-daemon.mjs start \
//        --src repos/caravel/src/index.ts \
//        --ws-dir tests/ui/phase3/fixture-ws
//
//   2. Run this spec (playwright is loaded from UI_TEST_SKILL):
//      UI_TEST_SKILL=/path/to/.claude/skills/ui-test \
//      CARAVEL_BASE=http://127.0.0.1:4636 \
//      G_FIXTURE_NAME=G1-branch \
//      node tests/ui/phase3/G-geometry.spec.mjs \
//        --out tests/ui/phase3/.runs/geometry
//
//   3. Stop the daemon:
//      node tests/ui/phase3/scratch-daemon.mjs stop
//
// Commit the output JSON as the geometry fixture for this run.
// Two runs are needed:
//   G1-vanilla → daemon from 7e4b979 checkout
//   G1-branch  → daemon from feature/WAL-100-phase3 head
// The diff is the layout defect list for Phase 3 step 7.

import { createRequire } from "module";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Playwright is loaded from the UI test skill's node_modules.
// Set UI_TEST_SKILL to the skill root if it's not at the default relative path.
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(
    `Playwright skill root not found: ${SKILL_ROOT}\n` +
    `Set UI_TEST_SKILL=/absolute/path/to/.claude/skills/ui-test`
  );
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
if (!existsSync(PLAYWRIGHT_MJS)) {
  console.error(`playwright not found at ${PLAYWRIGHT_MJS}`);
  process.exit(1);
}
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4636").replace(/\/$/, "");
const OUT_DIR = resolve(
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : join(__dirname, ".runs", "geometry")
);
const FIXTURE_NAME = process.env.G_FIXTURE_NAME || "geometry";

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390x844", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

// Elements measured in every viewport on every page.
// Selectors stable across vanilla (7e4b979) and Phase 2 (7ded2f0).
const GLOBAL_ELEMENTS = [
  { key: "stage", selector: "main.stage" },
  { key: "tab-nav", selector: "nav.tab-nav" },
  { key: "dock", selector: "#dock" },
];

const PAGES = [
  { name: "dashboard", tabId: "#tab-dashboard", panel: "#dashboard-panel" },
  { name: "tasks",     tabId: "#tab-tasks",     panel: "#tasks-panel" },
  { name: "chat",      tabId: "#tab-chat",      panel: "#chat-panel" },
  { name: "files",     tabId: "#tab-files",     panel: "#files-panel" },
];

const SETTINGS = { key: "settings-modal", selector: "#settings-modal", trigger: "#settings-btn" };

async function getBBox(page, selector) {
  const el = page.locator(selector).first();
  try {
    const count = await el.count({ timeout: 2000 });
    if (count === 0) return null;
    return await el.boundingBox({ timeout: 2000 });
  } catch {
    return null;
  }
}

async function waitForApp(page) {
  await page.waitForSelector("main.stage, .stage", { timeout: 12000 }).catch(() => null);
  await page.waitForTimeout(1800);
}

async function measureViewport(browser, viewport) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile ?? false,
    hasTouch: viewport.hasTouch ?? false,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
  });
  const page = await ctx.newPage();
  const ssDir = join(OUT_DIR, "screenshots");

  const vpResult = {
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    globals: {},
    pages: {},
    settings_overlay: null,
  };

  // Preflight check.
  const stateRes = await page.request.get(`${BASE}/api/state`).catch(() => null);
  if (!stateRes || !stateRes.ok()) {
    vpResult.preflight_error = `${BASE}/api/state HTTP ${stateRes?.status() ?? "unreachable"}`;
    await ctx.close();
    return vpResult;
  }

  // Navigate to the root (dashboard).
  await page.goto(`${BASE}/`);
  await waitForApp(page);
  await page.screenshot({ path: join(ssDir, `${FIXTURE_NAME}_${viewport.name}_01-initial.png`) });

  // Global elements at initial load (dashboard page).
  for (const el of GLOBAL_ELEMENTS) {
    vpResult.globals[el.key] = await getBBox(page, el.selector);
  }

  // Each page's root panel.
  for (const pg of PAGES) {
    const tab = page.locator(pg.tabId).first();
    if (await tab.count() > 0) {
      await tab.click();
    } else {
      // Vanilla app uses hash routing; navigate directly.
      const hash = pg.name === "dashboard" ? "" : `#${pg.name}`;
      await page.goto(`${BASE}/${hash}`);
      await waitForApp(page);
    }
    await page.waitForTimeout(600);
    vpResult.pages[pg.name] = { panel: await getBBox(page, pg.panel) };
    await page.screenshot({ path: join(ssDir, `${FIXTURE_NAME}_${viewport.name}_page-${pg.name}.png`) });
  }

  // Settings overlay.
  await page.goto(`${BASE}/`);
  await waitForApp(page);
  const settingsBtn = page.locator(SETTINGS.trigger).first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await page.waitForTimeout(700);
    vpResult.settings_overlay = await getBBox(page, SETTINGS.selector);
    await page.screenshot({ path: join(ssDir, `${FIXTURE_NAME}_${viewport.name}_settings-open.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await ctx.close();
  return vpResult;
}

async function run() {
  mkdirSync(join(OUT_DIR, "screenshots"), { recursive: true });

  // Preflight: verify the daemon is answering before launching browsers.
  let preOk = false;
  try {
    const pre = await fetch(`${BASE}/api/state`, { signal: AbortSignal.timeout(6000) });
    preOk = pre.ok;
  } catch {
    preOk = false;
  }
  if (!preOk) {
    console.error(
      `\nHARNESS: ${BASE}/api/state unreachable — is the scratch daemon running?\n` +
      `  node tests/ui/phase3/scratch-daemon.mjs start --src repos/caravel/src/index.ts\n`
    );
    process.exit(1);
  }

  console.log(`Capturing geometry: ${FIXTURE_NAME} @ ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`  ${vp.name}...`);
    const r = await measureViewport(browser, vp);
    results.push(r);
    if (r.preflight_error) console.warn(`    ! ${r.preflight_error}`);
  }

  await browser.close();

  const output = {
    fixture: FIXTURE_NAME,
    captured_at: new Date().toISOString(),
    base_url: BASE,
    viewports: results,
  };

  const outPath = join(OUT_DIR, `${FIXTURE_NAME}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nGeometry → ${outPath}`);
  console.log(`Screenshots → ${join(OUT_DIR, "screenshots")}/`);
  process.exit(0);
}

run().catch((err) => {
  console.error("G-geometry.spec.mjs failed:", err.message);
  process.exit(1);
});
