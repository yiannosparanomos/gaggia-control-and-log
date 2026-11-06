import { test as base, expect } from '@playwright/test';
import { COFFEES, startFake } from './fake-esp32.mjs';

const test = base.extend({
  fake: async ({}, use) => {
    const fake = await startFake();
    await use(fake);
    await fake.close();
  },
  // Every test also fails on an uncaught JavaScript error.
  app: async ({ page, fake }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(fake.url + '/');
    await use(page);
    expect(errors).toEqual([]);
  },
});

const sent = (fake, request) => expect.poll(() => fake.log).toContain(request);
const openManual = (app) => app.locator('summary').click();

test('start, stop and settings are sent as POST', async ({ app, fake }) => {
  await app.locator('#main').click();
  await sent(fake, 'POST /api/start');
  await expect(app.locator('#main')).toHaveText('stop.');
  await app.locator('#plus').click();
  await sent(fake, 'POST /api/set?limit=31');
  await app.locator('#main').click();
  await sent(fake, 'POST /api/stop');
  await app.locator('#auto').click();
  await sent(fake, 'POST /api/set?auto=0');
});

test('press needs a second tap, then goes back to normal after 4 s', async ({ app, fake }) => {
  await openManual(app);
  const press = app.locator('#press');
  const label = await press.textContent();

  await press.click();
  await expect(press).toContainText('only if the machine is running');
  expect(fake.log).not.toContain('POST /api/press');
  await press.click();
  await sent(fake, 'POST /api/press');
  await expect(press).toHaveText(label);

  await press.click();
  await expect(press).toHaveText(label, { timeout: 5000 });
});

test('during a shot, press is disabled and reset needs a second tap', async ({ app, fake }) => {
  await openManual(app);
  await app.locator('#main').click();
  await expect(app.locator('#press')).toBeDisabled();

  const reset = app.locator('#reset');
  await reset.click();
  await expect(reset).toContainText('only if the machine has stopped');
  expect(fake.log.some((l) => l.startsWith('POST /api/reset'))).toBe(false);
  await reset.click();
  await sent(fake, 'POST /api/reset?confirm=1');
  await expect(app.locator('#main')).toHaveText('start.');
});

