// The Skill Atlas page: one scan from /api/scan, a filterable list of its skills and the selected
// SKILL.md, or the skills map in its place; or, for an organization, a filterable list of its
// repositories, each a link to its scan.
// The address holds the state (?source=…&skill=…&view=map&q=…), so links, reloads and Back work.
// Text from a repository goes in as text; the only HTML is the SKILL.md body the server rendered.
import { addressOf, readAddress } from './address.js';
import { filterRepositories, filterSkills, marked, parseFilter } from './filter.js';
import { mapSkills, nameParts } from './map.js';

const EXAMPLES = ['https://github.com/anthropics/skills', 'https://github.com/JetBrains/kotlin'];

const $ = (id) => document.getElementById(id);
const page = {
  source: $('source'),
  form: $('scan-form'),
  repo: $('repo'),
  state: $('state-panel'),
  filter: $('filter'),
  count: $('count'),
  list: $('skill-list'),
  warnings: $('warnings'),
  detail: $('detail'),
  toast: $('toast'),
};

/** The scan on screen, the skills the filter leaves, the selected one and how its file shows. */
let result;
let visible = [];
let selected;
let mode = 'rendered';
let scans = 0;
/** The organizations scanned on this page, by source: Back to one shows it without a new scan. */
const organizations = new Map();

/** An element with attributes and children; strings become text, never HTML. */
function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat(Infinity).filter((child) => child !== undefined && child !== null && child !== false));
  return element;
}

function address() {
  return readAddress(location.search);
}

/** The address of a state; the filter, unless given, is the one being typed. */
function href({ source, skill, filter = page.filter.value, view }) {
  return addressOf(location.pathname, { source, skill, filter, view });
}

/** Whether the skills map is on screen: only ever over a repository. */
function mapView() {
  return Boolean(result && !result.organization && address().view === 'map');
}

function go(state, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', href(state));
  return sync();
}

/** Brings the page in line with the address: scans when the source changed, then selects. */
async function sync() {
  const { source, skill, filter } = address();
  const refiltered = filter !== page.filter.value.trim();
  if (refiltered) page.filter.value = filter;
  if (!result || (source && source !== result.source)) {
    if (!(await scan(source))) return;
  } else if (refiltered) renderList();
  if (result.organization) renderOrganization();
  else if (mapView()) renderMap();
  else select(skill);
}

// The scan

async function scan(source) {
  const ticket = ++scans;
  page.source.value = source;
  showState('loading', source);
  let response;
  let data;
  if (organizations.has(source)) {
    data = organizations.get(source);
    response = { ok: true, status: 200 };
  } else {
    try {
      response = await fetch(`/api/scan?source=${encodeURIComponent(source)}`);
      data = await response.json();
    } catch {
      data = { error: response ? `The server answered ${response.status}` : 'Cannot reach the Skill Atlas server. Is it still running?' };
    }
  }
  if (ticket !== scans) return false;
  if (!response?.ok) {
    result = undefined;
    page.repo.replaceChildren();
    if (response?.status === 400 && !source) showState('welcome');
    else showState('error', data.source || source, data.error);
    return false;
  }
  result = data;
  selected = undefined;
  if (data.organization) organizations.set(data.source, data);
  page.source.value = data.source;
  if (!address().source) history.replaceState(null, '', href({ source: data.source, skill: address().skill, view: address().view }));
  document.title = `${(data.organization ?? data.repository).id} · Skill Atlas`;
  page.filter.placeholder = data.organization ? 'Filter repositories' : 'Filter skills';
  page.filter.setAttribute('aria-label', page.filter.placeholder);
  if (data.organization) renderOrganizationHeader();
  else renderRepository();
  renderWarnings();
  renderList();
  document.body.dataset.state = 'ready';
  return true;
}

