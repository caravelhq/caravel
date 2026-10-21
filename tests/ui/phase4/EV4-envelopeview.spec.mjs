// EV4-envelopeview.spec.mjs — Phase 4 step 1: EnvelopeView SFC full action surface
//
// EV4-1: Persistent header above tab bar; headline + project chip visible
// EV4-2: Tab bar has role="tablist"; tabs have role="tab";
//         :aria-selected is a boolean value (not the string literal "subView === 'task'")
// EV4-3: Continue form (terminal && !isClosed) renders and POSTs /next;
//         payload fields asserted: method POST, URL /next, source:"continue"
//         Mutation proof: comment out submitContinue() → this assertion fails.
// EV4-4: Done reading button (terminal && !isClaimed && !isClosed) fires
//         POST /close with {status:"closed"}; payload field asserted
// EV4-5: Abort form (claimed) shows; POST /abort intercepted with payload
// EV4-6: Reopen fires POST /reopen for a closed task
// EV4-7: S2 route fix — /tasks/project/:slug does NOT open as envelope
// EV4-8: Cancel form (!terminal && !claimed && !isClosed) shows and POSTs /close
// EV4-9: Resume button (paused && !isClosed) fires POST /resume
//
// Harness: test server at :4642, /api/* → live daemon at :4632 (proxied but
//   all /api/tasks/* calls are route-intercepted via page.route() so no fixture needed).
//
// Mutation proof (EV4-3):
//   In TaskActions.vue, comment out the `await fetch(.../next)` call inside
//   submitContinue() — EV4-3's POST assertion goes red because the route never fires.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4642 \
//   node tests/ui/phase4/EV4-envelopeview.spec.mjs

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}\nSet UI_TEST_SKILL=/absolute/path`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4642").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/EV4-envelopeview");
mkdirSync(SHOTS_DIR, { recursive: true });

// ── Fixture task IDs (do not exist in corpus — always route-stubbed) ──────────

const TASK_TERMINAL  = "TSK-EV4-2026-10-21-0001.01"; // done, not closed
const TASK_CLAIMED   = "TSK-EV4-2026-10-21-0001.02"; // claimed, not closed
const TASK_CLOSED    = "TSK-EV4-2026-10-21-0001.03"; // done + closed
const TASK_PAUSED    = "TSK-EV4-2026-10-21-0001.04"; // paused, not closed
const TASK_CANCEL    = "TSK-EV4-2026-10-21-0001.05"; // open (not terminal), not claimed

const HEADLINE_TERMINAL = "EV4 terminal task — Phase 4 step 1";

function makeChain(taskOverrides) {
  const base = {
    id: TASK_TERMINAL,
    agent: "bob",
    to: "bob",
    from: "alice",
    status: "done",
    headline: HEADLINE_TERMINAL,
    brief: "Brief content for EV4 spec.",
    summary: { response: "Result content for EV4 spec." },
    // No reportPath: prevents auto-switch to Report pane, keeping Task pane (and actions) visible
    reportPath: null,
    project: "Caravel-Vue",
    kind: "code",
    updated: new Date().toISOString(),
    closed: null,
    context: [],
  };
  return { ok: true, chain: { task: { ...base, ...taskOverrides }, ancestors: [], children: [] } };
}

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Stub all /api/live SSE + tasks list so the app loads without corpus ───────

async function stubBaseRoutes(page) {
  // SSE: abort immediately so networkidle never hangs
  await page.route("**/api/live", (route) =>
    route.abort("connectionrefused")
  );
  // tasks list
  await page.route(/\/api\/tasks\?limit=120/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [
        { id: TASK_TERMINAL, agent: "bob", status: "done", headline: HEADLINE_TERMINAL },
      ] }),
    })
  );
  // attention / agents / knowledge endpoints — stub empty so no noise
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/tasks/TSK-EV4")) return; // leave task-specific routes unmatched
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [] }) });
  });
}

async function stubTask(page, taskId, chainData) {
  await page.route(`**\/api\/tasks\/${encodeURIComponent(taskId)}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(chainData),
    })
  );
}

