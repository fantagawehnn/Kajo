import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('js/main.js', 'utf8');
const calendar = readFileSync('js/calendar.js', 'utf8');
const state = readFileSync('js/state.js', 'utf8');
const analysisUI = readFileSync('js/analysis-ui.js', 'utf8');
const charts = readFileSync('js/charts.js', 'utf8');
const dashboard = readFileSync('js/dashboard.js', 'utf8');
const importer = readFileSync('js/import.js', 'utf8');
const health = readFileSync('js/health.js', 'utf8');
const competitions = readFileSync('js/competitions.js', 'utf8');

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
assert.ok(html.includes('id="health-timeline-selection"'), 'health timeline has an accessible selected-day detail');
assert.ok(analysisUI.includes('onClick: (_event, elements) =>'), 'health timeline supports selecting a day');
assert.ok(analysisUI.includes('Kein Krankheits- oder Verletzungseintrag dokumentiert'), 'missing health entries are not interpreted as healthy days');
assert.ok(analysisUI.includes("weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'"), 'selected health day displays its full date');
assert.ok(analysisUI.includes("latestCheckin('hrv')"), 'recovery uses a raw HRV measurement rather than a composite score');
assert.ok(analysisUI.includes('Es wird kein künstlicher Recovery-Gesamtscore gebildet'), 'recovery does not add a synthetic overall score');
assert.ok(html.includes('id="load-analysis-sources"'), 'load source methods have a separate comparison row');
assert.ok(analysisUI.includes('Kein eigenständiges Datenfeld nachgewiesen'), 'Edwards TRIMP is not fabricated when no distinct field is present');
assert.ok(analysisUI.includes('CTL bleibt ein Belastungs-/Fitnessindikator'), 'CTL is not presented as direct performance');
assert.ok(analysisUI.includes("openTrainingMetric('fitness')"), 'CTL opens the existing fitness detail view');
assert.ok(analysisUI.includes("openTrainingMetric('form')"), 'training balance opens the existing balance detail view');
assert.ok(analysisUI.includes("supported ? \"openHealthMetric('"), 'supported recovery metrics open their existing detail views');
assert.ok(analysisUI.includes('kajo-analysis-metric-link'), 'supported analysis metrics are keyboard-accessible buttons');

assert.ok(analysisUI.includes('Ältere Messwerte ohne Quellenmetadaten bleiben jedoch unbekannt'), 'legacy HRV values remain unclassified');
assert.ok(dashboard.includes('Persönlicher Normalbereich noch nicht methodisch festgelegt'), 'unapproved wearable ranges are not presented as personal norms');
assert.ok(!dashboard.includes('Im persönlichen Bereich'), 'legacy personal-range classification is suppressed');
assert.ok(charts.includes("state.metricHistoryRange = tf"), 'shared timeframe synchronizes detail history');

assert.ok(importer.includes("['hrv', 'HRV (RMSSD)']"), 'Intervals wellness HRV field is identified as RMSSD');
assert.ok(importer.includes("['hrvSDNN', 'HRV (SDNN)']"), 'Intervals SDNN field is separately identified');
assert.ok(importer.includes("incoming.hrv = hrv"), 'Intervals HRV is stored in the shared check-in HRV key');
assert.ok(importer.includes("source: 'intervals', metric: 'rmssd', unit: 'ms'"), 'Intervals HRV carries explicit RMSSD provenance');
assert.ok(health.includes("['input-hrv', 'hrv'"), 'manual HRV uses the same check-in key');
assert.ok(health.includes("source: 'manual', metric: 'unspecified', unit: 'ms'"), 'manual HRV is marked as manual with unspecified measurement method');
assert.ok(analysisUI.includes('nur eindeutig als Intervals-RMSSD gekennzeichnete Werte eignen sich'), 'only identified Intervals RMSSD values are eligible for ln(RMSSD)');
assert.ok(!analysisUI.includes(String.fromCharCode(92) + 'n  const fromKey'), 'health analysis renderer contains no escaped source newlines');

console.log('KAJO navigation and analysis UI smoke tests passed.');


// Home dashboard structure and stacked weekly sport-duration chart.
const homeStart = html.indexOf('<div id="view-dashboard"');
const homeEnd = html.indexOf('<div id="view-analyses"', homeStart);
const homeMarkup = html.slice(homeStart, homeEnd);
for (const id of ['home-readiness-ring','home-form-ring','home-fitness-ring','home-wear-rhr-ring','home-wear-hrv-ring','home-wear-score-ring','home-wear-duration-ring','home-self-stress-ring','home-week-days','home-week-legend','home-week-summary']) {
  assert.ok(homeMarkup.includes('id="' + id + '"'), 'home contains ' + id);
}
assert.ok(homeMarkup.indexOf('home-readiness-ring') < homeMarkup.indexOf('home-form-ring') && homeMarkup.indexOf('home-form-ring') < homeMarkup.indexOf('home-fitness-ring'), 'status order is Recovery, Load, Performance');
assert.ok(homeMarkup.includes('kajo-week-chart'), 'weekly chart uses compact vertical bars');
assert.ok(dashboard.includes('kajo-week-segment'), 'weekly chart renders sport segments');
assert.ok(dashboard.includes("segment.setAttribute('aria-label'"), 'sport segments are accessible interactive targets');
assert.ok(dashboard.includes('garminActivityId || item.externalId || item.id'), 'weekly chart deduplicates stable activity IDs');
assert.ok(dashboard.includes('export function selectDashboardDate'), 'weekly day selection uses the non-editing dashboard day view');
assert.ok(competitions.includes('openNextRaceDetail'), 'next race opens a dedicated detail view');

assert.ok(homeMarkup.includes('home-next-race-location') && homeMarkup.includes('home-next-race-sport'), 'next race shows available location and discipline fields');
assert.ok(dashboard.includes('data-sport-type'), 'today sessions use configured sport identity for their color accent');
