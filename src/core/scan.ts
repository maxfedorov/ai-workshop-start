import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
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
