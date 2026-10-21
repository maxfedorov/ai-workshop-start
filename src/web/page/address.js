// The page's state in its address: ?source=…&skill=…&view=map&q=…, so links, reloads and Back work.

/** The views besides the selected skill. */
const VIEWS = ['map'];

export function readAddress(search) {
  const query = new URLSearchParams(search);
  const view = query.get('view') ?? '';
  return {
    source: query.get('source') ?? '',
    skill: query.get('skill') ?? '',
    filter: query.get('q') ?? '',
    view: VIEWS.includes(view) ? view : '',
  };
}

/** The map shows no skill, so its address names none. */
export function addressOf(pathname, { source, skill, filter, view = '' }) {
  const query = new URLSearchParams();
  if (source) query.set('source', source);
  if (view) query.set('view', view);
  else if (skill) query.set('skill', skill);
  if (filter?.trim()) query.set('q', filter.trim());
  const search = query.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}
