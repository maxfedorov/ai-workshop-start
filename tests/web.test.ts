// The decisions in spec/web.md, checked on the real server: over ./fixture, over the small GitHub
// repository answered in tests/helpers.ts, and through `skill-atlas serve` itself.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { renderMarkdown } from '../src/web/markdown.ts';
import { createWebServer, serve } from '../src/web/server.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

/** A server over `source`, on a free port, closed after the test. */
async function server(t: TestContext, source?: string): Promise<string> {
  const web = createWebServer({ open, source });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  return `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
}

type Skill = { name: string; summary: string; path: string; link: string; copies: string[]; html: string; content: string; warning?: string; properties: string[][] };
type Scan = { source: string; repository: { id: string; url: string; commit: string }; skills: Skill[]; warnings: string[]; error?: string };

async function scanned(base: string, source?: string): Promise<{ status: number; body: Scan }> {
  const response = await fetch(`${base}/api/scan${source === undefined ? '' : `?source=${encodeURIComponent(source)}`}`);
  return { status: response.status, body: (await response.json()) as Scan };
}

/** `skill-atlas serve <args>` in `cwd`; resolves with the address it prints, or its exit code. */
function serveCli(t: TestContext, args: string[], cwd?: string) {
  const child = spawn(process.execPath, [CLI, 'serve', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => (stdout += text));
  child.stderr.setEncoding('utf8').on('data', (text: string) => (stderr += text));
  return new Promise<{ address?: string; code?: number | null; stdout: string; stderr: string }>((resolve) => {
    child.stdout.on('data', () => {
      const address = /^Skill Atlas: (http:\S+)\nPress Ctrl\+C to stop\.\n/m.exec(stdout)?.[1];
      if (address) resolve({ address, stdout, stderr });
    });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the scan as JSON: the repository, each skill with its link, front matter, rendered body and source', async (t) => {
  const base = await server(t, FIXTURE);
  const { status, body } = await scanned(base);
  assert.equal(status, 200);
  assert.equal(body.source, FIXTURE);
  assert.deepEqual(body.repository, { id: 'fixture', organization: 'local', name: 'fixture', url: pathToFileURL(FIXTURE).href, commit: '' });
  assert.deepEqual(body.skills.map((skill) => skill.name), ['code-style', 'commits', 'release-checklist', 'writing-lint-checks']);

  const commits = body.skills[1];
  assert.equal(commits.summary, 'Write commit messages the way this repository does.');
  assert.equal(commits.path, '.agents/skills/commits/SKILL.md');
  assert.equal(commits.link, `${pathToFileURL(FIXTURE).href}/.agents/skills/commits/SKILL.md`);
  assert.deepEqual(commits.copies, ['.claude/skills/commits/SKILL.md']);
  assert.match(commits.content, /^---\nname: commits\n/);
  assert.equal(
    commits.html,
    '<h1 id="md-commits">Commits</h1>\n<p>Start with the area, then say what changed: <code>editor: keep the caret after undo</code>.</p>',
  );

  const malformed = body.skills[2];
  assert.match(malformed.warning ?? '', /^malformed front matter: /);
  assert.match(body.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  assert.match(malformed.html, /<ol>\n<li>Tag the release\.<\/li>/);
});

test('another repository, scanned from the page: a GitHub link pins the scanned commit', async (t) => {
  const base = await server(t, FIXTURE);
  const { status, body } = await scanned(base, 'https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.equal(body.repository.commit, EXAMPLE_COMMIT);
  assert.equal(body.skills.length, 1);
  assert.equal(body.skills[0].link, `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`);
  assert.equal(body.skills[0].html, '<h1 id="md-commits">Commits</h1>');
});

test('no source → 400; a failure explained to the user → 422 and its message', async (t) => {
  const base = await server(t);
  assert.deepEqual(await scanned(base), { status: 400, body: { source: '', error: 'Enter a GitHub URL or a directory to scan' } });
  assert.deepEqual(await scanned(base, 'https://github.com/JetBrains/not-answered'), {
    status: 422,
    body: { source: 'https://github.com/JetBrains/not-answered', error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered' },
  });
  const missing = join(FIXTURE, 'no-such-directory');
  assert.deepEqual(await scanned(base, missing), { status: 422, body: { source: missing, error: `Not a GitHub URL or a readable directory: ${missing}` } });
});

test('the page: its own files only, and nothing but its own script may run', async (t) => {
  const base = await server(t, FIXTURE);
  for (const [path, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/style.css', 'text/css']]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', new RegExp(`^${type}`));
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'; script-src 'self'; style-src 'self'/);
  }
  assert.match(await (await fetch(base)).text(), /<script type="module" src="\/app\.js"><\/script>/);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  // A path that climbs out of the page, sent as it is: fetch would resolve the `..` itself.
  const climbed = await new Promise<number | undefined>((resolve, reject) => {
    request(`${base}/../../package.json`, (response) => resolve(response.resume().statusCode)).on('error', reject).end();
  });
  assert.equal(climbed, 404);
  assert.equal((await fetch(`${base}/api/scan`, { method: 'POST' })).status, 405);
});

test('the scan field: a button that clears it, after the field, outside the form\'s submit', async (t) => {
  const html = await (await fetch(await server(t, FIXTURE))).text();
  const field = /<input id="source"[^>]*>\s*<button ([^>]*)>/.exec(html);
  assert.ok(field, 'a button right after the scan field');
  assert.match(field[1], /type="button"/);
  assert.match(field[1], /aria-label="Clear the scan URL"/);
  assert.match(html, /<input id="source"[^>]*placeholder="[^"]+"/, 'a placeholder, which hides the button while the field is empty');
});

test('Markdown is escaped first: no HTML from a repository reaches the page; links resolve against the link', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude/skills/hostile'), { recursive: true });
  writeFileSync(
    join(root, '.claude/skills/hostile/SKILL.md'),
    [
      '---',
      'name: hostile',
      'description: Tries to run script.',
      'allowed-tools: [Read, Grep]',
      '---',
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '[run](javascript:alert(1)) [guide](references/guide.md) [top](#Usage) [site](https://example.com/?a=1&b="2")',
      '## Usage',
    ].join('\n'),
  );
  const base = await server(t, root);
  const [skill] = (await scanned(base)).body.skills;
  const link = `${pathToFileURL(root).href}/.claude/skills/hostile/SKILL.md`;
  assert.deepEqual(skill.properties, [['allowed-tools', 'Read, Grep']]);
  assert.equal(
    skill.html,
    [
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;',
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
      'run' +
        ` <a href="${link.replace(/SKILL\.md$/, 'references/guide.md')}" target="_blank" rel="noopener noreferrer">guide</a>` +
        ' <a href="#md-usage">top</a>' +
        ' <a href="https://example.com/?a=1&amp;b=%222%22" target="_blank" rel="noopener noreferrer">site</a></p>',
      '<h2 id="md-usage">Usage</h2>',
    ].join('\n'),
  );
  assert.equal(
    renderMarkdown('[guide](references/guide.md) [file](file:///etc/passwd)', 'https://github.com/o/r/blob/abc/skills/x/SKILL.md'),
    '<p><a href="https://github.com/o/r/blob/abc/skills/x/references/guide.md" target="_blank" rel="noopener noreferrer">guide</a> file</p>',
  );
});

test('Markdown: what skills use, from code to tables', () => {
  const markdown = [
    '# Title',
    '',
    'Some **bold `code`** and *emphasis*, snake_case_name, ~~gone~~ and \\*not emphasis\\*.',
    '',
    '- [x] done',
    '- [ ] open',
    '  - nested',
    '',
    '3. three',
    '4. four',
    '',
    '```sh',
    'echo "<b>" && ls',
    '```',
    '',
    '> quoted',
    '',
    '| Name | Size |',
    '| :--- | ---: |',
    '| a \\| b | 1 |',
    '',
    '---',
    'Setext',
    '======',
    '',
    '# Title',
  ].join('\n');
  assert.equal(
    renderMarkdown(markdown),
    [
      '<h1 id="md-title">Title</h1>',
      '<p>Some <strong>bold <code>code</code></strong> and <em>emphasis</em>, snake_case_name, <del>gone</del> and *not emphasis*.</p>',
      '<ul>',
      '<li class="task"><input type="checkbox" disabled checked> done</li>',
      '<li class="task"><input type="checkbox" disabled> open',
      '<ul>',
      '<li>nested</li>',
      '</ul></li>',
      '</ul>',
      '<ol start="3">',
      '<li>three</li>',
      '<li>four</li>',
      '</ol>',
      '<pre><code class="language-sh">echo &quot;&lt;b&gt;&quot; &amp;&amp; ls</code></pre>',
      '<blockquote>\n<p>quoted</p>\n</blockquote>',
      '<table>\n<thead><tr><th class="align-left">Name</th><th class="align-right">Size</th></tr></thead>\n' +
        '<tbody><tr><td class="align-left">a | b</td><td class="align-right">1</td></tr></tbody>\n</table>',
      '<hr>',
      '<h1 id="md-setext">Setext</h1>',
      '<h1 id="md-title-1">Title</h1>',
    ].join('\n'),
  );
});

