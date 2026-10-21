// The filter in spec/web.md, checked with the page's own modules, as the server sends them, over the
// scan of ./fixture the real server answers.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { addressOf, readAddress } from '../src/web/page/address.js';
import { filterRepositories, filterSkills, marked, markParts, parseFilter } from '../src/web/page/filter.js';
import { createWebServer } from '../src/web/server.ts';
import { FIXTURE, open } from './helpers.ts';

type Skill = { name: string; description: string; summary: string; path: string };

/** The fixture's skills, from the real server's /api/scan. */
async function fixtureSkills(t: TestContext): Promise<Skill[]> {
  const web = createWebServer({ open, source: FIXTURE });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan`);
  return ((await response.json()) as { skills: Skill[] }).skills;
}

/** The names the filter leaves, in the order the page lists them. */
function shown(skills: Skill[], text: string): string[] {
  return filterSkills(skills, parseFilter(text)).map((skill: Skill) => skill.name);
}

const ALL = ['code-style', 'commits', 'release-checklist', 'writing-lint-checks'];

test('the filter: every word, in the name, description or path, whatever the case', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(shown(skills, ''), ALL);
  assert.deepEqual(shown(skills, 'WRITE   Use'), ['commits', 'writing-lint-checks']);
  assert.deepEqual(shown(skills, 'write tag'), []);
  assert.deepEqual(shown(skills, '.github'), ['code-style']);
});

test('the filter: "a phrase" as a whole; an unclosed quote runs to the end; a quote ends a word', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(shown(skills, '"commit messages"'), ['commits']);
  assert.deepEqual(shown(skills, '"messages commit"'), []);
  assert.deepEqual(shown(skills, '"lint check'), ['writing-lint-checks']);
  assert.deepEqual(parseFilter('tag:"code style" foo"bar baz"').map((term: { text: string }) => term.text), ['tag:', 'code style', 'foo', 'bar baz']);
  assert.deepEqual(shown(skills, 'project\'s"code style"'), ['code-style']);
});

test('the filter: -word and -"a phrase" hide the skills that have it', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(shown(skills, 'use -kotlin'), ['commits', 'writing-lint-checks']);
  assert.deepEqual(shown(skills, '-"code style"'), ['commits', 'release-checklist', 'writing-lint-checks']);
  assert.deepEqual(shown(skills, '-path:.agents'), ['code-style', 'writing-lint-checks']);
});

test('the filter: name:, description:, path: search only that field; any other x: is a plain word', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(shown(skills, 'commit'), ['commits', 'code-style']);
  assert.deepEqual(shown(skills, 'name:commit'), ['commits']);
  assert.deepEqual(shown(skills, 'Description:lint'), ['writing-lint-checks']);
  assert.deepEqual(shown(skills, 'path:.agents'), ['commits', 'release-checklist']);
  assert.deepEqual(shown(skills, 'path:"skills/code-"'), ['code-style']);
  assert.deepEqual(shown(skills, 'tag:release'), []);
  assert.deepEqual(parseFilter('tag:release'), [{ text: 'tag:release', field: undefined, exclude: false }]);
});

test('the filter: a lone -, "" or an empty name: is ignored', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(parseFilter('- "" name: -path:'), []);
  assert.deepEqual(shown(skills, '- "" name:'), ALL);
});

test('the filter: skills whose name has every word come first, otherwise the scan order', async (t) => {
  const skills = await fixtureSkills(t);
  assert.deepEqual(shown(skills, 'writ'), ['writing-lint-checks', 'commits']);
  assert.deepEqual(shown(skills, 'commit'), ['commits', 'code-style']);
  assert.deepEqual(shown(skills, 'commit use'), ['code-style', 'commits']);
  assert.deepEqual(shown(skills, 'description:use'), ['code-style', 'commits', 'writing-lint-checks']);
});

test('the filter: matches are marked only in the fields they were searched in, exclusions never', () => {
  const terms = parseFilter('name:commit "Lint check" -kotlin path:.agents');
  assert.deepEqual(terms, [
    { text: 'commit', field: 'name', exclude: false },
    { text: 'lint check', field: undefined, exclude: false },
    { text: 'kotlin', field: undefined, exclude: true },
    { text: '.agents', field: 'path', exclude: false },
  ]);
  assert.deepEqual(marked(terms, 'name'), ['commit', 'lint check']);
  assert.deepEqual(marked(terms, 'description'), ['lint check']);
  assert.deepEqual(marked(terms, 'path'), ['lint check', '.agents']);
});

test('the filter: a word that starts another → the longer one is marked whole, in either order', async (t) => {
  /** The field with its marks in [brackets], as the page marks them. */
  const shown = (text: string, filter: string) => markParts(text, marked(parseFilter(filter), 'name')).map((part: string, index: number) => (index % 2 ? `[${part}]` : part)).join('');
  const codeStyle = (await fixtureSkills(t)).find((skill) => skill.name === 'code-style')!;
  for (const filter of ['co code', 'code co']) {
    assert.deepEqual(filterSkills([codeStyle], parseFilter(filter)), [codeStyle]);
    assert.equal(shown(codeStyle.name, filter), '[code]-style');
    assert.equal(shown(codeStyle.summary, filter), "Follow the project's [code] style.");
    assert.equal(shown(codeStyle.path, filter), '.github/skills/[code]-style/SKILL.md');
  }
  assert.equal(shown('Code, co-op', 'co code'), '[Code], [co]-op');
  assert.equal(shown('a.b', '.'), 'a[.]b');
  assert.equal(shown('code', ''), 'code');
});

test('the filter in the URL: ?q=…, next to the source and the skill', () => {
  const state = { source: 'https://github.com/o/r', skill: '.claude/skills/a/SKILL.md', filter: 'name:"a b" -c', view: '' };
  const address = addressOf('/', state);
  assert.equal(address, '/?source=https%3A%2F%2Fgithub.com%2Fo%2Fr&skill=.claude%2Fskills%2Fa%2FSKILL.md&q=name%3A%22a+b%22+-c');
  assert.deepEqual(readAddress(new URL(address, 'http://localhost').search), state);
  assert.equal(addressOf('/', { source: 'x', skill: '', filter: '  ' }), '/?source=x');
  assert.equal(addressOf('/', { source: '', skill: '', filter: '' }), '/');
  assert.deepEqual(readAddress('?source=x'), { source: 'x', skill: '', filter: '', view: '' });
});

test('the page sends its filter and address modules', async (t) => {
  const web = createWebServer({ open, source: FIXTURE });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const base = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  for (const path of ['/filter.js', '/address.js']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  }
  assert.match(await (await fetch(`${base}/app.js`)).text(), /from '\.\/filter\.js'/);
});

type Repository = { id: string; skills: number };

/** The recorded organization JetBrains, from the real server's /api/scan. */
async function organizationRepositories(t: TestContext): Promise<Repository[]> {
  const web = createWebServer({ open });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const response = await fetch(`http://127.0.0.1:${(web.address() as AddressInfo).port}/api/scan?source=https://github.com/JetBrains`);
  return ((await response.json()) as { repositories: Repository[] }).repositories;
}

test("the organization's filter: the name as name:, owner/name as path:; the ones with skills still first", async (t) => {
  const repositories = await organizationRepositories(t);
  const ids = (text: string) => filterRepositories(repositories, parseFilter(text)).map((repository: Repository) => repository.id);
  assert.deepEqual(ids(''), ['JetBrains/twins', 'JetBrains/example', 'JetBrains/docs-only', 'JetBrains/empty']);
  // "e" is in every path (JetBrains): the ones with skills stay first, empty (no skills) after twins;
  // within each, the names with an "e" first.
  assert.deepEqual(ids('e'), ['JetBrains/example', 'JetBrains/twins', 'JetBrains/empty', 'JetBrains/docs-only']);
  assert.deepEqual(ids('name:e'), ['JetBrains/example', 'JetBrains/empty']);
  assert.deepEqual(ids('name:jetbrains'), []);
  assert.deepEqual(ids('path:jetbrains/t'), ['JetBrains/twins']);
  assert.deepEqual(ids('-"docs-only" -empty'), ['JetBrains/twins', 'JetBrains/example']);
  assert.deepEqual(ids('description:docs'), []);
});
