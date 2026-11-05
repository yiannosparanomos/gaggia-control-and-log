import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  reporter: 'list',
  use: { channel: process.env.PW_CHANNEL }, // PW_CHANNEL=msedge uses installed Edge instead of Playwright's Chromium
  projects: [
    { name: 'e2e', testMatch: 'e2e.spec.mjs' }, // part of `npm run check`
    { name: 'ui', testMatch: 'ui.spec.mjs' }, // optional: `npm run test:ui`
  ],
});
