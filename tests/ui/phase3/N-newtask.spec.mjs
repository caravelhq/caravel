// N-newtask.spec.mjs — Phase 3 node 7 NewTaskModal specs: N1–N3
//
// N1: Modal opens from Dashboard "+ New Task" button and from `n` key shortcut;
//     dialog element has visible geometry; closes on Cancel / Escape.
// N2: Submitting a task dispatches to /api/tasks/new with NO priority field.
//     Mutation proof: re-add priority:"P2" to the submit payload → N2 goes red.
// N3: Submitting a schedule dispatches to /api/tasks/schedule with NO priority field.
//
// Run against the dev server (proxies API to live daemon):
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase3/N-newtask.spec.mjs
//
// For mutation proof (N2 --mut), run with MUTATION=1 after temporarily injecting
// priority:"P2" into the NewTaskModal submit payload.

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
const SHOTS_DIR = join(__dirname, ".runs/n-newtask");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

async function resetWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ headless: true });

try {
  // ─────────────────────────────────────────────────────────────────────────────
  // N1 — Modal opens (button + n-key), has geometry, closes cleanly
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
    await resetWorkspace(page);

    // Open via "+ New Task" button on Dashboard
    await page.click(".quick-open-create");
    await page.waitForTimeout(400);

    const dialogBox = await page.locator("dialog#new-task-modal").boundingBox();
    await page.screenshot({ path: join(SHOTS_DIR, "01-n1-modal-open.png") });

    if (!dialogBox) {
      fail("N1 - modal opens via + New Task button", "dialog#new-task-modal not found");
    } else if (dialogBox.width < 400 || dialogBox.height < 200) {
      fail("N1 - modal has visible geometry", `w=${dialogBox.width} h=${dialogBox.height} (expected ≥400×200)`);
    } else {
      pass(`N1 - modal opens via + New Task (${Math.round(dialogBox.width)}×${Math.round(dialogBox.height)}px)`);
    }

    // Close via Cancel button
    await page.click(".multi-agent-new-cancel");
    await page.waitForTimeout(300);
    const afterCloseCount = await page.locator("dialog#new-task-modal[open]").count();
    if (afterCloseCount > 0) fail("N1 - modal closes via Cancel", "dialog still has open attribute");
    else pass("N1 - modal closes via Cancel");

    // Open via 'n' keyboard shortcut
    await page.keyboard.press("n");
    await page.waitForTimeout(400);
    const dialogAfterN = await page.locator("dialog#new-task-modal").boundingBox();
    await page.screenshot({ path: join(SHOTS_DIR, "02-n1-modal-n-key.png") });

    if (!dialogAfterN || dialogAfterN.width < 400) {
      fail("N1 - modal opens via 'n' key", `dialog bounds: ${JSON.stringify(dialogAfterN)}`);
    } else {
      pass(`N1 - modal opens via 'n' key (${Math.round(dialogAfterN.width)}×${Math.round(dialogAfterN.height)}px)`);
    }

    // Close via Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const afterEscCount = await page.locator("dialog#new-task-modal[open]").count();
    if (afterEscCount > 0) fail("N1 - modal closes via Escape", "dialog still has open attribute");
    else pass("N1 - modal closes via Escape");

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // N2 — Dispatched task envelope has NO priority field
  //      Mutation proof: inject priority:"P2" → this spec must go red
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
    await resetWorkspace(page);

    // Intercept /api/tasks/new and capture the request body
    let capturedPayload = null;
    await page.route("**/api/tasks/new", (route, request) => {
      try {
        capturedPayload = JSON.parse(request.postData() || "{}");
      } catch (_) {
        capturedPayload = {};
      }
      // Return a fake success so the modal closes
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: "TSK-N2-TEST" }),
      });
    });

    // Open modal, fill minimum fields, submit
    await page.click(".quick-open-create");
    await page.waitForTimeout(400);

    await page.fill("#ntm-headline", "N2 test no priority");
    await page.fill("#ntm-brief", "Verify the payload carries no priority field.");
    await page.waitForTimeout(200);

    await page.screenshot({ path: join(SHOTS_DIR, "03-n2-before-submit.png") });
    await page.click(".multi-agent-new-submit");
    await page.waitForTimeout(800);

    await page.screenshot({ path: join(SHOTS_DIR, "04-n2-after-submit.png") });

    if (!capturedPayload) {
      fail("N2 - request was intercepted", "no request body captured");
    } else if ("priority" in capturedPayload) {
      fail("N2 - no priority in task payload", `payload.priority = ${JSON.stringify(capturedPayload.priority)}`);
    } else {
      pass(`N2 - task payload has no priority (to=${capturedPayload.to}, headline="${capturedPayload.headline}")`);
    }

    // Verify required fields are present
    if (capturedPayload && capturedPayload.headline && capturedPayload.brief && capturedPayload.to) {
      pass("N2 - required fields (to, headline, brief) present in payload");
    } else {
      fail("N2 - required fields check", `payload keys: ${Object.keys(capturedPayload || {}).join(",")}`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // N3 — Schedule template dispatch has NO priority field
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
    await resetWorkspace(page);

    let capturedSchedulePayload = null;
    await page.route("**/api/tasks/schedule", (route, request) => {
      try {
        capturedSchedulePayload = JSON.parse(request.postData() || "{}");
      } catch (_) {
        capturedSchedulePayload = {};
      }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: "SCHED-N3-TEST" }),
      });
    });

    // Open modal, enable Repeat, fill fields, submit
    await page.click(".quick-open-create");
    await page.waitForTimeout(400);

    await page.fill("#ntm-headline", "N3 schedule no priority");
    await page.fill("#ntm-brief", "Verify schedule template carries no priority field.");

    // Check the Repeat checkbox
    await page.click(".ntm-check-label input[type='checkbox']");
    await page.waitForTimeout(300);

    await page.screenshot({ path: join(SHOTS_DIR, "05-n3-repeat-on.png") });

    // Check that next fire times show (interval mode default)
    const nextFires = await page.$$(".ntm-next-fires-list li");
    if (nextFires.length === 3) {
      pass(`N3 - next fire preview shows 3 times (interval mode)`);
    } else {
      fail("N3 - next fire preview", `expected 3 fire times, got ${nextFires.length}`);
    }

    await page.click(".multi-agent-new-submit");
    await page.waitForTimeout(800);

    await page.screenshot({ path: join(SHOTS_DIR, "06-n3-after-submit.png") });

    if (!capturedSchedulePayload) {
      fail("N3 - schedule request was intercepted", "no schedule request body captured");
    } else if ("priority" in capturedSchedulePayload) {
      fail("N3 - no priority in schedule payload", `payload.priority = ${JSON.stringify(capturedSchedulePayload.priority)}`);
    } else {
      pass(`N3 - schedule payload has no priority (recurrence=${JSON.stringify(capturedSchedulePayload.recurrence?.interval || capturedSchedulePayload.recurrence?.cron || "?")})`);
    }

    // Verify recurrence block is present
    if (capturedSchedulePayload?.recurrence) {
      pass("N3 - schedule payload has recurrence block");
    } else {
      fail("N3 - recurrence block present", `payload: ${JSON.stringify(capturedSchedulePayload)}`);
    }

    await page.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${passed + failed} specs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
