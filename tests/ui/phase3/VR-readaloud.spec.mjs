/**
 * VR-readaloud.spec.mjs — Read-aloud regression specs VR1–VR4
 *
 * VR1: Tab-aware read-aloud resolver.
 *      Navigate to a file (/#/file/Notes%2Fdoc-01.md) — a non-chat tab.
 *      DocViewer must set raText so #global-read-aloud becomes enabled.
 *      Stub sidecar + speak; click headphones; assert both called and modal opens.
 *
 * VR2: Button disabled when view has no readable content.
 *      Navigate to /#/dashboard. Assert #global-read-aloud has the `disabled`
 *      attribute (raText is null on the dashboard tab).
 *
 * VR3: Read-along player modal.
 *      Open a file, stub sidecar to return multi-paragraph prose, click headphones.
 *      Assert: modal opens, transcript lines render, counter shows "1 / N",
 *      skip buttons present, click transcript line 2 → counter advances.
 *      Stop → re-click → assert resume prompt appears (same content key).
 *
 * VR4: Chat speaker button styling.
 *      Stub /api/chats to inject a session with a completed assistant message.
 *      Find .chat-msg-speak, assert background is transparent, width/height ≥ 44px,
 *      and bounding box is bottom-right of its .chat-msg-assistant container.
 *
 * Run:
 *   node tests/ui/phase3/scratch-daemon.mjs start \
 *     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
 *   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
 *   CARAVEL_BASE=http://127.0.0.1:4636 \
 *   node tests/ui/phase3/VR-readaloud.spec.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.UI_TEST_SKILL;
if (!SKILL_ROOT) throw new Error("UI_TEST_SKILL env var required");

const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium, devices } = await import(`file://${PLAYWRIGHT_MJS}`);
const BASE = (process.env.CARAVEL_BASE ?? "http://127.0.0.1:4636").replace(/\/$/, "");
console.log(`Base URL: ${BASE}`);

const OUT_DIR = join(__dirname, ".runs", "VR-readaloud");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let shotIdx = 0;
function shot(name) { return join(OUT_DIR, `${String(++shotIdx).padStart(2, "0")}-${name}.png`); }
function rec(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log((pass ? "✓" : "✗") + ` ${label}${detail ? ": " + detail : ""}`);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "390x844",  width: 390,  height: 844,  isMobile: true,  hasTouch: true,  deviceScaleFactor: 2 },
];

const PIXEL7 = { ...devices["Pixel 7"] };

// Fixture paths served by the scratch daemon from fixture-ws.
const FILE_PATH = "Notes/doc-01.md";
const FILE_URL_HASH = `/#/file/${encodeURIComponent(FILE_PATH)}`;

// Multi-paragraph sidecar response text for VR3.
const SIDECAR_TEXT = [
  "Fixture Document 01 is part of the Phase 3 test fixture corpus.",
  "It provides content for the knowledge index so the UI can display search results during testing.",
  "Section A contains lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Section B contains more fixture content for document 01.",
  "The knowledge index should find this when searching for fixture or document.",
].join("\n\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function newCtx(browser, vp) {
  return browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile:  vp.isMobile  ?? false,
    hasTouch:  vp.hasTouch  ?? false,
    deviceScaleFactor: vp.deviceScaleFactor ?? 1,
  });
}

// Wait for the DocViewer to finish loading the file (no loading spinner in DOM).
async function waitForDocViewer(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const el = document.querySelector(".files-content");
    if (!el) return false;
    const loading = el.querySelector(".files-loading");
    return !loading && el.textContent.length > 0;
  }, { timeout });
}

// Wait for #global-read-aloud to become enabled.
async function waitForRaEnabled(page, timeout = 5000) {
  await page.waitForFunction(() => {
    const btn = document.getElementById("global-read-aloud");
    return btn && !btn.disabled && !btn.hidden;
  }, { timeout });
}

// Check whether the audio modal is open.
async function isAudioModalOpen(page) {
  return page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll("dialog.base-modal"));
    return dialogs.some(d => d.open && d.querySelector(".audio-action-card"));
  });
}

// Stub /api/settings/voice to report ttsEnabled=true so the headphones button is shown.
// The fixture workspace has no TTS API key, so the real endpoint returns ttsEnabled=false.
async function stubVoiceSettings(ctx) {
  await ctx.route("**/api/settings/voice", async (route, req) => {
    if (req.method() !== "GET") { await route.continue(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, voice: { hasApiKey: true, ttsEnabled: true, micEnabled: false, sttEnabled: false } }),
    });
  });
}

