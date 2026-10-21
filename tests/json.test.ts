// The JSON cases in spec/cli.md, checked on what the real command prints for ./fixture, for the
// repository JetBrains/example and for the organization JetBrains, recorded in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { createWebServer } from '../src/web/server.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const SCAN_USAGE = 'Usage: skill-atlas scan [--json] <GitHub URL | directory>';

/** The command's stdout, parsed: it has to be one JSON value and nothing else. */
function parsed(stdout: string) {
  return JSON.parse(stdout);
}

/** A server over the recordings, on a free port, closed after the test. */
async function server(t: TestContext): Promise<string> {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  return `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
}

test('scan --json <repository>: the source, the repository, each skill with its whole description and pinned link, the warnings', async () => {
  const example = await atlas(['scan', '--json', 'github.com/JetBrains/example']);
  assert.equal(example.code, 0, example.stderr);
  assert.equal(example.stderr, '');
  assert.deepEqual(parsed(example.stdout), {
    source: 'github.com/JetBrains/example',
    repository: { id: 'JetBrains/example', url: 'https://github.com/JetBrains/example', commit: EXAMPLE_COMMIT },
    skills: [
      {
        id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
        name: 'commits',
        description: 'Write commit messages the way this repository does. Use for every commit.',
        path: '.claude/skills/commits/SKILL.md',
        link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
        copies: [],
      },
    ],
    warnings: [],
  });
});

test('--json before or after the source: the same output', async () => {
  const before = await atlas(['scan', '--json', FIXTURE]);
  const after = await atlas(['scan', FIXTURE, '--json']);
  assert.equal(before.code, 0, before.stderr);
  assert.deepEqual(after, before);
});

test('scan --json <directory>: an empty commit, file:// links, copies, sorted as the text; no content', async () => {
  const root = pathToFileURL(FIXTURE).href;
  const fixture = await atlas(['scan', '--json', FIXTURE]);
  assert.equal(fixture.code, 0, fixture.stderr);
  const body = parsed(fixture.stdout);
  assert.equal(body.source, FIXTURE);
  assert.deepEqual(body.repository, { id: 'fixture', url: root, commit: '' });
  assert.deepEqual(
    body.skills.map((skill: { name: string }) => skill.name),
    ['code-style', 'commits', 'release-checklist', 'writing-lint-checks'],
  );
  assert.deepEqual(body.skills[1], {
    id: 'fixture:.agents/skills/commits/SKILL.md',
    name: 'commits',
    description: 'Write commit messages the way this repository does. Use for every commit.',
    path: '.agents/skills/commits/SKILL.md',
    link: `${root}/.agents/skills/commits/SKILL.md`,
    copies: ['.claude/skills/commits/SKILL.md'],
  });
  // Malformed front matter: the directory's name, no description.
  assert.equal(body.skills[2].name, 'release-checklist');
  assert.equal(body.skills[2].description, '');
});

test('warnings: in the JSON and on stderr; stdout stays only the JSON', async () => {
  const fixture = await atlas(['scan', '--json', FIXTURE]);
  const { warnings } = parsed(fixture.stdout);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  assert.equal(fixture.stderr, `warning: ${warnings[0]}`);
});

test('scan --json <organization>: every repository, those without skills too, most skills first; warnings in both', async () => {
  const organization = await atlas(['scan', '--json', 'https://github.com/JetBrains']);
  assert.equal(organization.code, 0, organization.stderr);
  const body = parsed(organization.stdout);
  assert.equal(body.warnings.length, 1);
  assert.match(body.warnings[0], /^JetBrains\/twins: \.github\/skills\/broken\/SKILL\.md: malformed front matter: /);
  assert.equal(organization.stderr, `warning: ${body.warnings[0]}`);
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

test("the same shape as the web view's /api/scan, minus the page's fields", async (t) => {
  const base = await server(t);
  for (const source of ['https://github.com/JetBrains', 'https://github.com/JetBrains/example', FIXTURE]) {
    const cli = parsed((await atlas(['scan', '--json', source])).stdout);
    const web = await (await fetch(`${base}/api/scan?source=${encodeURIComponent(source)}`)).json();
    assert.deepEqual(only(web, cli), cli, source);
  }
});

/** `value`, with only the fields `shape` has, at every depth. */
function only(value: unknown, shape: unknown): unknown {
  if (Array.isArray(shape) && Array.isArray(value)) return value.map((item, index) => only(item, shape[index]));
  if (shape && typeof shape === 'object' && value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(shape).map((key) => [key, only((value as Record<string, unknown>)[key], (shape as Record<string, unknown>)[key])]));
  }
  return value;
}

test('the CLI prints one JSON object to stdout, the warnings to stderr', () => {
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE, '--json'], { encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  const body = parsed(scanned.stdout);
  assert.equal(body.skills.length, 4);
  assert.match(scanned.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: .*\n$/);
});

test('a failure with --json → the message on stderr, exit code 1, nothing on stdout', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', '--json', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  const offline = await atlas(['scan', '--json', 'https://github.com/JetBrains/not-answered']);
  assert.deepEqual(offline, {
    code: 1,
    stdout: '',
    stderr: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered',
  });
});

test('--json=…, another flag, a second source or none → the usage, exit code 1', async () => {
  for (const args of [
    ['--json=true', FIXTURE],
    ['--pretty', FIXTURE],
    ['--json', '--json', FIXTURE],
    ['--json', FIXTURE, FIXTURE],
    ['--json'],
    [],
  ]) {
    assert.deepEqual(await atlas(['scan', ...args]), { code: 1, stdout: '', stderr: SCAN_USAGE }, args.join(' '));
  }
});

test('help: scan --json', async () => {
  const help = await atlas(['help']);
  assert.match(help.stdout, /^ {2}scan <GitHub URL \| directory> /m);
  assert.match(help.stdout, /^ +\[--json\] +the same, as one JSON object/m);
});
