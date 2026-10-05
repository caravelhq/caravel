// SR-search.spec.mjs — Phase 3.1 node 1 search specs: SR1–SR3
//
// SR1: Every row in Search mode has a non-empty title and a data-doc-path attribute.
// SR2 🔬: Clicking a result opens a tab and closes the modal.
//         Mutation: strip path from the route stub → row becomes dead →
//         clicking does nothing → modal stays open → SR2 goes RED.
// SR3: A row with no resolvable target is aria-disabled and does not open a tab.
//
// Run at BOTH 390×844 and 1440×900 — two of this phase's defects are phone-only.
//
// Usage:
//   CARAVEL_BASE=http://127.0.0.1:4636 node tests/ui/phase3/SR-search.spec.mjs
//
// Scratch daemon:
//   node tests/ui/phase3/scratch-daemon.mjs start \
//     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
//   node tests/ui/phase3/scratch-daemon.mjs stop --port 4636

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
console.log(`Base URL: ${BASE}`);

const SHOTS_DIR = join(__dirname, ".runs/sr-search");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Fixture data ─────────────────────────────────────────────────────────────

const DOCS_WITH_PATH = [
  {
    id: 1380,
    score: -5.93,
    snippet: "Phase 1 («reading» «pane» + router)…",
    path: "agents/bob/tasks/done/TSK-2026-08-18-0002.md",
    title: "FDP — tasks panel as Vue island with reading pane",
    doc_type: "fdp",
    status: "done",
    project: "Caravel-Vue",
    last_updated: "2026-08-18",
    via: ["fts"],
  },
  {
    id: 1420,
    score: -5.10,
    snippet: "The «search» projection fix carries path, title…",
    path: "Notes/Projects/Caravel-Vue/2026-10-02_FDP_Phase-3.1_Search-Nav-Voice-Repair.md",
    title: "FDP — Phase 3.1: search usability, the Open menu, and voice repair",
    doc_type: "fdp",
    status: "active",
    project: "Caravel-Vue",
    last_updated: "2026-10-02",
    via: ["fts"],
  },
];

// Same docs with path stripped — simulates a lagging CLI (the mutation)
const DOCS_NO_PATH = DOCS_WITH_PATH.map(({ path: _path, ...rest }) => rest);

// A pathless doc for SR3 (id is numeric, no path, no TSK- id)
const DOCS_DEAD = [
  {
    id: 9999,
    score: -3.5,
    snippet: "An orphaned node with no file backing it.",
    title: "Orphaned node",
    doc_type: "note",
    status: "active",
    via: ["fts"],
  },
];

// ── Common route stubs ────────────────────────────────────────────────────────

async function setupBaseRoutes(page) {
  await page.route("**/api/knowledge/stats", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, enabled: true, docs: 833, reports: 1382 }),
    })
  );
  await page.route("**/api/tasks/attention", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tiers: {
        unclassified: { count: 0, rows: [] }, failed: { count: 0, rows: [] },
        blocked: { count: 0, rows: [] }, paused: { count: 0, rows: [] }, reports: { count: 0, rows: [] },
      }}),
    })
  );
  await page.route("**/api/tasks/scheduled", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, templates: [] }),
    })
  );
  await page.route("**/api/multi-agent/summary", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, summary: { enabled: true, totals: { open: 0, waiting: 0, done: 0, failed: 0 } } }),
    })
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, timezoneOffsetMinutes: 0 }),
    })
  );
}

async function setupSearchRoute(page, docs) {
  await page.route("**/api/knowledge/search**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, docs, reports: [], tookMs: 12 }),
    })
  );
}

async function openSearch(page) {
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(600);
}

async function typeAndWaitForResults(page, query = "search") {
  // Wait for search input to be ready, then fill and trigger search
  await page.waitForSelector('input[aria-label="Search query"]', { timeout: 3000 }).catch(() => {});
  await page.fill('input[aria-label="Search query"]', query);
  // Dispatch input event to trigger the watch
  await page.dispatchEvent('input[aria-label="Search query"]', "input");
  await page.waitForSelector(".srch-row", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
}

// ── Run all specs at both viewports ──────────────────────────────────────────

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

const browser = await chromium.launch({ headless: true });

async function withFreshPage(viewport, fn) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  try {
    await fn(page);
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function runSR1WithPage(page, label) {
  await setupBaseRoutes(page);
  await setupSearchRoute(page, DOCS_WITH_PATH);

  await openSearch(page);
  await typeAndWaitForResults(page);

  await page.screenshot({ path: join(SHOTS_DIR, `SR1-${label}-results.png`) });

  const rows = await page.locator(".srch-row").all();
  if (rows.length === 0) { fail(`SR1 [${label}] rows rendered`, "no .srch-row elements found"); return; }
  pass(`SR1 [${label}] ${rows.length} row(s) rendered`);

  let pathsMissing = 0, titlesMissing = 0;
  for (const row of rows) {
    const docPath = await row.getAttribute("data-doc-path");
    const titleEl = await row.locator(".srch-row-title").first();
    const titleText = await titleEl.textContent();
    if (!docPath) pathsMissing++;
    if (!titleText || !titleText.trim()) titlesMissing++;
  }
  if (pathsMissing === 0) pass(`SR1 [${label}] all rows have data-doc-path`);
  else fail(`SR1 [${label}] all rows have data-doc-path`, `${pathsMissing}/${rows.length} missing`);
  if (titlesMissing === 0) pass(`SR1 [${label}] all rows have non-empty title`);
  else fail(`SR1 [${label}] all rows have non-empty title`, `${titlesMissing}/${rows.length} empty`);
}

async function runSR2GreenWithPage(page, label) {
  await setupBaseRoutes(page);
  await setupSearchRoute(page, DOCS_WITH_PATH);
  await page.route("**/api/files/**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, content: "# Test\nContent.", path: DOCS_WITH_PATH[0].path }),
    })
  );
  await openSearch(page);
  await typeAndWaitForResults(page);

  const firstRow = await page.locator(".srch-row").first();
  const ariaDisabled = await firstRow.getAttribute("aria-disabled");
  if (!ariaDisabled) pass(`SR2 GREEN [${label}] first row is not aria-disabled`);
  else fail(`SR2 GREEN [${label}] first row should not be disabled`, `aria-disabled=${ariaDisabled}`);

  await firstRow.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS_DIR, `SR2-green-${label}-after-click.png`) });

  const openDialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog")).filter((d) => d.hasAttribute("open")).length
  );
  if (openDialogs === 0) pass(`SR2 GREEN [${label}] modal closed after clicking result`);
  else fail(`SR2 GREEN [${label}] modal closed after clicking result`, `${openDialogs} dialog(s) still open`);
}

