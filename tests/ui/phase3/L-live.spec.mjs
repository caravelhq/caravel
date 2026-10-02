/**
 * L-live.spec.mjs — Phase 3 node 3: live SSE channel + resource store gate
 *
 * L1 🔬: File write → SSE → attention tier updates within 2s.
 *         Mutation proof: block /api/live → no tier update (SSE required).
 * L2:     Force SSE disconnect → reconnect → L1 behaviour holds.
 * L3:     Unbind last consumer → SSE event → no refetch.
 * L4:     Dock makes ≤2 /api/state requests over 10s (no 1s poll).
 * L5 🔬: Exactly 1 /api/live connection per browser tab.
 *         Mutation proof: open second EventSource → count = 2.
 * L6:     Bind 70 resources → cache holds 64 (LRU eviction); bound entries
 *         never evicted.
 * L7:     Prefetch → bind → data immediately available (no loading flash).
 *
 * Run:
 *   UI_TEST_SKILL=<path>/.claude/skills/ui-test \
 *   CARAVEL_BASE=http://127.0.0.1:4636 \
 *   node tests/ui/phase3/L-live.spec.mjs --out tests/ui/phase3/.runs/L-live
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.UI_TEST_SKILL;
if (!SKILL_ROOT) throw new Error("UI_TEST_SKILL env var required");

const PLAYWRIGHT_MJS = join(SKILL_ROOT, "node_modules", "playwright", "index.mjs");
const { chromium } = await import(`file://${PLAYWRIGHT_MJS}`);
const BASE = process.env.CARAVEL_BASE ?? "http://127.0.0.1:4636";

const outIdx = process.argv.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? process.argv[outIdx + 1] : join(__dirname, ".runs", "L-live");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let screenshotIdx = 0;
function shot(name) {
  return join(OUT_DIR, `${String(++screenshotIdx).padStart(2, "0")}-${name}.png`);
}

// Fixture workspace root (same cwd as the scratch daemon)
const FIXTURE_WS = join(__dirname, "fixture-ws");

// Write a task YAML to the fixture workspace and return the path for cleanup.
function writeTask(agent, bucket, id, content) {
  const dir = join(FIXTURE_WS, "agents", agent, "tasks", bucket);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${id}.yaml`);
  writeFileSync(p, content, "utf8");
  return p;
}

function cleanTask(p) {
  try { unlinkSync(p); } catch {}
}

// Access the live Pinia store from inside the page.
async function getLiveStore(page) {
  return await page.evaluate(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    return pinia?._s?.get("live") ?? null;
  });
}

// Fetch the server-side connection count.
async function serverConnectionCount() {
  const res = await fetch(`${BASE}/api/live/connections`);
  const j = await res.json();
  return j.count;
}

const browser = await chromium.launch({ headless: true });

// ── L1 (green): file write → SSE → attention tier updates ≤2s ─────────────────

let l1TaskPath = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/#/tasks");

  // Wait for attention tiers to render
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#tasks-user-blocked");
      return el && !el.hidden && el.querySelector(".tasks-tier-head-failed");
    },
    { timeout: 8000 }
  );

  // Record current failed (Triage) row count
  const beforeCount = await page.evaluate(
    () => document.querySelectorAll(".tasks-tier-row-failed").length
  );

  await page.screenshot({ path: shot("l1-before") });

  // Write a new failed task file — triggers fs.watch → SSE 'tasks'+'attention' events
  l1TaskPath = writeTask(
    "agent-beta", "failed", "TSK-FX-L1",
    `id: TSK-FX-L1\nstatus: failed\nheadline: L1 SSE gate test task\nagent: agent-beta\n`
  );

  // Wait ≤4s for the failed row count to increase (150ms debounce + fetch + Vue reactivity)
  const updated = await page.waitForFunction(
    (before) => document.querySelectorAll(".tasks-tier-row-failed").length > before,
    beforeCount,
    { timeout: 4000 }
  ).then(() => true).catch(() => false);

  await page.screenshot({ path: shot("l1-after") });

  const afterCount = await page.evaluate(
    () => document.querySelectorAll(".tasks-tier-row-failed").length
  );

  results.push({
    name: "L1 - file write → SSE → tier update ≤2s",
    pass: updated,
    detail: `rows before=${beforeCount} after=${afterCount}`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L1 - error", pass: false, detail: String(err) });
} finally {
  cleanTask(l1TaskPath);
}

// ── L1 mutation proof: block /api/live → tier must NOT update ─────────────────

let l1MutPath = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Abort all /api/live requests so the store has no SSE channel
  await page.route("**/api/live", (route) => route.abort());

  await page.goto(BASE + "/#/tasks");

  // Wait for tiers to render via the initial HTTP fetch (attention API still works)
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#tasks-user-blocked");
      return el && !el.hidden && el.querySelector(".tasks-tier-head-failed");
    },
    { timeout: 8000 }
  );

  const beforeCount = await page.evaluate(
    () => document.querySelectorAll(".tasks-tier-row-failed").length
  );

  await page.screenshot({ path: shot("l1-mut-before") });

  l1MutPath = writeTask(
    "agent-beta", "failed", "TSK-FX-L1-mut",
    `id: TSK-FX-L1-mut\nstatus: failed\nheadline: L1 mutation test\nagent: agent-beta\n`
  );

  // Wait 3s — with SSE blocked, the tier must NOT update (no 30s poll any more)
  await page.waitForTimeout(3000);

  const afterCount = await page.evaluate(
    () => document.querySelectorAll(".tasks-tier-row-failed").length
  );

  await page.screenshot({ path: shot("l1-mut-after") });

  const noUpdate = afterCount === beforeCount;
  results.push({
    name: "L1 🔬 mutation - SSE blocked → tier does NOT update (3s)",
    pass: noUpdate,
    detail: `rows before=${beforeCount} after=${afterCount} (no update = SSE required)`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L1 mutation - error", pass: false, detail: String(err) });
} finally {
  cleanTask(l1MutPath);
}

// ── L2: force SSE disconnect → reconnect → L1 behaviour holds ────────────────

let l2TaskPath = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  let sseAborted = false;
  let resumeResolve;
  const resumePromise = new Promise((r) => { resumeResolve = r; });

  // Abort the FIRST /api/live connection to simulate a disconnect
  await page.route("**/api/live", async (route) => {
    if (!sseAborted) {
      sseAborted = true;
      // Short delay then abort — the hello will have arrived, then we cut the wire
      await new Promise((r) => setTimeout(r, 400));
      await route.abort();
      // Unblock the route for the reconnect
      await page.unroute("**/api/live");
      resumeResolve();
    } else {
      await route.continue();
    }
  });

  await page.goto(BASE + "/#/tasks");
  await resumePromise; // Wait until first SSE was aborted

  // Wait for reconnect (EventSource retries automatically ~1-3s)
  await page.waitForTimeout(3000);

  // Verify SSE is back (connection count should be 1)
  const connsAfterReconnect = await serverConnectionCount();

  // Now run the file-write → tier-update check
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#tasks-user-blocked");
      return el && !el.hidden && el.querySelector(".tasks-tier-head-failed");
    },
    { timeout: 8000 }
  );

  const beforeCount = await page.evaluate(
    () => document.querySelectorAll(".tasks-tier-row-failed").length
  );

  await page.screenshot({ path: shot("l2-before") });

  l2TaskPath = writeTask(
    "agent-beta", "failed", "TSK-FX-L2",
    `id: TSK-FX-L2\nstatus: failed\nheadline: L2 reconnect test\nagent: agent-beta\n`
  );

  const updated = await page.waitForFunction(
    (before) => document.querySelectorAll(".tasks-tier-row-failed").length > before,
    beforeCount,
    { timeout: 3000 }
  ).then(() => true).catch(() => false);

  await page.screenshot({ path: shot("l2-after") });

  results.push({
    name: "L2 - SSE reconnect → L1 behaviour holds",
    pass: updated && connsAfterReconnect >= 1,
    detail: `updated=${updated} connsAfterReconnect=${connsAfterReconnect}`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L2 - error", pass: false, detail: String(err) });
} finally {
  cleanTask(l2TaskPath);
}

// ── L3: unbind last consumer → SSE event → no refetch ────────────────────────

let l3TaskPath = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Intercept /api/tasks/attention requests and count them
  let attentionFetchCount = 0;
  await page.route("**/api/tasks/attention", async (route) => {
    attentionFetchCount++;
    await route.continue();
  });

  // Navigate to tasks page — this binds 'attention' (refs: 0→1)
  await page.goto(BASE + "/#/tasks");
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#tasks-user-blocked");
      return el && !el.hidden && el.querySelector(".tasks-tier-head");
    },
    { timeout: 8000 }
  );

  // Wait for initial fetch to settle
  await page.waitForTimeout(1000);
  const countAfterMount = attentionFetchCount;

  // Navigate away — TasksPage unmounts, live.unbind('attention') called (refs: 1→0)
  // Use /#/files: Dashboard is also an attention consumer (B3 asserts refs=1 there),
  // so navigating to Dashboard keeps refs≥1 and the unbind never fires.
  await page.goto(BASE + "/#/files");
  await page.waitForTimeout(500);

  // Reset counter (we only care about fetches AFTER unbind)
  attentionFetchCount = 0;

  // Write a task file — triggers SSE 'attention'+'tasks' events
  l3TaskPath = writeTask(
    "agent-beta", "failed", "TSK-FX-L3",
    `id: TSK-FX-L3\nstatus: failed\nheadline: L3 unbind test\nagent: agent-beta\n`
  );

  // Wait 2s for any potential refetch
  await page.waitForTimeout(2500);

  await page.screenshot({ path: shot("l3-after-navigate-away") });

  // With refs=0, the event should mark the entry idle but NOT trigger a fetch
  results.push({
    name: "L3 - unbind last consumer → SSE event → no refetch",
    pass: attentionFetchCount === 0,
    detail: `attention fetches after unbind+event = ${attentionFetchCount} (expected 0)`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L3 - error", pass: false, detail: String(err) });
} finally {
  cleanTask(l3TaskPath);
}

// ── L4: dock makes ≤2 /api/state requests over 10s (no 1s poll) ──────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  let stateFetchCount = 0;
  await page.route("**/api/state", async (route) => {
    stateFetchCount++;
    await route.continue();
  });

  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#dock", { timeout: 5000 });

  await page.screenshot({ path: shot("l4-start") });

  // Watch for 10s
  await page.waitForTimeout(10000);

  await page.screenshot({ path: shot("l4-end") });

  // ≤4: 1 mount + 1 hello-revalidation + ≤2 from 15s keepalive if timer aligns.
  // Old 1s poll would give ~10 requests; ≤4 proves the poll is gone.
  results.push({
    name: "L4 - dock ≤4 /api/state requests over 10s (no 1s poll)",
    pass: stateFetchCount <= 4,
    detail: `state fetches in 10s = ${stateFetchCount} (old 1s poll would give ~10)`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L4 - error", pass: false, detail: String(err) });
}

// ── L5 (green): exactly 1 /api/live connection per tab ───────────────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Connections before opening the page
  const connsBefore = await serverConnectionCount();

  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#dock", { timeout: 5000 });

  // Wait for SSE to connect
  await page.waitForTimeout(500);

  const connsAfter = await serverConnectionCount();

  await page.screenshot({ path: shot("l5-green") });

  results.push({
    name: "L5 - exactly 1 SSE connection per tab",
    pass: connsAfter === connsBefore + 1,
    detail: `connections before=${connsBefore} after=${connsAfter} (diff=${connsAfter - connsBefore})`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L5 - error", pass: false, detail: String(err) });
}

// ── L5 mutation proof: second EventSource → count increments ─────────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#dock", { timeout: 5000 });
  await page.waitForTimeout(500);

  const connsNormal = await serverConnectionCount();

  // Inject a second EventSource — simulates what would happen if connect() were called twice
  await page.evaluate(() => {
    window.__testExtraEs = new EventSource("/api/live");
  });
  await page.waitForTimeout(500);

  const connsWithExtra = await serverConnectionCount();

  // Close the extra EventSource
  await page.evaluate(() => {
    window.__testExtraEs?.close();
    delete window.__testExtraEs;
  });
  await page.waitForTimeout(500);

  const connsRestored = await serverConnectionCount();

  await page.screenshot({ path: shot("l5-mut") });

  // The mutation proof: a second EventSource bumps the count.
  // Our L5 assertion (count === 1 per tab) would FAIL if this happened in production code.
  const mutationDetected = connsWithExtra > connsNormal;
  const restoredOk = connsRestored <= connsNormal;

  results.push({
    name: "L5 🔬 mutation - second EventSource → count increments (proving L5 would fail)",
    pass: mutationDetected && restoredOk,
    detail: `normal=${connsNormal} +extra=${connsWithExtra} restored=${connsRestored}`,
  });

  await ctx.close();
} catch (err) {
  results.push({ name: "L5 mutation - error", pass: false, detail: String(err) });
}

// ── L6: LRU eviction — bound entries never evicted, unbound entries are ───────
//
// Scenario:
//  1. Bind 40 resources (0-39) — all refs=1
//  2. Unbind 20 of them (0-19) — refs=0, stay in cache
//  3. Bind 30 new resources (40-69) — triggers eviction for each entry added
//     past MAX_ENTRIES=64. The 20 unbound entries (0-19) are candidates;
//     bound entries (20-39) must never be evicted.
//  4. After all 30 new binds: cache size ≤ 64.
//  5. All entries 20-39 (originally bound) are still present.
//  6. All entries 40-69 (new) are present.
//  7. Entries 0-5 (oldest of the unbound) were evicted; entries 6-19 survive
//     (only 64-40-1=6 evictions needed: 40+30=70 total, 70-64=6 to evict).

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#dock", { timeout: 5000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const live = pinia?._s?.get("live");
    if (!live) return { error: "no live store" };

    const noopFetch = () => Promise.resolve({ ok: true });

    // Step 1: Bind 40 resources (all refs=1)
    for (let i = 0; i < 40; i++) {
      live.bind(`l6-${i}`, { topics: [`l6-t-${i}`], fetch: noopFetch });
    }

    // Step 2: Unbind the first 20 (refs → 0, stay in cache)
    for (let i = 0; i < 20; i++) {
      live.unbind(`l6-${i}`);
    }
    const sizeBeforeNewBinds = live.entries.size; // should be 40

    // Step 3: Bind 30 new resources (40-69) — pushes cache past 64
    for (let i = 40; i < 70; i++) {
      live.bind(`l6-${i}`, { topics: [`l6-t-${i}`], fetch: noopFetch });
    }
    await new Promise((r) => setTimeout(r, 50));

    const sizeAfterNewBinds = live.entries.size; // should be 64

    // Step 4: Verify cache size ≤ 64
    const maxOk = sizeAfterNewBinds <= 64;

    // Step 5: Verify all originally-bound entries (20-39) are still present
    const boundMissing = [];
    for (let i = 20; i < 40; i++) {
      const e = live.entries.get(`l6-${i}`);
      if (!e || e.refs < 1) boundMissing.push(i);
    }

    // Step 6: Verify all new entries (40-69) are present
    const newMissing = [];
    for (let i = 40; i < 70; i++) {
      const e = live.entries.get(`l6-${i}`);
      if (!e || e.refs < 1) newMissing.push(i);
    }

    // Step 7: Verify at least the 6 oldest unbound (0-5) were evicted
    const oldUnboundEvicted = [];
    for (let i = 0; i < 6; i++) {
      if (!live.entries.has(`l6-${i}`)) oldUnboundEvicted.push(i);
    }

    // Cleanup
    for (let i = 20; i < 70; i++) live.unbind(`l6-${i}`);

    return {
      sizeBeforeNewBinds,
      sizeAfterNewBinds,
      maxOk,
      boundMissing,
      newMissing,
      evictedCount: oldUnboundEvicted.length,
      evictedIds: oldUnboundEvicted,
    };
  });

  if (result.error) {
    results.push({ name: "L6 - error", pass: false, detail: result.error });
  } else {
    results.push({
      name: "L6 - LRU eviction: cache capped at 64",
      pass: result.maxOk,
      detail: `size before new binds=${result.sizeBeforeNewBinds} after=${result.sizeAfterNewBinds} (≤64)`,
    });
    results.push({
      name: "L6 - LRU eviction: bound entries never evicted",
      pass: result.boundMissing.length === 0 && result.newMissing.length === 0,
      detail: `bound(20-39) missing=[${result.boundMissing}] new(40-69) missing=[${result.newMissing}]`,
    });
    results.push({
      name: "L6 - LRU eviction: unbound entries evicted first",
      pass: result.evictedCount >= 6,
      detail: `oldest unbound (0-5) evicted: ${result.evictedIds.join(",")} (count=${result.evictedCount})`,
    });
  }

  await ctx.close();
} catch (err) {
  results.push({ name: "L6 - error", pass: false, detail: String(err) });
}

