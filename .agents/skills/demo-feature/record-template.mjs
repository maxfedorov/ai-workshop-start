// Template for demo-feature/SKILL.md §3. Copy this into the throwaway runner directory,
// edit the steps between page.goto and context.close() for the feature being demoed, then:
//   node record.mjs
// Produces /tmp/skill-atlas-demo/<hash>.webm; transcode with ffmpeg per the skill's §3.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP_URL = process.env.DEMO_APP_URL ?? 'http://127.0.0.1:3000/';
const outDir = '/tmp/skill-atlas-demo';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

await page.goto(APP_URL);
await page.waitForTimeout(600);

// --- Edit from here down to match the feature being demoed. ---

// Example: scan a source typed into the page's own form.
await page.locator('#source').click();
await page.locator('#source').type('/absolute/path/to/a/checkout', { delay: 15 });
await page.locator('.scan-form').getByRole('button', { name: 'Scan' }).click();
await page.waitForSelector('#skill-list li');
await page.waitForTimeout(1200);

// Example: filter the list, then clear it.
await page.locator('#filter').click();
await page.locator('#filter').type('some-word', { delay: 90 });
await page.waitForTimeout(1500);
await page.locator('#filter').fill('');
await page.waitForTimeout(400);

// Example: open one skill's rendered SKILL.md. Scope past #skill-list and the class, not
// getByText alone — skill name and path both contain the same text and make it ambiguous.
await page.locator('#skill-list .skill-name', { hasText: 'some-skill' }).click();
await page.waitForTimeout(2200);

// --- Edit up to here. ---

await context.close();
await browser.close();
console.log('done');
