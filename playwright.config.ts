import { defineConfig, devices } from '@playwright/test';

/**
 * The web view, end to end, in a real browser: scan → filter → detail, each checked with a
 * screenshot against a committed baseline (see tests/e2e/README.md). `npm run test:e2e` starts
 * the app itself, on ./fixture, so nothing but a browser needs to be running first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  // Locally, a new case's first run writes its baseline and passes. On CI, a missing or
  // mismatched screenshot must fail outright — never silently adopted as the new baseline.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: {
    // A little slack for anti-aliasing; a real regression is almost never this close.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node src/cli.ts serve ./fixture --port 4310',
    url: 'http://127.0.0.1:4310/',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
