// phase4.2-step2.spec.mjs — Phase 4.2 step 2 gate specs
//
// TC-4.2-6:       Double-click on a tab pins it; double-click again unpins.
// TC-4.2-6-mut:   Mutation proof — remove @dblclick → pin assertion fails red.
// TC-4.2-DEC0044: Pinned tab keeps close control; closing a pinned tab works.
// TC-4.2-7:       Task row opened from Tasks picker in a split → opens in the other group.
// TC-4.2-5c:      Compound check — two tasks; first survives when pinned, replaced when not.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase4.2/phase4.2-step2.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/phase4.2-step2");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

async function shot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

const TASK_A_ID = "TSK-TC42-step2-A";
const TASK_B_ID = "TSK-TC42-step2-B";
const PROJECT_SLUG = "Caravel-Vue";

async function stubBaseRoutes(page) {
  await page.route("**/api/live", (route) => route.abort("connectionrefused"));
  await page.route(/\/api\/tasks\?limit=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        tasks: [
          { id: TASK_A_ID, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task A", project: PROJECT_SLUG, updated: new Date().toISOString(), closed: null },
          { id: TASK_B_ID, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task B", project: PROJECT_SLUG, updated: new Date(Date.now() - 1000).toISOString(), closed: null },
        ],
      }),
    })
  );
  await page.route(/\/api\/projects\?counts=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, projects: [] }),
    })
  );
  // Stub envelope requests for task A and B
  await page.route(/\/api\/tasks\/TSK-TC42-step2/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, chain: { task: { id: route.request().url().includes(TASK_A_ID) ? TASK_A_ID : TASK_B_ID, headline: "stub", status: "open", agent: "bob" } } }),
    })
  );
}

async function loadApp(browser, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport ?? { width: 1440, height: 900 } });
  await stubBaseRoutes(page);
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  return page;
}

const browser = await chromium.launch({ headless: true });

// ── TC-4.2-6: Double-click pins a tab ─────────────────────────────────────────
// Mutation proof: verified below by reading the Pinia state after @dblclick.
// Without @dblclick handler the state stays unpinned.

{
  const page = await loadApp(browser);

  try {
    // Open a tasks tab via Pinia.
    await page.evaluate(() => {
      window.__pinia._s.get("workspace").open({ kind: "legacy", page: "tasks" });
    });
    await page.waitForTimeout(300);

    const tabKey = "legacy:tasks";
    const tabEl = page.locator(`.ts-tab[data-key="${tabKey}"]`);
    await tabEl.waitFor({ state: "visible", timeout: 5000 });

    const initialPinned = await page.evaluate((k) => !!window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey);
    if (initialPinned) {
      fail("TC-4.2-6 tab starts unpinned", "tab was already pinned before double-click");
    } else {
      // Double-click the tab
      await tabEl.dblclick();
      await page.waitForTimeout(200);

      const pinnedAfter = await page.evaluate((k) => !!window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey);
      const hasPinnedClass = await tabEl.evaluate((el) => el.classList.contains("ts-tab--pinned"));

      await shot(page, "TC-4.2-6-after-pin");

      if (pinnedAfter && hasPinnedClass) {
        pass(`TC-4.2-6 double-click pins tab (Pinia pinned=true, .ts-tab--pinned class present)`);
      } else {
        fail("TC-4.2-6 double-click pins tab", `pinned=${pinnedAfter} hasPinnedClass=${hasPinnedClass}`);
      }

      // TC-4.2-6b: double-click again unpins
      await tabEl.dblclick();
      await page.waitForTimeout(200);

      const unpinnedAfter = await page.evaluate((k) => !window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey);
      await shot(page, "TC-4.2-6b-after-unpin");

      if (unpinnedAfter) {
        pass(`TC-4.2-6b second double-click unpins tab`);
      } else {
        fail("TC-4.2-6b second double-click unpins", "tab still pinned");
      }
    }
  } catch (e) { fail("TC-4.2-6", String(e)); }
  await page.close();
}

// ── TC-4.2-DEC0044: Pinned tab keeps close control ───────────────────────────
// Mutation proof: add back v-if="!ws.meta[...]?.pinned" → .ts-tab-close missing
//   on a pinned tab → this TC fails.

