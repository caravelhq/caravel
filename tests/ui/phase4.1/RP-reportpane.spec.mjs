// RP-reportpane.spec.mjs — Phase 4.1 node .01: ReportPane as components, viewer.ts deleted
//
// RP1: No innerHTML in ReportPane.vue source (source-level grep + rendered output check)
// RP2: Scroll position survives a live tasks event (Pinia mutation, activePath unchanged)
// RP3: Open <details> disclosures survive a live tasks event
// RP4: Doc tag click fires data-open-file (intercepted by EnvelopeView.onOpenFile),
//       does NOT swap the displayed document in the pane
// RP5: viewer.ts / renderReportPane / loadReportNode absent from built JS bundle
//
// Mutation proof:
//   In ReportPane.vue, replace `<DocViewer :path="activePath" kind="report" />`
//   with a renderReportPane() call (simulating the old viewer.ts approach) —
//   RP2 and RP3 go red because renderReportPane() re-creates DOM nodes on each
//   tasks event, destroying scroll position and open disclosure state.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4642 \
//   node tests/ui/phase4.1/RP-reportpane.spec.mjs

import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync, readFileSync } from "fs";

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4642").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, ".runs/RP-reportpane");
mkdirSync(SHOTS_DIR, { recursive: true });

// ── Fixture task IDs ──────────────────────────────────────────────────────────

const TASK_REPORT  = "TSK-RP1-2026-10-21-0001.01"; // done, has reportPath + deliverable
const TASK_NO_RPT  = "TSK-RP1-2026-10-21-0001.02"; // open, no reportPath

// A long report with <details> elements so scroll actually works
const LONG_REPORT_CONTENT = `---
title: RP spec fixture report
status: done
---

# ReportPane Fixture

This report is intentionally long so the pane can scroll.

## Section 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
ut labore et dolore magna aliqua. Ut enim ad minim veniam.

<details open>
<summary>Open disclosure — must survive live event</summary>
This disclosure is open before the live tasks event. It must still be open after.
</details>

## Section 2

Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.

## Section 3

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem.

## Section 4

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi.

## Section 5

Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus.
Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe.

## Section 6

Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores
alias consequatur aut perferendis doloribus asperiores repellat.

## Section 7 — bottom anchor

Scroll here to verify position is preserved after live tasks event.
`;

const REPORT_PATH  = "agents/bob/tasks/done/TSK-RP1-2026-10-21-0001.01.md";
const DELIV_PATH   = "agents/bob/tasks/done/TSK-RP1-2026-10-21-0001.01-extra.md";

function makeChain(overrides) {
  const base = {
    id: TASK_REPORT,
    agent: "bob",
    to: "bob",
    from: "alice",
    status: "done",
    headline: "RP spec — report pane component test",
    brief: "Brief for RP spec fixture.",
    summary: { response: "Report rendered via DocViewer." },
    reportPath: REPORT_PATH,
    deliverables: [DELIV_PATH],
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
        { id: TASK_REPORT, agent: "bob", status: "done", headline: "RP spec — report pane component test" },
      ] }),
    })
  );
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/tasks/TSK-RP1") || url.includes("/api/files/read")) return;
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

async function stubFile(page, filePath, content) {
  await page.route(
    `**/api/files/read?path=${encodeURIComponent(filePath)}*`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, markdown: true, content }),
      })
  );
}

