// EV-envelopeview.spec.mjs — Phase 3.2 step 5: EnvelopeView specs EV1–EV7
//
// EV1: TierSection .db-tier-row click → workspace.open({kind:"envelope"}) — NOT legacy:tasks
// EV2: Task/Report tabs toggle; .task-panel-next stripped; 3 delegations wired in DOM
// EV3: [data-ev-action="done-reading"] fires POST /api/tasks/<id>/close with correct body;
//      fixture envelope gains closed:{} on disk; fixture restored after assertion
// EV4: "Open in Tasks" footer button → legacy:tasks tab
// EV5: Prefetched card visible on first paint; no loading placeholder shown
// EV6: TSK-FX-0005 (no reportPath) — Task card renders, Report pane shows "No report yet";
//      /report/TSK-FX-0005 deep link → envelope: tab in Task sub-view (not Report)
// EV7: Tab label shows headline from chain data, not raw task id
//
// Mutation proof (MUTATION=1):
//   Revert TierSection to pendingTaskId + ws.open(legacy:tasks) → EV1 fails.
//
// Harness: test server at :4634, /api/* proxied to fixture daemon at :4636 (fixture-ws).
//          NO page.route() mocks. Every API call goes to the real fixture handler.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4634 \
//   node tests/ui/phase3.2/EV-envelopeview.spec.mjs
//
// Prerequisite: test server started:
//   cd repos/caravel
//   bun run src/ui/test-server.ts start --port 4634 --daemon http://127.0.0.1:4636 --ttl 0

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4634").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/ev-envelopeview${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