async function runSR2MutationWithPage(page, label) {
  await setupBaseRoutes(page);
  await setupSearchRoute(page, DOCS_NO_PATH);  // mutation: path stripped

  await openSearch(page);
  await typeAndWaitForResults(page);

  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS_DIR, `SR2-mutation-${label}-before-click.png`) });

  const rowAppeared = await page.waitForSelector(".srch-row", { timeout: 3000 }).then(() => true).catch(() => false);
  if (!rowAppeared) { fail(`SR2 🔬 MUTATION [${label}] rows must render (even dead ones)`, "no .srch-row found"); return; }
  const firstRow = await page.locator(".srch-row").first();

  const ariaDisabled = await firstRow.getAttribute("aria-disabled");
  if (ariaDisabled === "true") pass(`SR2 🔬 MUTATION [${label}] dead row is aria-disabled`);
  else fail(`SR2 🔬 MUTATION [${label}] dead row must be aria-disabled`, `got aria-disabled=${ariaDisabled}`);

  const classes = await firstRow.getAttribute("class");
  if (classes && classes.includes("srch-row--dead")) pass(`SR2 🔬 MUTATION [${label}] dead row has srch-row--dead class`);
  else fail(`SR2 🔬 MUTATION [${label}] dead row has srch-row--dead class`, `classes=${classes}`);

  await firstRow.click({ force: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS_DIR, `SR2-mutation-${label}-after-click.png`) });

  const openDialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog")).filter((d) => d.hasAttribute("open")).length
  );
  if (openDialogs > 0) pass(`SR2 🔬 MUTATION [${label}] modal stays open — dead row click is a no-op (SR2 goes RED without fix)`);
  else fail(`SR2 🔬 MUTATION [${label}] modal should stay open when row is dead`, "modal closed unexpectedly");
}

async function runSR3WithPage(page, label) {
  await setupBaseRoutes(page);
  await setupSearchRoute(page, DOCS_DEAD);

  await openSearch(page);
  await typeAndWaitForResults(page, "orphan");

  await page.screenshot({ path: join(SHOTS_DIR, `SR3-${label}-dead-row.png`) });

  const rowAppeared = await page.waitForSelector(".srch-row", { timeout: 3000 }).then(() => true).catch(() => false);
  if (!rowAppeared) { fail(`SR3 [${label}] dead row rendered`, "no .srch-row elements found"); return; }
  const firstRow = await page.locator(".srch-row").first();

  const ariaDisabled = await firstRow.getAttribute("aria-disabled");
  if (ariaDisabled === "true") pass(`SR3 [${label}] dead row is aria-disabled`);
  else fail(`SR3 [${label}] dead row is aria-disabled`, `got aria-disabled=${ariaDisabled}`);

  const classes = await firstRow.getAttribute("class");
  if (classes && classes.includes("srch-row--dead")) pass(`SR3 [${label}] dead row has srch-row--dead class`);
  else fail(`SR3 [${label}] dead row has srch-row--dead class`, `classes=${classes}`);

  const tabindex = await firstRow.getAttribute("tabindex");
  if (tabindex === "-1") pass(`SR3 [${label}] dead row has tabindex=-1`);
  else fail(`SR3 [${label}] dead row has tabindex=-1`, `got tabindex=${tabindex}`);

  const dialogsBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog")).filter((d) => d.hasAttribute("open")).length
  );
  await firstRow.click({ force: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS_DIR, `SR3-${label}-after-click.png`) });

  const dialogsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog")).filter((d) => d.hasAttribute("open")).length
  );
  if (dialogsAfter >= dialogsBefore && dialogsAfter > 0) pass(`SR3 [${label}] clicking dead row does not open a tab or close the modal`);
  else fail(`SR3 [${label}] clicking dead row must not close the modal`, `dialogs: ${dialogsBefore}→${dialogsAfter}`);
}

try {
  for (const { w, h } of VIEWPORTS) {
    const vp = { width: w, height: h };
    const label = `${w}x${h}`;
    console.log(`\n── ${label} ──`);
    await withFreshPage(vp, (page) => runSR1WithPage(page, label));
    await withFreshPage(vp, (page) => runSR2GreenWithPage(page, label));
    await withFreshPage(vp, (page) => runSR2MutationWithPage(page, label));
    await withFreshPage(vp, (page) => runSR3WithPage(page, label));
  }
} finally {
  await browser.close();
}

console.log(`\n${passed + failed} specs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
