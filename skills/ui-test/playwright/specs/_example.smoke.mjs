// _example.smoke.mjs — template spec showing the authoring pattern.
//
// Copy this when authoring a real test. The body is plain Playwright; the only
// "intelligence" is in writing the steps, which you do ONCE — running it costs
// no model calls.
//
// Run standalone:  node playwright/specs/_example.smoke.mjs --out .runs/smoke --headed
// Or via runner:   node playwright/run.mjs --out .runs playwright/specs/_example.smoke.mjs

import { runTest } from '../lib/harness.mjs';
// import { login } from '../lib/auth.mjs';   // uncomment if your app needs a login

await runTest(
  { id: 0, name: 'Smoke — app shell loads', app: 'app', viewport: 'desktop' },
  async (t) => {
    await t.step('open the app', async () => {
      await t.goto('/');
      // If your app needs login, call the auth helper here instead:
      //   await login(t.page, { baseUrl: t.baseUrl, email, password });
    });

    await t.step('app shell is present', async () => {
      // Presence is necessary but NOT sufficient — assert geometry too (see SKILL.md).
      const vp = t.page.viewportSize();
      const body = t.page.locator('body');
      t.check('body visible', await body.isVisible());
      const box = await body.boundingBox();
      t.check('body fills the viewport width',
              box && box.width >= vp.width - 2,
              `box=${JSON.stringify(box)} vp=${vp.width}x${vp.height}`);
      t.log(`URL: ${t.page.url()}`);
    });
  }
);
