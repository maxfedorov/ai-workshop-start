// The web view in a real browser, against ./fixture (see tests/e2e/README.md for how the
// screenshots work). Each case is a moment from spec/web.md worth seeing, not just asserting.
import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#skill-list li');
});

test('the fixture scan lists every skill, sorted, with the malformed one and the copy marked', async ({ page }) => {
  await expect(page.locator('#layout')).toHaveScreenshot('skill-list.png');
});

test('filtering to one word narrows the list to the matching skill', async ({ page }) => {
  await page.locator('#filter').fill('commits');
  await expect(page.locator('#count')).toHaveText('1 of 4 skills');
  await expect(page.locator('#layout')).toHaveScreenshot('skill-list-filtered.png');
});

test('a filter that matches nothing shows the empty state and a button that clears it', async ({ page }) => {
  await page.locator('#filter').fill('no-such-skill');
  await expect(page.locator('#skill-list .empty')).toBeVisible();
  await expect(page.locator('#layout')).toHaveScreenshot('skill-list-empty.png');

  await page.locator('#skill-list .empty button').click();
  await expect(page.locator('#filter')).toHaveValue('');
  await expect(page.locator('#skill-list li').first()).toBeVisible();
});

test("opening a skill renders its SKILL.md", async ({ page }) => {
  await page.locator('#skill-list .skill-name', { hasText: 'code-style' }).click();
  await expect(page.locator('#detail')).toContainText('Code style');
  await expect(page.locator('#detail')).toHaveScreenshot('skill-detail.png');
});

// The long press on Scan (spec/web.md, Long press), on Playwright's clock, paused: the 3 s are
// run through, not waited for, and a slow screenshot doesn't eat into them.
test.describe('a long press on Scan', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await page.waitForSelector('#skill-list li');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    const scan = page.getByRole('button', { name: 'Scan' });
    const box = (await scan.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  });

  test('held for 3 s shows Pasha Tekhnik next to the button, without scanning; gone 3 s later', async ({ page }) => {
    const head = page.locator('#pasha');
    const scans: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/scan')) scans.push(request.url()); });
    await page.locator('#source').fill('typed, not scanned');
    await page.mouse.down();
    await page.clock.runFor(2_900);
    await expect(head).toBeHidden();
    await page.clock.runFor(100);
    await expect(head).toBeVisible();
    await expect(head.getByRole('img', { name: 'Pasha Tekhnik' })).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#source')).toHaveValue('typed, not scanned');
    // The top of the page: the head hangs below the top bar, over the list.
    await expect(page).toHaveScreenshot('long-press-pasha.png', { clip: { x: 0, y: 0, width: 1280, height: 240 } });

    await page.clock.runFor(2_900);
    await expect(head).toBeVisible();
    await page.clock.runFor(100);
    await expect(head).toBeHidden();
    await expect(page.locator('#source')).toHaveValue('typed, not scanned');
    expect(scans).toEqual([]);
  });

  test('released before 3 s: no head, and the click scans as usual', async ({ page }) => {
    await page.mouse.down();
    await page.clock.runFor(2_000);
    const scanned = page.waitForRequest(/\/api\/scan\?source=/);
    await page.mouse.up();
    await scanned;
    await page.clock.runFor(5_000);
    await expect(page.locator('#pasha')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  });

  test('moved off the button before 3 s: no head', async ({ page }) => {
    await page.mouse.down();
    await page.clock.runFor(2_000);
    await page.mouse.move(10, 300);
    await page.clock.runFor(2_000);
    await page.mouse.up();
    await expect(page.locator('#pasha')).toBeHidden();
  });

  test('another long press while the head shows keeps it 3 s from that one', async ({ page }) => {
    const head = page.locator('#pasha');
    await page.mouse.down();
    await page.clock.runFor(3_000);
    await page.mouse.up();
    await page.clock.runFor(1_000);
    await page.mouse.down();
    await page.clock.runFor(3_000);
    await page.mouse.up();
    await page.clock.runFor(2_900);
    await expect(head).toBeVisible();
    await page.clock.runFor(100);
    await expect(head).toBeHidden();
  });
});
