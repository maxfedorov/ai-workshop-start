// The web view in a real browser, against ./fixture (see tests/e2e/README.md for how the
// screenshots work). Each case is a moment from spec/web.md worth seeing, not just asserting.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// The skills map, over fixture/fixtures/skills-map: skills whose names share words.
const SKILLS_MAP = fileURLToPath(new URL('../../fixture/fixtures/skills-map', import.meta.url));

test("the repository's header opens the skills map: the skills grouped by the words their names share", async ({ page }) => {
  await page.goto(`/?source=${encodeURIComponent(SKILLS_MAP)}`);
  await page.locator('#map-link').click();
  await expect(page).toHaveURL(/[?&]view=map(&|$)/);
  await expect(page.locator('#detail .skill-title')).toHaveText('Skills map');
  await expect(page.locator('#detail .map-group .map-word > span:first-child')).toHaveText(['release', 'checklist', 'code', 'review']);
  await expect(page.locator('#detail .map-alone .map-skill')).toHaveText(['commits']);
  await expect(page.locator('#detail')).toHaveScreenshot('skills-map.png');
});

test("the map's link carries the filter being typed", async ({ page }) => {
  await page.goto(`/?source=${encodeURIComponent(SKILLS_MAP)}&q=code`);
  await expect(page.locator('#map-link')).toHaveAttribute('href', /[?&]view=map&q=code$/);
  await page.locator('#filter').fill('checklist');
  await expect(page.locator('#map-link')).toHaveAttribute('href', /[?&]view=map&q=checklist$/);
  await page.locator('#filter').fill('');
  await expect(page.locator('#map-link')).toHaveAttribute('href', /[?&]view=map$/);
});

