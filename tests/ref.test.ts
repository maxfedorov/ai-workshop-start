// The decisions in spec/analysis.md § Branch, tag or commit, and the header of spec/cli.md and
// spec/web.md: a repository scanned at a ref, through the real command and the real server, with
// GitHub answering JetBrains/example's refs from the recording in tests/helpers.ts.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { openGitHub, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { createWebServer } from '../src/web/server.ts';
import { atlas, BRANCH_COMMIT, EXAMPLE_COMMIT, GITHUB, open } from './helpers.ts';

const EXAMPLE = 'https://github.com/JetBrains/example';
const link = (commit: string, path: string) => `${EXAMPLE}/blob/${commit}/${path}`;

/** What the commit-skill line and its link look like at the default branch's commit. */
const AT_EXAMPLE_COMMIT = [
  'commits — Write commit messages the way this repository does.',
  `  ${link(EXAMPLE_COMMIT, '.claude/skills/commits/SKILL.md')}`,
];

test('a branch: its skills as they are there, linked to its commit, the branch in the header', async () => {
  const scanned = await atlas(['scan', `${EXAMPLE}/tree/feature/x`]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/example @ feature/x · 2 skills',
      'commits — Write commit messages in the imperative.',
      `  ${link(BRANCH_COMMIT, '.claude/skills/commits/SKILL.md')}`,
      'review — Review a pull request before it merges.',
      `  ${link(BRANCH_COMMIT, '.agents/skills/review/SKILL.md')}`,
    ].join('\n'),
  );
  assert.equal(scanned.stderr, '');
});

test('a branch with a slash and a path after it: the longest prefix that names a commit; the path is ignored', async () => {
  // feature/x/docs is asked for first and names nothing; feature is never asked for: it is not recorded.
  const scanned = await atlas(['scan', `${EXAMPLE}/tree/feature/x/docs`]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout.split('\n')[0], 'JetBrains/example @ feature/x · 2 skills');
  // A path that starts with a dot is never part of a ref: feature/x is the only one asked for.
  const source = await openGitHub(`${EXAMPLE}/tree/feature/x/.agents/skills/review`, { fetch: GITHUB });
  assert.equal(source.repository.ref, 'feature/x');
  assert.equal(source.repository.commit, BRANCH_COMMIT);
});

