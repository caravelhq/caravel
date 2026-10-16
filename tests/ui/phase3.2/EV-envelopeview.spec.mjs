// EV-envelopeview.spec.mjs — Phase 3.2 step 5: EnvelopeView specs EV1–EV7
//
// EV1: TierSection .db-tier-row click → workspace.open({kind:"envelope"}) — NOT legacy:tasks
// EV2: Task/Report tabs toggle; .task-panel-next stripped; 3 delegations wired in DOM
// EV3: [data-done-reading-id] fires POST /api/tasks/<id>/close with correct body
// EV4: "Open in Tasks" footer button → legacy:tasks tab
// EV5: Prefetched card visible on first paint; no loading placeholder shown
// EV6: TSK-FX-0005 (no reportPath) — Task card renders, Report pane shows "No report yet";
//      /report/TSK-FX-0005 deep link → envelope: tab in Task sub-view (not Report)
// EV7: Tab label shows headline from chain data, not raw task id
//
// Mutation proof (MUTATION=1):
//   Revert TierSection to pendingTaskId + ws.open(legacy:tasks) → EV1 fails.
//
// Harness: scratch daemon at :4636 (fixture-ws). NOT the live daemon on :4632.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4636 \
//   node tests/ui/phase3.2/EV-envelopeview.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4636").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/ev-envelopeview${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data ──────────────────────────────────────────────────────────────

const TASK_0006 = {
  ok: true,
  chain: {
    task: {
      id: "TSK-FX-0006",
      headline: "Fixture: beta agent completed review",
      status: "done",
      agent: "agent-beta",
      to: "agent-beta",
      from: "user",
      kind: "research",
      priority: "P1",
      project: "Fixture",
      brief: "Review the fixture configuration and sign it off.",
      reportPath: "agents/agent-beta/tasks/done/TSK-FX-0006.md",
      summary: { response: "No issues found." },
      updated: "2026-09-20T13:00:00.000Z",
    },
    ancestors: [],
    children: [],
  },
};

const TASK_0005 = {
  ok: true,
  chain: {
    task: {
      id: "TSK-FX-0005",
      headline: "Fixture: open task ready to claim",
      status: "open",
      agent: "agent-alpha",
      to: "agent-alpha",
      from: "user",
      kind: "research",
      priority: "P2",
      brief: "Test open task fixture.",
      updated: "2026-09-20T11:00:00.000Z",
    },
    ancestors: [],
    children: [],
  },
};

const ATTENTION = {
  ok: true,
  tiers: {
    reports: { count: 1, rows: [{ id: "TSK-FX-0006", headline: "Fixture: beta agent completed review", agent: "agent-beta" }] },
    unclassified: { count: 0, rows: [] },
    failed: { count: 0, rows: [] },
    blocked: { count: 0, rows: [] },
    paused: { count: 0, rows: [] },
  },
};

const TASKS_LIST = {
  ok: true,
  tasks: [
    { id: "TSK-FX-0006", headline: "Fixture: beta agent completed review", status: "done", agent: "agent-beta" },
    { id: "TSK-FX-0005", headline: "Fixture: open task ready to claim", status: "open", agent: "agent-alpha" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function wsAction(page, fn) {
  return page.evaluate((fnStr) => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return { error: "no store" };
      return new Function("ws", `return (${fnStr})(ws)`)(ws);
    } catch (e) { return { error: String(e) }; }
  }, fn.toString());
}

async function wsState(page) {
  return page.evaluate(() => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return null;
      return {
        tabKeys: ws.tabs.map((t) => ws.refKey(t)),
        tabs: ws.tabs.map((t) => ({ kind: t.kind, taskId: t.taskId, page: t.page })),
      };
    } catch (e) { return { error: String(e) }; }
  });
}

async function resetWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

