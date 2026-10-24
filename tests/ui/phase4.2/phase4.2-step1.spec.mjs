// phase4.2-step1.spec.mjs — Phase 4.2 step 1 gate specs
//
// TC-4.2-1: moveToGroup boundary fix — moved tab lands in group 1 only
// TC-4.2-2: OpenMenu "Projects" → Tasks tab opens with view="projects"
// TC-4.2-3: OpenMenu "Open" → Tasks tab opens with view="all"
// TC-4.2-4: ProjectView .pv-root has panel background (not transparent)
// TC-4.2-5: Project card grid ≥2 columns at 720px, 1 column at 360px
// TC-4.2-8: Done task rows render at ~0.45 opacity; open task rows at 1.0
//
// Mutation proofs listed inline per test.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase4.2/phase4.2-step1.spec.mjs

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
const SHOTS_DIR = join(__dirname, ".runs/phase4.2-step1");
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

// ── Shared stub helpers ───────────────────────────────────────────────────────

const TASK_OPEN_ID = "TSK-TC42-open-0001";
const TASK_DONE_ID = "TSK-TC42-done-0002";
const PROJECT_SLUG = "Caravel-Vue";

async function stubBaseRoutes(page) {
  await page.route("**/api/live", (route) => route.abort("connectionrefused"));
  await page.route(/\/api\/tasks\?limit=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [
        { id: TASK_OPEN_ID, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 open fixture", project: PROJECT_SLUG, updated: new Date().toISOString(), closed: null },
        { id: TASK_DONE_ID, agent: "bob", to: "bob", from: "alice", status: "done", headline: "TC-4.2 done fixture", project: PROJECT_SLUG, updated: new Date().toISOString(), closed: null },
      ] }),
    })
  );
  await page.route(/\/api\/projects\?counts=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, projects: [
        { slug: PROJECT_SLUG, title: "Caravel Vue", jira: "WAL-141", status: "active", lastTouched: new Date().toISOString(), counts: { active: 3, doneNotClosed: 1, stuck: 0, closed: 2 } },
        { slug: "Trakk-Assets", title: "Trakk Assets", jira: null, status: "active", lastTouched: new Date().toISOString(), counts: { active: 5, doneNotClosed: 0, stuck: 1, closed: 8 } },
        { slug: "Monorepo", title: "Monorepo", jira: null, status: "active", lastTouched: new Date().toISOString(), counts: { active: 1, doneNotClosed: 0, stuck: 0, closed: 4 } },
      ] }),
    })
  );
  await page.route(/\/api\/projects\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, summary: { title: "Caravel Vue", jira: "WAL-141", status: "active", metrics: { medianCloseTimeMs: 3600000, medianActiveAgeMs: 7200000 }, leaves: [], families: [], closedTasks: [], docs: { primary: [], fdps: [], other: [] } } }),
    })
  );
}

function clearStorage(page) {
  return page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
}

async function loadApp(browser, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport ?? { width: 1440, height: 900 } });
  await stubBaseRoutes(page);
  await clearStorage(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  return page;
}

async function openMenuAndClick(page, buttonId) {
  // Open the menu and click an item, with retries for Teleport timing.
  await page.locator('.open-menu-btn').click();
  await page.waitForTimeout(200);
  // Wait for the menu panel to appear (Teleported to body)
  await page.locator('.open-menu-list').waitFor({ state: "visible", timeout: 5000 });
  await page.locator(`#${buttonId}`).click();
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ headless: true });

// ── TC-4.2-1: moveToGroup boundary fix ───────────────────────────────────────
// Mutation proof: revert workspace.ts:600 back to <= and the "inGroup1"
// assertion fails (the tab lands in group 0 instead of group 1).

