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
const analysisInsights = readFileSync('js/analysis-insights.js', 'utf8');
const charts = readFileSync('js/charts.js', 'utf8');
const dashboard = readFileSync('js/dashboard.js', 'utf8');
const importer = readFileSync('js/import.js', 'utf8');
const dataSource = readFileSync('js/data-source.js', 'utf8');
const health = readFileSync('js/health.js', 'utf8');
const healthData = readFileSync('js/health-data.js', 'utf8');
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
  if (domain !== 'performance' && domain !== 'health') assert.ok(html.includes('id="' + domain + '-hero-ring"'), domain + ' uses the shared hero metric ring');
}
assert.ok(css.includes('one centered, consistently sized hero metric'), 'analysis pages share the centered hero layout');

assert.ok(css.includes('#analysis-subpage-load > #analysis-load-section { order: 2; }'), 'training load trend precedes supporting metric rows');
assert.ok(css.includes('#analysis-subpage-recovery > #recovery-objective-group { order:2; }'), 'objective recovery metrics follow the hero');
assert.ok(css.includes('#analysis-subpage-recovery > #recovery-subjective-group { order:3; }'), 'subjective recovery metrics follow objective metrics');
assert.ok(css.includes('#analysis-subpage-recovery > #view-health-data { order:5; }'), 'recovery history follows the summary sections');
assert.ok(html.includes('id="health-trend-panel"'), 'Health detail trend has a stable analysis section target');

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
assert.ok(calendar.includes("const formats = ['day', 'week', 'month', 'year', 'activities', 'season']"), 'calendar supports day/week/month/year/activities/season');
assert.match(state, /activeCalendarFormat:\s*'week'/, 'week is the default calendar mode');


for (const id of ['load-hero-ring', 'recovery-hero-ring']) {
  assert.ok(html.includes('id="' + id + '"'), 'consistent analysis hero ring: ' + id);
}
assert.ok(html.includes('id="analysis-shared-period"'), 'shared analysis period container exists');
assert.ok(html.includes('id="health-documentation-metrics"'), 'Health has separate documented-event metric circles');
assert.ok(html.includes('id="health-trend-chart"') && html.includes('data-health-range="28d"'), 'Health has a selectable trend chart and time ranges');
assert.ok(analysisUI.includes('Tage ohne Balken sind nicht dokumentiert'), 'missing health entries are not interpreted as healthy days');
assert.ok(analysisUI.includes('item?.cycle?.period===true'), 'cycle trends use only explicitly documented cycle entries');
assert.ok(analysisUI.includes('keine medizinische Interpretation') || analysisUI.includes('keine medizinische Interpretation.'), 'Health trend avoids medical interpretation');
assert.ok(analysisUI.includes("['HRV', 'hrv', 'ms', 1]") && analysisUI.includes('const entry = latestCheckin(key)'), 'recovery exposes the latest raw HRV measurement as a separate metric');
assert.ok(analysisUI.includes('const readiness = calculateReadiness(todayKey())') && analysisUI.includes('const score = readiness.enoughData ? readiness.score : null'), 'aggregate recovery value reuses the existing calculation for the analysis overview');
assert.ok(!html.includes('id="analysis-regeneration-section"') && !html.includes('id="recovery-hero-note" class="kajo-analysis-hero-note"'), 'Recovery detail does not display a readiness summary');
assert.ok(!html.includes('id="health-hero-ring"') && !html.includes('id="health-availability-status"'), 'Health does not display an unsupported availability score');
assert.ok(analysisUI.includes('historyRingColor(key, entry.value, entry.date)'), 'each recovery circle uses the existing metric-specific status classification');
assert.ok(css.includes('--recovery-metric-color') && css.includes('border-color:var(--recovery-metric-color'), 'recovery circles display their individual status color');
assert.ok(analysisUI.includes('Garmin-Import noch nicht angebunden'), 'Body Battery import limitation is disclosed');
assert.ok(html.includes('id="load-analysis-sources"'), 'load source methods have a separate comparison row');
assert.ok(analysisUI.includes('Kein eigenständiges Datenfeld nachgewiesen'), 'Edwards TRIMP is not fabricated when no distinct field is present');
assert.ok(!html.includes('id="training-history-title"'), 'Performance no longer embeds the training-load history panel');
assert.ok(analysisUI.includes("openTrainingMetric('fitness')"), 'CTL opens the existing fitness detail view');
assert.ok(analysisUI.includes("openTrainingMetric('form')"), 'training balance opens the existing balance detail view');
assert.ok(analysisInsights.includes('toggleRecoveryMetric') && analysisInsights.includes('renderMetricHistory(\'health\')'), 'recovery metric circles open their existing detail history');
assert.ok(analysisUI.includes('kajo-analysis-metric-link'), 'supported analysis metrics are keyboard-accessible buttons');

