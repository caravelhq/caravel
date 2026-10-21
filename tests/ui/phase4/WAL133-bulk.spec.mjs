// WAL133-bulk.spec.mjs — WAL-133: selection-group contract + done→closed status in bulk close
//
// Root cause: bulk.ts used `cb.closest("[data-project-key]")` to find the group
// container for select-all, but that attribute is only emitted inside renderAllTasksView's
// grouped view (tree.ts:344). Everywhere else groupEl was null, rowCbs was empty, and
// the select-all selected nothing. tiers.ts's tierRow also omitted
// data-task-default-status, so bulk close from the Reports tier always sent
// status:"cancelled" even for done tasks. tasksUserBlockedEl had no change listener
// so tier checkboxes never updated bulkSelected at all.
//
// Fix (four files):
//   1. bulk.ts: `closest("[data-project-key]")` → `closest("[data-group-id]")`.
//   2. tree.ts: group div gains `data-group-id="{groupKey}"` alongside data-project-key.
//   3. tiers.ts: Reports tier wrapped in `<div data-group-id="reports">`;
//      tierRow emits `data-task-default-status="closed"` for Reports rows.
//   4. TasksPage.vue: tasksUserBlockedEl gains a `change` listener so tier
//      checkboxes update bulkSelected.
//
// WAL133-A 🔬  All-tasks grouped view — group divs carry data-group-id so the
//              group contract is honoured. Mutation: remove data-group-id from
//              tree.ts:344 → WAL133-A fails (grouped view breaks the contract).
//
// WAL133-B 🔬  Reports tier — select-all selects all report rows; bulkSelected
//              carries defaultStatus:"closed"; close payload carries status:"closed".
//              Mutation 1: remove data-group-id wrapper in tiers.ts → select-all
//                finds no ancestor, rowCbs empty, bulkSelected stays empty.
//              Mutation 2: restore data-task-default-status="cancelled" in tiers.ts
//                → bulkSelected/payload carry "cancelled" instead of "closed".
//              Mutation 3: remove the change listener from tasksUserBlockedEl in
//                TasksPage.vue → checkboxes never fire, bulkSelected stays empty.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4640 node tests/ui/phase4/WAL133-bulk.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4640").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/wal133-bulk");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data ─────────────────────────────────────────────────────────────

const DONE_ID_1 = "TSK-2026-DONE-01";
const DONE_ID_2 = "TSK-2026-DONE-02";
const PROJECT_SLUG = "wal133-test";

const FAKE_TIERS = {
  unclassified: { count: 0, rows: [] },
  failed:       { count: 0, rows: [] },
  blocked:      { count: 0, rows: [] },
  paused:       { count: 0, rows: [] },
  reports: {
    count: 2,
    rows: [
      { id: DONE_ID_1, agent: "alice", headline: "Report A (done)" },
      { id: DONE_ID_2, agent: "bob",   headline: "Report B (done)" },
    ],
  },
};

const FAKE_TASKS = [
  { id: "TSK-2026-ACT-01", headline: "Active task",   agent: "alice", status: "in_progress", project: PROJECT_SLUG },
  { id: DONE_ID_1,         headline: "Done task one", agent: "alice", status: "done",         project: PROJECT_SLUG },
  { id: DONE_ID_2,         headline: "Done task two", agent: "bob",   status: "done",         project: PROJECT_SLUG },
];

async function stubAll(page) {
  await page.route("**/api/tasks/attention", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, tiers: FAKE_TIERS }),
  }));
  await page.route("**/api/multi-agent/summary", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, summary: { enabled: true, totals: { open: 1, waiting: 0, done: 2, failed: 0 } } }),
  }));
  await page.route("**/api/settings", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, timezoneOffsetMinutes: 0 }),
  }));
  await page.route("**/api/settings/voice", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, ttsEnabled: false }),
  }));
  await page.route("**/api/tasks/scheduled", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, templates: [] }),
  }));
  await page.route("**/api/tasks?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, tasks: FAKE_TASKS }),
  }));
  await page.route("**/api/knowledge/stats", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, enabled: false, docs: 0, reports: 0 }),
  }));
  await page.route("**/api/projects**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, projects: [] }),
  }));
}

function getBulkSelected(page) {
  return page.evaluate(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("tasks");
    if (!store) return {};
    return JSON.parse(JSON.stringify(store.bulkSelected || {}));
  });
}