function showState(state, source, message) {
  document.body.dataset.state = state;
  document.title = 'Skill Atlas';
  if (state === 'loading') {
    page.state.replaceChildren(
      h('div', { class: 'orbit', 'aria-hidden': 'true' }, h('span', { class: 'planet' }), h('span', { class: 'moon' })),
      h('p', { class: 'state-title' }, 'Charting skills…'),
      // replaceChildren, unlike h, would show a null as text.
      ...(source ? [h('p', { class: 'state-text mono' }, source)] : []),
    );
  } else if (state === 'welcome') {
    page.state.replaceChildren(
      h('div', { class: 'hero-planet', 'aria-hidden': 'true' }),
      h('h1', { class: 'hero-title' }, 'Every agent skill in a repository'),
      h('p', { class: 'state-text' }, 'Enter a GitHub URL or a local directory above. Skill Atlas finds each SKILL.md and lets you read it.'),
      h('div', { class: 'examples' }, h('span', { class: 'muted' }, 'Try'), EXAMPLES.map((example) =>
        h('button', { class: 'chip', type: 'button', onclick: () => go({ source: example, filter: '' }) }, example.replace('https://github.com/', '')),
      )),
    );
    page.source.focus();
  } else {
    page.state.replaceChildren(
      h('div', { class: 'error-mark', 'aria-hidden': 'true' }, '✦'),
      h('p', { class: 'state-title' }, 'Lost in space'),
      h('p', { class: 'state-text' }, message),
      ...(source && !message.includes(source) ? [h('p', { class: 'state-text mono muted' }, source)] : []),
      h('div', { class: 'examples' },
        source ? h('button', { class: 'button primary', type: 'button', onclick: () => { result = undefined; sync(); } }, 'Try again') : null,
        h('button', { class: 'button', type: 'button', onclick: () => { page.source.select(); page.source.focus(); } }, 'Scan something else'),
      ),
    );
  }
}

/** The organization this repository was chosen from on this page, if it was. */
function parentOrganization(repository) {
  return [...organizations.values()].find((organization) => organization.repositories.some((candidate) => candidate.id === repository.id));
}