assert.ok(analysisUI.includes('Ältere Messwerte ohne Quellenmetadaten bleiben jedoch unbekannt'), 'legacy HRV values remain unclassified');
assert.ok(dashboard.includes('Persönlicher Normalbereich noch nicht methodisch festgelegt'), 'unapproved wearable ranges are not presented as personal norms');
assert.ok(!dashboard.includes('Im persönlichen Bereich'), 'legacy personal-range classification is suppressed');
assert.ok(charts.includes("state.metricHistoryRange = tf"), 'shared timeframe synchronizes detail history');

assert.ok(importer.includes("['hrv', 'HRV (RMSSD)']"), 'Intervals wellness HRV field is identified as RMSSD');
assert.ok(importer.includes("['hrvSDNN', 'HRV (SDNN)']"), 'Intervals SDNN field is separately identified');
assert.ok(importer.includes("incoming.hrv = hrv"), 'Intervals HRV is stored in the shared check-in HRV key');
assert.ok(importer.includes("source: 'intervals', metric: 'rmssd', unit: 'ms'"), 'Intervals HRV carries explicit RMSSD provenance');
assert.ok(importer.includes('const canImportIntervalsMetric = key =>'), 'Intervals wellness import protects existing values');
assert.ok(importer.includes("measurementSources[key]?.source === 'intervals'"), 'Intervals only refreshes values previously sourced from Intervals');
assert.ok(importer.includes("setIntervalsMetric('rhr', rhr, 'resting_heart_rate', 'bpm')"), 'Intervals resting heart rate carries provenance');
assert.ok(health.includes("['input-hrv', 'hrv'"), 'manual HRV uses the same check-in key');
assert.ok(health.includes("source: 'manual', metric: 'unspecified', unit: 'ms'"), 'manual HRV is marked as manual with unspecified measurement method');
assert.ok(healthData.includes('if (identity === null) return null;'), 'personal baselines require documented measurement provenance');
assert.ok(healthData.includes('measurementIdentity(row, key) === identity'), 'personal baselines compare only matching measurement identities');
assert.ok(main.includes('importedValues += metricKeys.length;'), 'Garmin restore preview counts actual measurements, not metadata objects');
assert.ok(main.includes("garminStress: findGarminNumber(records.stress"), 'Garmin stress is extracted from stored stress records');
assert.ok(main.includes("bodyBattery: findGarminNumberInNamedSection(summaryPayload, 'bodyBattery'"), 'Body Battery extraction uses the named summary section');
assert.ok(main.includes("spo2: findGarminNumber(records.spo2"), 'SpO2 is extracted from stored Garmin SpO2 records');
assert.ok(main.includes("source: 'garmin', ...definition"), 'restored Garmin measurements retain explicit provenance');
assert.ok(analysisUI.includes('nur eindeutig als Intervals-RMSSD gekennzeichnete Werte eignen sich'), 'only identified Intervals RMSSD values are eligible for ln(RMSSD)');
assert.ok(!analysisUI.includes(String.fromCharCode(92) + 'n  const fromKey'), 'health analysis renderer contains no escaped source newlines');

