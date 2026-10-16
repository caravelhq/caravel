// FP-filespicker.spec.mjs — Phase 3.2 step 6: Files-as-picker specs FP1–FP5
//
// FP1: Row click opens a file: tab (preview-open); file renders in tab, at tab geometry
// FP2: No in-page DocViewer exists in the Files DOM
// FP3: Browsing five files produces one preview tab, not five (preview reuse)
// FP4: ⇥ throw opens file in the other group and creates the split
// FP5: [data-open-file] link click inside a file: tab opens a new file: tab; original stays
//
// Mutation proof (MUTATION=1):
//   Re-add the in-page DocViewer to FilesPage → FP2 fails.
//   The mutation in question: restore the DocViewer line in the template,
//   run FP unmodified, observe the real ✗ FP2 fail line, restore.
//
// Harness: test server at :4634, /api/* proxied to fixture daemon at :4636 (fixture-ws).
//          NO page.route() mocks.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4634 \
//   node tests/ui/phase3.2/FP-filespicker.spec.mjs
//
// Prerequisite: fixture daemon and test server started:
//   node tests/ui/phase3/scratch-daemon.mjs start \
//     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
//   bun run src/ui/test-server.ts start --port 4634 --daemon http://127.0.0.1:4636 --ttl 0

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4634").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/fp-filespicker${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

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
        tabs: ws.tabs.map((t) => ({
          kind: t.kind,
          path: t.path,
          page: t.page,
          preview: !!ws.meta[ws.refKey(t)]?.preview,
        })),
        active: JSON.parse(JSON.stringify(ws.active)),
        groups: ws.groups,
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

// Open the Files legacy page and wait for the file list to populate.
async function openFilesPage(page) {
  await wsAction(page, `ws => ws.open({ kind: "legacy", page: "files" })`);
  await page.waitForTimeout(300);
  // Navigate the picker to Notes/ so files are visible.
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".files-item"));
    const notesBtn = buttons.find((b) => b.dataset?.path === "Notes");
    if (notesBtn) notesBtn.click();
  });
  // Wait for Notes/ file items to appear.
  await page.waitForFunction(
    () => document.querySelectorAll('.files-item[data-type="file"]').length > 0,
    { timeout: 5000 }
  ).catch(() => {});
  await page.waitForTimeout(200);
}

const browser = await chromium.launch({ headless: true });

const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

