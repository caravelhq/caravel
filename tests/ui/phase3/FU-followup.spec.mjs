/**
 * FU-followup.spec.mjs — Phase 3.1 follow-up: four live defects FU1–FU4
 *
 * FU1: The Open menu panel appears (D1 — was clipped by overflow-x:auto).
 *      Assert the panel is visible at both viewports after clicking "Open ▾".
 *
 * FU2: Search modal close paths — touch-emulated spec for D2.
 *      (a) Tap × closes the modal.
 *      (b) Tap outside the card closes the modal.
 *      (c) Tap a result: navigates AND closes the modal.
 *      If all pass in emulation but Kelly's device still fails, the D2 diagnostic
 *      (window.__baseModalCloseLog) records what actually fires on his phone.
 *
 * FU3: Chat draft survives a tab switch (D3 — draft persisted via stores/chat.ts).
 *      Type text in the chat composer, switch tabs, switch back — text is still there.
 *      Also assert localStorage has the draft keyed under the chat session id.
 *
 * FU4: VoiceTaskCreator renders as a BaseModal (<dialog>) not a bare div (D4).
 *      Open the task creator and assert: the inner container is inside a <dialog>
 *      element, the modal has a proper close button ≥44×44px, and at 390px the
 *      sheet shows the BaseModal layout (not a BModal stacked below the page).
 *
 * Run:
 *   node tests/ui/phase3/scratch-daemon.mjs start \
 *     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
 *   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
 *   CARAVEL_BASE=http://127.0.0.1:4636 \
 *   node tests/ui/phase3/FU-followup.spec.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.UI_TEST_SKILL;
if (!SKILL_ROOT) throw new Error("UI_TEST_SKILL env var required");

const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium, devices } = await import(`file://${PLAYWRIGHT_MJS}`);
const BASE = (process.env.CARAVEL_BASE ?? "http://127.0.0.1:4636").replace(/\/$/, "");
console.log(`Base URL: ${BASE}`);

const OUT_DIR = join(__dirname, ".runs", "FU-followup");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let shotIdx = 0;
function shot(name) { return join(OUT_DIR, `${String(++shotIdx).padStart(2, "0")}-${name}.png`); }
function rec(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log((pass ? "✓" : "✗") + ` ${label}${detail ? ": " + detail : ""}`);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "390x844",  width: 390,  height: 844,  isMobile: true,  hasTouch: true, deviceScaleFactor: 2 },
];

const PIXEL7 = { ...devices["Pixel 7"] };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function newCtx(browser, vp) {
  return browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile:  vp.isMobile  ?? false,
    hasTouch:  vp.hasTouch  ?? false,
    deviceScaleFactor: vp.deviceScaleFactor ?? 1,
  });
}

async function waitForDialog(page, selector, timeout = 5000) {
  await page.waitForFunction(
    (sel) => { const d = document.querySelector(sel); return d && d.open; },
    selector,
    { timeout }
  );
}

async function waitForDialogClosed(page, selector, timeout = 3000) {
  await page.waitForFunction(
    (sel) => { const d = document.querySelector(sel); return !d || !d.open; },
    selector,
    { timeout }
  );
}

async function openSearch(page) {
  // Open search via Ctrl+K (keyboard shortcut)
  await page.keyboard.press("Control+k");
  // Wait for the search dialog to open
  await page.waitForFunction(() => {
    const dialogs = Array.from(document.querySelectorAll(".base-modal"));
    return dialogs.some(d => d.open && d.querySelector(".srch-modal-body"));
  }, { timeout: 5000 });
}

function searchDialogSelector() { return '.base-modal[data-size="lg"]'; }

// ── FU1: Open menu panel appears after clicking "Open ▾" ─────────────────────

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    // Before click: panel should not be visible
    const beforeVisible = await page.evaluate(() => {
      const panel = document.querySelector(".open-menu-list");
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    rec(`FU1 Open menu panel hidden before click [${vp.name}]`, !beforeVisible,
        beforeVisible ? "panel was already visible" : "correctly hidden");

    // Click "Open ▾"
    await page.click(".open-menu-btn");
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot(`fu1-menu-open-${vp.name}`) });

    // After click: panel should be visible and within viewport
    const afterState = await page.evaluate(() => {
      const panel = document.querySelector(".open-menu-list");
      if (!panel) return { found: false };
      const r = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        found: true,
        visible: r.width > 0 && r.height > 0,
        inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw,
        top: r.top,
        left: r.left,
        bottom: r.bottom,
        right: r.right,
        vw,
        vh,
      };
    });

    if (!afterState.found) {
      rec(`FU1 Open menu panel found after click [${vp.name}]`, false, ".open-menu-list not in DOM");
    } else {
      rec(`FU1 Open menu panel visible after click [${vp.name}]`, afterState.visible,
          `w×h visible=${afterState.visible}`);
      rec(`FU1 Open menu panel within viewport [${vp.name}]`, afterState.inViewport,
          `top=${afterState.top?.toFixed(0)} left=${afterState.left?.toFixed(0)} bottom=${afterState.bottom?.toFixed(0)} vw=${afterState.vw} vh=${afterState.vh}`);
    }

    // Menu items should be clickable (not clipped)
    const dashboardBtn = await page.evaluate(() => {
      const btn = document.getElementById("tab-dashboard");
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { visible: r.width > 0 && r.height > 0, top: r.top, left: r.left };
    });
    rec(`FU1 #tab-dashboard item visible in panel [${vp.name}]`,
        !!(dashboardBtn?.visible),
        dashboardBtn ? `top=${dashboardBtn.top?.toFixed(0)} left=${dashboardBtn.left?.toFixed(0)}` : "not found");

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU1 error [${vp.name}]`, false, String(err));
  }
}

// ── FU2: Search modal close paths (touch-emulated) ───────────────────────────
// This is the third attempt at this bug. We write the spec and run it.
// If it passes but Kelly's device still fails, the diagnostic in BaseModal
// (window.__baseModalCloseLog) captures what actually fires on his phone.

// Helper: click the close button inside the open search modal specifically
async function clickSearchModalClose(page) {
  await page.waitForFunction(() => {
    const dialogs = Array.from(document.querySelectorAll(".base-modal"));
    const d = dialogs.find(dd => dd.open && dd.querySelector(".srch-modal-body"));
    return d && d.querySelector(".base-modal-close");
  }, { timeout: 3000 });
  await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll(".base-modal"));
    const d = dialogs.find(dd => dd.open && dd.querySelector(".srch-modal-body"));
    const btn = d?.querySelector(".base-modal-close");
    btn?.click();
  });
}

// Helper: get inner card bounding box for the open search modal
async function getSearchModalInnerRect(page) {
  return page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll(".base-modal"));
    const d = dialogs.find(dd => dd.open && dd.querySelector(".srch-modal-body"));
    if (!d) return null;
    const inner = d.querySelector(".base-modal-inner");
    if (!inner) return null;
    const r = inner.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

// FU2a: Tap × closes the modal (touch-emulated Pixel 7)
for (const [label, ctxOpts] of [
  ["mouse 1440x900", { viewport: { width: 1440, height: 900 } }],
  ["touch Pixel7",   { ...PIXEL7 }],
]) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    // Open search
    await openSearch(page);

    await page.screenshot({ path: shot(`fu2a-before-close-${label.replace(/\s/g, "_")}`) });

    // Tap the × button inside the open search modal
    await clickSearchModalClose(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`fu2a-after-close-${label.replace(/\s/g, "_")}`) });

    const stillOpen = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll(".base-modal"));
      return dialogs.some(d => d.open && d.querySelector(".srch-modal-body"));
    });
    rec(`FU2a × closes search modal [${label}]`, !stillOpen,
        stillOpen ? "modal still open after × tap" : "modal closed");

    // Check the close log
    const closeLog = await page.evaluate(() => (window.__baseModalCloseLog ?? []));
    rec(`FU2a close log captured [${label}]`, closeLog.length > 0,
        `${closeLog.length} entries: ${JSON.stringify(closeLog.slice(-2))}`);

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU2a error [${label}]`, false, String(err));
  }
}

// FU2b: Tap outside the card closes the modal
for (const [label, ctxOpts] of [
  ["mouse 1440x900", { viewport: { width: 1440, height: 900 } }],
  ["touch Pixel7",   { ...PIXEL7 }],
]) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    await openSearch(page);

    // Find a point outside the inner card of the open search modal
    const outerPoint = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll(".base-modal"));
      const d = dialogs.find(dd => dd.open && dd.querySelector(".srch-modal-body"));
      const inner = d?.querySelector(".base-modal-inner");
      if (!inner) return null;
      const r = inner.getBoundingClientRect();
      // Tap top-left corner of viewport, guaranteed outside card
      return { x: 5, y: 5, cardLeft: r.left, cardTop: r.top };
    });

    if (!outerPoint) {
      rec(`FU2b backdrop tap [${label}]`, false, ".base-modal-inner not found");
    } else {
      await page.mouse.click(outerPoint.x, outerPoint.y);
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot(`fu2b-after-backdrop-${label.replace(/\s/g, "_")}`) });

      const stillOpen = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll(".base-modal"));
        return dialogs.some(d => d.open && d.querySelector(".srch-modal-body"));
      });
      rec(`FU2b backdrop tap closes search modal [${label}]`, !stillOpen,
          stillOpen ? `modal still open (card was at left=${outerPoint.cardLeft?.toFixed(0)} top=${outerPoint.cardTop?.toFixed(0)})` : "modal closed");
    }

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU2b error [${label}]`, false, String(err));
  }
}

// FU2c: Tap a result — navigates AND closes the modal
// Uses the SR stub route to inject a row with a known path
for (const [label, ctxOpts] of [
  ["mouse 1440x900", { viewport: { width: 1440, height: 900 } }],
  ["touch Pixel7",   { ...PIXEL7 }],
]) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();

    // Intercept /api/knowledge/search to return a row with a valid path
    await ctx.route("**/api/knowledge/search**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          docs: [{
            id: 9999,
            path: "Notes/Projects/Caravel-Vue/README.md",
            title: "Caravel Vue README",
            doc_type: "readme",
            status: "active",
            score: -1,
            snippet: "test result",
            via: ["fts"],
          }],
          reports: [],
        }),
      });
    });

    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    await openSearch(page);

    // Type a query to trigger the (stubbed) search
    await page.fill('input[aria-label="Search query"]', "test");
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`fu2c-result-row-${label.replace(/\s/g, "_")}`) });

    // Check a result row appeared
    const rowFound = await page.evaluate(() => {
      return !!document.querySelector(".srch-row:not(.srch-row--dead)");
    });

    if (!rowFound) {
      rec(`FU2c result row appeared [${label}]`, false, "no clickable .srch-row found (stub may not have fired)");
    } else {
      // Click the result
      await page.click(".srch-row:not(.srch-row--dead)");
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot(`fu2c-after-result-click-${label.replace(/\s/g, "_")}`) });

      const modalStillOpen = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll(".base-modal"));
        return dialogs.some(d => d.open && d.querySelector(".srch-modal-body"));
      });
      rec(`FU2c clicking result closes search modal [${label}]`, !modalStillOpen,
          modalStillOpen ? "modal still open after result click" : "modal closed");

      const tabOpened = await page.evaluate(() => {
        // Check that a new tab was opened by ws.open (a .ts-tab should exist for the file)
        return document.querySelectorAll(".ts-tab").length > 0;
      });
      rec(`FU2c clicking result opens a tab [${label}]`, tabOpened,
          `tabs in strip: ${tabOpened ? "≥1" : "0"}`);
    }

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU2c error [${label}]`, false, String(err));
  }
}

// ── FU3: Chat draft survives tab switch ───────────────────────────────────────

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    // Open chat tab via the Open menu
    await page.click(".open-menu-btn");
    await page.waitForSelector("#tab-chat", { timeout: 3000 });
    await page.click("#tab-chat");
    await page.waitForTimeout(500);

    // Check that the chat composer is present
    const inputPresent = await page.evaluate(() => !!document.getElementById("chat-input"));
    if (!inputPresent) {
      rec(`FU3 chat-input present [${vp.name}]`, false, "#chat-input not found after opening chat");
      const browser2 = await chromium.launch({ headless: true }); // unused, just to keep structure
      await browser.close();
      continue;
    }

    const DRAFT_TEXT = `test-draft-${Date.now()}`;

    // Type draft text
    await page.fill("#chat-input", DRAFT_TEXT);
    await page.waitForTimeout(200);

    // Verify localStorage has the draft
    const localStorageHasDraft = await page.evaluate((draft) => {
      const raw = localStorage.getItem("chat.drafts");
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return Object.values(obj).some(v => v === draft);
    }, DRAFT_TEXT);
    rec(`FU3 draft saved to localStorage [${vp.name}]`, localStorageHasDraft,
        localStorageHasDraft ? "draft found in chat.drafts" : "draft not found in localStorage");

    // Switch to dashboard tab
    await page.click(".open-menu-btn");
    await page.waitForSelector("#tab-dashboard", { timeout: 3000 });
    await page.click("#tab-dashboard");
    await page.waitForTimeout(300);

    // Switch back to chat
    await page.click(".open-menu-btn");
    await page.waitForSelector("#tab-chat", { timeout: 3000 });
    await page.click("#tab-chat");
    await page.waitForTimeout(500);

    // Check draft is restored
    const restoredValue = await page.evaluate(() => {
      const el = document.getElementById("chat-input");
      return el ? el.value : null;
    });

    const draftRestored = restoredValue === DRAFT_TEXT;
    rec(`FU3 draft restored after tab switch [${vp.name}]`, draftRestored,
        draftRestored ? "draft intact" : `got: "${restoredValue?.slice(0, 40)}"`);

    await page.screenshot({ path: shot(`fu3-draft-restored-${vp.name}`) });

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU3 error [${vp.name}]`, false, String(err));
  }
}

