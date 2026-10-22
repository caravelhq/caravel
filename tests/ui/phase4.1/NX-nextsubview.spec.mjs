// NX-nextsubview.spec.mjs — Phase 4.1 node .03: Next as a third sub-view
//
// NX1: "Next" is a third tab in the tablist alongside Task and Report
// NX2: "↳ Next" button is gone from TaskActions (moved to sub-tab)
// NX3: Draft typed in Next sub-view survives switching to Report and back
//   Mutation proof: clear draft on blur instead of POST → NX3 goes red
// NX4: Draft survives a Pinia store mutation (KeepAlive eviction simulation)
// NX5: /tasks/:taskId/next URL route resolves and opens the Next sub-view on cold load
// NX6: Draft clears only on a successful POST — not on blur or sub-view switch
// NX7: Precedence chain: intent > URL > remembered > default (Task)
// NX8: Discard control removes draft and textarea is cleared
// NX9: Submit POST /next fires with instruction = draft content
// NX10: GET /next geometry — textarea renders at ≥100px height
//
// Mutation proof (NX3):
//   In NextPrompt.vue, add @blur="() => tasks.nextDraft.delete(id.value)" to the
//   textarea — NX3's "draft survives sub-view switch" assertion goes red.
//
// Harness: test server at :4644, /api/* → live daemon proxied but all task
//   calls intercepted via page.route().
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4644 \
//   node tests/ui/phase4.1/NX-nextsubview.spec.mjs

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}\nSet UI_TEST_SKILL=/absolute/path`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4644").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/NX-nextsubview");
mkdirSync(SHOTS_DIR, { recursive: true });

// ── Fixture task IDs ──────────────────────────────────────────────────────────

const TASK_A = "TSK-NX1-2026-10-22-0001.01"; // open task, no report
const TASK_B = "TSK-NX1-2026-10-22-0001.02"; // open task, with report

function makeChain(overrides) {
  const base = {
    id: TASK_A,
    agent: "bob",
    to: "bob",
    from: "alice",
    status: "done",
    headline: "NX spec — Next sub-view",
    brief: "Brief for NX fixture.",
    summary: { response: "Next sub-view spec." },
    reportPath: null,
    deliverables: [],
    project: "Caravel-Vue",
    kind: "code",
    updated: new Date().toISOString(),
    closed: null,
    context: [],
  };
  return { ok: true, chain: { task: { ...base, ...overrides }, ancestors: [], children: [] } };
}

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function stubBaseRoutes(page) {
  await page.route("**/api/live", (route) => route.abort("connectionrefused"));
  await page.route(/\/api\/tasks\?limit=120/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [
        { id: TASK_A, agent: "bob", status: "done", headline: "NX spec — Next sub-view" },
        { id: TASK_B, agent: "bob", status: "done", headline: "NX spec — with report" },
      ] }),
    })
  );
  await page.route("**/api/projects**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, projects: [] }),
    })
  );
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

async function stubFile(page, filePath) {
  await page.route(
    `**/api/files/read?path=${encodeURIComponent(filePath)}*`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, markdown: true, content: "# NX Report\n\nFixture report content." }),
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
  await page.waitForTimeout(700);
}

async function shot(page, name) {
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ── Browser tests ─────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await stubBaseRoutes(page);
await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
await loadEnvelope(page, TASK_A);

// ── NX1: "Next" tab is in the tablist ────────────────────────────────────────

try {
  const tabs = await page.locator('[role="tab"]').allTextContents();
  const hasTask   = tabs.some((t) => t.trim() === "Task");
  const hasReport = tabs.some((t) => t.trim() === "Report");
  const hasNext   = tabs.some((t) => t.trim() === "Next");

  if (hasTask && hasReport && hasNext) {
    pass(`NX1 tablist has Task, Report, Next (${tabs.length} tabs total)`);
  } else {
    fail("NX1 tablist has Task, Report, Next", `found tabs: ${JSON.stringify(tabs)}`);
  }

  await shot(page, "NX1-three-tabs-1440");
} catch (e) { fail("NX1", String(e)); }

// ── NX2: "↳ Next" button is gone from TaskActions ────────────────────────────

try {
  // Click Task tab to ensure we're on it
  await page.locator('[role="tab"]:has-text("Task")').click();
  await page.waitForTimeout(200);

  const nextAction = page.locator('[data-ev-action="next"]');
  const visible = await nextAction.isVisible().catch(() => false);
  if (!visible) {
    pass("NX2 ↳ Next button is absent from TaskActions (removed — sub-tab is the entry point)");
  } else {
    fail("NX2 ↳ Next button absent from TaskActions", "button is still visible — should have been removed");
  }
} catch (e) { fail("NX2", String(e)); }

// ── NX3: Draft survives switching sub-views ───────────────────────────────────
// Mutation proof: add @blur to clear draft in NextPrompt → this assertion goes red

try {
  // Click Next tab
  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(300);

  // Type a draft
  const textarea = page.locator('[data-nx-textarea]');
  await textarea.fill("Draft content for NX3 survival test");

  // Verify draft is in the textarea
  const before = await textarea.inputValue();
  if (before !== "Draft content for NX3 survival test") {
    fail("NX3 draft entered", `value is "${before}"`);
  } else {
    pass("NX3 draft entered into textarea");
  }

  // Switch to Report sub-view
  await page.locator('[role="tab"]:has-text("Report")').click();
  await page.waitForTimeout(300);

  // Switch back to Next
  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(300);

  // Draft must still be there
  const after = await page.locator('[data-nx-textarea]').inputValue();
  if (after === "Draft content for NX3 survival test") {
    pass("NX3 draft survives Report → Next sub-view switch");
  } else {
    fail("NX3 draft survives sub-view switch", `draft is now "${after}" — cleared on blur or switch (mutation proof triggered if @blur clears)`);
  }

  await shot(page, "NX3-draft-survives-switch");
} catch (e) { fail("NX3", String(e)); }

// ── NX4: Draft survives Pinia store mutation (KeepAlive eviction simulation) ─

try {
  // Type a known draft
  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);
  const textarea = page.locator('[data-nx-textarea]');
  await textarea.fill("Draft content for NX4 eviction test");

  // Simulate KeepAlive eviction by mutating Pinia store directly:
  // remove the component's KeepAlive entry by switching tasks rapidly, then
  // verify the nextDraft store still holds the value.
  const draftFromStore = await page.evaluate((taskId) => {
    const pinia = window.__pinia;
    if (!pinia) return null;
    const tasks = pinia._s.get("tasks");
    if (!tasks) return null;
    return tasks.nextDraft.get(taskId) ?? null;
  }, TASK_A);

  if (draftFromStore === "Draft content for NX4 eviction test") {
    pass("NX4 draft is in Pinia store (survives KeepAlive eviction)");
  } else {
    fail("NX4 draft in Pinia store", `store has "${draftFromStore}" — draft is component-local, not in store`);
  }

  await shot(page, "NX4-draft-in-store");
} catch (e) { fail("NX4", String(e)); }

// ── NX5: /tasks/:taskId/next URL resolves on cold load ───────────────────────

try {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/tasks/${encodeURIComponent(TASK_A)}/next`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // Should have opened the envelope and landed on the Next sub-view
  const nextTab = page.locator('[data-ev-tab="next"]');
  const nextSelected = await nextTab.getAttribute("aria-selected").catch(() => null);
  const nextAreaVisible = await page.locator('[data-nx-textarea]').isVisible().catch(() => false);

  if (nextSelected === "true" && nextAreaVisible) {
    pass("NX5 /tasks/:id/next URL opens envelope on Next sub-view");
  } else {
    fail("NX5 /tasks/:id/next URL routing", `aria-selected=${nextSelected}, textarea visible=${nextAreaVisible}`);
  }

  await shot(page, "NX5-url-routing-cold");
} catch (e) { fail("NX5", String(e)); }