function renderRepository() {
  const { repository } = result;
  const local = !repository.commit;
  const place = local ? decodeURIComponent(new URL(repository.url).pathname) : repository.url;
  const parent = parentOrganization(repository);
  page.repo.replaceChildren(
    h('span', { class: 'repo-planet', 'aria-hidden': 'true' }),
    // replaceChildren, unlike h, would show a null as text.
    ...(parent
      ? [h('a', { class: 'repo-parent', href: href({ source: parent.source, filter: '' }), title: `Back to ${parent.organization.id}`, onclick: (event) => follow(event, { source: parent.source }) }, `${parent.organization.id} /`)]
      : []),
    local
      ? h('span', { class: 'repo-name', title: place }, repository.id)
      : h('a', { class: 'repo-name', href: repository.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open the repository on GitHub' }, `${repository.id} ↗`),
    local
      ? h('button', { class: 'commit', type: 'button', title: 'Copy the directory', onclick: () => copy(place, 'Directory copied') }, 'local')
      : h('a', { class: 'commit mono', href: `${repository.url}/tree/${repository.commit}`, target: '_blank', rel: 'noopener noreferrer', title: `Scanned at ${repository.commit}` }, repository.commit.slice(0, 7)),
    h('a', { class: 'map-link', id: 'map-link', href: href({ source: result.source, view: 'map' }), title: 'The skills, grouped by the words their names share', onclick: openMap }, 'Skills map'),
  );
}

function renderWarnings() {
  const { warnings } = result;
  page.warnings.hidden = warnings.length === 0;
  page.warnings.querySelector('summary').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
  page.warnings.querySelector('ul').replaceChildren(...warnings.map((warning) => h('li', {}, warning)));
}

function renderOrganizationHeader() {
  const { organization } = result;
  page.repo.replaceChildren(
    h('span', { class: 'repo-planet', 'aria-hidden': 'true' }),
    h('a', { class: 'repo-name', href: organization.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open the organization on GitHub' }, `${organization.id} ↗`),
    h('span', { class: 'commit' }, 'organization'),
  );
}

// The list

/** A plain click on a link goes through the page; any other click is the browser's own. */
function follow(event, state) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  document.body.dataset.view = 'list';
  page.filter.value = '';
  go(state);
}

function renderList() {
  if (result.organization) return renderRepositories();
  const terms = parseFilter(page.filter.value);
  visible = filterSkills(result.skills, terms);
  // The map shows what the list does, so its link carries the filter being typed.
  $('map-link')?.setAttribute('href', href({ source: result.source, view: 'map' }));
  const total = result.skills.length;
  page.count.textContent = terms.length
    ? `${visible.length} of ${total} ${total === 1 ? 'skill' : 'skills'}`
    : `${total} ${total === 1 ? 'skill' : 'skills'}`;
  if (visible.length === 0) {
    page.list.replaceChildren(total
      ? h('li', { class: 'empty' }, 'No skill matches the filter.', h('button', { class: 'button', type: 'button', onclick: clearFilter }, 'Clear the filter'))
      : h('li', { class: 'empty' }, 'No SKILL.md in this repository.'));
    return;
  }
  page.list.replaceChildren(...visible.map((skill) => h('li', {},
    h('a', {
      class: 'skill-item',
      href: href({ source: result.source, skill: skill.path }),
      'data-path': skill.path,
      'aria-current': skill === selected ? 'true' : undefined,
      onclick: (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        choose(skill, { open: true });
      },
    },
      h('span', { class: 'skill-name' }, highlight(skill.name, marked(terms, 'name')), skill.warning ? h('span', { class: 'badge warn', title: skill.warning }, '!') : null),
      skill.summary ? h('span', { class: 'skill-summary' }, highlight(skill.summary, marked(terms, 'description'))) : null,
      h('span', { class: 'skill-path mono' }, highlight(skill.path, marked(terms, 'path'))),
    ),
  )));
}

function clearFilter() {
  page.filter.value = '';
  page.filter.dispatchEvent(new Event('input'));
  page.filter.focus();
}

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The organization's repositories that the filter leaves, the ones with skills first, each a link to its scan. */
function renderRepositories() {
  const terms = parseFilter(page.filter.value);
  const { repositories } = result;
  visible = filterRepositories(repositories, terms);
  const withSkills = repositories.filter((repository) => repository.skills > 0).length;
  page.count.textContent = terms.length
    ? `${visible.length} of ${count(repositories.length, 'repository', 'repositories')}`
    : `${count(repositories.length, 'repository', 'repositories')} · ${withSkills} with skills`;
  if (visible.length === 0) {
    page.list.replaceChildren(repositories.length
      ? h('li', { class: 'empty' }, 'No repository matches the filter.', h('button', { class: 'button', type: 'button', onclick: clearFilter }, 'Clear the filter'))
      : h('li', { class: 'empty' }, 'No repositories in this organization.'));
    return;
  }
  page.list.replaceChildren(...visible.map((repository) => h('li', {},
    h('a', {
      class: 'skill-item',
      href: href({ source: repository.url, filter: '' }),
      onclick: (event) => follow(event, { source: repository.url }),
    },
      h('span', { class: 'skill-name' }, highlight(repository.id.split('/')[1], marked(terms, 'name'))),
      h('span', { class: repository.skills ? 'skill-summary' : 'skill-summary muted' }, repository.skills ? count(repository.skills, 'skill', 'skills') : 'no skills'),
      h('span', { class: 'skill-path mono' }, highlight(repository.id, marked(terms, 'path'))),
    ),
  )));
}

/** The text with the filter's words marked. */
function highlight(text, words) {
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, index) => (index % 2 ? h('mark', {}, part) : part));
}

// The organization

/** How many repositories and skills, and the repositories with skills, each a link to its scan. */
function renderOrganization() {
  const { organization, repositories } = result;
  const withSkills = repositories.filter((repository) => repository.skills > 0);
  const skills = withSkills.reduce((sum, repository) => sum + repository.skills, 0);
  page.detail.replaceChildren(h('article', { class: 'skill' },
    h('header', { class: 'skill-head' },
      h('p', { class: 'eyebrow mono' }, 'Organization'),
      h('h1', { class: 'skill-title' }, organization.id),
      h('p', { class: 'skill-description' },
        `${count(repositories.length, 'repository', 'repositories')}, ${withSkills.length} with skills: ${count(skills, 'skill', 'skills')} in all.`),
      h('div', { class: 'actions' },
        h('a', { class: 'button primary', href: organization.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open on GitHub ↗'),
      ),
    ),
    withSkills.length
      ? h('ul', { class: 'repositories' }, withSkills.map((repository) => h('li', {},
        h('a', { class: 'repository-card', href: href({ source: repository.url, filter: '' }), onclick: (event) => follow(event, { source: repository.url }) },
          h('span', { class: 'repository-name' }, repository.id),
          h('span', { class: 'repository-count' }, count(repository.skills, 'skill', 'skills')),
        ),
      )))
      : h('p', { class: 'muted' }, 'No repository of this organization has skills.'),
  ));
  page.detail.scrollTop = 0;
}

// The skills map

/** A plain click opens the map, keeping the filter; any other click is the browser's own. */
function openMap(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  document.body.dataset.view = 'detail';
  if (!mapView()) go({ source: result.source, view: 'map' });
}

/** The skills the filter leaves, grouped by the words their names share, in place of the selected skill. */
function renderMap() {
  selected = undefined;
  for (const item of page.list.querySelectorAll('.skill-item')) item.removeAttribute('aria-current');
  $('map-link')?.setAttribute('aria-current', 'page');
  if (result.skills.length === 0) {
    page.detail.replaceChildren(h('div', { class: 'detail-empty' }, h('div', { class: 'hero-planet small', 'aria-hidden': 'true' }), h('p', {}, 'No skills were found in this repository.')));
    return;
  }
  const { groups, alone } = mapSkills(visible);
  const skillLink = (skill, word) => h('li', {},
    h('a', {
      class: 'map-skill',
      href: href({ source: result.source, skill: skill.path }),
      title: skill.summary || skill.path,
      onclick: (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        choose(skill, { open: true });
      },
    }, word ? nameParts(skill.name).map((part) => (part.word === word ? h('mark', {}, part.text) : part.text)) : skill.name),
  );
  const heading = (title, skills) => h('h2', { class: 'map-word' }, h('span', {}, title), h('span', { class: 'map-count' }, count(skills.length, 'skill', 'skills')));
  page.detail.replaceChildren(h('article', { class: 'skill skills-map' },
    h('button', { class: 'back button ghost', type: 'button', onclick: () => { document.body.dataset.view = 'list'; page.filter.focus(); } }, '← All skills'),
    h('header', { class: 'skill-head' },
      h('p', { class: 'eyebrow mono' }, result.repository.id),
      h('h1', { class: 'skill-title' }, 'Skills map'),
      h('p', { class: 'skill-description' }, visible.length
        ? `${count(visible.length, 'skill', 'skills')}: ${count(groups.length, 'group', 'groups')} by a word their names share, ${alone.length} on their own.`
        : 'No skill matches the filter.'),
    ),
    groups.length
      ? h('ul', { class: 'map-groups' }, groups.map((group) => h('li', { class: 'map-group' },
        heading(group.word, group.skills),
        h('ul', { class: 'map-skills' }, group.skills.map((skill) => skillLink(skill, group.word))),
      )))
      : visible.length ? h('p', { class: 'muted map-none' }, 'No two skills share a word in their names.') : null,
    alone.length
      ? h('section', { class: 'map-alone' },
        heading('On their own', alone),
        h('ul', { class: 'map-skills' }, alone.map((skill) => skillLink(skill))),
      )
      : null,
  ));
  page.detail.scrollTop = 0;
}

// The selected skill

/** Selects a skill by path, or the first one; without a scan or skills, the empty view. */
function select(path) {
  $('map-link')?.removeAttribute('aria-current');
  const skill = result.skills.find((candidate) => candidate.path === path) ?? visible[0] ?? result.skills[0];
  if (!skill) {
    selected = undefined;
    page.detail.replaceChildren(h('div', { class: 'detail-empty' }, h('div', { class: 'hero-planet small', 'aria-hidden': 'true' }), h('p', {}, 'No skills were found in this repository.')));
    return;
  }
  if (skill.path !== path) history.replaceState(null, '', href({ source: result.source, skill: skill.path }));
  if (skill !== selected) {
    selected = skill;
    renderDetail();
  }
  for (const item of page.list.querySelectorAll('.skill-item')) {
    if (item.dataset.path === skill.path) {
      item.setAttribute('aria-current', 'true');
      item.scrollIntoView({ block: 'nearest' });
    } else item.removeAttribute('aria-current');
  }
}

/** Selects the skill and records it in the address; `open` shows it on narrow screens. */
function choose(skill, { open = false, replace = false } = {}) {
  if (open) document.body.dataset.view = 'detail';
  if (skill === selected) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', href({ source: result.source, skill: skill.path }));
  select(skill.path);
  // Arrowing through the list keeps the focus on the chosen skill.
  const focused = document.activeElement;
  if (focused instanceof Element && focused.classList.contains('skill-item')) page.list.querySelector('[aria-current="true"]')?.focus();
}

function renderDetail() {
  const skill = selected;
  const local = !result.repository.commit;
  const directory = skill.path.split('/').slice(0, -1).join('/');
  const meta = [
    ['Path', h('button', { class: 'path-button mono', type: 'button', title: 'Copy the path', onclick: () => copy(skill.path, 'Path copied') }, skill.path)],
    skill.copies.length ? ['Also in', skill.copies.map((copyPath) => h('code', {}, copyPath))] : null,
    ...skill.properties.map(([key, value]) => [key, h('span', { class: 'property' }, value)]),
  ].filter(Boolean);

  page.detail.replaceChildren(h('article', { class: 'skill' },
    h('button', { class: 'back button ghost', type: 'button', onclick: () => { document.body.dataset.view = 'list'; page.filter.focus(); } }, '← All skills'),
    h('header', { class: 'skill-head' },
      h('p', { class: 'eyebrow mono' }, `${result.repository.id}${directory ? ` / ${directory}` : ''}`),
      h('h1', { class: 'skill-title' }, skill.name),
      h('p', { class: skill.description ? 'skill-description' : 'skill-description muted' }, skill.description || 'No description in the front matter.'),
      h('div', { class: 'actions' },
        local
          ? h('button', { class: 'button primary', type: 'button', onclick: () => copy(decodeURIComponent(new URL(skill.link).pathname), 'File path copied') }, 'Copy file path')
          : h('a', { class: 'button primary', href: skill.link, target: '_blank', rel: 'noopener noreferrer' }, 'Open on GitHub ↗'),
        local ? null : h('button', { class: 'button', type: 'button', onclick: () => copy(skill.link, 'Link copied') }, 'Copy link'),
        h('button', { class: 'button', type: 'button', onclick: () => copy(skill.content, 'SKILL.md copied') }, 'Copy SKILL.md'),
      ),
      skill.warning ? h('p', { class: 'notice' }, h('strong', {}, 'Front matter: '), skill.warning) : null,
      h('dl', { class: 'meta' }, meta.map(([term, value]) => [h('dt', {}, term), h('dd', {}, value)])),
    ),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'How to show SKILL.md' },
      tab('rendered', 'Rendered'),
      tab('source', 'SKILL.md source'),
    ),
    h('div', { class: 'tab-panel', id: 'skill-panel', role: 'tabpanel' }),
  ));
  renderPanel();
  page.detail.scrollTop = 0;
}

function tab(name, label) {
  return h('button', {
    class: 'tab',
    type: 'button',
    role: 'tab',
    id: `tab-${name}`,
    'aria-controls': 'skill-panel',
    'aria-selected': String(mode === name),
    onclick: () => {
      mode = name;
      for (const other of page.detail.querySelectorAll('.tab')) other.setAttribute('aria-selected', String(other.id === `tab-${mode}`));
      renderPanel();
    },
  }, label);
}

function renderPanel() {
  const panel = $('skill-panel');
  panel.setAttribute('aria-labelledby', `tab-${mode}`);
  if (mode === 'source') {
    const lines = selected.content.replace(/\n$/, '').split('\n');
    panel.replaceChildren(h('pre', { class: 'source' }, h('code', {}, lines.map((line) => h('span', { class: 'line' }, `${line}\n`)))));
  } else if (selected.html.trim()) {
    const body = h('div', { class: 'markdown' });
    body.innerHTML = selected.html; // rendered on the server from escaped text; see src/web/markdown.ts
    panel.replaceChildren(body);
  } else {
    panel.replaceChildren(h('p', { class: 'muted' }, 'This SKILL.md has no body after its front matter.'));
  }
}

// Little things

let toastTimer;
async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { class: 'visually-hidden' });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  page.toast.textContent = message;
  page.toast.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => page.toast.classList.remove('shown'), 1600);
}