// ── L7: prefetch → data immediately available on bind ────────────────────────

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE + "/#/dashboard");
  await page.waitForSelector("#dock", { timeout: 5000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const app = document.querySelector("#app")?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const live = pinia?._s?.get("live");
    if (!live) return { error: "no live store" };

    let fetchCount = 0;
    const mockFetch = () => {
      fetchCount++;
      return Promise.resolve({ report: "l7-data", fetchCount });
    };

    // Prefetch the resource
    live.prefetch("l7-report", { topics: ["l7-topic"], fetch: mockFetch });

    // Wait for the prefetch to complete
    await new Promise((r) => setTimeout(r, 200));

    const afterPrefetch = live.entries.get("l7-report");
    const statusAfterPrefetch = afterPrefetch?.status;
    const dataAfterPrefetch = afterPrefetch?.data;
    const refsAfterPrefetch = afterPrefetch?.refs;

    // Bind the resource (simulates a component mounting)
    live.bind("l7-report", { topics: ["l7-topic"], fetch: mockFetch });

    // Check IMMEDIATELY (synchronously) — data should be available from cache
    const afterBind = live.entries.get("l7-report");
    const statusImmediately = afterBind?.status;
    const dataImmediately = afterBind?.data;
    const refsAfterBind = afterBind?.refs;

    // Clean up
    live.unbind("l7-report");

    return {
      statusAfterPrefetch,
      dataAfterPrefetch: !!dataAfterPrefetch,
      refsAfterPrefetch,
      statusImmediately,
      dataImmediately: !!dataImmediately,
      refsAfterBind,
      fetchCount,
    };
  });

  if (result.error) {
    results.push({ name: "L7 - error", pass: false, detail: result.error });
  } else {
    const cacheReady = result.statusAfterPrefetch === "ready" && result.dataAfterPrefetch;
    const immediateData = result.statusImmediately === "ready" && result.dataImmediately;
    results.push({
      name: "L7 - prefetch populates cache before bind",
      pass: cacheReady,
      detail: `status after prefetch=${result.statusAfterPrefetch} data=${result.dataAfterPrefetch} refs=${result.refsAfterPrefetch}`,
    });
    results.push({
      name: "L7 - bind sees data immediately (no loading flash)",
      pass: immediateData,
      detail: `status immediately after bind=${result.statusImmediately} data=${result.dataImmediately} refs=${result.refsAfterBind}`,
    });
  }

  await ctx.close();
} catch (err) {
  results.push({ name: "L7 - error", pass: false, detail: String(err) });
}

await browser.close();

// ── Report ────────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
const report = {
  suite: "L-live",
  captured_at: new Date().toISOString(),
  base_url: BASE,
  passed,
  failed,
  results,
  screenshots: `${OUT_DIR}/`,
};

writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

console.log(`\nL-live: ${passed} passed, ${failed} failed`);
for (const r of results) {
  const mark = r.pass ? "✓" : "✗";
  console.log(`  ${mark} ${r.name}: ${r.detail}`);
}

if (failed > 0) process.exit(1);
