// _example.geometry.mjs — template for THE core lesson: assert EXPECTED GEOMETRY.
//
// This is the spec shape that catches the bug bare isVisible() misses: an element
// that mounts and passes isVisible() but renders at the wrong size (or zero size)
// because its CSS was dropped. Adapt the selector + expected box to your element.
//
// Run:  node playwright/specs/_example.geometry.mjs --out .runs/geom --headed

import { runTest } from '../lib/harness.mjs';

await runTest(
  { id: 1, name: 'Geometry — overlay is actually fullscreen', app: 'app', viewport: 'desktop' },
  async (t) => {
    await t.step('trigger the overlay', async () => {
      await t.goto('/');
      // Replace with whatever opens your overlay/modal/panel:
      // await t.page.getByRole('button', { name: 'Open' }).click();
    });

    await t.step('overlay renders at its design size', async () => {
      const vp = t.page.viewportSize();
      const el = t.page.locator('.my-overlay').first();   // <-- your selector

      // 1. Necessary: it's visible at all.
      t.check('overlay visible', await el.isVisible(), 'isVisible() was false');

      // 2. Sufficient: it's the SIZE the design demands. A fullscreen overlay
      //    should be ~viewport-sized; a 120x120 button should be ~120x120.
      const box = await el.boundingBox();
      t.check('overlay is fullscreen',
              box && box.width >= vp.width - 2 && box.height >= vp.height - 2,
              `box=${JSON.stringify(box)} vp=${vp.width}x${vp.height}`);

      // 3. Final judge: a screenshot you actually read.
      await t.screenshot('overlay');
    });
  }
);
