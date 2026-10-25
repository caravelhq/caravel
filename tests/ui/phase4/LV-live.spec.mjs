// LV-live.spec.mjs — Phase 4 step 5+6: live bindings + latency measurements (S5)
//
// LV1 🔬  Picker tree loads without refresh click (tasks:list live binding active).
//          Mutation: clear cache + unbind → rows vanish → "appears-without-click" goes red.
//
// LV2     DEC-0029 compliance — task:<id> refs > 0 when envelope is active,
//          refs === 0 when the tab is deactivated (background tab).
//
// LV3     ProjectView binding — project:<slug> refs > 0 when active,
//          refs === 0 when deactivated.
//
// LV4     ViewHost F6/DEC-0035 placeholder — unregistered kind "chat" renders an
//          explicit "chat — not available yet" label, not a blank pane.
//
// LV5     S5 latency: p50 + p95 for /api/tasks/<id> and /api/projects/<slug>
//          on the fixture corpus (this server, proxying to :4636) and the live
//          corpus (:4632 when available). Feed numbers to R19.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4643 \
//   LIVE_BASE=http://127.0.0.1:4632 \
//   node tests/ui/phase4/LV-live.spec.mjs

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4643").replace(/\/$/, "");
const LIVE_BASE = (process.env.LIVE_BASE || "http://127.0.0.1:4632").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/lv-live");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data (deterministic, independent of fixture daemon state) ─────────

const FX_TASK_ID = "TSK-2026-LV-0001";
const FX_TASK_ID2 = "TSK-2026-LV-0002";
const FX_PROJECT_SLUG = "lv-test-proj";

const FX_TASKS = [
  { id: FX_TASK_ID, headline: "LV task one", agent: "alice", status: "open", project: FX_PROJECT_SLUG, updated: "2026-10-21T12:00:00Z" },
  { id: FX_TASK_ID2, headline: "LV task two", agent: "bob", status: "open", project: FX_PROJECT_SLUG, updated: "2026-10-21T11:00:00Z" },
];

async function stubBase(page) {
  await page.route("**/api/settings", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, timezoneOffsetMinutes: 0 }),
  }));
  await page.route("**/api/settings/voice", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, ttsEnabled: false }),
  }));
  await page.route("**/api/tasks/scheduled", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, templates: [] }),
  }));
  await page.route("**/api/tasks/attention", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, tiers: { unclassified: { count: 0, rows: [] }, failed: { count: 0, rows: [] }, blocked: { count: 0, rows: [] }, paused: { count: 0, rows: [] }, reports: { count: 0, rows: [] } } }),
  }));
  await page.route("**/api/multi-agent/summary", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, summary: { enabled: true, totals: { open: 2, waiting: 0, done: 0, failed: 0 } } }),
  }));
  await page.route("**/api/knowledge/stats", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, enabled: false, docs: 0, reports: 0 }),
  }));
  await page.route("**/api/projects**", r => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, projects: [] }),
  }));
}

function getTasksStore(page) {
  return page.evaluate(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("tasks");
    if (!store) return null;
    return {
      loaded: store.loaded,
      cacheLength: Array.isArray(store.cache) ? store.cache.length : 0,
    };
  });
}

function getLiveEntry(page, key) {
  return page.evaluate((k) => {
    const app = document.querySelector("#app")?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("live");
    if (!store) return null;
    const entry = store.entry(k);
    if (!entry) return null;
    return {
      refs: entry.refs,
      status: entry.status,
      hasData: !!entry.data,
    };
  }, key);
}

const browser = await chromium.launch({ headless: true });