test('serve: listens on 127.0.0.1, prints its address and stores nothing', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const started = await serveCli(t, [FIXTURE, '--port', '0'], cwd);
  assert.match(started.address ?? '', /^http:\/\/127\.0\.0\.1:\d+\/$/, started.stderr);
  assert.match(started.stdout, /\nPress Ctrl\+C to stop\.\n$/);
  const response = await fetch(`${started.address}api/scan`);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as Scan).skills.length, 4);
  assert.deepEqual(readdirSync(cwd), []);
});

test('serve: a port that is taken, or not a port → a clear message, exit code 1', async (t) => {
  const taken = createWebServer({ open });
  await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
  t.after(() => taken.close());
  const port = (taken.address() as AddressInfo).port;
  const busy = await serveCli(t, ['--port', String(port)]);
  assert.equal(busy.code, 1);
  assert.equal(busy.stderr, `Cannot listen on 127.0.0.1:${port}: the port is taken; choose another with --port\n`);
  await assert.rejects(serve({ open, port, host: '127.0.0.1' }), { message: `Cannot listen on 127.0.0.1:${port}: the port is taken; choose another with --port` });

  const notPort = await serveCli(t, ['--port', 'eighty']);
  assert.equal(notPort.code, 1);
  assert.equal(notPort.stderr, 'Not a port: eighty\n');
  const twoSources = await serveCli(t, [FIXTURE, FIXTURE]);
  assert.equal(twoSources.code, 1);
  assert.match(twoSources.stderr, /^Usage: skill-atlas serve /);
});

test('serve runs only from the command line', async () => {
  assert.equal(await createBrowserBackend({ fetch: () => Promise.reject(new Error('offline')) }).run('skill-atlas serve'), 'skill-atlas serve runs only from the command line');
});
