// Optional: `npm run test:ui`. Checks the layout on phone-sized screens and saves screenshots to
// web/test-results/ui/. Not required for merging. No AI tokens: nothing here calls a model.
import { test as base, expect } from '@playwright/test';
import { join } from 'node:path';
import { startFake } from './fake-esp32.mjs';

const test = base.extend({
  fake: async ({}, use) => {
    const fake = await startFake();
    await use(fake);
    await fake.close();
  },
});

const PHONES = [
  { name: 'small', width: 360, height: 800 },
  { name: 'redmi', width: 412, height: 915 },
];
const VIEWS = ['tabTimer', 'tabLog', 'tabBeans'];
const MIN_TAP = 24; // WCAG 2.2 AA target size, in CSS pixels

async function checkLayout(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
  const small = await page.evaluate((min) =>
    [...document.querySelectorAll('button, a.btn, label.btn, input.switch')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ id: el.id || el.textContent.trim() || el.className, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < min || box.height < min)
      .map(({ id, box }) => `${id} (${Math.round(box.width)}x${Math.round(box.height)})`), MIN_TAP);
  expect(small, 'targets too small to tap').toEqual([]);
}

for (const phone of PHONES) {
  test(`layout on a ${phone.width} px phone`, async ({ page, fake }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.goto(fake.url + '/?sim');
    const shot = (name) => page.screenshot({ path: join('test-results', 'ui', `${phone.name}-${name}.png`), fullPage: true });

    for (const view of VIEWS) {
      await page.locator('#' + view).click();
      await checkLayout(page);
      await shot(view);
    }
    await page.locator('#tabLog').click();
    await page.locator('#newEntry').click();
    await checkLayout(page);
    await shot('log-form');
  });
}
