// The skills map in spec/web.md, checked with the page's own module, as the server sends it, over the
// scans the real server answers: fixture/fixtures/skills-map, ./fixture and small directories made here.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { addressOf, readAddress } from '../src/web/page/address.js';
import { filterSkills, parseFilter } from '../src/web/page/filter.js';
import { mapSkills, nameWords } from '../src/web/page/map.js';
import { createWebServer } from '../src/web/server.ts';
import { FIXTURE, open } from './helpers.ts';

const SKILLS_MAP = join(FIXTURE, 'fixtures/skills-map');

type Skill = { name: string; description: string; path: string };
type SkillsMap = { groups: { word: string; skills: Skill[] }[]; alone: Skill[] };

/** A server over `source`, on a free port, closed after the test. */
async function server(t: TestContext, source?: string): Promise<string> {
  const web = createWebServer({ open, source });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  return `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
}

/** The skills of `source`, from the real server's /api/scan. */
async function skillsOf(t: TestContext, source: string): Promise<Skill[]> {
  const response = await fetch(`${await server(t, source)}/api/scan`);
  return ((await response.json()) as { skills: Skill[] }).skills;
}

/** A directory with a skill of each name, under .claude/skills. */
function repository(t: TestContext, names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of names) {
    mkdirSync(join(root, '.claude/skills', name), { recursive: true });
    writeFileSync(join(root, '.claude/skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: The ${name} skill.\n---\n`);
  }
  return root;
}

/** The map as words and names: `{ release: ['release-branch', …] }`, and the ones on their own. */
function shown(map: SkillsMap) {
  return {
    groups: map.groups.map(({ word, skills }) => [word, skills.map((skill) => skill.name)]),
    alone: map.alone.map((skill) => skill.name),
  };
}

test('the map: a group for each word two or more names share; the most skills first, then by word', async (t) => {
  const skills = await skillsOf(t, SKILLS_MAP);
  assert.deepEqual(shown(mapSkills(skills)), {
    groups: [
      ['release', ['release-branch', 'release-checklist', 'release-notes']],
      ['checklist', ['release-checklist', 'review-checklist']],
      ['code', ['code-review', 'code-style']],
      ['review', ['code-review', 'review-checklist']],
    ],
    alone: ['commits'],
  });
});

test('the map: a skill is in every group of its words, in the order of the list', async (t) => {
  const skills = await skillsOf(t, SKILLS_MAP);
  const groupsOf = (name: string) => mapSkills(skills).groups.filter((group: SkillsMap['groups'][number]) => group.skills.some((skill) => skill.name === name)).map((group: { word: string }) => group.word);
  assert.deepEqual(groupsOf('review-checklist'), ['checklist', 'review']);
  assert.deepEqual(groupsOf('commits'), []);
  // In the filter's order: the names with every word first.
  const filtered = filterSkills(skills, parseFilter('notes'));
  assert.deepEqual(filtered.map((skill: Skill) => skill.name), ['release-notes', 'release-checklist']);
  assert.deepEqual(shown(mapSkills(filtered)).groups, [['release', ['release-notes', 'release-checklist']]]);
});

test("a name's words: split at anything but a letter or a digit and at camelCase, case ignored, each once", () => {
  assert.deepEqual(nameWords('build-tools_bump.Gradle API'), ['build', 'tools', 'bump', 'gradle', 'api']);
  assert.deepEqual(nameWords('writeReleaseNotes'), ['write', 'release', 'notes']);
  assert.deepEqual(nameWords('HTTPServer-v2'), ['httpserver', 'v2']);
  assert.deepEqual(nameWords('Kotlin-kotlin-KOTLIN'), ['kotlin']);
  assert.deepEqual(nameWords('écrire-les-tests'), ['écrire', 'les', 'tests']);
});

test('the map: little words and one-letter ones never make a group', async (t) => {
  const skills = await skillsOf(t, repository(t, ['notes-for-the-release', 'tips-for-the-team', 'a-b', 'b-c', 'and-to', 'and-with']));
  assert.deepEqual(nameWords('notes-for-the-release'), ['notes', 'release']);
  assert.deepEqual(nameWords('a-b'), []);
  assert.deepEqual(shown(mapSkills(skills)), { groups: [], alone: ['a-b', 'and-to', 'and-with', 'b-c', 'notes-for-the-release', 'tips-for-the-team'] });
});

test('the map: camelCase and kebab-case names share their words; a word counts once per skill', async (t) => {
  const skills = await skillsOf(t, repository(t, ['releaseNotes', 'release-release-train', 'Release_Checks']));
  assert.deepEqual(shown(mapSkills(skills)), {
    groups: [['release', ['Release_Checks', 'release-release-train', 'releaseNotes']]],
    alone: [],
  });
});

test('the map: no word shared → every skill on its own; no skills → no groups', async (t) => {
  // ./fixture: code-style, commits, release-checklist, writing-lint-checks share no word.
  assert.deepEqual(shown(mapSkills(await skillsOf(t, FIXTURE))), {
    groups: [],
    alone: ['code-style', 'commits', 'release-checklist', 'writing-lint-checks'],
  });
  assert.deepEqual(shown(mapSkills([])), { groups: [], alone: [] });
});

test('the map in the URL: ?view=map, without a skill; the filter stays', () => {
  const address = addressOf('/', { source: 'x', skill: '.claude/skills/a/SKILL.md', filter: 'review', view: 'map' });
  assert.equal(address, '/?source=x&view=map&q=review');
  assert.deepEqual(readAddress(new URL(address, 'http://localhost').search), { source: 'x', skill: '', filter: 'review', view: 'map' });
  assert.equal(readAddress('?source=x&view=other').view, '');
  assert.equal(addressOf('/', { source: 'x', skill: 's', filter: '', view: '' }), '/?source=x&skill=s');
});

test('the page sends its map module', async (t) => {
  const base = await server(t, FIXTURE);
  const response = await fetch(`${base}/map.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.match(await (await fetch(`${base}/app.js`)).text(), /from '\.\/map\.js'/);
});
