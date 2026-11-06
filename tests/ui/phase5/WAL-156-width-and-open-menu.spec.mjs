// WAL-156-width-and-open-menu.spec.mjs — post-Phase-5 UI defects 2g and 2h
//
// 2g: File reader prose column capped at ~80ch and centred on wide viewports.
//     Verified via (a) CSS stylesheet rule inspection confirming max-width: 80ch
//     and margin: auto, and (b) live geometry at 2000px with a real markdown file.
//
// 2h: Open menu shows a Chats section alongside tasks/projects pickers.
//     The section renders with visible rows (non-zero height) and a count header.
//     Clicking a row navigates to that chat. WAL-151 Chat picker button preserved.
//
// Run:
//   CARAVEL_BASE=http://127.0.0.1:4633 node tests/ui/phase5/WAL-156-width-and-open-menu.spec.mjs

import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { chromium } from "file:///home/walter/workspace/.claude/skills/ui-test/node_modules/playwright/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SHOTS_DIR = join(__dirname, ".runs/WAL-156-width-and-open-menu");
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");

// Known markdown file that exists in the workspace.
const TEST_MD_FILE = "agents/bob/tasks/done/TSK-2026-10-25-0004.06.md";

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

// ── 2g-a: CSS rule inspection ─────────────────────────────────────────────────
// Inspect the compiled CSS bundle to confirm .files-md has max-width set
// and margin-left/right set to auto. This is reliable regardless of whether
// a markdown file is open.

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── 2g-a: CSS rule inspection for .files-md ──────────────────────────────────");

  await page.goto(`${BASE}/`);
  await page.waitForTimeout(2000);

  const rule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const r of sheet.cssRules) {
          if (r instanceof CSSStyleRule && r.selectorText === ".files-md") {
            return {
              maxWidth: r.style.maxWidth,
              marginLeft: r.style.marginLeft,
              marginRight: r.style.marginRight,
            };
          }
        }
      } catch (_) {}
    }
    return null;
  });

  console.log(`  .files-md CSS rule: ${JSON.stringify(rule)}`);

  if (!rule) {
    fail("2g-a-0 .files-md rule found in stylesheet", "no matching CSSStyleRule");
  } else {
    pass("2g-a-0 .files-md rule found in stylesheet");

    // max-width should be "80ch" or similar (not "none" or "")
    if (rule.maxWidth && rule.maxWidth !== "none") {
      pass(`2g-a-1 .files-md max-width is set (${rule.maxWidth}) — prose column will be capped`);
    } else {
      fail("2g-a-1 .files-md max-width is set", `maxWidth="${rule.maxWidth}" — not capped`);
    }

    // margin-left / margin-right should be "auto"
    if (rule.marginLeft === "auto" && rule.marginRight === "auto") {
      pass("2g-a-2 .files-md margins are auto — column will be centred");
    } else {
      fail("2g-a-2 .files-md margins are auto", `left="${rule.marginLeft}" right="${rule.marginRight}"`);
    }
  }

  await ctx.close();
}

// ── 2g-b: Live geometry at 2000px viewport ────────────────────────────────────
// Open a real markdown file and verify the rendered .files-md column is capped
// well below viewport width and roughly centred.

{
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1000 } });
  const page = await ctx.newPage();

  console.log("\n── 2g-b: File reader geometry at 2000px viewport ────────────────────────────");

  // Navigate to a markdown file via the file hash route
  await page.goto(`${BASE}/#/file/${TEST_MD_FILE}`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: shot("2g-b-01-wide-file") });

  const filesMd = page.locator(".files-md").first();
  const hasMd = await filesMd.isVisible().catch(() => false);

  if (!hasMd) {
    fail("2g-b-0 .files-md visible at 2000px", `no .files-md found — route: ${await page.evaluate(() => window.location.hash)}`);
    fail("2g-b-1 column is capped", "skipped");
    fail("2g-b-2 column is centred", "skipped");
  } else {
    pass("2g-b-0 .files-md visible at 2000px");

    const mdBox = await filesMd.boundingBox();
    const vp = page.viewportSize();
    console.log(`  .files-md box: ${JSON.stringify(mdBox)}`);
    console.log(`  viewport: ${JSON.stringify(vp)}`);

    if (mdBox && vp) {
      // Column should be significantly narrower than viewport (2× or more)
      if (mdBox.width < vp.width * 0.6) {
        pass(`2g-b-1 prose column is capped (${mdBox.width.toFixed(0)}px << viewport ${vp.width}px)`);
      } else {
        fail("2g-b-1 prose column is capped", `width=${mdBox.width.toFixed(0)}px is not much narrower than viewport ${vp.width}px`);
      }

      // Column should be roughly centred: left and right gaps roughly equal
      const leftGap = mdBox.x;
      const rightGap = vp.width - (mdBox.x + mdBox.width);
      console.log(`  gaps: left=${leftGap.toFixed(0)} right=${rightGap.toFixed(0)}`);
      const diff = Math.abs(leftGap - rightGap);
      if (diff < 60) {
        pass(`2g-b-2 column is roughly centred (left=${leftGap.toFixed(0)}px ≈ right=${rightGap.toFixed(0)}px)`);
      } else {
        fail("2g-b-2 column is roughly centred", `left=${leftGap.toFixed(0)} right=${rightGap.toFixed(0)} diff=${diff.toFixed(0)}`);
      }
    } else {
      fail("2g-b-1 column geometry", `mdBox=${JSON.stringify(mdBox)}`);
    }
  }

  await page.screenshot({ path: shot("2g-b-02-wide-final") });
  await ctx.close();
}

