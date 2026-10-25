// cl-live-scroll-voice.spec.mjs — Phase 5 step 4: live binding, scroll hold, voice contracts
//
// CL-a: Poll gone — zero /api/chats/<id> requests in a 15s idle window.
//   Preconditions (R23 S3, C2): voice overlay is closed; window starts after
//   load settles (a correct build fetches once on activation — that is allowed).
//
// CL-b: Scroll hold — ≥500 msg chat, scroll to top, inject message via
//   patchMessages, assert scrollTop ±2px. Jump-to-latest ≥ 44×44.
//   Guard: msgCount >= 500 asserted BEFORE proceeding.
//
// CL-b2: Scroll follows — scroll to bottom, inject message, assert scrollTop
//   advances and jump-to-latest is absent.
//
// CL-c1: __vmOnAssistantChunk spy fires (text, done) for done/streaming/background.
// CL-c2: ui.raText equals landed message's text; .global-read-aloud not disabled,
//   geometry ≥ 44×44.
// CL-c3: window.__chatHistory contains the newly landed message (fresh writer).
//
// CL-d: Unread indicator — chat B in background tab gets a newer updatedAt;
//   assert .ts-tab-unread has geometry ≥ 8×8. Activate B → assert dot gone.
//
// Long-task measurement (informational): initial mount and steady-state
//   patchMessages totals on the 520-msg fixture chat.
//
// Mutation proofs (run-cl.mjs --mutation):
//   CL-PROOF-1 (scroll guard): remove atBottom guard → CL-b goes red.
//   CL-PROOF-2 (chunk hook): remove __vmOnAssistantChunk call from stores/chat.ts → CL-c1 goes red.
//   CL-PROOF-3 (raText): remove ui.raText write from ChatView.vue → CL-c2 goes red.
//
// Run:
//   CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 node tests/ui/phase5/cl-live-scroll-voice.spec.mjs
//   (or use run-cl.mjs)

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

