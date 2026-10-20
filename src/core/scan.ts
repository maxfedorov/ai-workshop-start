import { findSkills, type SkillFile } from './find.ts';
import { sortRepositories, sortSkills, type Organization, type Repository, type RepositorySummary, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** An organization to scan: its repositories, the files in each that may be skills, and how to open one. */
export type OrganizationSource = {
  organization: Organization;
  repositories: { id: string; url: string; paths: string[]; open(): Promise<Source> }[];
  /** What listing the files had to leave out. */
  warnings: string[];
};

export type OrganizationScanResult = { organization: Organization; repositories: RepositorySummary[]; warnings: string[] };

/** What the user asked to scan: a repository, or an organization of them. */
export function isOrganization(source: Source | OrganizationSource): source is OrganizationSource {
  return 'organization' in source;
}

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths, source.repository.name);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  const entries = results.flatMap((result) => (result.entry ? [result.entry] : []));
  return {
    repository: source.repository,
    skills: sortSkills(mergeCopies(entries)),
    warnings: [...source.warnings, ...results.flatMap((result) => (result.warning ? [result.warning] : []))],
  };
}

type Entry = { path: string; text: string; skill: Skill };

async function readSkill(source: Source, file: SkillFile): Promise<{ entry?: Entry; warning?: string }> {
  const bytes = await source.read(file.path);
  if (!bytes) return { warning: `${file.path}: listed, but not found at the scanned commit; skipped` };
  const text = new TextDecoder().decode(bytes);
  const parsed = parseSkill(text);
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: [],
    content: text,
  };
  return { entry: { path: file.path, text, skill }, warning: parsed.warning && `${file.path}: ${parsed.warning}` };
}

/** Byte-identical files are the same skill: the alphabetically first path, the rest as copies. */
function mergeCopies(entries: Entry[]): Skill[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) groups.set(entry.text, [...(groups.get(entry.text) ?? []), entry]);
  return [...groups.values()].map((group) => {
    const [primary, ...copies] = [...group].sort((a, b) => (a.path < b.path ? -1 : 1));
    return { ...primary.skill, copies: copies.map((entry) => entry.path).sort() };
  });
}

/**
 * Each repository's skills, counted as `scan` finds them. Only a repository with a SKILL.md where
 * a skill can be is opened and read; the others have none.
 */
export async function scanOrganization(source: OrganizationSource): Promise<OrganizationScanResult> {
  const results = await Promise.all(
    source.repositories.map(async (repository) => {
      if (findSkills(repository.paths, repository.id).length === 0) return { repository, skills: 0, warnings: [] };
      const { skills, warnings } = await scan(await repository.open());
      return { repository, skills: skills.length, warnings: warnings.map((warning) => `${repository.id}: ${warning}`) };
    }),
  );
  return {
    organization: source.organization,
    repositories: sortRepositories(results.map(({ repository, skills }) => ({ id: repository.id, url: repository.url, skills }))),
    warnings: [...source.warnings, ...results.flatMap((result) => result.warnings)],
  };
}
