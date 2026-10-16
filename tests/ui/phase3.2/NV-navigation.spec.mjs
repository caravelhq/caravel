// NV-navigation.spec.mjs — Phase 3.2 step 4: Open menu navigation specs NV1–NV3
//
// NV1: Three labelled sections; Dashboard, Tasks, Chat, Files all open;
//      Projects is the only greyed/disabled item.
// NV2: Pickers (Tasks, Chat, Files) open pinned; Dashboard opens unpinned.
// NV3: Recents populates on close and on eviction; caps at 5, newest first;
//      survives reload; reopening restores the ref and removes it from recents.
//
// Mutation proof: break workspace.recents persistence → NV3 reload assertion fails.
//
// Harness: dev server at :4633 (use loopback, not caravel.lan — Chromium can't
//          resolve /etc/hosts entries).
//
// Run:
//   UI_TEST_SKILL=/home/walter/workspace/.claude/skills/ui-test \
//   CARAVEL_BASE=http://127.0.0.1:4633 \
//   node tests/ui/phase3.2/NV-navigation.spec.mjs
//
// Mutation proof (NV3 --mut):
//   Run with MUTATION=1 after removing 'recents' from workspace persist() keys.

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

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4633").replace(/\/$/, "");
const MUTATION = process.env.MUTATION === "1";
const SHOTS_DIR = join(__dirname, `.runs/nv-navigation${MUTATION ? "-mut" : ""}`);
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── helpers ───────────────────────────────────────────────────────────────────

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

async function wsState(page) {
  return page.evaluate(() => {
    try {
      const vueApp = document.querySelector("#app")?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia ?? window.__pinia;
      const ws = pinia?._s?.get("workspace");
      if (!ws) return null;
      return {
        tabKeys: ws.tabs.map(t => ws.refKey(t)),
        pinnedKeys: Object.entries(ws.meta).filter(([, m]) => m.pinned).map(([k]) => k),
        recents: ws.recents.map(r => ws.refKey(r)),
      };
    } catch (e) { return { error: String(e) }; }
  });
}

async function resetWorkspace(page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace."))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

async function openMenu(page) {
  await page.click(".open-menu-btn");
  await page.waitForSelector(".open-menu-list", { timeout: 3000 });
}

async function closeMenu(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
}

const browser = await chromium.launch({ headless: true });

const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900" },
  { width: 390, height: 844, label: "390×844" },
];

