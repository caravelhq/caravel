// TL-tablifecycle.spec.mjs — Phase 3.2 node 1: tab lifecycle specs TL1–TL8
//
// TL1: A preview open reuses the group's preview slot in place: 5 opens → 1 transient tab
// TL2: Double-click (pin) survives the next preview open; store shows pinned flag
// TL3: closeOthers keeps the target and every pinned tab; closes the rest
// TL4: closeToRight respects group boundaries under split
// TL5: The 13th non-pinned open evicts the least-recently-activated, never either active tab;
//      evicted ref appears in recents
// TL6: Pinned-only overflow logs [workspace] tab cap exceeded: all tabs pinned once per episode
// TL7: Preview reuse leaves no stale [data-key] in the strip (DEC-0029 refKey cache key)
// TL8: Reload restores tabs, pin/preview state, split, focused, and both active refs
//
// Harness: dev server at :4633 — corpus-independent (DEC-0028)
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase3.2/TL-tablifecycle.spec.mjs
//
// Mutation proof (TL1 --mut):
//   Run with MUTATION=1 after commenting out the preview-reuse branch in open().
//   Expects TL1 to fail with N tabs for N opens.

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/tl-tablifecycle${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── helpers ───────────────────────────────────────────────────────────────────

// Access the workspace store via Pinia's internal store map.
// Falls back to null if unavailable (production build without devtools).
async function getWsStore(page) {
  return page.evaluate(() => {
    try {
      // Prefer Pinia's globalProperties injection
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia
        ?? window.__pinia;
      return pinia?._s?.get("workspace") ?? null;
    } catch { return null; }
  });
}

// Call a store action and return its result (serialisable values only).
async function wsAction(page, fn) {
  return page.evaluate((fnStr) => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return { error: "no store" };
      // eslint-disable-next-line no-new-func
      return new Function("ws", `return (${fnStr})(ws)`)(ws);
    } catch (e) { return { error: String(e) }; }
  }, fn.toString());
}

// Read store state as a plain object.
async function wsState(page) {
  return page.evaluate(() => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return null;
      return {
        tabKeys: ws.tabs.map(t => ws.refKey(t)),
        active: [ws.active[0], ws.active[1]],
        focused: ws.focused,
        metaKeys: Object.keys(ws.meta),
        previewKeys: Object.entries(ws.meta).filter(([, m]) => m.preview).map(([k]) => k),
        pinnedKeys: Object.entries(ws.meta).filter(([, m]) => m.pinned).map(([k]) => k),
        recentKeys: ws.recents.map(r => ws.refKey(r)),
        splitOn: ws.splitOn,
        splitIndex: ws.splitIndex,
      };
    } catch (e) { return { error: String(e) }; }
  });
}

// Reset workspace to only Dashboard, then reload.
async function resetWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

// Count [data-key] elements (tab buttons in the strip).
async function tabDataKeys(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-key]")).map(el => el.dataset.key)
  );
}

const browser = await chromium.launch({ headless: true });

// Run each suite at both viewports.
const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

