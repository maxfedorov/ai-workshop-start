import { diffLines } from './diff.ts';
import { findSkills, type SkillFile } from './find.ts';
import { sortRepositories, sortSkills, type Drift, type Organization, type Repository, type RepositorySummary, type Skill } from './model.ts';
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
  const { skills, warnings } = mergeDrifted(mergeCopies(entries));
  return {
    repository: source.repository,
    skills: sortSkills(skills),
    warnings: [...source.warnings, ...results.flatMap((result) => (result.warning ? [result.warning] : [])), ...warnings],
  };
}

type Entry = { file: SkillFile; text: string; skill: Skill };

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
    drifted: [],
    content: text,
  };
  return { entry: { file, text, skill }, warning: parsed.warning && `${file.path}: ${parsed.warning}` };
}

type Copies = { primary: Entry; copies: Entry[] };

/** Byte-identical files are the same skill: the alphabetically first path, the rest as copies. */
function mergeCopies(entries: Entry[]): Copies[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) groups.set(entry.text, [...(groups.get(entry.text) ?? []), entry]);
  return [...groups.values()].map((group) => {
    const [primary, ...copies] = [...group].sort((a, b) => (a.file.path < b.file.path ? -1 : 1));
    return { primary, copies };
  });
}

/**
 * The same place under two or more roots, not byte-identical, is still one skill: the alphabetically
 * first path, the other files as its drifted copies, each with how it differs; and a warning.
 */
function mergeDrifted(merged: Copies[]): { skills: Skill[]; warnings: string[] } {
  const places = new Map<string, Copies[]>();
  for (const group of merged) places.set(group.primary.file.place, [...(places.get(group.primary.file.place) ?? []), group]);
  const skills: Skill[] = [];
  const warnings: string[] = [];
  for (const groups of places.values()) {
    const [first, ...others] = [...groups].sort((a, b) => (a.primary.file.path < b.primary.file.path ? -1 : 1));
    const drifted = others
      .flatMap((group) => [group.primary, ...group.copies])
      .sort((a, b) => (a.file.path < b.file.path ? -1 : 1))
      .map((entry): Drift => ({ path: entry.file.path, differences: differences(first.primary.text, entry.text), content: entry.text }));
    if (drifted.length > 0) warnings.push(`${first.primary.file.path}: drifted from ${drifted.map((drift) => drift.path).join(', ')}`);
    skills.push({ ...first.primary.skill, copies: first.copies.map((entry) => entry.file.path).sort(), drifted });
  }
  return { skills, warnings };
}

/** How the drifted file differs from the skill's own, field by field; formatting alone when nothing else. */
function differences(text: string, drifted: string): string[] {
  const [own, other] = [parseSkill(text), parseSkill(drifted)];
  const found: string[] = [];
  if (own.name !== other.name) found.push('name differs');
  if (own.description !== other.description) found.push('description differs');
  const keys = [...new Set([...Object.keys(own.properties), ...Object.keys(other.properties)])]
    .filter((key) => JSON.stringify(own.properties[key]) !== JSON.stringify(other.properties[key]))
    .sort();
  if (keys.length > 0) found.push(`front matter keys differ: ${keys.join(', ')}`);
  const lines = diffLines(own.body.split('\n'), other.body.split('\n'));
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  if (added + removed > 0) found.push(`body differs (+${added} −${removed} lines)`);
  return found.length > 0 ? found : ['only formatting differs'];
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