assert.ok(activities.includes('initializeActivityDetailTabs'), 'activity details initialize the shared tab layout');
assert.ok(activities.includes("createAccordion('intervals', 'Intervalle & Runden'") && activities.includes("createAccordion('sport', 'Sportartspezifische Analyse'"), 'activity details expose the current accordion analysis areas');
assert.ok(activities.includes('activity-metric-circle-card') && activities.includes('colors[metric.label]'), 'activity overview uses sport-aware metric circles');
assert.ok(css.includes('.activity-detail-tabs') && css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'activity tabs and metric circles have mobile styling');
assert.ok(activities.includes('activity-data-quality') && activities.includes('activity-telemetry-diagnostic-output'), 'data quality and diagnostics remain accessible in the data tab');
assert.ok(html.includes('id="activity-telemetry-diagnostic-source"'), 'telemetry diagnostics originate outside the chart panel so missing data cannot remove the controls');
assert.ok(activities.includes("event.target?.closest?.('#activity-telemetry-diagnose')"), 'telemetry diagnostic button has a delegated click handler');

assert.ok(html.includes('id="training-subnav-strength"'), 'strength is reachable from the training subnavigation');
assert.ok(main.includes("strength: { parent: 'training', view: 'strength', sub: 'strength' }"), 'strength route belongs to the training area');
assert.ok(!html.includes('onclick="switchTab(\'strength\')"><span class="kajo-area-icon"'), 'strength is no longer listed under More');
assert.ok(main.includes("['activities', 'planning', 'competitions', 'strength'].forEach"), 'training subnavigation highlights the active competitions and strength sections');
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
assert.ok(calendar.includes('function renderCalendarMonthSummary(date, target)'), 'month day selection renders a compact summary instead of the full day detail');
assert.ok(calendar.includes('Tageszusammenfassung') && calendar.includes('Absolviertes Training') && calendar.includes('Geplantes Training'), 'month summary separates completed and planned training');
assert.ok(calendar.includes('data.loadValue === null') && calendar.includes('data.durationComplete ?'), 'month summary respects missing load and incomplete duration data');
assert.ok(calendar.includes("detail.classList.toggle('hidden', !sameMonth)") && calendar.includes('renderCalendarDayDetail(selectedDate, detail)'), 'month day detail renders below the month grid without leaving the month view');
assert.ok(calendar.includes("renderCalendarDayDetail(toLocalDateString(state.currentCalendarDate), 'cal-format-day')"), 'day view uses the same day-detail renderer');
const dayDetailStart = calendar.indexOf('function renderCalendarDayDetail');
const dayDetailEnd = calendar.indexOf('export function openCalendarDay', dayDetailStart);
const dayDetail = calendar.slice(dayDetailStart, dayDetailEnd);
assert.ok(dayDetail.indexOf('Tagesverlauf') < dayDetail.indexOf('Absolviertes Training') && dayDetail.indexOf('Absolviertes Training') < dayDetail.indexOf('Recovery & Gesundheit'), 'day cockpit order is timeline, completed training, recovery and health');
assert.ok(calendar.includes('getSportsCatalog()'), 'calendar activity colors come from configured sport colors');
assert.ok(calendar.includes("calendar-month-sport-marker ' + (planned ? 'is-planned' : 'is-completed')") && calendar.includes('calendar-entry-status is-completed'), 'sport color is separate from planned/completed status');
assert.ok(calendar.includes('calendarEventIcons(date)'), 'calendar shows distinct event symbols');
assert.ok(calendar.includes('item?.cycle?.period === true'), 'calendar shows recorded menstruation days only');
assert.ok(calendar.includes('calendar-year-week-cell') && calendar.includes('calendar-year-month-label') && calendar.includes('calendar-year-sport-segment'), 'year view is a month and calendar-week matrix with sport-specific bars');
assert.ok(calendar.includes('calendar-year-planned-segment'), 'year view distinguishes planned sessions from completed training time');
assert.ok(calendar.includes('calendar-week-strip') && calendar.includes('calendar-week-dot'), 'week view includes a seven-day horizontal overview with activity and health markers');
assert.ok(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))') && css.includes('.calendar-week-strip-day {\n  min-width:0;'), 'mobile week strip keeps all seven day cells in one equal-width row');
assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))') && css.includes('.calendar-view-switch'), 'calendar view selector keeps all four views in one row');
assert.ok(calendar.includes('calendar-week-agenda-day') && calendar.includes('calendar-week-agenda'), 'week view keeps all seven days in a vertical agenda');
assert.ok(calendar.includes('selectCalendarWeekDay') && calendar.includes('scrollIntoView'), 'horizontal day selection focuses the matching agenda section');
assert.ok(calendar.includes('openPlannedCalendarDetail') && calendar.includes('openCSVDetailsModal'), 'completed and planned weekly sessions open their respective detail views');
assert.ok(calendar.includes('Number(timeline.activityCount) === Number(timeline.loadActivityCount)'), 'daily training load is shown only with complete activity coverage');
assert.ok(calendar.includes('data.durationComplete') && calendar.includes('data.durationTotal'), 'daily training time exposes incomplete duration coverage without adding an unagreed comparison panel');
assert.ok(!calendar.includes('getTrainingLoadData'), 'calendar reuses central daily timeline rather than recalculating load');
assert.ok(css.includes('.calendar-year-matrix') && css.includes('.calendar-day-load-time') && css.includes('.calendar-time-bar-row'), 'calendar uses compact shared visual components');
assert.ok(css.includes('var(--color-surface') && css.includes('var(--color-background'), 'calendar styling follows shared theme tokens');
assert.ok(css.includes('var(--kajo-status-good') && css.includes('var(--kajo-status-critical'), 'semantic status colors remain separate from sport colors');