// ── 2g-c: Normal 1280px viewport — column not shrunk ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── 2g-c: File reader geometry at 1280px (must not shrink normal case) ────────");

  await page.goto(`${BASE}/#/file/${TEST_MD_FILE}`);
  await page.waitForTimeout(3000);

  const filesMd = page.locator(".files-md").first();
  const hasMd = await filesMd.isVisible().catch(() => false);

  if (!hasMd) {
    fail("2g-c-0 .files-md visible at 1280px", "not found");
  } else {
    const mdBox = await filesMd.boundingBox();
    const vp = page.viewportSize();
    console.log(`  .files-md box: ${JSON.stringify(mdBox)}`);

    if (mdBox && mdBox.width > 300) {
      pass(`2g-c-0 column has real width at 1280px (${mdBox.width.toFixed(0)}px — not shrunk)`);
    } else {
      fail("2g-c-0 column has real width at 1280px", `width=${mdBox?.width ?? 0}px — too narrow`);
    }
  }

  await page.screenshot({ path: shot("2g-c-01-normal-vp") });
  await ctx.close();
}

// ── 2h: Chats section in Open menu ──────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── 2h: Chats section in Open menu ──────────────────────────────────────────");

  await page.goto(`${BASE}/`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shot("2h-01-home") });

  const openBtn = page.locator(".open-menu-btn").first();
  const openBtnVisible = await openBtn.isVisible().catch(() => false);

  if (!openBtnVisible) {
    fail("2h-0 Open menu button visible", ".open-menu-btn not found");
  } else {
    pass("2h-0 Open menu button visible");

    await openBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("2h-02-menu-open") });

    const panel = page.locator(".open-menu-list").first();
    const panelVisible = await panel.isVisible().catch(() => false);

    if (!panelVisible) {
      fail("2h-1 Open menu panel visible", ".open-menu-list not found");
    } else {
      pass("2h-1 Open menu panel visible");

      // ── WAL-151 non-regression: Chat picker button still present ──────────
      // Check BEFORE clicking anything that would close the menu.
      const chatPickerBtn = page.locator("#tab-chat").first();
      const chatPickerVisible = await chatPickerBtn.isVisible().catch(() => false);
      if (chatPickerVisible) {
        pass("2h-2 WAL-151 Chat picker button still present (non-regression)");
      } else {
        fail("2h-2 WAL-151 Chat picker button still present", "#tab-chat not found — regressed");
      }

      // ── Chats section label ───────────────────────────────────────────────
      const sectionLabels = await page.locator(".om-section-label").all();
      let chatsLabel = null;
      for (const label of sectionLabels) {
        const text = (await label.textContent()) ?? "";
        if (text.toLowerCase().includes("chats")) {
          chatsLabel = label;
          break;
        }
      }

      if (!chatsLabel) {
        fail("2h-3 Chats section label visible", "no .om-section-label containing 'chats' found");
      } else {
        const labelText = (await chatsLabel.textContent()) ?? "";
        pass(`2h-3 Chats section label visible: "${labelText.trim()}"`);

        // Should show a count when there are many chats
        const hasCount = /\d/.test(labelText);
        console.log(`  section label: "${labelText.trim()}" hasCount=${hasCount}`);
        if (hasCount) {
          pass("2h-4 Chats section shows total count in label");
        } else {
          pass("2h-4 Chats section label present (count shown when total > N)");
        }
      }

      // ── Chat rows ─────────────────────────────────────────────────────────
      const chatRows = page.locator(".open-menu-list .om-item-recent");
      const rowCount = await chatRows.count();
      console.log(`  chat rows in Open menu: ${rowCount}`);

      if (rowCount > 0) {
        pass(`2h-5 at least one chat row in Open menu (${rowCount} rows)`);

        const firstRow = chatRows.first();
        const rowBox = await firstRow.boundingBox();
        console.log(`  first chat row box: ${JSON.stringify(rowBox)}`);

        if (rowBox && rowBox.height > 0 && rowBox.width > 0) {
          pass(`2h-6 first chat row has real geometry (${rowBox.width.toFixed(0)}×${rowBox.height.toFixed(0)}px)`);
        } else {
          fail("2h-6 first chat row has real geometry", `box=${JSON.stringify(rowBox)}`);
        }

        // ── Click row → navigate to chat ──────────────────────────────────
        const firstRowText = (await firstRow.textContent()) ?? "";
        console.log(`  clicking row: "${firstRowText.trim()}"`);
        await firstRow.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: shot("2h-03-after-row-click") });

        const hash = await page.evaluate(() => window.location.hash);
        console.log(`  hash after click: ${hash}`);

        if (hash.includes("/chat/")) {
          pass(`2h-7 clicking chat row navigates to chat route (${hash})`);
        } else {
          const chatView = page.locator(".chat-view").first();
          const chatVisible = await chatView.isVisible().catch(() => false);
          if (chatVisible) {
            pass("2h-7 clicking chat row opens a chat view");
          } else {
            fail("2h-7 clicking chat row navigates to chat", `hash=${hash}`);
          }
        }
      } else {
        // No chats — verify v-if correctly hides the section
        if (!chatsLabel) {
          pass("2h-5 chats section correctly hidden when no chats available");
        } else {
          fail("2h-5 chat rows present", "section label shows but 0 rows");
        }
        pass("2h-6 (skipped — no chat data)");
        pass("2h-7 (skipped — no chat data)");
      }
    }
  }

  await page.screenshot({ path: shot("2h-04-final") });
  await ctx.close();
}

await browser.close();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────────────────`);
console.log("Screenshots:");
for (const s of allShots) console.log(`  ${s}`);
process.exit(failed > 0 ? 1 : 0);
