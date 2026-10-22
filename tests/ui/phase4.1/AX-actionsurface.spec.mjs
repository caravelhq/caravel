// AX-actionsurface.spec.mjs — Phase 4.1 node .02: actions on the sub-tab row
//
// AX1: Parity matrix renders in Task sub-view (Next is sub-tab, not action button)
// AX2: Parity matrix renders in Report sub-view (F3 fix — mutation proof)
// AX3: Action buttons have no role="tab" attribute
// AX4: Action slot is NOT inside role="tablist"
// AX5: POST /next fires via Next sub-view (NextPrompt) with source:"continue"
// AX6: POST /close fires with {status:"closed"} for Done reading
// AX7: At 360px — .ev-tab-bar sub-tabs ≥44px, action buttons ≥28px and in-viewport
// AX8: Action buttons (Chat, Done reading) fit compact width targets (F6)
// AX9: Project control is a datalist-backed input (F7 — picker bound to store)
// AX10: Project POST fires with the selected project slug
//
// Mutation proof (AX2):
//   In EnvelopeView.vue, move <TaskActions> back inside the `v-else-if="subView==='task'"`
//   branch — AX2's "actions present in Report sub-view" assertion goes red.
//
// Harness: test server at :4643, /api/* → live daemon proxied but all task
//   calls intercepted via page.route().
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4643 \
//   node tests/ui/phase4.1/AX-actionsurface.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4643").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/AX-actionsurface");
mkdirSync(SHOTS_DIR, { recursive: true });

// ── Fixture task IDs ──────────────────────────────────────────────────────────

const TASK_DONE    = "TSK-AX1-2026-10-21-0002.01"; // done, has reportPath → opens on Report
const TASK_NODONE  = "TSK-AX1-2026-10-21-0002.02"; // done, no reportPath → stays on Task
const TASK_CLOSED  = "TSK-AX1-2026-10-21-0002.03"; // done + closed
const TASK_CLAIMED = "TSK-AX1-2026-10-21-0002.04"; // claimed (abort button)

const PROJECTS_LIST = [
  { slug: "Caravel-Vue", title: "Caravel Vue" },
  { slug: "Trakk-Share", title: "Trakk Share" },
  { slug: "WAL-139", title: "WAL-139 Phase 4.1" },
];

function makeChain(overrides) {
  const base = {
    id: TASK_DONE,
    agent: "bob",
    to: "bob",
    from: "alice",
    status: "done",
    headline: "AX spec — action surface on sub-tab row",
    brief: "Brief for AX fixture.",
    summary: { response: "Action surface spec." },
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

// ── Route helpers ─────────────────────────────────────────────────────────────

async function stubBaseRoutes(page) {
  await page.route("**/api/live", (route) => route.abort("connectionrefused"));
  await page.route(/\/api\/tasks\?limit=120/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [
        { id: TASK_DONE, agent: "bob", status: "done", headline: "AX spec — action surface" },
      ] }),
    })
  );
  // Catch-all registered before projects stub so LIFO gives projects stub higher priority
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/tasks/TSK-AX1") || url.includes("/api/projects")) return;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [] }) });
  });
  // Projects stub registered LAST = highest LIFO priority, fires before catch-all for /api/projects
  await page.route("**/api/projects**", (route) => {
    const url = route.request().url();
    if (url.includes("?counts=1") || url.includes("&counts=1") || url.match(/\/api\/projects\?/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, projects: PROJECTS_LIST }),
      });
    }
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

async function stubFile(page, filePath) {
  await page.route(
    `**/api/files/read?path=${encodeURIComponent(filePath)}*`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, markdown: true, content: "# AX Report\n\nFixture report content." }),
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

// ── Browser tests — desktop viewport ─────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await stubBaseRoutes(page);

// Task with no reportPath (stays on Task sub-view)
await stubTask(page, TASK_NODONE, makeChain({ id: TASK_NODONE, reportPath: null }));
await loadEnvelope(page, TASK_NODONE);

// ── AX1: Parity matrix renders in Task sub-view (Next = sub-tab, not action btn) ─

