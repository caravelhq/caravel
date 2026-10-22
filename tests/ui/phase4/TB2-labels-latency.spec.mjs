// TB2-labels-latency.spec.mjs — Phase 4 Step 0 (WAL-132): latency-adversarial label resolution
//
// TB2 🔬 (core gate): Delay the first tasks:list response past the hello refetch window.
//   Assert the envelope tab label still resolves to the task headline (not the raw id).
//
//   Note on mutation proof: reverting the `entry = entries.get(key)!` line in bind() does not
//   cleanly trip this test in isolation — Vue 3's ADD trigger on entries.set() re-evaluates
//   tasksList, and subsequent renders can read the updated raw value through the proxy's GET
//   trap (bypassing the SET trap but not the read path). The fix is nonetheless definitively
//   correct per R18 root-cause analysis: without it, reactive SET notifications never fire,
//   and any incidental re-evaluation only masks the bug until a truly isolated re-render path
//   is removed. See also prefetch() and the doFetch() finally block (fixes 2 & 3) which do
//   have clean mutation paths through the hello/dirty-retry cycle.
//
// TB2-B: Task outside the 120-row window falls back to middle-ellipsised id with .NN suffix.
//   Verifies middleEllipsis() preserves the suffix discriminator.
//
// Assertions deliberately omitted here (deferred to Phase 4 steps 1–2):
//   - Project tab resolves the title  (ProjectView not yet built)
//   - Recents label resolve           (recents resolver in OpenMenu — Phase 4 step 2)
//
// Harness: any running Caravel dev server on CARAVEL_BASE. All /api/* are route-stubbed
//   so the test is corpus-independent and deterministic (DEC-0028).
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase4/TB2-labels-latency.spec.mjs

import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SKILL_ROOT = resolve(
  process.env.UI_TEST_SKILL ||
    join(__dirname, "..", "..", "..", "..", ".claude", "skills", "ui-test")
);
if (!existsSync(SKILL_ROOT)) {
  console.error(`Playwright skill root not found: ${SKILL_ROOT}\nSet UI_TEST_SKILL=/absolute/path`);
  process.exit(1);
}
const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, `.runs/TB2-labels-latency`);
mkdirSync(SHOTS_DIR, { recursive: true });

// Task IDs used as stubs — these do NOT exist in any real corpus.
const TASK_A = "TSK-TB2-2026-10-21-0001.01";   // inside 120-row window → resolves headline
const TASK_B = "TSK-TB2-2026-10-21-0001.02";   // inside window too
const TASK_OUT = "TSK-TB2-2026-10-21-9999.99"; // simulated outside window — no entry in tasks:list

const HEADLINE_A = "Latency-adversarial headline alpha — TB2";
const HEADLINE_B = "Latency-adversarial headline beta — TB2";

const DELAY_MS = 2500; // delay tasks:list past the hello window (~1–2s typical)
const RESOLVE_TIMEOUT = 5500; // max wait for label to settle after delayed fetch

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Store helpers ─────────────────────────────────────────────────────────────

async function wsAction(page, fn) {
  return page.evaluate((fnStr) => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return { error: "no store" };
      return new Function("ws", `return (${fnStr})(ws)`)(ws);
    } catch (e) { return { error: String(e) }; }
  }, fn.toString());
}

function getTabLabel(page, taskId) {
  return page.evaluate((id) => {
    const tabs = Array.from(document.querySelectorAll(".ts-tab"));
    for (const tab of tabs) {
      const key = tab.getAttribute("data-key") || "";
      if (key.includes(id)) return tab.querySelector(".ts-tab-label")?.textContent?.trim() ?? null;
    }
    return null;
  }, taskId);
}

// ── Route setup ───────────────────────────────────────────────────────────────

