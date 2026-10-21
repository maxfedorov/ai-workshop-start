// The skills map: a repository's skills, grouped by the words their names share. Pure functions, so
// the page and the tests share them.

/** Words too little to group by. */
export const LITTLE_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

/** A name's words, lowercased, each once: split at anything but a letter or a digit, and at camelCase. */
export function nameWords(name) {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((part) => part.split(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})/u))
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1 && !LITTLE_WORDS.has(word));
  return [...new Set(words)];
}

/**
 * A group for each word two or more of the skills share, the most skills first, then by word; each
 * group's skills in the order given. The skills that share no word are `alone`.
 */
export function mapSkills(skills) {
  const byWord = new Map();
  for (const skill of skills) {
    for (const word of nameWords(skill.name)) byWord.set(word, [...(byWord.get(word) ?? []), skill]);
  }
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const groups = [...byWord]
    .filter(([, members]) => members.length > 1)
    .map(([word, members]) => ({ word, skills: members }))
    .sort((a, b) => b.skills.length - a.skills.length || compare(a.word, b.word));
  const grouped = new Set(groups.flatMap((group) => group.skills));
  return { groups, alone: skills.filter((skill) => !grouped.has(skill)) };
}