test('a tag: the repository at its commit', async () => {
  const scanned = await atlas(['scan', `${EXAMPLE}/tree/v1.0`]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains/example @ v1.0 · 1 skill', ...AT_EXAMPLE_COMMIT].join('\n'));
});

test('a commit, by its whole SHA or a short one: the repository at that commit', async () => {
  const whole = await atlas(['scan', `${EXAMPLE}/commit/${EXAMPLE_COMMIT}`]);
  assert.equal(whole.code, 0, whole.stderr);
  assert.equal(whole.stdout, [`JetBrains/example @ ${EXAMPLE_COMMIT} · 1 skill`, ...AT_EXAMPLE_COMMIT].join('\n'));
  const short = await atlas(['scan', `${EXAMPLE}/commit/5ab6270`]);
  assert.equal(short.stdout, ['JetBrains/example @ 5ab6270 · 1 skill', ...AT_EXAMPLE_COMMIT].join('\n'));
});

test('a pinned link Skill Atlas printed: the repository at that commit', async () => {
  const printed = link(EXAMPLE_COMMIT, '.claude/skills/commits/SKILL.md');
  const scanned = await atlas(['scan', printed]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, [`JetBrains/example @ ${EXAMPLE_COMMIT} · 1 skill`, ...AT_EXAMPLE_COMMIT].join('\n'));
  assert.equal(scanned.stdout.split('\n')[2], `  ${printed}`);
});

test("a query or a fragment, as GitHub's pages add them: ignored", async () => {
  for (const [input, ref] of [
    [`${EXAMPLE}/commit/${EXAMPLE_COMMIT}#diff-0123abcd`, EXAMPLE_COMMIT],
    [`${EXAMPLE}/commit/${EXAMPLE_COMMIT}?diff=split`, EXAMPLE_COMMIT],
    [`${EXAMPLE}/tree/v1.0?tab=readme-ov-file`, 'v1.0'],
    [`${EXAMPLE}/tree/v1.0/?tab=readme-ov-file#readme`, 'v1.0'],
    [`${link(EXAMPLE_COMMIT, '.claude/skills/commits/SKILL.md')}#L5`, EXAMPLE_COMMIT],
  ]) {
    const scanned = await atlas(['scan', input]);
    assert.equal(scanned.code, 0, `${input}: ${scanned.stderr}`);
    assert.equal(scanned.stdout, [`JetBrains/example @ ${ref} · 1 skill`, ...AT_EXAMPLE_COMMIT].join('\n'), input);
  }
  const plain = await atlas(['scan', `${EXAMPLE}?tab=readme-ov-file`]);
  assert.equal(plain.code, 0, plain.stderr);
  assert.equal(plain.stdout.split('\n')[0], 'JetBrains/example · 1 skill');
});

test('the default branch by name: the same as the repository URL', async () => {
  const byName = await atlas(['scan', `${EXAMPLE}/tree/main`]);
  assert.equal(byName.code, 0, byName.stderr);
  assert.equal(byName.stdout, (await atlas(['scan', EXAMPLE])).stdout);
  assert.equal(byName.stdout.split('\n')[0], 'JetBrains/example · 1 skill');
});

test('unknown ref → a clear message, exit code 1; 422 from the server', async (t) => {
  for (const [input, ref] of [[`${EXAMPLE}/tree/nope`, 'nope'], [`${EXAMPLE}/commit/0000000`, '0000000'], [`${EXAMPLE}/blob/nope/.claude/skills/x/SKILL.md`, 'nope']]) {
    const scanned = await atlas(['scan', input]);
    assert.equal(scanned.code, 1, input);
    assert.equal(scanned.stdout, '');
    assert.equal(scanned.stderr, `Branch, tag or commit not found: ${ref} in JetBrains/example`, input);
  }

  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const source = `${EXAMPLE}/tree/nope`;
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan?source=${encodeURIComponent(source)}`);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { source, error: 'Branch, tag or commit not found: nope in JetBrains/example' });
});

/** A fetch over the recordings that notes every URL asked for. */
function noting(): { fetch: Fetch; asked: string[] } {
  const asked: string[] = [];
  return { asked, fetch: (url, init) => (asked.push(url), GITHUB(url, init)) };
}

test('with GITHUB_TOKEN, a ref other than the default branch is listed from the tree, never by code search', async () => {
  const branch = noting();
  const source = await openGitHub(`${EXAMPLE}/tree/feature/x`, { fetch: branch.fetch, token: 'test' });
  assert.deepEqual(source.paths, ['README.md', '.agents/skills/review/SKILL.md', '.claude/skills/commits/SKILL.md']);
  assert.ok(branch.asked.includes(`https://api.github.com/repos/JetBrains/example/git/trees/${BRANCH_COMMIT}?recursive=1`));
  assert.deepEqual(branch.asked.filter((url) => url.includes('/search/')), []);

  // The default branch, by name, still is.
  const main = noting();
  await openGitHub(`${EXAMPLE}/tree/main`, { fetch: main.fetch, token: 'test' });
  assert.equal(main.asked.filter((url) => url.includes('/search/')).length, 1);
});

test('a ref whose tree is too large: only the skill roots, with a warning, even with GITHUB_TOKEN', async () => {
  const branch = noting();
  const source = await openGitHub(`${EXAMPLE}/tree/huge`, { fetch: branch.fetch, token: 'test' });
  assert.deepEqual(source.paths, ['.claude/skills/commits/SKILL.md']);
  assert.deepEqual(source.warnings, [
    'the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (code search covers only the default branch)',
  ]);
  assert.deepEqual(branch.asked.filter((url) => url.includes('/search/')), []);

  const scanned = await atlas(['scan', `${EXAMPLE}/tree/huge`]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout.split('\n')[0], 'JetBrains/example @ huge · 1 skill');
  assert.match(scanned.stderr, /^warning: the tree is too large to list at once; /);
});

test('parseGitHubUrl: the ref forms GitHub links use; anything else is not a repository URL', () => {
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/example'), { owner: 'JetBrains', repo: 'example', refs: [] });
  assert.deepEqual(parseGitHubUrl('https://github.com/JetBrains/example.git/'), { owner: 'JetBrains', repo: 'example', refs: [] });
  assert.deepEqual(parseGitHubUrl(`${EXAMPLE}/tree/feature/x/docs/`), { owner: 'JetBrains', repo: 'example', refs: ['feature/x/docs', 'feature/x', 'feature'] });
  assert.deepEqual(parseGitHubUrl(`${EXAMPLE}/blob/feature/x/docs/SKILL.md`), { owner: 'JetBrains', repo: 'example', refs: ['feature/x/docs', 'feature/x', 'feature'] });
  assert.deepEqual(parseGitHubUrl(`${EXAMPLE}/blob/v1.0/.claude/skills/x/SKILL.md`), { owner: 'JetBrains', repo: 'example', refs: ['v1.0'] });
  assert.deepEqual(parseGitHubUrl(`${EXAMPLE}/commit/5ab6270`), { owner: 'JetBrains', repo: 'example', refs: ['5ab6270'] });
  for (const input of [`${EXAMPLE}/tree`, `${EXAMPLE}/tree/.agents`, `${EXAMPLE}/blob/main`, `${EXAMPLE}/commit/a/b`, `${EXAMPLE}/pulls`, `${EXAMPLE}/issues/35`]) {
    assert.equal(parseGitHubUrl(input), undefined, input);
  }
});

test('the scan as JSON: the ref beside the commit, and the source kept as typed', async (t: TestContext) => {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const base = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  const source = `${EXAMPLE}/tree/feature/x`;
  const response = await fetch(`${base}/api/scan?source=${encodeURIComponent(source)}`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { source: string; repository: unknown; skills: { link: string }[] };
  assert.equal(body.source, source);
  assert.deepEqual(body.repository, { id: 'JetBrains/example', organization: 'JetBrains', name: 'example', url: EXAMPLE, commit: BRANCH_COMMIT, ref: 'feature/x' });
  assert.deepEqual(body.skills.map((skill) => skill.link), [link(BRANCH_COMMIT, '.claude/skills/commits/SKILL.md'), link(BRANCH_COMMIT, '.agents/skills/review/SKILL.md')]);

  const atDefault = (await (await fetch(`${base}/api/scan?source=${encodeURIComponent(EXAMPLE)}`)).json()) as { repository: { ref: string } };
  assert.equal(atDefault.repository.ref, '');
});
