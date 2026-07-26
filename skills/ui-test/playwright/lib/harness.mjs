// harness.mjs — deterministic Playwright test harness for the ui-test skill.
//
// The model: you author a small spec (a .mjs file) that walks the app using
// snippet helpers, and that spec runs under plain Playwright with no model
// calls at run time. Authoring the spec is the thinking; running it is
// deterministic and repeatable.
//
// A spec looks like:
//
//   import { runTest } from '../lib/harness.mjs';
//
//   await runTest(
//     { id: 1, name: 'Open the map', app: 'app', viewport: 'mobile' },
//     async (t) => {
//       await t.step('open map', async () => {
//         await t.goto('/#/map');
//         await t.check('map canvas visible', await t.page.locator('canvas').first().isVisible());
//       });
//     }
//   );
//
// Run it with:  node <spec>.mjs --out <dir>   (or via run.mjs)
// It writes <out>/results/<id>.json + screenshots, prints the result JSON, and
// exits 0 (pass) / 1 (fail/blocked).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { appConfig, selectCredential } from '../../script/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..', '..');

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function argOut() {
  const i = process.argv.indexOf('--out');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.UI_TEST_OUT || path.join(SKILL_DIR, 'playwright', '.runs', 'adhoc');
}

function viewportFor(appCfg, kind) {
  const apps = loadJson(path.join(SKILL_DIR, 'config', 'apps.json'));
  const a = appCfg?._appsEntry || apps[appCfg?._appKey] || {};
  if (kind === 'desktop') return a.viewport_desktop || { width: 1440, height: 900 };
  return a.viewport_mobile || a.viewport_desktop || { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
}

// Resolve app URL + persona credential from the project config (.claude/config.json
// #ui-test.<app>), falling back to config/apps.json for the URL when no config
// entry exists.
export function resolveContext({ app = 'app', persona, viewport = 'mobile' } = {}) {
  const cfg = appConfig(app);
  const apps = loadJson(path.join(SKILL_DIR, 'config', 'apps.json'));
  const appsEntry = apps[app] || {};
  let baseUrl = cfg?.url || appsEntry.url_local || appsEntry.url_dev;
  if (!baseUrl) throw new Error(`No URL for app "${app}" (set .claude/config.json#ui-test.${app}.url or config/apps.json)`);
  baseUrl = baseUrl.replace(/\/+$/, '');
  const cred = selectCredential(cfg, persona);
  const vp = viewportFor({ _appKey: app, _appsEntry: appsEntry }, viewport);
  return {
    app,
    baseUrl,
    persona: cred
      ? { name: cred.name || persona, email: cred.email, password: cred.password || null, roles: cred.roles || [] }
      : null,
    viewport: vp,
    isHttps: /^https:/i.test(baseUrl),
  };
}

export async function runTest(meta, body) {
  const out = argOut();
  const screenshotsDir = path.join(out, 'screenshots');
  const resultsDir = path.join(out, 'results');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  const ctx = resolveContext(meta);
  const headless = process.env.UI_TEST_HEADLESS !== '0' && !process.argv.includes('--headed');
  const started = Date.now();

  const result = {
    test_id: meta.id ?? 0,
    test_name: meta.name || `test-${meta.id ?? 0}`,
    app: ctx.app,
    url: ctx.baseUrl,
    persona: ctx.persona ? { name: ctx.persona.name, email: ctx.persona.email, roles: ctx.persona.roles } : null,
    status: 'pass',
    summary: '',
    steps: [],
    console_errors: [],
    duration_ms: 0,
    stopped_early: false,
  };

  let browser = null;
  let context = null;
  let page = null;
  const consoleErrors = [];
  let stepNo = 0;
  let current = null;

  function finalize() {
    result.console_errors = consoleErrors;
    result.duration_ms = Date.now() - started;
    const resultFile = path.join(resultsDir, `${result.test_id}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ test: result.test_id, status: result.status, steps: result.steps.length, summary: result.summary }));
    process.exitCode = result.status === 'pass' ? 0 : 1;
  }

  // Launch is a common failure point (missing browser / system libs). Degrade to
  // a `blocked` result with an actionable hint rather than crashing the run.
  try {
    browser = await chromium.launch({ headless });
  } catch (err) {
    const msg = String(err.message || err);
    result.status = 'blocked';
    result.summary = /libnspr4|libnss3|libgbm|shared librar|install-deps|Executable doesn't exist/i.test(msg)
      ? `Browser could not launch — Playwright system deps/browsers missing. Run: npx playwright install --with-deps chromium (needs sudo). Detail: ${msg.slice(0, 200)}`
      : `Browser launch failed: ${msg.slice(0, 300)}`;
    finalize();
    return result;
  }

  context = await browser.newContext({
    baseURL: ctx.baseUrl,
    viewport: { width: ctx.viewport.width, height: ctx.viewport.height },
    deviceScaleFactor: ctx.viewport.deviceScaleFactor,
    isMobile: !!ctx.viewport.isMobile,
    hasTouch: !!ctx.viewport.hasTouch,
    ignoreHTTPSErrors: true, // dev servers commonly use self-signed TLS
  });
  context.setDefaultTimeout(Number(process.env.UI_TEST_TIMEOUT_MS) || 15000);
  page = await context.newPage();

  // Collect console + page errors so steps can flag them.
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

  const t = {
    page,
    context,
    baseUrl: ctx.baseUrl,
    persona: ctx.persona,
    log: msg => console.log(`  · ${msg}`),
    async goto(p = '/') {
      const url = /^https?:/i.test(p) ? p : ctx.baseUrl + (p.startsWith('/') ? p : '/' + p);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    // Record an assertion within the current step; false fails the step.
    check(label, cond, note = '') {
      const ok = !!cond;
      if (current) current.checks.push({ label, ok, note });
      if (!ok) throw new Error(`check failed: ${label}${note ? ` (${note})` : ''}`);
      return ok;
    },
    async screenshot(tag = 'shot') {
      const file = path.join(screenshotsDir, `t${result.test_id}-s${stepNo}-${tag}.png`.replace(/[^\w.\-]/g, '_'));
      try { await page.screenshot({ path: file }); if (current) current.evidence.push(file); return file; }
      catch { return null; }
    },
    async step(name, fn) {
      stepNo++;
      current = { n: stepNo, name, status: 'pass', observation: '', evidence: [], checks: [], console_errors: [] };
      const errBefore = consoleErrors.length;
      try {
        await fn(page);
        current.status = 'pass';
      } catch (err) {
        current.status = 'fail';
        current.observation = String(err.message || err).slice(0, 500);
        result.stopped_early = true;
      }
      current.console_errors = consoleErrors.slice(errBefore);
      await t.screenshot(name.slice(0, 24));
      result.steps.push(current);
      const c = current;
      current = null;
      if (c.status === 'fail') throw Object.assign(new Error(c.observation), { _isStepFail: true });
    },
  };

  try {
    await body(t);
    result.status = result.steps.some(s => s.status === 'fail') ? 'fail' : 'pass';
    result.summary = result.summary || (result.status === 'pass'
      ? `All ${result.steps.length} step(s) passed.`
      : `Failed at step ${result.steps.findIndex(s => s.status === 'fail') + 1}.`);
  } catch (err) {
    if (!err._isStepFail) {
      // Error outside a step (setup / navigation) — treat as blocked.
      result.status = result.steps.length ? 'fail' : 'blocked';
      result.summary = result.summary || `Aborted: ${String(err.message || err).slice(0, 300)}`;
    } else {
      result.status = 'fail';
      result.summary = result.summary || `Failed at step ${result.steps.length}: ${result.steps.at(-1)?.observation || ''}`;
    }
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }

  finalize();
  return result;
}