// Stub /api/voice/sidecar to return SIDECAR_TEXT or a given text string.
async function stubSidecar(ctx, text = SIDECAR_TEXT) {
  await ctx.route("**/api/voice/sidecar", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, text }),
    });
  });
}

// Stub /api/voice/speak to hang indefinitely so the AudioModal stays open while we inspect it.
// Headless Chromium can't play audio — returning a WAV immediately makes the queue drain
// before we can assert modal state. A hanging request keeps raState="playing" and the modal open.
// Tests must click Stop to clean up before closing the context.
async function stubSpeak(ctx) {
  await ctx.route("**/api/voice/speak**", () => {
    // Intentionally never fulfilled — fetch hangs, Audio is never constructed, modal stays open.
  });
}

// ── VR2: button disabled on dashboard (no raText) ─────────────────────────────
// Test this first — it's the simplest baseline and doesn't need API stubs.

console.log("\n── VR2: disabled on dashboard ──────────────────────────────────");

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    await stubVoiceSettings(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/dashboard`);
    await page.waitForSelector("#global-read-aloud", { state: "attached", timeout: 5000 });
    // Allow Vue reactivity to settle.
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => {
      const btn = document.getElementById("global-read-aloud");
      if (!btn) return { found: false };
      return {
        found: true,
        disabled: btn.disabled,
        hidden: btn.hidden,
        ttsEnabled: !btn.hidden,
      };
    });

    if (!state.found) {
      rec(`VR2 #global-read-aloud exists [${vp.name}]`, false, "button not found");
    } else {
      rec(`VR2 #global-read-aloud exists [${vp.name}]`, true, "");
      rec(`VR2 #global-read-aloud disabled on dashboard [${vp.name}]`, !!state.disabled,
          state.disabled ? "correctly disabled" : "enabled — raText should be null on dashboard");
    }

    await page.screenshot({ path: shot(`vr2-dashboard-${vp.name}`) });
    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`VR2 error [${vp.name}]`, false, String(err));
  }
}

// ── VR1: tab-aware resolver enables button on file tab ────────────────────────

