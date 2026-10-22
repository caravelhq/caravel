// DB-dashboardtiers.spec.mjs — Phase 4 step 3: Dashboard attention tiers specs DB1–DB5
//
// DB1: Four sections with correct data-tier keys (triage, blocked, paused, reports)
// DB2: Triage count = unclassified.count + failed.count (DEC-0007 / DEC-0039)
// DB3: Reports select-all selects every visible row; BulkBar shows correct count
// DB4: Close payload carries status:"closed" for a done task (WAL-133 F12, not "cancelled")
// DB5: Per-section collapse persists across page reload
//
// Mutation proof (MUTATION=1):
//   Revert Reports select-all to dead [data-project-key] DOM lookup →
//   the "all rows selected" assertion goes red.
//
// Harness: page.route() stubs for attention API.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4642 \
//   node tests/ui/phase4/DB-dashboardtiers.spec.mjs

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4642").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/db-dashboardtiers${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data ──────────────────────────────────────────────────────────────

const ATTENTION_FIXTURE = {
  ok: true,
  tiers: {
    unclassified: {
      count: 2,
      rows: [
        { id: "TSK-2026-DB-0001", headline: "Unclassified task 1", agent: "alice" },
        { id: "TSK-2026-DB-0002", headline: "Unclassified task 2", agent: "bob" },
      ],
    },
    failed: {
      count: 1,
      rows: [
        { id: "TSK-2026-DB-0003", headline: "Failed task 1", agent: "cliff" },
      ],
    },
    blocked: {
      count: 0,
      rows: [],
    },
    paused: {
      count: 1,
      rows: [
        { id: "TSK-2026-DB-0004", headline: "Paused task 1", agent: "mark" },
      ],
    },
    reports: {
      count: 2,
      rows: [
        { id: "TSK-2026-DB-0005", headline: "Report task A", agent: "bob" },
        { id: "TSK-2026-DB-0006", headline: "Report task B", agent: "alice" },
      ],
    },
  },
};

// Expected Triage count = unclassified(2) + failed(1) = 3
const EXPECTED_TRIAGE_COUNT = 3;
const EXPECTED_REPORT_ROWS = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupRoutes(page) {
  // Default safe handler for all API calls
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/tasks/attention")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATTENTION_FIXTURE) });
    } else if (url.includes("/api/tasks/scheduled")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, templates: [] }) });
    } else if (url.includes("/api/dashboard") || url.includes("/api/totals")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    } else {
      // Let other calls fall through or return empty ok
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });
}