{
  const page = await loadApp(browser);

  try {
    const tabKey = "legacy:tasks";

    // Open a tab and pin it via Pinia.
    await page.evaluate((k) => {
      const ws = window.__pinia._s.get("workspace");
      ws.open({ kind: "legacy", page: "tasks" });
      ws.pin(k);
    }, tabKey);
    await page.waitForTimeout(300);

    const tabEl = page.locator(`.ts-tab[data-key="${tabKey}"]`);
    await tabEl.waitFor({ state: "visible", timeout: 5000 });

    // Verify close control IS present on pinned tab (DEC-0044).
    const closeEl = tabEl.locator(".ts-tab-close");
    const closeVisible = await closeEl.isVisible();

    await shot(page, "TC-4.2-DEC0044-pinned-close");

    if (!closeVisible) {
      fail("TC-4.2-DEC0044 close control visible on pinned tab", "× not found or not visible");
    } else {
      pass("TC-4.2-DEC0044 pinned tab has close control visible");

      // Click close — tab should disappear.
      await closeEl.click();
      await page.waitForTimeout(300);
      const tabGone = await page.locator(`.ts-tab[data-key="${tabKey}"]`).count();
      await shot(page, "TC-4.2-DEC0044-after-close");

      if (tabGone === 0) {
        pass("TC-4.2-DEC0044 closing pinned tab removes it from strip");
      } else {
        fail("TC-4.2-DEC0044 closing pinned tab", `tab still in DOM (count=${tabGone})`);
      }
    }
  } catch (e) { fail("TC-4.2-DEC0044", String(e)); }
  await page.close();
}

// ── TC-4.2-7: Picker sends detail to other split group ────────────────────────
// Mutation proof: remove the `side` logic from openTask() → envelope opens in
//   group 0 (the picker's group) rather than group 1 → this TC fails.

{
  const page = await loadApp(browser);

  try {
    // Set up: open tasks (lands in group 0 alongside dashboard), then open chat
    // with side:true — workspace creates a split with chat alone in group 1 and
    // tasks+dashboard in group 0. splitIndex = tabs.length-1 = 2.
    await page.evaluate(() => {
      const ws = window.__pinia._s.get("workspace");
      const tasks = window.__pinia._s.get("tasks");
      ws.open({ kind: "legacy", page: "tasks" });
      ws.open({ kind: "legacy", page: "chat" }, { side: true });
      // focused=1 after opening chat; that's fine — the logic still targets group 1
      // because focused(1) !== pickerGroup(0) → targetGroup = focused = 1.
      tasks.view = "all";
      tasks.loaded = true;
    });
    await page.waitForTimeout(500);

    await shot(page, "TC-4.2-7-before-click");

    // Wait for task rows to render
    const taskRow = page.locator(`.task-tree-node`).first();
    await taskRow.waitFor({ state: "visible", timeout: 6000 });

    // Click the first task row to open it.
    await taskRow.click();
    await page.waitForTimeout(500);

    await shot(page, "TC-4.2-7-after-click");

    // Check which group the envelope opened in.
    const groupResult = await page.evaluate(() => {
      const ws = window.__pinia._s.get("workspace");
      const active0 = ws.active[0]; // group 0 active key
      const active1 = ws.active[1]; // group 1 active key
      const tabs = ws.tabs.map(t => ws.refKey(t));
      return {
        active0,
        active1,
        tabs,
        group0IsStillTasks: active0 === "legacy:tasks",
        group1HasEnvelope: typeof active1 === "string" && active1.startsWith("envelope:"),
      };
    });

    if (groupResult.group0IsStillTasks && groupResult.group1HasEnvelope) {
      pass(`TC-4.2-7 envelope opened in group 1 (g0=${groupResult.active0}, g1=${groupResult.active1})`);
    } else {
      fail("TC-4.2-7 envelope in other group", `g0=${groupResult.active0} g1=${groupResult.active1} — expected tasks in g0, envelope in g1`);
    }
  } catch (e) { fail("TC-4.2-7", String(e)); }
  await page.close();
}

// ── TC-4.2-5c: Compound check ─────────────────────────────────────────────────
// Scenario A (pinned): open task A, pin it, open task B → both survive in group 1.
// Scenario B (not pinned): open task A (preview), open task B → task A replaced.

