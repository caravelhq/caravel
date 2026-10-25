// WAL-156-route-tree.spec.mjs — post-Phase-5 bugfixes 1d and 1e
//
// 1d: Unassigned project route (/project/ with empty slug) must load
//     the real ProjectView with title "(Unassigned)", not redirect to dashboard.
//     Two bugs: (a) route `:slug(.*)` needed to match empty param; (b) fetch
//     guard `if (!s)` blocked the API call for empty slug.
// 1e: ProjectView must render nested children past depth 1.
//     The old template only showed depth-0 roots and their depth-1 children.
//     Fix: recursive flattenFamily walk so multi-level trees fully render.
//
// Run:
//   CARAVEL_BASE=http://127.0.0.1:4633 node tests/ui/phase5/WAL-156-route-tree.spec.mjs

import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { chromium } from "file:///home/walter/workspace/.claude/skills/ui-test/node_modules/playwright/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SHOTS_DIR = join(__dirname, ".runs/WAL-156-route-tree");
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const allShots = [];

function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }
function shot(name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  allShots.push(p);
  return p;
}

const browser = await chromium.launch({ headless: true });

// ── D4: Unassigned project route (/project/ with empty slug) ─────────────────

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── D4: Unassigned project route ─────────────────────────────────────────");

  await page.goto(`${BASE}/#/project/`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: shot("d4-01-unassigned-loading") });

  // Must not have redirected to dashboard
  const url = page.url();
  console.log(`  URL after nav: ${url}`);
  if (url.includes("#/dashboard") || url.endsWith("#/") || url.endsWith("#")) {
    fail("D4-1 /project/ doesn't redirect to dashboard", `URL is ${url}`);
  } else {
    pass("D4-1 /project/ stayed on project route");
  }

  // ProjectView must be visible (not the dashboard widget grid)
  const pvRoot = page.locator(".pv-root").first();
  const pvVisible = await pvRoot.isVisible().catch(() => false);
  if (!pvVisible) {
    fail("D4-2 .pv-root visible", "not found — page did not render ProjectView");
    await ctx.close();
  } else {
    pass("D4-2 .pv-root visible (ProjectView rendered)");

    // Geometry: must be a real panel, not a collapsed 0-height placeholder
    const box = await pvRoot.boundingBox();
    console.log(`  .pv-root bounding box: ${JSON.stringify(box)}`);
    if (box && box.height > 100) {
      pass(`D4-3 .pv-root has real height (${box.height.toFixed(0)}px)`);
    } else {
      fail("D4-3 .pv-root has real height", `got ${box?.height ?? 0}px`);
    }

    // Must show project content — NOT the "Loading…" spinner
    const loading = page.locator(".pv-loading").first();
    const stillLoading = await loading.isVisible().catch(() => false);
    if (stillLoading) {
      fail("D4-4 project content loaded (not stuck on Loading)", "pv-loading spinner still visible — fetch guard may be blocking empty slug");
    } else {
      pass("D4-4 project content loaded (not stuck on Loading)");

      // Title must be "(Unassigned)"
      const title = page.locator(".pv-title").first();
      const titleText = await title.textContent().catch(() => "");
      console.log(`  .pv-title text: "${titleText?.trim()}"`);
      if (titleText?.trim() === "(Unassigned)") {
        pass("D4-5 project title is '(Unassigned)'");
      } else {
        fail("D4-5 project title is '(Unassigned)'", `got "${titleText?.trim()}"`);
      }
    }

    await page.screenshot({ path: shot("d4-02-final") });
  }

  await ctx.close();
}

