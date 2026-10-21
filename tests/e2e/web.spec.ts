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

test.describe('the scan field’s clear button', () => {
  test('after a scan the field holds its source, so the button shows; a click empties the field and keeps the focus, scanning nothing', async ({ page }) => {
    const clear = page.getByRole('button', { name: 'Clear the scan URL' });
    await expect(page.locator('#source')).toHaveValue('./fixture');
    await expect(clear).toBeVisible();
    await expect(page.locator('.scan-form')).toHaveScreenshot('scan-field-clear.png');

    const address = page.url();
    const length = await page.evaluate('history.length');
    const scans: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/scan')) scans.push(request.url()); });
    await clear.click();
    await expect(page.locator('#source')).toHaveValue('');
    await expect(page.locator('#source')).toBeFocused();
    await expect(clear).toBeHidden();
    expect(page.url()).toBe(address);
    expect(await page.evaluate('history.length')).toBe(length);
    expect(scans).toEqual([]);
    await expect(page.locator('#skill-list li')).toHaveCount(4);
  });

  test('empty → no button; typed → it comes back; cleared by hand → it goes', async ({ page }) => {
    const source = page.locator('#source');
    const clear = page.getByRole('button', { name: 'Clear the scan URL' });
    await source.fill('');
    await expect(clear).toBeHidden();
    await source.pressSequentially('https://github.com/owner/repo');
    await expect(clear).toBeVisible();
    await source.fill('');
    await expect(clear).toBeHidden();
  });

  test('with reduced motion, its hover has no transition', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear the scan URL' })).toHaveCSS('transition-duration', '0s');
  });

  test('after clearing, what is typed next scans as usual', async ({ page }) => {
    await page.getByRole('button', { name: 'Clear the scan URL' }).click();
    await page.keyboard.type('./fixture');
    await page.keyboard.press('Enter');
    await expect(page.locator('#skill-list li')).toHaveCount(4);
    await expect(page.locator('#source')).toHaveValue('./fixture');
  });
});