// Scenario A — pinned first task survives
{
  const page = await loadApp(browser);

  try {
    // Set up: tasks in group 0, chat alone in group 1 via side:true.
    await page.evaluate(() => {
      const ws = window.__pinia._s.get("workspace");
      const tasks = window.__pinia._s.get("tasks");
      ws.open({ kind: "legacy", page: "tasks" });
      ws.open({ kind: "legacy", page: "chat" }, { side: true });
      // focused=1 (chat) after above; fine — picker still in group 0
      tasks.view = "all";
      tasks.loaded = true;
    });
    await page.waitForTimeout(400);

    // Open task A from picker.
    await page.locator(".task-tree-node").first().click();
    await page.waitForTimeout(300);

    // Find task A's tab key and double-click to pin it.
    const taskAKey = `envelope:${TASK_A_ID}`;
    const taskATab = page.locator(`.ts-tab[data-key="${taskAKey}"]`);
    const taskAVisible = await taskATab.isVisible().catch(() => false);
    if (!taskAVisible) {
      // If task A didn't land in group 1, the scenario fails to set up
      fail("TC-4.2-5c setup: task A opened in group 1", "task A tab not visible after click");
    } else {
      // Pin task A by double-clicking its tab.
      await taskATab.dblclick();
      await page.waitForTimeout(200);

      // Open task B from picker.
      await page.locator(".task-tree-node").nth(1).click();
      await page.waitForTimeout(300);

      await shot(page, "TC-4.2-5c-pinned-both");

      const result = await page.evaluate((aKey) => {
        const ws = window.__pinia._s.get("workspace");
        const allKeys = ws.tabs.map(t => ws.refKey(t));
        return {
          allKeys,
          taskAPresent: allKeys.includes(aKey),
          taskAMeta: ws.meta[aKey],
        };
      }, taskAKey);

      if (result.taskAPresent && result.taskAMeta?.pinned) {
        pass(`TC-4.2-5c pinned task A survives when task B opened (tabs: ${result.allKeys.join(", ")})`);
      } else {
        fail("TC-4.2-5c pinned task A survives", `taskAPresent=${result.taskAPresent} pinned=${result.taskAMeta?.pinned}`);
      }
    }
  } catch (e) { fail("TC-4.2-5c pinned", String(e)); }
  await page.close();
}

// Scenario B — unpinned first task IS replaced (correct eviction behaviour)
{
  const page = await loadApp(browser);

  try {
    // Same clean split setup as scenario A.
    await page.evaluate(() => {
      const ws = window.__pinia._s.get("workspace");
      const tasks = window.__pinia._s.get("tasks");
      ws.open({ kind: "legacy", page: "tasks" });
      ws.open({ kind: "legacy", page: "chat" }, { side: true });
      tasks.view = "all";
      tasks.loaded = true;
    });
    await page.waitForTimeout(400);

    // Open task A (preview, not pinned).
    await page.locator(".task-tree-node").first().click();
    await page.waitForTimeout(300);

    // Open task B without pinning task A first.
    await page.locator(".task-tree-node").nth(1).click();
    await page.waitForTimeout(300);

    await shot(page, "TC-4.2-5c-unpinned-replaced");

    const result = await page.evaluate(([aKey, bKey]) => {
      const ws = window.__pinia._s.get("workspace");
      const allKeys = ws.tabs.map(t => ws.refKey(t));
      return {
        allKeys,
        taskAGone: !allKeys.includes(aKey),
        taskBPresent: allKeys.includes(bKey),
      };
    }, [`envelope:${TASK_A_ID}`, `envelope:${TASK_B_ID}`]);

    if (result.taskAGone && result.taskBPresent) {
      pass(`TC-4.2-5c unpinned task A replaced by task B (tabs: ${result.allKeys.join(", ")})`);
    } else {
      fail("TC-4.2-5c unpinned task A replaced", `taskAGone=${result.taskAGone} taskBPresent=${result.taskBPresent} tabs: ${result.allKeys.join(", ")}`);
    }
  } catch (e) { fail("TC-4.2-5c unpinned", String(e)); }
  await page.close();
}

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