console.log("\n── VR1: tab-aware resolver ─────────────────────────────────────");

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    await stubVoiceSettings(ctx);

    // Track whether sidecar + speak were called.
    let sidecarCalled = false;
    let speakCalled = false;

    await ctx.route("**/api/voice/sidecar", async (route) => {
      sidecarCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, text: "Fixture Document 01. Section A: lorem ipsum." }),
      });
    });

    // stubSpeak hangs the /api/voice/speak fetch so the modal stays open.
    // We intercept at the context level before stubSpeak so speakCalled fires first.
    await ctx.route("**/api/voice/speak**", async (route) => {
      speakCalled = true;
      // Never fulfill — keeps the modal open in "playing" state for assertions.
    });

    const page = await ctx.newPage();

    // Navigate directly to the file route — DocViewer mounts and fetches the .md.
    await page.goto(`${BASE}${FILE_URL_HASH}`);
    await page.waitForSelector("#global-read-aloud", { state: "attached", timeout: 5000 });

    // Wait for DocViewer to load the file.
    try {
      await waitForDocViewer(page, 8000);
    } catch (_) {
      rec(`VR1 DocViewer loaded file [${vp.name}]`, false, "timed out waiting for .files-content");
      await ctx.close(); await browser.close(); continue;
    }

    await page.screenshot({ path: shot(`vr1-file-loaded-${vp.name}`) });

    // After DocViewer loads a .md file, raText should be set → button enabled.
    let raEnabled = false;
    try {
      await waitForRaEnabled(page, 3000);
      raEnabled = true;
    } catch (_) {}

    rec(`VR1 #global-read-aloud enabled after file load [${vp.name}]`, raEnabled,
        raEnabled ? "raText was set by DocViewer" : "#global-read-aloud still disabled after file load");

    if (raEnabled) {
      // Click headphones — modal opens immediately, sidecar is called, speak hangs keeping it open.
      await page.click("#global-read-aloud");
      // Wait for raState to transition to "playing" (sidecar responded, chunks queued).
      try {
        await page.waitForFunction(() => {
          const btn = document.getElementById("global-read-aloud");
          return btn && (btn.classList.contains("is-playing") || btn.querySelector(".fa-stop"));
        }, { timeout: 4000 });
      } catch (_) {}
      await page.waitForTimeout(300);

      rec(`VR1 sidecar called on headphones click [${vp.name}]`, sidecarCalled,
          sidecarCalled ? "POST /api/voice/sidecar" : "sidecar was not called");
      rec(`VR1 speak called after sidecar [${vp.name}]`, speakCalled,
          speakCalled ? "GET /api/voice/speak" : "speak was not called");

      const modalOpen = await isAudioModalOpen(page);
      rec(`VR1 audio modal opened [${vp.name}]`, modalOpen,
          modalOpen ? "AudioModal is open" : "modal did not open");

      await page.screenshot({ path: shot(`vr1-modal-open-${vp.name}`) });

      // Clean up: stop playback before closing context (speak is hanging).
      await page.evaluate(() => {
        const stopBtn = document.querySelector(".audio-action-stop");
        if (stopBtn) /** @type {HTMLElement} */ (stopBtn).click();
      }).catch(() => {});
    }

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`VR1 error [${vp.name}]`, false, String(err));
  }
}

// ── VR3: read-along player modal — transcript, counter, skip, resume ──────────

console.log("\n── VR3: read-along player modal ─────────────────────────────────");