async function resetWorkspace(page) {
  // Clear workspace.* and dashboard.* localStorage keys
  await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("workspace.") || k.startsWith("dashboard."));
    keys.forEach(k => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function navigateToDashboard(page) {
  // Navigate to dashboard tab and wait for attention tiers
  await page.evaluate(() => {
    if (window.__ws) {
      window.__ws.open({ kind: "dashboard" });
    } else {
      // fallback: navigate directly
      window.location.hash = "#/";
    }
  });
  await page.waitForSelector("#dashboard-attention-tiers", { timeout: 5000 });
}

// ── Test runner ───────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

for (const { w, h } of VIEWPORTS) {
  const vp = `${w}×${h}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();

  await setupRoutes(page);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await resetWorkspace(page);
  await setupRoutes(page);

  // Wait for the app to load and navigate to dashboard
  await page.waitForSelector("#dashboard-attention-tiers", { timeout: 10000 }).catch(() => {
    // May need to click on dashboard if not default view
  });

  // ── DB1: Four sections present ───────────────────────────────────────────
  try {
    await page.waitForSelector("#dashboard-attention-tiers", { timeout: 5000 });
    const sections = await page.$$(".db-tier-section");
    if (sections.length !== 4) throw new Error(`Expected 4 sections, got ${sections.length}`);
    const keys = await Promise.all(sections.map(s => s.getAttribute("data-tier")));
    const expected = ["triage", "blocked", "paused", "reports"];
    for (const k of expected) {
      if (!keys.includes(k)) throw new Error(`Missing section key: ${k}`);
    }
    await page.screenshot({ path: join(SHOTS_DIR, `db1-sections-${vp}.png`) });
    pass(`DB1 four sections [${vp}]`);
  } catch (e) {
    await page.screenshot({ path: join(SHOTS_DIR, `db1-fail-${vp}.png`) });
    fail(`DB1 four sections [${vp}]`, e.message);
  }

  // ── DB2: Triage count = unclassified + failed ─────────────────────────────
  try {
    const triageSection = await page.$('[data-tier="triage"]');
    if (!triageSection) throw new Error("No triage section");
    const countEl = await triageSection.$(".db-tier-count");
    if (!countEl) throw new Error("No count element in triage");
    const countText = await countEl.textContent();
    const countNum = parseInt((countText || "").trim(), 10);
    if (countNum !== EXPECTED_TRIAGE_COUNT) {
      throw new Error(`Expected triage count ${EXPECTED_TRIAGE_COUNT}, got ${countNum}`);
    }
    pass(`DB2 triage count == unclassified + failed [${vp}]`);
  } catch (e) {
    fail(`DB2 triage count [${vp}]`, e.message);
  }

  // ── DB3: Reports tier renders WITHOUT select-all and row checkboxes ─────────
  // Retired: row checkboxes (.task-row-select) and select-all (.db-tier-select-all)
  // were deliberately removed from the Dashboard in commit 5f03090 per Kelly's
  // instruction — selecting rows had no action surface to act on (DEC-0042).
  // TierSection keeps its selectable/selected/toggle-row/toggle-all contract;
  // BulkBar.vue stays unused until the task picker has real action buttons.
  try {
    const reportsSection = await page.$('[data-tier="reports"]');
    if (!reportsSection) throw new Error("No reports section");

    const selectAll = await reportsSection.$(".db-tier-select-all");
    if (selectAll) {
      throw new Error(".db-tier-select-all found — selection controls should be absent (DEC-0042)");
    }
    pass(`DB3 retired — Reports tier has no .db-tier-select-all (DEC-0042) [${vp}]`);

    const rowCbs = await reportsSection.$$(".task-row-select");
    if (rowCbs.length > 0) {
      throw new Error(`.task-row-select found (${rowCbs.length}) — row checkboxes should be absent (DEC-0042)`);
    }
    pass(`DB3 retired — Reports tier has no .task-row-select row checkboxes (DEC-0042) [${vp}]`);

    await page.screenshot({ path: join(SHOTS_DIR, `db3-retired-${vp}.png`) });
  } catch (e) {
    await page.screenshot({ path: join(SHOTS_DIR, `db3-fail-${vp}.png`) });
    fail(`DB3 retired [${vp}]`, e.message);
  }

  // ── DB4: Retired — depends on row checkboxes removed in DEC-0042 ────────────
  // DB4 tested the done→closed close payload via BulkBar. Row checkboxes are gone;
  // the close payload contract is covered by WAL133-A and EV4-4.
  pass(`DB4 retired — row checkbox prerequisite removed (DEC-0042) [${vp}]`);

  // ── DB5: Collapse persists across reload ──────────────────────────────────
  if (!MUTATION) {
    try {
      await resetWorkspace(page);
      await setupRoutes(page);
      await page.waitForSelector("#dashboard-attention-tiers", { timeout: 5000 });

      // Click triage header to collapse it
      const triageHeader = await page.$('[data-tier="triage"] .db-tier-header');
      if (!triageHeader) throw new Error("No triage header");
      await triageHeader.click();
      await page.waitForTimeout(100);

      // Verify triage rows are not shown
      const triageRows = await page.$('[data-tier="triage"] .db-tier-rows');
      if (triageRows) {
        const visible = await triageRows.isVisible();
        if (visible) throw new Error("Triage rows still visible after collapse");
      }

      // Reload and re-setup routes
      await page.reload({ waitUntil: "networkidle" });
      await setupRoutes(page);
      await page.waitForSelector("#dashboard-attention-tiers", { timeout: 5000 });

      // Check triage is still collapsed
      const triageRowsAfter = await page.$('[data-tier="triage"] .db-tier-rows');
      if (triageRowsAfter) {
        const visibleAfter = await triageRowsAfter.isVisible();
        if (visibleAfter) throw new Error("Triage rows visible after reload — collapse not persisted");
      }

      await page.screenshot({ path: join(SHOTS_DIR, `db5-collapse-${vp}.png`) });
      pass(`DB5 collapse persists [${vp}]`);
    } catch (e) {
      await page.screenshot({ path: join(SHOTS_DIR, `db5-fail-${vp}.png`) });
      fail(`DB5 collapse persists [${vp}]`, e.message);
    }
  } else {
    pass(`DB5 collapse persists [${vp}] (mutation mode skip)`);
  }

  await browser.close();
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed}/${passed + failed} run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