assert.ok(calendar.includes('function calendarActivitySourceLabel(activity)'), 'calendar exposes explicit activity source provenance');
assert.ok(calendar.includes('Quelle nicht ausgewiesen'), 'unknown activity provenance is not silently presented as manual or imported');
assert.ok(calendar.includes('calendarActivitySourceLabel(activity)') && calendar.includes("planned ? 'Planung' : calendarActivitySourceLabel(activity)"), 'weekly activity entries expose their source');

assert.ok(calendar.includes("const key = type + '::' + format"), 'year calendar keeps Classic and Sprint durations in separate series');
assert.ok(calendar.includes("activity.raceFormat ? ' · ' + activity.raceFormat"), 'day details preserve the activity race format');

assert.ok(calendar.includes("calendarDayEvent('Menstruation dokumentiert'") && calendar.includes("calendarDayEvent(item.name || 'Wettkampf'"), 'health, cycle and competition events remain in the chronological timeline');
assert.ok(!dayDetail.includes('calendar-day-events') && !dayDetail.includes('calendarRaceRow') && !dayDetail.includes('calendar-day-duration-comparison') && !dayDetail.includes('calendar-day-edit-row'), 'day view excludes unagreed duplicate sections and controls');
assert.ok(calendar.includes('calendar-day-kpis') && calendar.includes('calendar-day-timeline'), 'day view renders a KPI cockpit and chronological event timeline');
assert.ok(calendar.includes('Absolviertes Training') && calendar.includes('Geplantes Training'), 'day view separates completed and planned sessions');
assert.ok(calendar.includes('calendar-day-recovery-rings') && calendar.includes('subjectiveMarkup'), 'day view keeps recovery compact with documented recovery rings and subjective metrics');
assert.ok(calendar.includes("Tagesreflexion") && calendar.includes("openDailyNote(") && dashboard.includes("openDailyNote(requestedDate = null)"), "day view reuses date-specific daily notes for reflection");
assert.ok(calendar.includes('export function openCalendarDay(date, keepMonth = false)') && calendar.includes("state.currentCalendarDate = new Date(date + 'T12:00:00')"), 'day view opens the selected date and updates the calendar period');
assert.ok(calendar.includes('state.selectedCalendarDay = date') && calendar.includes("setCalendarFormat('day')"), 'day view opens the selected date in the day format');
assert.ok(css.includes('.calendar-day-timeline-item') && css.includes('.calendar-day-kpis'), 'day cockpit has responsive timeline and KPI styling');