test("a group's word is marked in the names as a whole word, never inside another", async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  try {
    for (const name of ['rapid-api', 'api-docs']) {
      mkdirSync(join(root, '.claude/skills', name), { recursive: true });
      writeFileSync(join(root, '.claude/skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: The ${name} skill.\n---\n`);
    }
    await page.goto(`/?source=${encodeURIComponent(root)}&view=map`);
    await expect(page.locator('#detail .map-group .map-word > span:first-child')).toHaveText(['api']);
    const names = await page.locator('#detail .map-group .map-skill').evaluateAll((links) => links.map((link) => link.innerHTML));
    expect(names).toEqual(['<mark>api</mark>-docs', 'rapid-<mark>api</mark>']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a skill chosen on the map opens its SKILL.md, and Back returns to the map', async ({ page }) => {
  await page.goto(`/?source=${encodeURIComponent(SKILLS_MAP)}&view=map`);
  await page.locator('#detail .map-group', { hasText: 'release' }).locator('.map-skill', { hasText: 'release-notes' }).click();
  await expect(page.locator('#detail .skill-title')).toHaveText('release-notes');
  await expect(page).toHaveURL(/skill=\.claude%2Fskills%2Frelease-notes%2FSKILL\.md/);
  await page.goBack();
  await expect(page.locator('#detail .skill-title')).toHaveText('Skills map');
});

test('the map shows the skills the filter leaves, and a reload keeps both', async ({ page }) => {
  await page.goto(`/?source=${encodeURIComponent(SKILLS_MAP)}&view=map`);
  await page.locator('#filter').fill('checklist');
  await expect(page.locator('#detail .map-group .map-word > span:first-child')).toHaveText(['checklist']);
  await expect(page.locator('#detail .map-alone')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#filter')).toHaveValue('checklist');
  await expect(page.locator('#detail .map-group .map-word > span:first-child')).toHaveText(['checklist']);
  await expect(page.locator('#detail')).toHaveScreenshot('skills-map-filtered.png');

  await page.locator('#filter').fill('no-such-skill');
  await expect(page.locator('#detail .skill-description')).toHaveText('No skill matches the filter.');
});

test('names that share no word: every skill on its own', async ({ page }) => {
  await page.locator('#map-link').click();
  await expect(page.locator('#detail .map-none')).toHaveText('No two skills share a word in their names.');
  await expect(page.locator('#detail .map-alone .map-skill')).toHaveText(['code-style', 'commits', 'release-checklist', 'writing-lint-checks']);
});

test('a repository without skills: the map says so', async ({ page }) => {
  // Scanned on its own, skills-map/.claude has its SKILL.md files outside every SKILL_ROOTS.
  await page.goto(`/?source=${encodeURIComponent(`${SKILLS_MAP}/.claude`)}&view=map`);
  await expect(page.locator('#detail .detail-empty')).toHaveText('No skills were found in this repository.');
});

test('an organization has no map: ?view=map shows the organization', async ({ page }) => {
  // The organization's JSON, as /api/scan answers it (see tests/organization.test.ts), without GitHub.
  await page.route('**/api/scan?*', (route) => route.fulfill({
    json: {
      source: 'https://github.com/JetBrains',
      organization: { id: 'JetBrains', url: 'https://github.com/JetBrains' },
      repositories: [
        { id: 'JetBrains/twins', url: 'https://github.com/JetBrains/twins', skills: 2 },
        { id: 'JetBrains/empty', url: 'https://github.com/JetBrains/empty', skills: 0 },
      ],
      warnings: [],
    },
  }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?source=${encodeURIComponent('https://github.com/JetBrains')}&view=map`);
  await expect(page.locator('#detail .eyebrow')).toHaveText('Organization');
  await expect(page.locator('#detail .skill-title')).toHaveText('JetBrains');
  await expect(page.locator('#map-link')).toHaveCount(0);
  await expect(page.locator('#detail .map-group')).toHaveCount(0);

  await page.locator('#filter').fill('twins');
  await expect(page.locator('#count')).toHaveText('1 of 2 repositories');
  await expect(page.locator('#detail .skill-title')).toHaveText('JetBrains');
  // Typing keeps the organization's address, which has no map.
  await expect(page).toHaveURL(/[?&]q=twins$/);
  await expect(page).not.toHaveURL(/view=map/);
  expect(errors).toEqual([]);
});

// The state panel's children, one line each: an element's tag and class, or a text node's text.
function stateChildren(page: import('@playwright/test').Page) {
  return page.locator('#state-panel').evaluate((panel) => [...panel.childNodes].map((node) =>
    node.nodeType === 1 ? `${node.nodeName}.${(node as typeof panel).className}` : `#text ${node.textContent}`));
}

test('a scan that fails: its message and the buttons, nothing else', async ({ page }) => {
  await page.goto(`/?source=${encodeURIComponent('/nonexistent')}`);
  await expect(page.locator('#state-panel .state-title')).toHaveText('Lost in space');
  await expect(page.locator('#state-panel .state-text')).toHaveText('Not a GitHub URL or a readable directory: /nonexistent');
  await expect(page.locator('#state-panel button')).toHaveText(['Try again', 'Scan something else']);
  expect(await stateChildren(page)).toEqual(['DIV.error-mark', 'P.state-title', 'P.state-text', 'DIV.examples']);
});

test('a failure whose message does not name the source: the source under it', async ({ page }) => {
  await page.route('**/api/scan?*', (route) => route.fulfill({ status: 422, json: { error: 'Something went wrong.' } }));
  await page.goto(`/?source=${encodeURIComponent('/somewhere')}`);
  await expect(page.locator('#state-panel .state-text')).toHaveText(['Something went wrong.', '/somewhere']);
  expect(await stateChildren(page)).toEqual(['DIV.error-mark', 'P.state-title', 'P.state-text', 'P.state-text mono muted', 'DIV.examples']);
});

test('a failure without a source: its message and Scan something else, no Try again', async ({ page }) => {
  await page.route('**/api/scan?*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#state-panel .state-title')).toHaveText('Lost in space');
  await expect(page.locator('#state-panel .state-text')).toHaveText('Cannot reach the Skill Atlas server. Is it still running?');
  await expect(page.locator('#state-panel button')).toHaveText(['Scan something else']);
  expect(await stateChildren(page)).toEqual(['DIV.error-mark', 'P.state-title', 'P.state-text', 'DIV.examples']);
});

test('loading without a source: "Charting skills…", nothing else', async ({ page }) => {
  // A scan that never answers, so the page stays loading.
  await page.route('**/api/scan?*', () => {});
  await page.goto('/');
  await expect(page.locator('#state-panel .state-title')).toHaveText('Charting skills…');
  expect(await stateChildren(page)).toEqual(['DIV.orbit', 'P.state-title']);
});

test('loading a source: "Charting skills…" and the source', async ({ page }) => {
  await page.route('**/api/scan?*', () => {});
  await page.goto(`/?source=${encodeURIComponent('/somewhere')}`);
  await expect(page.locator('#state-panel .state-text')).toHaveText('/somewhere');
  expect(await stateChildren(page)).toEqual(['DIV.orbit', 'P.state-title', 'P.state-text mono']);
});