// ── D5: ProjectView renders tasks beyond depth 1 (recursive family tree) ──────
//
// API-confirmed family structure (from GET /api/projects/Caravel-Vue):
//   TSK-2026-10-25-0002 (root, parent=null) → Caravel-Vue
//     TSK-2026-10-25-0003 (parent=0002) ← depth-1 child
//       TSK-2026-10-25-0003.01 (parent=.0003) ← depth-2 grandchild
//         TSK-2026-10-25-0003.02 (parent=.01) ← depth-3
//           ...
//
// Pre-fix: template only rendered depth 0 (0002) and depth 1 (0003).
//   Expanding 0002 showed 0003 but 0003 had no chevron, so 0003.01 was unreachable.
// After fix: recursive flattenFamily → expanding 0003 now shows 0003.01.
// Key assertion: click 0002 chevron → 0003 appears; click 0003 chevron → 0003.01 appears.

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── D5: ProjectView recursive child rendering ─────────────────────────────");

  await page.goto(`${BASE}/#/project/Caravel-Vue`);
  await page.waitForSelector(".pv-title", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot("d5-01-project-page") });

  const pvTrees = page.locator(".pv-trees").first();
  const treesVisible = await pvTrees.isVisible().catch(() => false);
  if (!treesVisible) {
    fail("D5-0 family trees section visible", "no .pv-trees found");
    await ctx.close();
  } else {
    pass("D5-0 family trees section visible");

    // TSK-2026-10-25-0002 is a root (depth 0) in the tree.
    // It should have a chevron because TSK-2026-10-25-0003 is its child.
    const row0002 = page.locator('[data-task-id="TSK-2026-10-25-0002"]').first();
    await row0002.scrollIntoViewIfNeeded().catch(() => {});
    const row0002Visible = await row0002.isVisible().catch(() => false);
    if (!row0002Visible) {
      fail("D5-1 TSK-2026-10-25-0002 root row found", "row not in DOM");
      await ctx.close();
    } else {
      pass("D5-1 TSK-2026-10-25-0002 root row found");

      // Should have a chevron (has children)
      const chev0002 = row0002.locator("button.tasks-tree-chevron").first();
      const chev0002Visible = await chev0002.isVisible().catch(() => false);
      console.log(`  .0002 chevron visible: ${chev0002Visible}`);
      if (!chev0002Visible) {
        fail("D5-2 .0002 has expand chevron", "no tasks-tree-chevron — may have no children in this build");
        await ctx.close();
      } else {
        pass("D5-2 .0002 has expand chevron (has depth-1 children)");

        // Expand .0002 → .0003 should appear
        await chev0002.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: shot("d5-02-expanded-0002") });

        const row0003 = page.locator('[data-task-id="TSK-2026-10-25-0003"]').first();
        const row0003Visible = await row0003.isVisible().catch(() => false);
        console.log(`  TSK-2026-10-25-0003 visible after expanding .0002: ${row0003Visible}`);
        if (!row0003Visible) {
          fail("D5-3 .0003 visible after expanding .0002", "TSK-2026-10-25-0003 not found as depth-1 child");
        } else {
          pass("D5-3 .0003 visible as depth-1 child of .0002");

          const box0003 = await row0003.boundingBox();
          console.log(`  .0003 bounding box: ${JSON.stringify(box0003)}`);
          if (box0003 && box0003.height > 0) {
            pass(`D5-4 .0003 has non-zero height (${box0003.height.toFixed(0)}px)`);
          } else {
            fail("D5-4 .0003 has non-zero height", `got ${box0003?.height ?? 0}px`);
          }

          // Key recursive assertion: .0003 must also have a chevron so its children can expand.
          // Before fix: .0003 was only rendered at depth-1 with no @toggle, no hasChildren.
          // After fix: flattenFamily gives it hasChildren=true and @toggle so depth-2 is reachable.
          const chev0003 = row0003.locator("button.tasks-tree-chevron").first();
          const chev0003Visible = await chev0003.isVisible().catch(() => false);
          console.log(`  .0003 chevron visible: ${chev0003Visible}`);
          if (!chev0003Visible) {
            fail("D5-5 .0003 has expand chevron", "no chevron on depth-1 child — recursive rendering NOT working (pre-fix symptom)");
          } else {
            pass("D5-5 .0003 has expand chevron at depth 1 (recursive rendering working)");

            // Expand .0003 → .0003.01 should appear at depth 2
            await chev0003.click();
            await page.waitForTimeout(600);
            await page.screenshot({ path: shot("d5-03-expanded-0003") });

            const row0003_01 = page.locator('[data-task-id="TSK-2026-10-25-0003.01"]').first();
            const row0003_01Visible = await row0003_01.isVisible().catch(() => false);
            console.log(`  TSK-2026-10-25-0003.01 visible after expanding .0003: ${row0003_01Visible}`);
            if (!row0003_01Visible) {
              fail("D5-6 .0003.01 visible after expanding .0003", "grandchild (depth-2) not found — recursive fix incomplete");
            } else {
              pass("D5-6 .0003.01 visible as depth-2 grandchild (recursive rendering confirmed)");

              const box0003_01 = await row0003_01.boundingBox();
              console.log(`  .0003.01 bounding box: ${JSON.stringify(box0003_01)}`);
              if (box0003_01 && box0003_01.height > 0) {
                pass(`D5-7 .0003.01 has non-zero height (${box0003_01.height.toFixed(0)}px)`);
              } else {
                fail("D5-7 .0003.01 has non-zero height", `got ${box0003_01?.height ?? 0}px — clipped/invisible`);
              }
            }
          }
        }

        await page.screenshot({ path: shot("d5-04-final") });
      }
    }
  }

  await ctx.close();
}

await browser.close();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────────────────`);
console.log("Screenshots:");
for (const s of allShots) console.log(`  ${s}`);
process.exit(failed > 0 ? 1 : 0);
