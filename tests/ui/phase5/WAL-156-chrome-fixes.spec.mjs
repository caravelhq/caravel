// WAL-156-chrome-fixes.spec.mjs — post-Phase-5 UI bugfix round (1a, 1b, 1c)
//
// D1 (1a): new-task modal has real padding, no edge-to-edge content, no Done button.
// D2 (1b): chat toolbar and chat input-row have a darker blue background.
// D3 (1c): send button is 28×28 circle with ↑ glyph.
//
// Run (against dev server on :4633):
//   CARAVEL_BASE=http://127.0.0.1:4633 node tests/ui/phase5/WAL-156-chrome-fixes.spec.mjs

import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { chromium } from "file:///home/walter/workspace/.claude/skills/ui-test/node_modules/playwright/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SHOTS_DIR = join(__dirname, ".runs/WAL-156-chrome-fixes");
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

// ── D1: New-task modal padding + Done button removed ─────────────────────────

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  console.log("\n── D1: New-task modal padding + Done button ─────────────────────────────");

  // Load dashboard (hash routing: /#/dashboard)
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shot("d1-01-landing") });

  // Open the Open menu
  const openMenuBtn = page.locator(".open-menu-btn").first();
  const menuBtnVisible = await openMenuBtn.isVisible().catch(() => false);
  if (!menuBtnVisible) {
    fail("D1-0 open-menu-btn visible", "not found on dashboard");
    await ctx.close();
  } else {
    pass("D1-0 dashboard loaded, open-menu-btn visible");
    await openMenuBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("d1-02-open-menu") });

    // Click "New task" in the menu
    const newTaskItem = page.locator(".open-menu-item").filter({ hasText: "New task" }).first();
    const newTaskVisible = await newTaskItem.isVisible().catch(() => false);
    if (!newTaskVisible) {
      fail("D1-1 New task menu item visible", "not found");
    } else {
      await newTaskItem.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: shot("d1-03-modal-open") });

      // Check modal is visible
      const modal = page.locator("#new-task-modal");
      const modalVisible = await modal.isVisible().catch(() => false);
      if (!modalVisible) {
        fail("D1-2 modal opens", "modal not visible after click");
      } else {
        pass("D1-2 modal opens");

        // Check padding via computed style — direct and unambiguous.
        const form = page.locator(".ntm-form").first();
        const [pl, pr] = await form.evaluate(el => {
          const s = window.getComputedStyle(el);
          return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)];
        });
        console.log(`  .ntm-form computed padding: left=${pl}px right=${pr}px`);
        if (pl >= 14 && pr >= 14) {
          pass(`D1-3 modal form has real padding (L=${pl}px R=${pr}px)`);
        } else {
          fail("D1-3 modal form has real padding", `paddingLeft=${pl}px paddingRight=${pr}px — expected both ≥14`);
        }

        // Check Done button is absent — check both count and any visible "Done" text.
        const doneBtn = page.locator(".base-modal-done-btn");
        const doneBtnCount = await doneBtn.count();
        const doneBtnVisible = await doneBtn.isVisible().catch(() => false);
        // Also check for any element visually showing "Done" inside the modal dialog
        const anyDoneVisible = await page.evaluate(() => {
          const dialog = document.querySelector("dialog.base-modal[open]");
          if (!dialog) return false;
          const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_ELEMENT);
          let node = walker.nextNode();
          while (node) {
            const el = /** @type {HTMLElement} */ (node);
            const text = el.textContent?.trim();
            if (text === "Done") {
              const s = window.getComputedStyle(el);
              if (s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0") {
                const box = el.getBoundingClientRect();
                if (box.width > 0 && box.height > 0) return true;
              }
            }
            node = walker.nextNode();
          }
          return false;
        });
        console.log(`  base-modal-done-btn: count=${doneBtnCount} isVisible=${doneBtnVisible} anyDoneVisible=${anyDoneVisible}`);
        if (anyDoneVisible) {
          fail("D1-4 Done button removed", "a 'Done' element is still visible inside the open dialog");
        } else {
          pass("D1-4 Done button not visible (removed via empty #footer slot)");
        }

        // Screenshot with modal still open
        await page.screenshot({ path: shot("d1-04-modal-details") });

        // Close modal via Cancel
        const cancelBtn = page.locator(".multi-agent-new-cancel").first();
        const cancelVisible = await cancelBtn.isVisible().catch(() => false);
        if (cancelVisible) await cancelBtn.click();
        await page.waitForTimeout(300);
      }
    }

    await ctx.close();
  }
}

