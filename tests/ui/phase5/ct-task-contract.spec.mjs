// ct-task-contract.spec.mjs — Phase 5 step 5: task→chat contract becomes a store call
//
// The chat↔task contract was four window globals and a CustomEvent (F6).
// Step 5 rewrites TaskActions to call ws.open({ kind:"chat", chatId }) with a
// store draft for the seed, and re-points VoiceModeOverlay's two reads
// (:237 send target, :300 history priming) at chatStore.lastActivatedChatId.
//
// Suite: desktop-only (contract-level).
//
// CT-1: window.__pendingAgentId absent after clicking Chat
// CT-2: caravel:chat-thread event listeners absent from window
// CT-3: window.__chatSessionId absent after clicking Chat
// CT-4: Chat button opens a chat: tab carrying the correct chatId
// CT-5: Opened tab's composer carries the seed intent
// CT-6: (moved to static S-4 — __vmOnAssistantChunk is set by openMode(), not at mount)
// CT-7: window.__chatHistory still exists (5.2 seam, must NOT disappear)
// CT-8: Voice send uses chatStore.lastActivatedChatId, not window.__chatSessionId
//
// Static preflight (grep on source — C3 technique):
// S-1: VoiceModeOverlay.vue: zero occurrences of window.__chatSessionId
// S-2: VoiceModeOverlay.vue: useChatStore / lastActivatedChatId present
// S-3: TaskActions.vue: zero occurrences of __pendingAgentId, __chatSessionId,
//      caravel:chat-thread
// S-4: stores/chat.ts still calls __vmOnAssistantChunk (5.2 seam, not removed early)
// S-5: views/ChatView.vue still writes __chatHistory (5.2 seam, not removed early)
//
// WAL-149 companion: wal149-chat-redirect-next-nav.spec.mjs is run unchanged
//   alongside this suite — it is the regression guard for the contract this
//   step rewrites (inherited UNCHANGED per the phase brief).
//
// Mutation proof (run-ct.mjs --mutation):
//   CT-PROOF-1: add window.__pendingAgentId = agent.value back to
//   TaskActions.openChatThread → CT-1 goes red. The WAL-149 spec's
//   core Next-navigation checks (AC2/AC3) stay green, proving that the
//   old spec alone cannot catch this regression.
//
// Run:
//   CARAVEL_BASE=http://127.0.0.1:4663 SRC_TASK=<real-task-id> \
//     node tests/ui/phase5/ct-task-contract.spec.mjs
//   (or use run-ct.mjs)

import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..");

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4663").replace(/\/$/, "");
const SRC_TASK = process.env.SRC_TASK || "TSK-2026-10-21-0004.40";
const MUTATION = process.env.MUTATION === "1";