{
  const page = await loadApp(browser);

  try {
    const result = await page.evaluate(() => {
      const pinia = window.__pinia;
      if (!pinia) return { error: "__pinia not found" };
      const workspace = pinia._s.get("workspace");
      if (!workspace) return { error: "workspace store not found" };

      // Open two resource tabs so we have something to split.
      workspace.open({ kind: "legacy", page: "tasks" });
      workspace.open({ kind: "legacy", page: "chat" });
      // Force split on: tasks in group 0, chat in group 1.
      workspace.splitOn = true;
      workspace.splitIndex = 1;

      // Move "tasks" to group 1.
      const tasksKey = workspace.refKey({ kind: "legacy", page: "tasks" });
      workspace.moveToGroup(tasksKey, 1);

      const tabKeys = workspace.tabs.map((t) => workspace.refKey(t));
      const split = workspace.splitIndex;
      const group0Keys = tabKeys.slice(0, split);
      const group1Keys = tabKeys.slice(split);
      return { tabKeys, split, group0Keys, group1Keys, tasksKey };
    });

    if (result.error) {
      fail("TC-4.2-1 store setup", result.error);
    } else {
      const inGroup0 = result.group0Keys.includes(result.tasksKey);
      const inGroup1 = result.group1Keys.includes(result.tasksKey);
      if (!inGroup0 && inGroup1) {
        pass(`TC-4.2-1 moved tab in group 1 only — split=${result.split} g0=${JSON.stringify(result.group0Keys)} g1=${JSON.stringify(result.group1Keys)}`);
      } else {
        fail("TC-4.2-1 moved tab in group 1 only", `inGroup0=${inGroup0} inGroup1=${inGroup1} tabs=${JSON.stringify(result.tabKeys)} split=${result.split}`);
      }
    }
    await shot(page, "TC-4.2-1-movetab-1440");
  } catch (e) { fail("TC-4.2-1", String(e)); }
  await page.close();
}

// ── TC-4.2-3: OpenMenu "Open" → view="all" ───────────────────────────────────
// Fresh page per test to avoid contamination between TC-4.2-2 and TC-4.2-3.
// Mutation proof: remove `tasksStore.view = "all"` from openTasks() →
//   view stays "projects" (the default), TC-4.2-3 fails.

{
  const page = await loadApp(browser);

  try {
    await openMenuAndClick(page, "tab-tasks");

    // Wait for tasks view tabs to appear in the picker.
    await page.locator('.tasks-view-tabs').waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

    // Check which view tab is active.
    const activeView = await page.evaluate(() => {
      const tabs = document.querySelectorAll('.tasks-view-tab[aria-selected="true"]');
      if (tabs.length === 0) {
        // Fallback: check Pinia store directly
        const pinia = window.__pinia;
        if (!pinia) return null;
        return pinia._s.get("tasks")?.view ?? null;
      }
      return tabs[0]?.getAttribute("data-view") ?? null;
    });

    if (activeView === "all") {
      pass(`TC-4.2-3 OpenMenu "Open" → view="all" (confirmed via DOM/store: "${activeView}")`);
    } else {
      fail("TC-4.2-3 OpenMenu Open → view=all", `got "${activeView}" — openTasks() may not be setting view`);
    }
    await shot(page, "TC-4.2-3-view-all-1440");
  } catch (e) { fail("TC-4.2-3", String(e)); }
  await page.close();
}

// ── TC-4.2-2: OpenMenu "Projects" → view="projects" ──────────────────────────
// Fresh page so TC-4.2-3 state doesn't bleed.
// Mutation proof: remove `tasksStore.view = "projects"` from openProjects() →
//   view reverts to "all" (from prior openTasks call or store state),
//   TC-4.2-2 assertion fails.

{
  const page = await loadApp(browser);

  try {
    // First set view to "all" so we can verify the Projects button switches it back.
    await page.evaluate(() => {
      const pinia = window.__pinia;
      if (pinia) pinia._s.get("tasks").view = "all";
    });

    await openMenuAndClick(page, "tab-projects");

    // Wait for projects view to be active.
    await page.locator('.tasks-projects-grid').waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

    const activeView = await page.evaluate(() => {
      const tabs = document.querySelectorAll('.tasks-view-tab[aria-selected="true"]');
      if (tabs.length === 0) {
        const pinia = window.__pinia;
        if (!pinia) return null;
        return pinia._s.get("tasks")?.view ?? null;
      }
      return tabs[0]?.getAttribute("data-view") ?? null;
    });

    if (activeView === "projects") {
      pass(`TC-4.2-2 OpenMenu "Projects" → view="projects" (confirmed: "${activeView}")`);
    } else {
      fail("TC-4.2-2 OpenMenu Projects → view=projects", `got "${activeView}"`);
    }
    await shot(page, "TC-4.2-2-view-projects-1440");
  } catch (e) { fail("TC-4.2-2", String(e)); }
  await page.close();
}

// ── TC-4.2-4: ProjectView .pv-root has background ────────────────────────────
// Uses Pinia to open the project tab (more reliable than URL navigation).
// Mutation proof: remove background from .pv-root CSS → computed
//   background-color resolves to rgba(0,0,0,0).