async function loadEnvelopeReport(page, taskId) {
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  // Navigate to envelope, which auto-switches to report pane when reportPath exists
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(taskId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}

async function shot(page, name) {
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ── RP1: Source-level check — no innerHTML in ReportPane.vue ─────────────────
// (Can run without a browser — pure file read)
try {
  const REPO_ROOT = resolve(join(__dirname, "..", "..", ".."));
  const rpSource = readFileSync(
    join(REPO_ROOT, "src/ui/app/views/ReportPane.vue"),
    "utf8"
  );
  // Check for innerHTML assignment (not the word in a comment like "// no innerHTML")
  if (/innerHTML\s*=/.test(rpSource)) {
    fail("RP1 no innerHTML assignment in ReportPane.vue source", "innerHTML= found in source");
  } else {
    pass("RP1 no innerHTML assignment in ReportPane.vue source");
  }

  // Should reference DocViewer, not any legacy viewer function
  if (rpSource.includes("renderReportPane") || rpSource.includes("loadReportNode")) {
    fail("RP1 no legacy viewer functions in ReportPane.vue", "found renderReportPane or loadReportNode");
  } else {
    pass("RP1 no legacy viewer functions in ReportPane.vue");
  }

  // Should use DocViewer component
  if (rpSource.includes("DocViewer")) {
    pass("RP1 ReportPane.vue uses DocViewer component");
  } else {
    fail("RP1 ReportPane.vue uses DocViewer component", "DocViewer import not found");
  }
} catch (e) { fail("RP1 source check", String(e)); }

// ── RP5: viewer.ts absent from built bundle ───────────────────────────────────
// (Can run without a browser — pure file read)
try {
  const REPO_ROOT = resolve(join(__dirname, "..", "..", ".."));
  const distDir = join(REPO_ROOT, "src/ui/app-dist");
  const manifest = JSON.parse(readFileSync(join(distDir, "build-manifest.json"), "utf8"));

  // Find the main JS bundle from manifest
  const entries = Object.values(manifest);
  const jsEntry = entries.find((e) => e.file && e.file.endsWith(".js") && e.isEntry);
  const jsFile = jsEntry ? join(distDir, jsEntry.file) : null;

  if (!jsFile || !existsSync(jsFile)) {
    fail("RP5 built bundle found", `bundle not found: ${jsFile}`);
  } else {
    const bundle = readFileSync(jsFile, "utf8");
    if (bundle.includes("renderReportPane")) {
      fail("RP5 renderReportPane absent from bundle", "found in bundle");
    } else {
      pass("RP5 renderReportPane absent from built bundle");
    }
    if (bundle.includes("loadReportNode")) {
      fail("RP5 loadReportNode absent from bundle", "found in bundle");
    } else {
      pass("RP5 loadReportNode absent from built bundle");
    }
  }
} catch (e) { fail("RP5 bundle check", String(e)); }

// ── Browser tests ─────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
  });
});

// ── RP1 (continued): Rendered pane uses DocViewer (no raw innerHTML injection) ─
try {
  await stubBaseRoutes(page);
  await stubTask(page, TASK_REPORT, makeChain({}));
  await stubFile(page, REPORT_PATH, LONG_REPORT_CONTENT);
  await stubFile(page, DELIV_PATH, "# Extra deliverable\n\nContent here.");
  await loadEnvelopeReport(page, TASK_REPORT);

  // Should be on report pane (auto-switched because task has reportPath)
  const reportTab = page.locator('[role="tab"]:has-text("Report")');
  const isActive = await reportTab.getAttribute("aria-selected");
  if (isActive === "true") pass("RP1 auto-switched to Report pane");
  else fail("RP1 auto-switched to Report pane", `aria-selected=${isActive}`);

  // ev-report-pane should exist
  const rpPane = page.locator(".ev-report-pane");
  const rpVisible = await rpPane.count();
  if (rpVisible > 0) pass("RP1 .ev-report-pane rendered");
  else fail("RP1 .ev-report-pane rendered", "not found");

  // DocViewer's .files-content should be inside the pane
  const filesContent = page.locator(".ev-report-pane .files-content");
  const fcCount = await filesContent.count();
  if (fcCount > 0) pass("RP1 DocViewer .files-content present in pane");
  else fail("RP1 DocViewer .files-content present in pane", "not found");

  // Rendered content should include markdown text from the fixture report
  const contentText = await filesContent.textContent().catch(() => "");
  if (contentText && contentText.includes("ReportPane Fixture")) {
    pass("RP1 markdown content rendered in DocViewer");
  } else {
    fail("RP1 markdown content rendered in DocViewer", `got: ${contentText?.slice(0, 100)}`);
  }

  await shot(page, "RP1-loaded");
} catch (e) { fail("RP1 browser", String(e)); }