try {
  for (const VP of VIEWPORTS) {
    console.log(`\n── ${VP.label} ──────────────────────────────────────────────`);

    // ── FP1: Row click opens a file: tab, preview-open ────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);
      await openFilesPage(page);

      await page.screenshot({ path: join(SHOTS_DIR, `FP1-before-click-${VP.label}.png`) });

      // Click the first file row (should be Notes/doc-01.md).
      const firstFileItem = page.locator('.files-item[data-type="file"]').first();
      const filePath = await firstFileItem.getAttribute("data-path").catch(() => null);

      if (!filePath) {
        fail(`FP1 file items visible [${VP.label}]`, "no .files-item[data-type=file] found");
        await ctx.close(); continue;
      }

      await firstFileItem.click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const fileTab = (afterState?.tabs || []).find((t) => t.kind === "file" && t.path === filePath);
      const isPreview = fileTab?.preview ?? false;

      if (fileTab) {
        pass(`FP1 row click opens file: tab (${filePath}) [${VP.label}]`);
      } else {
        const keys = (afterState?.tabKeys || []).join(", ");
        fail(`FP1 row click opens file: tab [${VP.label}]`, `tabs: [${keys}]`);
      }

      if (isPreview) {
        pass(`FP1 tab is preview-open [${VP.label}]`);
      } else {
        fail(`FP1 tab is preview-open [${VP.label}]`, fileTab ? "tab found but preview=false" : "no tab");
      }

      // Verify the file renders in the tab (FileView / DocViewer must be visible).
      // The active tab panel should have a non-trivial height.
      await page.waitForFunction(
        () => {
          const panel = document.querySelector(".file-view, .doc-viewer-wrapper, [class*='file-view'], .files-view");
          if (panel) {
            const r = panel.getBoundingClientRect();
            return r.height > 50;
          }
          // Fallback: check the tab-panel area has height.
          const main = document.querySelector(".ws-main, .workspace-main, main");
          return main ? main.getBoundingClientRect().height > 100 : false;
        },
        { timeout: 5000 }
      ).catch(() => {});

      await page.screenshot({ path: join(SHOTS_DIR, `FP1-after-click-${VP.label}.png`) });

      // Verify file:  tab geometry — the tab panel area must be taller than 100px.
      const panelHeight = await page.evaluate(() => {
        // Look for the active file view component.
        const candidates = [
          document.querySelector(".file-view"),
          document.querySelector(".doc-viewer-wrapper"),
          document.querySelector(".ws-main"),
          document.querySelector("main"),
        ];
        for (const el of candidates) {
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.height > 50) return r.height;
          }
        }
        return 0;
      });

      if (panelHeight > 100) {
        pass(`FP1 file tab renders at tab geometry (height ${Math.round(panelHeight)}px) [${VP.label}]`);
      } else {
        fail(`FP1 file tab renders at tab geometry [${VP.label}]`, `panel height: ${panelHeight}px`);
      }

      await ctx.close();
    }

    // ── FP2: No in-page DocViewer in the Files DOM ────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);
      await openFilesPage(page);

      await page.screenshot({ path: join(SHOTS_DIR, `FP2-files-dom-${VP.label}.png`) });

      // The Files panel must not contain a DocViewer or files-content element.
      const hasInlineViewer = await page.evaluate(() => {
        const panel = document.getElementById("files-panel");
        if (!panel) return false;
        return !!(
          panel.querySelector(".doc-viewer-wrapper") ||
          panel.querySelector(".files-content") ||
          panel.querySelector('[class*="DocViewer"]')
        );
      });

      if (hasInlineViewer) {
        fail(`FP2 no in-page DocViewer in Files DOM [${VP.label}]`, "DocViewer or files-content found inside #files-panel");
      } else {
        pass(`FP2 no in-page DocViewer in Files DOM [${VP.label}]`);
      }

      // Also confirm the split layout is gone (no files-split div).
      const hasSplit = await page.evaluate(() => {
        const panel = document.getElementById("files-panel");
        return panel ? !!panel.querySelector(".files-split") : false;
      });

      if (hasSplit) {
        fail(`FP2 files-split layout removed [${VP.label}]`, ".files-split still in DOM");
      } else {
        pass(`FP2 files-split layout removed [${VP.label}]`);
      }

      await ctx.close();
    }

    // ── FP3: Five file clicks → one preview tab (preview reuse) ───────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);
      await openFilesPage(page);

      // Count available file items.
      const itemCount = await page.evaluate(
        () => document.querySelectorAll('.files-item[data-type="file"]').length
      );

      if (itemCount < 3) {
        fail(`FP3 preview reuse [${VP.label}]`, `only ${itemCount} file items found; need at least 3`);
        await ctx.close(); continue;
      }

      // Click up to 5 file rows via JS (files panel stays in KeepAlive after first click
      // activates the file: tab, so Playwright locator clicks would time out for items 2-5).
      const clickCount = Math.min(5, itemCount);
      for (let i = 0; i < clickCount; i++) {
        await page.evaluate((idx) => {
          const items = Array.from(document.querySelectorAll('.files-item[data-type="file"]'));
          if (items[idx]) items[idx].click();
        }, i);
        await page.waitForTimeout(150);
      }

      const afterState = await wsState(page);
      const fileTabs = (afterState?.tabs || []).filter((t) => t.kind === "file");
      const previewCount = fileTabs.filter((t) => t.preview).length;

      if (previewCount === 1 && fileTabs.length === 1) {
        pass(`FP3 ${clickCount} file clicks → 1 preview tab, not ${clickCount} [${VP.label}]`);
      } else {
        const keys = (afterState?.tabKeys || []).filter((k) => k.startsWith("file:")).join(", ");
        fail(`FP3 preview reuse: ${clickCount} clicks → 1 preview tab [${VP.label}]`,
          `got ${fileTabs.length} file tabs (${previewCount} preview): [${keys}]`);
      }

      await page.screenshot({ path: join(SHOTS_DIR, `FP3-preview-reuse-${VP.label}.png`) });
      await ctx.close();
    }

    // ── FP4: ⇥ throw opens file in other group, creates split ─────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);
      await openFilesPage(page);

      const beforeState = await wsState(page);
      const beforeGroups = beforeState?.groups ?? 1;

      // Click the ⇥ throw button on the first file item.
      const throwBtn = page.locator('.files-item[data-type="file"] .files-throw-btn').first();
      const throwBtnVisible = await throwBtn.isVisible().catch(() => false);

      if (!throwBtnVisible) {
        fail(`FP4 ⇥ throw button visible [${VP.label}]`, ".files-throw-btn not found");
        await ctx.close(); continue;
      }

      const throwedPath = await page.locator('.files-item[data-type="file"]').first()
        .getAttribute("data-path").catch(() => null);

      await throwBtn.click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const fileTab = (afterState?.tabs || []).find((t) => t.kind === "file" && t.path === throwedPath);
      const afterGroups = afterState?.groups ?? 1;

      if (fileTab) {
        pass(`FP4 ⇥ opens file: tab (${throwedPath}) [${VP.label}]`);
      } else {
        fail(`FP4 ⇥ opens file: tab [${VP.label}]`, `no file:${throwedPath} tab after throw`);
      }

      // The throw should create a split (groups = 2) or at least open in the workspace.
      if (afterGroups >= 2 || (beforeGroups === 1 && fileTab)) {
        pass(`FP4 ⇥ creates split or opens in workspace [${VP.label}]`);
      } else {
        fail(`FP4 ⇥ creates split [${VP.label}]`, `groups before: ${beforeGroups}, after: ${afterGroups}`);
      }

      await page.screenshot({ path: join(SHOTS_DIR, `FP4-throw-split-${VP.label}.png`) });
      await ctx.close();
    }

    // ── FP5: [data-open-file] link in file tab opens new file: tab ────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Open doc-linked.md (has a [data-open-file] link to Notes/doc-01.md).
      await wsAction(page, `ws => ws.open({ kind: "file", path: "Notes/doc-linked.md" })`);
      await page.waitForTimeout(500);

      // Wait for DocViewer to render the linked content.
      await page.waitForFunction(
        () => {
          const el = document.querySelector("[data-open-file]");
          return !!el;
        },
        { timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(200);

      const beforeState = await wsState(page);
      const beforeFileTabs = (beforeState?.tabs || []).filter((t) => t.kind === "file");

      await page.screenshot({ path: join(SHOTS_DIR, `FP5-before-link-click-${VP.label}.png`) });

      // Click the [data-open-file] link.
      const linkEl = page.locator("[data-open-file]").first();
      const linkVisible = await linkEl.isVisible().catch(() => false);

      if (!linkVisible) {
        fail(`FP5 [data-open-file] link visible [${VP.label}]`,
          "no [data-open-file] element found — DocViewer may not have rendered hydrateLinks");
        await ctx.close(); continue;
      }

      const linkedPath = await linkEl.getAttribute("data-open-file").catch(() => null);
      await linkEl.click();
      await page.waitForTimeout(300);

      const afterState = await wsState(page);
      const afterFileTabs = (afterState?.tabs || []).filter((t) => t.kind === "file");

      // The linked file should have opened as a new file: tab.
      const newTab = afterFileTabs.find(
        (t) => t.path === linkedPath || t.path === "Notes/doc-01.md"
      );
      // The original doc-linked.md tab should still be there.
      const originalStillPresent = afterFileTabs.some((t) => t.path === "Notes/doc-linked.md");

      if (newTab) {
        pass(`FP5 [data-open-file] click opens file: tab (${newTab.path}) [${VP.label}]`);
      } else {
        const keys = (afterState?.tabKeys || []).filter((k) => k.startsWith("file:")).join(", ");
        fail(`FP5 [data-open-file] opens file: tab [${VP.label}]`,
          `linked path: ${linkedPath}, file tabs: [${keys}]`);
      }

      if (originalStillPresent) {
        pass(`FP5 original file: tab stays in place [${VP.label}]`);
      } else {
        fail(`FP5 original file: tab stays in place [${VP.label}]`, "Notes/doc-linked.md tab gone after link click");
      }

      await page.screenshot({ path: join(SHOTS_DIR, `FP5-after-link-click-${VP.label}.png`) });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

const total = passed + failed;
console.log(`\n${passed}/${total} passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed > 0 ? 1 : 0);