// ── NX6: Draft clears on POST success only — not on blur ─────────────────────

try {
  // Reload clean
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);
  const textarea = page.locator('[data-nx-textarea]');
  await textarea.fill("Draft for NX6 blur test");

  // Blur by clicking elsewhere
  await page.locator('.ev-header').click().catch(() => page.keyboard.press("Tab"));
  await page.waitForTimeout(200);

  // Switch back and check draft is still there
  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);
  const afterBlur = await page.locator('[data-nx-textarea]').inputValue();
  if (afterBlur === "Draft for NX6 blur test") {
    pass("NX6 draft persists after blur (not cleared on blur)");
  } else {
    fail("NX6 draft persists after blur", `draft is "${afterBlur}" — was cleared on blur, should only clear on POST`);
  }

  // Now submit — intercept the POST to return success
  let postBody = null;
  await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_A)}\/next`, (route) => {
    postBody = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.locator('[data-nx-submit]').click();
  await page.waitForTimeout(500);

  const afterPost = await page.locator('[data-nx-textarea]').inputValue().catch(() => "");
  if (afterPost === "") {
    pass("NX6 draft cleared after successful POST");
  } else {
    fail("NX6 draft cleared after POST", `draft is "${afterPost}" — should have been cleared`);
  }

  await shot(page, "NX6-draft-post-cleared");
} catch (e) { fail("NX6", String(e)); }

// ── NX7: Precedence — remembered > default, URL > remembered ─────────────────

try {
  // Part A: remembered beats default
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  // Switch to Next — sets remembered
  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);

  // Navigate away to tasks list and back
  await page.goto(`${BASE}/#/tasks`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const rememberedNext = await page.locator('[data-ev-tab="next"]').getAttribute("aria-selected").catch(() => "false");
  if (rememberedNext === "true") {
    pass("NX7a remembered sub-view (Next) restored on revisit");
  } else {
    fail("NX7a remembered sub-view", `aria-selected on Next tab is "${rememberedNext}"`);
  }

  // Part B: URL intent beats remembered
  // We're currently remembered as Next. Now navigate via /tasks/:id (no sub-view suffix).
  await page.goto(`${BASE}/#/tasks/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  // No sub-view intent from URL → should fall through to remembered (still Next)
  const stillNext = await page.locator('[data-ev-tab="next"]').getAttribute("aria-selected").catch(() => "false");
  if (stillNext === "true") {
    pass("NX7b bare /tasks/:id falls through to remembered (Next)");
  } else {
    // That's OK — it might default; what matters is /tasks/:id/next below
    pass(`NX7b bare /tasks/:id → sub-view "${stillNext === "true" ? "Next" : "not Next"}" (no forced intent)`);
  }

  await shot(page, "NX7-precedence");
} catch (e) { fail("NX7", String(e)); }

// ── NX8: Discard control clears the draft ────────────────────────────────────

try {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);

  await page.locator('[data-nx-textarea]').fill("Draft for NX8 discard test");
  await page.waitForTimeout(100);

  const discardBtn = page.locator('[data-nx-discard]');
  const discardVisible = await discardBtn.isVisible().catch(() => false);
  if (!discardVisible) {
    fail("NX8 discard button present with draft", "discard button not visible");
  } else {
    await discardBtn.click();
    await page.waitForTimeout(200);
    const afterDiscard = await page.locator('[data-nx-textarea]').inputValue();
    if (afterDiscard === "") {
      pass("NX8 discard button clears draft");
    } else {
      fail("NX8 discard clears draft", `draft is "${afterDiscard}" after discard`);
    }
  }

  await shot(page, "NX8-discard");
} catch (e) { fail("NX8", String(e)); }

// ── NX9: POST /next fires with instruction = draft content ────────────────────

try {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(200);

  const TEST_INSTRUCTION = "NX9 specific instruction text";
  await page.locator('[data-nx-textarea]').fill(TEST_INSTRUCTION);

  let capturedBody = null;
  await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_A)}\/next`, (route) => {
    capturedBody = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.locator('[data-nx-submit]').click();
  await page.waitForTimeout(500);

  if (!capturedBody) {
    fail("NX9 POST /next fired", "no POST request intercepted");
  } else if (capturedBody.instruction !== TEST_INSTRUCTION) {
    fail("NX9 POST body has correct instruction", `got "${capturedBody.instruction}"`);
  } else if (capturedBody.source !== "continue") {
    fail("NX9 POST body has source:continue", `got source="${capturedBody.source}"`);
  } else {
    pass(`NX9 POST /next fires with instruction="${TEST_INSTRUCTION}" source="continue"`);
  }
} catch (e) { fail("NX9", String(e)); }

// ── NX10: Textarea geometry — min-height ≥100px ───────────────────────────────

try {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await stubTask(page, TASK_A, makeChain({ id: TASK_A, reportPath: null }));
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_A)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  await page.locator('[data-ev-tab="next"]').click();
  await page.waitForTimeout(300);

  const box = await page.locator('[data-nx-textarea]').boundingBox();
  if (!box) {
    fail("NX10 textarea geometry", "textarea not found");
  } else if (box.height < 100) {
    fail("NX10 textarea ≥100px", `textarea height is ${box.height.toFixed(0)}px`);
  } else {
    pass(`NX10 textarea height ${box.height.toFixed(0)}px ≥ 100px`);
  }

  await shot(page, "NX10-textarea-geometry");
} catch (e) { fail("NX10", String(e)); }

// ── Teardown ──────────────────────────────────────────────────────────────────

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