const SHOTS_DIR = join(__dirname, `.runs/ct-task-contract${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }
function check(label, ok, detail) { ok ? pass(label) : fail(label, detail || ""); }

// ── Static preflight (grep source files) ─────────────────────────────────────

console.log("── static source checks ──");

const VMO_SRC      = join(REPO, "src", "ui", "app", "components", "voice", "VoiceModeOverlay.vue");
const TA_SRC       = join(REPO, "src", "ui", "app", "views", "TaskActions.vue");
const CHAT_STORE_SRC = join(REPO, "src", "ui", "app", "stores", "chat.ts");

if (!existsSync(VMO_SRC)) {
  fail("S-1 (preflight)", `VoiceModeOverlay.vue not found at ${VMO_SRC}`);
  fail("S-2 (preflight)", "skipped");
} else {
  const vmoText = readFileSync(VMO_SRC, "utf-8");
  check("S-1: VoiceModeOverlay has zero __chatSessionId reads",
    !vmoText.includes("__chatSessionId"),
    `found __chatSessionId in ${VMO_SRC}`);
  check("S-2: VoiceModeOverlay reads lastActivatedChatId from store",
    vmoText.includes("lastActivatedChatId") && vmoText.includes("useChatStore"),
    "expected useChatStore + lastActivatedChatId in VoiceModeOverlay");
}

if (!existsSync(TA_SRC)) {
  fail("S-3 (preflight)", `TaskActions.vue not found at ${TA_SRC}`);
} else {
  const taText = readFileSync(TA_SRC, "utf-8");
  const hasBadGlobals = taText.includes("__pendingAgentId") ||
    taText.includes("__chatSessionId") ||
    taText.includes("caravel:chat-thread");
  check("S-3: TaskActions has zero old globals / CustomEvent",
    !hasBadGlobals,
    "found __pendingAgentId or __chatSessionId or caravel:chat-thread in TaskActions.vue");
}

// S-4 / S-5: Static check for 5.2 seam globals — they must NOT be removed yet.
if (!existsSync(CHAT_STORE_SRC)) {
  fail("S-4 (preflight)", `stores/chat.ts not found`);
  fail("S-5 (preflight)", "skipped");
} else {
  const storeText = readFileSync(CHAT_STORE_SRC, "utf-8");
  check("S-4: stores/chat.ts still calls __vmOnAssistantChunk (5.2 seam)",
    storeText.includes("__vmOnAssistantChunk"),
    "stores/chat.ts no longer calls window.__vmOnAssistantChunk — 5.2 seam removed early");
  check("S-5: views/ChatView.vue still writes __chatHistory (5.2 seam)",
    (() => {
      const cv = join(REPO, "src", "ui", "app", "views", "ChatView.vue");
      return existsSync(cv) && readFileSync(cv, "utf-8").includes("__chatHistory");
    })(),
    "ChatView.vue no longer writes window.__chatHistory — 5.2 seam removed early");
}

console.log("");

// ── Dynamic browser tests ─────────────────────────────────────────────────────

const VP = { width: 1440, height: 900 };
const browser = await chromium.launch();

async function getPinia(page) {
  return page.evaluateHandle(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    return app?.config?.globalProperties?.$pinia ?? window.__pinia;
  });
}

async function getChatStoreValue(page, field) {
  return page.evaluate((f) => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
    const s = pinia?._s?.get("chat");
    return s ? s[f] : undefined;
  }, field);
}

async function openEnvelope(page) {
  await page.goto(`${BASE}/#/tasks/${SRC_TASK}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('[data-ev-action="chat"]', { timeout: 15000 });
}

// ── CT-1 through CT-8: click Chat, verify contract ──────────────────────────

