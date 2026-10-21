/** One line of a line diff: in both texts, only in the first (`removed`), or only in the second (`added`). */
export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string };

/**
 * The lines that turn `before` into `after`: a longest common subsequence, removals before
 * additions where both happen at one place. The common start and end are matched first, so two
 * copies of a long file that differ in a few lines cost little.
 */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  // common[i][j]: how many lines a[i..] and b[j..] have in common, at most.
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const lines: DiffLine[] = before.slice(0, start).map((text) => ({ kind: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i++] });
      j++;
    } else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) lines.push({ kind: 'removed', text: a[i++] });
    else lines.push({ kind: 'added', text: b[j++] });
  }
  lines.push(...before.slice(before.length - end).map((text): DiffLine => ({ kind: 'same', text })));
  return lines;
}
