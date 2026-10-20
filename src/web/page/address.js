// The page's state in its address: ?source=…&skill=…&q=…, so links, reloads and Back work.

export function readAddress(search) {
  const query = new URLSearchParams(search);
  return { source: query.get('source') ?? '', skill: query.get('skill') ?? '', filter: query.get('q') ?? '' };
}

export function addressOf(pathname, { source, skill, filter }) {
  const query = new URLSearchParams();
  if (source) query.set('source', source);
  if (skill) query.set('skill', skill);
  if (filter?.trim()) query.set('q', filter.trim());
  const search = query.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}