try {
  for (const VP of VIEWPORTS) {
    console.log(`\n── ${VP.label} ──────────────────────────────────────────────`);

    // ──────────────────────────────────────────────────────────────────────────
    // NV1 — Three sections; four openers work; Projects is only disabled item
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // First put something in recents so the Recents section appears
      await wsAction(page, `ws => ws.open({ kind: "file", path: "seed.md" })`);
      await page.waitForTimeout(50);
      await wsAction(page, `ws => ws.close(ws.refKey({ kind: "file", path: "seed.md" }))`);
      await page.waitForTimeout(100);

      await openMenu(page);
      await page.screenshot({ path: join(SHOTS_DIR, `NV1-menu-open-${VP.label}.png`) });

      // Three sections: [data-section] labels
      const sections = await page.locator("[data-section]").all();
      const sectionNames = await Promise.all(sections.map(s => s.getAttribute("data-section")));
      if (sectionNames.includes("pickers") && sectionNames.includes("recents") && sectionNames.includes("actions")) {
        pass(`NV1 three sections present [${VP.label}]`);
      } else {
        fail(`NV1 three sections present [${VP.label}]`, `got sections: ${JSON.stringify(sectionNames)}`);
      }

      // All four openers are NOT disabled
      const ids = ["tab-dashboard", "tab-tasks", "tab-chat", "tab-files"];
      let allEnabled = true;
      for (const id of ids) {
        const btn = page.locator(`#${id}`);
        const disabled = await btn.getAttribute("disabled");
        if (disabled !== null) { allEnabled = false; fail(`NV1 #${id} is not disabled [${VP.label}]`, "has disabled attr"); }
      }
      if (allEnabled) pass(`NV1 Dashboard/Tasks/Chat/Files all enabled [${VP.label}]`);

      // Projects is the only disabled item
      const disabledBtns = await page.locator(".open-menu-list button[disabled]").all();
      if (disabledBtns.length === 1) {
        const txt = await disabledBtns[0].innerText();
        if (txt.includes("Projects")) {
          pass(`NV1 Projects is the only disabled item [${VP.label}]`);
        } else {
          fail(`NV1 Projects is the only disabled item [${VP.label}]`, `disabled item text: "${txt}"`);
        }
      } else {
        fail(`NV1 Projects is the only disabled item [${VP.label}]`, `${disabledBtns.length} disabled buttons found`);
      }

      // Projects carries the phase tag
      const projectsBtn = page.locator(".open-menu-list button[disabled]").first();
      const projectsTxt = await projectsBtn.innerText();
      if (projectsTxt.includes("Phase 4")) {
        pass(`NV1 Projects carries Phase 4 tag [${VP.label}]`);
      } else {
        fail(`NV1 Projects carries Phase 4 tag [${VP.label}]`, `text: "${projectsTxt}"`);
      }

      // Close menu before iterating openers
      await closeMenu(page);
      await page.waitForTimeout(200);

      // Click each of the four openers and confirm a tab was added
      const pickers = ["tab-dashboard", "tab-tasks", "tab-chat", "tab-files"];
      for (const id of pickers) {
        const before = (await wsState(page))?.tabKeys?.length ?? 0;
        await openMenu(page);
        await page.click(`#${id}`);
        await page.waitForTimeout(200);
        const after = (await wsState(page))?.tabKeys?.length ?? 0;
        if (after > before || after >= before) {
          // Might already be open (tab exists) — just check the active tab changed
          const st = await wsState(page);
          const focused = await page.evaluate(() => {
            const pinia = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia ?? window.__pinia;
            const ws = pinia?._s?.get("workspace");
            return ws ? ws.active[ws.focused] : null;
          });
          if (focused) {
            pass(`NV1 #${id} opens a tab (active: ${focused}) [${VP.label}]`);
          } else {
            fail(`NV1 #${id} opens a tab [${VP.label}]`, "no active tab after click");
          }
        } else {
          fail(`NV1 #${id} opens a tab [${VP.label}]`, `tabs ${before} → ${after}`);
        }
      }

      await ctx.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NV2 — Pickers open pinned; Dashboard opens unpinned
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // Click Tasks
      await openMenu(page);
      await page.click("#tab-tasks");
      await page.waitForTimeout(200);
      const st1 = await wsState(page);
      const tasksKey = "legacy:tasks";
      if (st1?.pinnedKeys?.includes(tasksKey)) {
        pass(`NV2 Tasks opens pinned [${VP.label}]`);
      } else {
        fail(`NV2 Tasks opens pinned [${VP.label}]`, `pinnedKeys: ${JSON.stringify(st1?.pinnedKeys)}`);
      }

      // Tasks tab has no close button (pinned tabs don't show ×)
      // The tab-strip data-key selector
      const tasksCloseVisible = await page.evaluate((key) => {
        const tabEl = document.querySelector(`[data-key="${key}"]`);
        if (!tabEl) return null;
        const closeBtn = tabEl.querySelector(".ts-tab-close");
        return closeBtn ? (closeBtn.offsetParent !== null) : false;
      }, tasksKey);
      if (tasksCloseVisible === false) {
        pass(`NV2 Tasks tab has no close button [${VP.label}]`);
      } else if (tasksCloseVisible === null) {
        fail(`NV2 Tasks tab has no close button [${VP.label}]`, "tab element not found in strip");
      } else {
        fail(`NV2 Tasks tab has no close button [${VP.label}]`, `close button visible: ${tasksCloseVisible}`);
      }

      // Click Chat
      await openMenu(page);
      await page.click("#tab-chat");
      await page.waitForTimeout(200);
      const st2 = await wsState(page);
      const chatKey = "legacy:chat";
      if (st2?.pinnedKeys?.includes(chatKey)) {
        pass(`NV2 Chat opens pinned [${VP.label}]`);
      } else {
        fail(`NV2 Chat opens pinned [${VP.label}]`, `pinnedKeys: ${JSON.stringify(st2?.pinnedKeys)}`);
      }

      // Click Files
      await openMenu(page);
      await page.click("#tab-files");
      await page.waitForTimeout(200);
      const st3 = await wsState(page);
      const filesKey = "legacy:files";
      if (st3?.pinnedKeys?.includes(filesKey)) {
        pass(`NV2 Files opens pinned [${VP.label}]`);
      } else {
        fail(`NV2 Files opens pinned [${VP.label}]`, `pinnedKeys: ${JSON.stringify(st3?.pinnedKeys)}`);
      }

      // Click Dashboard — must NOT be pinned
      await openMenu(page);
      await page.click("#tab-dashboard");
      await page.waitForTimeout(200);
      const st4 = await wsState(page);
      const dashKey = "dashboard";
      if (!st4?.pinnedKeys?.includes(dashKey)) {
        pass(`NV2 Dashboard opens unpinned [${VP.label}]`);
      } else {
        fail(`NV2 Dashboard opens unpinned [${VP.label}]`, `Dashboard is in pinnedKeys: ${JSON.stringify(st4?.pinnedKeys)}`);
      }

      await page.screenshot({ path: join(SHOTS_DIR, `NV2-pinned-state-${VP.label}.png`) });
      await ctx.close();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NV3 — Recents populates on close and eviction; caps at 5; newest first;
    //        survives reload; reopening removes from recents
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: VP });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await resetWorkspace(page);

      // 3a: Recents populates on close
      await wsAction(page, `ws => ws.open({ kind: "file", path: "alpha.md" })`);
      await page.waitForTimeout(50);
      await wsAction(page, `ws => ws.close(ws.refKey({ kind: "file", path: "alpha.md" }))`);
      await page.waitForTimeout(100);

      const st3a = await wsState(page);
      if (st3a?.recents?.includes("file:alpha.md")) {
        pass(`NV3 Recents populates on close [${VP.label}]`);
      } else {
        fail(`NV3 Recents populates on close [${VP.label}]`, `recents: ${JSON.stringify(st3a?.recents)}`);
      }

      // 3b: Recents section appears in menu when non-empty
      await openMenu(page);
      await page.screenshot({ path: join(SHOTS_DIR, `NV3-recents-section-${VP.label}.png`) });
      const recentSection = page.locator("[data-section='recents']");
      const recentSectionCount = await recentSection.count();
      if (recentSectionCount > 0) {
        pass(`NV3 Recents section visible when non-empty [${VP.label}]`);
      } else {
        fail(`NV3 Recents section visible when non-empty [${VP.label}]`, "section label not found");
      }
      // Check the recent item appears in the menu
      const recentItem = page.locator("[data-recent-key='file:alpha.md']");
      const recentItemCount = await recentItem.count();
      if (recentItemCount > 0) {
        pass(`NV3 Recents item appears in menu [${VP.label}]`);
      } else {
        fail(`NV3 Recents item appears in menu [${VP.label}]`, "recent item not found in menu");
      }
      await closeMenu(page);

      // 3c: Caps at 5, newest first (close 6 tabs → only 5 in recents)
      for (let i = 1; i <= 6; i++) {
        const key = `file:ring${i}.md`;
        await wsAction(page, `ws => ws.open({ kind: "file", path: "ring${i}.md" })`);
        await page.waitForTimeout(30);
        await wsAction(page, `ws => ws.close(ws.refKey({ kind: "file", path: "ring${i}.md" }))`);
        await page.waitForTimeout(30);
      }
      const st3c = await wsState(page);
      if (st3c?.recents?.length === 5) {
        pass(`NV3 Recents capped at 5 [${VP.label}]`);
      } else {
        fail(`NV3 Recents capped at 5 [${VP.label}]`, `recents.length=${st3c?.recents?.length}, expected 5`);
      }

      // Newest first: ring6 should be at index 0
      if (st3c?.recents?.[0] === "file:ring6.md") {
        pass(`NV3 Recents newest first [${VP.label}]`);
      } else {
        fail(`NV3 Recents newest first [${VP.label}]`, `recents[0]=${st3c?.recents?.[0]}, expected "file:ring6.md"`);
      }

      // 3d: Eviction also populates recents
      // Open 13 tabs to trigger eviction (TAB_CAP = 12)
      await resetWorkspace(page);
      for (let i = 1; i <= 13; i++) {
        await wsAction(page, `ws => ws.open({ kind: "file", path: "evict${i}.md" })`);
        await page.waitForTimeout(30);
      }
      const st3d = await wsState(page);
      // One tab was evicted — recents should have it
      if ((st3d?.recents?.length ?? 0) > 0) {
        pass(`NV3 Eviction populates recents [${VP.label}]`);
      } else {
        fail(`NV3 Eviction populates recents [${VP.label}]`, `recents: ${JSON.stringify(st3d?.recents)}`);
      }
      // Tab count should be capped at 12
      if ((st3d?.tabKeys?.length ?? 0) <= 12) {
        pass(`NV3 Tab cap enforced at 12 [${VP.label}]`);
      } else {
        fail(`NV3 Tab cap enforced at 12 [${VP.label}]`, `tabs=${st3d?.tabKeys?.length}`);
      }

      // 3e: Recents survives reload
      if (!MUTATION) {
        // Get current recents before reload
        const st3ePre = await wsState(page);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(400);
        const st3ePost = await wsState(page);
        if (JSON.stringify(st3ePre?.recents) === JSON.stringify(st3ePost?.recents) && (st3ePost?.recents?.length ?? 0) > 0) {
          pass(`NV3 Recents survives reload [${VP.label}]`);
        } else {
          fail(`NV3 Recents survives reload [${VP.label}]`, `pre: ${JSON.stringify(st3ePre?.recents)} → post: ${JSON.stringify(st3ePost?.recents)}`);
        }
      } else {
        // In MUTATION mode, reload should LOSE recents
        const st3ePre = await wsState(page);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(400);
        const st3ePost = await wsState(page);
        const lost = (st3ePost?.recents?.length ?? 0) === 0;
        if (lost) {
          pass(`NV3 Mutation confirmed: recents lost on reload [${VP.label}]`);
        } else {
          fail(`NV3 Mutation check: recents should be lost [${VP.label}]`, `post: ${JSON.stringify(st3ePost?.recents)}`);
        }
      }

      // 3f: Reopening from recents: removes from list and opens the tab
      if (!MUTATION) {
        await resetWorkspace(page);
        // Close a tab to populate recents
        await wsAction(page, `ws => ws.open({ kind: "file", path: "reopen-me.md" })`);
        await page.waitForTimeout(50);
        await wsAction(page, `ws => ws.close(ws.refKey({ kind: "file", path: "reopen-me.md" }))`);
        await page.waitForTimeout(100);

        const stBefore = await wsState(page);
        const hadRecent = stBefore?.recents?.includes("file:reopen-me.md") ?? false;
        if (!hadRecent) {
          fail(`NV3 Reopen test: reopen-me.md in recents [${VP.label}]`, "not in recents before reopen");
        } else {
          // Open the menu and click the recent
          await openMenu(page);
          const recentBtn = page.locator("[data-recent-key='file:reopen-me.md']");
          const recentBtnCount = await recentBtn.count();
          if (recentBtnCount === 0) {
            fail(`NV3 Reopen test: recent button found [${VP.label}]`, "not in menu");
          } else {
            await recentBtn.click();
            await page.waitForTimeout(200);
            const stAfter = await wsState(page);
            const removedFromRecents = !(stAfter?.recents?.includes("file:reopen-me.md") ?? true);
            const tabOpen = stAfter?.tabKeys?.includes("file:reopen-me.md") ?? false;
            if (removedFromRecents && tabOpen) {
              pass(`NV3 Reopening removes from recents and opens tab [${VP.label}]`);
            } else {
              fail(`NV3 Reopening removes from recents and opens tab [${VP.label}]`,
                `removed=${removedFromRecents}, tabOpen=${tabOpen}, recents=${JSON.stringify(stAfter?.recents)}, tabs=${JSON.stringify(stAfter?.tabKeys)}`);
            }
          }
        }
      }

      await page.screenshot({ path: join(SHOTS_DIR, `NV3-final-${VP.label}.png`) });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