{
  const page = await loadApp(browser);

  try {
    // Open a project tab via Pinia store directly.
    await page.evaluate((slug) => {
      const ws = window.__pinia?._s.get("workspace");
      if (ws) ws.open({ kind: "project", slug });
    }, PROJECT_SLUG);

    // Wait for ProjectView to render.
    await page.locator('.pv-root').waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(300);

    const bg = await page.evaluate(() => {
      const el = document.querySelector(".pv-root");
      return el ? window.getComputedStyle(el).backgroundColor : null;
    });

    if (!bg) {
      fail("TC-4.2-4 .pv-root background", ".pv-root not found in DOM after project tab opened");
    } else {
      const isTransparent = bg === "rgba(0, 0, 0, 0)";
      if (!isTransparent) {
        pass(`TC-4.2-4 .pv-root background set (computed="${bg}")`);
      } else {
        fail("TC-4.2-4 .pv-root has non-transparent background", `background is transparent: "${bg}"`);
      }
    }

    const borderStyle = await page.evaluate(() => {
      const el = document.querySelector(".pv-root");
      return el ? window.getComputedStyle(el).borderTopStyle : null;
    });
    if (borderStyle && borderStyle !== "none") {
      pass(`TC-4.2-4 .pv-root border applied (border-top-style="${borderStyle}")`);
    } else {
      fail("TC-4.2-4 .pv-root border applied", `border-top-style="${borderStyle}"`);
    }

    await shot(page, "TC-4.2-4-projectview-bg-1440");
  } catch (e) { fail("TC-4.2-4", String(e)); }
  await page.close();
}

// ── TC-4.2-5: Project card grid ≥2 columns at 720px, 1 column at 360px ────────
// Mutation proof: revert .tasks-projects-grid to flex-direction:column →
//   all cards share the same x position → single column → TC-4.2-5@720 fails.

// 720px desktop
{
  const page720 = await loadApp(browser, { viewport: { width: 720, height: 900 } });

  try {
    // Force view="projects" and open the tasks picker.
    await page720.evaluate(() => {
      const pinia = window.__pinia;
      if (pinia) pinia._s.get("tasks").view = "projects";
    });

    await openMenuAndClick(page720, "tab-projects");

    // Wait for project cards.
    await page720.locator('.tasks-project-card').first().waitFor({ state: "visible", timeout: 6000 });
    await page720.waitForTimeout(300);

    await shot(page720, "TC-4.2-5-grid-720px");

    const cards = page720.locator('.tasks-project-card');
    const count = await cards.count();
    if (count < 2) {
      fail("TC-4.2-5@720 at least 2 cards visible", `only ${count} project cards`);
    } else {
      const boxes = await Promise.all(
        Array.from({ length: count }, (_, i) => cards.nth(i).boundingBox())
      );
      const uniqueLefts = new Set(boxes.filter(Boolean).map((b) => Math.round(b.x)));
      if (uniqueLefts.size >= 2) {
        pass(`TC-4.2-5@720 grid has ${uniqueLefts.size} columns (${count} cards, x positions: ${[...uniqueLefts].join(", ")}px)`);
      } else {
        fail("TC-4.2-5@720 grid ≥2 columns at 720px", `all ${count} cards at same x (${[...uniqueLefts].join(",")}) — single column`);
      }
    }
  } catch (e) { fail("TC-4.2-5@720", String(e)); }
  await page720.close();
}

// 360px mobile
{
  const page360 = await loadApp(browser, { viewport: { width: 360, height: 740 } });

  try {
    await page360.evaluate(() => {
      const pinia = window.__pinia;
      if (pinia) pinia._s.get("tasks").view = "projects";
    });

    await openMenuAndClick(page360, "tab-projects");
    await page360.locator('.tasks-project-card').first().waitFor({ state: "visible", timeout: 6000 });
    await page360.waitForTimeout(300);

    await shot(page360, "TC-4.2-5-grid-360px");

    const cards = page360.locator('.tasks-project-card');
    const count = await cards.count();
    if (count < 1) {
      fail("TC-4.2-5@360 cards rendered", "no project cards at 360px");
    } else if (count === 1) {
      pass("TC-4.2-5@360 single card (trivially single column at 360px)");
    } else {
      const boxes = await Promise.all(
        Array.from({ length: count }, (_, i) => cards.nth(i).boundingBox())
      );
      const uniqueLefts = new Set(boxes.filter(Boolean).map((b) => Math.round(b.x)));
      if (uniqueLefts.size === 1) {
        pass(`TC-4.2-5@360 single column (${count} cards, all at x=${[...uniqueLefts][0]}px)`);
      } else {
        fail("TC-4.2-5@360 single column at 360px", `${uniqueLefts.size} distinct x positions — expected 1`);
      }
    }
  } catch (e) { fail("TC-4.2-5@360", String(e)); }
  await page360.close();
}

