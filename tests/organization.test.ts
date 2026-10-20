// The organization cases in spec/analysis.md, spec/cli.md and spec/web.md, checked on what the real
// command and the real server answer for the organization JetBrains, recorded in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { run } from '../src/commands.ts';
import { createBrowserBackend } from '../src/browser.ts';
import { openGitHubOrganization, parseGitHubOrganizationUrl, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { createWebServer } from '../src/web/server.ts';
import { atlas, CLI, open } from './helpers.ts';

const organization = await atlas(['scan', 'https://github.com/JetBrains']);

/** `skill-atlas <args>` over a recording of its own, with a token: the organization cases need one. */
async function atlasOver(recording: Recording, args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fetch = replay(recording);
  const code = await run(args, {
    open: (input) => openGitHubOrganization(input, { fetch, token: 'test' }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** A server over the recordings, on a free port, closed after the test. */
async function server(t: TestContext): Promise<string> {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  return `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
}

test('an organization URL is an organization, a repository URL is not', () => {
  for (const input of ['https://github.com/JetBrains', 'github.com/JetBrains/', 'http://www.github.com/JetBrains']) {
    assert.deepEqual(parseGitHubOrganizationUrl(input), { owner: 'JetBrains' }, input);
    assert.equal(parseGitHubUrl(input), undefined, input);
  }
  assert.equal(parseGitHubOrganizationUrl('https://github.com/JetBrains/kotlin'), undefined);
});

test('scan <organization>: how many repositories, how many with skills, then each with its number of skills, most first', () => {
  assert.equal(organization.code, 0, organization.stderr);
  assert.equal(
    organization.stdout,
    [
      'JetBrains · 4 repositories, 2 with skills',
      'JetBrains/twins · 2 skills',
      '  https://github.com/JetBrains/twins',
      'JetBrains/example · 1 skill',
      '  https://github.com/JetBrains/example',
    ].join('\n'),
  );
});

test('organization: forks are left out; copies count once, shipped skills not, a SKILL.md outside SKILL_ROOTS makes no skill', () => {
  // twins has commits in two folders, broken, and a shipped bundled skill: 2 skills. docs-only has none.
  assert.match(organization.stdout, /^JetBrains\/twins · 2 skills$/m);
  assert.doesNotMatch(organization.stdout, /docs-only|empty|upstream-fork/);
  assert.match(organization.stdout, /^JetBrains · 4 repositories,/);
});

test('organization: a warning goes to stderr after its repository name, and the scan goes on', () => {
  assert.match(organization.stderr, /^warning: JetBrains\/twins: \.github\/skills\/broken\/SKILL\.md: malformed front matter: /);
  assert.equal(organization.stderr.split('\n').length, 1);
});

test('organization without GITHUB_TOKEN → a clear message, exit code 1', async () => {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const scanned = spawnSync(process.execPath, [CLI, 'scan', 'https://github.com/JetBrains'], { encoding: 'utf8', env });
  assert.equal(scanned.status, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'Scanning an organization needs GITHUB_TOKEN: GitHub code search finds its skills\n');
  // The browser has no token either.
  const browser = createBrowserBackend({ fetch: () => Promise.reject(new Error('offline')) });
  assert.equal(await browser.run('skill-atlas scan https://github.com/JetBrains'), 'Scanning an organization needs GITHUB_TOKEN: GitHub code search finds its skills');
});

test('unknown owner → a clear message, exit code 1', async () => {
  const unknown = await atlasOver({ 'https://api.github.com/users/nobody-here': { status: 404, body: { message: 'Not Found' } } }, [
    'scan',
    'https://github.com/nobody-here',
  ]);
  assert.deepEqual(unknown, { code: 1, stdout: '', stderr: 'Organization not found: https://github.com/nobody-here' });
});

test("a user's URL: their repositories, searched as a user's", async () => {
  const user = await atlasOver(
    {
      'https://api.github.com/users/someone': { status: 200, body: { login: 'someone', type: 'User', html_url: 'https://github.com/someone' } },
      'https://api.github.com/users/someone/repos?per_page=100&page=1': { status: 200, body: [{ full_name: 'someone/dotfiles', default_branch: 'main', fork: false }] },
      'https://api.github.com/search/code?q=filename:SKILL.md+user:someone&per_page=100&page=1': {
        status: 200,
        body: { total_count: 0, items: [] },
      },
    },
    ['scan', 'github.com/someone'],
  );
  assert.deepEqual(user, { code: 0, stdout: 'someone · 1 repository, 0 with skills', stderr: '' });
});

test('repositories: every page of them; more than 1000 SKILL.md → a warning, the scan goes on', async () => {
  const recording: Recording = {
    'https://api.github.com/users/Big': { status: 200, body: { login: 'Big', type: 'Organization', html_url: 'https://github.com/Big' } },
    'https://api.github.com/orgs/Big/repos?per_page=100&page=1': {
      status: 200,
      body: Array.from({ length: 100 }, (_, index) => ({ full_name: `Big/repo-${index}`, default_branch: 'main', fork: false })),
    },
    'https://api.github.com/orgs/Big/repos?per_page=100&page=2': { status: 200, body: [{ full_name: 'Big/last', default_branch: 'main', fork: false }] },
  };
  for (let page = 1; page <= 10; page++) {
    recording[`https://api.github.com/search/code?q=filename:SKILL.md+org:Big&per_page=100&page=${page}`] = {
      status: 200,
      body: {
        total_count: 1500,
        // Outside SKILL_ROOTS, so nothing needs to be read.
        items: Array.from({ length: 100 }, (_, index) => ({ path: `docs/${page}-${index}/SKILL.md`, repository: { full_name: 'Big/repo-0' } })),
      },
    };
  }
  const big = await atlasOver(recording, ['scan', 'https://github.com/Big']);
  assert.equal(big.code, 0, big.stderr);
  assert.equal(big.stdout, 'Big · 101 repositories, 0 with skills');
  assert.equal(big.stderr, 'warning: code search found 1500 SKILL.md files and returns only the first 1000; some skills may be missing');
});

test('web: an organization as JSON, each repository with its number of skills, the ones with skills first', async (t) => {
  const base = await server(t);
  const response = await fetch(`${base}/api/scan?source=${encodeURIComponent('https://github.com/JetBrains')}`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { warnings: string[] };
  assert.match(body.warnings[0], /^JetBrains\/twins: \.github\/skills\/broken\/SKILL\.md: malformed front matter: /);
  assert.deepEqual(
    { ...body, warnings: [] },
    {
      source: 'https://github.com/JetBrains',
      organization: { id: 'JetBrains', url: 'https://github.com/JetBrains' },
      repositories: [
        { id: 'JetBrains/twins', url: 'https://github.com/JetBrains/twins', skills: 2 },
        { id: 'JetBrains/example', url: 'https://github.com/JetBrains/example', skills: 1 },
        { id: 'JetBrains/docs-only', url: 'https://github.com/JetBrains/docs-only', skills: 0 },
        { id: 'JetBrains/empty', url: 'https://github.com/JetBrains/empty', skills: 0 },
      ],
      warnings: [],
    },
  );
});

test("web: a repository chosen from the organization → its skills", async (t) => {
  const base = await server(t);
  const response = await fetch(`${base}/api/scan?source=${encodeURIComponent('https://github.com/JetBrains/example')}`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { repository: { organization: string }; skills: { name: string }[] };
  assert.equal(body.repository.organization, 'JetBrains');
  assert.deepEqual(body.skills.map((skill) => skill.name), ['commits']);
});

test('web: an organization without GITHUB_TOKEN → 422 and the message', async (t) => {
  const web = createWebServer({ open: (input) => openGitHubOrganization(input, { fetch: replay({}) }) });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan?source=github.com/JetBrains`);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    source: 'github.com/JetBrains',
    error: 'Scanning an organization needs GITHUB_TOKEN: GitHub code search finds its skills',
  });
});
