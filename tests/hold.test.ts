// Holding Scan in spec/web.md: which text in the field is a link to open, checked with the page's
// own module. The hold itself, in a real browser, is in tests/e2e/web.spec.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webLink } from '../src/web/page/address.js';

test('holding Scan: a web link only, http or https, the field trimmed', () => {
  assert.equal(webLink('https://github.com/anthropics/skills'), 'https://github.com/anthropics/skills');
  assert.equal(webLink('  http://example.com/a?b=c  '), 'http://example.com/a?b=c');
  assert.equal(webLink('HTTPS://GitHub.com/JetBrains'), 'https://github.com/JetBrains');
});

test('holding Scan: anything else, a local directory or an empty field → nothing to open', () => {
  for (const text of ['', '   ', '/path/to/checkout', './fixture', 'github.com/anthropics/skills', 'file:///tmp/repo', 'javascript:alert(1)', 'mailto:a@b.c', 'https://']) {
    assert.equal(webLink(text), '', text);
  }
});
