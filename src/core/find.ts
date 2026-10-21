/**
 * A skill found in a repository: its SKILL.md, its name, and its place: the folders above its
 * SKILL_ROOTS and its directory, `module/x` for `module/.claude/skills/x/SKILL.md`. The same place
 * under two roots is the same skill, kept for two agents.
 */
export type SkillFile = { path: string; name: string; place: string };

/** Where agents keep a repository's own skills, at any depth. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * An ancestor folder with one of these words means the SKILL.md isn't the repository's own:
 * shipped with the product (under `src`, which ends up in the built artifact) or test data
 * (under `test`, `tests`, `fixture` or `fixtures`, e.g. Gradle's `testFixtures`).
 */
const EXCLUDED_ANCESTORS = new Set(['src', 'test', 'tests', 'fixture', 'fixtures']);

/**
 * Every file named exactly SKILL.md under one of SKILL_ROOTS, at any depth, named after its
 * directory. A SKILL.md elsewhere, or under an excluded ancestor, is not a skill.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return paths
    .flatMap((path) => {
      const segments = path.split('/');
      if (segments.at(-1) !== 'SKILL.md') return [];
      const ancestors = rootAncestors(segments);
      if (!ancestors || ancestors.some(isExcluded)) return [];
      const name = segments.at(-2) ?? repositoryName;
      return [{ path, name, place: [...ancestors, name].join('/') }];
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The segments before a SKILL_ROOTS match (root, then the skill directory, then SKILL.md). */
function rootAncestors(segments: string[]): string[] | undefined {
  for (const root of SKILL_ROOTS) {
    const rootSegments = root.split('/');
    const start = segments.length - rootSegments.length - 2;
    if (start >= 0 && segments.slice(start, start + rootSegments.length).join('/') === root) {
      return segments.slice(0, start);
    }
  }
  return undefined;
}

function isExcluded(segment: string): boolean {
  return words(segment).some((word) => EXCLUDED_ANCESTORS.has(word));
}

/** A folder name's words: split on `-`, `_`, and camelCase boundaries (e.g. `testFixtures`). */
function words(segment: string): string[] {
  return segment
    .split(/[-_]/)
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .map((word) => word.toLowerCase());
}
