import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const activities = readFileSync('js/activities.js', 'utf8');
const calculations = readFileSync('js/calculations.js', 'utf8');
const css = readFileSync('css/styles.css', 'utf8');
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

assert.ok(html.includes('id="kajo-mobile-notifications-button"'), 'mobile global top bar contains notification settings');
assert.ok(html.includes('id="kajo-mobile-profile-button"'), 'mobile global top bar contains athlete profile');
assert.ok(html.includes('class="kajo-mobile-logo"'), 'mobile global top bar contains KAJO logo');
assert.ok(html.includes('class="kajo-desktop-header-actions"'), 'desktop global top bar contains notification and profile actions');
assert.ok(!html.includes('<header class="kajo-home-topbar">'), 'home view does not duplicate the global brand and account actions');

for (const domain of ['load', 'recovery', 'performance', 'health']) {
  assert.ok(html.includes('id="analysis-subpage-' + domain + '"'), domain + ' analysis detail page exists');
  assert.ok(html.includes('id="' + domain + '-hero-ring"'), domain + ' uses the shared hero metric ring');
}
assert.ok(css.includes('one centered, consistently sized hero metric'), 'analysis pages share the centered hero layout');

assert.ok(css.includes('#analysis-subpage-load > #analysis-load-section { order: 2; }'), 'training load trend precedes supporting metric rows');
assert.ok(css.includes('#analysis-subpage-recovery > #view-health-data { order: 3; }'), 'recovery metric history precedes supporting metric rows');
assert.ok(html.includes('id="analysis-health-timeline-panel"'), 'health timeline has a stable analysis section target');

assert.ok(analysisUI.includes('Persönlicher Normalbereich noch nicht verfügbar'), 'adaptive personal baseline is not fabricated without an agreed method and data basis');


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

assert.ok(main.includes("document.body.classList.toggle('kajo-home-active', view === 'dashboard')"), 'home header state avoids duplicate global branding');
assert.ok(dashboard.includes("year: 'numeric'"), 'home date includes the current year');

assert.ok(!dashboard.includes('latestFormDay'), 'home rendering does not reference an undefined load timeline variable');



const profile = readFileSync('js/profile.js', 'utf8');
const theme = readFileSync('js/theme.js', 'utf8');
const styles = readFileSync('css/styles.css', 'utf8');
assert.ok(profile.includes("id: 'achievements'") && profile.includes("id: 'career'"), 'athlete profile includes achievements and career sections');
assert.ok(profile.includes("key: 'personalRecords'") && profile.includes("key: 'competitionHistory'"), 'athlete profile stores competition history and personal records');
assert.ok(profile.includes('kajo-profile-timeline'), 'career history uses a timeline presentation');
assert.ok(profile.includes('isSafeImageUrl'), 'profile image URLs are restricted to HTTP(S)');
assert.ok(theme.includes("const THEMES = ['system', 'dark', 'light']"), 'theme preference supports system, dark and light');
assert.ok(theme.includes('localStorage.setItem(THEME_KEY, selected)'), 'theme preference persists on this device');
assert.ok(html.includes('id="kajo-theme-select"'), 'theme preference is reachable in settings');
assert.ok(main.includes('initializeKajoTheme()'), 'theme preference is initialized by the app');
assert.ok(styles.includes('--kajo-status-good:#39C98A') && styles.includes('--kajo-status-critical:#F16B6B'), 'semantic status tokens are centrally defined');
assert.ok(dashboard.includes('const STATUS_COLORS') && dashboard.includes('STATUS_COLORS.attention'), 'dashboard rings use the shared semantic status colors');
assert.ok(!dashboard.includes("return '#a855f7'"), 'critical status no longer uses a separate purple status color');


assert.ok(profile.includes('closeProfileModal()') && profile.includes('activeProfileSection'), 'profile keeps a return path and preserves the open section');


