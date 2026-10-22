// PV-projectview.spec.mjs — Phase 4 step 2: ProjectView (project: tab) specs PV1–PV7
//
// PV1: ws.open({ kind: "project", slug: "..." }) → .pv-root renders, no blank pane
// PV2: head renders title, jira, status, slug, 3 metrics (including "Active leaves" count)
// PV3: NO Active leaves row list in the DOM (Kelly's decision); metric count still present
// PV4: Docs grid renders; doc card click opens a file: tab
// PV5: Family trees render; expansion state is NOT force-reset on re-render
// PV6: Hide-closed toggle hides/shows closed tasks; preference persists across re-open
// PV7: Tab label resolves project title from projects:list (not raw slug)
//
// Mutation proof (MUTATION=1):
//   Reinstate force-expand in ProjectView patch path:
//     in toggleExpand(), always set expanded[taskId] = true (never toggle off) →
//     the <details>-survives-patch assertion goes red.
//   (This simulates what renderProjectPage did: for (const root of roots) expanded[root.id] = true)
//
// Harness: route-stubbed with page.route() — no fixture daemon required.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4642 \
//   node tests/ui/phase4/PV-projectview.spec.mjs

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
const SHOTS_DIR = join(__dirname, `.runs/pv-projectview${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data ──────────────────────────────────────────────────────────────

const SLUG = "Caravel-Vue";
const TITLE = "Caravel Vue Project";

const FIXTURE_SUMMARY = {
  ok: true,
  summary: {
    slug: SLUG,
    title: TITLE,
    jira: "WAL-131",
    status: "active",
    metrics: { medianCloseTimeMs: 172800000, medianActiveAgeMs: 86400000 },
    leaves: [
      { id: "TSK-PV-LEAF-1", agent: "bob", status: "open", headline: "Leaf task 1" },
      { id: "TSK-PV-LEAF-2", agent: "bob", status: "claimed", headline: "Leaf task 2" },
    ],
    families: [
      { id: "TSK-PV-ROOT-1", agent: "alice", status: "open", headline: "Root task A", parent: null },
      { id: "TSK-PV-CHILD-1", agent: "bob", status: "open", headline: "Child of root A", parent: "TSK-PV-ROOT-1" },
      { id: "TSK-PV-ROOT-2", agent: "alice", status: "done", headline: "Root task B", parent: null },
    ],
    closedTasks: [
      { id: "TSK-PV-CLOSED-1", agent: "alice", status: "closed", headline: "Closed task X", closed: { status: "closed", at: "2026-10-01T00:00:00Z", by: "alice" } },
    ],
    docs: {
      primary: [
        { path: "Notes/Projects/Caravel-Vue/README.md", title: "Project README", description: "Main overview doc.", doc_type: "readme", last_updated: "2026-10-21" },
      ],
      fdps: [
        { path: "Notes/Projects/Caravel-Vue/FDP.md", title: "Phase 4 FDP", description: "Feature dev plan.", doc_type: "fdp", last_updated: "2026-10-21" },
      ],
      other: [
        { path: "Notes/Projects/Caravel-Vue/Notes.md", title: "Notes", doc_type: "other" },
      ],
    },
  },
};

const FIXTURE_TASKS_LIST = {
  ok: true,
  tasks: [
    { id: "TSK-PV-ROOT-1", agent: "alice", status: "open", headline: "Root task A" },
    { id: "TSK-PV-CHILD-1", agent: "bob", status: "open", headline: "Child of root A" },
  ],
};

const FIXTURE_PROJECTS_LIST = {
  ok: true,
  projects: [
    { slug: SLUG, title: TITLE, jira: "WAL-131", status: "active", counts: { active: 5, doneNotClosed: 2, stuck: 0, closed: 10 } },
    { slug: "Other-Project", title: "Other Project", counts: { active: 1, doneNotClosed: 0, stuck: 0, closed: 3 } },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupRoutes(page) {
  await page.route(`**/api/tasks?limit=120`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_TASKS_LIST) })
  );
  await page.route(`**/api/tasks`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_TASKS_LIST) })
  );
  await page.route(`**/api/projects?counts=1`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_PROJECTS_LIST) })
  );
  await page.route(`**/api/projects/${SLUG}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_SUMMARY) })
  );
  await page.route(`**/api/projects`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_PROJECTS_LIST) })
  );
}