try {
  // Task pane should be active (no reportPath → no auto-switch)
  const taskTab = page.locator('.ev-tab-bar [role="tab"]:has-text("Task")');
  const taskActive = await taskTab.getAttribute("aria-selected");
  if (taskActive !== "true") {
    await taskTab.click();
    await page.waitForTimeout(200);
  }

  // Three sub-tabs must be present: Task, Report, Next
  const tabs = page.locator('.ev-tab-bar [role="tab"]');
  const tabCount = await tabs.count();
  if (tabCount >= 3) pass(`AX1 three sub-tabs present (Task/Report/Next), count=${tabCount}`);
  else fail("AX1 three sub-tabs present", `only ${tabCount} tab(s) found`);

  // Next is a sub-tab, NOT an action button — data-ev-action="next" must be absent
  const nextActionBtn = page.locator('[data-ev-action="next"]');
  const nextActionPresent = await nextActionBtn.count();
  if (nextActionPresent === 0) pass("AX1 no data-ev-action='next' button (moved to sub-tab)");
  else fail("AX1 data-ev-action='next' absent", `found ${nextActionPresent} — button should have been removed`);

  // Next sub-tab is present
  const nextTab = page.locator('[data-ev-tab="next"]');
  const nextTabPresent = await nextTab.count();
  if (nextTabPresent > 0) pass("AX1 [data-ev-tab='next'] sub-tab present");
  else fail("AX1 [data-ev-tab='next'] present", "not found");

  // 💬 Chat: always
  const chatBtn = page.locator('[data-ev-action="chat"]');
  const chatVisible = await chatBtn.isVisible().catch(() => false);
  if (chatVisible) pass("AX1 Chat button visible in Task sub-view");
  else fail("AX1 Chat button visible in Task sub-view", "not visible");

  // ✓ Done reading: terminal && !isClaimed && !isClosed
  const doneBtn = page.locator('[data-ev-action="done-reading"]');
  const doneVisible = await doneBtn.isVisible().catch(() => false);
  if (doneVisible) pass("AX1 Done reading button visible in Task sub-view");
  else fail("AX1 Done reading button visible in Task sub-view", "not visible");

  await shot(page, "AX1-task-pane-1440");
} catch (e) { fail("AX1 [1440]", String(e)); }

// ── AX2: Parity matrix renders in Report sub-view (F3 fix — mutation proof) ──
// Mutation proof: move TaskActions inside v-else-if="task" branch → this fails

try {
  // Load a task WITH reportPath so it auto-switches to Report sub-view
  const REPORT_PATH = "agents/bob/tasks/done/TSK-AX1-2026-10-21-0002.01.md";
  await stubTask(page, TASK_DONE, makeChain({ id: TASK_DONE, reportPath: REPORT_PATH }));
  await stubFile(page, REPORT_PATH);

  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_DONE)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  // Should be on Report sub-view (auto-switched)
  const reportTab = page.locator('.ev-tab-bar [role="tab"]:has-text("Report")');
  const reportActive = await reportTab.getAttribute("aria-selected");
  if (reportActive !== "true") {
    await reportTab.click();
    await page.waitForTimeout(200);
  }

  // Next is a sub-tab, NOT an action button — must be absent as action button
  const nextActionInReport = await page.locator('[data-ev-action="next"]').count();
  if (nextActionInReport === 0) pass("AX2 data-ev-action='next' absent in Report sub-view (sub-tab, not button)");
  else fail("AX2 no data-ev-action='next' button", `found ${nextActionInReport} — button should be gone`);

  // Next sub-tab is visible alongside Report sub-tab (three tabs remain)
  const nextTabInReport = await page.locator('[data-ev-tab="next"]').count();
  if (nextTabInReport > 0) pass("AX2 Next sub-tab present in Report sub-view");
  else fail("AX2 Next sub-tab present", "not found");

  // Chat and Done reading still present in the action slot (F3: visible in all sub-views)
  const chatInReport = await page.locator('[data-ev-action="chat"]').isVisible().catch(() => false);
  const doneInReport = await page.locator('[data-ev-action="done-reading"]').isVisible().catch(() => false);

  if (chatInReport) pass("AX2 Chat button visible in Report sub-view (F3)");
  else fail("AX2 Chat button visible in Report sub-view (F3)", "invisible — regression or mutation proof triggered");

  if (doneInReport) pass("AX2 Done reading button visible in Report sub-view (F3)");
  else fail("AX2 Done reading button visible in Report sub-view (F3)", "invisible");

  await shot(page, "AX2-report-pane-1440");
} catch (e) { fail("AX2 [1440]", String(e)); }