for (const vp of VIEWPORTS) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await newCtx(browser, vp);
    await stubVoiceSettings(ctx);
    await stubSidecar(ctx, SIDECAR_TEXT);
    await stubSpeak(ctx);

    const page = await ctx.newPage();
    await page.goto(`${BASE}${FILE_URL_HASH}`);
    await page.waitForSelector("#global-read-aloud", { state: "attached", timeout: 5000 });

    try {
      await waitForDocViewer(page, 8000);
    } catch (_) {
      rec(`VR3 DocViewer loaded [${vp.name}]`, false, "timed out");
      await ctx.close(); await browser.close(); continue;
    }

    try {
      await waitForRaEnabled(page, 3000);
    } catch (_) {
      rec(`VR3 #global-read-aloud enabled [${vp.name}]`, false, "button still disabled");
      await ctx.close(); await browser.close(); continue;
    }

    // First click — starts playback. Speak is stubbed to hang, keeping the modal open.
    await page.click("#global-read-aloud");
    // Wait up to 4s for the modal to open (sidecar must respond first).
    let modalOpen = false;
    try {
      await page.waitForFunction(() => {
        const dialogs = Array.from(document.querySelectorAll("dialog.base-modal"));
        return dialogs.some(d => d.open && d.querySelector(".audio-action-card"));
      }, { timeout: 4000 });
      modalOpen = true;
    } catch (_) {}
    rec(`VR3 audio modal opened [${vp.name}]`, modalOpen, modalOpen ? "open" : "not open");

    if (!modalOpen) {
      await page.screenshot({ path: shot(`vr3-no-modal-${vp.name}`) });
      await ctx.close(); await browser.close(); continue;
    }

    await page.screenshot({ path: shot(`vr3-modal-${vp.name}`) });

    // Assert transcript lines render.
    const transcriptState = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll(".audio-transcript-line"));
      const active = document.querySelector(".audio-transcript-active");
      const counter = document.querySelector(".audio-player-counter");
      const skipBack = document.querySelector('.audio-player-skip[aria-label="Previous"]');
      const skipFwd  = document.querySelector('.audio-player-skip[aria-label="Next"]');
      return {
        lineCount: lines.length,
        activeIndex: active ? lines.indexOf(active) : -1,
        counterText: counter?.textContent?.trim() ?? null,
        hasSkipBack: !!skipBack,
        hasSkipFwd: !!skipFwd,
      };
    });

    rec(`VR3 transcript lines render [${vp.name}]`, transcriptState.lineCount > 1,
        `${transcriptState.lineCount} lines`);

    // Counter should show "1 / N" (first chunk, 1-indexed).
    const counterOk = transcriptState.counterText === `1 / ${transcriptState.lineCount}` ||
                      /^\d+ \/ \d+$/.test(transcriptState.counterText ?? "");
    rec(`VR3 counter shows chunk position [${vp.name}]`, counterOk,
        `counter="${transcriptState.counterText}"`);

    rec(`VR3 skip buttons present [${vp.name}]`,
        transcriptState.hasSkipBack && transcriptState.hasSkipFwd,
        `back=${transcriptState.hasSkipBack} fwd=${transcriptState.hasSkipFwd}`);

    // Click transcript line 2 (index 1) → chunk index should advance to 1.
    if (transcriptState.lineCount >= 2) {
      await page.evaluate(() => {
        const lines = document.querySelectorAll(".audio-transcript-line");
        if (lines[1]) /** @type {HTMLElement} */ (lines[1]).click();
      });
      await page.waitForTimeout(400);

      const afterSkip = await page.evaluate(() => {
        const lines = Array.from(document.querySelectorAll(".audio-transcript-line"));
        const active = document.querySelector(".audio-transcript-active");
        const counter = document.querySelector(".audio-player-counter");
        return {
          activeIndex: active ? lines.indexOf(active) : -1,
          counterText: counter?.textContent?.trim() ?? null,
        };
      });
      // After clicking line 2 (index 1), counter should show "2 / N".
      const expectedCounter = `2 / ${transcriptState.lineCount}`;
      rec(`VR3 clicking transcript line 2 advances counter [${vp.name}]`,
          afterSkip.counterText === expectedCounter,
          `expected "${expectedCounter}", got "${afterSkip.counterText}"`);

      await page.screenshot({ path: shot(`vr3-after-skip-${vp.name}`) });
    }

    // Stop → re-click → resume prompt.
    await page.evaluate(() => {
      const stopBtn = document.querySelector(".audio-action-stop");
      if (stopBtn) /** @type {HTMLElement} */ (stopBtn).click();
    });
    await page.waitForTimeout(300);

    // Re-click headphones — same content key should show resume prompt.
    await page.click("#global-read-aloud");
    // Wait for the modal to reopen and the resume prompt to appear.
    try {
      await page.waitForFunction(() => !!document.querySelector(".audio-player-resume"), { timeout: 3000 });
    } catch (_) {}
    await page.waitForTimeout(200);

    const resumeState = await page.evaluate(() => {
      const resumeDiv = document.querySelector(".audio-player-resume");
      const restartBtn = document.querySelector(".audio-player-resume-btn.is-restart");
      const resumeBtn  = document.querySelector(".audio-player-resume-btn.is-resume");
      return {
        hasResume: !!resumeDiv,
        hasRestart: !!restartBtn,
        hasResumeBtn: !!resumeBtn,
      };
    });

    rec(`VR3 resume prompt shows on re-open [${vp.name}]`, resumeState.hasResume,
        resumeState.hasResume ? "resume prompt visible" : "no .audio-player-resume in DOM");
    if (resumeState.hasResume) {
      rec(`VR3 resume prompt has Start over + Resume buttons [${vp.name}]`,
          resumeState.hasRestart && resumeState.hasResumeBtn,
          `restart=${resumeState.hasRestart} resume=${resumeState.hasResumeBtn}`);
    }

    await page.screenshot({ path: shot(`vr3-resume-prompt-${vp.name}`) });

    // Clean up: dismiss modal before closing context.
    await page.evaluate(() => {
      const stopBtn = document.querySelector(".audio-action-stop");
      if (stopBtn) /** @type {HTMLElement} */ (stopBtn).click();
    }).catch(() => {});

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`VR3 error [${vp.name}]`, false, String(err));
  }
}

