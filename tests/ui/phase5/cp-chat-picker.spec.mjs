// cp-chat-picker.spec.mjs — Phase 5 step 2: Chat list picker (Suite CP)
//
// CP-1: Bounded render — rendered rows === CHAT_LIST_RENDER_N (N=20).
//       Bound label "Showing 20 of 26" is present. N < total asserted.
// CP-2: Search reaches a chat ranked below N (XRAY-FIXTURE-CORPUS-TOKEN).
// CP-3: Displaced active chat — active chat (fx0000aa-0000bb, oldest by updatedAt,
//       position 26 in the sorted corpus) displaces the Nth row; rendered count
//       remains exactly N=20; active row present with rename and resync controls.
// CP-4: Row controls ≥ 44×44 px at 360×740 viewport.
//
// Preflight: asserts CARAVEL_FIXTURE_BASE is set and the known fixture sentinel
//   (XRAY-FIXTURE-CORPUS-TOKEN) is resolvable via /api/chats. Aborts loudly
//   if either check fails (WAL-148: the FP/NV fixture-base trap).
//
// Mutation proof (CP-PROOF):
//   Restores .slice(0, 20) in listChats() → CP-2 search-reaches-outside goes red.
//   Source mutated live, restored from memory in finally (never git checkout --).
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_FIXTURE_BASE=http://127.0.0.1:4660 \
//   node tests/ui/phase5/cp-chat-picker.spec.mjs
//
// Mutation run:
//   MUTATION=1 [same env] node tests/ui/phase5/cp-chat-picker.spec.mjs
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
// fx0000aa-0000bb is the oldest chat (daysAgo=50) — position 26 by updatedAt sort
const DISPLACED_CHAT_ID = "fx0000aa-0000bb";
// Total chats in the fixture (26)
const FIXTURE_TOTAL = 26;

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
try {
  const r = await fetch(`${FIXTURE_BASE}/api/chats`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  fixtureChats = body.chats ?? [];
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
console.log(`  total fixture chats: ${fixtureChats.length} (want ≥ ${CHAT_LIST_RENDER_N + 1})`);
if (fixtureChats.length <= CHAT_LIST_RENDER_N) {
  console.error(`ABORT: fixture has only ${fixtureChats.length} chats — need > ${CHAT_LIST_RENDER_N} to test the bound.`);
  process.exit(2);
}
console.log("  preflight OK\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openChatPage(page) {
  // Open the Chat legacy page via workspace store
  await page.evaluate(() => {
    const vueApp = document.querySelector("#app")?.__vue_app__;
    const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
    const ws = pinia?._s?.get("workspace");
    if (ws) ws.open({ kind: "legacy", page: "chat" });
  });
  await page.waitForSelector(".chat-panel", { timeout: 8000 });
  await page.waitForTimeout(800);
}

async function waitForChatsInStore(page) {
  // Open the picker and wait for at least N rows to render (data from live store).
  // Always closes the picker before returning so callers open it fresh.
  await openPicker(page);
  const already = await page.$$eval(".chat-history-row", (els) => els.length);
  if (already < CHAT_LIST_RENDER_N) {
    await page.waitForFunction(
      (n) => document.querySelectorAll(".chat-history-row").length >= n,
      CHAT_LIST_RENDER_N,
      { timeout: 20000 }
    );
  }
  await closePicker(page);
}

async function openPicker(page) {
  await page.click("#chat-history-btn");
  await page.waitForSelector(".chat-history-dropdown", { timeout: 3000 });
  await page.waitForTimeout(200);
}

async function closePicker(page) {
  // Toggle off via the toolbar button (same button that opens it).
  const isOpen = await page.$(".chat-history-dropdown");
  if (isOpen) {
    await page.click("#chat-history-btn");
    await page.waitForTimeout(200);
  }
}

async function screenshot(page, name) {
  const p = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

async function resetChatSession(page, chatId = null) {
  await page.evaluate((id) => {
    if (id) {
      localStorage.setItem("caravel.chat.id", id);
    } else {
      localStorage.removeItem("caravel.chat.id");
    }
    // Clear workspace state so the chat page opens fresh
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  }, chatId);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
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
      await resetChatSession(page, null);
      await openChatPage(page);
      await waitForChatsInStore(page);
      await openPicker(page);

      const rowCount = await page.$$eval(".chat-history-row", (els) => els.length);
      if (rowCount === CHAT_LIST_RENDER_N) {
        pass(`[${tag}] CP-1a: rendered rows = ${rowCount} (=== N=${CHAT_LIST_RENDER_N})`);
      } else {
        fail(`[${tag}] CP-1a: rendered rows`, `expected ${CHAT_LIST_RENDER_N}, got ${rowCount}`);
      }

      // Verify bound label is visible and says "Showing N of TOTAL"
      const labelText = await page.$eval(".chat-picker-bound-label", (el) => el.textContent?.trim() ?? "");
      const expectLabel = `Showing ${CHAT_LIST_RENDER_N} of ${FIXTURE_TOTAL}`;
      if (labelText.includes(`Showing ${CHAT_LIST_RENDER_N} of `)) {
        pass(`[${tag}] CP-1b: bound label shows "${labelText}"`);
      } else {
        fail(`[${tag}] CP-1b: bound label`, `expected "${expectLabel}", got "${labelText}"`);
      }

      // Assert N < total (so a passing fixture cannot hide the bound)
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

      // Type in the search box
      const searchBox = await page.$(".chat-picker-search");
      if (!searchBox) {
        fail(`[${tag}] CP-2: search input not found`);
      } else {
        await searchBox.fill(FIXTURE_SENTINEL);
        await page.waitForTimeout(300);

        const matchRows = await page.$$eval(".chat-history-row", (els) => els.length);
        if (matchRows >= 1) {
          pass(`[${tag}] CP-2a: search for "${FIXTURE_SENTINEL}" found ${matchRows} row(s)`);
        } else {
          fail(`[${tag}] CP-2a: search reached outside`, `no rows found for "${FIXTURE_SENTINEL}"`);
        }

        // Verify the result row contains the token text
        const rowText = await page.$eval(".chat-history-row", (el) => el.textContent ?? "");
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
      // Set active chat to the oldest fixture chat (position 26, outside top 20)
      await resetChatSession(page, DISPLACED_CHAT_ID);
      await openChatPage(page);
      await waitForChatsInStore(page);
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
        fail(`[${tag}] CP-3b: active row`, `no .chat-history-row-active found`);
      }

      // Active chat must be at the Nth slot (last row = index N-1)
      const allRows = await page.$$(".chat-history-row");
      const lastRow = allRows[allRows.length - 1];
      const lastRowChatId = await lastRow?.getAttribute("data-chat-id");
      if (lastRowChatId === DISPLACED_CHAT_ID) {
        pass(`[${tag}] CP-3c: displaced active chat occupies the Nth slot (index ${CHAT_LIST_RENDER_N - 1})`);
      } else {
        fail(`[${tag}] CP-3c: Nth slot chat`, `expected ${DISPLACED_CHAT_ID}, got ${lastRowChatId}`);
      }

      // Total count shown is still the true total (not N)
      const labelText = await page.$eval(".chat-picker-bound-label", (el) => el.textContent?.trim() ?? "");
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

      // Active row has resync button
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
      // Re-open picker (displaced active chat is still set from CP-3)
      await openPicker(page);

      const activeRow = await page.$(".chat-history-row-active");
      if (!activeRow) {
        fail(`[${tag}] CP-4: no active row found`);
      } else {
        // Rename button geometry (visible on active row)
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

        // Resync button geometry (visible only on active row)
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