// Calendar redesign: shared KAJO styling, four calendar modes and transparent data coverage.
assert.ok(html.includes('id="cal-format-day"'), 'calendar has a dedicated day view');
assert.ok(html.includes('id="calendar-week-summary"'), 'week view has aggregate load and time summary');
assert.ok(html.includes('id="month-day-detail"'), 'month view has an inline day detail region below the grid');
assert.ok(html.includes('openCalendarTrainingCreate()') && html.includes('openCalendarRaceCreate()'), 'calendar plus menu offers training and competition creation');
assert.ok(!html.includes('id="calendar-display-toggle"'), 'calendar cannot switch sport colors to training-category colors');
assert.ok(calendar.includes('export function openCalendarDay(date, keepMonth = false)'), 'month day selection can retain the month view');
assert.ok(calendar.includes("state.activeCalendarFormat = 'month';") && calendar.includes('renderCalendarDayDetail(selectedDate, detail)'), 'month details render below the month grid without leaving it');
assert.ok(calendar.includes("renderCalendarDayDetail(toLocalDateString(state.currentCalendarDate), 'cal-format-day')"), 'day view uses the same day-detail renderer');
const dayDetailStart = calendar.indexOf('function renderCalendarDayDetail');
const dayDetailEnd = calendar.indexOf('export function openCalendarDay', dayDetailStart);
const dayDetail = calendar.slice(dayDetailStart, dayDetailEnd);
assert.ok(dayDetail.indexOf('Trainingseinheiten') < dayDetail.indexOf('Training Load & Trainingszeit') && dayDetail.indexOf('Training Load & Trainingszeit') < dayDetail.indexOf('Recovery'), 'day detail order is training, load/time, recovery');
assert.ok(calendar.includes('getSportsCatalog()'), 'calendar activity colors come from configured sport colors');
assert.ok(calendar.includes('calendar-month-sport-marker is-planned') && calendar.includes('calendar-entry-status is-completed'), 'sport color is separate from planned/completed status');
assert.ok(calendar.includes('calendarEventIcons(date)'), 'calendar shows distinct event symbols');
assert.ok(calendar.includes('item?.cycle?.period === true'), 'calendar shows recorded menstruation days only');
assert.ok(calendar.includes('calendar-year-week-cell') && calendar.includes('calendar-year-month-label') && calendar.includes('calendar-year-sport-segment'), 'year view is a month and calendar-week matrix with sport-specific bars');
assert.ok(calendar.includes('calendar-year-planned-segment'), 'year view distinguishes planned sessions from completed training time');
assert.ok(calendar.includes('calendar-week-day') && calendar.includes('calendar-week-activity'), 'week view is a seven-column training calendar grid');
assert.ok(calendar.includes('Number(timeline.activityCount) === Number(timeline.loadActivityCount)'), 'daily training load is shown only with complete activity coverage');
assert.ok(calendar.includes('data.durationComplete') && calendar.includes('priorCompleteDays'), 'training time comparison exposes incomplete duration coverage');
assert.ok(!calendar.includes('getTrainingLoadData'), 'calendar reuses central daily timeline rather than recalculating load');
assert.ok(css.includes('.calendar-year-matrix') && css.includes('.calendar-day-load-time') && css.includes('.calendar-time-bar-row'), 'calendar uses compact shared visual components');
assert.ok(css.includes('var(--color-surface') && css.includes('var(--color-background'), 'calendar styling follows shared theme tokens');
assert.ok(css.includes('var(--kajo-status-good') && css.includes('var(--kajo-status-critical'), 'semantic status colors remain separate from sport colors');

assert.ok(calendar.includes('function calendarActivitySourceLabel(activity)'), 'calendar exposes explicit activity source provenance');
assert.ok(calendar.includes('Quelle nicht ausgewiesen'), 'unknown activity provenance is not silently presented as manual or imported');
assert.ok(calendar.includes('calendar-week-source'), 'weekly activity entries expose their source');

assert.ok(calendar.includes("const key = type + '::' + format"), 'year calendar keeps Classic and Sprint durations in separate series');
assert.ok(calendar.includes("activity.raceFormat ? ' · ' + activity.raceFormat"), 'day details preserve the activity race format');

assert.ok(calendar.includes('calendar-day-events'), 'selected day detail also shows recorded health and competition symbols');

assert.ok(calendar.includes('data.source === \'Manuell\'') && calendar.includes('data.source.includes(\'Garmin\')'), 'year timeline separates activity source types while retaining sport colors');

assert.ok(calendar.includes("if (state.activeCalendarFormat === 'month') state.currentCalendarDate.setDate(1)"), 'month navigation avoids day-of-month overflow');
assert.ok(calendar.includes('...Object.keys(week.plannedBySport)'), 'year legend includes sports with planned sessions only');