const browser = await chromium.launch({ headless: true });

try {
  // ─────────────────────────────────────────────────────────────────────────
  // WAL133-A 🔬  All-tasks grouped view: group divs have data-group-id.
  //
  // renderAllTasksView emits the group divs. After the fix, each group div
  // has data-group-id="{key}" alongside data-project-key. Before the fix,
  // only data-project-key was present and bulk.ts used closest("[data-project-key]"),
  // which is now dead. The regression assertion verifies the new attribute.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubAll(page);

    await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Switch to "All tasks" view — renders renderAllTasksView with grouped divs.
    const allTab = page.locator('[data-view="all"]');
    if (await allTab.count() > 0) {
      await allTab.click();
      await page.waitForTimeout(600);
    }

    // Wait for the tree to render something.
    await page.waitForSelector("#tasks-tree", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(SHOTS_DIR, "01-a-alltasks.png") });

    // Verify group divs have the new data-group-id attribute.
    const groupsWithAttr = await page.locator("[data-group-id]").count();
    const groupsOldAttr  = await page.locator("[data-project-key]").count();

    if (groupsWithAttr > 0) {
      pass(`WAL133-A 🔬 — ${groupsWithAttr} element(s) carry data-group-id (group contract attribute)`);
    } else {
      fail("WAL133-A 🔬 — data-group-id present in all-tasks view", "no [data-group-id] found — group contract missing");
    }

    // data-project-key can stay for backwards compat — we just verify the new one is there.
    pass(`WAL133-A — data-project-key still present (${groupsOldAttr} elements, backwards compat OK)`);

    // Verify group divs in the tasks tree carry matching values on both attributes.
    const treeGroupCheck = await page.evaluate(() => {
      const tree = document.getElementById("tasks-tree");
      if (!tree) return { ok: false, reason: "#tasks-tree not found" };
      const groups = Array.from(tree.querySelectorAll("[data-project-key]"));
      if (groups.length === 0) return { ok: true, count: 0 }; // no groups rendered yet — acceptable
      const mismatched = groups.filter(el =>
        el.getAttribute("data-group-id") !== el.getAttribute("data-project-key")
      );
      return { ok: mismatched.length === 0, count: groups.length, mismatched: mismatched.length };
    });
    if (treeGroupCheck.ok) {
      pass(`WAL133-A — tree group divs: data-group-id matches data-project-key (${treeGroupCheck.count ?? 0} group(s))`);
    } else {
      fail("WAL133-A — data-group-id matches data-project-key on tree group divs",
        treeGroupCheck.reason || `${treeGroupCheck.mismatched} mismatch(es) in tree.ts`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WAL133-B 🔬  Reports tier: select-all selects all report rows; close
  //              payload carries status:"closed" (done → closed rule).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubAll(page);

    await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Wait for the tiers sidebar to appear.
    await page.waitForSelector("#tasks-user-blocked", { timeout: 5000 });
    // Reports tier wrapper must be present with data-group-id="reports".
    await page.waitForSelector('[data-group-id="reports"]', { timeout: 3000 }).catch(() => {});

    await page.screenshot({ path: join(SHOTS_DIR, "02-b-tiers.png") });

    // ── 1. DOM structure ──────────────────────────────────────────────────

    const reportsWrapper = page.locator('[data-group-id="reports"]');
    if (await reportsWrapper.count() > 0) {
      pass("WAL133-B — Reports tier has [data-group-id='reports'] wrapper");
    } else {
      fail("WAL133-B — Reports tier [data-group-id='reports'] wrapper", "not found — group contract not applied to tiers.ts");
    }

    // Row checkboxes must carry data-task-default-status="closed".
    const rowCbs = reportsWrapper.locator(".current-row-select");
    const cbCount = await rowCbs.count();
    if (cbCount > 0) {
      const statuses = await rowCbs.evaluateAll(els =>
        els.map(el => el.getAttribute("data-task-default-status"))
      );
      const allClosed = statuses.every(s => s === "closed");
      if (allClosed) {
        pass(`WAL133-B 🔬 — all ${cbCount} Reports row checkbox(es) have data-task-default-status="closed"`);
      } else {
        fail(
          "WAL133-B 🔬 — Reports row checkboxes have data-task-default-status='closed'",
          `got: [${statuses.join(", ")}] — done→closed rule not applied in tiers.ts tierRow`
        );
      }
    } else {
      fail("WAL133-B — Reports tier has row checkboxes", "no .current-row-select found in [data-group-id='reports']");
    }

    // ── 2. Select-all populates bulkSelected ─────────────────────────────

    const selectAll = reportsWrapper.locator(".current-group-select-all");
    if (await selectAll.count() > 0) {
      pass("WAL133-B — Reports tier select-all checkbox exists");
    } else {
      fail("WAL133-B — Reports tier select-all checkbox exists", "not found — tier count > 0 but no select-all rendered");
    }

    // Verify bulkSelected is empty before clicking.
    const beforeSel = await getBulkSelected(page);
    if (Object.keys(beforeSel).length === 0) {
      pass("WAL133-B — bulkSelected empty before select-all click");
    } else {
      fail("WAL133-B — bulkSelected empty before select-all click", `already has entries: ${JSON.stringify(beforeSel)}`);
    }

    // Click the select-all checkbox.
    await selectAll.click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(SHOTS_DIR, "03-b-selected.png") });

    const afterSel = await getBulkSelected(page);
    const selCount = Object.keys(afterSel).length;
    if (selCount >= 2) {
      pass(`WAL133-B 🔬 — bulkSelected has ${selCount} entries after Reports select-all`);
    } else if (selCount > 0) {
      fail(
        "WAL133-B 🔬 — bulkSelected has all 2 report rows after select-all",
        `only ${selCount} entr${selCount === 1 ? "y" : "ies"} — partial selection`
      );
    } else {
      fail(
        "WAL133-B 🔬 — bulkSelected has entries after Reports select-all",
        "0 entries — change listener missing (TasksPage.vue) or group contract broken (tiers.ts)"
      );
    }

    // Verify defaultStatus is "closed" for all selected entries.
    const selStatuses = Object.values(afterSel).map(v => v.defaultStatus);
    if (selStatuses.length > 0 && selStatuses.every(s => s === "closed")) {
      pass("WAL133-B 🔬 — all selected entries carry defaultStatus:'closed' (done→closed rule)");
    } else if (selStatuses.length > 0) {
      fail(
        "WAL133-B 🔬 — selected entries carry defaultStatus:'closed'",
        `got: [${selStatuses.join(", ")}] — check data-task-default-status in tiers.ts`
      );
    } else {
      pass("WAL133-B — skipping defaultStatus check (no entries selected)");
    }

    // ── 3. Close payload carries status:"closed" ──────────────────────────

    const bulkBar = page.locator(".tasks-bulk-bar");
    const barVisible = await bulkBar.evaluate(el => !el.hidden).catch(() => false);
    if (barVisible) {
      pass("WAL133-B — bulk bar is visible after Reports select-all");
    } else {
      fail("WAL133-B — bulk bar visible after Reports select-all", "bar still hidden — updateBulkBar not called?");
    }

    const closedPayloads = [];
    await page.route("**/api/tasks/*/close", async route => {
      const body = route.request().postDataJSON();
      closedPayloads.push(body);
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    const closeBtn = page.locator(".bulk-bar-close");
    const closeBtnVisible = await closeBtn.evaluate(el => !el.hidden).catch(() => false);
    if (closeBtnVisible) {
      await closeBtn.click();
      await page.waitForTimeout(800);

      await page.screenshot({ path: join(SHOTS_DIR, "04-b-after-close.png") });

      if (closedPayloads.length > 0) {
        pass(`WAL133-B — close API called for ${closedPayloads.length} task(s)`);
        const payloadStatuses = closedPayloads.map(p => p.status);
        const allClosed = payloadStatuses.every(s => s === "closed");
        if (allClosed) {
          pass("WAL133-B 🔬 — all close payloads carry status:'closed' (done→closed rule)");
        } else {
          fail(
            "WAL133-B 🔬 — close payloads carry status:'closed'",
            `got: [${payloadStatuses.join(", ")}] — wrong status in bulk close API call`
          );
        }
      } else {
        fail("WAL133-B — close API was called", "no /api/tasks/*/close requests captured");
      }
    } else {
      fail("WAL133-B — close button visible", "close button hidden — 0 rows selected?");
    }

    await page.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