assert.ok(calendar.includes('data.source === \'Manuell\'') && calendar.includes('data.source.includes(\'Garmin\')'), 'year timeline separates activity source types while retaining sport colors');

assert.ok(calendar.includes("if (state.activeCalendarFormat === 'month') state.currentCalendarDate.setDate(1)"), 'month navigation avoids day-of-month overflow');
assert.ok(calendar.includes('...Object.keys(week.plannedBySport)'), 'year legend includes sports with planned sessions only');
assert.ok(calendar.includes('calendar-year-kpis') && calendar.includes("label: 'Training Load'"), 'year view starts with season KPIs including the selected load metric');
assert.ok(calendar.includes('calendarYearLoadColor') && calendar.includes("week.loadStatus === 'unknown'"), 'year matrix colors use weekly load and preserve unknown coverage');
assert.ok(calendar.includes('calendar-year-month-chart') && calendar.includes('calendar-year-sport-list'), 'year view compares monthly load and sport-specific training time');
assert.ok(calendar.includes('calendarYearBuildPhaseSuggestions') && calendar.includes('confirmCalendarSeasonPhase'), 'year view suggests and persists reviewable training phases');
assert.ok(calendar.includes('calendar-year-timeline') && calendar.includes('calendar-year-phase-editor'), 'year view includes season events and an editable phase workflow');
assert.ok(main.includes('confirmCalendarSeasonPhase,') && main.includes('saveCalendarPhaseEditor,'), 'annual phase controls are exposed to calendar interactions');


assert.ok(charts.includes('export function getActivityTelemetrySeries(act)'), 'activity chart options are built from available telemetry and FIT series');
assert.ok(charts.includes('export function setActivityTelemetryMetric(metric)'), 'activity chart exposes a single metric switch');
assert.ok(charts.includes('state.activityTelemetryMetric = next[0]') && charts.includes('state.activityTelemetryMetrics = next'), 'activity chart retains valid selected telemetry metrics');
assert.ok(html.includes('id="activity-telemetry-switch"'), 'activity detail has one central telemetry switch');
assert.ok(!activities.includes('activityFitSeriesChart'), 'FIT diagnostic panel does not create a second time-series chart');
assert.ok(activities.includes("getSportsCatalog()[act.type]?.color"), 'activity header uses the configured sport color');

assert.ok(activities.includes('function renderActivityComparisons(activity)'), 'activity comparisons are gated by sport-specific comparability');
assert.ok(activities.includes('identische Strecke, Gewässertyp, Pegel und Abfluss'), 'canoe comparisons require matching route and recorded water conditions');
assert.ok(activities.includes('getActivityTelemetrySeries(act).length > 0'), 'telemetry chart remains visible for any supported measured series');

assert.ok(activities.includes("function renderActivityComparisons(activity)"), "activity detail contains function renderActivityComparisons(activity)");
assert.ok(activities.includes("getActivityTelemetrySeries(act).length > 0"), "activity detail contains getActivityTelemetrySeries(act).length > 0");
assert.ok(activities.includes("calculateGarminZoneLoad(act, state.settings, state.profile, state.dailyCheckins)"), "activity detail contains calculateGarminZoneLoad(act, state.settings, state.profile)");
assert.ok(activities.includes("['sRPE-Load', srpeItem.value.toFixed(1) + ' AU']"), "activity detail contains ['sRPE-Load', srpeItem.value.toFixed(1) + ' AU']");
assert.ok(activities.includes("panel.classList.add('hidden'); panel.innerHTML = ''; return;"), "activity detail contains panel.classList.add('hidden'); panel.innerHTML = ''; return;");

