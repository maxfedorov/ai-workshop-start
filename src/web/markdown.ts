// SKILL.md bodies as HTML for the web view. Everything is escaped first: the only tags on the page
// are the ones made here, and links keep to http(s), mailto and in-page anchors, so a repository's
// Markdown cannot run script in the page. Covers what skills use: headings, paragraphs, lists and
// task lists, fenced code, quotes, tables, rules, emphasis, code spans and links.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/** Heading ids and anchors share a prefix, so a heading can never take an id the page uses. */
const ANCHOR = 'md-';

/** `base`, the SKILL.md's own link, is what relative links resolve against. */
export function renderMarkdown(markdown: string, base = ''): string {
  const context: Context = { base, ids: new Map() };
  return blocks(markdown.replace(/\r\n?/g, '\n').split('\n'), context).join('\n');
}

type Context = { base: string; ids: Map<string, number> };

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function blocks(lines: string[], context: Context): string[] {
  const html: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    let match: RegExpExecArray | null;
    if (!line.trim()) {
      index++;
    } else if ((match = FENCE.exec(line))) {
      const [, indent, fence, language] = match;
      const code: string[] = [];
      for (index++; index < lines.length && !closes(lines[index], fence); index++) {
        code.push(lines[index].replace(new RegExp(`^ {0,${indent.length}}`), ''));
      }
      index++;
      const attribute = language ? ` class="language-${escapeHtml(language)}"` : '';
      html.push(`<pre><code${attribute}>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if ((match = HEADING.exec(line))) {
      html.push(heading(match[1].length, match[2] ?? '', context));
      index++;
    } else if (RULE.test(line)) {
      html.push('<hr>');
      index++;
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      for (; index < lines.length && (match = QUOTE.exec(lines[index])); index++) quoted.push(match[1]);
      html.push(`<blockquote>\n${blocks(quoted, context).join('\n')}\n</blockquote>`);
    } else if (ITEM.test(line)) {
      index = list(lines, index, context, html);
    } else if (line.includes('|') && lines[index + 1]?.includes('|') && TABLE_RULE.test(lines[index + 1])) {
      index = table(lines, index, context, html);
    } else {
      const paragraph: string[] = [];
      for (; index < lines.length && lines[index].trim() && !interrupts(lines[index]); index++) {
        if (paragraph.length > 0 && (match = SETEXT.exec(lines[index]))) break;
        paragraph.push(lines[index].replace(/^[ \t]+/, ''));
      }
      if (paragraph.length > 0 && index < lines.length && (match = SETEXT.exec(lines[index]))) {
        html.push(heading(match[1][0] === '=' ? 1 : 2, paragraph.join(' '), context));
        index++;
      } else if (paragraph.length > 0) {
        html.push(`<p>${inline(paragraph.join('\n'), context)}</p>`);
      } else {
        // A line that only looks like a block, such as `|` alone: plain text.
        html.push(`<p>${inline(lines[index++].trim(), context)}</p>`);
      }
    }
  }
  return html;
}

/** Lines that end a paragraph and start a block of their own. */
function interrupts(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
}

function closes(line: string, fence: string): boolean {
  const text = line.trim();
  return text.length >= fence.length && [...text].every((char) => char === fence[0]);
}

function heading(level: number, text: string, context: Context): string {
  const slug = slugify(text) || 'section';
  const seen = context.ids.get(slug) ?? 0;
  context.ids.set(slug, seen + 1);
  const id = `${ANCHOR}${seen ? `${slug}-${seen}` : slug}`;
  return `<h${level} id="${escapeHtml(id)}">${inline(text, context)}</h${level}>`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** A list of items at one indentation; each item's own lines are blocks of their own. */
function list(lines: string[], start: number, context: Context, html: string[]): number {
  const first = ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: string[][] = [];
  let loose = false;
  let index = start;
  while (index < lines.length) {
    const match = ITEM.exec(lines[index]);
    if (!match || match[1].length !== indent || /\d/.test(match[2]) !== ordered || RULE.test(lines[index])) break;
    const width = indent + match[2].length + 1;
    const item = [match[3] ?? ''];
    items.push(item);
    for (index++; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim()) {
        let next = index;
        while (next < lines.length && !lines[next].trim()) next++;
        const following = lines[next];
        if (following === undefined) break;
        const sibling = ITEM.exec(following);
        if (leading(following) > indent) item.push('');
        else if (!(sibling && sibling[1].length === indent && /\d/.test(sibling[2]) === ordered)) break;
        loose = true;
        index = next - 1;
      } else if (leading(line) > indent) {
        item.push(line.slice(Math.min(width, leading(line))));
      } else if (!interrupts(line) && item.at(-1)?.trim()) {
        item.push(line.trim()); // a lazy continuation of the item's paragraph
      } else {
        break;
      }
    }
  }
  const tag = ordered ? 'ol' : 'ul';
  const number = Number.parseInt(first[2], 10);
  const attribute = ordered && number !== 1 ? ` start="${number}"` : '';
  html.push(`<${tag}${attribute}>`);
  for (const item of items) {
    const task = /^\[([ xX])\][ \t]+/.exec(item[0]);
    if (task) item[0] = item[0].slice(task[0].length);
    const parts = blocks(item, context).map((part) =>
      !loose && part.startsWith('<p>') ? part.slice('<p>'.length, -'</p>'.length) : part,
    );
    const box = task ? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ` : '';
    html.push(`<li${task ? ' class="task"' : ''}>${box}${parts.join('\n')}</li>`);
  }
  html.push(`</${tag}>`);
  return index;
}

function leading(line: string): number {
  return line.length - line.trimStart().length;
}

function table(lines: string[], start: number, context: Context, html: string[]): number {
  const head = cells(lines[start]);
  const alignment = cells(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    return left && right ? ' class="align-center"' : right ? ' class="align-right"' : left ? ' class="align-left"' : '';
  });
  const row = (values: string[], tag: string) =>
    `<tr>${head.map((_, column) => `<${tag}${alignment[column] ?? ''}>${inline(values[column] ?? '', context)}</${tag}>`).join('')}</tr>`;
  const body: string[] = [];
  let index = start + 2;
  for (; index < lines.length && lines[index].trim() && lines[index].includes('|'); index++) body.push(row(cells(lines[index]), 'td'));
  html.push(`<table>\n<thead>${row(head, 'th')}</thead>\n<tbody>${body.join('\n')}</tbody>\n</table>`);
  return index;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/**
 * Code spans, escapes and links first, each held aside as finished HTML behind a placeholder;
 * then the rest is escaped, emphasis is marked, and the held pieces go back in.
 */
function inline(text: string, context: Context): string {
  const held: string[] = [];
  const hold = (html: string) => `\u0001${held.push(html) - 1}\u0002`;
  let result = text
    .replace(/[\u0001\u0002]/g, '')
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) =>
      hold(`<code>${escapeHtml(code.replace(/^ ([\s\S]*) $/, '$1').replace(/\n/g, ' '))}</code>`),
    )
    .replace(/\\([!-/:-@[-`{-~])/g, (_, char: string) => hold(escapeHtml(char)))
    .replace(/(!?)\[([^\]]*)\]\(\s*<?((?:[^\s<>()]|\([^\s<>()]*\))*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g, (_, image: string, label: string, url: string) => {
      const content = image ? `${emphasis(label || 'image')}` : emphasis(label);
      return hold(link(url, content || escapeHtml(url), context, image ? ' class="image-link"' : ''));
    })
    .replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/g, (_, url: string) => hold(link(url, escapeHtml(url), context)))
    .replace(/https?:\/\/[^\s<>()\u0001\u0002]*[^\s<>().,;:!?'"*_\u0001\u0002]/g, (url) => hold(link(url, escapeHtml(url), context)));
  result = emphasis(result).replace(/(?: {2,}|\\)\n/g, '<br>\n');
  while (/\u0001\d+\u0002/.test(result)) result = result.replace(/\u0001(\d+)\u0002/g, (_, index: string) => held[Number(index)]);
  return result;
}

/** Escapes the text, then marks strong, emphasis and strikethrough. */
function emphasis(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

/** A link if its target is safe; otherwise only its label. */
function link(url: string, label: string, context: Context, attributes = ''): string {
  const href = safeUrl(url, context.base);
  if (!href) return label;
  const external = href.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<a href="${escapeHtml(href)}"${attributes}${external}>${label}</a>`;
}

function safeUrl(url: string, base: string): string | undefined {
  if (url.startsWith('#')) {
    let fragment = url.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {}
    return `#${ANCHOR}${slugify(fragment)}`;
  }
  try {
    const resolved = base ? new URL(url, base) : new URL(url);
    const allowed = ['http:', 'https:', 'mailto:'];
    // A local directory links to its own files.
    if (base.startsWith('file:')) allowed.push('file:');
    return allowed.includes(resolved.protocol) ? resolved.href : undefined;
  } catch {
    return undefined;
  }
}
