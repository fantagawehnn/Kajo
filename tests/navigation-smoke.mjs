import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('js/main.js', 'utf8');
const calendar = readFileSync('js/calendar.js', 'utf8');
const state = readFileSync('js/state.js', 'utf8');

const primary = ['today', 'calendar', 'training', 'analysis', 'more'];
for (const id of primary) {
  assert.equal((html.match(new RegExp('id="nav-' + id + '"', 'g')) || []).length, 1, 'one desktop tab: ' + id);
  assert.equal((html.match(new RegExp('id="mobile-nav-' + id + '"', 'g')) || []).length, 1, 'one mobile tab: ' + id);
}
assert.equal((html.match(/id="nav-(?:today|calendar|training|analysis|more)"/g) || []).length, 5);
assert.equal((html.match(/id="mobile-nav-(?:today|calendar|training|analysis|more)"/g) || []).length, 5);
assert.doesNotMatch(html, /id="nav-(?:dashboard|analyses|areas)"/);
assert.doesNotMatch(html, /id="btn-fmt-activities"/);

for (const id of ['training-subnav', 'analysis-subnav']) assert.ok(html.includes('id="' + id + '"'));
for (const id of ['load', 'recovery', 'performance', 'health']) {
  assert.ok(html.includes('id="analysis-subpage-' + id + '"'), 'analysis subpage: ' + id);
}
assert.ok(html.includes('id="home-week-days"'), 'Today weekly training grid exists');
assert.ok(html.includes('id="health-event-list"'), 'Health event list exists');
assert.ok(main.includes("renderHomeTrainingWeek()"), 'weekly training grid is rendered');
assert.ok(main.includes("view !== 'analyses' || sub !== id"), 'analysis subpages are switched independently');
assert.ok(calendar.includes("['day', 'week', 'month', 'year', 'activities']"), 'calendar supports day/week/month/year');
assert.match(state, /activeCalendarFormat:\s*'week'/, 'week is the default calendar mode');

console.log('KAJO navigation smoke tests passed.');