try {
  for (const VP of VIEWPORTS) {
    console.log(`\n── ${VP.label} ──────────────────────────────────────────────`);

    // ──────────────────────────────────────────────────────────────────────────
    // TL1 — Preview open reuses the group's preview slot in place
    // 5 distinct file refs opened as preview → still exactly 2 tabs (Dashboard + 1 preview)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      const PREVIEW_COUNT = 5;
      const paths = Array.from({ length: PREVIEW_COUNT }, (_, i) => `test-preview-${i}.md`);

      for (const path of paths) {
        await wsAction(page, `(ws) => ws.open({ kind: 'file', path: '${path}' }, { preview: true })`);
        await page.waitForTimeout(50);
      }

      const state = await wsState(page);
      const domKeys = await tabDataKeys(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-01-tl1-preview-reuse.png`) });

      // Same assertions in normal and mutation runs.
      // Under mutation (preview-reuse branch disabled), tabCount will be 6 → fails here.
      const tabCount = state?.tabKeys?.length;
      if (tabCount === 2) {
        pass(`TL1 ${VP.label}: 5 preview opens → 2 tabs (slot reused)`);
      } else {
        fail(`TL1 ${VP.label}: expected 2 tabs after 5 preview opens`, `got ${tabCount} tabs: ${state?.tabKeys?.join(", ")}`);
      }

      // Preview flag should be set on the last opened path
      const lastPreviewKey = `file:${paths[PREVIEW_COUNT - 1]}`;
      if (state?.previewKeys?.includes(lastPreviewKey)) {
        pass(`TL1 ${VP.label}: last preview has preview flag set`);
      } else {
        fail(`TL1 ${VP.label}: expected preview flag on ${lastPreviewKey}`, `previewKeys: ${state?.previewKeys?.join(", ")}`);
      }

      // DOM [data-key] should show the last preview key
      if (domKeys.includes(lastPreviewKey)) {
        pass(`TL1 ${VP.label}: [data-key="${lastPreviewKey}"] present in DOM`);
      } else {
        fail(`TL1 ${VP.label}: expected [data-key="${lastPreviewKey}"] in DOM`, `found: ${domKeys.join(", ")}`);
      }

      // The first 4 keys should NOT be in the DOM
      const staleKeys = paths.slice(0, PREVIEW_COUNT - 1).map(p => `file:${p}`);
      const staleInDom = staleKeys.filter(k => domKeys.includes(k));
      if (staleInDom.length === 0) {
        pass(`TL1 ${VP.label}: no stale preview keys in DOM`);
      } else {
        fail(`TL1 ${VP.label}: stale preview keys still in DOM`, staleInDom.join(", "));
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL2 — pin() marks the tab as pinned; pinned tab survives the next preview open
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Open a file as preview, then pin it (simulates double-click)
      await wsAction(page, `(ws) => ws.open({ kind: 'file', path: 'pinme.md' }, { preview: true })`);
      await page.waitForTimeout(50);
      await wsAction(page, `(ws) => ws.pin('file:pinme.md')`);
      await page.waitForTimeout(50);

      const stateAfterPin = await wsState(page);
      const pinnedKey = "file:pinme.md";

      // Pin clears preview and sets pinned
      const isPinned = stateAfterPin?.pinnedKeys?.includes(pinnedKey);
      const wasPreview = stateAfterPin?.previewKeys?.includes(pinnedKey);
      if (isPinned && !wasPreview) {
        pass(`TL2 ${VP.label}: pin() sets pinned, clears preview`);
      } else {
        fail(`TL2 ${VP.label}: expected pinned=true preview=false`, `pinned=${isPinned} preview=${wasPreview}`);
      }

      // Open another file as preview — should open a NEW slot (no existing preview)
      await wsAction(page, `(ws) => ws.open({ kind: 'file', path: 'other.md' }, { preview: true })`);
      await page.waitForTimeout(50);

      const stateAfterNextPreview = await wsState(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-02-tl2-pin-survives-preview.png`) });

      // Pinned tab should still be present
      if (stateAfterNextPreview?.tabKeys?.includes(pinnedKey)) {
        pass(`TL2 ${VP.label}: pinned tab survives next preview open`);
      } else {
        fail(`TL2 ${VP.label}: pinned tab evicted by next preview open`, `tabs: ${stateAfterNextPreview?.tabKeys?.join(", ")}`);
      }

      // New preview tab should exist at a separate slot
      const newPreviewKey = "file:other.md";
      if (stateAfterNextPreview?.previewKeys?.includes(newPreviewKey)) {
        pass(`TL2 ${VP.label}: new preview tab opened as separate slot`);
      } else {
        fail(`TL2 ${VP.label}: expected new preview slot at ${newPreviewKey}`, `previewKeys: ${stateAfterNextPreview?.previewKeys?.join(", ")}`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL3 — closeOthers keeps the target and every pinned tab; closes the rest
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Open 4 tabs: dashboard (already open), pin one, open target, open 2 others
      await wsAction(page, `(ws) => { ws.open({kind:'file',path:'pinned.md'}); ws.pin('file:pinned.md'); }`);
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'target.md'})`);
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'other1.md'})`);
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'other2.md'})`);
      await page.waitForTimeout(100);

      const stateBefore = await wsState(page);
      const tabCountBefore = stateBefore?.tabKeys?.length;

      await wsAction(page, `(ws) => ws.closeOthers('file:target.md')`);
      await page.waitForTimeout(50);

      const stateAfter = await wsState(page);
      const domKeys = await tabDataKeys(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-03-tl3-close-others.png`) });

      // target and pinned should remain; dashboard is in a different group (not affected)
      // Actually dashboard is in group 0, target and others are also group 0 here
      // closeOthers closes non-pinned in same group except target → keeps target + pinned.md
      const targetPresent = stateAfter?.tabKeys?.includes("file:target.md");
      const pinnedPresent = stateAfter?.tabKeys?.includes("file:pinned.md");
      const other1Gone = !stateAfter?.tabKeys?.includes("file:other1.md");
      const other2Gone = !stateAfter?.tabKeys?.includes("file:other2.md");

      if (targetPresent) pass(`TL3 ${VP.label}: target tab kept`);
      else fail(`TL3 ${VP.label}: target tab kept`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);

      if (pinnedPresent) pass(`TL3 ${VP.label}: pinned tab kept`);
      else fail(`TL3 ${VP.label}: pinned tab kept`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);

      if (other1Gone && other2Gone) pass(`TL3 ${VP.label}: non-pinned others closed`);
      else fail(`TL3 ${VP.label}: non-pinned others closed`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);

      // Closed tabs should appear in recents
      const recentsHasOther1 = stateAfter?.recentKeys?.includes("file:other1.md");
      const recentsHasOther2 = stateAfter?.recentKeys?.includes("file:other2.md");
      if (recentsHasOther1 && recentsHasOther2) {
        pass(`TL3 ${VP.label}: closed tabs pushed to recents`);
      } else {
        fail(`TL3 ${VP.label}: closed tabs in recents`, `recents: ${stateAfter?.recentKeys?.join(", ")}`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL4 — closeToRight respects group boundaries under split
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Build: group0=[dashboard, a, b], group1=[c, d, e]  with split
      await wsAction(page, `(ws) => { ws.open({kind:'file',path:'a.md'}); ws.open({kind:'file',path:'b.md'}); }`);
      await wsAction(page, `(ws) => { ws.open({kind:'file',path:'c.md'},{side:true}); }`);
      await wsAction(page, `(ws) => { ws.open({kind:'file',path:'d.md'}); ws.open({kind:'file',path:'e.md'}); }`);
      await page.waitForTimeout(100);

      const stateSetup = await wsState(page);
      // closeToRight on 'file:a.md' (in group0) should close 'file:b.md' but NOT c/d/e
      await wsAction(page, `(ws) => ws.closeToRight('file:a.md')`);
      await page.waitForTimeout(50);

      const stateAfter = await wsState(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-04-tl4-close-to-right.png`) });

      const aPresent = stateAfter?.tabKeys?.includes("file:a.md");
      const bGone = !stateAfter?.tabKeys?.includes("file:b.md");
      // Group 1 tabs should be untouched
      const cPresent = stateAfter?.tabKeys?.includes("file:c.md");
      const dPresent = stateAfter?.tabKeys?.includes("file:d.md");
      const ePresent = stateAfter?.tabKeys?.includes("file:e.md");

      if (aPresent) pass(`TL4 ${VP.label}: target (a.md) kept`);
      else fail(`TL4 ${VP.label}: target (a.md) kept`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);

      if (bGone) pass(`TL4 ${VP.label}: b.md closed (to the right of a.md in group0)`);
      else fail(`TL4 ${VP.label}: b.md should be closed`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);

      if (cPresent && dPresent && ePresent) {
        pass(`TL4 ${VP.label}: group1 tabs (c,d,e) untouched — group boundary respected`);
      } else {
        fail(`TL4 ${VP.label}: group1 tabs should be untouched`, `c=${cPresent} d=${dPresent} e=${ePresent}`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL5 — 13th non-pinned open evicts the least-recently-activated;
    //        never evicts either group's active tab; evicted ref appears in recents
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Open 12 non-pinned tabs (dashboard already open = tab 1, open 11 more)
      for (let i = 1; i <= 11; i++) {
        await wsAction(page, `(ws) => ws.open({kind:'file',path:'file${i}.md'})`);
        await page.waitForTimeout(30);
      }

      // Now activate tabs in a specific order to control LRU:
      // Activate file1 LAST so file2 is the least-recently-activated non-active candidate.
      // Active[0] will be whatever open() last set it to (file11).
      // We want to set up: file2 is the LRU candidate (activated earliest).
      // open() touches each tab on open, so touch order = open order.
      // file1.md was opened first (touched earliest), file11.md last.
      // active[0] = file11.md (last opened).
      // So eviction candidate should be file1.md (touched=lowest among non-active).
      // But dashboard is at touched=0 (migration default) — check dashboard isn't active.
      // dashboard is active[0] initially, but after opening file1..11, active[0] = file11.
      // Actually: open() sets active on each call. dashboard starts as active[0]=dashboard.
      // After open(file1), active[0]=file1. After open(file2), active[0]=file2. ... file11=active.
      // So file11 is in activeKeys set. Dashboard is NOT in activeKeys.
      // Candidates: all non-pinned, non-preview, not in active[0]/active[1].
      // active[0] = file11, active[1] = null.
      // Dashboard touched = 0 (load-time default, no touchTab called on init).
      // file1 touched = 1 (first open). Dashboard touched = 0.
      // So eviction candidate = dashboard (touched=0, lowest).
      // Let's activate dashboard explicitly to give it a higher touched, making file1 LRU.
      await wsAction(page, `(ws) => ws.activate('dashboard')`);
      await page.waitForTimeout(30);
      // Now: dashboard.touched is high, file1.touched is lowest, active[0]=dashboard.
      // Active[0] = dashboard, so dashboard is in activeKeys → not a candidate.
      // file1 has the lowest touched among candidates. Opening file12 should evict file1.
      // Also activate file11 to keep it in active, then add file12.
      await wsAction(page, `(ws) => ws.activate('file:file11.md')`);
      await page.waitForTimeout(30);
      // Now active[0]=file11.md (highest touched candidate group). file1 is LRU.

      const stateBeforeEvict = await wsState(page);

      // Open the 13th non-pinned tab
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'file12.md'})`);
      await page.waitForTimeout(100);

      const stateAfter = await wsState(page);
      const domKeys = await tabDataKeys(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-05-tl5-eviction.png`) });

      // file12 should be present
      if (stateAfter?.tabKeys?.includes("file:file12.md")) {
        pass(`TL5 ${VP.label}: file12 (13th tab) opened successfully`);
      } else {
        fail(`TL5 ${VP.label}: file12 not found`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);
      }

      // file1 should have been evicted (LRU, lowest touched, not active)
      const file1Evicted = !stateAfter?.tabKeys?.includes("file:file1.md");
      if (file1Evicted) {
        pass(`TL5 ${VP.label}: file1 evicted (LRU)`);
      } else {
        fail(`TL5 ${VP.label}: file1 should be evicted (LRU)`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);
      }

      // Neither active[0] (file12 after open, or dashboard if bg) should be evicted
      // active[0] was file11.md when we opened file12 — file12 becomes active[0] after open
      // file11 should NOT be evicted
      const file11Present = stateAfter?.tabKeys?.includes("file:file11.md");
      if (file11Present) {
        pass(`TL5 ${VP.label}: active tab (file11) not evicted`);
      } else {
        fail(`TL5 ${VP.label}: active tab (file11) should not be evicted`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);
      }

      // Evicted file1 should appear in recents
      if (stateAfter?.recentKeys?.includes("file:file1.md")) {
        pass(`TL5 ${VP.label}: evicted file1 appears in recents`);
      } else {
        fail(`TL5 ${VP.label}: evicted file1 should appear in recents`, `recents: ${stateAfter?.recentKeys?.join(", ")}`);
      }

      // [data-key="file:file1.md"] should be absent from DOM
      if (!domKeys.includes("file:file1.md")) {
        pass(`TL5 ${VP.label}: [data-key="file:file1.md"] absent from DOM after eviction`);
      } else {
        fail(`TL5 ${VP.label}: [data-key="file:file1.md"] should be absent after eviction`, `found in DOM`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL6 — Pinned-only overflow: list grows past cap and logs once per episode
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Collect console.warn calls
      const warnMessages = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning") warnMessages.push(msg.text());
      });

      // Pin 12 tabs (dashboard + 11 more pinned)
      await wsAction(page, `(ws) => ws.pin('dashboard')`);
      for (let i = 1; i <= 11; i++) {
        await wsAction(page, `(ws) => { ws.open({kind:'file',path:'pinned${i}.md'}); ws.pin('file:pinned${i}.md'); }`);
        await page.waitForTimeout(30);
      }

      const stateAt12 = await wsState(page);
      const countAt12 = stateAt12?.tabKeys?.length;

      // Open a 13th tab (all 12 are pinned — nothing evictable)
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'overflow.md'})`);
      await page.waitForTimeout(200);

      const stateAfter = await wsState(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-06-tl6-pinned-overflow.png`) });

      // List should grow past cap (13 tabs total)
      if (stateAfter?.tabKeys?.length > 12) {
        pass(`TL6 ${VP.label}: list grew past cap (${stateAfter?.tabKeys?.length} tabs, all pinned path)`);
      } else {
        fail(`TL6 ${VP.label}: expected >12 tabs with all-pinned`, `got ${stateAfter?.tabKeys?.length}`);
      }

      // overflow.md should be present (not evicted since nothing was evictable)
      if (stateAfter?.tabKeys?.includes("file:overflow.md")) {
        pass(`TL6 ${VP.label}: overflow tab present`);
      } else {
        fail(`TL6 ${VP.label}: overflow tab should be present`, `tabs: ${stateAfter?.tabKeys?.join(", ")}`);
      }

      // Console warn should have fired
      const capWarn = warnMessages.find(m => m.includes("[workspace] tab cap exceeded"));
      if (capWarn) {
        pass(`TL6 ${VP.label}: [workspace] tab cap exceeded warn logged`);
      } else {
        fail(`TL6 ${VP.label}: expected warn '[workspace] tab cap exceeded'`, `warns: ${warnMessages.join("; ")}`);
      }

      // Opening a second overflow should NOT fire the warn again (once per episode)
      const warnCountBefore = warnMessages.filter(m => m.includes("[workspace] tab cap exceeded")).length;
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'overflow2.md'})`);
      await page.waitForTimeout(200);
      const warnCountAfter = warnMessages.filter(m => m.includes("[workspace] tab cap exceeded")).length;
      if (warnCountAfter === warnCountBefore) {
        pass(`TL6 ${VP.label}: warn fires once per episode (not again on second overflow)`);
      } else {
        fail(`TL6 ${VP.label}: warn should fire once per episode`, `fired ${warnCountAfter - warnCountBefore} more time(s)`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL7 — Preview reuse leaves no stale [data-key] in the strip (DEC-0029)
    //        refKey cache key: a preview reuse is a ref swap → new cache key → no stale entry
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Open file A as preview
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'cache-a.md'},{preview:true})`);
      await page.waitForTimeout(100);

      const keysAfterA = await tabDataKeys(page);
      const hasA = keysAfterA.includes("file:cache-a.md");
      if (hasA) pass(`TL7 ${VP.label}: [data-key="file:cache-a.md"] appears after first preview open`);
      else fail(`TL7 ${VP.label}: expected [data-key="file:cache-a.md"] after first preview`, `keys: ${keysAfterA.join(", ")}`);

      // Reuse: open file B as preview (replaces A's slot)
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'cache-b.md'},{preview:true})`);
      await page.waitForTimeout(100);

      const keysAfterB = await tabDataKeys(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-07-tl7-keepalive-no-stale.png`) });

      // A should be gone from DOM (its cache key was evicted from the strip)
      if (!keysAfterB.includes("file:cache-a.md")) {
        pass(`TL7 ${VP.label}: stale [data-key="file:cache-a.md"] removed after preview reuse`);
      } else {
        fail(`TL7 ${VP.label}: stale key should be gone after reuse`, `keys: ${keysAfterB.join(", ")}`);
      }

      // B should be present at the SAME strip position (only 2 tabs: dashboard + preview)
      if (keysAfterB.includes("file:cache-b.md")) {
        pass(`TL7 ${VP.label}: [data-key="file:cache-b.md"] present after reuse`);
      } else {
        fail(`TL7 ${VP.label}: expected new preview key in DOM`, `keys: ${keysAfterB.join(", ")}`);
      }

      // Tab count stays at 2 (Dashboard + 1 preview — refKey cache key, DEC-0029)
      const state = await wsState(page);
      if (state?.tabKeys?.length === 2) {
        pass(`TL7 ${VP.label}: tab count stays 2 after reuse (refKey cache key — DEC-0029 confirmed)`);
      } else {
        fail(`TL7 ${VP.label}: expected 2 tabs after reuse`, `got ${state?.tabKeys?.length}`);
      }

      await page.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TL8 — Reload restores tabs, pin/preview state, split, focused, both active refs
    // ──────────────────────────────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: VP });
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
      await resetWorkspace(page);

      // Set up a specific state: 3 tabs with split, pin one, one preview, focused=1
      await wsAction(page, `(ws) => { ws.open({kind:'file',path:'persist-a.md'}); ws.pin('file:persist-a.md'); }`);
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'persist-b.md'},{side:true})`);
      await wsAction(page, `(ws) => ws.open({kind:'file',path:'persist-c.md'},{preview:true})`);
      await page.waitForTimeout(100);

      const stateBefore = await wsState(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-08-tl8-before-reload.png`) });

      // Reload
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const stateAfter = await wsState(page);
      const domKeysAfter = await tabDataKeys(page);
      await page.screenshot({ path: join(SHOTS_DIR, `${VP.label}-09-tl8-after-reload.png`) });

      // Tabs should be restored
      const tabsRestored = stateBefore?.tabKeys?.every(k => stateAfter?.tabKeys?.includes(k));
      if (tabsRestored) {
        pass(`TL8 ${VP.label}: all tabs restored after reload`);
      } else {
        fail(`TL8 ${VP.label}: tabs not fully restored`, `before: ${stateBefore?.tabKeys?.join(", ")} after: ${stateAfter?.tabKeys?.join(", ")}`);
      }

      // Pinned state restored
      const pinnedRestored = stateAfter?.pinnedKeys?.includes("file:persist-a.md");
      if (pinnedRestored) pass(`TL8 ${VP.label}: pinned state restored`);
      else fail(`TL8 ${VP.label}: pinned state not restored`, `pinnedKeys: ${stateAfter?.pinnedKeys?.join(", ")}`);

      // Preview state restored
      const previewRestored = stateAfter?.previewKeys?.includes("file:persist-c.md");
      if (previewRestored) pass(`TL8 ${VP.label}: preview state restored`);
      else fail(`TL8 ${VP.label}: preview state not restored`, `previewKeys: ${stateAfter?.previewKeys?.join(", ")}`);

      // Split restored
      const splitRestored = stateAfter?.splitOn === stateBefore?.splitOn;
      if (splitRestored) pass(`TL8 ${VP.label}: split state restored (splitOn=${stateAfter?.splitOn})`);
      else fail(`TL8 ${VP.label}: split state not restored`, `before=${stateBefore?.splitOn} after=${stateAfter?.splitOn}`);

      // Focused group restored (default 0 clamped to non-empty)
      const focusedOk = typeof stateAfter?.focused === "number" && stateAfter.focused >= 0;
      if (focusedOk) pass(`TL8 ${VP.label}: focused restored (focused=${stateAfter?.focused})`);
      else fail(`TL8 ${VP.label}: focused not restored`, `focused=${stateAfter?.focused}`);

      // Active refs restored
      const active0Restored = stateAfter?.active?.[0] === stateBefore?.active?.[0];
      const active1Restored = stateAfter?.active?.[1] !== undefined;
      if (active0Restored) pass(`TL8 ${VP.label}: active[0] restored`);
      else fail(`TL8 ${VP.label}: active[0] not restored`, `before=${stateBefore?.active?.[0]} after=${stateAfter?.active?.[0]}`);

      await page.close();
    }

  } // end viewport loop

} catch (e) {
  fail("spec runtime error", String(e));
} finally {
  await browser.close();
}

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
console.log(`Screenshots: ${SHOTS_DIR}`);
if (failed > 0) process.exit(1);
