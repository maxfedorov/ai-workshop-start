// Template for demo-feature/SKILL.md §3. setup.sh copies it into the runner directory as
// record.mjs; edit the steps between the two markers for the feature being demoed, then:
//   DEMO_APP_URL=http://127.0.0.1:<port>/ DEMO_CHROME_PATH=<from setup.sh> node record.mjs
// Produces /tmp/skill-atlas-demo/<hash>.webm, and start-offset for the GIF (see markStart);
// finish.sh turns them into the MP4 and the GIF.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const APP_URL = process.env.DEMO_APP_URL ?? 'http://127.0.0.1:3000/';
const outDir = '/tmp/skill-atlas-demo';
mkdirSync(outDir, { recursive: true });
rmSync(`${outDir}/start-offset`, { force: true }); // a previous run's start is not this one's

// Empty DEMO_CHROME_PATH: Playwright's own Chromium. Otherwise the Chrome for Testing setup.sh
// downloaded when Playwright's CDN was blocked.
const browser = await chromium.launch({ executablePath: process.env.DEMO_CHROME_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const t0 = Date.now();

/**
 * Marks where the demo starts: the moment the page shows what the demo is about, after the
 * blank page the recording begins with. finish.sh starts the GIF there (the MP4 keeps it all).
 * Only the first call counts, so calling it again later does no harm.
 */
let started = false;
function markStart() {
  if (started) return;
  started = true;
  writeFileSync(`${outDir}/start-offset`, String((Date.now() - t0) / 1000));
}

await page.goto(APP_URL);
await page.waitForTimeout(600);

const filter = page.locator('#filter');
/** Types a filter from scratch, slowly enough to read, and holds the result on screen. */
async function filterBy(text, pause = 1600) {
  await filter.fill('');
  await filter.click();
  await filter.type(text, { delay: 85 });
  await page.waitForTimeout(pause);
}

/**
 * Scans a source typed into the page's own form, when `serve` was started without one. The
 * typing is part of the demo, so the start is marked once the form is there, not after the scan.
 */
async function scanFromForm(source) {
  await page.locator('#source').waitFor();
  markStart();
  await page.locator('#source').click();
  await page.locator('#source').type(source, { delay: 15 });
  await page.locator('.scan-form').getByRole('button', { name: 'Scan' }).click();
  await page.waitForSelector('#skill-list li');
  await page.waitForTimeout(1200);
}

// --- Edit from here down to match the feature being demoed. ---

// The start: the list `serve` was given (§2). Keep markStart() right after it. Started without
// a source? Replace these two lines with `await scanFromForm('/absolute/path/to/a/checkout');`.
await page.waitForSelector('#skill-list li');
markStart();
await page.waitForTimeout(1200);

// Example: filter the list, then clear it.
await filterBy('some-word');
await filter.fill('');
await page.waitForTimeout(400);

// Example: show that the state survives a reload (the address holds ?source, ?skill, ?q).
await page.reload();
await page.waitForSelector('#skill-list li');
await page.waitForTimeout(1200);

// Example: open one skill's rendered SKILL.md. Scope past #skill-list and the class, not
// getByText alone — skill name and path both contain the same text and make it ambiguous.
await page.locator('#skill-list .skill-name', { hasText: 'some-skill' }).click();
await page.waitForTimeout(2200);

// --- Edit up to here. ---

const finalUrl = page.url();
await context.close();
await browser.close();
console.log('done:', finalUrl);