// ── AX3: Action buttons have no role="tab" ────────────────────────────────────

try {
  const actionBtns = page.locator('[data-ev-action]');
  const count = await actionBtns.count();
  if (count === 0) {
    fail("AX3 no role=tab on action buttons", "no action buttons found");
  } else {
    let badCount = 0;
    for (let i = 0; i < count; i++) {
      const role = await actionBtns.nth(i).getAttribute("role");
      if (role === "tab") badCount++;
    }
    if (badCount === 0) pass(`AX3 ${count} action button(s) have no role="tab"`);
    else fail("AX3 no role=tab on action buttons", `${badCount} button(s) have role="tab"`);
  }
} catch (e) { fail("AX3", String(e)); }

// ── AX4: Action slot is NOT a descendant of role="tablist" ────────────────────

try {
  // Count action buttons that are inside role="tablist"
  const tablistDescendantActions = await page.evaluate(() => {
    const tablists = document.querySelectorAll('[role="tablist"]');
    let found = 0;
    for (const tl of tablists) {
      found += tl.querySelectorAll('[data-ev-action]').length;
    }
    return found;
  });
  if (tablistDescendantActions === 0) pass("AX4 action buttons are NOT inside role=\"tablist\"");
  else fail("AX4 action buttons outside tablist", `${tablistDescendantActions} action button(s) found inside role="tablist"`);
} catch (e) { fail("AX4", String(e)); }

// ── AX5: POST /next fires via Next sub-view (NextPrompt) ─────────────────────

try {
  // Reload on no-report task so we start fresh
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_NODONE)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  let interceptedNext = null;
  await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_NODONE)}\/next`, async (route) => {
    interceptedNext = { method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "TSK-AX1-child" }) });
  });

  // Navigate to Next sub-view via the sub-tab
  const nextTab = page.locator('[data-ev-tab="next"]');
  await nextTab.waitFor({ state: "visible", timeout: 3000 });
  await nextTab.click();
  await page.waitForTimeout(300);

  // NextPrompt textarea should be visible
  const textarea = page.locator('[data-nx-textarea]');
  const textareaVisible = await textarea.isVisible().catch(() => false);
  if (textareaVisible) pass("AX5 NextPrompt textarea visible on Next sub-view");
  else fail("AX5 NextPrompt textarea visible", "not visible");

  // Fill instruction and submit
  await textarea.fill("AX5 test instruction for POST /next");
  const submitBtn = page.locator('[data-nx-submit]');
  await submitBtn.waitFor({ state: "visible", timeout: 2000 });
  await submitBtn.click();
  await page.waitForTimeout(500);

  if (interceptedNext) {
    if (interceptedNext.method === "POST") pass("AX5 POST /next method");
    else fail("AX5 POST /next method", `got ${interceptedNext.method}`);
    if (interceptedNext.url.includes("/next")) pass("AX5 POST /next URL");
    else fail("AX5 POST /next URL", `got ${interceptedNext.url}`);
    if (interceptedNext.body?.source === "continue") pass("AX5 payload source:\"continue\"");
    else fail("AX5 payload source", `got ${JSON.stringify(interceptedNext.body?.source)}`);
  } else {
    fail("AX5 POST /next fired", "route never intercepted");
  }

  await shot(page, "AX5-post-next");
} catch (e) { fail("AX5", String(e)); }

// ── AX6: POST /close fires with {status:"closed"} for Done reading ────────────

try {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_NODONE)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  let interceptedClose = null;
  await page.route(`**\/api\/tasks\/${encodeURIComponent(TASK_NODONE)}\/close`, async (route) => {
    interceptedClose = { method: route.request().method(), body: route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  const doneBtn = page.locator('[data-ev-action="done-reading"]');
  await doneBtn.waitFor({ state: "visible", timeout: 2000 });
  await doneBtn.click();
  await page.waitForTimeout(500);

  if (interceptedClose) {
    if (interceptedClose.method === "POST") pass("AX6 POST /close method");
    else fail("AX6 POST /close method", `got ${interceptedClose.method}`);
    if (interceptedClose.body?.status === "closed") pass("AX6 payload status:\"closed\"");
    else fail("AX6 payload status", `got ${JSON.stringify(interceptedClose.body?.status)}`);
  } else {
    fail("AX6 POST /close fired", "route never intercepted");
  }
} catch (e) { fail("AX6", String(e)); }

await page.close();

// ── AX7 + AX8: 360px geometry assertions ──────────────────────────────────────

const mobilePage = await browser.newPage({ viewport: { width: 360, height: 780 } });
await stubBaseRoutes(mobilePage);
await stubTask(mobilePage, TASK_NODONE, makeChain({ id: TASK_NODONE, reportPath: null }));
await mobilePage.addInitScript(() => {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
  });
});
await mobilePage.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_NODONE)}`, { waitUntil: "domcontentloaded" });
await mobilePage.waitForTimeout(700);