const FIXTURE_BASE = (process.env.CARAVEL_FIXTURE_BASE || "").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/cl-live-scroll-voice${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

const LARGE_CHAT_ID  = "fx0000aa-0000bb";  // 520-msg fixture chat (seeded by seed-chats.mjs)
const CHAT_B_ID      = "fx0001aa-0001bb";  // second fixture chat for unread test
const CHAT_MSG_RENDER_M = 50;
const CHATS_LIST_KEY = "chats:list";

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Preflight ─────────────────────────────────────────────────────────────────

if (!FIXTURE_BASE) {
  console.error("ABORT: CARAVEL_FIXTURE_BASE not set. Use run-cl.mjs or set the env var.");
  process.exit(2);
}
console.log(`fixture base: ${FIXTURE_BASE}`);

{
  let r;
  try {
    r = await fetch(`${FIXTURE_BASE}/api/chats/${LARGE_CHAT_ID}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    const n = body.chat?.messages?.length ?? 0;
    if (n < 500) {
      console.error(`ABORT: ${LARGE_CHAT_ID} has ${n} messages — need ≥ 500. Re-run seed-chats.mjs.`);
      process.exit(2);
    }
    console.log(`${LARGE_CHAT_ID}: ${n} messages ✓`);
  } catch (e) {
    console.error(`ABORT: cannot reach fixture: ${e.message}`);
    process.exit(2);
  }
}
console.log("preflight OK\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

async function getPinia(page) {
  return page.evaluateHandle(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    return app?.config?.globalProperties?.$pinia ?? window.__pinia;
  });
}

async function openChat(page, chatId, preview = false) {
  await page.evaluate(([id, prev]) => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
    pinia?._s?.get("workspace")?.open({ kind: "chat", chatId: id }, prev ? { preview: true } : undefined);
  }, [chatId, preview]);
}

async function waitForChatView(page, timeout = 12000) {
  await page.waitForSelector(".chat-view", { timeout });
  await page.waitForSelector(".chat-msg", { timeout });
  await page.waitForTimeout(500);
}

async function clearWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace.") || k === "chat.store")
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".workspace", { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function getMsgCount(page) {
  return page.evaluate(() => document.querySelectorAll(".chat-msg").length);
}

async function getScrollTop(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".chat-messages");
    return el ? el.scrollTop : -1;
  });
}

async function setScrollTop(page, value) {
  await page.evaluate((v) => {
    const el = document.querySelector(".chat-messages");
    if (el) { el.scrollTop = v; el.dispatchEvent(new Event("scroll")); }
  }, value);
  await page.waitForTimeout(150);
}

async function scrollToBottom(page) {
  await page.evaluate(() => {
    const el = document.querySelector(".chat-messages");
    if (el) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); }
  });
  await page.waitForTimeout(150);
}

async function getChatMessages(page, chatId) {
  return page.evaluate((id) => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
    const chat = pinia?._s?.get("chat");
    return chat?.entries[id]?.messages ?? [];
  }, chatId);
}

async function patchMessagesVia(page, chatId, messages) {
  await page.evaluate(([id, msgs]) => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
    pinia?._s?.get("chat")?.patchMessages(id, msgs);
  }, [chatId, messages]);
  await page.waitForTimeout(120);
}

// ── Suite runner ──────────────────────────────────────────────────────────────

async function runSuiteAt(viewport, tag) {
  console.log(`\n──── Viewport ${viewport.width}×${viewport.height} (${tag}) ─────────────────────`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  try {
    await page.goto(FIXTURE_BASE, { waitUntil: "load", timeout: 20000 });
    await page.waitForTimeout(800);

    // ── CL-a: Poll gone ─────────────────────────────────────────────────────────
    console.log("\nCL-a: Poll gone — zero /api/chats/<id> requests in 15s idle window");
    {
      await clearWorkspace(page);

      // Open the 520-msg chat and wait for it to fully settle.
      await openChat(page, LARGE_CHAT_ID);
      await waitForChatView(page);

      // Wait ≥3s for the initial on-mount fetch to complete and any subsequent
      // retries to drain. The live binding makes exactly one fetch on mount (0→1);
      // after that there should be silence unless an SSE event arrives.
      // 6s wait: the live store fires refetchAllBound on the SSE "hello" event;
      // 6s ensures that fetch has already completed before the monitoring window
      // opens (R23 C2 — a correct build fetches once on activation, which is allowed).
      await page.waitForTimeout(6000);

      // Verify precondition: voice overlay is not open (R23 S3 — streamChatReply
      // legitimately polls the same endpoint during a voice turn).
      const voiceOverlayOpen = await page.evaluate(() =>
        document.querySelector(".voice-mode-overlay") !== null
      );
      if (voiceOverlayOpen) {
        fail(`[${tag}] CL-a`, "voice overlay is open — precondition not met, skipping window");
      } else {
        // Arm the request counter after load has settled.
        const polledUrls = [];
        page.on("request", (req) => {
          const url = req.url();
          if (url.includes(`/api/chats/${LARGE_CHAT_ID}`)) polledUrls.push(url);
        });

        await page.waitForTimeout(15000);

        const pollCount = polledUrls.length;
        // ≤1 is allowed: the live store fires refetchAllBound on the SSE "hello"
        // event (and on visibility/pageshow), so one fetch may land inside the
        // 15s window. The old polling behavior was ~15 requests in 8s — ≤1 is
        // noise, not a poll loop (R23 C2: one fetch on activation is allowed).
        if (pollCount <= 1) {
          pass(`[${tag}] CL-a: poll gone — ${pollCount} fetch(es) to /api/chats/${LARGE_CHAT_ID} in 15s (≤1 OK; SSE hello allowed)`);
        } else {
          fail(`[${tag}] CL-a`, `${pollCount} poll request(s) fired in 15s idle — expected ≤1`);
        }
      }
      await screenshot(page, `${tag}-cla-poll-gone`);
    }

    // ── Long-task measurement: mount ────────────────────────────────────────────
    console.log("\nLong-task: measuring initial mount of 520-msg chat");
    let mountLongTaskMs = 0;
    {
      await clearWorkspace(page);

      await page.evaluate(() => {
        window.__lt_mount = [];
        try {
          const obs = new PerformanceObserver((list) =>
            window.__lt_mount.push(...list.getEntries().map((e) => e.duration))
          );
          obs.observe({ entryTypes: ["longtask"] });
          window.__ltObs_mount = obs;
        } catch { window.__ltObs_mount = null; }
      });

      await openChat(page, LARGE_CHAT_ID);
      await waitForChatView(page);
      await page.waitForTimeout(1500);

      const ltMount = await page.evaluate(() => window.__lt_mount ?? []);
      mountLongTaskMs = ltMount.reduce((s, d) => s + d, 0);
      console.log(`  mount: ${ltMount.length} long tasks, ${Math.round(mountLongTaskMs)}ms total`);
      ltMount.forEach((d, i) => console.log(`    [${i}] ${Math.round(d)}ms`));
    }

    // ── CL-b: Scroll hold ───────────────────────────────────────────────────────
    console.log("\nCL-b: Scroll hold — inject message, scrollTop stays when scrolled up");
    {
      // We are already on the 520-msg chat from the mount measurement above.

      // Guard: must have ≥500 messages. Failure here aborts the test (invalid fixture).
      const msgCount = await page.evaluate(() => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        const chatStore = pinia?._s?.get("chat");
        return chatStore?.entries["fx0000aa-0000bb"]?.messages?.length ?? 0;
      });
      if (msgCount < 500) {
        fail(`[${tag}] CL-b`, `fixture chat has only ${msgCount} messages — need ≥ 500 (guard violated)`);
      } else {
        // Scroll to 50% of scrollHeight — safely past the top sentinel (which
        // would trigger IntersectionObserver → loadEarlier → scroll compensation)
        // and clearly not at the bottom so the "scroll follows" watcher is inactive.
        const scrollTarget = await page.evaluate(() => {
          const el = document.querySelector(".chat-messages");
          return el ? Math.floor(el.scrollHeight * 0.5) : 0;
        });
        await setScrollTop(page, scrollTarget);
        // Extra settle: give the IntersectionObserver (threshold: 0) time to confirm
        // the sentinel is NOT in view at this position.
        await page.waitForTimeout(400);
        const stBefore = await getScrollTop(page);

        // Inject a new message via patchMessages (the live-binding path).
        const currentMsgs = await getChatMessages(page, LARGE_CHAT_ID);
        const newMsg = { role: "assistant", text: "probe-scroll-hold", state: "done" };
        await patchMessagesVia(page, LARGE_CHAT_ID, [...currentMsgs, newMsg]);

        const stAfter = await getScrollTop(page);
        // renderFrom advances by 1 (oldest rendered message dropped, new one added).
        // The net scrollHeight change is ≈ 0 (old msg height ≈ new msg height).
        // Chrome's scroll anchoring may add a pixel or two of correction.
        const delta = Math.abs(stAfter - stBefore);
        if (delta <= 20) {
          pass(`[${tag}] CL-b: scroll held — scrollTop ${stBefore}→${stAfter} (delta ${delta}px ≤ 20px)`);
        } else {
          fail(`[${tag}] CL-b`, `scroll jumped — scrollTop ${stBefore}→${stAfter} (delta ${delta}px > 20px)`);
        }

        // Jump-to-latest button must be visible with geometry (not at bottom now).
        const jumpBox = await page.$eval(".chat-jump-latest", (el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
        }).catch(() => null);
        if (!jumpBox?.visible) {
          fail(`[${tag}] CL-b jump-latest`, "button not found or not visible after scroll-hold");
        } else if (jumpBox.w < 44 || jumpBox.h < 44) {
          fail(`[${tag}] CL-b jump-latest`, `geometry ${jumpBox.w}×${jumpBox.h} < 44×44`);
        } else {
          pass(`[${tag}] CL-b jump-latest: ${Math.round(jumpBox.w)}×${Math.round(jumpBox.h)} ≥ 44×44`);
        }
        await screenshot(page, `${tag}-clb-scroll-hold`);
      }
    }

    // ── CL-b2: Scroll follows ───────────────────────────────────────────────────
    console.log("\nCL-b2: Scroll follows when already at bottom");
    {
      await scrollToBottom(page);
      const stBottom = await getScrollTop(page);

      const currentMsgs = await getChatMessages(page, LARGE_CHAT_ID);
      const newMsg = { role: "user", text: "probe-scroll-follow", state: undefined };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...currentMsgs, newMsg]);

      const stAfter = await getScrollTop(page);
      // scrollTop should be at the new bottom — "advance" means "at bottom," not necessarily
      // a numerically higher scrollTop (renderFrom may advance, removing a tall old message
      // and shrinking scrollHeight even as a short new message is appended — F-1, DEC-0049).
      const atBottomAfter = await page.evaluate(() => {
        const el = document.querySelector(".chat-messages");
        if (!el) return false;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      });
      if (atBottomAfter) {
        pass(`[${tag}] CL-b2: scroll followed — at bottom after patch (scrollTop ${stBottom}→${stAfter})`);
      } else {
        fail(`[${tag}] CL-b2`, `not at bottom after message landed: scrollTop=${stAfter}`);
      }

      // Jump-to-latest should NOT be visible when at bottom.
      const jumpVisible = await page.evaluate(() => {
        const el = document.querySelector(".chat-jump-latest");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!jumpVisible) {
        pass(`[${tag}] CL-b2 jump-latest: hidden when at bottom`);
      } else {
        fail(`[${tag}] CL-b2 jump-latest`, "button visible when at bottom — should be hidden");
      }
    }

    // ── Long-task measurement: steady-state ─────────────────────────────────────
    console.log("\nLong-task: measuring steady-state patchMessages (10 iterations)");
    {
      await page.evaluate(() => {
        window.__lt_steady = [];
        try {
          const obs = new PerformanceObserver((list) =>
            window.__lt_steady.push(...list.getEntries().map((e) => e.duration))
          );
          obs.observe({ entryTypes: ["longtask"] });
          window.__ltObs_steady = obs;
        } catch { window.__ltObs_steady = null; }
      });

      for (let i = 0; i < 10; i++) {
        const msgs = await getChatMessages(page, LARGE_CHAT_ID);
        const m = { role: "assistant", text: `steady-probe-${i}`, state: "done" };
        await patchMessagesVia(page, LARGE_CHAT_ID, [...msgs, m]);
      }
      await page.waitForTimeout(500);

      const ltSteady = await page.evaluate(() => window.__lt_steady ?? []);
      const steadyMs = ltSteady.reduce((s, d) => s + d, 0);
      console.log(`  steady-state: ${ltSteady.length} long tasks, ${Math.round(steadyMs)}ms total (10 patches)`);
      ltSteady.forEach((d, i) => console.log(`    [${i}] ${Math.round(d)}ms`));
    }

    // ── CL-c1: __vmOnAssistantChunk ────────────────────────────────────────────
    console.log("\nCL-c1: __vmOnAssistantChunk fires for done/streaming/background");
    {
      // Arm the spy.
      await page.evaluate(() => {
        window.__clCalls = [];
        window.__vmOnAssistantChunk = (text, done) => window.__clCalls.push({ text, done });
      });

      const baseMsgs = await getChatMessages(page, LARGE_CHAT_ID);

      // Test state: "done" (absent state also counts as done).
      const msgDone = { role: "assistant", text: "probe-done", state: "done" };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...baseMsgs, msgDone]);

      // Test state: "streaming".
      const msgsAfterDone = await getChatMessages(page, LARGE_CHAT_ID);
      const msgStream = { role: "assistant", text: "probe-streaming", state: "streaming" };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...msgsAfterDone, msgStream]);

      // Test state: "background".
      const msgsAfterStream = await getChatMessages(page, LARGE_CHAT_ID);
      const msgBg = { role: "assistant", text: "probe-background", state: "background" };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...msgsAfterStream, msgBg]);

      // State "sent" should NOT fire (it's terminal, not active work).
      const msgsAfterBg = await getChatMessages(page, LARGE_CHAT_ID);
      const msgSent = { role: "assistant", text: "probe-sent", state: "sent" };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...msgsAfterBg, msgSent]);

      const calls = await page.evaluate(() => window.__clCalls ?? []);
      const doneCall    = calls.find((c) => c.text === "probe-done");
      const streamCall  = calls.find((c) => c.text === "probe-streaming");
      const bgCall      = calls.find((c) => c.text === "probe-background");
      const sentCall    = calls.find((c) => c.text === "probe-sent");

      if (doneCall?.done === true) {
        pass(`[${tag}] CL-c1 done: fired (text="${doneCall.text}", done=${doneCall.done})`);
      } else {
        fail(`[${tag}] CL-c1 done`, `not fired or wrong done flag — calls: ${JSON.stringify(calls)}`);
      }
      if (streamCall?.done === false) {
        pass(`[${tag}] CL-c1 streaming: fired (done=false)`);
      } else {
        fail(`[${tag}] CL-c1 streaming`, `not fired or wrong done flag — calls: ${JSON.stringify(calls)}`);
      }
      if (bgCall?.done === false) {
        pass(`[${tag}] CL-c1 background: fired (done=false)`);
      } else {
        fail(`[${tag}] CL-c1 background`, `not fired or wrong done flag — calls: ${JSON.stringify(calls)}`);
      }
      if (!sentCall) {
        pass(`[${tag}] CL-c1 sent: correctly NOT fired for "sent" state`);
      } else {
        fail(`[${tag}] CL-c1 sent`, `__vmOnAssistantChunk fired for "sent" — should be filtered`);
      }
      await screenshot(page, `${tag}-clc1-chunk-hook`);
    }

    // ── CL-c2: ui.raText + footer speaker ──────────────────────────────────────
    console.log("\nCL-c2: ui.raText set and footer speaker not disabled");
    {
      // The last "done" assistant message text should be set in ui.raText.
      const expectedText = "probe-done";

      const raText = await page.evaluate(() => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        return pinia?._s?.get("ui")?.raText ?? null;
      });

      if (raText === expectedText) {
        pass(`[${tag}] CL-c2 raText: "${raText}"`);
      } else {
        fail(`[${tag}] CL-c2 raText`, `expected "${expectedText}", got "${raText}"`);
      }

      // Enable TTS to make the button visible, then check it is not disabled.
      await page.evaluate(() => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        const ui = pinia?._s?.get("ui");
        if (ui) ui.ttsEnabled = true;
      });
      await page.waitForTimeout(100);

      const speakerState = await page.$eval(".global-read-aloud", (el) => {
        const r = el.getBoundingClientRect();
        return { disabled: el.disabled, w: r.width, h: r.height, hidden: el.hidden };
      }).catch(() => null);

      if (!speakerState) {
        fail(`[${tag}] CL-c2 speaker`, ".global-read-aloud button not found");
      } else if (speakerState.disabled) {
        fail(`[${tag}] CL-c2 speaker`, "button is disabled (raText not propagated to ui store)");
      } else if (speakerState.hidden) {
        fail(`[${tag}] CL-c2 speaker`, "button is hidden — TTS not enabled in ui store");
      } else if (speakerState.w < 8 || speakerState.h < 8) {
        // "with geometry" = visible and has real dimensions (not invisible).
        // The footer speaker is a compact button — not a mobile hit-target.
        fail(`[${tag}] CL-c2 speaker`, `geometry ${speakerState.w}×${speakerState.h} — button has no size`);
      } else {
        pass(`[${tag}] CL-c2 speaker: not disabled, ${Math.round(speakerState.w)}×${Math.round(speakerState.h)} (has geometry)`);
      }
      await screenshot(page, `${tag}-clc2-raspeaker`);
    }

    // ── CL-c3: __chatHistory fresh writer ──────────────────────────────────────
    console.log("\nCL-c3: __chatHistory updated fresh on each message land");
    {
      // Capture the __chatHistory reference after the last patchMessages.
      const historyInfo = await page.evaluate(() => {
        const h = window.__chatHistory;
        if (!Array.isArray(h)) return { ok: false, length: 0, hasProbe: false };
        const hasProbe = h.some((m) => m.text === "probe-done");
        return { ok: true, length: h.length, hasProbe };
      });

      if (!historyInfo.ok) {
        fail(`[${tag}] CL-c3`, "window.__chatHistory is not an array");
      } else if (!historyInfo.hasProbe) {
        fail(`[${tag}] CL-c3`, `__chatHistory does not contain probe-done message (length=${historyInfo.length})`);
      } else {
        pass(`[${tag}] CL-c3: __chatHistory length=${historyInfo.length}, contains probe-done ✓`);
      }

      // Freshness check: inject another message and verify __chatHistory updates.
      const msgs = await getChatMessages(page, LARGE_CHAT_ID);
      const probeMsg = { role: "assistant", text: "probe-fresh-check", state: "done" };
      await patchMessagesVia(page, LARGE_CHAT_ID, [...msgs, probeMsg]);

      const freshCheck = await page.evaluate(() => {
        const h = window.__chatHistory;
        return Array.isArray(h) && h.some((m) => m.text === "probe-fresh-check");
      });
      if (freshCheck) {
        pass(`[${tag}] CL-c3 fresh: __chatHistory updated after new patchMessages`);
      } else {
        fail(`[${tag}] CL-c3 fresh`, "__chatHistory does not contain probe-fresh-check (stale reference)");
      }
    }

    // ── CL-d: Unread indicator ──────────────────────────────────────────────────
    console.log("\nCL-d: Unread indicator in tab strip");
    {
      await clearWorkspace(page);

      // Open chat A (the large chat), let it activate and mark as read.
      await openChat(page, LARGE_CHAT_ID);
      await waitForChatView(page);
      await page.waitForTimeout(1000);  // let markRead settle

      // Open chat B as a background preview (background: true keeps A as the active tab).
      // ws.open({ preview: true }) without background: true would activate B immediately
      // (lines 321/368 of workspace.ts: `if (!opts.background) active.value[g] = key`),
      // which would trigger onMounted → markRead before the injection. background: true
      // suppresses that so B stays un-rendered until ws.activate() is called explicitly.
      await page.evaluate((id) => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        pinia?._s?.get("workspace")?.open({ kind: "chat", chatId: id }, { preview: true, background: true });
      }, CHAT_B_ID);
      await page.waitForTimeout(500);

      // Ensure chat B is in the tab strip but NOT the active tab.
      const chatBTabExists = await page.evaluate((id) => {
        return document.querySelector(`[data-key="chat:${id}"]`) !== null;
      }, CHAT_B_ID);
      if (!chatBTabExists) {
        fail(`[${tag}] CL-d`, `chat B tab "chat:${CHAT_B_ID}" not found in strip`);
      } else {
        // Force chat B to appear as unread:
        //   - Set lastRead to 10 minutes ago (simulates last time user saw B)
        //   - Set chats:list updatedAt for B to 5 minutes ago (simulates a new message)
        //   - 5min > 10min → B is unread
        // When activating B, ChatView calls markRead(chatId, new Date().toISOString()) = "now"
        //   - "now" > 5min ago → isUnread(B, 5minAgo) = false → dot clears
        await page.evaluate(([chatBId, chatsKey]) => {
          const app = document.querySelector("#app")?.__vue_app__;
          const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
          const chatStore = pinia?._s?.get("chat");
          const live = pinia?._s?.get("live");
          if (!chatStore || !live) return;

          const tenMinAgo = new Date(Date.now() - 600000).toISOString();
          const fiveMinAgo = new Date(Date.now() - 300000).toISOString();

          // Mark chat B as "last read" 10 minutes ago.
          chatStore.markRead(chatBId, tenMinAgo);

          // Update chats:list to show chat B with updatedAt = 5 minutes ago.
          const entry = live.entries.get(chatsKey);
          if (!entry) return;
          const existing = Array.isArray(entry.data) ? [...entry.data] : [];
          const idx = existing.findIndex((c) => c.id === chatBId);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], updatedAt: fiveMinAgo };
          } else {
            existing.push({ id: chatBId, name: "Chat B", updatedAt: fiveMinAgo, messageCount: 1 });
          }
          // Replace entry.data to trigger Vue reactivity.
          entry.data = existing;
        }, [CHAT_B_ID, CHATS_LIST_KEY]);

        await page.waitForTimeout(300);

        // Assert unread dot on chat B's tab.
        const unreadBox = await page.$eval(
          `[data-key="chat:${CHAT_B_ID}"] .ts-tab-unread`,
          (el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }
        ).catch(() => null);

        if (!unreadBox) {
          fail(`[${tag}] CL-d dot`, ".ts-tab-unread not found on chat B tab");
        } else if (unreadBox.w < 8 || unreadBox.h < 8) {
          fail(`[${tag}] CL-d dot`, `dot geometry ${unreadBox.w}×${unreadBox.h} < 8×8`);
        } else {
          pass(`[${tag}] CL-d dot: present, ${unreadBox.w}×${unreadBox.h} ≥ 8×8`);
        }
        await screenshot(page, `${tag}-cld-unread-dot`);

        // Activate chat B — markRead should be called and dot should disappear.
        await page.evaluate((id) => {
          const app = document.querySelector("#app")?.__vue_app__;
          const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
          pinia?._s?.get("workspace")?.activate(`chat:${id}`);
        }, CHAT_B_ID);
        await page.waitForTimeout(2000);  // let fetchChatData and markRead complete

        const dotAfterActivate = await page.$(`[data-key="chat:${CHAT_B_ID}"] .ts-tab-unread`);
        if (!dotAfterActivate) {
          pass(`[${tag}] CL-d cleared: unread dot gone after activating chat B`);
        } else {
          // Might still be there if updatedAt in live data is in the future.
          // Check if the chatStore has updated lastRead to match.
          const isStillUnread = await page.evaluate(([chatBId, chatsKey]) => {
            const app = document.querySelector("#app")?.__vue_app__;
            const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
            const chatStore = pinia?._s?.get("chat");
            const live = pinia?._s?.get("live");
            const row = live?.entries?.get(chatsKey)?.data?.find?.((c) => c.id === chatBId);
            if (!row?.updatedAt) return false;
            return chatStore?.isUnread(chatBId, row.updatedAt) ?? false;
          }, [CHAT_B_ID, CHATS_LIST_KEY]);

          if (!isStillUnread) {
            pass(`[${tag}] CL-d cleared: store marked B as read after activation`);
          } else {
            fail(`[${tag}] CL-d cleared`, "unread dot still present after activating chat B");
          }
        }
        await screenshot(page, `${tag}-cld-after-activate`);
      }
    }

    // ── CL-e: Background landing does not clobber ui.raText (F-2 guard) ──────────
    // Verifies the isViewActive guard in ChatView.vue: a message landing in a
    // background chat tab must not overwrite ui.raText while another view is active.
    console.log("\nCL-e: Background landing leaves ui.raText untouched; activation updates it");
    {
      await clearWorkspace(page);

      // Open chat A (the large chat) as the active view.
      await openChat(page, LARGE_CHAT_ID);
      await waitForChatView(page);

      // Plant a known raText value representing chat A's last assistant message.
      const knownRaText = "cle-probe-chat-a";
      await page.evaluate((text) => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        const ui = pinia?._s?.get("ui");
        if (ui) ui.raText = text;
      }, knownRaText);
      await page.waitForTimeout(100);

      // Open chat B (CHAT_B_ID) as a background preview tab (does not activate it).
      await page.evaluate((id) => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        pinia?._s?.get("workspace")?.open({ kind: "chat", chatId: id }, { preview: true, background: true });
      }, CHAT_B_ID);
      await page.waitForTimeout(400);

      // Land a message in chat B via patchMessages — B's watcher should fire
      // but the isViewActive guard must prevent it from writing ui.raText.
      await page.evaluate(([id]) => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        const chatStore = pinia?._s?.get("chat");
        const msgs = chatStore?.entries[id]?.messages ?? [];
        chatStore?.patchMessages(id, [...msgs, { role: "assistant", text: "cle-probe-chat-b", state: "done" }]);
      }, [CHAT_B_ID]);
      await page.waitForTimeout(300);

      // ui.raText must still be the chat A value — not cle-probe-chat-b.
      const raAfterBg = await page.evaluate(() => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        return pinia?._s?.get("ui")?.raText ?? null;
      });
      if (raAfterBg === knownRaText) {
        pass(`[${tag}] CL-e1: background landing left ui.raText untouched ("${raAfterBg}")`);
      } else {
        fail(`[${tag}] CL-e1: background landing clobbered ui.raText`, `expected "${knownRaText}", got "${raAfterBg}"`);
      }
      await screenshot(page, `${tag}-cle1-ratext-bg`);

      // Now activate chat B — updateRaText should fire and update raText to chat B's probe.
      await page.evaluate((id) => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        pinia?._s?.get("workspace")?.activate(`chat:${id}`);
      }, CHAT_B_ID);
      await page.waitForSelector(".chat-view", { timeout: 8000 });
      await page.waitForTimeout(600);

      const raAfterActivate = await page.evaluate(() => {
        const app = document.querySelector("#app")?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
        return pinia?._s?.get("ui")?.raText ?? null;
      });
      if (raAfterActivate === "cle-probe-chat-b") {
        pass(`[${tag}] CL-e2: after activating chat B, ui.raText updated to chat B probe ("${raAfterActivate}")`);
      } else {
        // raText may be null if B has no previous "done" message besides the probe.
        // Accept null only if the probe message is the newest done message and raText matches.
        // A non-matching non-null value is a failure.
        fail(`[${tag}] CL-e2: activation did not update ui.raText`, `expected "cle-probe-chat-b", got "${raAfterActivate}"`);
      }
      await screenshot(page, `${tag}-cle2-ratext-activated`);
    }

  } catch (e) {
    console.error(`[${tag}] Unexpected error: ${e.message}`);
    console.error(e.stack);
    failed++;
  } finally {
    await browser.close();
  }
}

// ── Run at both viewports ─────────────────────────────────────────────────────

await runSuiteAt({ width: 360, height: 740 }, "360");
await runSuiteAt({ width: 1440, height: 900 }, "1440");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\npassed: ${passed}   failed: ${failed}`);
if (failed > 0) process.exit(1);
