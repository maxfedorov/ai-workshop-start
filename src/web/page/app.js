// The Skill Atlas page: one scan from /api/scan, a filterable list of its skills and the selected
// SKILL.md. The address holds the state (?source=…&skill=…&q=…), so links, reloads and Back work.
// Text from a repository goes in as text; the only HTML is the SKILL.md body the server rendered.
import { addressOf, readAddress } from './address.js';
import { filterSkills, marked, parseFilter } from './filter.js';

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
function href({ source, skill, filter = page.filter.value }) {
  return addressOf(location.pathname, { source, skill, filter });
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
  select(skill);
}

// The scan

async function scan(source) {
  const ticket = ++scans;
  page.source.value = source;
  showState('loading', source);
  let response;
  let data;
  try {
    response = await fetch(`/api/scan?source=${encodeURIComponent(source)}`);
    data = await response.json();
  } catch {
    data = { error: response ? `The server answered ${response.status}` : 'Cannot reach the Skill Atlas server. Is it still running?' };
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
  page.source.value = data.source;
  if (!address().source) history.replaceState(null, '', href({ source: data.source, skill: address().skill }));
  document.title = `${data.repository.id} · Skill Atlas`;
  renderRepository();
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
      source ? h('p', { class: 'state-text mono' }, source) : null,
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
      source && !message.includes(source) ? h('p', { class: 'state-text mono muted' }, source) : null,
      h('div', { class: 'examples' },
        source ? h('button', { class: 'button primary', type: 'button', onclick: () => { result = undefined; sync(); } }, 'Try again') : null,
        h('button', { class: 'button', type: 'button', onclick: () => { page.source.select(); page.source.focus(); } }, 'Scan something else'),
      ),
    );
  }
}

function renderRepository() {
  const { repository } = result;
  const local = !repository.commit;
  const place = local ? decodeURIComponent(new URL(repository.url).pathname) : repository.url;
  page.repo.replaceChildren(
    h('span', { class: 'repo-planet', 'aria-hidden': 'true' }),
    local
      ? h('span', { class: 'repo-name', title: place }, repository.id)
      : h('a', { class: 'repo-name', href: repository.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open the repository on GitHub' }, `${repository.id} ↗`),
    local
      ? h('button', { class: 'commit', type: 'button', title: 'Copy the directory', onclick: () => copy(place, 'Directory copied') }, 'local')
      : h('a', { class: 'commit mono', href: `${repository.url}/tree/${repository.commit}`, target: '_blank', rel: 'noopener noreferrer', title: `Scanned at ${repository.commit}` }, repository.commit.slice(0, 7)),
  );
}

function renderWarnings() {
  const { warnings } = result;
  page.warnings.hidden = warnings.length === 0;
  page.warnings.querySelector('summary').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
  page.warnings.querySelector('ul').replaceChildren(...warnings.map((warning) => h('li', {}, warning)));
}

// The list

function renderList() {
  const terms = parseFilter(page.filter.value);
  visible = filterSkills(result.skills, terms);
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

/** The text with the filter's words marked. */
function highlight(text, words) {
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, index) => (index % 2 ? h('mark', {}, part) : part));
}

// The selected skill

/** Selects a skill by path, or the first one; without a scan or skills, the empty view. */
function select(path) {
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
  const index = visible.indexOf(selected);
  const next = visible[Math.max(0, Math.min(visible.length - 1, index < 0 ? 0 : index + step))];
  choose(next, { replace: true });
}

page.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const source = page.source.value.trim();
  if (!source) return page.source.focus();
  page.filter.value = '';
  result = undefined;
  selected = undefined;
  document.body.dataset.view = 'list';
  go({ source });
});

page.filter.addEventListener('input', () => {
  if (!result) return;
  renderList();
  if (visible.length && !visible.includes(selected)) choose(visible[0], { replace: true });
  // Typing keeps the filter in the address, without an entry per key.
  history.replaceState(null, '', href({ source: result.source, skill: selected?.path }));
});

page.filter.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    move(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (selected) {
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
