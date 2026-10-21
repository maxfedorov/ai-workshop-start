// The filter of the skill list: words, "quoted phrases", -exclusions and name:, description:, path:
// fields. Pure functions, so the page and the tests share them.

export const FIELDS = ['name', 'description', 'path'];

/** One term: `-`, then a field and `:`, then a "phrase" (an unclosed one runs to the end) or a word,
 * which a quote ends. */
const TERM = /(-?)(?:(name|description|path):)?(?:"([^"]*)"?|([^\s"]*))/gi;

/** The filter's terms, lowercased; a lone `-`, `""` or an empty field is no term. */
export function parseFilter(text) {
  const terms = [];
  for (const [, minus, field, phrase, word] of text.matchAll(TERM)) {
    const value = (phrase ?? word ?? '').trim().toLowerCase();
    if (value) terms.push({ text: value, field: field?.toLowerCase(), exclude: minus === '-' });
  }
  return terms;
}

function has(skill, term) {
  return (term.field ? [term.field] : FIELDS).some((field) => (skill[field] ?? '').toLowerCase().includes(term.text));
}

/** The skills every term leaves; those whose name has every word first, otherwise in their order. */
export function filterSkills(skills, terms) {
  const left = skills.filter((skill) => terms.every((term) => has(skill, term) !== term.exclude));
  const words = marked(terms, 'name');
  const first = left.filter((skill) => words.every((word) => skill.name.toLowerCase().includes(word)));
  return [...first, ...left.filter((skill) => !first.includes(skill))];
}

/**
 * An organization's repositories that every term leaves, filtered as skills are, with the
 * repository's name as its name and `owner/name` as its path. Those with skills stay first;
 * within each, those whose name has every word first.
 */
export function filterRepositories(repositories, terms) {
  const fields = repositories.map((repository) => ({ repository, name: repository.id.split('/')[1], description: '', path: repository.id }));
  const left = filterSkills(fields, terms).map((field) => field.repository);
  return [...left.filter((repository) => repository.skills > 0), ...left.filter((repository) => repository.skills === 0)];
}

/** What to mark in a field: the words searched in it, never the exclusions. */
export function marked(terms, field) {
  return terms.filter((term) => !term.exclude && (!term.field || term.field === field)).map((term) => term.text);
}

/** The text split at the words' matches, the matches at the odd indexes. Matches that overlap, such
 * as `co` and `code`, or `co` and `ode`, are one, so each word is marked whole. Case is ignored. */
export function markParts(text, words) {
  const ranges = words.flatMap((word) => {
    const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const found = [];
    for (let match; (match = pattern.exec(text)); pattern.lastIndex = match.index + 1) found.push([match.index, match.index + match[0].length]);
    return found;
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of ranges) {
    const last = merged.at(-1);
    if (last && from < last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  const parts = [];
  let end = 0;
  for (const [from, to] of merged) {
    parts.push(text.slice(end, from), text.slice(from, to));
    end = to;
  }
  return [...parts, text.slice(end)];
}
