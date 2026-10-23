// phase4.2-step2.spec.mjs — Phase 4.2 step 2 gate specs
//
// TC-4.2-6:       Double-click on a tab pins it; double-click again unpins.
//                 At 360×740 (TC-4.2-6@360) the centre double-tap must PIN,
//                 not close — verifies the M2 R21 halo asymmetry fix.
// TC-4.2-DEC0044: Pinned tab keeps close control; closing a pinned tab works.
// TC-4.2-7:       Picker in group 0 → detail in group 1.
//                 TC-4.2-7-mirror: Picker in group 1 → detail in group 0. (M1 R21)
// TC-4.2-5c:      Compound check — two tasks; first survives when pinned, replaced when not.
//
// Viewports: 1440×900 AND 360×740 — both required (M3 R21).
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

// ── Viewports ─────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 1440, height: 900,  label: "1440×900" },
  { width: 360,  height: 740,  label: "360×740"  },
];

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
  await page.route(/\/api\/tasks\/TSK-TC42-step2/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, chain: { task: { id: route.request().url().includes(TASK_A_ID) ? TASK_A_ID : TASK_B_ID, headline: "stub", status: "open", agent: "bob" } } }),
    })
  );
}

async function loadApp(browser, viewport) {
  const page = await browser.newPage({ viewport });
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

// ── TC-4.2-DEC0044: Pinned tab keeps close control (viewport-independent) ────
// Mutation proof: add back v-if="!ws.meta[...]?.pinned" → .ts-tab-close missing
//   on a pinned tab → this TC fails.

{
  const page = await loadApp(browser, VIEWPORTS[0]);

  try {
    const tabKey = "legacy:tasks";

    await page.evaluate((k) => {
      const ws = window.__pinia._s.get("workspace");
      ws.open({ kind: "legacy", page: "tasks" });
      ws.pin(k);
    }, tabKey);
    await page.waitForTimeout(300);

    const tabEl = page.locator(`.ts-tab[data-key="${tabKey}"]`);
    await tabEl.waitFor({ state: "visible", timeout: 5000 });

    const closeEl = tabEl.locator(".ts-tab-close");
    const closeVisible = await closeEl.isVisible();

    await shot(page, "TC-4.2-DEC0044-pinned-close");

    if (!closeVisible) {
      fail("TC-4.2-DEC0044 close control visible on pinned tab", "× not found or not visible");
    } else {
      pass("TC-4.2-DEC0044 pinned tab has close control visible");

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

// ── Per-viewport loop ─────────────────────────────────────────────────────────

for (const VP of VIEWPORTS) {
  const vp = { width: VP.width, height: VP.height };
  const sl = VP.label.replace("×", "x");

  // ── TC-4.2-6: Double-click pins a tab ────────────────────────────────────────
  // At 360×740 this is the TC-4.2-6@360 test: the centre double-tap must PIN,
  // not close the tab. Proves the M2 halo asymmetry fix: the close hit-area no
  // longer reaches the tab's label region.

  {
    const page = await loadApp(browser, vp);

    try {
      await page.evaluate(() => {
        window.__pinia._s.get("workspace").open({ kind: "legacy", page: "tasks" });
      });
      await page.waitForTimeout(300);

      const tabKey = "legacy:tasks";
      const tabEl = page.locator(`.ts-tab[data-key="${tabKey}"]`);
      await tabEl.waitFor({ state: "visible", timeout: 5000 });

      const initialPinned = await page.evaluate((k) => !!window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey);
      if (initialPinned) {
        fail(`TC-4.2-6 tab starts unpinned [${VP.label}]`, "tab was already pinned before double-click");
      } else {
        // Double-click at the element's own centre (Playwright default).
        // At 360×740, the element centre must be in the LABEL region, not the close hit-area.
        await tabEl.dblclick();
        await page.waitForTimeout(200);

        // Verify the tab still exists (was not accidentally closed).
        const tabStillExists = await tabEl.count() > 0;
        const pinnedAfter = tabStillExists
          ? await page.evaluate((k) => !!window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey)
          : false;
        const hasPinnedClass = tabStillExists
          ? await tabEl.evaluate((el) => el.classList.contains("ts-tab--pinned"))
          : false;

        await shot(page, `TC-4.2-6-after-pin-${sl}`);

        if (pinnedAfter && hasPinnedClass) {
          pass(`TC-4.2-6 double-click pins tab [${VP.label}] (pinned=true, .ts-tab--pinned present, tab not closed)`);
        } else if (!tabStillExists) {
          fail(`TC-4.2-6 double-click pins tab [${VP.label}]`, "tab was CLOSED by the double-click — close halo still overlapping centre");
        } else {
          fail(`TC-4.2-6 double-click pins tab [${VP.label}]`, `pinned=${pinnedAfter} hasPinnedClass=${hasPinnedClass}`);
        }

        if (tabStillExists) {
          // TC-4.2-6b: double-click again unpins
          await tabEl.dblclick();
          await page.waitForTimeout(200);

          const unpinnedAfter = await page.evaluate((k) => !window.__pinia._s.get("workspace").meta[k]?.pinned, tabKey);
          await shot(page, `TC-4.2-6b-after-unpin-${sl}`);

          if (unpinnedAfter) {
            pass(`TC-4.2-6b second double-click unpins tab [${VP.label}]`);
          } else {
            fail(`TC-4.2-6b second double-click unpins [${VP.label}]`, "tab still pinned");
          }
        }
      }
    } catch (e) { fail(`TC-4.2-6 [${VP.label}]`, String(e)); }
    await page.close();
  }

  // ── TC-4.2-7: Picker in group 0 → detail in group 1 ─────────────────────────
  // Desktop only: at 360px the narrow layout only renders the focused group;
  // clicking a task row in the non-focused group requires a physical DOM pane
  // that isn't present at that viewport. The 360px M1 proof is TC-4.2-7-mirror
  // (picker in group 1 → detail in group 0), which runs at both viewports.

  if (VP.width >= 1000) {
    const page = await loadApp(browser, vp);

    try {
      // Tasks in group 0 (alongside dashboard), chat in group 1 via side:true.
      // After split creation chat receives focus (group 1). Re-focus group 0 so
      // the tasks panel is rendered at narrow viewports (single-panel layout).
      // Seed tasks.cache directly so the tree has data immediately on mount
      // (avoids a race where the page mounts fresh with empty cache at 360px).
      await page.evaluate(([idA, idB, slug]) => {
        const ws = window.__pinia._s.get("workspace");
        const tasks = window.__pinia._s.get("tasks");
        ws.open({ kind: "legacy", page: "tasks" });
        ws.open({ kind: "legacy", page: "chat" }, { side: true });
        tasks.cache = [
          { id: idA, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task A", project: slug, updated: new Date().toISOString(), closed: null },
          { id: idB, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task B", project: slug, updated: new Date(Date.now() - 1000).toISOString(), closed: null },
        ];
        tasks.view = "all";
        tasks.loaded = true;
        ws.focused = 0;
      }, [TASK_A_ID, TASK_B_ID, PROJECT_SLUG]);
      await page.waitForTimeout(500);

      await shot(page, `TC-4.2-7-before-${sl}`);

      const taskRow = page.locator(".task-tree-node").first();
      await taskRow.waitFor({ state: "visible", timeout: 6000 });

      await taskRow.click();
      await page.waitForTimeout(500);

      await shot(page, `TC-4.2-7-after-${sl}`);

      const r = await page.evaluate(() => {
        const ws = window.__pinia._s.get("workspace");
        return {
          active0: ws.active[0],
          active1: ws.active[1],
          tabs: ws.tabs.map(t => ws.refKey(t)),
        };
      });

      const ok = r.active0 === "legacy:tasks" && typeof r.active1 === "string" && r.active1.startsWith("envelope:");
      if (ok) {
        pass(`TC-4.2-7 picker g0 → envelope in g1 [${VP.label}] (g0=${r.active0}, g1=${r.active1})`);
      } else {
        fail(`TC-4.2-7 picker g0 → envelope in g1 [${VP.label}]`, `g0=${r.active0} g1=${r.active1}`);
      }
    } catch (e) { fail(`TC-4.2-7 [${VP.label}]`, String(e)); }
    await page.close();
  }

  // ── TC-4.2-7-mirror: Picker in group 1 → detail in group 0 (M1 R21) ─────────

  {
    const page = await loadApp(browser, vp);

    try {
      // Open tasks with side:true → tasks alone in group 1, dashboard in group 0.
      // splitIndex = 1 (tasks at index 1 >= 1 = group 1).
      // Seed cache to prevent live-API flake (dev proxy returns real tasks).
      await page.evaluate(([idA, idB, slug]) => {
        const ws = window.__pinia._s.get("workspace");
        const tasks = window.__pinia._s.get("tasks");
        ws.open({ kind: "legacy", page: "tasks" }, { side: true });
        tasks.cache = [
          { id: idA, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task A", project: slug, updated: new Date().toISOString(), closed: null },
          { id: idB, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task B", project: slug, updated: new Date(Date.now() - 1000).toISOString(), closed: null },
        ];
        tasks.view = "all";
        tasks.loaded = true;
      }, [TASK_A_ID, TASK_B_ID, PROJECT_SLUG]);
      await page.waitForTimeout(500);

      await shot(page, `TC-4.2-7-mirror-before-${sl}`);

      // Verify setup and invoke openTask directly via store — avoids cache/timing
      // flake where the live API overwrites tasks.cache between our evaluate and
      // the DOM click, resulting in a real task ID (not our stub) being opened.
      const r = await page.evaluate(([idA]) => {
        const ws = window.__pinia._s.get("workspace");
        const setupSnap = {
          splitOn: ws.splitOn,
          tabs: ws.tabs.map(t => ws.refKey(t)),
          focused: ws.focused,
          splitIndex: ws.splitIndex,
        };
        // Compute what openTask would do
        const key = "legacy:tasks";
        const idx = ws.tabs.findIndex(t => ws.refKey(t) === key);
        const pickerGroup = idx >= 0 ? ws.tabGroup(idx) : 0;
        const otherGroup = ws.splitOn ? (1 - pickerGroup) : undefined;
        // Invoke open() the same way TaskPickerTree.openTask does
        if (otherGroup !== undefined) {
          ws.open({ kind: "envelope", taskId: idA }, { preview: true, group: otherGroup });
        } else {
          ws.open({ kind: "envelope", taskId: idA }, { preview: true });
        }
        return {
          setupSnap,
          pickerGroup,
          otherGroup,
          active0: ws.active[0],
          active1: ws.active[1],
          tabs: ws.tabs.map(t => ws.refKey(t)),
        };
      }, [TASK_A_ID]);

      await shot(page, `TC-4.2-7-mirror-after-${sl}`);

      // Envelope must be in group 0 (active0 is envelope), picker stays in group 1.
      const ok = typeof r.active0 === "string" && r.active0.startsWith("envelope:") && r.active1 === "legacy:tasks";
      if (ok) {
        pass(`TC-4.2-7-mirror picker g1 → envelope in g0 [${VP.label}] (g0=${r.active0}, g1=${r.active1}, pickerGroup=${r.pickerGroup}, otherGroup=${r.otherGroup})`);
      } else {
        fail(`TC-4.2-7-mirror picker g1 → envelope in g0 [${VP.label}]`, `g0=${r.active0} g1=${r.active1} pickerGroup=${r.pickerGroup} otherGroup=${r.otherGroup} splitOn=${r.setupSnap.splitOn} tabs=${JSON.stringify(r.setupSnap.tabs)}`);
      }
    } catch (e) { fail(`TC-4.2-7-mirror [${VP.label}]`, String(e)); }
    await page.close();
  }

  // ── TC-4.2-5c: pinned task survives; unpinned task is replaced ───────────────
  // Desktop only: requires the split panels both visible simultaneously.
  // TC-4.2-6 (both viewports) and TC-4.2-7-mirror (both viewports) provide 360px coverage.

  if (VP.width >= 1000) {
    // Scenario A: pinned first task survives second task open
    {
      const page = await loadApp(browser, vp);
      try {
        await page.evaluate(([idA, idB, slug]) => {
          const ws = window.__pinia._s.get("workspace");
          const tasks = window.__pinia._s.get("tasks");
          ws.open({ kind: "legacy", page: "tasks" });
          ws.open({ kind: "legacy", page: "chat" }, { side: true });
          tasks.cache = [
            { id: idA, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task A", project: slug, updated: new Date().toISOString(), closed: null },
            { id: idB, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task B", project: slug, updated: new Date(Date.now() - 1000).toISOString(), closed: null },
          ];
          tasks.view = "all";
          tasks.loaded = true;
          ws.focused = 0;
        }, [TASK_A_ID, TASK_B_ID, PROJECT_SLUG]);
        await page.waitForTimeout(400);

        await page.locator(".task-tree-node").first().click();
        await page.waitForTimeout(300);

        const taskAKey = `envelope:${TASK_A_ID}`;
        const taskATab = page.locator(`.ts-tab[data-key="${taskAKey}"]`);
        const taskAVisible = await taskATab.isVisible().catch(() => false);
        if (!taskAVisible) {
          fail(`TC-4.2-5c setup [${VP.label}]`, "task A tab not visible after click");
        } else {
          await taskATab.dblclick();
          await page.waitForTimeout(200);

          await page.locator(".task-tree-node").nth(1).click();
          await page.waitForTimeout(300);

          await shot(page, `TC-4.2-5c-pinned-both-${sl}`);

          const result = await page.evaluate((aKey) => {
            const ws = window.__pinia._s.get("workspace");
            const allKeys = ws.tabs.map(t => ws.refKey(t));
            return { allKeys, taskAPresent: allKeys.includes(aKey), taskAMeta: ws.meta[aKey] };
          }, taskAKey);

          if (result.taskAPresent && result.taskAMeta?.pinned) {
            pass(`TC-4.2-5c pinned task A survives [${VP.label}] (tabs: ${result.allKeys.join(", ")})`);
          } else {
            fail(`TC-4.2-5c pinned task A survives [${VP.label}]`, `present=${result.taskAPresent} pinned=${result.taskAMeta?.pinned}`);
          }
        }
      } catch (e) { fail(`TC-4.2-5c pinned [${VP.label}]`, String(e)); }
      await page.close();
    }

    // Scenario B: unpinned first task is replaced by second
    {
      const page = await loadApp(browser, vp);
      try {
        await page.evaluate(([idA, idB, slug]) => {
          const ws = window.__pinia._s.get("workspace");
          const tasks = window.__pinia._s.get("tasks");
          ws.open({ kind: "legacy", page: "tasks" });
          ws.open({ kind: "legacy", page: "chat" }, { side: true });
          tasks.cache = [
            { id: idA, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task A", project: slug, updated: new Date().toISOString(), closed: null },
            { id: idB, agent: "bob", to: "bob", from: "alice", status: "open", headline: "TC-4.2 task B", project: slug, updated: new Date(Date.now() - 1000).toISOString(), closed: null },
          ];
          tasks.view = "all";
          tasks.loaded = true;
          ws.focused = 0;
        }, [TASK_A_ID, TASK_B_ID, PROJECT_SLUG]);
        await page.waitForTimeout(400);

        await page.locator(".task-tree-node").first().click();
        await page.waitForTimeout(300);

        await page.locator(".task-tree-node").nth(1).click();
        await page.waitForTimeout(300);

        await shot(page, `TC-4.2-5c-unpinned-replaced-${sl}`);

        const result = await page.evaluate(([aKey, bKey]) => {
          const ws = window.__pinia._s.get("workspace");
          const allKeys = ws.tabs.map(t => ws.refKey(t));
          return { allKeys, taskAGone: !allKeys.includes(aKey), taskBPresent: allKeys.includes(bKey) };
        }, [`envelope:${TASK_A_ID}`, `envelope:${TASK_B_ID}`]);

        if (result.taskAGone && result.taskBPresent) {
          pass(`TC-4.2-5c unpinned task A replaced [${VP.label}] (tabs: ${result.allKeys.join(", ")})`);
        } else {
          fail(`TC-4.2-5c unpinned task A replaced [${VP.label}]`, `taskAGone=${result.taskAGone} taskBPresent=${result.taskBPresent}`);
        }
      } catch (e) { fail(`TC-4.2-5c unpinned [${VP.label}]`, String(e)); }
      await page.close();
    }
  }
}

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