assert.ok(charts.includes('export function getActivityTelemetrySeries(act)'), 'activity chart options are built from available telemetry and FIT series');
assert.ok(charts.includes('export function setActivityTelemetryMetric(metric)'), 'activity chart exposes a single metric switch');
assert.ok(charts.includes('state.activityTelemetryMetric = preferred'), 'activity chart retains a valid selected metric');
assert.ok(html.includes('id="activity-telemetry-switch"'), 'activity detail has one central telemetry switch');
assert.ok(!activities.includes('activityFitSeriesChart'), 'FIT diagnostic panel does not create a second time-series chart');
assert.ok(activities.includes("getSportsCatalog()[act.type]?.color"), 'activity header uses the configured sport color');

assert.ok(activities.includes('function renderActivityComparisons(activity)'), 'activity comparisons are gated by sport-specific comparability');
assert.ok(activities.includes('identische Strecke, Gewässertyp, Pegel und Abfluss'), 'canoe comparisons require matching route and recorded water conditions');
assert.ok(activities.includes('getActivityTelemetrySeries(act).length > 0'), 'telemetry chart remains visible for any supported measured series');

assert.ok(activities.includes("function renderActivityComparisons(activity)"), "activity detail contains function renderActivityComparisons(activity)");
assert.ok(activities.includes("getActivityTelemetrySeries(act).length > 0"), "activity detail contains getActivityTelemetrySeries(act).length > 0");
assert.ok(activities.includes("calculateGarminZoneLoad(act, state.settings, state.profile)"), "activity detail contains calculateGarminZoneLoad(act, state.settings, state.profile)");
assert.ok(activities.includes("['sRPE-Load', srpeItem.value.toFixed(1) + ' AU']"), "activity detail contains ['sRPE-Load', srpeItem.value.toFixed(1) + ' AU']");
assert.ok(activities.includes("panel.classList.add('hidden'); panel.innerHTML = ''; return;"), "activity detail contains panel.classList.add('hidden'); panel.innerHTML = ''; return;");

assert.ok(activities.includes('const storedRouteIds = item =>'), 'comparison rendering reads stored route assignments without inferring or mutating them');

assert.ok(activities.includes("metricsContainer.style.setProperty('--activity-sport-color'"), 'activity metric accents use the configured sport color');
assert.ok(activities.includes('border-sky-800/50 bg-sky-950/20'), 'telemetry availability uses neutral information color, not positive status color');

assert.ok(importer.includes("source:'fit',sources:['fit']"), 'manually imported FIT activities retain their file-import provenance');
assert.ok(activities.includes("zoneLoad.zoneSource === 'maxhr-estimate'"), 'estimated HR-zone basis is explicitly identified in activity load details');

assert.ok(activities.includes('function renderActivityRouteMap(activity)'), 'GPS map is only rendered from stored coordinate pairs');
assert.ok(activities.includes('if (points.length < 2 || !globalThis.L)'), 'GPS map is hidden without valid points or map library');
assert.ok(importer.includes("extractRecordSeries('position_lat', 'latitude')"), 'FIT import extracts GPS coordinates only when present');
assert.ok(html.includes('leaflet@1.9.4'), 'activity route map uses a supported mapping library');

assert.ok(html.includes('id="activity-water-type"'), 'canoe activity detail allows documented flatwater/wildwater context');
assert.ok(activities.includes('if (!currentWaterType || !candidateWaterType || currentWaterType !== candidateWaterType) return false'), 'canoe comparisons require a known matching water type');

assert.ok(activities.includes('export function focusActivityLap(index)'), 'timed native FIT laps can focus their matching chart interval');
assert.ok(importer.includes('startTimeSeconds: lapStartSeconds'), 'FIT lap time ranges are retained for chart alignment');
assert.ok(main.includes('focusActivityLap,'), 'lap focus action is exposed to activity detail controls');

assert.ok(charts.includes('activity-lap-highlight'), 'selected timed laps are highlighted on the shared time-series chart');
assert.ok(charts.includes('state.activitySelectedLap'), 'chart highlight uses the selected lap time range');

