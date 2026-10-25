/**
 * WAL-149 — two Phase 4 regressions.
 *
 *   AC1  the envelope's Chat action redirects to the task's own chat thread
 *        (task-<ROOT>-<agent>) instead of opening an in-task form.
 *   AC2  submitting Next opens the task the server just spawned.
 *   AC3  …and falls back to the Report sub-tab when the server returns no id.
 *
 * HARNESS: a UI test server over this worktree's build. /api/* is proxied to the
 * live daemon, so AC1 reads a REAL task — set SRC_TASK to one that exists. AC2/AC3
 * route-stub the spawn endpoint, so running this never creates a real task.
 *
 *   bun run src/ui/test-server.ts start --port 4661 --ttl 0
 *   CARAVEL_BASE=http://127.0.0.1:4661 node tests/ui/wal149/wal149-chat-redirect-next-nav.spec.mjs
 *
 * Mutation-proved 2026-10-24: breaking the root-strip, the chat navigation, and
 * the child-id capture each turn this red.
 */
import { join } from "node:path";
const SKILL_ROOT = "/home/walter/workspace/.claude/skills/ui-test";
const { chromium } = await import(`file://${join(SKILL_ROOT, "node_modules", "playwright", "index.mjs")}`);
const BASE = process.env.CARAVEL_BASE || "http://127.0.0.1:4661";
const SRC_TASK = "TSK-2026-10-21-0004.40";          // real task, agent alice
const EXPECT_THREAD = "task-TSK-2026-10-21-0004-alice";
const FAKE_CHILD = "TSK-2026-10-21-0004.99";

const R = [];
const check = (n, pass, detail) => { R.push({ n, pass, detail }); };