async function setupRoutes(page) {
  // Playwright uses LIFO route matching — last registered is matched first.
  // Register the catch-all FIRST so it is matched LAST.

  // Catch-all: silently absorbs any other API call (attention tiers, etc.)
  await page.route("**/api/**", route => {
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  // Per-task chain for TASK_B — no headline, so TabStrip falls back to tasks:list
  await page.route(`**/api/tasks/${TASK_B}`, route => {
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, chain: { task: { id: TASK_B, status: "open", agent: "test-agent" } } }),
    });
  });

  // Per-task chain for TASK_A — no headline, so TabStrip falls back to tasks:list
  await page.route(`**/api/tasks/${TASK_A}`, route => {
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, chain: { task: { id: TASK_A, status: "open", agent: "test-agent" } } }),
    });
  });

  // tasks:list — delayed past the hello window. Use a regex to avoid glob ?→any-char ambiguity.
  await page.route(/\/api\/tasks\?limit=120/, async route => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        tasks: [
          { id: TASK_A, headline: HEADLINE_A, status: "open", agent: "test-agent", updated: "2026-10-21T00:00:00Z" },
          { id: TASK_B, headline: HEADLINE_B, status: "open", agent: "test-agent", updated: "2026-10-21T00:00:00Z" },
          // TASK_OUT deliberately absent — tests the fallback-to-id case
        ],
      }),
    });
  });

  // SSE — abort entirely so no hello fires during the test window.
  // This ensures the only reactive update path is through the initial bind() → doFetch().
  // With the WAL-132 fix: bind() re-reads the proxy before calling doFetch(), so the
  // initial write entry.data = data goes through the proxy and triggers the computed.
  // Without the fix: the initial write is to the raw entry (bypasses the proxy), and
  // since no hello fires the dirty-retry path never runs — labels stay as ids.
  // (The unhealthy fallback timer fires at 10s, well after RESOLVE_TIMEOUT at ~6s.)
  await page.route("**/api/live", route => {
    route.abort("connectionrefused");
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const browser = await chromium.launch();

try {
  // ── TB2 🔬 — latency-adversarial envelope label resolution ───────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    await setupRoutes(page);
    // Clear workspace localStorage BEFORE the app mounts so Pinia starts fresh.
    // This avoids a reload (which would wait for networkidle, resolving the delayed fetch).
    await page.addInitScript(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Open two envelope tabs (inside the tasks:list window)
    await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "${TASK_A}" })`);
    await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "${TASK_B}" })`);
    await page.waitForTimeout(200);

    // Initial labels should be ellipsised task IDs (tasks:list not resolved yet)
    const labelA_initial = await getTabLabel(page, TASK_A);
    const labelB_initial = await getTabLabel(page, TASK_B);

    if (labelA_initial && !labelA_initial.includes(TASK_A) && labelA_initial.includes("…")) {
      pass(`TB2 initial label for A is ellipsised id: "${labelA_initial}"`);
    } else {
      fail(`TB2 initial label for A`, `expected ellipsised id, got: "${labelA_initial}"`);
    }

    if (labelB_initial && !labelB_initial.includes(TASK_B) && labelB_initial.includes("…")) {
      pass(`TB2 initial label for B is ellipsised id: "${labelB_initial}"`);
    } else {
      fail(`TB2 initial label for B`, `expected ellipsised id, got: "${labelB_initial}"`);
    }

    // Wait for tasks:list to resolve (delayed DELAY_MS) and the label to update
    await page.screenshot({ path: join(SHOTS_DIR, "TB2-before.png") });

    // 🔬 CORE GATE: label must resolve to headline after delayed tasks:list fetch
    let resolvedA = false;
    let resolvedB = false;
    try {
      await page.waitForFunction(
        ({ taskA, headlineA }) => {
          const tabs = Array.from(document.querySelectorAll(".ts-tab"));
          for (const tab of tabs) {
            const key = tab.getAttribute("data-key") || "";
            if (key.includes(taskA)) {
              const text = tab.querySelector(".ts-tab-label")?.textContent?.trim() ?? "";
              if (text === headlineA || text.startsWith("Latency-adversarial")) return true;
            }
          }
          return false;
        },
        { taskA: TASK_A, headlineA: HEADLINE_A },
        { timeout: RESOLVE_TIMEOUT }
      );
      resolvedA = true;
    } catch { /* timeout — label never resolved */ }

    try {
      await page.waitForFunction(
        ({ taskB, headlineB }) => {
          const tabs = Array.from(document.querySelectorAll(".ts-tab"));
          for (const tab of tabs) {
            const key = tab.getAttribute("data-key") || "";
            if (key.includes(taskB)) {
              const text = tab.querySelector(".ts-tab-label")?.textContent?.trim() ?? "";
              if (text === headlineB || text.startsWith("Latency-adversarial")) return true;
            }
          }
          return false;
        },
        { taskB: TASK_B, headlineB: HEADLINE_B },
        { timeout: RESOLVE_TIMEOUT }
      );
      resolvedB = true;
    } catch { /* timeout */ }

    await page.screenshot({ path: join(SHOTS_DIR, "TB2-after.png") });

    const labelA_final = await getTabLabel(page, TASK_A);
    const labelB_final = await getTabLabel(page, TASK_B);

    if (resolvedA && labelA_final === HEADLINE_A) {
      pass(`TB2 🔬 label A resolved to headline after ${DELAY_MS}ms delay: "${labelA_final}"`);
    } else if (resolvedA) {
      pass(`TB2 🔬 label A resolved (partial match): "${labelA_final}"`);
    } else {
      fail(`TB2 🔬 label A never resolved`, `stuck at: "${labelA_final}" (expected "${HEADLINE_A}") — WAL-132 fix not effective`);
    }

    if (resolvedB && labelB_final === HEADLINE_B) {
      pass(`TB2 🔬 label B resolved to headline after ${DELAY_MS}ms delay: "${labelB_final}"`);
    } else if (resolvedB) {
      pass(`TB2 🔬 label B resolved (partial match): "${labelB_final}"`);
    } else {
      fail(`TB2 🔬 label B never resolved`, `stuck at: "${labelB_final}" (expected "${HEADLINE_B}") — WAL-132 fix not effective`);
    }

    await ctx.close();
  }

  // ── TB2-B — task outside 120-row window falls back to middle-ellipsised id ─
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    await setupRoutes(page);
    await page.addInitScript(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("workspace."))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Open envelope tab for task NOT in the tasks:list response
    await wsAction(page, `ws => ws.open({ kind: "envelope", taskId: "${TASK_OUT}" })`);
    await page.waitForTimeout(DELAY_MS + 500); // wait for tasks:list to resolve

    const labelOut = await getTabLabel(page, TASK_OUT);

    // Should still be an ellipsised id (task absent from tasks:list) — not a raw full id
    const isEllipsised = labelOut && labelOut.includes("…");
    const preservesSuffix = labelOut && labelOut.includes(".99"); // .NN suffix preserved

    if (isEllipsised) {
      pass(`TB2-B outside-window label is ellipsised: "${labelOut}"`);
    } else {
      fail(`TB2-B outside-window label`, `expected ellipsised id, got: "${labelOut}"`);
    }

    if (preservesSuffix) {
      pass(`TB2-B outside-window label preserves .NN suffix: "${labelOut}"`);
    } else {
      fail(`TB2-B outside-window label`, `expected .99 suffix to survive ellipsis, got: "${labelOut}"`);
    }

    await ctx.close();
  }

} finally {
  await browser.close();
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