assert.ok(activities.includes('const storedRouteIds = item =>'), 'comparison rendering reads stored route assignments without inferring or mutating them');

assert.ok(activities.includes("metricsContainer.style.setProperty('--activity-sport-color'"), 'activity metric accents use the configured sport color');
assert.ok(activities.includes('border-sky-800/50 bg-sky-950/20'), 'telemetry availability uses neutral information color, not positive status color');

assert.ok(importer.includes("source:'fit',sources:['fit']"), 'manually imported FIT activities retain their file-import provenance');
assert.ok(activities.includes("zoneLoad.restingHrSource === 'profile-fallback'"), 'profile resting-HR fallback is explicitly identified in activity load details');

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

assert.ok(charts.includes("const hasElapsedTime = times.length === timeSource.values.length") && charts.includes("validCount.toLocaleString('de-DE')") && charts.includes('Messreihen gleichzeitig'), 'activity telemetry reports measured-value coverage and whether the time axis is reliable');
assert.ok(activities.includes('grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs border-b border-slate-800 py-2 w-full text-left'), 'time-aligned laps are directly selectable without duplicate class attributes');

assert.ok(activities.includes('Math.round(otherDistance * 100) === Math.round(distance * 100)'), 'comparisons use the same recorded distance rather than arbitrary duration bands');
assert.ok(activities.includes('levelA !== levelB'), 'canoe comparisons require identical documented water level');
assert.ok(activities.includes('if (!activity.raceFormat) return false'), 'canoe comparison requires a known Classic or Sprint discipline');

assert.ok(css.includes('html[data-theme="light"] #csv-details-modal .activity-detail-shell'), 'activity details provide explicit light-theme styling');


const trainingLoadView = readFileSync('js/training-load-view.js', 'utf8');
const trainingLoadCalculation = readFileSync('js/training-load.js', 'utf8');
assert.ok(html.includes('id="training-load-overview"'), 'Training Load has a dedicated overview');
assert.ok(html.includes('data-training-load-model="kajo"') && html.includes('data-training-load-model="edwards"'), 'Training Load offers KAJO and Edwards HR-zone models');
assert.ok(html.includes('id="training-load-zone-chart"') && html.includes('id="training-load-daily-chart"'), 'Training Load shows zone distribution and daily HR-zone load');
assert.ok(!html.includes('data-training-load-model="srpe"') && !html.includes('training-load-value-ctl'), 'sRPE and CTL/ATL/TSB are excluded from the initial HR-zone view');
assert.ok(main.includes("from './training-load-view.js?v=") || main.includes("from './training-load-view.js'"), 'Training Load view module is wired into main navigation');
assert.ok(main.includes('kajoRenderTrainingLoadView: renderTrainingLoadView'), 'Training Load view refresh is exposed to shared timeframe controls');
assert.ok(charts.includes('window.kajoRenderTrainingLoadView?.()'), 'shared analysis timeframe refreshes the Training Load chart');
assert.ok(trainingLoadView.includes('getHeartRateZoneAnalysis'), 'view uses the centralized HR-zone calculation');
assert.ok(trainingLoadCalculation.includes('export function getHeartRateZoneAnalysis'), 'central calculation exposes both HR-zone models');
assert.ok(/pct\s*<\s*50/.test(trainingLoadCalculation), 'Edwards excludes HR time below 50% HRmax');
assert.ok(trainingLoadView.includes('spanGaps: false'), 'days without eligible HR data remain visible as chart gaps');


assert.ok(calculations.includes('export function calculateStrengthActivitySummary(exercises)'), 'strength volume calculation is centralized');
assert.ok(calculations.includes('completeSets.length === sets.length'), 'strength volume is withheld when any set lacks data');
assert.ok(activities.includes('function renderActivityStrengthAnalysis(activity)'), 'strength sessions have a dedicated read-only detail module');
assert.ok(html.includes('id="activity-strength-analysis-panel"'), 'strength detail panel is part of the activity detail structure');