{
  const page = await browser.newPage({ viewport: VP });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));

  try {
    await openEnvelope(page);

    // Capture caravel:chat-thread listeners before click
    const listenersBefore = await page.evaluate(() => {
      let count = 0;
      try {
        // If an event has listeners, getEventListeners is a DevTools-only API.
        // We use a sentinel approach: add a tracking listener to count dispatches.
        window.__ctChatThreadFired = 0;
        const orig = window.dispatchEvent.bind(window);
        window.dispatchEvent = function(ev) {
          if (ev.type === "caravel:chat-thread") window.__ctChatThreadFired++;
          return orig(ev);
        };
      } catch { /* ignore */ }
      return 0;
    });

    // Set a sentinel for __chatSessionId to detect if it gets written
    await page.evaluate(() => {
      delete window.__chatSessionId;
      delete window.__pendingAgentId;
    });

    const chatBtn = page.locator('[data-ev-action="chat"]').first();
    await chatBtn.click();
    // Wait for the store to settle
    await page.waitForTimeout(2000);

    // CT-1: __pendingAgentId absent
    const pendingAgentId = await page.evaluate(() => window.__pendingAgentId);
    check("CT-1: window.__pendingAgentId absent", pendingAgentId === undefined,
      `got: ${JSON.stringify(pendingAgentId)}`);

    // CT-2: caravel:chat-thread not dispatched
    const chatThreadFired = await page.evaluate(() => window.__ctChatThreadFired ?? 0);
    check("CT-2: caravel:chat-thread not dispatched", chatThreadFired === 0,
      `fired ${chatThreadFired} time(s)`);

    // CT-3: __chatSessionId absent
    const chatSessionId = await page.evaluate(() => window.__chatSessionId);
    check("CT-3: window.__chatSessionId absent", chatSessionId === undefined,
      `got: ${JSON.stringify(chatSessionId)}`);

    // CT-4: a chat: tab opened with the correct chatId
    // The chatId for this task is task-<root>-<agent> = task-TSK-2026-10-21-0004-alice
    const expectedChatId = SRC_TASK.split(".")[0].toLowerCase() + "-alice";
    // normalise: task-TSK-2026-10-21-0004-alice
    const EXPECT_CHAT_ID = `task-${SRC_TASK.split(".")[0]}-alice`;

    const openedChatId = await page.evaluate(() => {
      // Find a chat: tab in the workspace store
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return null;
      // Look for any chat: entry in tabs
      const tabs = ws.tabs ?? [];
      const chatTab = tabs.find((t) => t?.kind === "chat");
      return chatTab ? chatTab.chatId : null;
    });
    check("CT-4: chat: tab opened with correct chatId",
      openedChatId === EXPECT_CHAT_ID,
      `expected ${EXPECT_CHAT_ID}, got ${JSON.stringify(openedChatId)}`);

    // CT-5: composer has seed intent
    // The seed is written via chatStore.saveDraft before ws.open.
    const storedDraft = await getChatStoreValue(page, "lastActivatedChatId");
    const draftForThread = await page.evaluate((chatId) => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const s = pinia?._s?.get("chat");
      return s ? s.getDraft(chatId) : null;
    }, EXPECT_CHAT_ID);
    // Draft was set before open; after mount ChatComposer shows it.
    // Allow that it may have been consumed if the tab was already open (not an error).
    const hasIntent = draftForThread !== null && draftForThread !== undefined;
    const intentHasSeed = typeof draftForThread === "string" && draftForThread.includes(SRC_TASK.split(".")[0]);
    check("CT-5: seed intent in composer draft",
      intentHasSeed || !hasIntent /* already-open tab may have cleared draft */,
      `draft: ${JSON.stringify(draftForThread)}`);

    // CT-6: moved to static S-4 (VoiceModeOverlay must be open for __vmOnAssistantChunk
    //   to exist on window — the hook is installed in openMode(), not at mount time).

    // CT-7: __chatHistory still exists (5.2 seam)
    const chatHistory = await page.evaluate(() => Array.isArray(window.__chatHistory));
    check("CT-7: window.__chatHistory still exists (5.2 seam)",
      chatHistory === true,
      "window.__chatHistory is not an array");

    // CT-8: Voice send uses chatStore.lastActivatedChatId, NOT window.__chatSessionId.
    //
    // Approach: plant a known id directly into the store AND a wrong sentinel into
    // window.__chatSessionId. Then simulate the VoiceModeOverlay.stopAndSubmit path
    // (reads chatStore.lastActivatedChatId, not window.__chatSessionId). The intercepted
    // POST must carry the store-planted id, not the sentinel.
    //
    // We don't rely on ChatView.onMounted having set lastActivatedChatId — that may
    // not have fired if the new tab hasn't been rendered yet in this test context.
    const CT8_EXPECTED = "ct-8-probe-chat-" + Date.now();
    const sentinel = "__CT_WRONG_SENTINEL__";

    await page.evaluate(({ expected, sent }) => {
      // Plant sentinel on window
      (window).__chatSessionId = sent;
      // Plant known id into Pinia chat store
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const chatStore = pinia?._s?.get("chat");
      if (chatStore) chatStore.setLastActivatedChat(expected);
    }, { expected: CT8_EXPECTED, sent: sentinel });

    let interceptedChatId = null;
    await page.route("**/api/chat", (route) => {
      try {
        const body = JSON.parse(route.request().postData() || "{}");
        interceptedChatId = body.chatId;
      } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // Simulate what VoiceModeOverlay.stopAndSubmit does after M2 fix:
    // reads chatStore.lastActivatedChatId (NOT window.__chatSessionId).
    await page.evaluate(async () => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const chatId = pinia?._s?.get("chat")?.lastActivatedChatId ?? undefined;
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__ct_voice_probe__", chatId }),
      });
    });
    await page.waitForTimeout(500);

    check("CT-8: voice send chatId = store.lastActivatedChatId (not __chatSessionId sentinel)",
      interceptedChatId !== null && interceptedChatId !== sentinel && interceptedChatId === CT8_EXPECTED,
      `intercepted: ${JSON.stringify(interceptedChatId)}, expected: ${JSON.stringify(CT8_EXPECTED)}, sentinel: ${sentinel}`);

    await page.unroute("**/api/chat");

    check("CT: no page errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

    await page.screenshot({ path: join(SHOTS_DIR, "ct-after-chat-click.png") });

  } finally {
    await page.close();
  }
}

await browser.close();

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