// ── RP2: Scroll position survives a live tasks event ──────────────────────────
// Mutation proof: if ReportPane used innerHTML (old viewer.ts) instead of DocViewer,
// a tasks event that updated `task.updated` would call renderPath() again and re-create
// the DOM from scratch, losing scroll position. DocViewer only re-renders when path changes.
try {
  // Get the scrollable element inside .ev-report-pane
  const filesContent = page.locator(".ev-report-pane .files-content");
  await filesContent.waitFor({ state: "visible", timeout: 3000 });

  // Scroll to bottom
  await filesContent.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  const scrollBefore = await filesContent.evaluate((el) => el.scrollTop);

  if (scrollBefore < 50) {
    fail("RP2 pre-condition: content actually scrollable", `scrollTop=${scrollBefore} (content may not be tall enough)`);
  } else {
    // Fire a live tasks event via Pinia store mutation (same activePath, only `updated` changes)
    const mutated = await page.evaluate((taskId) => {
      const pinia = window.__pinia;
      if (!pinia) return "no pinia";
      const live = pinia._s.get("live");
      if (!live) return "no live store";
      const key = `task:${taskId}`;
      const entry = live.entries.get(key);
      if (!entry) return `no entry for ${key}`;
      const prev = entry.data;
      if (!prev?.chain?.task) return "no chain.task in entry";
      // Mutate only the `updated` timestamp — reportPath stays the same
      entry.data = {
        ...prev,
        chain: {
          ...prev.chain,
          task: { ...prev.chain.task, updated: new Date().toISOString() },
        },
      };
      return "ok";
    }, TASK_REPORT);

    if (mutated !== "ok") {
      fail("RP2 Pinia mutation", `could not mutate live store: ${mutated}`);
    } else {
      await page.waitForTimeout(300);
      const scrollAfter = await filesContent.evaluate((el) => el.scrollTop);
      const delta = Math.abs(scrollAfter - scrollBefore);
      if (delta < 20) {
        pass(`RP2 scroll position preserved after live tasks event (before=${scrollBefore}, after=${scrollAfter})`);
      } else {
        fail("RP2 scroll position preserved", `scrollTop jumped from ${scrollBefore} to ${scrollAfter} (Δ${delta})`);
      }
    }
  }

  await shot(page, "RP2-scroll-survived");
} catch (e) { fail("RP2 scroll", String(e)); }

// ── RP3: Open <details> survive a live tasks event ───────────────────────────
// Same mutation proof as RP2 — innerHTML wipe would close all <details>.
try {
  // Find the <details> element rendered from the fixture report
  const detailsEl = page.locator(".ev-report-pane details");
  const detailsCount = await detailsEl.count();

  if (detailsCount === 0) {
    fail("RP3 pre-condition: <details> rendered in fixture report", "no details elements found");
  } else {
    // The fixture has `<details open>` — it should already be open
    const isOpenBefore = await detailsEl.first().evaluate((el) => el.open);
    if (!isOpenBefore) {
      // Open it manually if auto-render didn't preserve the 'open' attribute
      await detailsEl.first().evaluate((el) => { el.open = true; });
      await page.waitForTimeout(100);
    }

    // Fire another live tasks event
    const mutated = await page.evaluate((taskId) => {
      const pinia = window.__pinia;
      if (!pinia) return "no pinia";
      const live = pinia._s.get("live");
      if (!live) return "no live store";
      const key = `task:${taskId}`;
      const entry = live.entries.get(key);
      if (!entry?.data?.chain?.task) return "no chain";
      entry.data = {
        ...entry.data,
        chain: {
          ...entry.data.chain,
          task: { ...entry.data.chain.task, updated: new Date().toISOString() },
        },
      };
      return "ok";
    }, TASK_REPORT);

    await page.waitForTimeout(300);

    if (mutated !== "ok") {
      fail("RP3 Pinia mutation", mutated);
    } else {
      const isOpenAfter = await detailsEl.first().evaluate((el) => el.open);
      if (isOpenAfter) {
        pass("RP3 open <details> stays open after live tasks event");
      } else {
        fail("RP3 open <details> stays open after live tasks event", "details closed after mutation");
      }
    }
  }

  await shot(page, "RP3-disclosure-survived");
} catch (e) { fail("RP3 disclosure", String(e)); }