assert.ok(charts.includes("const complete = hasElapsedTime && validCount === selected.values.length"), 'activity telemetry distinguishes complete from limited data');
assert.ok(activities.includes('grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs border-b border-slate-800 py-2 w-full text-left'), 'time-aligned laps are directly selectable without duplicate class attributes');

assert.ok(activities.includes('Math.round(otherDistance * 100) === Math.round(distance * 100)'), 'comparisons use the same recorded distance rather than arbitrary duration bands');
assert.ok(activities.includes('levelA !== levelB'), 'canoe comparisons require identical documented water level');
assert.ok(activities.includes('if (!activity.raceFormat) return false'), 'canoe comparison requires a known Classic or Sprint discipline');

assert.ok(css.includes('html[data-theme="light"] #csv-details-modal .activity-detail-shell'), 'activity details provide explicit light-theme styling');


const trainingLoadView = readFileSync('js/training-load-view.js', 'utf8');
assert.ok(html.includes('id="training-load-overview"'), 'Training Load has a dedicated overview');
assert.ok(html.includes('id="training-load-metric-detail"'), 'Training Load has a dedicated metric detail view');
for (const metric of ['ctl', 'atl', 'tsb']) {
  assert.ok(html.includes('data-training-load-metric="' + metric + '"'), 'Training Load metric is directly selectable: ' + metric);
  assert.ok(trainingLoadView.includes(metric + ": ["), 'Training Load detail metadata exists: ' + metric);
}
assert.ok(main.includes("from './training-load-view.js'"), 'Training Load view module is wired into main navigation');
assert.ok(main.includes('kajoRenderTrainingLoadView: renderTrainingLoadView'), 'Training Load view refresh is exposed to shared timeframe controls');
assert.ok(charts.includes('window.kajoRenderTrainingLoadView?.()'), 'shared analysis timeframe refreshes the Training Load chart');
assert.ok(trainingLoadView.includes("['complete', 'confirmed-rest'].includes(x.dataStatus)"), 'only complete or confirmed-rest days supply the current model value');
assert.ok(trainingLoadView.includes('spanGaps: false'), 'unknown or incomplete days remain visible as chart gaps');
assert.ok(!trainingLoadView.includes('monotony') && !trainingLoadView.includes('training strain'), 'unsupported load metrics are not fabricated');

assert.ok(calculations.includes('export function calculateStrengthActivitySummary(exercises)'), 'strength volume calculation is centralized');
assert.ok(calculations.includes('completeSets.length === sets.length'), 'strength volume is withheld when any set lacks data');
assert.ok(activities.includes('function renderActivityStrengthAnalysis(activity)'), 'strength sessions have a dedicated read-only detail module');
assert.ok(html.includes('id="activity-strength-analysis-panel"'), 'strength detail panel is part of the activity detail structure');

assert.ok(charts.includes('paceSecondsPerKm') && charts.includes('paceSecondsPer100m'), 'pace series are offered only when unit-specific pace streams exist');
assert.ok(activities.includes("' min/100 m'"), 'swim pace uses a 100-metre unit rather than min/km');

const overviewModule = readFileSync('js/analysis-overview.js', 'utf8');
assert.ok(html.includes('id="analysis-subpage-overview"'), 'analysis has a dedicated overview page');
assert.ok(html.includes('id="analysis-overview-domains"'), 'overview presents all four analysis domains');
assert.ok(['load','recovery','performance','health'].every(id => html.includes("switchTab('analysis-" + id + "')")), 'overview domain cards open their detail pages');
assert.ok(html.includes('id="analysis-overview-trend-chart"'), 'overview has one shared trend chart');
assert.ok(overviewModule.includes("['complete', 'confirmed-rest'].includes(day.dataStatus)"), 'load trend excludes unknown and incomplete days');
assert.ok(overviewModule.includes('spanGaps: false'), 'overview trend preserves missing data gaps');
assert.ok(main.includes("sub === 'overview'") && main.includes('renderAnalysisOverview()'), 'overview is routed and rendered from main navigation');
assert.ok(main.includes("'analysis-overview': { parent: 'analysis', view: 'analyses', sub: 'overview' }"), 'primary analysis route opens the overview');
assert.ok(charts.includes('window.kajoRenderAnalysisOverview?.()'), 'shared timeframe refreshes the overview trend');
assert.ok(css.includes('.kajo-analysis-domain-grid'), 'overview uses responsive compact domain cards');