try {
  // AX7: envelope sub-tabs keep ≥44px at 360px (scoped to .ev-tab-bar to exclude workspace strip)
  const tabs = mobilePage.locator('.ev-tab-bar [role="tab"]');
  const tabCount = await tabs.count();
  let tabFail = 0;
  for (let i = 0; i < tabCount; i++) {
    const box = await tabs.nth(i).boundingBox();
    if (!box || box.height < 44) {
      fail(`AX7 sub-tab ${i + 1} ≥44px at 360px`, `height=${box?.height}`);
      tabFail++;
    }
  }
  if (tabFail === 0 && tabCount > 0) pass(`AX7 all ${tabCount} sub-tab(s) ≥44px at 360px`);
  else if (tabCount === 0) fail("AX7 sub-tabs present at 360px", "no .ev-tab-bar tabs found");

  // AX7: action buttons are reachable (≥28px, within viewport)
  const actionBtns = mobilePage.locator('[data-ev-action]');
  const actionCount = await actionBtns.count();
  let actionSmall = 0;
  let actionOOV = 0;
  for (let i = 0; i < actionCount; i++) {
    const box = await actionBtns.nth(i).boundingBox();
    if (!box) continue;
    if (box.height < 28) actionSmall++;
    if (box.x + box.width > 360) actionOOV++;
  }
  if (actionCount === 0) {
    fail("AX7 action buttons present at 360px", "no action buttons found");
  } else {
    if (actionSmall === 0) pass(`AX7 all ${actionCount} action button(s) ≥28px at 360px`);
    else fail("AX7 action buttons ≥28px at 360px", `${actionSmall} button(s) shorter than 28px`);
    if (actionOOV === 0) pass(`AX7 action buttons within 360px viewport`);
    else fail("AX7 action buttons within viewport", `${actionOOV} button(s) extend beyond 360px`);
  }

  await shot(mobilePage, "AX7-360px");
} catch (e) { fail("AX7", String(e)); }

try {
  // AX8: action button widths — compact, not full-width bars (F6)
  // Target: max ~120px per button. Next moved to sub-tab; Chat and Done reading remain.
  const chatBtn = mobilePage.locator('[data-ev-action="chat"]');
  const chatBox = await chatBtn.boundingBox().catch(() => null);
  if (!chatBox) {
    fail("AX8 Chat button found for width measurement", "button not found");
  } else {
    if (chatBox.width <= 120) pass(`AX8 Chat button width=${Math.round(chatBox.width)}px ≤120px at 360px`);
    else fail("AX8 Chat button compact width", `width=${Math.round(chatBox.width)}px >120px`);
  }

  const doneBtn = mobilePage.locator('[data-ev-action="done-reading"]');
  const doneBox = await doneBtn.boundingBox().catch(() => null);
  if (doneBox) {
    if (doneBox.width <= 120) pass(`AX8 Done reading button width=${Math.round(doneBox.width)}px ≤120px at 360px`);
    else fail("AX8 Done reading button compact width", `width=${Math.round(doneBox.width)}px >120px`);
  }

  await shot(mobilePage, "AX8-widths-360px");
} catch (e) { fail("AX8", String(e)); }

