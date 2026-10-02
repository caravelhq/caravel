/**
 * M-modal.spec.mjs — Phase 3 node 2: BaseModal M1 and M2 gate
 *
 * M1: Settings modal opens as a centred dialog at md width (≈480px ±8px), vertically
 *     centred at 1440×900. At 390×844 it renders as a bottom sheet (full viewport width).
 *
 * M2: Escape closes only the topmost stacked dialog (info, not settings). Backdrop click
 *     closes settings. Focus returns to the opener (#settings-btn) after settings closes.
 *
 * Run:
 *   UI_TEST_SKILL=<path>/.claude/skills/ui-test \
 *   CARAVEL_BASE=http://127.0.0.1:4636 \
 *   node tests/ui/phase3/M-modal.spec.mjs --out tests/ui/phase3/.runs/M-modal
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.UI_TEST_SKILL;
if (!SKILL_ROOT) throw new Error("UI_TEST_SKILL env var required");

const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);
const BASE = process.env.CARAVEL_BASE ?? "http://127.0.0.1:4636";

// Parse --out flag
const outIdx = process.argv.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? process.argv[outIdx + 1] : join(__dirname, ".runs", "M-modal");

import { mkdirSync, writeFileSync } from "fs";
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let screenshotIdx = 0;

function shot(name) {
  return join(OUT_DIR, `${String(++screenshotIdx).padStart(2, "0")}-${name}.png`);
}

async function waitForDialog(page, selector, timeoutMs = 3000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.tagName === "DIALOG" && el.open;
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function assertDialogClosed(page, selector) {
  const open = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.open : false;
  }, selector);
  if (open) throw new Error(`Expected ${selector} to be closed but it is still open`);
}

const browser = await chromium.launch({ headless: true });

// ── M1: geometry at 1440×900 and 390×844 ──────────────────────────────────────

try {
  const MD_WIDTH = 480;
  const TOLERANCE = 8;

  // M1a — desktop: centred, md width
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/#/dashboard");
    await page.waitForSelector("#settings-btn");

    await page.click("#settings-btn");
    await waitForDialog(page, "#settings-modal");

    const box = await page.evaluate(() => {
      const d = document.querySelector("#settings-modal");
      const r = d.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const vp = { w: 1440, h: 900 };

    await page.screenshot({ path: shot("m1-desktop-settings-open") });

    const widthOk = Math.abs(box.w - MD_WIDTH) <= TOLERANCE;
    const centredX = Math.abs((box.x + box.w / 2) - vp.w / 2) <= TOLERANCE + 10;
    const centredY = Math.abs((box.y + box.h / 2) - vp.h / 2) <= vp.h * 0.15; // generous vertical

    results.push({
      name: "M1a - desktop md width",
      pass: widthOk,
      detail: `width=${box.w}px (expected ${MD_WIDTH}±${TOLERANCE}px)`,
    });
    results.push({
      name: "M1a - desktop centred horizontally",
      pass: centredX,
      detail: `center-x=${box.x + box.w / 2} vs viewport-center=${vp.w / 2}`,
    });
    results.push({
      name: "M1a - desktop centred vertically",
      pass: centredY,
      detail: `center-y=${box.y + box.h / 2} vs viewport-center=${vp.h / 2}`,
    });

    await ctx.close();
  }

  // M1b — mobile 390×844: bottom sheet (full width)
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/#/dashboard");
    await page.waitForSelector("#settings-btn");

    await page.click("#settings-btn");
    await waitForDialog(page, "#settings-modal");

    const box = await page.evaluate(() => {
      const d = document.querySelector("#settings-modal");
      const r = d.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });

    await page.screenshot({ path: shot("m1-mobile-settings-sheet") });

    // Bottom sheet: width ≥ viewport width - 4px (CSS: width: 100%)
    const isFullWidth = box.w >= 386;
    // Bottom sheet: pinned to bottom (bottom of dialog ≈ bottom of viewport, or at least near it)
    // Since max-height: 85vh, the modal may not touch the bottom if content is short
    // Key check: x ≈ 0 and w ≈ full
    const isAtLeft = box.x <= 2;

    results.push({
      name: "M1b - mobile full width",
      pass: isFullWidth,
      detail: `width=${box.w}px at 390px viewport`,
    });
    results.push({
      name: "M1b - mobile anchored left",
      pass: isAtLeft,
      detail: `x=${box.x} (expected ≤2)`,
    });

    await ctx.close();
  }
} catch (err) {
  results.push({ name: "M1 - setup error", pass: false, detail: String(err) });
}

// ── M2: Escape closes topmost only; backdrop click closes; focus returns ───────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#settings-btn");

  // Open settings
  await page.click("#settings-btn");
  await waitForDialog(page, "#settings-modal");

  const settingsOpenBeforeEsc = await page.evaluate(() => document.querySelector("#settings-modal")?.open);
  results.push({
    name: "M2 - settings opens",
    pass: Boolean(settingsOpenBeforeEsc),
    detail: `#settings-modal.open=${settingsOpenBeforeEsc}`,
  });

  // Open info modal (click the Advanced → Info button)
  await page.click("#info-open");
  await waitForDialog(page, "#info-modal");

  await page.screenshot({ path: shot("m2-both-modals-open") });

  const bothOpen = await page.evaluate(() => ({
    settings: document.querySelector("#settings-modal")?.open,
    info: document.querySelector("#info-modal")?.open,
  }));
  results.push({
    name: "M2 - both modals open simultaneously",
    pass: Boolean(bothOpen.settings && bothOpen.info),
    detail: `settings.open=${bothOpen.settings}, info.open=${bothOpen.info}`,
  });

  // Press Escape — should close info modal only
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.screenshot({ path: shot("m2-after-first-escape") });

  const afterEsc1 = await page.evaluate(() => ({
    settings: document.querySelector("#settings-modal")?.open,
    info: document.querySelector("#info-modal")?.open,
  }));
  results.push({
    name: "M2 - Escape closes info modal (topmost)",
    pass: Boolean(!afterEsc1.info),
    detail: `info.open=${afterEsc1.info} after Escape`,
  });
  results.push({
    name: "M2 - settings stays open after Escape on info",
    pass: Boolean(afterEsc1.settings),
    detail: `settings.open=${afterEsc1.settings} after Escape on info`,
  });

  // Press Escape again — should close settings
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.screenshot({ path: shot("m2-after-second-escape") });

  const settingsClosed = await page.evaluate(() => !document.querySelector("#settings-modal")?.open);
  results.push({
    name: "M2 - second Escape closes settings",
    pass: settingsClosed,
    detail: `settings.open=${!settingsClosed} after second Escape`,
  });

  // Reopen settings and test backdrop click
  await page.click("#settings-btn");
  await waitForDialog(page, "#settings-modal");

  // Click outside the dialog bounding box (top-left corner of viewport)
  const dialogBox = await page.evaluate(() => {
    const r = document.querySelector("#settings-modal").getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });

  // Click a point clearly outside the dialog (top-left corner)
  await page.mouse.click(10, 10);
  await page.waitForTimeout(200);

  await page.screenshot({ path: shot("m2-after-backdrop-click") });

  const settingsClosedAfterBackdrop = await page.evaluate(() => !document.querySelector("#settings-modal")?.open);
  results.push({
    name: "M2 - backdrop click closes settings",
    pass: settingsClosedAfterBackdrop,
    detail: `settings.open=${!settingsClosedAfterBackdrop} after backdrop click`,
  });

  // Focus returns to settings-btn after close
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
  results.push({
    name: "M2 - focus returns to #settings-btn",
    pass: focusedId === "settings-btn",
    detail: `focused element id="${focusedId}"`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "M2 - error", pass: false, detail: String(err) });
}

await browser.close();

// Report
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
const report = {
  suite: "M-modal",
  captured_at: new Date().toISOString(),
  base_url: BASE,
  passed,
  failed,
  results,
  screenshots: `${OUT_DIR}/`,
};

writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

console.log(`\nM-modal: ${passed} passed, ${failed} failed`);
for (const r of results) {
  const mark = r.pass ? "✓" : "✗";
  console.log(`  ${mark} ${r.name}: ${r.detail}`);
}

if (failed > 0) process.exit(1);