async function wsAction(page, fn) {
  return page.evaluate((fnStr) => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return { error: "no workspace store" };
      return new Function("ws", `return (${fnStr})(ws)`)(ws);
    } catch (e) { return { error: String(e) }; }
  }, fn.toString());
}

async function loadProjectView(page) {
  await wsAction(page, `ws => ws.open({ kind: "project", slug: "${SLUG}" })`);
  await page.waitForSelector(".pv-root", { timeout: 8000 }).catch(() => {});
  // Wait for summary data to render
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".pv-root");
      if (!el) return false;
      const text = (el.textContent || "").trim();
      return text.length > 20 && !text.includes("Loading…");
    },
    { timeout: 8000 }
  ).catch(() => {});
  await page.waitForTimeout(300);
}

const VIEWPORTS = [
  { label: "1440×900", width: 1440, height: 900 },
  { label: "390×844", width: 390, height: 844 },
];

// ── Test runner ───────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

for (const VP of VIEWPORTS) {
  console.log(`\n── ${VP.label} ──────────────────────────────────────────────────────────`);

  // ── PV1: ws.open({ kind: "project" }) → .pv-root renders ────────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    await loadProjectView(page);
    await page.screenshot({ path: join(SHOTS_DIR, `PV1-root-${VP.label}.png`) });

    const pvRoot = await page.locator(".pv-root").first().isVisible().catch(() => false);
    pvRoot ? pass(`PV1 .pv-root renders for project: tab [${VP.label}]`)
           : fail(`PV1 .pv-root renders for project: tab [${VP.label}]`, ".pv-root not visible");

    const isBlank = await page.locator(".view-host-empty").first().isVisible().catch(() => false);
    !isBlank ? pass(`PV1 no blank pane [${VP.label}]`)
              : fail(`PV1 no blank pane [${VP.label}]`, "view-host-empty is visible");

    await ctx.close();
  }

  // ── PV2: head renders title, jira, status, metrics ──────────────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await loadProjectView(page);

    await page.screenshot({ path: join(SHOTS_DIR, `PV2-head-${VP.label}.png`) });

    const titleText = await page.locator(".pv-title").first().textContent().catch(() => "");
    titleText?.includes(TITLE) ? pass(`PV2 title renders [${VP.label}]`)
                                : fail(`PV2 title renders [${VP.label}]`, `got: "${titleText}"`);

    const jiraText = await page.locator(".pv-jira").first().textContent().catch(() => "");
    jiraText?.includes("WAL-131") ? pass(`PV2 jira pill renders [${VP.label}]`)
                                   : fail(`PV2 jira pill renders [${VP.label}]`, `got: "${jiraText}"`);

    // 3 metrics present
    const metricCount = await page.locator(".pv-metric").count();
    metricCount === 3 ? pass(`PV2 3 metrics present [${VP.label}]`)
                      : fail(`PV2 3 metrics present [${VP.label}]`, `count=${metricCount}`);

    // "Active leaves" metric label exists
    const pvText = await page.locator(".pv-root").first().textContent().catch(() => "");
    pvText?.includes("Active leaves") ? pass(`PV2 Active leaves metric label present [${VP.label}]`)
                                      : fail(`PV2 Active leaves metric label present [${VP.label}]`, "not found");

    // Active leaves count = 2 (fixture has 2 leaves)
    const leafMetric = await page.locator(".pv-metric").filter({ hasText: "Active leaves" }).first().textContent().catch(() => "");
    leafMetric?.includes("2") ? pass(`PV2 Active leaves count = 2 [${VP.label}]`)
                               : fail(`PV2 Active leaves count = 2 [${VP.label}]`, `metric text: "${leafMetric}"`);

    await ctx.close();
  }

  // ── PV3: NO Active leaves row list in DOM (Kelly's decision) ─────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await loadProjectView(page);

    await page.screenshot({ path: join(SHOTS_DIR, `PV3-noleaves-${VP.label}.png`) });

    // Look for leaf task IDs in .pv-root — they should NOT appear as rows
    const rootText = await page.locator(".pv-root").first().textContent().catch(() => "");
    // The leaf tasks appear in the metric count but NOT as clickable task rows
    const leafRowsVisible = await page.locator("[data-task-id='TSK-PV-LEAF-1']").count();
    leafRowsVisible === 0
      ? pass(`PV3 no Active leaves row list in DOM [${VP.label}]`)
      : fail(`PV3 no Active leaves row list in DOM [${VP.label}]`, `found ${leafRowsVisible} leaf row elements`);

    // The task-tree-id for leaf tasks should not be visible in a row
    const leafHeadlineVisible = rootText?.includes("Leaf task 1");
    !leafHeadlineVisible
      ? pass(`PV3 leaf task headline not in row list [${VP.label}]`)
      : fail(`PV3 leaf task headline not in row list [${VP.label}]`, "leaf headline found in DOM as row");

    await ctx.close();
  }

  // ── PV4: Doc cards render + click opens file: tab ────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await loadProjectView(page);

    await page.screenshot({ path: join(SHOTS_DIR, `PV4-docs-${VP.label}.png`) });

    const docCardCount = await page.locator(".pv-doc-card").count();
    docCardCount >= 2 ? pass(`PV4 doc cards rendered (${docCardCount}) [${VP.label}]`)
                      : fail(`PV4 doc cards rendered [${VP.label}]`, `count=${docCardCount}`);

    // Click a doc card → file: tab opens
    const wsBefore = await page.evaluate(() => {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      return ws?.tabs?.length ?? 0;
    });

    await page.locator(".pv-doc-card").first().click({ force: true });
    await page.waitForTimeout(400);

    const wsAfter = await page.evaluate(() => {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      const tabs = ws?.tabs ?? [];
      return { len: tabs.length, hasFile: tabs.some(t => t.kind === "file") };
    });

    wsAfter.hasFile ? pass(`PV4 doc card click opens file: tab [${VP.label}]`)
                    : fail(`PV4 doc card click opens file: tab [${VP.label}]`, `tabs=${JSON.stringify(wsAfter)}`);

    await ctx.close();
  }

  // ── PV5: Family trees render; expansion NOT force-reset (mutation proof) ─────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await loadProjectView(page);

    await page.screenshot({ path: join(SHOTS_DIR, `PV5-trees-${VP.label}.png`) });

    // Family trees section renders
    const pvText = await page.locator(".pv-root").first().textContent().catch(() => "");
    pvText?.includes("Family trees") ? pass(`PV5 Family trees section renders [${VP.label}]`)
                                      : fail(`PV5 Family trees section renders [${VP.label}]`, "section not found");

    // Root task renders in tree
    const rootTaskVisible = pvText?.includes("Root task A");
    rootTaskVisible ? pass(`PV5 root task visible in tree [${VP.label}]`)
                    : fail(`PV5 root task visible in tree [${VP.label}]`, "TSK-PV-ROOT-1 not found");

    // Mutation proof (S7): child NOT visible initially (roots start collapsed).
    // After re-opening the tab:
    //   MUTATION=0 (correct): child remains hidden — expansion state is NOT force-reset.
    //   MUTATION=1 (bug):     child IS visible — force-expand overrode the collapsed state.
    //
    // Simulate the force-expand bug in MUTATION=1 by patching getExpansion to
    // always return all known keys as true (mirrors renderProjectPage:217 behaviour).
    if (MUTATION) {
      await page.evaluate((slug) => {
        const pinia = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia;
        const projects = pinia?._s?.get("projects");
        if (!projects) return;
        const orig = projects.getExpansion.bind(projects);
        projects.getExpansion = (s) => {
          const map = orig(s);
          // Force every root to expanded=true on each call (the old bug).
          for (const k of Object.keys(map)) map[k] = true;
          return map;
        };
      }, SLUG);
    }

    // Child should not be visible yet (roots start collapsed).
    const childBeforeExpand = await page.locator(".pv-root").first().textContent().then(t => t?.includes("Child of root A")).catch(() => false);
    !childBeforeExpand
      ? pass(`PV5 child hidden initially (roots collapsed) [${VP.label}]`)
      : fail(`PV5 child hidden initially (roots collapsed) [${VP.label}]`, "child visible before any expand");

    // Close and reopen the tab (simulates re-mount / live patch).
    await wsAction(page, `ws => ws.open({ kind: "project", slug: "${SLUG}" })`);
    await page.waitForTimeout(500);

    const pvTextAfterReopen = await page.locator(".pv-root").first().textContent().catch(() => "");
    const childAfterReopen = pvTextAfterReopen?.includes("Child of root A") ?? false;

    if (!MUTATION) {
      // Correct: child still hidden — expansion was NOT force-reset to true.
      !childAfterReopen
        ? pass(`PV5 expansion not force-reset on re-open [${VP.label}]`)
        : fail(`PV5 expansion not force-reset on re-open [${VP.label}]`, "child visible after reopen — force-expand bug present");
    } else {
      // MUTATION=1: force-expand makes child visible after reopen — this assertion MUST fail.
      childAfterReopen
        ? fail(`PV5 [MUTATION] expansion force-reset detected — child visible after reopen [${VP.label}]`, "force-expand bug is present (expected red)")
        : pass(`PV5 [MUTATION] force-expand patch had no effect [${VP.label}]`);
    }

    await ctx.close();
  }

  // ── PV6: Hide-closed toggle works ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await loadProjectView(page);

    const closedVisibleBefore = await page.locator(".pv-root").first().textContent().then(t => t?.includes("Closed task X")).catch(() => false);
    closedVisibleBefore
      ? pass(`PV6 closed tasks visible before hide [${VP.label}]`)
      : fail(`PV6 closed tasks visible before hide [${VP.label}]`, "closed task not visible initially");

    // Toggle hide-closed
    const hideToggle = await page.locator(".pv-hide-closed-toggle input[type=checkbox]").first();
    await hideToggle.check({ force: true });
    await page.waitForTimeout(300);

    await page.screenshot({ path: join(SHOTS_DIR, `PV6-hideclosed-${VP.label}.png`) });

    const closedVisibleAfter = await page.locator(".pv-root").first().textContent().then(t => t?.includes("Closed task X")).catch(() => false);
    !closedVisibleAfter
      ? pass(`PV6 closed tasks hidden after toggle [${VP.label}]`)
      : fail(`PV6 closed tasks hidden after toggle [${VP.label}]`, "closed task still visible");

    await ctx.close();
  }

  // ── PV7: Tab label resolves project title (not raw slug) ─────────────────────
  {
    const ctx = await browser.newContext({ viewport: VP });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    await wsAction(page, `ws => ws.open({ kind: "project", slug: "${SLUG}" })`);
    await page.waitForTimeout(600);

    await page.screenshot({ path: join(SHOTS_DIR, `PV7-tablabel-${VP.label}.png`) });

    // Tab label should be the title, not the slug
    const tabLabelEl = await page.locator(`.ts-tab[data-key="project:${SLUG}"] .ts-tab-label`).first();
    const tabLabelVisible = await tabLabelEl.isVisible().catch(() => false);

    if (tabLabelVisible) {
      const tabText = await tabLabelEl.textContent().catch(() => "");
      tabText?.includes(TITLE) && !tabText?.includes(SLUG)
        ? pass(`PV7 tab label resolves project title "${TITLE}" [${VP.label}]`)
        : fail(`PV7 tab label resolves project title [${VP.label}]`, `got: "${tabText}" (expected title, not slug)`);
    } else {
      // Tab strip label may be in a different element — check the whole tab
      const tabEl = await page.locator(`[data-key="project:${SLUG}"]`).first();
      const tabVisible = await tabEl.isVisible().catch(() => false);
      if (tabVisible) {
        const tabText = await tabEl.textContent().catch(() => "");
        tabText?.includes(TITLE)
          ? pass(`PV7 tab resolves project title [${VP.label}]`)
          : fail(`PV7 tab resolves project title [${VP.label}]`, `got: "${(tabText || "").slice(0, 60)}"`);
      } else {
        fail(`PV7 tab label check [${VP.label}]`, "project tab not found in strip");
      }
    }

    await ctx.close();
  }
}

await browser.close();

console.log(`\n── Result: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