async function openEnvelope(page, vp) {
  await page.goto(`${BASE}/#/tasks/${SRC_TASK}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('[data-ev-action="chat"]', { timeout: 15000 });
}

const browser = await chromium.launch();

for (const vp of [{ width: 1440, height: 900, label: "1440x900" }, { width: 360, height: 740, label: "360x740" }]) {
  // ───────────────────────── AC1: Chat redirects to the task thread ──────────
  // Re-pointed for Phase 5 (WAL-151 .09): the Chat action now opens a chat: tab
  // via ws.open (TaskActions.vue:openChatThread). The old in-task form and
  // window.__chatSessionId were deleted. Assert the chat: tab + seeded composer
  // (mirrors CT-4/CT-5).
  {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    await openEnvelope(page, vp);

    // The retired in-task form must not exist before OR after clicking.
    const formBefore = await page.locator('[data-ev-form="chat"]').count();

    const btn = page.locator('[data-ev-action="chat"]').first();
    const box = await btn.boundingBox();
    check(`${vp.label} AC1 chat button has real geometry`,
      !!box && box.width >= 20 && box.height >= 20 && box.height <= 48,
      box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "no box");

    await btn.click();
    await page.waitForTimeout(1200);

    const formAfter = await page.locator('[data-ev-form="chat"]').count();
    check(`${vp.label} AC1 in-task chat form gone`, formBefore === 0 && formAfter === 0,
      `before=${formBefore} after=${formAfter}`);

    // A chat: tab must have opened with the task thread id (mirrors CT-4).
    const openedChatId = await page.evaluate(() => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      const tabs = ws?.tabs ?? [];
      const chatTab = tabs.find((t) => t?.kind === "chat");
      return chatTab ? chatTab.chatId : null;
    });
    check(`${vp.label} AC1 chat: tab opened with correct chatId`,
      openedChatId === EXPECT_THREAD,
      `expected ${EXPECT_THREAD}, got ${openedChatId}`);

    // Wait for the chat view to become visible.
    await page.waitForSelector(".chat-view", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Composer visible: .chat-input (was #chat-input — changed from id to class in Phase 5).
    const composer = await page.evaluate(() => {
      const el = document.querySelector(".chat-input");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    check(`${vp.label} AC1 chat interface is showing (composer visible)`,
      !!composer && composer.w > 100 && composer.h > 10,
      composer ? `${composer.w}x${composer.h}` : "no .chat-input — did not navigate");

    // Composer seeded with source task id (mirrors CT-5 — from chatStore draft).
    const draft = await page.evaluate((chatId) => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia ?? window.__pinia;
      const cs = pinia?._s?.get("chat");
      return cs ? cs.getDraft(chatId) : null;
    }, EXPECT_THREAD);
    check(`${vp.label} AC1 composer seeded with source task`,
      typeof draft === "string" && draft.includes(SRC_TASK.split(".")[0]),
      draft ? JSON.stringify(draft.slice(0, 40)) : "no draft");

    // Thread history rendered (poll for .chat-msg nodes).
    let msgNodes = 0;
    for (let i = 0; i < 12 && msgNodes === 0; i++) {
      await page.waitForTimeout(500);
      msgNodes = await page.evaluate(() => document.querySelectorAll(".chat-msg").length);
    }
    check(`${vp.label} AC1 thread history rendered`, msgNodes > 0, `${msgNodes} .chat-msg nodes`);

    check(`${vp.label} AC1 no page errors`, errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await page.screenshot({ path: `/tmp/smoke/wal149-ac1-${vp.label}.png` });
    await page.close();
  }

  // ─────────────── AC2: Next submit opens the spawned child task ─────────────
  {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    let posted = 0;
    await page.route("**/api/tasks/*/next", route => {
      posted++;
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, id: FAKE_CHILD, parentId: SRC_TASK }) });
    });
    // The spawned child is synthetic, so give it a chain — otherwise EnvelopeView
    // sits on "Loading…" and we cannot tell a correct navigation from a failed one.
    await page.route(`**/api/tasks/${FAKE_CHILD}`, route => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, chain: { task: {
          id: FAKE_CHILD, headline: "spawned follow-on", agent: "alice", to: "alice",
          status: "open", bucket: "open", parent: SRC_TASK, closed: null,
        }, ancestors: [], children: [] } }) });
    });
    await openEnvelope(page, vp);
    await page.locator('[data-ev-tab="next"]').click();
    await page.waitForSelector("[data-nx-textarea]", { timeout: 10000 });
    await page.locator("[data-nx-textarea]").fill("verify WAL-149 navigation");
    await page.locator("[data-nx-submit]").click();
    await page.waitForTimeout(1500);

    check(`${vp.label} AC2 spawn request was made`, posted === 1, `posted=${posted}`);

    const openedChild = await page.evaluate((cid) => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("workspace.") && (localStorage.getItem(k) || "").includes(`envelope:${cid}`)) return k;
      }
      return null;
    }, FAKE_CHILD);
    check(`${vp.label} AC2 child task opened as a tab`, !!openedChild,
      openedChild ? `persisted in ${openedChild}` : `envelope:${FAKE_CHILD} NOT in any workspace.* key`);

    // the thing Kelly actually asked for: you end up LOOKING at the new task
    const activeIsChild = await page.evaluate((cid) => {
      const el = document.querySelector(".ev-root");
      if (!el) return "no .ev-root";
      return (el.textContent || "").includes(cid) ? true : "showing something else";
    }, FAKE_CHILD);
    check(`${vp.label} AC2 the child envelope is the one on screen`, activeIsChild === true, String(activeIsChild));

    // The active tab must be a real, visible tab — not just a store entry.
    const strip = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll("[class*='ts-tab']")].filter(e => {
        const c = e.className; return typeof c === "string" && /(^|\s)ts-tab(\s|$)/.test(c);
      }).map(e => { const r = e.getBoundingClientRect();
        return { t: (e.textContent || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; });
      return tabs;
    });
    const sized = strip.filter(t => t.w > 30 && t.h > 15);
    check(`${vp.label} AC2 child tab is visible in the strip`,
      strip.length >= 2 && sized.length === strip.length,
      `${strip.length} tabs: ${strip.map(t => `"${t.t}" ${t.w}x${t.h}`).join(", ")}`);

    check(`${vp.label} AC2 no page errors`, errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await page.screenshot({ path: `/tmp/smoke/wal149-ac2-${vp.label}.png` });
    await page.close();
  }

  // ───── AC3: server returns ok without an id → fall back to Report sub-tab ───
  {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.route("**/api/tasks/*/next", route => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await openEnvelope(page, vp);
    await page.locator('[data-ev-tab="next"]').click();
    await page.waitForSelector("[data-nx-textarea]", { timeout: 10000 });
    await page.locator("[data-nx-textarea]").fill("no-id fallback");
    await page.locator("[data-nx-submit]").click();
    await page.waitForTimeout(1200);

    const onReport = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')]
        .some(t => t.getAttribute("aria-selected") === "true" && (t.textContent || "").trim() === "Report"));
    check(`${vp.label} AC3 falls back to Report sub-tab when no id`, onReport, String(onReport));
    await page.close();
  }
}

await browser.close();
let pass = 0;
for (const r of R) { console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.n} — ${r.detail}`); if (r.pass) pass++; }
console.log(`\n${pass}/${R.length} passed`);
process.exit(pass === R.length ? 0 : 1);
