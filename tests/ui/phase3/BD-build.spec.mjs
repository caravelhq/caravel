// BD-build.spec.mjs — Phase 3.1 node 6: build identity and cache policy
//
// BD1: /api/state exposes buildId; the settings Advanced panel displays it.
// BD2: The hashed asset (app.<hash>.js) is served immutable; the shell is
//      served no-cache with an ETag that 304s on revalidation.
// BD3: After an app load, navigator.serviceWorker.getRegistrations() is empty
//      (the old worker unregisters itself; no new one registers).
//
// Run at BOTH 390×844 (Pixel 7 touch emulation) AND 1440×900.
//
// Usage:
//   CARAVEL_BASE=http://127.0.0.1:4636 node tests/ui/phase3/BD-build.spec.mjs
//
// Scratch daemon:
//   node tests/ui/phase3/scratch-daemon.mjs start \
//     --src src/index.ts --ws-dir tests/ui/phase3/fixture-ws --port 4636
//   node tests/ui/phase3/scratch-daemon.mjs stop --port 4636

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
const { chromium, devices } = await import(`file://${PLAYWRIGHT_MJS}`);

const BASE = (process.env.CARAVEL_BASE || "http://127.0.0.1:4636").replace(/\/$/, "");
console.log(`Base URL: ${BASE}`);

const SHOTS_DIR = join(__dirname, ".runs/bd-build");
mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function pass(label) { console.log(`✓ ${label}`); passed++; }
function fail(label, reason) { console.error(`✗ ${label}: ${reason}`); failed++; }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHeaders(url) {
  const res = await fetch(url);
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()) };
}

async function fetchConditional(url, ifNoneMatch) {
  const res = await fetch(url, { headers: { "If-None-Match": ifNoneMatch } });
  return res.status;
}

// ── Run at a viewport ─────────────────────────────────────────────────────────

async function runViewport(label, contextOpts) {
  console.log(`\n── ${label} ──`);

  // ── BD1 (API half) — /api/state exposes buildId ────────────────────────────
  {
    const res = await fetch(`${BASE}/api/state`);
    const data = await res.json();
    if (data?.buildId && typeof data.buildId === "string" && data.buildId.length > 0) {
      pass(`[${label}] BD1-api — /api/state.buildId is set: "${data.buildId}"`);
    } else {
      fail(`[${label}] BD1-api — /api/state.buildId missing or empty`, JSON.stringify(data?.buildId));
    }
  }

  // ── BD2 — cache headers ────────────────────────────────────────────────────

  // Shell: no-cache + ETag
  {
    const { status, headers } = await fetchHeaders(`${BASE}/`);
    const cc = headers["cache-control"] ?? "";
    const etag = headers["etag"] ?? "";
    if (!cc.includes("no-cache")) {
      fail(`[${label}] BD2-shell-cc — shell Cache-Control should include no-cache, got: "${cc}"`);
    } else {
      pass(`[${label}] BD2-shell-cc — shell served no-cache`);
    }
    if (!etag) {
      fail(`[${label}] BD2-shell-etag — shell has no ETag`);
    } else {
      pass(`[${label}] BD2-shell-etag — shell ETag: ${etag}`);
    }

    // Shell 304s on revalidation
    const status304 = await fetchConditional(`${BASE}/`, etag);
    if (status304 === 304) {
      pass(`[${label}] BD2-shell-304 — shell 304s with matching ETag`);
    } else {
      fail(`[${label}] BD2-shell-304 — expected 304, got ${status304}`);
    }
  }

  // Hashed JS: discover URL from the shell HTML, then assert immutable
  {
    const htmlRes = await fetch(`${BASE}/`);
    const html = await htmlRes.text();
    const jsMatch = html.match(/src="(\/app\.[A-Za-z0-9_-]+\.js)"/);
    const cssMatch = html.match(/href="(\/app\.[A-Za-z0-9_-]+\.css)"/);

    if (!jsMatch) {
      fail(`[${label}] BD2-hash-js — no hashed JS URL found in shell HTML`);
    } else {
      const jsUrl = jsMatch[1];
      const { headers } = await fetchHeaders(`${BASE}${jsUrl}`);
      const cc = headers["cache-control"] ?? "";
      if (cc.includes("immutable") && cc.includes("max-age=31536000")) {
        pass(`[${label}] BD2-hash-js — ${jsUrl} served immutable`);
      } else {
        fail(`[${label}] BD2-hash-js — expected immutable, got: "${cc}"`);
      }
    }

    if (!cssMatch) {
      fail(`[${label}] BD2-hash-css — no hashed CSS URL found in shell HTML`);
    } else {
      const cssUrl = cssMatch[1];
      const { headers } = await fetchHeaders(`${BASE}${cssUrl}`);
      const cc = headers["cache-control"] ?? "";
      if (cc.includes("immutable") && cc.includes("max-age=31536000")) {
        pass(`[${label}] BD2-hash-css — ${cssUrl} served immutable`);
      } else {
        fail(`[${label}] BD2-hash-css — expected immutable, got: "${cc}"`);
      }
    }
  }

  // ── BD1 (UI half) + BD3 — browser tests ────────────────────────────────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...contextOpts, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // BD3 — no service workers after load
    const swCount = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return 0;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    if (swCount === 0) {
      pass(`[${label}] BD3 — no service worker registrations after app load`);
    } else {
      fail(`[${label}] BD3 — expected 0 SW registrations, got ${swCount}`);
    }

    await page.screenshot({ path: join(SHOTS_DIR, `${label}-after-load.png`) });

    // BD1 (UI half) — open settings and check #build-id is displayed
    const settingsBtn = await page.$("#settings-btn");
    if (!settingsBtn) {
      await page.screenshot({ path: join(SHOTS_DIR, `${label}-no-settings-btn.png`) });
      fail(`[${label}] BD1-ui — #settings-btn not found`);
      return;
    }
    await settingsBtn.click();
    await page.waitForTimeout(600);

    // Look for the build-id element
    const buildIdEl = await page.$("#build-id");
    if (!buildIdEl) {
      await page.screenshot({ path: join(SHOTS_DIR, `${label}-settings-open.png`) });
      fail(`[${label}] BD1-ui — #build-id element not found in settings modal`);
    } else {
      const text = (await buildIdEl.textContent() ?? "").trim();
      if (text && text !== "—") {
        pass(`[${label}] BD1-ui — #build-id displayed: "${text}"`);
        await page.screenshot({ path: join(SHOTS_DIR, `${label}-build-id-visible.png`) });
      } else {
        await page.screenshot({ path: join(SHOTS_DIR, `${label}-build-id-empty.png`) });
        fail(`[${label}] BD1-ui — #build-id found but text is "${text}"`);
      }
    }
  } finally {
    await browser.close();
  }
}

// ── Two viewports ─────────────────────────────────────────────────────────────

await runViewport("1440x900", { viewport: { width: 1440, height: 900 } });
await runViewport("390x844-touch", {
  ...devices["Pixel 7"],
  viewport: { width: 390, height: 844 },
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