assert.ok(charts.includes('paceSecondsPerKm') && charts.includes('paceSecondsPer100m'), 'pace series are offered only when unit-specific pace streams exist');
assert.ok(activities.includes("' min/100 m'"), 'swim pace uses a 100-metre unit rather than min/km');


const performanceUi = readFileSync('js/analysis-ui.js', 'utf8');
assert.ok(html.includes('id="fitness-aerobic-metrics"') && html.includes('id="fitness-overview-view"'), 'Fitness opens with its own aerobic fitness view');
assert.ok(html.includes('id="performance-detail-view"') && html.includes('onclick="openPerformanceDetail()"'), 'Performance is a separate circle with its own detail view');
assert.ok(html.includes('id="performance-paddling-metrics"') && html.includes('id="performance-strength-metrics"'), 'Performance detail separates paddling and strength dimensions');
assert.ok(html.includes('id="performance-trend-chart"') && html.includes('data-performance-range="28d"'), 'Performance has a dedicated selectable trend chart and time ranges');
assert.ok(performanceUi.includes('getActivityTelemetrySeries(activity)'), 'Performance reads existing provenance-gated activity telemetry');
assert.ok(performanceUi.includes('Garmin-Schätzwert') && performanceUi.includes('keine direkte Spiroergometrie'), 'VO2max is explicitly described as a Garmin estimate');
assert.ok(performanceUi.includes('Verlauf innerhalb einer Einheit; kein Vergleich'), 'activity telemetry is not misrepresented as comparable cross-session performance');
assert.ok(performanceUi.includes('state.strengthPBs'), 'strength progression uses stored exercise-specific personal best records');
assert.ok(html.includes('<span>Fitness</span>') && html.includes('id="fitness-aerobic-metrics"'), 'analysis navigation identifies the fitness view separately from performance');

const overviewModule = readFileSync('js/analysis-overview.js', 'utf8');
assert.ok(html.includes('id="analysis-subpage-overview"'), 'analysis has a dedicated overview page');
assert.ok(html.includes('class="kajo-analysis-circles"'), 'overview begins with the four agreed metric circles');
assert.ok(['load','recovery','performance','health'].every(id => html.includes('id="overview-' + id + '-ring"')), 'overview renders load, recovery, fitness and health circles');
assert.ok(['Load','Recovery','Fitness','Health'].every(label => html.includes('>' + label + '</strong>')), 'overview uses the four agreed performance dimensions');
assert.ok(html.includes('id="analysis-overview-trend-chart"'), 'overview has a combined four-dimension trend chart');
assert.ok(html.includes('data-overview-metric="health"'), 'Health remains selectable but is explicitly marked as unavailable');
assert.ok(html.includes('id="analysis-overview-activity-chart"') && html.includes('data-overview-activity-measure="sessions"'), 'sport distribution supports duration and session count');
assert.ok(html.includes('id="analysis-overview-intensity-chart"'), 'overview includes heart-rate intensity distribution');
assert.ok(!html.includes('<h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white">Analyse</h1>'), 'overview has no redundant Analyse page heading');
assert.ok(!html.includes('id="analysis-overview-detail-content"'), 'overview keeps detailed analysis in the four dedicated subpages');
assert.ok(overviewModule.includes('setAnalysisOverviewMetric') && overviewModule.includes('selectedMetrics = new Set'), 'overview exposes multi-series toggles with all currently supported series selected initially');
assert.ok(overviewModule.includes('function toRelativeIndex') && overviewModule.includes('baseline: Number(baseline)'), 'overview normalizes supported series to a relative index');
assert.ok(overviewModule.includes('spanGaps: false'), 'overview time series preserve missing-data gaps');
assert.ok(overviewModule.includes('getSportsCatalog'), 'activity chart reuses configured sport colors');
assert.ok(overviewModule.includes("document.getElementById('analysis-' + domain + '-hero-value')"), 'overview reads the existing domain hero values');
assert.ok(overviewModule.includes('Health availability is deliberately not inferred'), 'Health does not fabricate a continuous availability score');
assert.ok(overviewModule.includes('renderHeartRateZoneDistribution'), 'intensity distribution reuses the existing heart-rate zone analysis');
assert.ok(charts.includes('options.canvasId || \'heartRateZonesChart\''), 'heart-rate zone chart supports a dedicated overview target');
assert.ok(main.includes("sub === 'overview'") && main.includes('renderAnalysisOverview()'), 'overview is routed and rendered from main navigation');
assert.ok(main.includes("'analysis-overview': { parent: 'analysis', view: 'analyses', sub: 'overview' }"), 'primary analysis route opens the overview');
assert.ok(css.includes('.kajo-analysis-circles') && css.includes('grid-template-columns:repeat(4'), 'four circles remain in a compact horizontal row on mobile');