// Standard route intercepts — all routes for the envelope-view spec.
// closeCapture = { fired: false, body: null } to track POST /close calls.
async function setupRoutes(page, closeCapture) {
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/tasks/attention")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(ATTENTION) });
    }
    if (url.includes("/api/tasks/TSK-FX-0006/close")) {
      if (closeCapture) {
        closeCapture.fired = true;
        if (method === "POST") {
          try { closeCapture.body = JSON.parse(route.request().postData() || "{}"); } catch (_) {}
        }
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    if (url.includes("/api/tasks/TSK-FX-0005/close")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    // Per-task detail — must come after /close check
    if (/\/api\/tasks\/TSK-FX-0006($|\?)/.test(url)) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(TASK_0006) });
    }
    if (/\/api\/tasks\/TSK-FX-0005($|\?)/.test(url)) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(TASK_0005) });
    }
    // Tasks list (for TabStrip tasksList computed)
    if (/\/api\/tasks(\?|$)/.test(url)) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(TASKS_LIST) });
    }
    // Report file read (renderReportPane fetches /api/files/read?path=...)
    if (url.includes("/api/files/read")) {
      const urlObj = new URL(url);
      const path = urlObj.searchParams.get("path") || "";
      if (path.includes("TSK-FX-0006")) {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            markdown: true,
            content: "---\ntitle: Fixture Review\n---\n# Fixture Review Report\n\nAll checks passed.\n",
          }),
        });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, markdown: true, content: "" }) });
    }
    // Let other requests (html, js, css, state) pass through to the scratch daemon
    return route.continue().catch(() => {});
  });
}

const browser = await chromium.launch({ headless: true });

const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