async function loadEnvelope(page, taskId) {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(taskId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
}

// ── Test helpers ──────────────────────────────────────────────────────────────

async function shot(page, name) {
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ── Main suite ────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

for (const VP of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: VP.width, height: VP.height } });
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });

  // ── EV4-1: Persistent header above tab bar ──────────────────────────────────
  try {
    await stubBaseRoutes(page);
    await stubTask(page, TASK_TERMINAL, makeChain({}));
    await loadEnvelope(page, TASK_TERMINAL);

    // Header should be above the tab bar in DOM
    const headerBox = await page.locator(".ev-header").boundingBox();
    const tabBarBox = await page.locator("[role=tablist]").boundingBox();
    if (!headerBox) { fail(`EV4-1 persistent header visible [${VP.label}]`, ".ev-header not found"); }
    else if (!tabBarBox) { fail(`EV4-1 tab bar visible [${VP.label}]`, "[role=tablist] not found"); }
    else if (headerBox.y >= tabBarBox.y) { fail(`EV4-1 header above tab bar [${VP.label}]`, `header.y=${headerBox.y} >= tabBar.y=${tabBarBox.y}`); }
    else { pass(`EV4-1 persistent header above tab bar [${VP.label}]`); }

    // Headline text visible
    const headlineEl = await page.locator(".ev-headline-text");
    const headlineText = await headlineEl.textContent().catch(() => null);
    if (headlineText && headlineText.includes("EV4 terminal")) pass(`EV4-1 headline rendered [${VP.label}]`);
    else fail(`EV4-1 headline rendered [${VP.label}]`, `got: ${headlineText}`);

    // Project chip visible
    const projectChip = await page.locator(".ev-project-chip");
    const projectText = await projectChip.textContent().catch(() => null);
    if (projectText && projectText.includes("Caravel-Vue")) pass(`EV4-1 project chip visible [${VP.label}]`);
    else fail(`EV4-1 project chip visible [${VP.label}]`, `got: ${projectText}`);

    await shot(page, `EV4-1-${VP.width}`);
  } catch (e) { fail(`EV4-1 [${VP.label}]`, String(e)); }

  // ── EV4-2: Tablist ARIA ─────────────────────────────────────────────────────
  try {
    const tabList = page.locator("[role=tablist]");
    const tabs = await tabList.locator("[role=tab]").all();
    if (tabs.length < 2) { fail(`EV4-2 tab bar has ≥2 tabs [${VP.label}]`, `found ${tabs.length}`); }
    else { pass(`EV4-2 tab bar has ≥2 role=tab buttons [${VP.label}]`); }

    // aria-selected must be a real boolean binding (not the string "subView === 'task'")
    const firstTab = tabs[0];
    const ariaSelected = await firstTab.getAttribute("aria-selected");
    if (ariaSelected === "true" || ariaSelected === "false") pass(`EV4-2 aria-selected is boolean not expression [${VP.label}]`);
    else fail(`EV4-2 aria-selected is boolean [${VP.label}]`, `got: ${JSON.stringify(ariaSelected)}`);

    // Mobile viewport: tab min-height ≥44px
    if (VP.width <= 390) {
      const tabBox = await tabs[0].boundingBox();
      if (tabBox && tabBox.height >= 44) pass(`EV4-2 tab ≥44px at 390px [${VP.label}]`);
      else fail(`EV4-2 tab ≥44px at 390px [${VP.label}]`, `height=${tabBox?.height}`);
    }
  } catch (e) { fail(`EV4-2 [${VP.label}]`, String(e)); }

  // ── EV4-3: Continue form fires POST /next with correct payload ──────────────
  // Mutation proof: commenting out `await fetch(.../next)` in submitContinue() → this fails
  try {
    // Fresh load to ensure Task pane is visible
    await stubTask(page, TASK_TERMINAL, makeChain({}));
    await loadEnvelope(page, TASK_TERMINAL);

    let interceptedNext = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_TERMINAL)}\/next`, async (route) => {
      const postData = route.request().postDataJSON();
      interceptedNext = { method: route.request().method(), url: route.request().url(), body: postData };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "TSK-EV4-child" }) });
    });

    // Continue button shows for terminal + not closed
    const nextBtn = page.locator('[data-ev-action="next"]');
    await nextBtn.waitFor({ state: "visible", timeout: 3000 });
    await nextBtn.click();
    await page.waitForTimeout(200);

    // Form should appear
    const continueForm = page.locator('[data-ev-form="continue"]');
    await continueForm.waitFor({ state: "visible", timeout: 2000 });
    pass(`EV4-3 Continue form opens [${VP.label}]`);

    // Submit
    const submitBtn = page.locator('[data-ev-submit="next"]');
    await submitBtn.click();
    await page.waitForTimeout(500);

    if (interceptedNext) {
      if (interceptedNext.method === "POST") pass(`EV4-3 POST /next method [${VP.label}]`);
      else fail(`EV4-3 POST /next method [${VP.label}]`, `got ${interceptedNext.method}`);

      if (interceptedNext.url.includes("/next")) pass(`EV4-3 POST /next URL [${VP.label}]`);
      else fail(`EV4-3 POST /next URL [${VP.label}]`, `got ${interceptedNext.url}`);

      if (interceptedNext.body?.source === "continue") pass(`EV4-3 payload source:"continue" [${VP.label}]`);
      else fail(`EV4-3 payload source:"continue" [${VP.label}]`, `got ${JSON.stringify(interceptedNext.body?.source)}`);
    } else {
      fail(`EV4-3 POST /next fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-3 [${VP.label}]`, String(e)); }

  // ── EV4-4: Done reading fires POST /close with {status:"closed"} ────────────
  try {
    await stubTask(page, TASK_TERMINAL, makeChain({}));
    await loadEnvelope(page, TASK_TERMINAL);

    let interceptedClose = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_TERMINAL)}\/close`, async (route) => {
      interceptedClose = { method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    const doneBtn = page.locator('[data-ev-action="done-reading"]');
    await doneBtn.waitFor({ state: "visible", timeout: 2000 });
    await doneBtn.click();
    await page.waitForTimeout(500);

    if (interceptedClose) {
      if (interceptedClose.method === "POST") pass(`EV4-4 POST /close method [${VP.label}]`);
      else fail(`EV4-4 POST /close method [${VP.label}]`, `got ${interceptedClose.method}`);

      if (interceptedClose.body?.status === "closed") pass(`EV4-4 payload status:"closed" [${VP.label}]`);
      else fail(`EV4-4 payload status:"closed" [${VP.label}]`, `got ${JSON.stringify(interceptedClose.body?.status)}`);
    } else {
      fail(`EV4-4 POST /close fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-4 [${VP.label}]`, String(e)); }

  // ── EV4-5: Abort form (claimed task) ────────────────────────────────────────
  try {
    await page.unroute(`**\/api\/tasks\/${encodeURIComponent(TASK_TERMINAL)}**`);
    await stubTask(page, TASK_CLAIMED, makeChain({ id: TASK_CLAIMED, status: "claimed" }));
    await loadEnvelope(page, TASK_CLAIMED);

    const abortBtn = page.locator('[data-ev-action="abort"]');
    await abortBtn.waitFor({ state: "visible", timeout: 3000 });
    pass(`EV4-5 Abort button visible for claimed task [${VP.label}]`);

    let interceptedAbort = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_CLAIMED)}\/abort`, async (route) => {
      interceptedAbort = { method: route.request().method(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await abortBtn.click();
    await page.waitForTimeout(200);

    const abortForm = page.locator('[data-ev-form="abort"]');
    await abortForm.waitFor({ state: "visible", timeout: 2000 });
    pass(`EV4-5 Abort form opens [${VP.label}]`);

    const abortSubmit = page.locator('[data-ev-submit="abort"]');
    await abortSubmit.click();
    await page.waitForTimeout(500);

    if (interceptedAbort) {
      if (interceptedAbort.method === "POST") pass(`EV4-5 POST /abort method [${VP.label}]`);
      else fail(`EV4-5 POST /abort method [${VP.label}]`, `got ${interceptedAbort.method}`);
    } else {
      fail(`EV4-5 POST /abort fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-5 [${VP.label}]`, String(e)); }

  // ── EV4-6: Reopen fires POST /reopen for closed task ────────────────────────
  try {
    await page.unroute(`**\/api\/tasks\/${encodeURIComponent(TASK_CLAIMED)}**`);
    await stubTask(page, TASK_CLOSED, makeChain({
      id: TASK_CLOSED,
      status: "done",
      closed: { status: "closed", by: "kelly", at: new Date().toISOString() },
    }));
    await loadEnvelope(page, TASK_CLOSED);

    let interceptedReopen = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_CLOSED)}\/reopen`, async (route) => {
      interceptedReopen = { method: route.request().method(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    const reopenBtn = page.locator('[data-ev-action="reopen"]');
    await reopenBtn.waitFor({ state: "visible", timeout: 3000 });
    pass(`EV4-6 Reopen button visible for closed task [${VP.label}]`);
    await reopenBtn.click();
    await page.waitForTimeout(500);

    if (interceptedReopen) {
      if (interceptedReopen.method === "POST") pass(`EV4-6 POST /reopen method [${VP.label}]`);
      else fail(`EV4-6 POST /reopen method [${VP.label}]`, `got ${interceptedReopen.method}`);
    } else {
      fail(`EV4-6 POST /reopen fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-6 [${VP.label}]`, String(e)); }

  // ── EV4-7: S2 route — /tasks/project/:slug is NOT an envelope ───────────────
  try {
    await page.goto(`${BASE}/#/tasks/project/my-project`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    // Should NOT render EnvelopeView
    const evRoot = await page.locator(".ev-root").count();
    if (evRoot === 0) pass(`EV4-7 /tasks/project/:slug does not render EnvelopeView [${VP.label}]`);
    else fail(`EV4-7 /tasks/project/:slug shadow [${VP.label}]`, "EnvelopeView unexpectedly rendered");
    await shot(page, `EV4-7-${VP.width}`);
  } catch (e) { fail(`EV4-7 [${VP.label}]`, String(e)); }

  // ── EV4-8: Cancel form for open (non-terminal) task ─────────────────────────
  try {
    await stubTask(page, TASK_CANCEL, makeChain({ id: TASK_CANCEL, status: "open", closed: null }));
    await loadEnvelope(page, TASK_CANCEL);

    const cancelBtn = page.locator('[data-ev-action="cancel"]');
    await cancelBtn.waitFor({ state: "visible", timeout: 3000 });
    pass(`EV4-8 Cancel button visible for open task [${VP.label}]`);

    let interceptedClose2 = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_CANCEL)}\/close`, async (route) => {
      interceptedClose2 = { method: route.request().method(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await cancelBtn.click();
    await page.waitForTimeout(200);

    const closeForm = page.locator('[data-ev-form="close"]');
    await closeForm.waitFor({ state: "visible", timeout: 2000 });
    pass(`EV4-8 Close form opens [${VP.label}]`);

    const closeSubmit = page.locator('[data-ev-submit="close"]');
    await closeSubmit.click();
    await page.waitForTimeout(500);

    if (interceptedClose2) {
      if (interceptedClose2.method === "POST") pass(`EV4-8 POST /close method [${VP.label}]`);
      else fail(`EV4-8 POST /close method [${VP.label}]`, `got ${interceptedClose2.method}`);

      if (interceptedClose2.body?.status === "cancelled") pass(`EV4-8 payload status:"cancelled" for open task [${VP.label}]`);
      else fail(`EV4-8 payload status:"cancelled" [${VP.label}]`, `got ${JSON.stringify(interceptedClose2.body?.status)}`);
    } else {
      fail(`EV4-8 POST /close fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-8 [${VP.label}]`, String(e)); }

  // ── EV4-9: Resume button fires POST /resume for paused task ─────────────────
  try {
    await stubTask(page, TASK_PAUSED, makeChain({ id: TASK_PAUSED, status: "paused", closed: null }));
    await loadEnvelope(page, TASK_PAUSED);

    let interceptedResume = null;
    await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_PAUSED)}\/resume`, async (route) => {
      interceptedResume = { method: route.request().method(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    const resumeBtn = page.locator('[data-ev-action="resume"]');
    await resumeBtn.waitFor({ state: "visible", timeout: 3000 });
    pass(`EV4-9 Resume button visible for paused task [${VP.label}]`);
    await resumeBtn.click();
    await page.waitForTimeout(500);

    if (interceptedResume) {
      if (interceptedResume.method === "POST") pass(`EV4-9 POST /resume method [${VP.label}]`);
      else fail(`EV4-9 POST /resume method [${VP.label}]`, `got ${interceptedResume.method}`);
    } else {
      fail(`EV4-9 POST /resume fired [${VP.label}]`, "route was never intercepted");
    }
  } catch (e) { fail(`EV4-9 [${VP.label}]`, String(e)); }

  await page.close();
}

await browser.close();

const total = passed + failed;
console.log(`\n${passed}/${total} passed.`);
if (failed > 0) process.exit(1);
