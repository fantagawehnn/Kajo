import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('js/main.js', 'utf8');
const calendar = readFileSync('js/calendar.js', 'utf8');
const state = readFileSync('js/state.js', 'utf8');
const analysisUI = readFileSync('js/analysis-ui.js', 'utf8');
const charts = readFileSync('js/charts.js', 'utf8');
const dashboard = readFileSync('js/dashboard.js', 'utf8');

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


for (const id of ['load-hero-ring', 'recovery-hero-ring', 'performance-hero-ring', 'health-hero-ring']) {
  assert.ok(html.includes('id="' + id + '"'), 'consistent analysis hero ring: ' + id);
}
assert.ok(html.includes('id="analysis-shared-period"'), 'shared analysis period container exists');
assert.ok(html.includes('id="health-history-baseline-note"'), 'wearable baseline limitation is disclosed');
assert.ok(html.includes('id="analysis-health-timeline"'), 'health availability/event timeline exists');
assert.ok(analysisUI.includes("latestCheckin('hrv')"), 'recovery uses a raw HRV measurement rather than a composite score');
assert.ok(analysisUI.includes('Es wird kein künstlicher Recovery-Gesamtscore gebildet'), 'recovery does not add a synthetic overall score');
assert.ok(html.includes('id="load-analysis-sources"'), 'load source methods have a separate comparison row');
assert.ok(analysisUI.includes('Kein eigenständiges Datenfeld nachgewiesen'), 'Edwards TRIMP is not fabricated when no distinct field is present');
assert.ok(analysisUI.includes('CTL bleibt ein Belastungs-/Fitnessindikator'), 'CTL is not presented as direct performance');
assert.ok(analysisUI.includes('statistische Methode für eine robuste, adaptive Baseline ist noch nicht festgelegt'), 'adaptive baseline is not fabricated');
assert.ok(dashboard.includes('Persönlicher Normalbereich noch nicht methodisch festgelegt'), 'unapproved wearable ranges are not presented as personal norms');
assert.ok(!dashboard.includes('Im persönlichen Bereich'), 'legacy personal-range classification is suppressed');
assert.ok(charts.includes("state.metricHistoryRange = tf"), 'shared timeframe synchronizes detail history');

console.log('KAJO navigation and analysis UI smoke tests passed.');