assert.ok(html.includes('id="activity-data-quality"'), 'activity overview exposes a compact data quality and provenance summary');
assert.ok(html.includes('id="activity-telemetry-point"'), 'activity chart provides a selected-point readout');
assert.ok(charts.includes('const timeLabel = labels[element.index]') && charts.includes('pointReadout.textContent = metric.label +'), 'activity chart selection reports the exact time and value through the shared readout');
assert.ok(charts.includes("pace: { label: 'Pace', unit: 's/km'") && charts.includes("swimPace: { label: 'Pace', unit: 's/100 m'"), 'pace charts use sport-appropriate display units');
assert.ok(charts.includes("getSportsCatalog()[act?.type]?.color"), 'telemetry series use the configured activity sport color');
assert.ok(activities.includes('function renderActivityDataQuality(activity)'), 'activity details expose provenance and data completeness');
assert.ok(activities.includes("container.dataset.status = series.length ? (hasTimeAxis ? 'complete' : 'limited') : 'not-calculable'"), 'activity data quality distinguishes complete, limited and not calculable');
assert.ok(activities.includes('candidate.trainingPartner !== activity.trainingPartner'), 'C2 comparisons require the same documented partner');
assert.ok(activities.includes('escape(getActivitySourceLabel(candidate))'), 'comparison entries retain their source provenance');
assert.ok(activities.includes('activity-metric-circle-card') && activities.includes('colors[metric.label]'), 'activity metrics use sport-aware circular indicators with consistent metric colors');

assert.ok(activities.includes('lat.reduce((count, rawLat, index)'), 'activity data quality counts only valid GPS coordinate pairs');

assert.ok(dataSource.includes('export function getActivityTelemetry(activity)'), 'activity telemetry accessor accepts explicitly identified FIT imports');
assert.ok(dataSource.includes('activity?.source === \'fit\'') && dataSource.includes("activity.sources.includes('fit')"), 'only explicit FIT provenance enables imported FIT time series');
assert.ok(dataSource.includes('if (!explicitFitSource) return null'), 'ambiguous legacy generic telemetry remains excluded');
assert.ok(charts.includes('getActivityTelemetry(act)'), 'activity chart reads Garmin or explicitly sourced FIT telemetry');
assert.ok(activities.includes('telemetry: getActivityTelemetry(act)'), 'activity detail passes the verified telemetry source to its modules');

assert.ok(activities.includes('getActivityTelemetry(activity)'), 'activity detail uses provenance-gated telemetry for FIT and Garmin streams');
assert.ok(activities.includes('FIT-Datei-Runden'), 'activity laps identify their FIT-file origin');

assert.ok(charts.includes('export function focusActivityTelemetryPoint(index)'), 'GPS route points can focus a corresponding telemetry datapoint');
assert.ok(activities.includes('canLinkRouteToChart'), 'GPS-to-chart interaction is enabled only for aligned time and metric arrays');
assert.ok(importer.includes('avgPower: Number(lap.avg_power) || null'), 'FIT lap power is preserved only when supplied by the file');
assert.ok(activities.includes("avgCadence !== null ? 'Ø ' + Math.round(avgCadence) + '/min' : null"), 'lap cadence is displayed only when available');