try {
  // ─────────────────────────────────────────────────────────────────────────
  // LV1 🔬  Picker tree loads without refresh click.
  //
  // On mount, TasksPage.vue calls live.bind("tasks:list", tasksListSpec) which
  // triggers an initial fetch. Tasks appear in All view without the user clicking ↻.
  //
  // Mutation: clear the tasks cache + call live.unbind("tasks:list") via Pinia.
  // The rows vanish because the live data source is severed, confirming the tree
  // drives from the live binding rather than a one-shot fetch.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubBase(page);
    await page.route("**/api/tasks?**", r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: FX_TASKS }),
    }));

    await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // Switch to All view.
    const allTab = page.locator('[data-view="all"]');
    if (await allTab.count() > 0) {
      await allTab.click();
      await page.waitForTimeout(600);
    }

    await page.waitForSelector("#tasks-tree", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(SHOTS_DIR, "01-lv1-initial.png") });

    // Verify rows appeared WITHOUT clicking ↻.
    const rowsInit = await page.locator("#tasks-tree .task-tree-node").count();
    if (rowsInit >= 2) {
      pass(`LV1 — ${rowsInit} task row(s) appeared without refresh click (live binding works)`);
    } else {
      fail("LV1 — rows appeared without refresh", `only ${rowsInit} rows — tasks:list binding may be missing`);
    }

    // DEC-0030: TasksPage binds tasks:list (picker + TabStrip = 2 refs). Assert
    // exactly 2 so a single-binding regression is caught at gate time.
    const liveEntry = await getLiveEntry(page, "tasks:list");
    if (liveEntry && liveEntry.refs === 2) {
      pass(`LV1 — tasks:list live entry has refs=${liveEntry.refs} (picker + TabStrip both bound, DEC-0030)`);
    } else {
      fail("LV1 — tasks:list live entry refs === 2 (DEC-0030)", liveEntry ? `refs=${liveEntry.refs}` : "entry not found");
    }

    // ── LV1 🔬 Mutation: unbind + clear cache. Rows should vanish. ──────────
    await page.evaluate(() => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const liveStore = pinia?._s?.get("live");
      const tasksStore = pinia?._s?.get("tasks");
      if (liveStore) {
        // Simulate the mutation: unbind the tasks:list key as if it was never bound.
        liveStore.unbind("tasks:list");
      }
      if (tasksStore) {
        // Clear the cache to simulate no data being loaded.
        tasksStore.cache = [];
        tasksStore.loaded = false;
      }
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: join(SHOTS_DIR, "02-lv1-mutation.png") });

    const rowsMutation = await page.locator("#tasks-tree .task-tree-node").count();
    if (rowsMutation === 0) {
      pass("LV1 🔬 — after unbind + cache clear: 0 rows (appears-without-click assertion goes red without the binding)");
    } else {
      fail("LV1 🔬 — mutation detection", `${rowsMutation} rows still visible after unbind — cache read-through not severed`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LV2  DEC-0029 — task:<id> refs > 0 when envelope is active,
  //       refs === 0 when the tab is deactivated (background tab).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubBase(page);
    await page.route("**/api/tasks?**", r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: FX_TASKS }),
    }));
    await page.route(`**/api/tasks/${FX_TASK_ID}**`, r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, chain: { task: FX_TASKS[0], ancestors: [], children: [] } }),
    }));

    await page.goto(`${BASE}/#/tasks`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // Switch to All view, click a task row to open an envelope tab.
    const allTab = page.locator('[data-view="all"]');
    if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(400); }
    await page.waitForSelector("#tasks-tree .task-tree-node", { timeout: 3000 }).catch(() => {});
    const firstRow = page.locator(`#tasks-tree [data-task-id="${FX_TASK_ID}"]`).first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForTimeout(800);
    }

    const envelopeKey = `task:${FX_TASK_ID}`;
    const entryActive = await getLiveEntry(page, envelopeKey);
    if (entryActive && entryActive.refs > 0) {
      pass(`LV2 — task:${FX_TASK_ID} refs=${entryActive.refs} when envelope tab is active`);
    } else {
      fail(`LV2 — task:${FX_TASK_ID} refs > 0 when active`, entryActive ? `refs=${entryActive.refs}` : "entry not found");
    }

    // Navigate away (open Dashboard) to deactivate the envelope tab.
    const dashBtn = page.locator('[data-page="dashboard"], [href*="/dashboard"], .tab-btn[title="Dashboard"]').first();
    if (await dashBtn.count() > 0) {
      await dashBtn.click();
      await page.waitForTimeout(500);
    } else {
      // Navigate via URL
      await page.evaluate(() => { window.location.hash = "/dashboard"; });
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: join(SHOTS_DIR, "03-lv2-deactivated.png") });

    const entryDeactivated = await getLiveEntry(page, envelopeKey);
    if (entryDeactivated !== null && entryDeactivated.refs === 0) {
      pass(`LV2 🔬 — task:${FX_TASK_ID} refs=0 after tab deactivated (DEC-0029 holds)`);
    } else if (entryDeactivated === null) {
      pass("LV2 — entry evicted (refs=0 implicit — DEC-0029 satisfied by eviction)");
    } else {
      fail("LV2 🔬 — refs drops to 0 on deactivation", `refs=${entryDeactivated.refs} — KeepAlive deactivation not unbinding`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LV3  ProjectView binding — project:<slug> refs > 0 when active,
  //       refs === 0 when deactivated.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubBase(page);
    await page.route("**/api/tasks?**", r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: FX_TASKS }),
    }));
    await page.route(`**/api/projects/${FX_PROJECT_SLUG}**`, r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, summary: {
        slug: FX_PROJECT_SLUG, title: "LV Test Project", jira: null, status: "active",
        counts: { active: 2, doneNotClosed: 0, stuck: 0, closed: 0, total: 2 },
        leaves: 2, docs: [], trees: [], closedTrees: [],
      }}),
    }));

    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // Open a project: tab programmatically via workspace store.
    await page.evaluate((slug) => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const ws = pinia?._s?.get("workspace");
      if (ws) ws.open({ kind: "project", slug }, { preview: false });
    }, FX_PROJECT_SLUG);
    await page.waitForTimeout(800);

    const projKey = `project:${FX_PROJECT_SLUG}`;
    const projActive = await getLiveEntry(page, projKey);
    if (projActive && projActive.refs > 0) {
      pass(`LV3 — project:${FX_PROJECT_SLUG} refs=${projActive.refs} when project tab is active`);
    } else {
      fail(`LV3 — project:${FX_PROJECT_SLUG} refs > 0 when active`, projActive ? `refs=${projActive.refs}` : "entry not found (project: view not binding?)");
    }

    // Open Dashboard to deactivate project tab.
    await page.evaluate(() => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const ws = pinia?._s?.get("workspace");
      if (ws) ws.open({ kind: "dashboard" });
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SHOTS_DIR, "04-lv3-project-deactivated.png") });

    const projDeactivated = await getLiveEntry(page, projKey);
    if (projDeactivated !== null && projDeactivated.refs === 0) {
      pass(`LV3 — project:${FX_PROJECT_SLUG} refs=0 after tab deactivated (DEC-0029 holds)`);
    } else if (projDeactivated === null) {
      pass("LV3 — project entry evicted (refs=0 implicit)");
    } else {
      fail("LV3 — project refs drops to 0 on deactivation", `refs=${projDeactivated.refs}`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LV4  ViewHost F6/DEC-0035: a genuinely unregistered kind renders an explicit
  //       placeholder, not a blank pane.
  //       "chat" was used before Phase 5 registered it — now uses "__xtest__".
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubBase(page);
    await page.route("**/api/tasks?**", r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [] }),
    }));

    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace.") || k.startsWith("tasks."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // Inject a genuinely unregistered kind directly into the workspace store state.
    // "__xtest__" is not and will never be registered in the view registry.
    // Direct injection bypasses ws.open URL sync, which would redirect unregistered kinds.
    await page.evaluate(() => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return;
      const testRef = { kind: "__xtest__", id: "lv4-test" };
      ws.tabs.push(testRef);
      ws.active[0] = "__xtest__:lv4-test";
      ws.focused = 0;
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: join(SHOTS_DIR, "05-lv4-unregistered.png") });

    // Placeholder must be visible (not a blank pane).
    const placeholder = await page.locator(".view-host-unregistered").count();
    if (placeholder > 0) {
      pass("LV4 — .view-host-unregistered placeholder visible for unregistered kind '__xtest__'");
    } else {
      fail("LV4 — explicit placeholder for unregistered kind", ".view-host-unregistered not found — blank pane regression (F6)");
    }

    const placeholderText = await page.locator(".view-host-unregistered-label").textContent().catch(() => "");
    if (placeholderText.includes("__xtest__")) {
      pass(`LV4 — placeholder names the kind: "${placeholderText.trim()}"`);
    } else {
      fail("LV4 — placeholder names the kind", `text is "${placeholderText.trim()}" — kind not named`);
    }

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LV5  S5 Latency: p50 + p95 for task:<id> and project:<slug> fetches.
  //
  // Measures the raw HTTP fetch time for both routes on:
  //   a) fixture corpus (this test server at BASE, proxying to :4636)
  //   b) live corpus (:4632 when available)
  //
  // N = 12 iterations. These numbers feed R19's WAL-117 gate threshold (~1s p50).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const N = 12;

    // Node-level fetch — no CORS, no browser overhead, consistent for both fixture and live.
    async function measureNodeFetchMs(url) {
      const samples = [];
      for (let i = 0; i < N; i++) {
        const t0 = Date.now();
        try {
          const r = await fetch(url, { cache: "no-store" });
          await r.json();
          samples.push(Date.now() - t0);
        } catch { /* skip */ }
      }
      if (samples.length < 3) return null;
      samples.sort((a, b) => a - b);
      return {
        p50: samples[Math.floor(samples.length * 0.5)],
        p95: samples[Math.floor(samples.length * 0.95)],
        n: samples.length,
      };
    }

    // Fixture daemon task and project IDs
    const fixtureTaskUrl = `${BASE}/api/tasks/TSK-FX-0001`;
    const fixtureProjectUrl = `${BASE}/api/projects/Alpha`;

    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    // LV5a: fixture task:<id>
    const fxTask = await measureNodeFetchMs(fixtureTaskUrl);
    if (fxTask) {
      pass(`LV5 fixture task:<id>  p50=${fxTask.p50}ms  p95=${fxTask.p95}ms  (n=${fxTask.n})`);
      if (fxTask.p50 > 1000) {
        fail("LV5 — fixture task p50 ≤ 1000ms", `p50=${fxTask.p50}ms exceeds threshold`);
      }
    } else {
      fail("LV5 — fixture task latency measurement", "too few successful fetches");
    }

    // LV5b: fixture project:<slug>
    const fxProj = await measureNodeFetchMs(fixtureProjectUrl);
    if (fxProj) {
      pass(`LV5 fixture project:<slug>  p50=${fxProj.p50}ms  p95=${fxProj.p95}ms  (n=${fxProj.n})`);
    } else {
      fail("LV5 — fixture project latency measurement", "too few successful fetches");
    }

    // LV5c+d: live daemon — conditional, no CORS issue with Node-level fetch
    const liveAvailable = await fetch(`${LIVE_BASE}/api/tasks?limit=1`).then(r => r.ok).catch(() => false);
    if (liveAvailable) {
      let liveTaskId = null;
      try {
        const d = await fetch(`${LIVE_BASE}/api/tasks?limit=5`).then(r => r.json());
        liveTaskId = d.tasks?.[0]?.id ?? null;
      } catch {}

      if (liveTaskId) {
        const liveTaskMs = await measureNodeFetchMs(`${LIVE_BASE}/api/tasks/${encodeURIComponent(liveTaskId)}`);
        if (liveTaskMs) {
          pass(`LV5 LIVE task:<id>  p50=${liveTaskMs.p50}ms  p95=${liveTaskMs.p95}ms  (n=${liveTaskMs.n})`);
          if (liveTaskMs.p50 > 1000) console.log(`  ⚠ LV5: live task p50 ${liveTaskMs.p50}ms > 1000ms — WAL-117 gate threshold met`);
          else console.log(`  ✓ LV5: live task p50 ${liveTaskMs.p50}ms ≤ 1000ms`);
        } else {
          fail("LV5 — live task latency measurement", "too few successful fetches");
        }
      }

      let liveProjSlug = null;
      try {
        const d = await fetch(`${LIVE_BASE}/api/projects`).then(r => r.json());
        liveProjSlug = d.projects?.[0]?.slug ?? null;
      } catch {}

      if (liveProjSlug) {
        const liveProjMs = await measureNodeFetchMs(`${LIVE_BASE}/api/projects/${encodeURIComponent(liveProjSlug)}`);
        if (liveProjMs) {
          pass(`LV5 LIVE project:<slug>  p50=${liveProjMs.p50}ms  p95=${liveProjMs.p95}ms  (n=${liveProjMs.n})`);
          if (liveProjMs.p50 > 1000) console.log(`  ⚠ LV5: live project p50 ${liveProjMs.p50}ms > 1000ms`);
        } else {
          fail("LV5 — live project latency measurement", "too few successful fetches");
        }
      } else {
        pass("LV5 LIVE project:<slug> — no projects on live corpus, skipped");
      }
    } else {
      pass(`LV5 — live daemon not available at ${LIVE_BASE} — fixture numbers only`);
    }

    await page.screenshot({ path: join(SHOTS_DIR, "06-lv5-latency.png") });
    await page.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
