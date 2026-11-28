import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/layout-stability.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('layout stability stylesheet loads after the legacy stylesheet', () => {
  const legacy = html.indexOf('css/styles.css');
  const stability = html.indexOf('css/layout-stability.css');
  assert.notEqual(legacy, -1, 'legacy stylesheet must remain loaded');
  assert.notEqual(stability, -1, 'stability stylesheet must be loaded');
  assert.ok(stability > legacy, 'stability overrides must load after legacy CSS');
});

test('mobile navigation uses the current five-tab layout, not legacy four-tab selectors', () => {
  assert.match(css, /\.kajo-mobile-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(html, /id="mobile-nav-today"/);
  assert.match(html, /id="mobile-nav-calendar"/);
  assert.match(html, /id="mobile-nav-training"/);
  assert.match(html, /id="mobile-nav-analysis"/);
  assert.match(html, /id="mobile-nav-more"/);
});

test('content and overlays are constrained to the available viewport', () => {
  assert.match(css, /#app-main\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /max-height:\s*calc\(100dvh/s);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('layout overrides do not replace feature-specific grid column definitions', () => {
  assert.doesNotMatch(css, /#app-main\s+\.grid\s*\{[^}]*grid-template-columns/s);
});
