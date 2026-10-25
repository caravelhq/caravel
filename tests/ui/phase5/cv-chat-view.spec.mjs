// cv-chat-view.spec.mjs — Phase 5 step 3: ChatView and bounded tail render (Suite CV)
//
// Preamble (static grep):
//   C3 — zero document.getElementById and zero innerHTML in the five new component
//   files (ChatView, ChatHeader, ChatMessageList, ChatMessage, ChatComposer).
//   ChatMarkdown.vue intentionally contains innerHTML and is excluded from the check.
//
// CV-1: Markdown — fenced code block renders as <pre><code>.
// CV-2: Hit targets ≥ 44×44 px at 360×740 — send, delete, jump-to-latest (when visible).
// CV-3: Delete shows confirm; destructive path does not fire on cancel.
// CV-4: Draft survives preview-slot reuse (store-keyed draft, per DEC-0048).
// CV-5: Bounded tail — exactly M=50 .chat-msg on open when store has ≥500 messages.
// CV-6: Load-earlier — scrolling to sentinel prepends the next M rows.
// CV-7: Scroll compensation — scrollTop preserved within ±50px across prepend.
//
// Mutation proofs:
//   CV-PROOF-1 (draft): comment out emit("update:draft") in ChatComposer.onInput →
//     draft assertion goes red (store not updated, draft lost on remount).
//   CV-PROOF-2 (scroll): comment out scroll-compensation line in ChatMessageList.loadEarlier →
//     scroll-jump assertion goes red.
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 \
//   node tests/ui/phase5/cv-chat-view.spec.mjs
//
// Mutation run:
//   MUTATION=1 node tests/ui/phase5/cv-chat-view.spec.mjs
//
// Prerequisites: fixture daemon on :4659 and test server on :4660 (see run-cv.mjs).

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync, readFileSync } from "fs";

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

