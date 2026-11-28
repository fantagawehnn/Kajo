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

const designCss = css;

test('More and Settings share the design system while keeping separate roles', () => {
  const layout = html.indexOf('css/layout-stability.css');
  assert.ok(layout > html.indexOf('css/styles.css'), 'shared design styles must load after the legacy stylesheet');

  const moreStart = html.indexOf('<section id="view-more"');
  const moreEnd = html.indexOf('<section id="view-garmin-health"', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart, 'More view must exist');
  const more = html.slice(moreStart, moreEnd);

  for (const tone of ['blue', 'mint', 'coral', 'violet']) {
    assert.match(more, new RegExp('class="kajo-more-group" data-tone="' + tone + '"'));
  }
  assert.equal((more.match(/class="kajo-more-group"/g) || []).length, 4,
    'More must contain four clearly grouped functional areas');
  assert.doesNotMatch(more, /Einstellungen|openSettingsModal/,
    'configuration settings must not be duplicated as a More destination');

  assert.match(html, /id="settings-modal"/, 'Settings remain available in their own configuration modal');
  assert.match(designCss, /#view-more \.kajo-more-group-heading/);
  assert.match(designCss, /#settings-modal \.kajo-settings-category/);
  assert.match(designCss, /--kajo-ui-radius/);
});

test('More groups remain responsive and use distinct accent colors', () => {
  assert.match(designCss, /data-tone="coral"/);
  assert.match(designCss, /data-tone="violet"/);
  assert.match(designCss, /@media\s*\(\s*max-width:\s*640px\s*\)/);
  assert.match(designCss, /grid-template-columns: minmax\(0, 1fr\)/);
});