// ── FU4: VoiceTaskCreator renders as a BaseModal <dialog> ────────────────────

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector(".open-menu-btn", { timeout: 5000 });

    // Trigger the VoiceTaskCreator via the voice:open-task-creator event
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("voice:open-task-creator"));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot(`fu4-vtc-open-${vp.name}`) });

    // Assert it rendered as a <dialog> (BaseModal), not a bare div
    const dialogState = await page.evaluate(() => {
      // BaseModal renders a <dialog> element; BModal renders a <div class="modal">
      const dialogs = Array.from(document.querySelectorAll("dialog.base-modal"));
      const openDialog = dialogs.find(d => d.open);
      if (!openDialog) {
        // Check if a legacy BModal rendered instead
        const bModal = document.querySelector(".modal.show, .modal[style*='display: block']");
        return {
          foundDialog: false,
          foundBModal: !!bModal,
          allDialogs: dialogs.length,
        };
      }
      const inner = openDialog.querySelector(".base-modal-inner");
      const closeBtn = openDialog.querySelector(".base-modal-close");
      const closeBtnBox = closeBtn ? closeBtn.getBoundingClientRect() : null;
      const r = openDialog.getBoundingClientRect();
      return {
        foundDialog: true,
        isOpen: openDialog.open,
        hasInner: !!inner,
        hasCloseBtn: !!closeBtn,
        closeBtnW: closeBtnBox?.width ?? 0,
        closeBtnH: closeBtnBox?.height ?? 0,
        dialogTop: r.top,
        dialogLeft: r.left,
      };
    });

    if (!dialogState.foundDialog) {
      rec(`FU4 VoiceTaskCreator renders as <dialog> [${vp.name}]`, false,
          dialogState.foundBModal
            ? "found BModal div instead of <dialog> — BModal not ported"
            : `no open <dialog> found (allDialogs=${dialogState.allDialogs})`);
    } else {
      rec(`FU4 VoiceTaskCreator renders as <dialog> [${vp.name}]`, true, "open <dialog> found");
      rec(`FU4 VoiceTaskCreator inner card present [${vp.name}]`, dialogState.hasInner, "");
      rec(`FU4 VoiceTaskCreator close button present [${vp.name}]`, dialogState.hasCloseBtn, "");
      if (dialogState.hasCloseBtn) {
        rec(`FU4 VoiceTaskCreator close button ≥44×44px [${vp.name}]`,
            dialogState.closeBtnW >= 44 && dialogState.closeBtnH >= 44,
            `${dialogState.closeBtnW?.toFixed(1)}×${dialogState.closeBtnH?.toFixed(1)}px`);
      }
    }

    // Also assert the modal is NOT rendered as a div below the viewport
    const positionCheck = await page.evaluate(() => {
      const modal = document.querySelector("dialog.base-modal[open]");
      if (!modal) return null;
      const r = modal.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    });

    if (positionCheck) {
      const inViewport =
        positionCheck.top >= -1 &&
        positionCheck.left >= -1 &&
        positionCheck.bottom <= (vp.height + 1) &&
        positionCheck.right <= (vp.width + 1);
      rec(`FU4 VoiceTaskCreator dialog within viewport [${vp.name}]`, inViewport,
          `top=${positionCheck.top?.toFixed(0)} bottom=${positionCheck.bottom?.toFixed(0)} vp.height=${vp.height}`);
    }

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`FU4 error [${vp.name}]`, false, String(err));
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