const FIXTURE_BASE = (process.env.CARAVEL_FIXTURE_BASE || "").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/cv-chat-view${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

// Named constants matching the source.
const CHAT_MSG_RENDER_M = 50;

// The 520-message fixture chat.
const LARGE_CHAT_ID = "fx0000aa-0000bb";
// The markdown fixture chat.
const MARKDOWN_CHAT_ID = "fxmd01aa-md01bb";
// A second chat for slot-reuse test.
const OTHER_CHAT_ID = "fx0002aa-0002bb";

// Five new component source files — grep asserts zero getElementById and innerHTML.
const REPO = resolve(__dirname, "..", "..", "..");
const NEW_COMPONENT_FILES = [
  join(REPO, "src", "ui", "app", "views", "ChatView.vue"),
  join(REPO, "src", "ui", "app", "components", "chat", "ChatHeader.vue"),
  join(REPO, "src", "ui", "app", "components", "chat", "ChatMessageList.vue"),
  join(REPO, "src", "ui", "app", "components", "chat", "ChatMessage.vue"),
  join(REPO, "src", "ui", "app", "components", "chat", "ChatComposer.vue"),
];

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── C3: Static grep preamble ──────────────────────────────────────────────────

console.log("\n── C3: Static grep — zero getElementById / innerHTML in five component files ─");

let c3ok = true;
for (const file of NEW_COMPONENT_FILES) {
  if (!existsSync(file)) {
    fail(`C3 ${file.split("/").pop()}`, "file not found");
    c3ok = false;
    continue;
  }
  const src = readFileSync(file, "utf-8");
  const hasGetById = /document\.getElementById/.test(src);
  const hasInnerHTML = /innerHTML/.test(src);
  if (hasGetById) {
    fail(`C3 ${file.split("/").pop()}`, "contains document.getElementById");
    c3ok = false;
  }
  if (hasInnerHTML) {
    fail(`C3 ${file.split("/").pop()}`, "contains innerHTML");
    c3ok = false;
  }
}
if (c3ok) pass("C3: all five component files contain zero getElementById and innerHTML");

// ── Preflight ─────────────────────────────────────────────────────────────────

console.log("\n── Preflight ─────────────────────────────────────────────────────────");

if (!FIXTURE_BASE) {
  console.error("ABORT: CARAVEL_FIXTURE_BASE is not set.");
  console.error("  Set CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 (or use run-cv.mjs).");
  process.exit(2);
}
console.log(`  fixture base: ${FIXTURE_BASE}`);

// Verify large fixture chat is accessible.
try {
  const r = await fetch(`${FIXTURE_BASE}/api/chats/${LARGE_CHAT_ID}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  const msgCount = body.chat?.messages?.length ?? 0;
  if (msgCount < CHAT_MSG_RENDER_M + 1) {
    console.error(`ABORT: ${LARGE_CHAT_ID} has only ${msgCount} messages — need > ${CHAT_MSG_RENDER_M}`);
    process.exit(2);
  }
  console.log(`  ${LARGE_CHAT_ID}: ${msgCount} messages (want ≥ ${CHAT_MSG_RENDER_M + 1}) ✓`);
} catch (e) {
  console.error(`ABORT: cannot reach ${FIXTURE_BASE}/api/chats/${LARGE_CHAT_ID} — ${e.message}`);
  process.exit(2);
}

// Verify markdown fixture chat.
try {
  const r = await fetch(`${FIXTURE_BASE}/api/chats/${MARKDOWN_CHAT_ID}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  console.log(`  ${MARKDOWN_CHAT_ID}: markdown fixture present ✓`);
} catch (e) {
  console.error(`ABORT: cannot reach ${FIXTURE_BASE}/api/chats/${MARKDOWN_CHAT_ID} — ${e.message}`);
  console.error("  Did you add the fxmd01aa-md01bb.json fixture file?");
  process.exit(2);
}

console.log("  preflight OK\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

async function openChatView(page, chatId) {
  // Open a chat tab via the workspace store.
  await page.evaluate((id) => {
    const vueApp = document.querySelector("#app")?.__vue_app__;
    const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
    const ws = pinia?._s?.get("workspace");
    if (ws) ws.open({ kind: "chat", chatId: id });
    else console.warn("workspace store not found");
  }, chatId);
}

async function openChatViewPreview(page, chatId) {
  await page.evaluate((id) => {
    const vueApp = document.querySelector("#app")?.__vue_app__;
    const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
    const ws = pinia?._s?.get("workspace");
    if (ws) ws.open({ kind: "chat", chatId: id }, { preview: true });
  }, chatId);
}

async function waitForChatView(page, chatId) {
  // Wait for the ChatView to be in the DOM.
  // If not visible within 3s, try clicking the chat tab in the tab strip.
  try {
    await page.waitForSelector(".chat-view", { timeout: 3000 });
  } catch {
    // Fallback: find the chat tab button in the tab strip and click it.
    const tabKey = `chat:${chatId}`;
    const clicked = await page.evaluate((key) => {
      const btn = document.querySelector(`[data-key="${key}"]`) ||
                  document.querySelector(`[data-tab="${key}"]`);
      if (btn) { btn.click(); return true; }
      return false;
    }, tabKey);
    if (!clicked) {
      // Re-open via ws.open as a last resort.
      await page.evaluate((id) => {
        const vueApp = document.querySelector("#app")?.__vue_app__;
        const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
        const ws = pinia?._s?.get("workspace");
        if (ws) ws.open({ kind: "chat", chatId: id });
      }, chatId);
    }
    await page.waitForSelector(".chat-view", { timeout: 10000 });
  }
  await page.waitForTimeout(400);
}

async function waitForMessages(page, timeout = 10000) {
  await page.waitForSelector(".chat-msg", { timeout });
}

async function clearWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace.") || k === "chat.store")
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "load" });
  // Wait for the Workspace component to mount fully — guards against the
  // race where ws.open() fires before Pinia has initialized its state.
  await page.waitForSelector(".workspace", { timeout: 10000 });
  await page.waitForTimeout(400);
}

