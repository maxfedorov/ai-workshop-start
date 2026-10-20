// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE and ORGANIZATION below.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, openGitHubOrganization, parseGitHubOrganizationUrl, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import type { OrganizationSource, Source } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/** The commit GitHub answers for JetBrains/twins. */
export const TWINS_COMMIT = '9f1c2e4b7a3d6058e1b2c3d4e5f60718293a4b5c';

const COMMITS = '---\nname: commits\ndescription: Write commit messages the way this repository does.\n---\n# Commits\n';

/**
 * What GitHub answers for the organization JetBrains: example (the repository above, 1 skill),
 * twins (2 skills: one of them in two folders, one with malformed front matter, and a shipped
 * SKILL.md that is not counted), docs-only (a SKILL.md outside SKILL_ROOTS) and empty; and
 * upstream-fork, a fork, which is left out.
 */
const ORGANIZATION: Recording = {
  'https://api.github.com/users/JetBrains': {
    status: 200,
    body: { login: 'JetBrains', type: 'Organization', html_url: 'https://github.com/JetBrains' },
  },
  'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': {
    status: 200,
    body: [
      { full_name: 'JetBrains/docs-only', default_branch: 'main', fork: false },
      { full_name: 'JetBrains/empty', default_branch: 'main', fork: false },
      { full_name: 'JetBrains/example', default_branch: 'main', fork: false },
      { full_name: 'JetBrains/twins', default_branch: 'master', fork: false },
      { full_name: 'JetBrains/upstream-fork', default_branch: 'main', fork: true },
    ],
  },
  'https://api.github.com/search/code?q=filename:SKILL.md+org:JetBrains&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 6,
      items: [
        { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/example' } },
        { path: '.agents/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/twins' } },
        { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/twins' } },
        { path: '.github/skills/broken/SKILL.md', repository: { full_name: 'JetBrains/twins' } },
        { path: 'src/main/resources/.claude/skills/bundled/SKILL.md', repository: { full_name: 'JetBrains/twins' } },
        { path: 'docs/skills/guide/SKILL.md', repository: { full_name: 'JetBrains/docs-only' } },
      ],
    },
  },
  'https://api.github.com/repos/JetBrains/twins/commits/master': { status: 200, body: { sha: TWINS_COMMIT } },
  [`https://raw.githubusercontent.com/JetBrains/twins/${TWINS_COMMIT}/.agents/skills/commits/SKILL.md`]: { status: 200, body: COMMITS },
  [`https://raw.githubusercontent.com/JetBrains/twins/${TWINS_COMMIT}/.claude/skills/commits/SKILL.md`]: { status: 200, body: COMMITS },
  [`https://raw.githubusercontent.com/JetBrains/twins/${TWINS_COMMIT}/.github/skills/broken/SKILL.md`]: {
    status: 200,
    body: '---\nname: broken\ndescription: a: b: c\n---\n',
  },
};

const github = replay({ ...EXAMPLE, ...ORGANIZATION });

/** Opens a GitHub URL or a directory as the CLI does, with GitHub answering from the recordings. */
export function open(input: string): Promise<Source | OrganizationSource> {
  // With a token, through code search, as the recordings answer it.
  if (parseGitHubUrl(input)) return openGitHub(input, { fetch: github, token: 'test' });
  if (parseGitHubOrganizationUrl(input)) return openGitHubOrganization(input, { fetch: github, token: 'test' });
  return openDirectory(input);
}

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from the recordings. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
