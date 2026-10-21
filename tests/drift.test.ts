// The drifted copies of spec/analysis.md, spec/cli.md and spec/web.md: the same skill directory under
// two roots, edited apart. Checked through the real command on fixture/fixtures/drifted, on a GitHub
// repository and an organization answered from recordings, on directories made for one case, and on
// the real server.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { run } from '../src/commands.ts';
import { diffLines } from '../src/core/diff.ts';
import { openGitHub, openGitHubOrganization, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { mapSkills } from '../src/web/page/map.js';
import { createWebServer } from '../src/web/server.ts';
import { atlas, open } from './helpers.ts';

const DRIFTED = fileURLToPath(new URL('../fixture/fixtures/drifted', import.meta.url));
const ROOT = pathToFileURL(DRIFTED).href;

const OWN = '---\nname: commits\ndescription: Write commit messages the way this repository does.\n---\n# Commits\n';
const EDITED = '---\nname: commits\ndescription: Write commit messages the way this team does.\nmodel: sonnet\n---\n# Commits\n\nKeep it short.\n';

/** `skill-atlas <args>` over a recording of its own, with a token. */
async function atlasOver(recording: Recording, args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fetch = replay(recording);
  const code = await run(args, {
    open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token: 'test' }) : openGitHubOrganization(input, { fetch, token: 'test' })),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** A directory with these files, removed after the test. */
function directory(t: TestContext, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('drifted copies, a local directory: one skill, each drifted path with how it differs, and a warning', async () => {
  const scanned = await atlas(['scan', DRIFTED]);
  assert.equal(scanned.code, 0, scanned.stderr);
  const how = 'description differs; front matter keys differ: allowed-tools; body differs (+1 −0 lines)';
  assert.equal(
    scanned.stdout,
    [
      'drifted · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${ROOT}/.agents/skills/code-style/SKILL.md`,
      "code-style — Follow the module's code style.",
      `  ${ROOT}/module/.claude/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${ROOT}/.agents/skills/commits/SKILL.md`,
      `  drifted: .claude/skills/commits/SKILL.md (${how})`,
      `  drifted: .github/skills/commits/SKILL.md (${how})`,
    ].join('\n'),
  );
  assert.equal(scanned.stderr, 'warning: .agents/skills/commits/SKILL.md: drifted from .claude/skills/commits/SKILL.md, .github/skills/commits/SKILL.md');
});

test('different ancestors, a monorepo’s modules → two skills, not drifted', async () => {
  const scanned = await atlas(['scan', DRIFTED]);
  assert.equal(scanned.stdout.match(/^code-style — /gm)?.length, 2);
  assert.doesNotMatch(scanned.stderr, /code-style/);
});

test('drifted copies keep the byte-identical ones as copies, and the name and description of the first path', async (t) => {
  const root = directory(t, {
    '.agents/skills/commits/SKILL.md': OWN,
    '.claude/skills/commits/SKILL.md': EDITED,
    'agent/skills/commits/SKILL.md': OWN,
  });
  const scanned = await atlas(['scan', root]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(scanned.stdout.split('\n').slice(1).filter((line) => !line.startsWith('  file:')), [
    'commits — Write commit messages the way this repository does.',
    '  also in agent/skills/commits/SKILL.md',
    '  drifted: .claude/skills/commits/SKILL.md (description differs; front matter keys differ: model; body differs (+2 −0 lines))',
  ]);
  assert.match(scanned.stdout, /^[^\n]+ · 1 skill\n/);
});

test('how they differ: the name, removed and changed keys, removed lines; nothing of these → only formatting', async (t) => {
  const root = directory(t, {
    '.agents/skills/a/SKILL.md': '---\nname: a\ndescription: A.\nmodel: opus\nlicense: MIT\n---\nOne.\nTwo.\nThree.\n',
    '.claude/skills/a/SKILL.md': '---\nname: renamed\ndescription: A.\nmodel: sonnet\n---\nOne.\nThree.\n',
    '.agents/skills/b/SKILL.md': '---\nname: b\ndescription: B.\n---\nBody.\n',
    '.github/skills/b/SKILL.md': '---\ndescription: B.\nname: b\n---\n\nBody.\n\n',
  });
  const scanned = await atlas(['scan', root]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^ {2}drifted: \.claude\/skills\/a\/SKILL\.md \(name differs; front matter keys differ: license, model; body differs \(\+0 −1 lines\)\)$/m);
  assert.match(scanned.stdout, /^ {2}drifted: \.github\/skills\/b\/SKILL\.md \(only formatting differs\)$/m);
  assert.equal(
    scanned.stderr,
    [
      'warning: .agents/skills/a/SKILL.md: drifted from .claude/skills/a/SKILL.md',
      'warning: .agents/skills/b/SKILL.md: drifted from .github/skills/b/SKILL.md',
    ].join('\n'),
  );
});

test('a drifted pair in a module, one of them byte-identical to a copy elsewhere → still drifted', async (t) => {
  const skill = (description: string) => `---\nname: x\ndescription: ${description}\n---\nbody\n`;
  const root = directory(t, {
    '.agents/skills/x/SKILL.md': skill('A'),
    'module/.agents/skills/x/SKILL.md': skill('A'),
    'module/.claude/skills/x/SKILL.md': skill('B'),
  });
  const scanned = await atlas(['scan', root]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(scanned.stdout.split('\n').filter((line) => !line.startsWith('  file:')), [
    `${scanned.stdout.split(' · ')[0]} · 1 skill`,
    'x — A',
    '  also in module/.agents/skills/x/SKILL.md',
    '  drifted: module/.claude/skills/x/SKILL.md (description differs)',
  ]);
  assert.equal(scanned.stderr, 'warning: .agents/skills/x/SKILL.md: drifted from module/.claude/skills/x/SKILL.md');
});

const DRIFT_COMMIT = '0c1d2e3f405162738495a6b7c8d9e0f1a2b3c4d5';

/** JetBrains/drift: commits in .agents and .claude, edited apart. */
const DRIFT: Recording = {
  'https://api.github.com/repos/JetBrains/drift': { status: 200, body: { full_name: 'JetBrains/drift', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/drift/commits/main': { status: 200, body: { sha: DRIFT_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/drift&per_page=100&page=1': {
    status: 200,
    body: { total_count: 2, items: [{ path: '.claude/skills/commits/SKILL.md' }, { path: '.agents/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/drift/${DRIFT_COMMIT}/.agents/skills/commits/SKILL.md`]: { status: 200, body: OWN },
  [`https://raw.githubusercontent.com/JetBrains/drift/${DRIFT_COMMIT}/.claude/skills/commits/SKILL.md`]: { status: 200, body: EDITED },
};

test('drifted copies, a GitHub repository: one skill, its drifted copy and the warning', async () => {
  const scanned = await atlasOver(DRIFT, ['scan', 'https://github.com/JetBrains/drift']);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/drift · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/drift/blob/${DRIFT_COMMIT}/.agents/skills/commits/SKILL.md`,
      '  drifted: .claude/skills/commits/SKILL.md (description differs; front matter keys differ: model; body differs (+2 −0 lines))',
    ].join('\n'),
  );
  assert.equal(scanned.stderr, 'warning: .agents/skills/commits/SKILL.md: drifted from .claude/skills/commits/SKILL.md');
});

test('drifted copies, an organization: the group counts once, its warning names the drifted paths', async () => {
  const scanned = await atlasOver(
    {
      ...DRIFT,
      'https://api.github.com/users/JetBrains': { status: 200, body: { login: 'JetBrains', type: 'Organization', html_url: 'https://github.com/JetBrains' } },
      'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': { status: 200, body: [{ full_name: 'JetBrains/drift', default_branch: 'main', fork: false }] },
      'https://api.github.com/search/code?q=filename:SKILL.md+org:JetBrains&per_page=100&page=1': {
        status: 200,
        body: {
          total_count: 2,
          items: [
            { path: '.agents/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/drift' } },
            { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/drift' } },
          ],
        },
      },
    },
    ['scan', 'https://github.com/JetBrains'],
  );
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 1 repository, 1 with skills', 'JetBrains/drift · 1 skill', '  https://github.com/JetBrains/drift'].join('\n'));
  assert.equal(scanned.stderr, 'warning: JetBrains/drift: .agents/skills/commits/SKILL.md: drifted from .claude/skills/commits/SKILL.md');
});

test('web: each drifted copy as JSON, with its link, how it differs and the line diff', async (t) => {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan?source=${encodeURIComponent(DRIFTED)}`);
  assert.equal(response.status, 200);
  type Drifted = { path: string; link: string; differences: string[]; diff: { kind: string; text: string }[] };
  const body = (await response.json()) as { skills: { name: string; path: string; drifted: Drifted[] }[]; warnings: string[] };
  assert.deepEqual(body.skills.map((skill) => [skill.path, skill.drifted.length]), [
    ['.agents/skills/code-style/SKILL.md', 0],
    ['module/.claude/skills/code-style/SKILL.md', 0],
    ['.agents/skills/commits/SKILL.md', 2],
  ]);
  const [claude, github] = body.skills[2].drifted;
  assert.equal(claude.path, '.claude/skills/commits/SKILL.md');
  assert.equal(claude.link, `${ROOT}/.claude/skills/commits/SKILL.md`);
  assert.equal(github.path, '.github/skills/commits/SKILL.md');
  assert.deepEqual(claude.differences, ['description differs', 'front matter keys differ: allowed-tools', 'body differs (+1 −0 lines)']);
  assert.deepEqual(claude.diff.filter((line) => line.kind !== 'same'), [
    { kind: 'removed', text: 'description: Write commit messages the way this repository does. Use for every commit.' },
    { kind: 'added', text: 'description: Write commit messages the way this team does. Use for every commit and every pull request.' },
    { kind: 'added', text: 'allowed-tools: Bash(git commit:*)' },
    { kind: 'added', text: 'Keep the subject under 72 characters.' },
  ]);
  assert.equal(claude.diff.length, 11);
  assert.deepEqual(body.warnings, ['.agents/skills/commits/SKILL.md: drifted from .claude/skills/commits/SKILL.md, .github/skills/commits/SKILL.md']);
});

test('the skills map: a drifted group once, as in the list', async (t) => {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan?source=${encodeURIComponent(DRIFTED)}`);
  const { skills } = (await response.json()) as { skills: { name: string; path: string }[] };
  const { groups, alone } = mapSkills(skills);
  assert.deepEqual(groups.map((group: { word: string; skills: { path: string }[] }) => [group.word, group.skills.map((skill) => skill.path)]), [
    ['code', ['.agents/skills/code-style/SKILL.md', 'module/.claude/skills/code-style/SKILL.md']],
    ['style', ['.agents/skills/code-style/SKILL.md', 'module/.claude/skills/code-style/SKILL.md']],
  ]);
  assert.deepEqual(alone.map((skill: { path: string }) => skill.path), ['.agents/skills/commits/SKILL.md']);
});

test('diffLines: the common lines kept, removals before additions', () => {
  assert.deepEqual(diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']), [
    { kind: 'same', text: 'a' },
    { kind: 'removed', text: 'b' },
    { kind: 'added', text: 'x' },
    { kind: 'same', text: 'c' },
    { kind: 'same', text: 'd' },
    { kind: 'added', text: 'e' },
  ]);
  assert.deepEqual(diffLines([], ['a']), [{ kind: 'added', text: 'a' }]);
  assert.deepEqual(diffLines(['a', 'a'], ['a']), [{ kind: 'same', text: 'a' }, { kind: 'removed', text: 'a' }]);
});