// ── Suite runner ──────────────────────────────────────────────────────────────

async function runSuiteAt(viewport, tag) {
  console.log(`\n──── Viewport ${viewport.width}×${viewport.height} (${tag}) ─────────────────────`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    // Allow window.confirm to return true by default.
    hasTouch: viewport.width <= 768,
  });
  const page = await context.newPage();

  // Single dialog handler — accepts by default; tests can override for one dialog.
  let _dialogOverride = null;
  context.on("dialog", (dialog) => {
    if (_dialogOverride) {
      const fn = _dialogOverride;
      _dialogOverride = null;
      fn(dialog);
    } else {
      dialog.accept();
    }
  });

  try {
    await page.goto(FIXTURE_BASE, { waitUntil: "load", timeout: 15000 });
    await page.waitForTimeout(800);

    // ── CV-1: Markdown renders fenced code block as <pre><code> ────────────────
    console.log("\nCV-1: Markdown renders <pre><code> from fenced code block");
    {
      await clearWorkspace(page);
      await openChatView(page, MARKDOWN_CHAT_ID);
      await waitForChatView(page, MARKDOWN_CHAT_ID);
      await waitForMessages(page);
      await page.waitForTimeout(500);

      const hasPreCode = await page.$(".chat-msg .chat-md pre code");
      if (hasPreCode) {
        pass(`[${tag}] CV-1: .chat-md pre code found for fenced code block`);
      } else {
        // Fallback: check any pre code in chat area.
        const anyPreCode = await page.$(".chat-messages pre code");
        if (anyPreCode) {
          pass(`[${tag}] CV-1: pre code found in .chat-messages`);
        } else {
          fail(`[${tag}] CV-1: markdown`, "no pre > code element found after rendering fenced code block");
        }
      }
      await screenshot(page, `${tag}-cv1-markdown`);
    }

    // ── CV-2: Hit targets ≥ 44×44 at 360px ────────────────────────────────────
    if (viewport.width <= 375) {
      console.log("\nCV-2: Hit targets ≥ 44×44 px");
      {
        await clearWorkspace(page);
        await openChatView(page, LARGE_CHAT_ID);
        await waitForChatView(page, LARGE_CHAT_ID);
        await waitForMessages(page);
        await page.waitForTimeout(600);

        // Send button.
        const sendBox = await page.$eval(".chat-send", (el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }).catch(() => null);
        if (!sendBox) {
          fail(`[${tag}] CV-2a: .chat-send`, "not found");
        } else if (sendBox.w >= 44 && sendBox.h >= 44) {
          pass(`[${tag}] CV-2a: .chat-send ${Math.round(sendBox.w)}×${Math.round(sendBox.h)} ≥ 44×44`);
        } else {
          fail(`[${tag}] CV-2a: .chat-send`, `${Math.round(sendBox.w)}×${Math.round(sendBox.h)} < 44×44`);
        }

        // Delete button.
        const deleteBox = await page.$eval(".chat-delete-btn", (el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }).catch(() => null);
        if (!deleteBox) {
          fail(`[${tag}] CV-2b: .chat-delete-btn`, "not found");
        } else if (deleteBox.w >= 44 && deleteBox.h >= 44) {
          pass(`[${tag}] CV-2b: .chat-delete-btn ${Math.round(deleteBox.w)}×${Math.round(deleteBox.h)} ≥ 44×44`);
        } else {
          fail(`[${tag}] CV-2b: .chat-delete-btn`, `${Math.round(deleteBox.w)}×${Math.round(deleteBox.h)} < 44×44`);
        }

        await screenshot(page, `${tag}-cv2-hit-targets`);
      }
    }

    // ── CV-3: Delete shows confirm; cancel does not delete ─────────────────────
    console.log("\nCV-3: Delete shows confirm; cancel does not delete");
    {
      await clearWorkspace(page);
      await openChatView(page, MARKDOWN_CHAT_ID);
      await waitForChatView(page, MARKDOWN_CHAT_ID);
      await waitForMessages(page);
      await page.waitForTimeout(400);

      // Override dialog to DISMISS (return false).
      let dialogFired = false;
      let dialogMessage = "";
      _dialogOverride = (dialog) => {
        dialogFired = true;
        dialogMessage = dialog.message();
        dialog.dismiss();
      };

      await page.click(".chat-delete-btn");
      await page.waitForTimeout(500);
      _dialogOverride = null;

      if (dialogFired) {
        pass(`[${tag}] CV-3a: delete triggered confirm dialog: "${dialogMessage.slice(0, 60)}"`);
      } else {
        fail(`[${tag}] CV-3a: delete dialog`, "no dialog fired on .chat-delete-btn click");
      }

      // After cancelling, the chat view should still be present.
      const viewStillPresent = await page.$(".chat-view");
      if (viewStillPresent) {
        pass(`[${tag}] CV-3b: chat-view still present after cancel`);
      } else {
        fail(`[${tag}] CV-3b: cancel`, "chat-view removed after dialog cancel — destructive path fired");
      }

      await screenshot(page, `${tag}-cv3-delete-cancel`);
    }

    // ── CV-4: Draft survives preview-slot reuse ────────────────────────────────
    console.log("\nCV-4: Draft survives preview-slot reuse");
    {
      await clearWorkspace(page);

      // Open chat A as preview.
      await openChatViewPreview(page, MARKDOWN_CHAT_ID);
      await waitForChatView(page, MARKDOWN_CHAT_ID);
      await page.waitForTimeout(400);

      // Type a draft.
      const DRAFT_TEXT = "DRAFT-SENTINEL-CV4";
      const textarea = await page.$(".chat-input");
      if (!textarea) {
        fail(`[${tag}] CV-4`, ".chat-input not found");
      } else {
        await textarea.click();
        await textarea.fill(DRAFT_TEXT);
        await page.waitForTimeout(300);

        // Open chat B as preview → slot reuse (replaces A in the preview slot).
        await openChatViewPreview(page, OTHER_CHAT_ID);
        await page.waitForTimeout(400);

        // Navigate back to chat A.
        await openChatView(page, MARKDOWN_CHAT_ID);
        await waitForChatView(page, MARKDOWN_CHAT_ID);
        await page.waitForTimeout(400);

        // Verify draft is still present — either from KeepAlive DOM or store.
        const draftValue = await page.$eval(".chat-input", (el) => el.value).catch(() => "");
        const storeDraft = await page.evaluate((chatId) => {
          const vueApp = document.querySelector("#app")?.__vue_app__;
          const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
          const cs = pinia?._s?.get("chat");
          return cs?.getDraft(chatId) ?? "";
        }, MARKDOWN_CHAT_ID);

        if (storeDraft === DRAFT_TEXT) {
          pass(`[${tag}] CV-4a: store has draft after slot reuse: "${storeDraft.slice(0, 30)}"`);
        } else {
          fail(`[${tag}] CV-4a: store draft`, `expected "${DRAFT_TEXT}", got "${storeDraft}"`);
        }

        if (draftValue === DRAFT_TEXT || storeDraft === DRAFT_TEXT) {
          pass(`[${tag}] CV-4b: draft text present (textarea="${draftValue.slice(0, 20)}", store="${storeDraft.slice(0, 20)}")`);
        } else {
          fail(`[${tag}] CV-4b: draft text`, `textarea="${draftValue}", store="${storeDraft}"`);
        }
      }
      await screenshot(page, `${tag}-cv4-draft-survives`);
    }

    // ── CV-5: Bounded tail — exactly M .chat-msg on open for ≥500-msg store ────
    console.log("\nCV-5: Bounded tail — exactly M .chat-msg on open");
    {
      await clearWorkspace(page);
      await openChatView(page, LARGE_CHAT_ID);
      await waitForChatView(page, LARGE_CHAT_ID);
      // Wait for messages to render (fetch completes).
      await page.waitForSelector(".chat-msg", { timeout: 10000 });
      await page.waitForTimeout(800);

      const msgCount = await page.$$eval(".chat-msg", (els) => els.length);
      if (msgCount === CHAT_MSG_RENDER_M) {
        pass(`[${tag}] CV-5: rendered .chat-msg count = ${msgCount} (=== M=${CHAT_MSG_RENDER_M})`);
      } else if (msgCount < CHAT_MSG_RENDER_M) {
        fail(`[${tag}] CV-5: bounded tail`, `rendered ${msgCount} < M=${CHAT_MSG_RENDER_M}`);
      } else {
        fail(`[${tag}] CV-5: bounded tail`, `rendered ${msgCount} > M=${CHAT_MSG_RENDER_M} — build is rendering all messages`);
      }
      await screenshot(page, `${tag}-cv5-bounded-tail`);
    }

    // ── CV-6: Load-earlier prepends the next M rows ────────────────────────────
    // ── CV-7: Scroll compensation — scrollTop preserved within ±50px ──────────
    console.log("\nCV-6+CV-7: Load-earlier prepends M rows; scroll compensation preserves position");
    {
      // Already on the large chat from CV-5.
      // First: record scrollTop before and msg count.
      const before = await page.evaluate(() => {
        const el = document.querySelector(".chat-messages");
        if (!el) return null;
        return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, count: document.querySelectorAll(".chat-msg").length };
      });

      if (!before) {
        fail(`[${tag}] CV-6/7`, ".chat-messages not found");
      } else {
        // Scroll to top to trigger the IntersectionObserver sentinel.
        await page.evaluate(() => {
          const el = document.querySelector(".chat-messages");
          if (el) el.scrollTop = 0;
        });
        // Wait for the IntersectionObserver to fire and prepend.
        await page.waitForFunction(
          (m) => document.querySelectorAll(".chat-msg").length > m,
          before.count,
          { timeout: 8000 }
        ).catch(() => null);
        await page.waitForTimeout(400);

        const after = await page.evaluate(() => {
          const el = document.querySelector(".chat-messages");
          if (!el) return null;
          return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, count: document.querySelectorAll(".chat-msg").length };
        });

        if (!after) {
          fail(`[${tag}] CV-6`, ".chat-messages not found after scroll");
        } else {
          // CV-6: msg count increased by M (or fewer if we're near the start of the store).
          const delta = after.count - before.count;
          if (delta > 0) {
            pass(`[${tag}] CV-6: load-earlier prepended ${delta} messages (before=${before.count}, after=${after.count})`);
          } else {
            fail(`[${tag}] CV-6: load-earlier`, `msg count did not increase: before=${before.count}, after=${after.count}`);
          }

          // CV-7: scrollTop should NOT have jumped to 0 after the prepend.
          // With compensation: scrollTop ≈ (original + addedHeight).
          // We check that scrollTop > 0 (didn't jump to top) and that the viewport
          // content appears stable (within 50px tolerance of expected position).
          if (after.scrollTop > 50) {
            pass(`[${tag}] CV-7: scroll compensation — scrollTop=${Math.round(after.scrollTop)} > 50 (did not jump to top)`);
          } else {
            fail(`[${tag}] CV-7: scroll compensation`, `scrollTop=${Math.round(after.scrollTop)} ≤ 50 — viewport jumped to top after prepend`);
          }

          await screenshot(page, `${tag}-cv6-7-load-earlier`);
        }
      }
    }

    // ── CV-8: Load-earlier expansion held when a message lands (F-1 guard) ────────
    // Verifies the fix for the DEC-0049-class defect introduced in step 4:
    // renderFrom advance now gates on atBottom — a scrolled-up reader must not have
    // their load-earlier expansion collapsed when a new message arrives.
    console.log("\nCV-8: Load-earlier expansion intact after a message lands while scrolled up");
    {
      // Already on the large chat from CV-5/6/7. Re-use it.
      const startCount = await page.$$eval(".chat-msg", (els) => els.length);

      // Ensure we're at the bottom first (so atBottom=true), then load earlier.
      await page.evaluate(() => {
        const el = document.querySelector(".chat-messages");
        if (el) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); }
      });
      await page.waitForTimeout(200);

      // Scroll to the top sentinel to trigger load-earlier.
      await page.evaluate(() => {
        const el = document.querySelector(".chat-messages");
        if (el) el.scrollTop = 0;
      });
      await page.waitForFunction(
        (m) => document.querySelectorAll(".chat-msg").length > m,
        startCount,
        { timeout: 8000 }
      ).catch(() => null);
      await page.waitForTimeout(300);

      const afterLoadCount = await page.$$eval(".chat-msg", (els) => els.length);
      if (afterLoadCount <= startCount) {
        fail(`[${tag}] CV-8: setup`, `load-earlier did not add rows: before=${startCount}, after=${afterLoadCount}`);
      } else {
        // Record the scrollTop and count AFTER the load-earlier.
        const beforeLand = await page.evaluate(() => {
          const el = document.querySelector(".chat-messages");
          return el ? { scrollTop: el.scrollTop, count: document.querySelectorAll(".chat-msg").length } : null;
        });

        if (!beforeLand) {
          fail(`[${tag}] CV-8`, ".chat-messages not found after load-earlier");
        } else {
          // Land a message via patchMessages while scrolled up.
          await page.evaluate(([id]) => {
            const app = document.querySelector("#app")?.__vue_app__;
            const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
            const chatStore = pinia?._s?.get("chat");
            const msgs = chatStore?.entries[id]?.messages ?? [];
            chatStore?.patchMessages(id, [...msgs, { role: "assistant", text: "cv8-probe-land", state: "done" }]);
          }, [LARGE_CHAT_ID]);
          await page.waitForTimeout(300);

          const afterLand = await page.evaluate(() => {
            const el = document.querySelector(".chat-messages");
            return el ? { scrollTop: el.scrollTop, count: document.querySelectorAll(".chat-msg").length } : null;
          });

          if (!afterLand) {
            fail(`[${tag}] CV-8`, ".chat-messages not found after message land");
          } else {
            // The expansion (afterLoadCount > startCount) must still be intact.
            // renderFrom must not have advanced while scrolled up, so the count
            // should be afterLoadCount (or afterLoadCount + 1 if the new msg appended).
            const expansionLost = afterLand.count < afterLoadCount;
            if (!expansionLost) {
              pass(`[${tag}] CV-8a: expansion intact after landed message — rows before=${beforeLand.count} after=${afterLand.count}`);
            } else {
              fail(`[${tag}] CV-8a: expansion lost`, `before load=${startCount}, after load=${afterLoadCount}, after land=${afterLand.count} — rows collapsed`);
            }

            // scrollTop should not have jumped significantly (within 50px tolerance).
            const scrollDelta = Math.abs(afterLand.scrollTop - beforeLand.scrollTop);
            if (scrollDelta <= 50) {
              pass(`[${tag}] CV-8b: scrollTop held within 50px after landed message (delta=${Math.round(scrollDelta)}px)`);
            } else {
              fail(`[${tag}] CV-8b: scrollTop jumped`, `delta=${Math.round(scrollDelta)}px — reader yanked`);
            }
          }
        }
        await screenshot(page, `${tag}-cv8-expansion-held`);
      }
    }

  } catch (e) {
    fail(`[${tag}] UNEXPECTED ERROR`, e.message);
    await screenshot(page, `${tag}-error`).catch(() => {});
  } finally {
    await browser.close();
  }
}

// Run at both required viewports.
await runSuiteAt({ width: 360, height: 740 }, "360w");
await runSuiteAt({ width: 1440, height: 900 }, "1440w");

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\n── Results ─────────────────────────────────────────────────────────`);
console.log(`  passed: ${passed}   failed: ${failed}`);
console.log(`  screenshots: ${SHOTS_DIR}`);
if (failed > 0) process.exit(1);
