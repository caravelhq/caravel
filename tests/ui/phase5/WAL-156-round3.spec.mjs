// WAL-156-round3.spec.mjs — round 3 fixes: stop button, Enter key on title, dead bundles
//
// Tests:
// 3a — in-thread stop button POSTs /api/chat/interrupt and message reaches terminal [Interrupted] state
// 3b — Enter on the new-chat title input focuses textarea, does not submit the form
//
// Run:
//   CARAVEL_BASE=http://127.0.0.1:4633 node tests/ui/phase5/WAL-156-round3.spec.mjs
//
// Prerequisites: dev server on 4633 (proxies API to live daemon)

import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { chromium } from "file:///home/walter/workspace/.claude/skills/ui-test/node_modules/playwright/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SHOTS_DIR = join(__dirname, ".runs/WAL-156-round3");
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const shots = [];

function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }
async function screenshot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  shots.push(p);
  console.log(`  📷 ${name}.png`);
}

function freshChatId() {
  // 24 hex chars — same format as generateChatId() in ChatView.vue
  const bytes = new Uint8Array(12);
  for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Wait for a locator to be visible, checking every 1s up to maxMs. Returns true if found. */
async function waitFor(locator, maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await locator.isVisible().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Wait for a locator to be GONE (not visible), checking every 1s up to maxMs. Returns true when gone. */
async function waitGone(locator, maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!(await locator.isVisible().catch(() => true))) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const browser = await chromium.launch({ headless: true });

// ── 3a — Stop button interrupts the run ───────────────────────────────────────

console.log("\n── 3a — Stop button: should POST /api/chat/interrupt and message gets [Interrupted]");

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Track interrupt POSTs
  const interruptRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/chat/interrupt") && req.method() === "POST") {
      interruptRequests.push(req.url());
    }
  });

  const chatId = freshChatId();
  await page.goto(`${BASE}/#/chat/${chatId}`);

  // 1. Wait for agent picker to appear (agentsFetched = true)
  const agentPickerHead = page.locator(".chat-picker-head").first();
  const pickerLoaded = await waitFor(agentPickerHead, 15000);
  await screenshot(page, "3a-01-new-chat-loaded");

  if (pickerLoaded) {
    pass("3a-1 agent picker visible in new empty chat");
  } else {
    fail("3a-1 agent picker not visible after 15s", "expected .chat-picker-head to be shown");
    await ctx.close();
    // Skip to test 3b since we can't continue without the picker
    console.log("  Skipping remaining 3a steps due to missing agent picker\n");
  }

  if (pickerLoaded) {
    // 2. Pick the first available agent
    const firstAgentBtn = page.locator(".chat-picker-item").first();
    const agentName = await firstAgentBtn.locator(".chat-picker-item-title").first().innerText().catch(() => "?");
    await firstAgentBtn.click();
    await page.waitForTimeout(300);
    pass(`3a-2 clicked agent: ${agentName}`);

    // 3. Type a message that will take >3s to respond
    const textarea = page.locator("textarea.chat-input").first();
    await textarea.click();
    await textarea.fill("Count from 1 to 100. Say each number on a separate line and nothing else.");
    pass("3a-3 message typed into textarea");

    // 4. Submit the message (Ctrl+Enter)
    await textarea.press("Control+Enter");
    await page.waitForTimeout(500);
    await screenshot(page, "3a-02-after-send");

    const afterSend = await textarea.inputValue();
    if (afterSend === "") {
      pass("3a-4 message submitted (textarea cleared)");
    } else {
      fail("3a-4 message not sent", `textarea: "${afterSend}"`);
    }

    // 5. Wait for the in-thread stop button to appear (agent running)
    const stopBtn = page.locator(".chat-msg-stop-inline").first();
    const stopVisible = await waitFor(stopBtn, 20000);
    await screenshot(page, "3a-03-during-run");

    if (stopVisible) {
      pass("3a-5 in-thread stop button visible during run");
    } else {
      fail("3a-5 in-thread stop button not visible after 20s", "agent may not be running or stop button is broken");
    }

    if (stopVisible) {
      // 6. Verify stop button geometry
      const stopBox = await stopBtn.boundingBox().catch(() => null);
      if (stopBox && stopBox.width > 0 && stopBox.height > 0) {
        pass(`3a-6 stop button geometry ok (${Math.round(stopBox.width)}×${Math.round(stopBox.height)}px)`);
      } else {
        fail("3a-6 stop button has no geometry", `box=${JSON.stringify(stopBox)}`);
      }

      // 7. Click the stop button
      await stopBtn.click();
      console.log("  Clicked stop button — waiting for run to terminate…");
      await page.waitForTimeout(5000);
      await screenshot(page, "3a-04-after-stop");

      // 8. Assert interrupt endpoint was called
      if (interruptRequests.length > 0) {
        pass(`3a-7 POST /api/chat/interrupt was sent (${interruptRequests.length} request(s))`);
      } else {
        fail("3a-7 no POST to /api/chat/interrupt was observed", "stop button did not call the interrupt endpoint");
      }

      // 9. Assert stop button is gone (run reached terminal state)
      const stopGone = await waitGone(stopBtn, 10000);
      if (stopGone) {
        pass("3a-8 stop button gone (run reached terminal state)");
      } else {
        fail("3a-8 stop button still visible after interrupt + 10s", "run may not have terminated");
      }

      // 10. Assert [Interrupted] marker in message text
      const claudeMsgs = page.locator(".chat-msg-text");
      const msgCount = await claudeMsgs.count();
      let foundInterrupted = false;
      let lastText = "(no messages)";
      for (let i = msgCount - 1; i >= 0; i--) {
        const text = await claudeMsgs.nth(i).innerText().catch(() => "");
        lastText = text;
        if (text.includes("[Interrupted]")) {
          foundInterrupted = true;
          console.log(`  Found [Interrupted] in message ${i}: "${text.slice(0, 80)}…"`);
          break;
        }
      }

      if (foundInterrupted) {
        pass("3a-9 message text contains [Interrupted] marker");
      } else {
        fail(
          "3a-9 [Interrupted] marker not found",
          `Last message: "${lastText.slice(0, 100)}". ` +
          "Suspect: chatAborts not registered for runner-triggered chats (triggerChatProcessor path)."
        );
      }
    }

    await ctx.close();
  }
}