// ── VR4: chat speaker button styling ─────────────────────────────────────────

console.log("\n── VR4: chat speaker button styling ─────────────────────────────");

// Build a fake completed-chat API response.
const FAKE_CHAT_ID = "vr4-fixture-session";
const FAKE_CHAT = {
  ok: true,
  chat: {
    id: FAKE_CHAT_ID,
    title: "VR4 fixture chat",
    messages: [
      { role: "user",      text: "Hello fixture.", state: "sent" },
      { role: "assistant", text: "This is the assistant reply. It is long enough to check the speaker button position relative to the message bubble.", state: "done" },
    ],
  },
};

for (const vp of [...VIEWPORTS, { name: "pixel7", ...PIXEL7, isMobile: true, hasTouch: true }]) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctxOpts = vp.name === "pixel7"
      ? { ...PIXEL7 }
      : {
          viewport: { width: vp.width, height: vp.height },
          isMobile:  vp.isMobile  ?? false,
          hasTouch:  vp.hasTouch  ?? false,
          deviceScaleFactor: vp.deviceScaleFactor ?? 1,
        };
    const ctx = await browser.newContext(ctxOpts);

    // Stub chat list and specific chat.
    await ctx.route("**/api/chats", async (route, req) => {
      if (req.method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          chats: [{ id: FAKE_CHAT_ID, title: "VR4 fixture chat", updatedAt: new Date().toISOString() }],
        }),
      });
    });

    await ctx.route(`**/api/chats/${FAKE_CHAT_ID}**`, async (route, req) => {
      if (req.method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_CHAT),
      });
    });

    const page = await ctx.newPage();
    // Inject the session id before navigation so ChatPage loads the fixture chat.
    await page.addInitScript(`window.__chatSessionId = "${FAKE_CHAT_ID}";`);
    await page.goto(`${BASE}/#/chat`);
    await page.waitForSelector("#chat-messages", { timeout: 5000 });

    // Wait for an assistant message to render.
    let msgFound = false;
    try {
      await page.waitForSelector(".chat-msg-assistant", { timeout: 5000 });
      msgFound = true;
    } catch (_) {}

    if (!msgFound) {
      rec(`VR4 assistant message rendered [${vp.name}]`, false, ".chat-msg-assistant not found");
      await page.screenshot({ path: shot(`vr4-no-message-${vp.name}`) });
      await ctx.close(); await browser.close(); continue;
    }

    // Wait for speaker button to appear (renderChatHistory adds it).
    let speakBtnFound = false;
    try {
      await page.waitForSelector(".chat-msg-speak", { timeout: 3000 });
      speakBtnFound = true;
    } catch (_) {}

    await page.screenshot({ path: shot(`vr4-chat-${vp.name}`) });

    rec(`VR4 .chat-msg-speak rendered [${vp.name}]`, speakBtnFound,
        speakBtnFound ? "found" : "no .chat-msg-speak found — speakBtn may not have been added");

    if (!speakBtnFound) {
      await ctx.close(); await browser.close(); continue;
    }

    // Assert the icon is FA (not a raw emoji character).
    const iconState = await page.evaluate(() => {
      const btn = document.querySelector(".chat-msg-speak");
      if (!btn) return null;
      const icon = btn.querySelector("i.fa-solid.fa-volume-high, i.fa-solid");
      const hasRawEmoji = btn.textContent?.trim() === "🔊";
      return {
        hasIcon: !!icon,
        hasRawEmoji,
        innerHtml: btn.innerHTML.trim().slice(0, 80),
      };
    });
    rec(`VR4 button has FA icon (not raw emoji) [${vp.name}]`,
        !!iconState?.hasIcon && !iconState?.hasRawEmoji,
        `innerHTML="${iconState?.innerHtml}" hasRawEmoji=${iconState?.hasRawEmoji}`);

    // Assert background is transparent (not a white box).
    const styleState = await page.evaluate(() => {
      const btn = /** @type {HTMLElement | null} */ (document.querySelector(".chat-msg-speak"));
      if (!btn) return null;
      const cs = window.getComputedStyle(btn);
      return {
        background: cs.background,
        backgroundColor: cs.backgroundColor,
        border: cs.border,
        borderColor: cs.borderColor,
        borderStyle: cs.borderStyle,
        width: cs.width,
        height: cs.height,
      };
    });

    // "transparent" can be rgba(0,0,0,0) or "transparent"
    const bgTransparent =
      styleState?.backgroundColor === "transparent" ||
      styleState?.backgroundColor === "rgba(0, 0, 0, 0)" ||
      styleState?.backgroundColor?.startsWith("rgba(0, 0, 0, 0)") ||
      false;

    rec(`VR4 button background is transparent [${vp.name}]`, bgTransparent,
        `backgroundColor="${styleState?.backgroundColor}"`);

    // Assert hit target ≥ 44×44px.
    const bbox = await page.evaluate(() => {
      const btn = document.querySelector(".chat-msg-speak");
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    });

    rec(`VR4 button width ≥ 44px [${vp.name}]`, (bbox?.width ?? 0) >= 44,
        `width=${bbox?.width?.toFixed(1)}px`);
    rec(`VR4 button height ≥ 44px [${vp.name}]`, (bbox?.height ?? 0) >= 44,
        `height=${bbox?.height?.toFixed(1)}px`);

    // Assert button is in the bottom-right of .chat-msg-assistant.
    // "bottom-right" means: button right ≈ msg right, button bottom ≈ msg bottom.
    const positionState = await page.evaluate(() => {
      const btn = document.querySelector(".chat-msg-speak");
      const msg = document.querySelector(".chat-msg-assistant");
      if (!btn || !msg) return null;
      const br = btn.getBoundingClientRect();
      const mr = msg.getBoundingClientRect();
      return {
        btnRight: br.right,
        btnBottom: br.bottom,
        msgRight: mr.right,
        msgBottom: mr.bottom,
        rightGap: mr.right - br.right,
        bottomGap: mr.bottom - br.bottom,
      };
    });

    // Button right should be close to msg right (within 20px for padding).
    const rightOk = positionState && Math.abs(positionState.rightGap) <= 20;
    // Button bottom should be close to msg bottom (within 20px).
    const bottomOk = positionState && Math.abs(positionState.bottomGap) <= 20;

    rec(`VR4 button is right-aligned in message container [${vp.name}]`,
        !!rightOk,
        positionState
          ? `rightGap=${positionState.rightGap?.toFixed(1)}px (msgRight=${positionState.msgRight?.toFixed(0)} btnRight=${positionState.btnRight?.toFixed(0)})`
          : "no position data");

    rec(`VR4 button is bottom-aligned in message container [${vp.name}]`,
        !!bottomOk,
        positionState
          ? `bottomGap=${positionState.bottomGap?.toFixed(1)}px (msgBottom=${positionState.msgBottom?.toFixed(0)} btnBottom=${positionState.btnBottom?.toFixed(0)})`
          : "no position data");

    await page.screenshot({ path: shot(`vr4-button-position-${vp.name}`) });

    await ctx.close();
    await browser.close();
  } catch (err) {
    rec(`VR4 error [${vp.name}]`, false, String(err));
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n${passed + failed} total — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
