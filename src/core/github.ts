import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { OrganizationSource, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** A repository, and the branch, tag or commit its URL may name. */
export type GitHubUrl = {
  owner: string;
  repo: string;
  /** What the ref may be, longest first: a branch name can hold a `/`. None for the default branch. */
  refs: string[];
};

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`; or, as
 * GitHub's pages link it, at a ref: `…/tree/<ref>[/<path>]`, `…/commit/<sha>` or `…/blob/<ref>/<path>`.
 * A query or a fragment, `?tab=…` or `#diff-…`, is not part of it.
 */
export function parseGitHubUrl(input: string): GitHubUrl | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:(?:\.git)?|\/(tree|commit|blob)\/([^\s?#]+?))\/?(?:[?#]\S*)?$/i.exec(input.trim());
  if (!match) return undefined;
  const [, owner, repo, kind, rest] = match;
  if (!kind) return { owner, repo, refs: [] };
  const segments = rest.split('/').filter(Boolean).map(decode);
  if (kind === 'commit' && segments.length !== 1) return undefined;
  // A blob's path names a file, so at least its last segment is not the ref. No segment of a ref
  // starts with a dot, so neither does any of what is left after one.
  const dot = segments.findIndex((segment) => segment.startsWith('.'));
  const end = Math.min(kind === 'blob' ? segments.length - 1 : segments.length, dot === -1 ? Infinity : dot);
  const refs = segments.slice(0, end).map((_, index) => segments.slice(0, end - index).join('/'));
  return refs.length > 0 ? { owner, repo, refs } : undefined;
}

/** Resolves the ref the URL names, or the default branch, to a commit, and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<RepositoryInfo>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const given = name.refs.length > 0 ? await resolveRef(github, info.full_name, name.refs) : '';
  const ref = given === info.default_branch ? '' : given;
  // Code search only knows the default branch.
  const search = options.token && !ref;
  return repositorySource(github, info, ref, (sha, warnings) =>
    search
      ? searchPaths(github, info.full_name)
      : treePaths(github, info.full_name, sha, warnings, ref ? 'code search covers only the default branch' : 'GITHUB_TOKEN searches everywhere'),
  );
}

type RepositoryInfo = { full_name: string; default_branch: string };

/** The first of the refs that names a commit, tried longest first, as GitHub resolves its own links. */
async function resolveRef(github: Client, id: string, refs: string[]): Promise<string> {
  for (const ref of refs) {
    if (await github.find(`${API}/repos/${id}/commits/${encodePath(ref)}`)) return ref;
  }
  throw new AtlasError(`Branch, tag or commit not found: ${refs[0]} in ${id}`);
}

/** The repository at the ref's commit, or its default branch's, with the files `list` finds there. */
async function repositorySource(
  github: Client,
  info: RepositoryInfo,
  ref: string,
  list: (sha: string, warnings: string[]) => Promise<string[]>,
): Promise<Source> {
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(ref || info.default_branch)}`);
  const warnings: string[] = [];
  const paths = await list(sha, warnings);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha, ref },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** `https://github.com/owner`, with or without the scheme or a trailing slash. */
export function parseGitHubOrganizationUrl(input: string): { owner: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim());
  return match ? { owner: match[1] } : undefined;
}

/**
 * Lists every repository of an organization or a user, and finds the files that may be skills
 * with one code search over all of them: one search per repository would hit its rate limit.
 */
export async function openGitHubOrganization(input: string, options: GitHubOptions): Promise<OrganizationSource> {
  const name = parseGitHubOrganizationUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub organization URL: ${input}`);
  if (!options.token) throw new AtlasError('Scanning an organization needs GITHUB_TOKEN: GitHub code search finds its skills');
  const github = client(options);
  const owner = await github.json<{ login: string; type: string; html_url: string }>(
    `${API}/users/${name.owner}`,
    `Organization not found: https://github.com/${name.owner}`,
  );
  const isOrganization = owner.type === 'Organization';
  // Forks are left out: code search does not look in them, and their skills are their upstream's.
  const listed = await pages<RepositoryInfo & { fork: boolean }>(github, `${API}/${isOrganization ? 'orgs' : 'users'}/${owner.login}/repos?per_page=100`);
  const warnings: string[] = [];
  const found = await searchOwnerPaths(github, `${isOrganization ? 'org' : 'user'}:${owner.login}`, warnings);
  return {
    organization: { id: owner.login, url: `https://github.com/${owner.login}` },
    repositories: listed.filter((info) => !info.fork).map((info) => {
      const paths = found.get(info.full_name) ?? [];
      return {
        id: info.full_name,
        url: `https://github.com/${info.full_name}`,
        paths,
        open: () => repositorySource(github, info, '', async () => paths),
      };
    }),
    warnings,
  };
}

/** Every page of a GitHub list, 100 items a page, until a page comes back shorter. */
async function pages<T>(github: Client, url: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const answer = await github.json<T[]>(`${url}&page=${page}`);
    items.push(...answer);
    if (answer.length < 100) return items;
  }
}

/** The files named SKILL.md in the owner's repositories, by repository. Code search leaves forks out. */
async function searchOwnerPaths(github: Client, qualifier: string, warnings: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, Set<string>>(); // pages can repeat a result
  let total = 0;
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string; repository: { full_name: string } }[] }>(
      `${API}/search/code?q=filename:SKILL.md+${qualifier}&per_page=100&page=${page}`,
    );
    for (const item of result.items) {
      const id = item.repository.full_name;
      found.set(id, (found.get(id) ?? new Set()).add(item.path));
    }
    total = result.total_count;
    if (result.items.length < 100 || page * 100 >= total) break;
  }
  // Also when a page came back short first: the search said there are more than it can return.
  if (total > 1000) warnings.push(`code search found ${total} SKILL.md files and returns only the first 1000; some skills may be missing`);
  return new Map([...found].map(([id, paths]) => [id, [...paths]]));
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (${hint})`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

type Answer = { status: number; body: unknown };

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<Answer>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string): Promise<Answer> {
    const response = await get(url, { headers });
    if (response.ok) return { status: response.status, body: await response.json() };
    return { status: response.status, body: await response.json().catch(() => undefined) };
  }

  function answer(url: string): Promise<Answer> {
    if (!answers.has(url)) answers.set(url, request(url));
    return answers.get(url)!;
  }

  function failure(url: string, { status, body }: Answer, notFound: string): AtlasError {
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (status === 404) return new AtlasError(notFound);
    if ((status === 403 || status === 429) && /rate limit/i.test(text)) {
      return new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (status === 401) return new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
    return new AtlasError(`GitHub answered ${status} for ${url}${text && `: ${text}`}`);
  }

  /** A GitHub API answer; `notFound` explains a 404. */
  async function json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
    const answered = await answer(url);
    if (answered.status >= 200 && answered.status < 300) return answered.body as T;
    throw failure(url, answered, notFound);
  }

  return {
    json,
    /** A GitHub API answer, or undefined when there is none: 404, or 422 for a ref that names no commit. */
    async find<T>(url: string): Promise<T | undefined> {
      const { status } = await answer(url);
      return status === 404 || status === 422 ? undefined : json<T>(url);
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** A segment of a URL as GitHub links it, percent-encoded or not. */
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