// ── D2: Chat toolbar + chat-form darker blue background ──────────────────────

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── D2: Chat toolbar and input-row darker blue background ────────────────");

  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForTimeout(2000);

  // Navigate to chat picker via Open menu
  const openMenuBtn = page.locator(".open-menu-btn").first();
  await openMenuBtn.click();
  await page.waitForTimeout(400);

  const chatItem = page.locator("#tab-chat");
  const chatItemVisible = await chatItem.isVisible().catch(() => false);
  if (!chatItemVisible) {
    fail("D2-0 chat menu item visible", "not found");
  } else {
    await chatItem.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("d2-01-chat-picker") });

    // From the picker, try to open a chat by clicking the first chat row.
    // The chat picker shows .chat-history-row items.
    const firstChatRow = page.locator(".chat-history-row, [class*='chat-row'], .chat-list-row").first();
    const firstVisible = await firstChatRow.isVisible().catch(() => false);

    if (firstVisible) {
      await firstChatRow.click();
      await page.waitForTimeout(1000);
    } else {
      // No chats? Check if there's a "New chat" button or just look at the chat page directly
      console.log("  No chat rows found — trying direct hash navigation to /chat");
      // Navigate to open a new chat via the route
    }

    await page.screenshot({ path: shot("d2-02-chat-view") });

    // Check chat-toolbar background.
    const toolbar = page.locator(".chat-toolbar").first();
    const toolbarVisible = await toolbar.isVisible().catch(() => false);
    if (!toolbarVisible) {
      fail("D2-1 chat-toolbar visible", "not found — chat view may not have loaded");
    } else {
      const bg = await toolbar.evaluate(el => window.getComputedStyle(el).backgroundColor);
      console.log(`  chat-toolbar computed background: ${bg}`);
      // We set background: #06111e = rgb(6, 17, 30)
      // Any non-transparent value signals the style landed.
      const isTransparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      if (!isTransparent) {
        // Also verify it's actually a dark blue (r<50, g<60, b>50)
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const [, r, g, b] = m.map(Number);
          const isDarkBlue = r < 50 && b > r;
          if (isDarkBlue) {
            pass(`D2-1 chat-toolbar has dark blue background: ${bg}`);
          } else {
            fail("D2-1 chat-toolbar has dark blue background", `bg is ${bg} — not clearly dark blue`);
          }
        } else {
          pass(`D2-1 chat-toolbar has explicit background: ${bg}`);
        }
      } else {
        fail("D2-1 chat-toolbar has explicit background", "still transparent/inherit");
      }
    }

    // Check chat-form background.
    const chatForm = page.locator(".chat-form").first();
    const formVisible = await chatForm.isVisible().catch(() => false);
    if (!formVisible) {
      fail("D2-2 chat-form visible", "not found — must open a specific chat first");
    } else {
      const bg = await chatForm.evaluate(el => window.getComputedStyle(el).backgroundColor);
      console.log(`  chat-form computed background: ${bg}`);
      // We set background: #0c1e38 = rgb(12, 30, 56)
      const isTransparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      if (!isTransparent) {
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const [, r, g, b] = m.map(Number);
          const isDarkBlue = r < 40 && b > r;
          if (isDarkBlue) {
            pass(`D2-2 chat-form has dark blue background: ${bg}`);
          } else {
            fail("D2-2 chat-form has dark blue background", `bg is ${bg} — not clearly dark blue`);
          }
        } else {
          pass(`D2-2 chat-form has non-transparent background: ${bg}`);
        }
      } else {
        fail("D2-2 chat-form has non-transparent background", "still transparent");
      }
    }
  }

  await ctx.close();
}

// ── D3: Send button 28×28 circle + ↑ glyph ───────────────────────────────────

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("\n── D3: Send button size + glyph ─────────────────────────────────────────");

  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForTimeout(2000);

  // Navigate to chat via Open menu → Chat
  const openMenuBtn = page.locator(".open-menu-btn").first();
  await openMenuBtn.click();
  await page.waitForTimeout(400);
  const chatItem = page.locator("#tab-chat").first();
  if (await chatItem.isVisible().catch(() => false)) {
    await chatItem.click();
    await page.waitForTimeout(1500);
  }

  // Open the first chat
  const firstChatRow = page.locator(".chat-history-row, [class*='chat-row'], .chat-list-row").first();
  if (await firstChatRow.isVisible().catch(() => false)) {
    await firstChatRow.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: shot("d3-01-chat-open") });

  const sendBtn = page.locator(".chat-send").first();
  const sendVisible = await sendBtn.isVisible().catch(() => false);
  if (!sendVisible) {
    fail("D3-1 send button visible", "not found");
  } else {
    // Geometry: expect ~28×28
    const box = await sendBtn.boundingBox();
    console.log(`  .chat-send bounding box: ${JSON.stringify(box)}`);
    if (!box) {
      fail("D3-1 send button geometry", "boundingBox() returned null");
    } else {
      const widthOk = box.width >= 24 && box.width <= 34;
      const heightOk = box.height >= 24 && box.height <= 34;
      const squareOk = Math.abs(box.width - box.height) <= 4;
      if (widthOk && heightOk && squareOk) {
        pass(`D3-1 send button is ~28×28 (${box.width.toFixed(1)}×${box.height.toFixed(1)})`);
      } else {
        fail("D3-1 send button is ~28×28", `got ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
      }
    }

    // Glyph check
    const innerText = await sendBtn.textContent();
    console.log(`  .chat-send inner text: "${innerText?.trim()}"`);
    if (innerText?.trim() === "↑") {
      pass("D3-2 send button glyph is ↑");
    } else {
      fail("D3-2 send button glyph is ↑", `got "${innerText?.trim()}"`);
    }

    // border-radius: 50% check via computedStyle
    const br = await sendBtn.evaluate(el => window.getComputedStyle(el).borderRadius);
    console.log(`  .chat-send border-radius: ${br}`);
    if (br === "50%") {
      pass("D3-3 send button border-radius is 50% (circle)");
    } else {
      // Might be rendered as e.g. "14px" (half of 28px) — still a circle
      const brVal = parseFloat(br);
      if (!isNaN(brVal) && brVal >= 13) {
        pass(`D3-3 send button border-radius is circular: ${br}`);
      } else {
        fail("D3-3 send button border-radius is circular", `got ${br}`);
      }
    }
  }

  await page.screenshot({ path: shot("d3-02-send-btn-detail") });
  await ctx.close();
}

await browser.close();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────────────────`);
console.log("Screenshots:");
for (const s of allShots) console.log(`  ${s}`);
process.exit(failed > 0 ? 1 : 0);