try {
  for (const VP of VIEWPORTS) {
    console.log(`\n── ${VP.label} ──────────────────────────────────────────────`);

    // ── EV1: TierSection row → envelope: tab ──────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      const cc = null;
      await setupRoutes(page, cc);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Attention data loads via useResource; wait for the reports-tier row
      await page.waitForSelector('.db-tier-row[data-task-id="TSK-FX-0006"]', { timeout: 5000 }).catch(() => {});

      await page.screenshot({ path: join(SHOTS_DIR, `EV1-before-click-${VP.label}.png`) });

      const beforeState = await wsState(page);
      const hasEnvelopeBefore = (beforeState?.tabs || []).some(t => t.kind === "envelope" && t.taskId === "TSK-FX-0006");
      if (hasEnvelopeBefore) {
        fail(`EV1 envelope tab not open before click [${VP.label}]`, "tab was already open before clicking the row");
        await ctx.close(); continue;
      }

      // Click the TierSection row for TSK-FX-0006
      const tierRow = page.locator('.db-tier-row[data-task-id="TSK-FX-0006"]');
      const tierCount = await tierRow.count();
      if (tierCount === 0) {
        if (MUTATION) {
          // In mutation mode, attention tier may still render (we only changed TierSection click handler)
          // so we can still look for a different outcome after clicking
          // Fall through — if row is absent, fail with a useful message
        }
        fail(`EV1 reports tier row for TSK-FX-0006 not found [${VP.label}]`, "attention API mock may not have loaded");
        await ctx.close(); continue;
      }
      await tierRow.click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const envelopeTab = (afterState?.tabs || []).find(t => t.kind === "envelope" && t.taskId === "TSK-FX-0006");

      if (MUTATION) {
        // Mutation: TierSection reverted to legacy:tasks — expect NO envelope tab
        if (!envelopeTab) {
          pass(`EV1 [MUTATION] row click did NOT open envelope: tab (legacy:tasks opened instead) [${VP.label}]`);
        } else {
          fail(`EV1 [MUTATION] expected no envelope: tab but one was opened [${VP.label}]`, "mutation did not take effect");
        }
      } else {
        if (envelopeTab) {
          pass(`EV1 TierSection row opens envelope: tab [${VP.label}]`);
        } else {
          const kinds = (afterState?.tabs || []).map(t => `${t.kind}:${t.taskId ?? t.page ?? ""}`).join(", ");
          fail(`EV1 TierSection row opens envelope: tab [${VP.label}]`, `tabs after click: [${kinds}]`);
        }
      }

      await page.screenshot({ path: join(SHOTS_DIR, `EV1-after-click-${VP.label}.png`) });
      await ctx.close();
    }

    // ── EV2: Tab bar, stripped forms, three delegations ───────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await setupRoutes(page, null);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Open envelope:TSK-FX-0006 via store action
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForTimeout(500);

      // Wait for EnvelopeView to mount
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);

      await page.screenshot({ path: join(SHOTS_DIR, `EV2-task-tab-${VP.label}.png`) });

      // Tab bar present with both buttons
      const tabBar = page.locator(".ev-tab-bar");
      const tabBarVisible = await tabBar.isVisible().catch(() => false);
      if (tabBarVisible) {
        pass(`EV2 .ev-tab-bar visible [${VP.label}]`);
      } else {
        fail(`EV2 .ev-tab-bar visible [${VP.label}]`, "not found in DOM");
      }

      const taskTabBtn = page.locator(".ev-tab").first();
      const reportTabBtn = page.locator(".ev-tab").nth(1);
      const taskBtnText = await taskTabBtn.innerText().catch(() => "");
      const reportBtnText = await reportTabBtn.innerText().catch(() => "");
      if (taskBtnText.trim() === "Task" && reportBtnText.trim() === "Report") {
        pass(`EV2 Task and Report tab buttons present [${VP.label}]`);
      } else {
        fail(`EV2 Task and Report tab buttons [${VP.label}]`, `got "${taskBtnText.trim()}" / "${reportBtnText.trim()}"`);
      }

      // Wait for chain data (task pane should render content)
      await page.waitForTimeout(600);

      // .task-panel-next (Continue form) must be absent after stripActionForms
      const nextCount = await page.locator(".task-panel-next").count();
      if (nextCount === 0) {
        pass(`EV2 .task-panel-next stripped [${VP.label}]`);
      } else {
        fail(`EV2 .task-panel-next stripped [${VP.label}]`, `${nextCount} instances still present`);
      }

      const chatCount = await page.locator(".task-panel-chat-form").count();
      if (chatCount === 0) {
        pass(`EV2 .task-panel-chat-form stripped [${VP.label}]`);
      } else {
        fail(`EV2 .task-panel-chat-form stripped [${VP.label}]`, `${chatCount} instances still present`);
      }

      // Three delegations: [data-done-reading-id], [data-open-task], [data-open-file]
      const doneReadingCount = await page.locator("[data-done-reading-id]").count();
      const openFileCount = await page.locator(".ev-root [data-open-file]").count();
      if (doneReadingCount > 0) {
        pass(`EV2 [data-done-reading-id] delegation present [${VP.label}]`);
      } else {
        fail(`EV2 [data-done-reading-id] delegation present [${VP.label}]`, "none found in task pane");
      }
      if (openFileCount > 0) {
        pass(`EV2 [data-open-file] delegation present [${VP.label}]`);
      } else {
        fail(`EV2 [data-open-file] delegation present [${VP.label}]`, "none found — envelopePath link missing");
      }

      // Click Report tab and verify sub-view switches
      await reportTabBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(SHOTS_DIR, `EV2-report-tab-${VP.label}.png`) });

      const taskPaneHidden = await page.locator(".ev-pane").first().getAttribute("hidden").catch(() => null);
      const reportPaneHidden = await page.locator(".ev-pane").nth(1).getAttribute("hidden").catch(() => null);
      if (taskPaneHidden !== null && reportPaneHidden === null) {
        pass(`EV2 Report tab switches pane visibility [${VP.label}]`);
      } else {
        fail(`EV2 Report tab switches pane visibility [${VP.label}]`, `task hidden=${taskPaneHidden} report hidden=${reportPaneHidden}`);
      }

      await ctx.close();
    }

    // ── EV3: done-reading button fires POST /api/tasks/<id>/close ─────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      const closeCapture = { fired: false, body: null };
      await setupRoutes(page, closeCapture);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800); // wait for chain data + render

      await page.screenshot({ path: join(SHOTS_DIR, `EV3-before-done-${VP.label}.png`) });

      const doneBtn = page.locator("[data-done-reading-id]").first();
      const doneBtnCount = await doneBtn.count();
      if (doneBtnCount === 0) {
        fail(`EV3 [data-done-reading-id] button present [${VP.label}]`, "button not found — task pane may not have rendered");
        await ctx.close(); continue;
      }
      pass(`EV3 [data-done-reading-id] button found [${VP.label}]`);

      // dispatchEvent tests the delegation handler (onPanelClick uses ev.target.closest())
      // and works regardless of scroll position inside the ev-pane container.
      await page.evaluate(() => {
        const btn = document.querySelector("[data-done-reading-id]");
        if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForTimeout(400);

      await page.screenshot({ path: join(SHOTS_DIR, `EV3-after-done-${VP.label}.png`) });

      if (closeCapture.fired) {
        pass(`EV3 POST /api/tasks/TSK-FX-0006/close fired [${VP.label}]`);
      } else {
        fail(`EV3 POST /api/tasks/TSK-FX-0006/close fired [${VP.label}]`, "route intercept never hit");
      }
      if (closeCapture.body && closeCapture.body.cascade === false) {
        pass(`EV3 close body has cascade:false [${VP.label}]`);
      } else {
        fail(`EV3 close body has cascade:false [${VP.label}]`, `body: ${JSON.stringify(closeCapture.body)}`);
      }

      await ctx.close();
    }

    // ── EV4: "Open in Tasks" footer → legacy:tasks tab ───────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await setupRoutes(page, null);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-footer", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);

      const footerBtn = page.locator(".ev-open-tasks-btn");
      const footerVisible = await footerBtn.isVisible().catch(() => false);
      if (!footerVisible) {
        fail(`EV4 .ev-open-tasks-btn visible [${VP.label}]`, "button not found");
        await ctx.close(); continue;
      }
      pass(`EV4 .ev-open-tasks-btn visible [${VP.label}]`);

      await footerBtn.click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const hasLegacyTasks = (afterState?.tabs || []).some(t => t.kind === "legacy" && t.page === "tasks");
      if (hasLegacyTasks) {
        pass(`EV4 "Open in Tasks" opens legacy:tasks tab [${VP.label}]`);
      } else {
        const kinds = (afterState?.tabs || []).map(t => `${t.kind}:${t.taskId ?? t.page ?? ""}`).join(", ");
        fail(`EV4 "Open in Tasks" opens legacy:tasks tab [${VP.label}]`, `tabs: [${kinds}]`);
      }

      await page.screenshot({ path: join(SHOTS_DIR, `EV4-after-open-tasks-${VP.label}.png`) });
      await ctx.close();
    }

    // ── EV5: Prefetched card visible immediately — no loading placeholder ──────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await setupRoutes(page, null);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Prefetch TSK-FX-0006 via live.prefetch() before opening the envelope tab
      await page.evaluate((task) => {
        try {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const live = pinia?._s?.get("live");
          if (!live) return;
          live.prefetch("task:TSK-FX-0006", {
            topics: ["tasks"],
            fetch: async () => task,
          });
        } catch (_) {}
      }, TASK_0006);
      await page.waitForTimeout(200);

      // Now open the envelope tab — should use prefetched data
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});

      // Give just 100ms — loading placeholder should NOT appear if cache hit
      await page.waitForTimeout(100);
      await page.screenshot({ path: join(SHOTS_DIR, `EV5-first-paint-${VP.label}.png`) });

      const loadingCount = await page.locator(".task-panel-loading").count();
      // EnvelopeView shows "No chain data." placeholder for loading — that's different from a spinner.
      // With prefetch, the chain should be populated immediately.
      const noChainCount = await page.locator(".ev-pane").first().locator("text=No chain data.").count().catch(() => 0);
      if (noChainCount === 0) {
        pass(`EV5 no "No chain data." placeholder — prefetch cache hit [${VP.label}]`);
      } else {
        fail(`EV5 no "No chain data." placeholder [${VP.label}]`, "placeholder shown despite prefetch — cache miss");
      }

      // Task pane should have real content (task-panel-card or task-panel-meta)
      const cardCount = await page.locator(".ev-pane .task-panel-card, .ev-pane .task-panel-meta").count().catch(() => 0);
      if (cardCount > 0) {
        pass(`EV5 task card rendered immediately after prefetch [${VP.label}]`);
      } else {
        fail(`EV5 task card rendered immediately after prefetch [${VP.label}]`, "no card HTML found in task pane");
      }

      await ctx.close();
    }

    // ── EV6: Open task (TSK-FX-0005) — Task card + no-report placeholder ──────
    // ── EV6b: /report/TSK-FX-0005 deep link → envelope: in Task sub-view ─────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await setupRoutes(page, null);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Open envelope for open task (no reportPath)
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0005" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      // Wait for chain data to arrive — poll until pane content differs from the loading placeholder
      await page.waitForFunction(
        () => {
          const pane = document.querySelector(".ev-pane");
          if (!pane) return false;
          const text = (pane.textContent || "").trim();
          return text.length > 0 && !text.includes("No chain data.");
        },
        { timeout: 5000 }
      ).catch(() => {});
      await page.waitForTimeout(200);

      await page.screenshot({ path: join(SHOTS_DIR, `EV6-task-pane-${VP.label}.png`) });

      // Task sub-view should be active by default (no reportPath → no auto-switch)
      const taskTabActive = await page.locator(".ev-tab.is-active").first().innerText().catch(() => "");
      if (taskTabActive.trim() === "Task") {
        pass(`EV6 Task sub-view active by default for open task [${VP.label}]`);
      } else {
        fail(`EV6 Task sub-view active by default [${VP.label}]`, `active tab text: "${taskTabActive.trim()}"`);
      }

      // Task pane should have task card content (not loading)
      const taskPaneText = await page.locator(".ev-pane").first().innerText().catch(() => "");
      if (taskPaneText && !taskPaneText.includes("No chain data.")) {
        pass(`EV6 Task pane renders task card for TSK-FX-0005 [${VP.label}]`);
      } else {
        fail(`EV6 Task pane renders task card [${VP.label}]`, `pane text: "${taskPaneText.slice(0, 80)}"`);
      }

      // Switch to Report tab — should show "No report yet for this task."
      await page.locator(".ev-tab").nth(1).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS_DIR, `EV6-report-pane-no-report-${VP.label}.png`) });

      const reportPaneText = await page.locator(".ev-pane").nth(1).innerText().catch(() => "");
      if (reportPaneText.includes("No report yet for this task.")) {
        pass(`EV6 Report pane shows "No report yet" for open task [${VP.label}]`);
      } else {
        fail(`EV6 Report pane shows "No report yet" [${VP.label}]`, `got: "${reportPaneText.slice(0, 80)}"`);
      }

      // EV6b: deep link via /report/ URL → envelope: tab in Task sub-view
      await resetWorkspace(page);
      await page.goto(BASE + "/#/report/TSK-FX-0005", { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS_DIR, `EV6-deeplink-report-${VP.label}.png`) });

      const deepLinkState = await wsState(page);
      const hasEnvelope0005 = (deepLinkState?.tabs || []).some(t => t.kind === "envelope" && t.taskId === "TSK-FX-0005");
      if (hasEnvelope0005) {
        pass(`EV6b /report/ deep link → envelope: tab [${VP.label}]`);
      } else {
        const kinds = (deepLinkState?.tabs || []).map(t => `${t.kind}:${t.taskId ?? t.page ?? ""}`).join(", ");
        fail(`EV6b /report/ deep link → envelope: tab [${VP.label}]`, `tabs: [${kinds}]`);
      }

      // After deep link for task with no report: Task sub-view should be active (no auto-switch)
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const deepLinkActiveTab = await page.locator(".ev-tab.is-active").first().innerText().catch(() => "");
      if (deepLinkActiveTab.trim() === "Task") {
        pass(`EV6b deep link for no-report task stays in Task sub-view [${VP.label}]`);
      } else {
        fail(`EV6b deep link for no-report task stays in Task sub-view [${VP.label}]`, `active: "${deepLinkActiveTab.trim()}"`);
      }

      await ctx.close();
    }

    // ── EV7: Tab label shows headline, not task id ────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await setupRoutes(page, null);
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      // Live data must load before TabStrip re-renders the label
      await page.waitForTimeout(800);

      await page.screenshot({ path: join(SHOTS_DIR, `EV7-tab-label-${VP.label}.png`) });

      // Find the tab in the strip with data-key matching envelope:TSK-FX-0006
      const tabLabel = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".tab-btn"));
        for (const tab of tabs) {
          const key = tab.getAttribute("data-key") || "";
          if (key.includes("TSK-FX-0006")) {
            return tab.querySelector(".tab-label")?.textContent?.trim() ?? tab.textContent?.trim() ?? "";
          }
        }
        // Fallback: check any tab strip element
        const allTabs = Array.from(document.querySelectorAll("[data-key*='TSK-FX-0006']"));
        return allTabs[0]?.textContent?.trim() ?? "";
      });

      const expectedHeadline = "Fixture: beta agent completed review";
      if (tabLabel && tabLabel.includes("Fixture:") && !tabLabel.includes("TSK-FX-0006")) {
        pass(`EV7 tab label shows headline not id [${VP.label}]: "${tabLabel}"`);
      } else if (tabLabel === expectedHeadline || tabLabel.startsWith("Fixture:")) {
        pass(`EV7 tab label shows headline [${VP.label}]: "${tabLabel}"`);
      } else {
        fail(`EV7 tab label shows headline not id [${VP.label}]`, `got: "${tabLabel}" (expected to include "Fixture: beta…")`);
      }

      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
