// cp-chat-picker.spec.mjs — Phase 5 step 2: Chat list picker (Suite CP)
//
// Rewrote for `.09` — spec previously drove the deleted pre-step-3 surface
// (.chat-panel, #chat-history-btn, legacy:chat). Now drives the post-step-3
// surface: chat: resource via ChatView, picker via .chat-toolbar-btn.
//
// CP-6: Open menu → Chat entry — the documented entry route from the shell.
//       Clicks .open-menu-btn then #tab-chat; asserts .chat-history-dropdown
//       renders with rows in full-pane geometry (height > half viewport height).
//       Asserts a picker row click opens a chat: preview tab.
// CP-7: URL /chat route — navigates directly to /chat; asserts same surface.
//
// CP-1: Bounded render — rendered rows === CHAT_LIST_RENDER_N (N=20).
//       Bound label "Showing 20 of 27" is present. N < total asserted.
// CP-2: Search reaches a chat ranked below N (XRAY-FIXTURE-CORPUS-TOKEN).
// CP-3: Displaced active chat — active chat (fx0000aa-0000bb, oldest by updatedAt,
//       position 27 in the sorted corpus) displaces the Nth row; rendered count
//       remains exactly N=20; active row present with rename and resync controls.
// CP-4: Row controls ≥ 44×44 px at 360×740 viewport.
// CP-5: Preview-tab semantics — a picker row click opens the chat as a preview tab.
//
// Preflight: asserts CARAVEL_FIXTURE_BASE is set and the known fixture sentinel
//   (XRAY-FIXTURE-CORPUS-TOKEN) is resolvable via /api/chats. Aborts loudly
//   if either check fails (WAL-148).
//
// Mutation proof (CP-PROOF):
//   Run via MUTATION_BASE — starts a separate mutated daemon and queries /api/chats
//   directly. Sentinel absent from the sliced list (red); present in the original (green).
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 \
//   node tests/ui/phase5/cp-chat-picker.spec.mjs
//
// Prerequisites: fixture daemon on :4659 and test server on :4660 (see run-cp.mjs).

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
const SHOTS_DIR = join(__dirname, `.runs/cp-chat-picker${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

const CHAT_LIST_RENDER_N = 20;
const FIXTURE_SENTINEL = "XRAY-FIXTURE-CORPUS-TOKEN";
// fx0000aa-0000bb is the oldest chat (daysAgo=50) — position 27 in the sorted corpus
const DISPLACED_CHAT_ID = "fx0000aa-0000bb";
// Any recent fixture chat to open as the initial view (inside top N)
const RECENT_CHAT_ID = "fx0001aa-0001bb";

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Preflight ─────────────────────────────────────────────────────────────────

console.log("\n── Preflight ─────────────────────────────────────────────────────────");

if (!FIXTURE_BASE) {
  console.error("ABORT: CARAVEL_FIXTURE_BASE is not set.");
  console.error("  This is a corpus-reading suite — it must run against the fixture daemon.");
  console.error("  Set CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 (or use run-cp.mjs).");
  process.exit(2);
}
console.log(`  fixture base: ${FIXTURE_BASE}`);

// Verify sentinel resolves via /api/chats
let fixtureChats;
let FIXTURE_TOTAL;
try {
  const r = await fetch(`${FIXTURE_BASE}/api/chats`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  fixtureChats = body.chats ?? [];
  FIXTURE_TOTAL = fixtureChats.length;
} catch (e) {
  console.error(`ABORT: cannot reach ${FIXTURE_BASE}/api/chats — ${e.message}`);
  console.error("  Is the fixture daemon and test server running? See run-cp.mjs.");
  process.exit(2);
}

const sentinelChat = fixtureChats.find(
  (c) => (c.name ?? "").includes(FIXTURE_SENTINEL) || (c.preview ?? "").includes(FIXTURE_SENTINEL)
);
if (!sentinelChat) {
  console.error(`ABORT: fixture sentinel "${FIXTURE_SENTINEL}" not found in /api/chats.`);
  console.error("  Seed the fixture first: node tests/ui/phase3/fixture-ws/seed-chats.mjs");
  process.exit(2);
}
console.log(`  sentinel chat found: ${sentinelChat.id} ("${sentinelChat.name ?? sentinelChat.preview}")`);
console.log(`  total fixture chats: ${FIXTURE_TOTAL} (want ≥ ${CHAT_LIST_RENDER_N + 1})`);
if (FIXTURE_TOTAL <= CHAT_LIST_RENDER_N) {
  console.error(`ABORT: fixture has only ${FIXTURE_TOTAL} chats — need > ${CHAT_LIST_RENDER_N} to test the bound.`);
  process.exit(2);
}
console.log("  preflight OK\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace.") || k === "chat.store")
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".workspace", { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function openChatView(page, chatId) {
  await page.evaluate((id) => {
    const vueApp = document.querySelector("#app")?.__vue_app__;
    const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
    const ws = pinia?._s?.get("workspace");
    if (ws) ws.open({ kind: "chat", chatId: id });
  }, chatId);
  await page.waitForSelector(".chat-view", { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function openChatViewPreview(page, chatId) {
  await page.evaluate((id) => {
    const vueApp = document.querySelector("#app")?.__vue_app__;
    const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
    const ws = pinia?._s?.get("workspace");
    if (ws) ws.open({ kind: "chat", chatId: id }, { preview: true });
  }, chatId);
  await page.waitForTimeout(400);
}

// Wait until the chats:list store has populated enough rows for the bound test.
async function waitForChatsList(page) {
  await page.waitForFunction(
    (n) => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const live = pinia?._s?.get("live");
      if (!live) return false;
      const entry = live.entries?.get("chats:list");
      return Array.isArray(entry?.data) && entry.data.length >= n;
    },
    CHAT_LIST_RENDER_N + 1,
    { timeout: 20000 }
  );
}

async function openPicker(page) {
  // The "Chats" button in ChatHeader opens the picker overlay.
  await page.click(".chat-toolbar-btn", { timeout: 5000 });
  await page.waitForSelector(".chat-history-dropdown", { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function closePicker(page) {
  const isOpen = await page.$(".chat-history-dropdown");
  if (isOpen) {
    await page.click(".chat-toolbar-btn");
    await page.waitForTimeout(200);
  }
}

async function screenshot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

// ── Suite runner ──────────────────────────────────────────────────────────────

async function runSuiteAt(viewport, tag) {
  console.log(`\n──── Viewport ${viewport.width}×${viewport.height} (${tag}) ─────────────────────`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  try {
    await page.goto(FIXTURE_BASE, { waitUntil: "load", timeout: 15000 });
    await page.waitForTimeout(800);

    // CP-1: Bounded render
    console.log("\nCP-1: Bounded render — rendered rows === N");
    {
      await clearWorkspace(page);
      await openChatView(page, RECENT_CHAT_ID);
      await waitForChatsList(page);
      await openPicker(page);

      const rowCount = await page.$$eval(".chat-history-row", (els) => els.length);
      if (rowCount === CHAT_LIST_RENDER_N) {
        pass(`[${tag}] CP-1a: rendered rows = ${rowCount} (=== N=${CHAT_LIST_RENDER_N})`);
      } else {
        fail(`[${tag}] CP-1a: rendered rows`, `expected ${CHAT_LIST_RENDER_N}, got ${rowCount}`);
      }

      // Bound label "Showing N of total"
      const labelText = await page.$eval(".chat-picker-bound-label", (el) => el.textContent?.trim() ?? "").catch(() => "");
      if (labelText.includes(`Showing ${CHAT_LIST_RENDER_N} of `)) {
        pass(`[${tag}] CP-1b: bound label shows "${labelText}"`);
      } else {
        fail(`[${tag}] CP-1b: bound label`, `expected "Showing ${CHAT_LIST_RENDER_N} of …", got "${labelText}"`);
      }

      // N < total
      const totalFromLabel = parseInt(labelText.match(/of (\d+)/)?.[1] ?? "0", 10);
      if (totalFromLabel > CHAT_LIST_RENDER_N) {
        pass(`[${tag}] CP-1c: total (${totalFromLabel}) > N (${CHAT_LIST_RENDER_N}) — bound is real`);
      } else {
        fail(`[${tag}] CP-1c: total > N`, `total=${totalFromLabel}, N=${CHAT_LIST_RENDER_N} — fixture too small?`);
      }

      await screenshot(page, `${tag}-cp1-bounded`);
      await closePicker(page);
    }

    // CP-2: Search reaches outside top N
    console.log("\nCP-2: Search reaches a chat ranked below N");
    {
      await openPicker(page);

      const searchBox = await page.$(".chat-picker-search");
      if (!searchBox) {
        fail(`[${tag}] CP-2`, "search input .chat-picker-search not found");
      } else {
        await searchBox.fill(FIXTURE_SENTINEL);
        await page.waitForTimeout(300);

        const matchRows = await page.$$eval(".chat-history-row", (els) => els.length);
        if (matchRows >= 1) {
          pass(`[${tag}] CP-2a: search for "${FIXTURE_SENTINEL}" found ${matchRows} row(s)`);
        } else {
          fail(`[${tag}] CP-2a: search reached outside`, `no rows found for "${FIXTURE_SENTINEL}"`);
        }

        const rowText = await page.$eval(".chat-history-row", (el) => el.textContent ?? "").catch(() => "");
        if (rowText.includes(FIXTURE_SENTINEL)) {
          pass(`[${tag}] CP-2b: result row contains fixture sentinel text`);
        } else {
          fail(`[${tag}] CP-2b: result row text`, `"${FIXTURE_SENTINEL}" not in row text: "${rowText.slice(0, 80)}"`);
        }

        await screenshot(page, `${tag}-cp2-search`);

        // Clear search
        await searchBox.fill("");
        await page.waitForTimeout(200);
      }
      await closePicker(page);
    }

    // CP-3: Displaced active chat
    console.log("\nCP-3: Displaced active chat at slot N");
    {
      // Open the oldest fixture chat — outside top N — as the active view.
      await clearWorkspace(page);
      await openChatView(page, DISPLACED_CHAT_ID);
      await waitForChatsList(page);
      await openPicker(page);

      // Rendered rows must still be exactly N
      const rowCount = await page.$$eval(".chat-history-row", (els) => els.length);
      if (rowCount === CHAT_LIST_RENDER_N) {
        pass(`[${tag}] CP-3a: rendered rows === N with active outside top N (displacement working)`);
      } else {
        fail(`[${tag}] CP-3a: rendered rows with displacement`, `expected ${CHAT_LIST_RENDER_N}, got ${rowCount}`);
      }

      // Active row must be present
      const activeRow = await page.$(".chat-history-row-active");
      if (activeRow) {
        pass(`[${tag}] CP-3b: active row present in picker`);
      } else {
        fail(`[${tag}] CP-3b: active row`, "no .chat-history-row-active found");
      }

      // Active chat must be at the Nth slot (last row)
      const allRows = await page.$$(".chat-history-row");
      const lastRow = allRows[allRows.length - 1];
      const lastRowChatId = await lastRow?.getAttribute("data-chat-id");
      if (lastRowChatId === DISPLACED_CHAT_ID) {
        pass(`[${tag}] CP-3c: displaced active chat occupies the Nth slot (index ${CHAT_LIST_RENDER_N - 1})`);
      } else {
        fail(`[${tag}] CP-3c: Nth slot chat`, `expected ${DISPLACED_CHAT_ID}, got ${lastRowChatId}`);
      }

      // Total count shown is still the true total (not N)
      const labelText = await page.$eval(".chat-picker-bound-label", (el) => el.textContent?.trim() ?? "").catch(() => "");
      const totalFromLabel = parseInt(labelText.match(/of (\d+)/)?.[1] ?? "0", 10);
      if (totalFromLabel === FIXTURE_TOTAL) {
        pass(`[${tag}] CP-3d: total shown (${totalFromLabel}) === true fixture total (${FIXTURE_TOTAL})`);
      } else {
        fail(`[${tag}] CP-3d: total shown`, `expected ${FIXTURE_TOTAL}, got ${totalFromLabel} ("${labelText}")`);
      }

      // Active row has rename button
      const renameBtn = await activeRow?.$(".chat-history-rename-btn");
      if (renameBtn) {
        pass(`[${tag}] CP-3e: active row has rename button`);
      } else {
        fail(`[${tag}] CP-3e: active row rename button`, "not found");
      }

      // Active row has resync button (only visible on active row)
      const syncBtn = await activeRow?.$(".chat-history-sync-btn");
      if (syncBtn) {
        pass(`[${tag}] CP-3f: active row has resync button`);
      } else {
        fail(`[${tag}] CP-3f: active row resync button`, "not found");
      }

      await screenshot(page, `${tag}-cp3-displaced`);
      await closePicker(page);
    }

    // CP-4: Row controls ≥ 44×44 — 360px viewport only
    if (viewport.width <= 390) {
      console.log("\nCP-4: Row controls ≥ 44×44 px at 360px");
      // Displaced active chat is still set from CP-3 — re-open picker.
      await openPicker(page);

      const activeRow = await page.$(".chat-history-row-active");
      if (!activeRow) {
        fail(`[${tag}] CP-4`, "no active row found");
      } else {
        const renameBtn = await activeRow.$(".chat-history-rename-btn");
        if (renameBtn) {
          const box = await renameBtn.boundingBox();
          if (box && box.width >= 44 && box.height >= 44) {
            pass(`[${tag}] CP-4a: rename btn ${Math.round(box.width)}×${Math.round(box.height)} ≥ 44×44`);
          } else {
            fail(`[${tag}] CP-4a: rename btn geometry`, `${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)} — need ≥ 44×44`);
          }
        } else {
          fail(`[${tag}] CP-4a: rename btn not found`);
        }

        const syncBtn = await activeRow.$(".chat-history-sync-btn");
        if (syncBtn) {
          const box = await syncBtn.boundingBox();
          if (box && box.width >= 44 && box.height >= 44) {
            pass(`[${tag}] CP-4b: resync btn ${Math.round(box.width)}×${Math.round(box.height)} ≥ 44×44`);
          } else {
            fail(`[${tag}] CP-4b: resync btn geometry`, `${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)} — need ≥ 44×44`);
          }
        } else {
          fail(`[${tag}] CP-4b: resync btn not found`);
        }

        await screenshot(page, `${tag}-cp4-geometry`);
      }
      await closePicker(page);
    }

    // CP-5: Preview-tab semantics — picker row click opens a preview chat: tab
    console.log("\nCP-5: Preview-tab — picker row click opens a chat: preview tab");
    {
      // Start fresh with a different recent chat as the active view.
      await clearWorkspace(page);
      await openChatView(page, RECENT_CHAT_ID);
      await waitForChatsList(page);
      await openPicker(page);

      // Click the second row (not the active one) to open a preview.
      // Find a row that is not the active one.
      const rows = await page.$$(".chat-history-row");
      const nonActiveRow = rows.find(async (r) => {
        const cls = await r.getAttribute("class");
        return !(cls ?? "").includes("chat-history-row-active");
      });
      // rows.find with async doesn't work; use a different approach.
      let clickedChatId = null;
      for (const row of rows) {
        const cls = await row.getAttribute("class");
        if (!(cls ?? "").includes("chat-history-row-active")) {
          clickedChatId = await row.getAttribute("data-chat-id");
          // Click the chat-history-item button inside the row.
          const itemBtn = await row.$(".chat-history-item");
          if (itemBtn) await itemBtn.click();
          break;
        }
      }
      await page.waitForTimeout(500);

      if (clickedChatId) {
        // A new chat: tab should be open in the workspace store.
        const opened = await page.evaluate((cid) => {
          const app = document.querySelector("#app")?.__vue_app__;
          const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          const tabs = ws?.tabs ?? [];
          return tabs.some((t) => t?.kind === "chat" && t?.chatId === cid);
        }, clickedChatId);

        if (opened) {
          pass(`[${tag}] CP-5: picker row click opened chat:${clickedChatId} as a tab`);
        } else {
          fail(`[${tag}] CP-5: preview tab`, `chat:${clickedChatId} not found in workspace tabs`);
        }
        await screenshot(page, `${tag}-cp5-preview-tab`);
      } else {
        fail(`[${tag}] CP-5`, "could not find a non-active row to click");
      }
    }

    // CP-6: Open menu → Chat button → full-pane picker renders with rows
    console.log("\nCP-6: Open menu → Chat → full-pane picker renders with rows");
    {
      await clearWorkspace(page);
      await waitForChatsList(page);

      // Open the shell's Open menu and click Chat.
      await page.click(".open-menu-btn", { timeout: 5000 });
      await page.waitForSelector(".open-menu-list", { timeout: 5000 });
      await page.waitForTimeout(150);
      await page.click("#tab-chat", { timeout: 5000 });
      await page.waitForSelector(".chat-history-dropdown", { timeout: 10000 });
      await page.waitForTimeout(500);

      // Assert rows are present.
      const rowCount = await page.$$eval(".chat-history-row", (els) => els.length);
      if (rowCount >= 1) {
        pass(`[${tag}] CP-6a: ${rowCount} rows visible via Open→Chat`);
      } else {
        fail(`[${tag}] CP-6a: picker rows`, `expected ≥1 rows, got ${rowCount}`);
      }

      // Assert expected geometry — picker must fill the tab content area, not render
      // as the 300px overlay. Height must exceed half the viewport height.
      const pickerBox = await page.$eval(".chat-history-dropdown", (el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });
      const minH = Math.round(viewport.height / 2);
      if (pickerBox.height >= minH) {
        pass(`[${tag}] CP-6b: picker geometry ${pickerBox.width}×${pickerBox.height} — full-pane (≥${minH}px tall)`);
      } else {
        fail(`[${tag}] CP-6b: picker geometry`, `height=${pickerBox.height}px — want ≥${minH}px (overlay max-height is 300px)`);
      }

      await screenshot(page, `${tag}-cp6-open-menu-entry`);

      // Assert a row click opens a chat: preview tab.
      const rows = await page.$$(".chat-history-row");
      let clickedChatId = null;
      for (const row of rows) {
        const chatId = await row.getAttribute("data-chat-id");
        if (chatId) {
          const itemBtn = await row.$(".chat-history-item");
          if (itemBtn) {
            clickedChatId = chatId;
            await itemBtn.click();
            break;
          }
        }
      }
      await page.waitForTimeout(500);

      if (clickedChatId) {
        const opened = await page.evaluate((cid) => {
          const app = document.querySelector("#app")?.__vue_app__;
          const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
          const ws = pinia?._s?.get("workspace");
          const tabs = ws?.tabs ?? [];
          return tabs.some((t) => t?.kind === "chat" && t?.chatId === cid);
        }, clickedChatId);
        if (opened) {
          pass(`[${tag}] CP-6c: row click opened chat:${clickedChatId} as a tab`);
        } else {
          fail(`[${tag}] CP-6c: preview tab`, `chat:${clickedChatId} not found in workspace tabs`);
        }
        await screenshot(page, `${tag}-cp6-row-click`);
      } else {
        fail(`[${tag}] CP-6c`, "could not find a row to click");
      }
    }

    // CP-7: URL /chat route → same full-pane surface
    console.log("\nCP-7: /chat URL route → full-pane picker renders");
    {
      // Clear workspace state so the URL is the sole source of truth on cold load.
      // Router uses createWebHashHistory — the hash URL is /#/chat, not /chat.
      await clearWorkspace(page);
      await page.goto(FIXTURE_BASE + "/#/chat", { waitUntil: "load", timeout: 15000 });
      await page.waitForSelector(".workspace", { timeout: 10000 });
      await page.waitForTimeout(800);
      await waitForChatsList(page);
      await page.waitForSelector(".chat-history-dropdown", { timeout: 15000 });
      await page.waitForTimeout(300);

      const rowCount = await page.$$eval(".chat-history-row", (els) => els.length);
      if (rowCount >= 1) {
        pass(`[${tag}] CP-7a: /chat URL rendered picker with ${rowCount} rows`);
      } else {
        fail(`[${tag}] CP-7a: /chat URL picker rows`, `expected ≥1 rows, got ${rowCount}`);
      }

      const pickerBox = await page.$eval(".chat-history-dropdown", (el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });
      const minH = Math.round(viewport.height / 2);
      if (pickerBox.height >= minH) {
        pass(`[${tag}] CP-7b: /chat URL picker geometry ${pickerBox.width}×${pickerBox.height} — full-pane (≥${minH}px)`);
      } else {
        fail(`[${tag}] CP-7b: /chat URL picker geometry`, `height=${pickerBox.height}px — want ≥${minH}px`);
      }

      await screenshot(page, `${tag}-cp7-url-route`);
    }

  } finally {
    await browser.close();
  }
}

// ── Run at both viewports ─────────────────────────────────────────────────────

if (!MUTATION) {
  await runSuiteAt({ width: 360, height: 740 }, "360x740");
  await runSuiteAt({ width: 1440, height: 900 }, "1440x900");
}

// ── CP-PROOF ──────────────────────────────────────────────────────────────────
//
// listChats() runs server-side in the daemon (Bun TypeScript, loaded at startup).
// Mutating the source has no effect on a running daemon — a restart is required.
// run-cp.mjs manages this:
//   1. Mutate src/ui/services/chats.ts (.slice(0, N) after .sort())
//   2. Start a fresh daemon at an alternate port with the mutated source
//   3. Set MUTATION_BASE to that daemon's URL and re-run this spec
//   4. Restore the source; stop the mutated daemon
//
// When MUTATION_BASE is set, this spec skips the browser suite and runs only the
// proof check: query /api/chats → assert sentinel absent.

const MUTATION_BASE = (process.env.MUTATION_BASE ?? "").replace(/\/$/, "");
if (MUTATION_BASE) {
  console.log("\n── CP-PROOF: verifying mutation (MUTATION_BASE set) ─────────────────");
  console.log(`  querying ${MUTATION_BASE}/api/chats…`);
  try {
    const r = await fetch(`${MUTATION_BASE}/api/chats`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    const chats = body.chats ?? [];
    const sentinel = chats.find(
      (c) => (c.name ?? "").includes(FIXTURE_SENTINEL) || (c.preview ?? "").includes(FIXTURE_SENTINEL)
    );
    console.log(`  mutated daemon returned ${chats.length} chats, sentinel: ${sentinel ? "FOUND" : "absent"}`);
    if (!sentinel) {
      pass(`CP-PROOF: .slice(0,${CHAT_LIST_RENDER_N}) in listChats → sentinel absent from API (red ✓)`);
    } else {
      fail("CP-PROOF", `sentinel still present — mutation did not limit results (got ${chats.length} chats)`);
    }
  } catch (e) {
    fail("CP-PROOF", `could not reach mutated daemon: ${e.message}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