// Fixture workspace path (relative to repo root, resolved from __dirname which is tests/ui/phase3.2)
const FIXTURE_WS = resolve(__dirname, "../phase3/fixture-ws");
const FX_0006_PATH = join(FIXTURE_WS, "agents/agent-beta/tasks/done/TSK-FX-0006.yaml");

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

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
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Wait for the real attention API to populate the reports tier.
      // Row limit is 3; use the first visible row (TSK-FX-RECUR / TSK-FX-0001 / TSK-FX-0002).
      await page.waitForSelector("#dashboard-attention-tiers", { timeout: 6000 }).catch(() => {});
      await page.waitForSelector('[data-tier="reports"] .task-tree-node', { timeout: 12000 }).catch(() => {});

      await page.screenshot({ path: join(SHOTS_DIR, `EV1-before-click-${VP.label}.png`) });

      // Read the first visible reports-tier row's task id before clicking
      const clickedTaskId = await page.locator('[data-tier="reports"] .task-tree-node').first()
        .getAttribute("data-task-id").catch(() => null);

      if (!clickedTaskId) {
        fail(`EV1 reports tier row not found [${VP.label}]`, "attention API didn't return the row in time");
        await ctx.close(); continue;
      }

      await page.locator('[data-tier="reports"] .task-tree-node').first().click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const envelopeTab = (afterState?.tabs || []).find(t => t.kind === "envelope" && t.taskId === clickedTaskId);

      if (envelopeTab) {
        pass(`EV1 TierSection row opens envelope:${clickedTaskId} tab [${VP.label}]`);
      } else {
        const kinds = (afterState?.tabs || []).map(t => `${t.kind}:${t.taskId ?? t.page ?? ""}`).join(", ");
        fail(`EV1 TierSection row opens envelope: tab [${VP.label}]`, `tabs after click: [${kinds}]`);
      }

      await page.screenshot({ path: join(SHOTS_DIR, `EV1-after-click-${VP.label}.png`) });
      await ctx.close();
    }

    // ── EV2: Tab bar, stripped forms, three delegations ───────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      // Wait for real API response — chain data for TSK-FX-0006
      await page.waitForFunction(
        () => {
          const pane = document.querySelector(".ev-pane");
          if (!pane) return false;
          const text = (pane.textContent || "").trim();
          return text.length > 0 && !text.includes("No chain data.");
        },
        { timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(200);

      await page.screenshot({ path: join(SHOTS_DIR, `EV2-task-tab-${VP.label}.png`) });

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

      const doneReadingCount = await page.locator("[data-ev-action='done-reading']").count();
      const openFileCount = await page.locator(".ev-root [data-open-file]").count();
      if (doneReadingCount > 0) {
        pass(`EV2 [data-ev-action="done-reading"] button present [${VP.label}]`);
      } else {
        fail(`EV2 [data-ev-action="done-reading"] button present [${VP.label}]`, "none found in task pane");
      }
      if (openFileCount > 0) {
        pass(`EV2 [data-open-file] delegation present [${VP.label}]`);
      } else {
        fail(`EV2 [data-open-file] delegation present [${VP.label}]`, "none found — envelopePath link missing");
      }

      await reportTabBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(SHOTS_DIR, `EV2-report-tab-${VP.label}.png`) });

      // EnvelopeView uses v-if/v-else-if/v-else — panes are removed from DOM, not hidden.
      // After clicking Report tab: the task pane (v-else-if) is removed → exactly 1 .ev-pane remains.
      const paneCountAfterReport = await page.locator(".ev-pane").count();
      if (paneCountAfterReport === 1) {
        pass(`EV2 Report tab switches pane visibility [${VP.label}]`);
      } else {
        fail(`EV2 Report tab switches pane visibility [${VP.label}]`, `Expected 1 .ev-pane after report tab click, got ${paneCountAfterReport}`);
      }

      await ctx.close();
    }

    // ── EV3: done-reading fires POST /close; fixture envelope gains closed:{} ─
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Snapshot the fixture envelope before the close call
      const yamlBefore = readFileSync(FX_0006_PATH, "utf8");
      const hasClosedBefore = yamlBefore.includes("closed:");

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      await page.waitForFunction(
        () => {
          const pane = document.querySelector(".ev-pane");
          if (!pane) return false;
          const text = (pane.textContent || "").trim();
          return text.length > 0 && !text.includes("No chain data.");
        },
        { timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(200);

      await page.screenshot({ path: join(SHOTS_DIR, `EV3-before-done-${VP.label}.png`) });

      const doneBtn = page.locator("[data-ev-action='done-reading']").first();
      const doneBtnCount = await doneBtn.count();
      if (doneBtnCount === 0) {
        fail(`EV3 [data-ev-action="done-reading"] button present [${VP.label}]`, "button not found; envelope may already be closed");
        await ctx.close();
        // Restore fixture unconditionally so later runs work
        if (!yamlBefore.includes("closed:")) writeFileSync(FX_0006_PATH, yamlBefore);
        continue;
      }
      pass(`EV3 [data-ev-action="done-reading"] button found [${VP.label}]`);

      // Fire the click via dispatchEvent — Vue @click handler fires on DOM click
      await page.evaluate(() => {
        const btn = document.querySelector("[data-ev-action='done-reading']");
        if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForTimeout(600);

      await page.screenshot({ path: join(SHOTS_DIR, `EV3-after-done-${VP.label}.png`) });

      // Verify fixture envelope on disk gained closed:{} — the real handler wrote it
      const yamlAfter = readFileSync(FX_0006_PATH, "utf8");
      const hasClosedAfter = yamlAfter.includes("closed:");

      if (!hasClosedBefore && hasClosedAfter) {
        pass(`EV3 fixture envelope gained closed:{} on disk after POST /close [${VP.label}]`);
      } else if (hasClosedBefore) {
        fail(`EV3 fixture envelope was already closed before test [${VP.label}]`, "fixture state was dirty — reset needed");
      } else {
        fail(`EV3 fixture envelope gained closed:{} on disk [${VP.label}]`, "closed: section not written by handler");
      }

      // Restore fixture so subsequent spec runs (and other EV tests) work cleanly
      writeFileSync(FX_0006_PATH, yamlBefore);

      // Wait for the daemon to reprocess the restore: the file-watcher invalidates
      // chain caches when TSK-FX-0006.yaml changes. EV6 opens a fresh WS connection;
      // if that connection arrives while chain recomputation is in flight, the pane
      // shows "No chain data." for the full waitForFunction window. Polling here
      // blocks EV4+ until the daemon's chain for TSK-FX-0005 settles.
      {
        const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
          try {
            const r = await fetch(`${BASE}/api/tasks/TSK-FX-0005`, { signal: AbortSignal.timeout(2000) });
            const d = await r.json();
            if (d?.chain?.task) break;
          } catch { /* not yet */ }
          await new Promise((res) => setTimeout(res, 500));
        }
      }

      await ctx.close();
    }

    // ── EV4: "Open in Tasks" footer → legacy:tasks tab ───────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
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
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Prefetch TSK-FX-0006 via live.prefetch() — fetch goes to the real fixture API
      await page.evaluate(() => {
        try {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const live = pinia?._s?.get("live");
          if (!live) return;
          live.prefetch("task:TSK-FX-0006", {
            topics: ["tasks"],
            fetch: async () => {
              const r = await fetch("/api/tasks/TSK-FX-0006");
              return r.ok ? r.json() : null;
            },
          });
        } catch (_) {}
      });
      // Give the prefetch time to complete before opening the tab
      await page.waitForTimeout(800);

      // Open the envelope tab — should use prefetched data
      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});

      // Give just 150ms — loading placeholder should NOT appear if cache hit
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(SHOTS_DIR, `EV5-first-paint-${VP.label}.png`) });

      const noChainCount = await page.locator(".ev-pane").first().locator("text=No chain data.").count().catch(() => 0);
      if (noChainCount === 0) {
        pass(`EV5 no "No chain data." placeholder — prefetch cache hit [${VP.label}]`);
      } else {
        fail(`EV5 no "No chain data." placeholder [${VP.label}]`, "placeholder shown despite prefetch — cache miss");
      }

      // EnvelopeView renders .ev-sections (not legacy .task-panel-card from viewer.ts)
      const cardCount = await page.locator(".ev-pane .ev-sections, .ev-pane .ev-section, .ev-pane .ev-closed-banner").count().catch(() => 0);
      if (cardCount > 0) {
        pass(`EV5 task card rendered immediately after prefetch [${VP.label}]`);
      } else {
        fail(`EV5 task card rendered immediately after prefetch [${VP.label}]`, "no .ev-sections found in task pane after prefetch");
      }

      await ctx.close();
    }

    // ── EV6: Open task (TSK-FX-0005) — Task card + no-report; /report/ deep link
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0005" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      await page.waitForFunction(
        () => {
          const pane = document.querySelector(".ev-pane");
          if (!pane) return false;
          const text = (pane.textContent || "").trim();
          return text.length > 0 && !text.includes("No chain data.");
        },
        { timeout: 20000 }
      ).catch(() => {});
      await page.waitForTimeout(200);

      await page.screenshot({ path: join(SHOTS_DIR, `EV6-task-pane-${VP.label}.png`) });

      // Task sub-view active by default (no reportPath → no auto-switch)
      const taskTabActive = await page.locator(".ev-tab.is-active").first().innerText().catch(() => "");
      if (taskTabActive.trim() === "Task") {
        pass(`EV6 Task sub-view active by default for open task [${VP.label}]`);
      } else {
        fail(`EV6 Task sub-view active by default [${VP.label}]`, `active tab: "${taskTabActive.trim()}"`);
      }

      // Task pane has real card content
      const taskPaneText = await page.locator(".ev-pane").first().innerText().catch(() => "");
      if (taskPaneText && !taskPaneText.includes("No chain data.")) {
        pass(`EV6 Task pane renders task card for TSK-FX-0005 [${VP.label}]`);
      } else {
        fail(`EV6 Task pane renders task card [${VP.label}]`, `pane text: "${taskPaneText.slice(0, 80)}"`);
      }

      // Switch to Report tab — "No report yet" placeholder
      await page.locator(".ev-tab").nth(1).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS_DIR, `EV6-report-pane-no-report-${VP.label}.png`) });

      // With v-if, task pane is removed from DOM when Report tab is active → .first() is the report pane
      const reportPaneText = await page.locator(".ev-pane").first().innerText().catch(() => "");
      if (reportPaneText.includes("No report yet for this task.")) {
        pass(`EV6 Report pane shows "No report yet" for open task [${VP.label}]`);
      } else {
        fail(`EV6 Report pane shows "No report yet" [${VP.label}]`, `got: "${reportPaneText.slice(0, 80)}"`);
      }

      // EV6b: /report/ deep link → envelope: tab in Task sub-view
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
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "TSK-FX-0006" })`);
      await page.waitForSelector(".ev-root", { timeout: 5000 }).catch(() => {});
      // Wait until the TabStrip label resolves to the headline (not the raw task id).
      // TabStrip reads from live.entry("task:TSK-FX-0006").data.chain.task.headline via
      // the real per-task API call; poll until the span text is no longer the plain id.
      await page.waitForFunction(
        () => {
          const tab = document.querySelector("[data-key*='TSK-FX-0006']");
          if (!tab) return false;
          const span = tab.querySelector(".ts-tab-label");
          if (!span) return false;
          const text = span.textContent?.trim() ?? "";
          return text.length > 0 && !text.includes("TSK-FX-0006");
        },
        { timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(100);

      await page.screenshot({ path: join(SHOTS_DIR, `EV7-tab-label-${VP.label}.png`) });

      const tabLabel = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".ts-tab"));
        for (const tab of tabs) {
          const key = tab.getAttribute("data-key") || "";
          if (key.includes("TSK-FX-0006")) {
            return tab.querySelector(".ts-tab-label")?.textContent?.trim() ?? "";
          }
        }
        return "";
      });

      if (tabLabel && tabLabel.includes("Fixture:") && !tabLabel.includes("TSK-FX-0006")) {
        pass(`EV7 tab label shows headline not id [${VP.label}]: "${tabLabel}"`);
      } else if (tabLabel && tabLabel.startsWith("Fixture:")) {
        pass(`EV7 tab label shows headline [${VP.label}]: "${tabLabel}"`);
      } else {
        fail(`EV7 tab label shows headline not id [${VP.label}]`, `got: "${tabLabel}" (expected "Fixture: beta agent completed review")`);
      }

      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