test('a failed coffee load can never overwrite the list', async ({ page, fake }) => {
  fake.failCoffeeLoad = true;
  await page.goto(fake.url + '/');

  await page.locator('#tabBeans').click();
  await page.locator('#bName').fill('New Bag');
  await page.locator('#addBean button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('Not saved');

  await page.locator('#tabLog').click();
  await page.locator('#newEntry').click();
  await page.locator('#fCoffee').fill('Typed Coffee');
  await page.locator('#form button[type=submit]').click();
  await expect(page.locator('#toast')).toHaveText('saved.');
  expect(fake.brews).toHaveLength(1);

  expect(fake.log).not.toContain('POST /api/coffees');
  expect(fake.coffees).toEqual(COFFEES);
});

test('after the load recovers, saving keeps the existing coffees', async ({ page, fake }) => {
  fake.failCoffeeLoad = true;
  await page.goto(fake.url + '/');
  await page.locator('#tabBeans').click();
  await page.locator('#bName').fill('Lost Bag');
  await page.locator('#addBean button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('Not saved');

  fake.failCoffeeLoad = false;
  await page.locator('#tabTimer').click();
  await page.locator('#tabBeans').click();
  await expect(page.locator('#libList')).toContainText('Kenya AA');
  await page.locator('#bName').fill('Second Bag');
  await page.locator('#addBean button[type=submit]').click();
  await expect(page.locator('#toast')).toHaveText('added.');

  expect(fake.coffees.map((c) => c.name)).toEqual(['Colombia Huila', 'Kenya AA', 'Second Bag']);
});

test('restore is refused until the current lists have loaded', async ({ page, fake }) => {
  fake.failCoffeeLoad = true;
  await page.goto(fake.url + '/');
  await page.locator('#tabLog').click();
  await page.locator('#restoreFile').setInputFiles({
    name: 'gaggia-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ brews: [{ id: 9, ts: 9 }], coffees: [] })),
  });
  await expect(page.locator('#toast')).toContainText('Not restored');
  expect(fake.brews).toEqual([]);
});

test('a storage failure shows a warning', async ({ app, fake }) => {
  await expect(app.locator('#storageBanner')).toBeHidden();
  fake.status.storage = false;
  await expect(app.locator('#storageBanner')).toBeVisible();
  await expect(app.locator('#storageBanner')).toContainText('Nothing has been erased');
});

test('the simulator follows the same rules with no ESP32', async ({ page, fake }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fake.url + '/?sim');
  await expect(page.locator('#simBanner')).toBeVisible();
  await openManual(page);

  await page.locator('#main').click();
  await expect(page.locator('#main')).toHaveText('stop.');
  await expect(page.locator('#press')).toBeDisabled();
  await page.locator('#reset').click();
  await page.locator('#reset').click();
  await expect(page.locator('#main')).toHaveText('start.');

  expect(fake.log.filter((l) => l.includes('/api/start'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('the demo page shows the machine following the app', async ({ page, fake }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fake.url + '/demo.html');
  const app = page.frameLocator('#app');
  const machine = page.locator('#machine');
  await expect(app.locator('#simBanner')).toBeVisible();
  await expect(machine).toHaveAttribute('data-pump', 'off');

  await app.locator('#main').click();
  await expect(machine).toHaveAttribute('data-pump', 'on');
  await expect(machine).toHaveAttribute('data-relay', 'on');
  await expect(page.locator('#pumpText')).toHaveText('pump on.');
  await expect(machine).toHaveAttribute('data-relay', 'off', { timeout: 2000 });

  await page.waitForTimeout(1100); // the simulator also enforces the 1 s cooldown
  await app.locator('#main').click();
  await expect(machine).toHaveAttribute('data-pump', 'off');
  expect(errors).toEqual([]);
});

test('reset is only confirmed after the question was really asked', async ({ app, fake }) => {
  await openManual(app);
  await app.locator('#reset').click();
  await sent(fake, 'POST /api/reset');
  expect(fake.log).not.toContain('POST /api/reset?confirm=1');
});

test('an unconfirmed reset from a stale screen leaves a running shot alone', async ({ app, fake }) => {
  await openManual(app);
  // The screen keeps seeing "idle", while a shot has really started, for example from another phone
  const idle = JSON.stringify(fake.status);
  await app.route('**/api/status', (route) => route.fulfill({ contentType: 'application/json', body: idle }));
  fake.status.state = 'brewing';

  await app.locator('#reset').click();
  await sent(fake, 'POST /api/reset');
  expect(fake.status.state).toBe('brewing');
});

test('the journal reloads after a shot, because the ESP32 refuses reads during one', async ({ app, fake }) => {
  fake.brews.push({ id: 1, ts: 1, coffee: 'Early Brew' });
  await app.locator('#main').click();
  await expect(app.locator('#main')).toHaveText('stop.');
  fake.brews.push({ id: 2, ts: 2, coffee: 'Late Brew' });
  await app.locator('#tabLog').click();
  await expect(app.locator('#log')).not.toContainText('Late Brew');

  await app.locator('#tabTimer').click();
  await app.locator('#main').click();
  await expect(app.locator('#main')).toHaveText('start.');
  await app.locator('#tabLog').click();
  await expect(app.locator('#log')).toContainText('Late Brew');
});

test('reloading during a shot never says the journal is empty', async ({ app, fake }) => {
  fake.brews.push({ id: 1, ts: 1, coffee: 'Saved Brew' });
  fake.status.state = 'brewing';
  const coffeesRead = app.waitForResponse('**/api/coffees');
  await app.reload();
  await coffeesRead;
  await app.locator('#tabLog').click();
  await app.waitForTimeout(300); // let the refused read finish and the list render
  await expect(app.locator('#logEmpty')).toBeHidden();

  fake.status.state = 'done';
  await expect(app.locator('#log')).toContainText('Saved Brew');
});

test('during a shot, delete explains itself and backup is hidden', async ({ app, fake }) => {
  fake.brews.push({ id: 1, ts: 1, coffee: 'Saved Brew' });
  await app.locator('#tabLog').click();
  await expect(app.locator('#backupLink')).toBeVisible();
  await app.locator('[data-ask]').click();

  fake.status.state = 'brewing';
  await expect(app.locator('#backupLink')).toBeHidden();
  await app.locator('[data-del]').click();
  await expect(app.locator('#toast')).toHaveText('Not deleted. Try again after the shot.');
  expect(fake.brews).toHaveLength(1);

  fake.status.state = 'done';
  await expect(app.locator('#backupLink')).toBeVisible();
});

test('a restore that fills the storage says so, not "bad file"', async ({ app, fake }) => {
  await expect.poll(() => fake.log).toContain('GET /api/coffees');
  fake.storageFull = true;
  await app.locator('#tabLog').click();
  await app.locator('#restoreFile').setInputFiles({
    name: 'gaggia-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ brews: [{ id: 9, ts: 9 }], coffees: [] })),
  });
  await expect(app.locator('#toast')).toHaveText('Restore stopped. The ESP32 storage is full.');
});

test('a failed restore can be retried without duplicating brews', async ({ app, fake }) => {
  await expect.poll(() => fake.log).toContain('GET /api/coffees');
  // The second save fails, and so does the reload after it, as on a bad connection. The list on screen stays old.
  let posts = 0, failNextRead = false, readFailed = false;
  await app.route('**/api/brews', (route) => {
    if (route.request().method() === 'POST' && ++posts === 2) { failNextRead = true; return route.fulfill({ status: 500 }); }
    if (route.request().method() === 'GET' && failNextRead) { failNextRead = false; readFailed = true; return route.fulfill({ status: 500 }); }
    return route.fallback();
  });
  const file = {
    name: 'gaggia-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ brews: [{ id: 1, ts: 1 }, { id: 2, ts: 2 }], coffees: [] })),
  };
  await app.locator('#tabLog').click();

  await app.locator('#restoreFile').setInputFiles(file);
  await expect(app.locator('#toast')).toContainText('Restore stopped');
  expect(fake.brews.map((b) => b.id)).toEqual([1]);
  await expect.poll(() => readFailed).toBe(true);

  await app.locator('#restoreFile').setInputFiles(file);
  await expect(app.locator('#toast')).toHaveText('Restored 1 shots.');
  expect(fake.brews.map((b) => b.id)).toEqual([1, 2]);
});

test('a backup that is not valid JSON is called a bad file', async ({ app, fake }) => {
  await expect.poll(() => fake.log).toContain('GET /api/coffees');
  await app.locator('#tabLog').click();
  await app.locator('#restoreFile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(app.locator('#toast')).toContainText('could not be read');
});

test('a full journal says so, not "check the connection"', async ({ app, fake }) => {
  fake.storageFull = true;
  await app.locator('#tabLog').click();
  await app.locator('#newEntry').click();
  await app.locator('#fCoffee').fill('One Too Many');
  await app.locator('#form button[type=submit]').click();
  await expect(app.locator('#toast')).toContainText('storage is full');
  expect(fake.brews).toEqual([]);
});