function typing(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function inList(target) {
  return target === document.body || (target instanceof Element && target.closest('.sidebar') !== null);
}

function move(step) {
  if (!result || visible.length === 0) return;
  if (result.organization) {
    // Choosing a repository scans it, so the arrows only move the focus; Enter opens it.
    const items = [...page.list.querySelectorAll('.skill-item')];
    const index = items.indexOf(document.activeElement);
    items[Math.max(0, Math.min(items.length - 1, index < 0 ? 0 : index + step))].focus();
    return;
  }
  const index = visible.indexOf(selected);
  const next = visible[Math.max(0, Math.min(visible.length - 1, index < 0 ? 0 : index + step))];
  // Leaving the map keeps it in the history.
  choose(next, { replace: !mapView() });
}

page.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const source = page.source.value.trim() + ')';
  if (!source) return page.source.focus();
  page.filter.value = '';
  result = undefined;
  selected = undefined;
  organizations.delete(source); // asked for again: scanned again
  document.body.dataset.view = 'list';
  go({ source });
});

page.filter.addEventListener('input', () => {
  if (!result) return;
  renderList();
  const map = mapView();
  if (map) renderMap();
  else if (!result.organization && visible.length && !visible.includes(selected)) choose(visible[0], { replace: true });
  // Typing keeps the filter in the address, without an entry per key.
  history.replaceState(null, '', href({ source: result.source, skill: selected?.path, view: map ? 'map' : '' }));
});

page.filter.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    move(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (result?.organization) page.list.querySelector('.skill-item')?.focus();
    else if (selected) {
      document.body.dataset.view = 'detail';
      page.detail.focus();
    }
  } else if (event.key === 'Escape') {
    page.filter.value = '';
    page.filter.dispatchEvent(new Event('input'));
    page.filter.blur();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
  if (event.key === '/') {
    event.preventDefault();
    page.filter.focus();
    page.filter.select();
  } else if (event.key === 'j' || event.key === 'k' || ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && inList(event.target))) {
    // The arrows choose only from the list: elsewhere they scroll the page.
    event.preventDefault();
    move(event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Escape' && page.filter.value) {
    page.filter.value = '';
    page.filter.dispatchEvent(new Event('input'));
  }
});

window.addEventListener('popstate', () => sync());

sync();