// ── RP4: Doc tag click fires data-open-file; does NOT swap pane content ───────
// The tab row (ReportDocTabs) uses data-open-file so EnvelopeView.onOpenFile opens
// a file: tab in the workspace — it does NOT update activePath in ReportPane.
try {
  // Reload fresh so we have a clean state
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // Should show ReportDocTabs (task has reportPath + one deliverable = 2 total paths)
  const tabRow = page.locator(".ev-report-doc-tabs");
  const tabRowVisible = await tabRow.count();
  if (tabRowVisible === 0) {
    fail("RP4 pre-condition: ReportDocTabs row visible", ".ev-report-doc-tabs not found");
  } else {
    pass("RP4 ReportDocTabs row rendered");

    // The deliverable button has data-open-file set
    const delivBtn = tabRow.locator(`[data-open-file="${DELIV_PATH}"]`);
    const delivBtnCount = await delivBtn.count();
    if (delivBtnCount === 0) {
      fail("RP4 deliverable tab has data-open-file attribute", `no button with data-open-file=${DELIV_PATH}`);
    } else {
      pass("RP4 deliverable tab has data-open-file attribute");

      // Intercept ws.open calls — check that a file: pane open was attempted
      // We do this by watching for a /api/files/read on DELIV_PATH (DocViewer would
      // fetch it if activePath changed), then asserting it is NOT called (tab click
      // should open a new pane, not swap in-place).
      let delivFetchCalled = false;
      await page.route(
        `**/api/files/read?path=${encodeURIComponent(DELIV_PATH)}*`,
        (route) => {
          delivFetchCalled = true;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, markdown: true, content: "# Extra deliverable\n\nContent here." }),
          });
        }
      );

      // Record initial activePath content before click
      const contentBefore = await page.locator(".ev-report-pane .files-content").textContent().catch(() => "");

      await delivBtn.click();
      await page.waitForTimeout(400);

      // activePath in ReportPane must NOT have changed (still showing REPORT_PATH, not DELIV_PATH)
      // DocViewer should NOT have fetched DELIV_PATH for the in-pane view
      if (delivFetchCalled) {
        fail("RP4 deliverable click does NOT swap pane content", "DocViewer fetched deliverable — activePath changed unexpectedly");
      } else {
        pass("RP4 deliverable click does not swap in-pane content (file: tab opened instead)");
      }

      // The pane should still show content from REPORT_PATH
      const contentAfter = await page.locator(".ev-report-pane .files-content").textContent().catch(() => "");
      if (contentAfter && contentAfter.includes("ReportPane Fixture")) {
        pass("RP4 pane still shows primary report after deliverable tab click");
      } else {
        fail("RP4 pane still shows primary report", `content: ${contentAfter?.slice(0, 100)}`);
      }

      // The is-active class stays on the report path button, not the deliverable
      const reportBtn = tabRow.locator(`[data-open-file="${REPORT_PATH}"]`);
      const reportActive = await reportBtn.evaluate((el) => el.classList.contains("is-active")).catch(() => false);
      if (reportActive) {
        pass("RP4 report path tab remains is-active after deliverable click");
      } else {
        fail("RP4 report path tab remains is-active", "is-active moved or missing");
      }
    }
  }

  await shot(page, "RP4-tab-click");
} catch (e) { fail("RP4 doc tab click", String(e)); }

// ── RP-geo: .ev-report-pane fills the pane (not zero height) ─────────────────
try {
  const rpBox = await page.locator(".ev-report-pane").boundingBox();
  if (!rpBox) {
    fail("RP-geo .ev-report-pane visible", "not found");
  } else if (rpBox.height < 100) {
    fail("RP-geo .ev-report-pane has substantial height", `height=${rpBox.height}`);
  } else {
    pass(`RP-geo .ev-report-pane height=${Math.round(rpBox.height)}px (fills pane)`);
  }
  await shot(page, "RP-geo");
} catch (e) { fail("RP-geo", String(e)); }

// ── RP-no-report: no reportPath → shows placeholder ──────────────────────────
try {
  await page.unroute(`**\/api\/tasks\/${encodeURIComponent(TASK_REPORT)}**`);
  await stubTask(page, TASK_NO_RPT, makeChain({ id: TASK_NO_RPT, reportPath: undefined, deliverables: [] }));

  await page.addInitScript(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("workspace.") || k.startsWith("tasks.")) localStorage.removeItem(k);
    });
  });
  await page.goto(`${BASE}/#/envelope/${encodeURIComponent(TASK_NO_RPT)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  // Switch to Report tab manually (no auto-switch without reportPath)
  const reportTab = page.locator('[role="tab"]:has-text("Report")');
  await reportTab.click();
  await page.waitForTimeout(300);

  const placeholder = page.locator(".task-panel-loading");
  const placeholderText = await placeholder.textContent().catch(() => null);
  if (placeholderText && placeholderText.includes("No report yet")) {
    pass("RP-no-report placeholder shown when no reportPath");
  } else {
    fail("RP-no-report placeholder", `got: ${placeholderText}`);
  }
  await shot(page, "RP-no-report");
} catch (e) { fail("RP-no-report", String(e)); }

await page.close();
await browser.close();

const total = passed + failed;
console.log(`\n${passed}/${total} passed.`);
if (failed > 0) process.exit(1);