// ── 3b — Enter on title input focuses textarea, does not submit ───────────────

console.log("\n── 3b — Title input Enter: should move focus to textarea, not submit");

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Track any outgoing chat POST (would fire if form submits accidentally)
  const chatPostSent = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/chat") && req.method() === "POST" && !req.url().includes("/interrupt")) {
      chatPostSent.push(req.url());
    }
  });

  const chatId = freshChatId();
  await page.goto(`${BASE}/#/chat/${chatId}`);

  // 1. Wait for agent picker (new empty chat)
  const titleInput = page.locator(".chat-new-title-input").first();
  const agentPickerHead = page.locator(".chat-picker-head").first();
  const loaded = await waitFor(agentPickerHead, 15000);
  await screenshot(page, "3b-01-new-chat");

  if (!await titleInput.isVisible().catch(() => false)) {
    fail("3b-1 title input not visible in new chat", "expected .chat-new-title-input");
  } else {
    pass("3b-1 title input visible in new empty chat");
  }

  // 2. Pick an agent
  const firstAgentBtn = page.locator(".chat-picker-item").first();
  if (loaded && await firstAgentBtn.isVisible().catch(() => false)) {
    await firstAgentBtn.click();
    await page.waitForTimeout(300);
    pass("3b-2 agent picked");
  } else {
    fail("3b-2 agent picker not available", "");
  }

  // 3. Type a message in the textarea
  const textarea = page.locator("textarea.chat-input").first();
  await textarea.click();
  await textarea.fill("hello agent");
  pass("3b-3 message typed in textarea");

  // 4. Click the title input, type a title
  await titleInput.click();
  await titleInput.fill("My test chat");
  await page.waitForTimeout(200);
  await screenshot(page, "3b-02-title-focused");
  pass("3b-4 title input filled");

  // 5. Record state before pressing Enter on the title input
  const msgCountBefore = await page.locator(".chat-msg-text").count();
  const textareaValueBefore = await textarea.inputValue();
  const chatPostsBefore = chatPostSent.length;

  // 6. Press plain Enter on the title input — should NOT submit the form
  await titleInput.press("Enter");
  await page.waitForTimeout(1000);
  await screenshot(page, "3b-03-after-title-enter");

  // 7. Assert no POST was sent
  const newPosts = chatPostSent.length - chatPostsBefore;
  if (newPosts === 0) {
    pass("3b-5 Enter on title input did NOT send a chat POST");
  } else {
    fail("3b-5 Enter on title input triggered a chat POST", `${newPosts} request(s) unexpectedly sent`);
  }

  // 8. Assert message count unchanged
  const msgCountAfter = await page.locator(".chat-msg-text").count();
  if (msgCountAfter === msgCountBefore) {
    pass("3b-6 no message added (count unchanged)");
  } else {
    fail("3b-6 message count changed unexpectedly", `before: ${msgCountBefore}, after: ${msgCountAfter}`);
  }

  // 9. Assert textarea draft preserved
  const textareaValueAfter = await textarea.inputValue();
  if (textareaValueAfter === textareaValueBefore) {
    pass(`3b-7 textarea draft preserved after title Enter: "${textareaValueAfter}"`);
  } else {
    fail("3b-7 textarea draft modified", `before: "${textareaValueBefore}", after: "${textareaValueAfter}"`);
  }

  // 10. Assert focus moved to textarea (the fix does textareaRef?.focus())
  const focusTag = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') : 'null';
  });
  if (focusTag.startsWith("textarea")) {
    pass(`3b-8 focus moved to textarea (active: ${focusTag})`);
  } else {
    fail("3b-8 focus did not move to textarea", `active element: ${focusTag}`);
  }

  // 11. Test Ctrl+Enter from title sends (fix wires @keydown.ctrl.enter.prevent="onSend")
  //     Reset: re-type message if it was consumed
  const msgDraft = await textarea.inputValue();
  if (!msgDraft) {
    await textarea.fill("hello again");
    await page.waitForTimeout(200);
  }
  await titleInput.click();
  const postsBeforeCtrl = chatPostSent.length;
  await titleInput.press("Control+Enter");
  await page.waitForTimeout(1500);
  await screenshot(page, "3b-04-after-ctrl-enter-from-title");

  const textareaAfterCtrl = await textarea.inputValue();
  const newPostsCtrl = chatPostSent.length - postsBeforeCtrl;
  if (textareaAfterCtrl === "" || newPostsCtrl > 0) {
    pass(`3b-9 Ctrl+Enter from title sends the message (textarea clear: ${textareaAfterCtrl === ""}, posts: ${newPostsCtrl})`);
  } else {
    fail("3b-9 Ctrl+Enter from title did not send", `textarea: "${textareaAfterCtrl}", new posts: ${newPostsCtrl}`);
  }

  await ctx.close();
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ────────────────────────────────\n`);
if (shots.length > 0) {
  console.log("Screenshots:");
  shots.forEach((p) => console.log(`  ${p}`));
}

await browser.close();

if (failed > 0) {
  process.exit(1);
}