// ── TC-4.2-8: Done rows at ~0.45 opacity, open rows at ~1.0 ──────────────────
// Mutation proof: remove .task-tree-node.is-done { opacity: 0.45 } →
//   doneRowOpacity === 1, same as openRowOpacity → TC-4.2-8 fails.

// 1440px
{
  const page = await loadApp(browser);

  try {
    // Force view="all" so task rows render, then open the tasks picker.
    await page.evaluate(() => {
      const pinia = window.__pinia;
      if (pinia) pinia._s.get("tasks").view = "all";
    });

    await openMenuAndClick(page, "tab-tasks");

    // Wait for task rows to appear.
    await page.locator('.task-tree-node').first().waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(300);

    await shot(page, "TC-4.2-8-before-measure-1440");

    const doneOpacity = await page.evaluate((id) => {
      const el = document.querySelector(`.task-tree-node[data-task-id="${id}"]`);
      return el ? parseFloat(window.getComputedStyle(el).opacity) : null;
    }, TASK_DONE_ID);

    const openOpacity = await page.evaluate((id) => {
      const el = document.querySelector(`.task-tree-node[data-task-id="${id}"]`);
      return el ? parseFloat(window.getComputedStyle(el).opacity) : null;
    }, TASK_OPEN_ID);

    if (openOpacity === null) {
      fail("TC-4.2-8 open row in DOM", `no .task-tree-node[data-task-id="${TASK_OPEN_ID}"]`);
    } else if (openOpacity >= 0.95) {
      pass(`TC-4.2-8 open task row opacity=${openOpacity.toFixed(2)} ≈ 1.0`);
    } else {
      fail("TC-4.2-8 open row opacity ≈ 1.0", `got ${openOpacity.toFixed(2)}`);
    }

    if (doneOpacity === null) {
      fail("TC-4.2-8 done row in DOM", `no .task-tree-node[data-task-id="${TASK_DONE_ID}"]`);
    } else if (doneOpacity >= 0.35 && doneOpacity <= 0.55) {
      pass(`TC-4.2-8 done task row opacity=${doneOpacity.toFixed(2)} ≈ 0.45 (±0.1)`);
    } else {
      fail("TC-4.2-8 done row opacity ≈ 0.45", `got ${doneOpacity.toFixed(2)} — expected 0.35–0.55`);
    }

    await shot(page, "TC-4.2-8-done-opacity-1440");
  } catch (e) { fail("TC-4.2-8@1440", String(e)); }
  await page.close();
}

// 360px
{
  const page360 = await loadApp(browser, { viewport: { width: 360, height: 740 } });

  try {
    await page360.evaluate(() => {
      const pinia = window.__pinia;
      if (pinia) pinia._s.get("tasks").view = "all";
    });

    await openMenuAndClick(page360, "tab-tasks");
    await page360.locator('.task-tree-node').first().waitFor({ state: "visible", timeout: 8000 });
    await page360.waitForTimeout(300);

    const doneOpacity360 = await page360.evaluate((id) => {
      const el = document.querySelector(`.task-tree-node[data-task-id="${id}"]`);
      return el ? parseFloat(window.getComputedStyle(el).opacity) : null;
    }, TASK_DONE_ID);

    if (doneOpacity360 === null) {
      fail("TC-4.2-8@360 done row in DOM", `no .task-tree-node[data-task-id="${TASK_DONE_ID}"] at 360px`);
    } else if (doneOpacity360 >= 0.35 && doneOpacity360 <= 0.55) {
      pass(`TC-4.2-8@360 done row opacity=${doneOpacity360.toFixed(2)} ≈ 0.45 at 360px`);
    } else {
      fail("TC-4.2-8@360 done row opacity", `got ${doneOpacity360.toFixed(2)}`);
    }

    await shot(page360, "TC-4.2-8-done-opacity-360px");
  } catch (e) { fail("TC-4.2-8@360", String(e)); }
  await page360.close();
}

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