await mobilePage.close();

// ── AX9 + AX10: Project picker backed by store (F7) ──────────────────────────

const projPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await stubBaseRoutes(projPage);
await stubTask(projPage, TASK_NODONE, makeChain({ id: TASK_NODONE, reportPath: null }));
await projPage.addInitScript(() => {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
  });
});
await projPage.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_NODONE)}`, { waitUntil: "domcontentloaded" });
await projPage.waitForTimeout(700);

try {
  // AX9: project control uses a datalist (picker backed by store)
  // Click the project chip to open edit mode
  const chip = projPage.locator(".ev-project-chip");
  await chip.waitFor({ state: "visible", timeout: 3000 });
  await chip.click();
  await projPage.waitForTimeout(300);

  const projectInput = projPage.locator(".ev-project-input");
  await projectInput.waitFor({ state: "visible", timeout: 2000 });
  pass("AX9 Project edit input visible on chip click");

  // Input should have a list= attribute pointing at a datalist
  const listAttr = await projectInput.getAttribute("list").catch(() => null);
  if (listAttr) pass(`AX9 project input has list="${listAttr}" (datalist bound)`);
  else fail("AX9 project input has list attribute", "no list attribute");

  if (listAttr) {
    // Datalist should exist and have options
    const datalist = projPage.locator(`datalist#${listAttr}`);
    const datalistExists = await datalist.count();
    if (datalistExists > 0) pass("AX9 datalist element present");
    else fail("AX9 datalist element present", `datalist#${listAttr} not found`);

    const options = datalist.locator("option");
    const optionCount = await options.count();
    if (optionCount >= 3) pass(`AX9 datalist has ${optionCount} project options (≥3 from stub)`);
    else fail("AX9 datalist options from store", `only ${optionCount} options`);

    // Verify known slugs appear
    const optValues = await options.evaluateAll((els) => els.map((e) => e.value));
    if (optValues.includes("Caravel-Vue")) pass("AX9 Caravel-Vue present in datalist");
    else fail("AX9 Caravel-Vue in datalist", `got: ${optValues.join(", ")}`);
    if (optValues.includes("Trakk-Share")) pass("AX9 Trakk-Share present in datalist");
    else fail("AX9 Trakk-Share in datalist", `got: ${optValues.join(", ")}`);
  }

  // Free entry still reachable — type a new project name not in the list
  await projectInput.fill("Totally-New-Project");
  const inputValue = await projectInput.inputValue();
  if (inputValue === "Totally-New-Project") pass("AX9 free entry reachable (datalist doesn't block new project names)");
  else fail("AX9 free entry reachable", `got: ${inputValue}`);

  await shot(projPage, "AX9-project-picker");
} catch (e) { fail("AX9", String(e)); }

try {
  // AX10: POST /project fires with the selected project
  const projectInput = projPage.locator(".ev-project-input");

  let interceptedProject = null;
  await projPage.route(`**\/api\/tasks\/${encodeURIComponent(TASK_NODONE)}\/project`, async (route) => {
    interceptedProject = { method: route.request().method(), body: route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await projectInput.fill("Trakk-Share");
  const saveBtn = projPage.locator(".ev-project-save");
  await saveBtn.click();
  await projPage.waitForTimeout(500);

  if (interceptedProject) {
    if (interceptedProject.method === "POST") pass("AX10 POST /project method");
    else fail("AX10 POST /project method", `got ${interceptedProject.method}`);
    if (interceptedProject.body?.project === "Trakk-Share") pass("AX10 payload project:\"Trakk-Share\"");
    else fail("AX10 payload project", `got ${JSON.stringify(interceptedProject.body?.project)}`);
  } else {
    fail("AX10 POST /project fired", "route never intercepted");
  }

  await shot(projPage, "AX10-project-post");
} catch (e) { fail("AX10", String(e)); }

await projPage.close();
await browser.close();

const total = passed + failed;
console.log(`\n${passed}/${total} passed.`);
if (failed > 0) process.exit(1);
