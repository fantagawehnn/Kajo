import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const activities = readFileSync('js/activities.js', 'utf8').replace(/\r\n/g, '\n');
const calculations = readFileSync('js/calculations.js', 'utf8').replace(/\r\n/g, '\n');
const css = readFileSync('css/styles.css', 'utf8').replace(/\r\n/g, '\n');
const main = readFileSync('js/main.js', 'utf8').replace(/\r\n/g, '\n');
const calendar = readFileSync('js/calendar.js', 'utf8').replace(/\r\n/g, '\n');
const state = readFileSync('js/state.js', 'utf8').replace(/\r\n/g, '\n');
const analysisUI = readFileSync('js/analysis-ui.js', 'utf8').replace(/\r\n/g, '\n');
const analysisOverview = readFileSync('js/analysis-overview.js', 'utf8').replace(/\r\n/g, '\n');
const planning = readFileSync('js/planning.js', 'utf8').replace(/\r\n/g, '\n');
const analysisInsights = readFileSync('js/analysis-insights.js', 'utf8').replace(/\r\n/g, '\n');
const charts = readFileSync('js/charts.js', 'utf8').replace(/\r\n/g, '\n');
const dashboard = readFileSync('js/dashboard.js', 'utf8').replace(/\r\n/g, '\n');
const importer = readFileSync('js/import.js', 'utf8').replace(/\r\n/g, '\n');
const dataSource = readFileSync('js/data-source.js', 'utf8').replace(/\r\n/g, '\n');
const health = readFileSync('js/health.js', 'utf8').replace(/\r\n/g, '\n');
const uiActions = readFileSync('js/ui-actions.js', 'utf8').replace(/\r\n/g, '\n');
const competitions = readFileSync('js/competitions.js', 'utf8').replace(/\r\n/g, '\n');
const garminFunction = readFileSync('supabase/functions/garmin-personal/index.ts', 'utf8').replace(/\r\n/g, '\n');

const primary = ['today', 'calendar', 'training', 'analysis', 'more'];
for (const id of primary) {
  assert.equal((html.match(new RegExp('id="nav-' + id + '"', 'g')) || []).length, 1, 'one desktop tab: ' + id);
  assert.equal((html.match(new RegExp('id="mobile-nav-' + id + '"', 'g')) || []).length, 1, 'one mobile tab: ' + id);
}
assert.equal((html.match(/id="nav-(?:today|calendar|training|analysis|more)"/g) || []).length, 5);
assert.equal((html.match(/id="mobile-nav-(?:today|calendar|training|analysis|more)"/g) || []).length, 5);
assert.doesNotMatch(html, /id="nav-(?:dashboard|analyses|areas)"/);

const dataManagementStart = html.indexOf('id="view-data"');
const dataManagementEnd = html.indexOf('id="view-backup"', dataManagementStart);
const nutritionStart = html.indexOf('id="view-nutrition"');
const nutritionEnd = html.indexOf('id="view-upload"', nutritionStart);
const garminArchivePosition = html.indexOf('id="garmin-archive-file"');
assert.ok(dataManagementStart >= 0 && garminArchivePosition > dataManagementStart && garminArchivePosition < dataManagementEnd, 'Garmin archive upload is located inside data management with the Garmin data source');
assert.ok(!(garminArchivePosition > nutritionStart && garminArchivePosition < nutritionEnd), 'Garmin archive is not located inside nutrition');
assert.ok(main.includes("if (view === 'data') void renderGarminExportArchiveHistory();"), 'Garmin archive history loads when data management is opened');

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
assert.ok(main.includes("const candidateEnd = addUtcDays(cursor, 6)"), 'long Garmin history is split into seven-day server requests');
assert.ok(garminFunction.includes('maxDaysPerInvocation = 1') && garminFunction.includes('Math.min(2, Math.floor(maxDaysPerInvocation) || 1)'), 'manual Garmin health history defaults to one day while automatic cursor batches are capped at two days');
assert.ok(main.includes('activityRescanEndDate: endDate'), 'Garmin activity coverage uses the original full-range rescan anchor');
assert.ok(main.includes('completedBeforeChunk + chunkDays - remainingDays'), 'Garmin progress is accumulated across bounded date chunks');
assert.ok(main.includes('startManualCloudSync,') && html.includes('onclick="startManualCloudSync()"'), 'manual cloud sync button is connected to the global handler');
assert.ok(uiActions.includes('window.kajoOpenProfile = function'), 'profile buttons are connected to their standalone action');
assert.ok(analysisUI.includes('window.openPerformanceDetail = openPerformanceDetail') && analysisUI.includes('window.closePerformanceDetail = closePerformanceDetail'), 'performance detail navigation buttons are globally connected');
assert.ok(analysisUI.includes('window.setPerformanceRange = setPerformanceRange') && analysisUI.includes('window.setHealthRange=setHealthRange'), 'performance and health range buttons are globally connected');
assert.ok(html.includes('id="health-log-save-button"'), 'health log save button has a stable control id');
assert.ok(/refreshAll\(\);\s*closeHealthLogModal\(\);/.test(health) && !health.includes("new CustomEvent('endurance:data-save-immediate'"), 'health log UI closes after local save without waiting for a cloud roundtrip');


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
assert.match(analysisUI, /keine medizinische Interpretation/i, 'Health trend avoids medical interpretation');
assert.ok(analysisUI.includes("['HRV', 'hrv', 'Garmin · ms', 1]") && analysisUI.includes('getGarminCheckinMetric(row, key)'), 'recovery exposes only Garmin-sourced HRV as an objective metric');
assert.ok(analysisUI.includes('const readinessEntry = Object.keys(state.dailyCheckins || {})') && analysisUI.includes('entry.result?.enoughData'), 'aggregate recovery value uses the latest available readiness in the selected period');
assert.ok(!html.includes('id="analysis-regeneration-section"') && !html.includes('id="recovery-hero-note" class="kajo-analysis-hero-note"'), 'Recovery detail does not display a readiness summary');
assert.ok(html.includes('id="health-hero-ring"') && html.includes('id="analysis-health-hero-value"') && !html.includes('id="health-availability-status"'), 'Health overview exposes documented-day count without an unsupported availability score');
assert.ok(html.includes('id="analysis-performance-hero-value"') && analysisUI.includes("setHero('performance'"), 'Fitness exposes the available VO2max value to the analysis overview');
assert.ok(analysisUI.includes("setHero('health', String(healthDays), 'Tage'"), 'Health overview uses documented sick and injured days in the selected period');
assert.ok(analysisUI.includes('historyRingColor(key, entry.value, entry.date)'), 'each recovery circle uses the existing metric-specific status classification');
assert.ok(['health','cycle','relationships'].every(view => html.includes('data-health-view="'+view+'"')), 'Health analysis has separate Health, Cycle and Relationships views');
assert.ok(html.includes('id="health-load-comparison"') && html.includes('id="health-recovery-comparison"'), 'Health relationships compare load and recovery with documented health events');
assert.ok(analysisUI.includes("['complete','confirmed-rest'].includes(day.dataStatus)"), 'health load comparison excludes incomplete daily load coverage');
assert.ok(analysisUI.includes("const hasLoadProvenance=timeline.every(day=>String(day.loadMode||'').trim()&&String(day.loadUnit||'').trim())"), 'health load comparison requires explicit model and unit provenance');
assert.ok(analysisUI.includes("timeline[0].loadMode==='garmin-native'?'Garmin Training Load'"), 'native Garmin load is labeled distinctly from the KAJO heart-rate-zone index');

assert.ok(analysisUI.includes('getGarminCheckinMetric(record,key)'), 'health recovery comparison uses Garmin-provenanced daily metrics');
assert.ok(analysisUI.includes('Kein Eintrag') && analysisUI.includes('keinen ursächlichen Effekt'), 'health comparisons distinguish missing health documentation and avoid causal claims');
assert.ok(analysisUI.includes("min:1,max:5") && analysisUI.includes("Schmerzen / Beschwerden (1–5)"), 'cycle relationship chart uses the documented five-point scale');
assert.ok(analysisUI.includes("type='line';max=5;") && analysisUI.includes('fünfstufigen Skala (1–5)') && analysisUI.includes("key==='cycle'?' / 5'"), 'cycle trend chart uses the documented five-point scale consistently');
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
assert.ok(dashboard.includes('Mindestens zwölf Messungen aus den vorherigen 28 Tagen sind für eine persönliche Basis erforderlich'), 'wearable values require a sufficient individual baseline');
assert.ok(!dashboard.includes('Im persönlichen Bereich'), 'legacy personal-range classification is suppressed');
assert.ok(charts.includes("state.metricHistoryRange = tf"), 'shared timeframe synchronizes detail history');

assert.ok(importer.includes("['hrv', 'HRV (RMSSD)']"), 'Intervals wellness HRV field is identified as RMSSD');
assert.ok(importer.includes("['hrvSDNN', 'HRV (SDNN)']"), 'Intervals SDNN field is separately identified');
assert.ok(importer.includes("incoming.hrv = hrv"), 'Intervals HRV is stored in the shared check-in HRV key');
assert.ok(importer.includes("source: 'intervals', metric: 'rmssd', unit: 'ms'"), 'Intervals HRV carries explicit RMSSD provenance');
assert.ok(!health.includes("['input-hrv', 'hrv'"), 'manual HRV is no longer editable in the daily check-in');
assert.ok(health.includes('Garmin-Gesundheitswerte werden ausschließlich synchronisiert'), 'Garmin health metrics are explicitly read-only in the check-in');
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
assert.ok(dashboard.includes('kajo-week-bar-track') && dashboard.includes('const colorFor = type => catalog[type]?.color') && dashboard.includes('segment.style.backgroundColor = colorFor(type)'), 'weekly chart uses sport-colored day bars');
assert.ok(dashboard.includes("track.setAttribute('role','button')") && dashboard.includes("track.setAttribute('aria-label'") && dashboard.includes("track.addEventListener('click', () => selectDay(null))"), 'weekly day bars are accessible interactive targets');
assert.ok(dashboard.includes('garminActivityId || item.externalId || item.id'), 'weekly chart deduplicates stable activity IDs');
assert.ok(dashboard.includes('export function selectDashboardDate'), 'weekly day selection uses the non-editing dashboard day view');
assert.ok(competitions.includes('openNextRaceDetail'), 'next race opens a dedicated detail view');

assert.ok(homeMarkup.includes('home-next-race-location') && homeMarkup.includes('home-next-race-sport'), 'next race shows available location and discipline fields');
assert.ok(dashboard.includes('data-sport-type'), 'today sessions use configured sport identity for their color accent');

assert.ok(main.includes("document.body.classList.toggle('kajo-home-active', view === 'dashboard')"), 'home header state avoids duplicate global branding');
assert.ok(dashboard.includes("year: 'numeric'"), 'home date includes the current year');

assert.ok(!dashboard.includes('latestFormDay'), 'home rendering does not reference an undefined load timeline variable');



const profile = readFileSync('js/profile.js', 'utf8').replace(/\r\n/g, '\n');
const theme = readFileSync('js/theme.js', 'utf8').replace(/\r\n/g, '\n');
const styles = readFileSync('css/styles.css', 'utf8').replace(/\r\n/g, '\n');
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
assert.ok(calendar.includes('const date=state.selectedCalendarDay||toLocalDateString(state.currentCalendarDate);'), 'period entry defaults to the currently viewed calendar date');
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
assert.ok(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))') && /\.calendar-week-strip-day \{\s*min-width:0;/.test(css), 'mobile week strip keeps all seven day cells in one equal-width row');
assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))') && css.includes('.calendar-view-switch'), 'calendar view selector keeps all four views in one row');
assert.ok(calendar.includes('calendar-week-agenda-day') && calendar.includes('calendar-week-agenda'), 'week view keeps all seven days in a vertical agenda');
assert.ok(calendar.includes('selectCalendarWeekDay') && calendar.includes('scrollIntoView'), 'horizontal day selection focuses the matching agenda section');
assert.ok(calendar.includes('openPlannedCalendarDetail') && calendar.includes('openCSVDetailsModal'), 'completed and planned weekly sessions open their respective detail views');
assert.ok(calendar.includes('Number(timeline.activityCount) === Number(timeline.loadActivityCount)'), 'daily training load is shown only with complete activity coverage');
assert.ok(calendar.includes('data.durationComplete') && calendar.includes('data.durationTotal'), 'daily training time exposes incomplete duration coverage without adding an unagreed comparison panel');
assert.ok(calendar.includes('state.dailyTimeline') && calendar.includes('Number(timeline.activityCount) === Number(timeline.loadActivityCount)'), 'daily calendar load reuses the central timeline');
assert.ok(calendar.includes('getTrainingLoadData('), 'activity list reuses the central training-load calculation');
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
assert.ok(activities.includes("srpe: 'sRPE-Load'"), 'activity detail labels the configured sRPE method');
assert.ok(activities.includes("const load = loadItem && Number.isFinite(Number(loadItem.value))"), 'activity detail displays the centrally calculated load value');
assert.ok(activities.includes("panel.classList.add('hidden'); panel.innerHTML = ''; return;"), "activity detail contains panel.classList.add('hidden'); panel.innerHTML = ''; return;");

assert.ok(activities.includes('const storedRouteIds = item =>'), 'comparison rendering reads stored route assignments without inferring or mutating them');

assert.ok(activities.includes("metricsContainer.style.setProperty('--activity-sport-color'"), 'activity metric accents use the configured sport color');
assert.ok(activities.includes('border-sky-800/50 bg-sky-950/20'), 'telemetry availability uses neutral information color, not positive status color');

assert.ok(importer.includes("source:'fit',sources:['fit']"), 'manually imported FIT activities retain their file-import provenance');
assert.ok(activities.includes("zoneTime.restingHrSource === 'profile-fallback'"), 'profile resting-HR fallback is explicitly identified in activity zone details');

assert.ok(activities.includes('function renderActivityRouteMap(activity)'), 'GPS map is only rendered from stored coordinate pairs');
assert.ok(activities.includes('if (points.length < 2)') && activities.includes('if (!globalThis.L)'), 'GPS map waits for valid points and lazily loads its map library');
assert.ok(importer.includes("extractRecordSeries('position_lat', 'latitude')"), 'FIT import extracts GPS coordinates only when present');
assert.ok(activities.includes('leaflet@1.9.4'), 'activity route map loads a supported mapping library on demand');

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


const trainingLoadView = readFileSync('js/training-load-view.js', 'utf8').replace(/\r\n/g, '\n');
const trainingLoadCalculation = readFileSync('js/training-load.js', 'utf8').replace(/\r\n/g, '\n');
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


const performanceUi = readFileSync('js/analysis-ui.js', 'utf8').replace(/\r\n/g, '\n');
assert.ok(html.includes('id="fitness-aerobic-metrics"') && html.includes('id="fitness-overview-view"'), 'Fitness opens with its own aerobic fitness view');
assert.ok(html.includes('id="performance-detail-view"') && html.includes('onclick="openPerformanceDetail()"'), 'Performance is a separate circle with its own detail view');
assert.ok(html.includes('id="performance-paddling-metrics"') && html.includes('id="performance-strength-metrics"'), 'Performance detail separates paddling and strength dimensions');
assert.ok(html.includes('id="performance-trend-chart"') && html.includes('data-performance-range="28d"'), 'Performance has a dedicated selectable trend chart and time ranges');
assert.ok(performanceUi.includes('getActivityTelemetrySeries(activity)'), 'Performance reads existing provenance-gated activity telemetry');
assert.ok(performanceUi.includes('isPaddlingPerformanceActivity(activity)'), 'Paddling performance excludes non-paddling activities');
assert.ok(performanceUi.includes('isValidElapsedTimeAxis(series.time, series.values.length)'), 'paddling summary metrics require aligned elapsed-time data');
assert.ok(performanceUi.includes('resolvePaddlingPerformanceSeries'), 'paddling metrics resolve only explicitly supported Garmin series and units');
assert.ok(charts.includes('directfractionalcadence|double cadence'), 'double cadence is not silently treated as stroke cadence in paddling');
assert.ok(charts.includes('vertical.?speed|vertikale geschwindigkeit') && charts.includes('accumulated.?power|summierte leistung'), 'vertical speed and accumulated power are not mistaken for instantaneous performance metrics');
assert.ok(charts.includes('getValidatedElapsedTimeAxis(telem, values.length)'), 'activity telemetry retains only a validated elapsed-time axis');
assert.ok(performanceUi.includes('Garmin-Schätzwert') && performanceUi.includes('keine direkte Spiroergometrie'), 'VO2max is explicitly described as a Garmin estimate');
assert.ok(performanceUi.includes('Verlauf innerhalb einer Einheit; kein Vergleich'), 'activity telemetry is not misrepresented as comparable cross-session performance');
assert.ok(performanceUi.includes('Zeitachse: Zeit seit Start') && performanceUi.includes('Keine verlässliche Zeitachse'), 'performance trend distinguishes elapsed-time axes from sample-index-only series');
assert.ok(performanceUi.includes('state.strengthPBs'), 'strength progression uses stored exercise-specific personal best records');
assert.ok(html.includes('<span>Fitness</span>') && html.includes('id="fitness-aerobic-metrics"'), 'analysis navigation identifies the fitness view separately from performance');

const overviewModule = readFileSync('js/analysis-overview.js', 'utf8').replace(/\r\n/g, '\n');
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
assert.ok(overviewModule.includes("import { calculateReadiness } from './readiness.js?v=3';") && overviewModule.includes("key: 'readiness', label: 'Recovery · Readiness'") && overviewModule.includes('result?.enoughData'), 'overview plots only valid daily readiness scores alongside HRV');
assert.ok(overviewModule.includes('HRV und Readiness sind deshalb keine unabhängigen Messgrößen'), 'overview explains the shared inputs behind HRV and readiness');
assert.ok(html.includes('id="analysis-readiness-breakdown"') && overviewModule.includes('function renderReadinessBreakdown') && overviewModule.includes('result.objective') && overviewModule.includes('result.subjective'), 'overview exposes the actual objective and subjective readiness inputs');
assert.ok(html.includes('id="analysis-health-event-context"') && analysisOverview.includes('renderHealthEventContext'), 'unified overview exposes a cross-domain context for documented health events');
assert.ok(html.includes('id="analysis-next-day-context"') && analysisOverview.includes('renderNextDayContext'), 'overview exposes a time-shifted load-to-recovery comparison');
assert.ok(analysisOverview.includes('nextDate > todayKey()') && analysisOverview.includes('dateSet.has(nextDate)'), 'next-day comparison requires a real following day within the selected period');
assert.ok(analysisOverview.includes('Garmin-HRV') && analysisOverview.includes('keine statistische Korrelation') && analysisOverview.includes('Fehlende HRV- oder Readiness-Werte bleiben offen'), 'lagged context distinguishes source data, missing values and causal limits');
assert.ok(analysisOverview.includes('Gleicher Kalendertag') && analysisOverview.includes('keinen ursächlichen Zusammenhang') && analysisOverview.includes('Garmin-HRV'), 'health context reports same-day source values without implying causality');
assert.ok(overviewModule.includes('Physiologie 40 %') && overviewModule.includes('Schlaf 30 %') && overviewModule.includes('subjektives Befinden 30 %'), 'overview explains the established readiness domain weights');
assert.ok(overviewModule.includes('spanGaps: true') && overviewModule.includes('borderDash: context => context.p1DataIndex - context.p0DataIndex > 1'), 'overview marks intervals spanning missing-data gaps with a dashed segment');
assert.ok(overviewModule.includes('getSportsCatalog'), 'activity chart reuses configured sport colors');
assert.ok(overviewModule.includes("document.getElementById('analysis-' + domain + '-hero-value')"), 'overview reads the existing domain hero values');
assert.ok(overviewModule.includes('Health zeigt ausschließlich dokumentierte Erkrankungen') && overviewModule.includes('renderHealthMarkers') && overviewModule.includes("['sick', 'injured']"), 'Health shows only documented illness and injury events without fabricating a continuous availability score');
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

const garminArchive = readFileSync('js/garmin-export-archive.js', 'utf8').replace(/\\r\\n/g, '\\n');
assert.ok(garminArchive.includes('function collectGarminFields'), 'Garmin archive analysis inventories actual JSON field paths and value types');
assert.ok(garminArchive.includes('function collectSummarizedActivities') && garminArchive.includes('activityComparison'), 'Garmin archive preview compares unique activity IDs with existing records without importing them');
assert.ok(garminArchive.includes('!/^[0-9]+$/.test(String(id))'), 'Garmin archive activity IDs accept numeric Garmin identifiers');
assert.ok(garminArchive.includes('existingWithoutDetails') && garminArchive.includes('duplicateArchiveIds'), 'Garmin archive comparison reports existing detail gaps and duplicate archive IDs');
assert.ok(garminArchive.includes('delete summary.activityRecords'), 'Garmin archive comparison stores only aggregate counts, not raw activity identifiers');
assert.ok(garminArchive.includes('fieldInventory: {}') && garminArchive.includes('collectGarminFields(parsed, category'), 'Garmin archive analysis stores a compact field inventory in the archive manifest');
assert.ok(garminArchive.includes('Erkannte Datenfelder anzeigen') && garminArchive.includes('field.occurrences'), 'Garmin archive history exposes the recognized field inventory to the user');
assert.ok(garminArchive.includes('keine Aktivitäten oder Messwerte wurden importiert oder überschrieben'), 'Garmin archive comparison remains read-only and does not import or overwrite measurement data');


assert.ok(garminArchive.includes('fitnessagedata|metricsmaxmet|vo2|max.?met|benchmark'), 'Garmin fitness-age and VO2max exports are classified as performance data');
assert.ok(garminArchive.includes('summarizedactivities|activitydetails'), 'Garmin activity files are identified by concrete activity filenames');
assert.ok(garminArchive.includes('trainingplan|_workout.json|workout'), 'Garmin workout definitions are separated from completed activities');
assert.ok(garminArchive.includes('customer_data|di-connect-user|trainingplan|_workout.json'), 'profile and workout-plan dates are excluded from the historical measurement period');
assert.ok(garminArchive.includes('birth|created|updated|modified|deleted|expiry|expiration|upload|export'), 'metadata timestamps are excluded from the historical measurement period');
assert.ok(garminArchive.includes('timestamp <= Date.now() + 24 * 60 * 60 * 1000'), 'future plan dates do not extend the historical measurement period');
assert.ok(garminArchive.includes('analysisVersion: 8') && garminArchive.includes('preview?.analysisVersion !== 8'), 'existing Garmin archives can be re-analysed with the activity and VO2max field audit');
assert.ok(garminArchive.includes('function createActivityFieldAudit') && garminArchive.includes('function recordActivityFieldAudit'), 'Garmin archive preview audits activity field presence and types without retaining values');
assert.ok(garminArchive.includes('activityFieldAudit') && garminArchive.includes('Aktivitätsfelder prüfen'), 'Garmin archive history displays the read-only activity field audit');
assert.ok(garminArchive.includes('keine Messwerte oder GPS-Daten'), 'activity field audit explicitly excludes raw measurements and GPS data');
assert.ok(garminArchive.includes('MAX_FIELD_PATHS_PER_CATEGORY = 500') && garminArchive.includes('inventoryBudget.counts[fieldCategory]'), 'Garmin archive field inventory has a separate limit for every data category');
assert.ok(garminArchive.includes('MAX_FIELD_PATHS_PER_CATEGORY = 500') && garminArchive.includes('inventoryBudget.counts[fieldCategory]'), 'Garmin archive field inventory has a separate limit for every data category');
assert.ok(garminArchive.includes('truncatedCategories: summary.fieldInventoryBudget.truncated'), 'Garmin archive analysis reports categories whose field inventory reached its limit');
assert.ok(garminArchive.includes('function classifyGarminFieldCategory') && garminArchive.includes('bodybattery|alldaystress|stresslevel|restingheartrate'), 'bundled Garmin daily wellness fields are classified into recovery');
assert.ok(garminArchive.includes('hydration|kilocalorie|calorie|bmr|sweatloss|nutrition'), 'bundled Garmin nutrition and hydration fields are classified separately');
assert.ok(garminArchive.includes('activeseconds|highlyactiveseconds|floorsascended|floorsdescended'), 'bundled daily activity fields are distinguished from training sessions');
assert.ok(garminArchive.includes('function garminCategoryLabel'), 'field inventory categories use readable German labels');
assert.ok(garminArchive.includes("if (/summarizedactivities|activitydetails/.test(value)) return 'activities';"), 'only concrete completed-activity exports are classified as activities');


assert.ok(html.includes('id="analysis-load-recovery-association"'), 'load and recovery association panel exists');
assert.ok(analysisOverview.includes('function spearmanCorrelation'), 'Spearman calculation exists');
assert.ok(analysisOverview.includes('mindestens 10 vollständige Wertepaarungen'), 'small samples are not interpreted');
assert.ok(analysisOverview.includes('mehrere Load-Modelle oder Einheiten'), 'incompatible load models are not mixed');
assert.ok(analysisOverview.includes("!['complete', 'confirmed-rest'].includes(day.dataStatus)"), 'statistical load comparisons exclude incomplete and unknown load days');
assert.ok(analysisOverview.includes("!['complete', 'confirmed-rest'].includes(day.dataStatus)"), 'next-day context excludes incomplete and unknown load days');
assert.ok(analysisOverview.includes('Readiness enthält physiologische Messwerte einschließlich HRV'), 'Readiness and HRV overlap is disclosed');
assert.ok(analysisOverview.includes('Ohne dokumentierten Krankheits-/Verletzungseintrag an D oder D+1'), 'load recovery comparison separates pairs without recorded health events');
assert.ok(analysisOverview.includes('Mit dokumentiertem Krankheits-/Verletzungseintrag an D oder D+1'), 'load recovery comparison identifies pairs with recorded health events');
assert.ok(analysisOverview.includes('Ein fehlender Eintrag bedeutet nicht, dass die Person gesund war'), 'missing health records are not treated as proof of health');
assert.ok(analysisOverview.includes('keine statistische Kontrolle von Krankheit oder Verletzung'), 'health-event split is disclosed as sensitivity analysis, not statistical adjustment');
assert.ok(analysisOverview.includes('Frühere Belastungstage, Schlaf, Reisen und weitere Einflussfaktoren'), 'uncontrolled confounders are disclosed');
assert.ok(analysisOverview.includes('Drei-Tage-Summe') && analysisOverview.includes('D−2 bis D'), 'load recovery analysis includes a three-day cumulative load perspective');
assert.ok(html.includes('id="analysis-fitness-recovery-context"') && analysisOverview.includes('renderFitnessRecoveryContext'), 'unified overview exposes a dated fitness and recovery context');
assert.ok(analysisOverview.includes('CTL: ') && analysisOverview.includes('Garmin-HRV: ') && analysisOverview.includes('Readiness: ') && analysisOverview.includes('Garmin-VO₂max: '), 'fitness and recovery context displays the existing source metrics');
assert.ok(analysisOverview.includes('Bei fehlender oder abweichender Load-Modell-Angabe werden CTL/ATL/Form in dieser Tageszeile nicht angezeigt'), 'fitness and recovery context does not mix load models');
assert.ok(analysisOverview.includes('fehlende Health-Einträge bedeuten nicht, dass keine Beschwerden bestanden'), 'fitness and recovery context does not infer health from missing logs');
assert.ok(analysisOverview.includes('drei aufeinanderfolgende, vollständig belegte Tage'), 'cumulative load requires three consecutive complete days');
assert.ok(analysisOverview.includes('Drei-Tage-Fenster enthalten unterschiedliche Load-Modelle oder Einheiten'), 'cumulative load does not mix models or units');
assert.ok(analysisOverview.includes('unbekannte Tage werden niemals als 0 eingesetzt'), 'cumulative load does not impute unknown days as zero');


assert.ok(html.includes('id="analysis-trend-observations"') && analysisOverview.includes('function renderTrendObservations'), 'analysis overview exposes a separate trend observation section');
assert.ok(analysisOverview.includes('dates.length < 14') && analysisOverview.includes('dates.slice(-14, -7)') && analysisOverview.includes('dates.slice(-7)'), 'trend comparison uses two consecutive seven-day windows');
assert.ok(analysisOverview.includes('prior.length < metric.minimum || recent.length < metric.minimum'), 'trend observations require minimum measured coverage in both windows');
assert.ok(analysisOverview.includes('day.loadMode !== loadMode || day.loadUnit !== loadUnit'), 'trend observations do not mix load models or units');
assert.ok(analysisOverview.includes('Fehlende Tage werden nicht aufgefüllt'), 'trend observations do not impute missing measurements');
assert.ok(analysisOverview.includes('keine Trainingsempfehlung') && analysisOverview.includes('keine Diagnose'), 'trend observations remain descriptive and do not diagnose or recommend training');
assert.ok(analysisOverview.includes("relativeMode ? row.formPct : row.tsb") && analysisOverview.includes("'Relativer Saldo · aus CTL/ATL (%)'"), 'Garmin relative form and TSB use separate source values and labels');

assert.ok(html.includes('id="plan-kind"') && html.includes('value="rest">Ruhetag</option>'), 'manual training planning offers a dedicated rest-day type');
assert.ok(html.includes('id="plan-duration-field"') && planning.includes("const isRestDay=document.getElementById('plan-kind')?.value==='rest'"), 'rest-day planning hides workout-specific fields and stores a separate day type');
assert.ok(planning.includes('let duration = null;') && planning.includes('let targetTss = null;') && planning.includes('if (!isRestDay && !isAssessment)') && planning.includes('duration = parseOptionalPlanInteger') && planning.includes('targetTss = parseOptionalPlanInteger'), 'rest days carry no planned duration or target load');
assert.ok(calendar.includes("activity.type==='RestDay'") && calendar.includes('Keine Trainingseinheit geplant'), 'calendar identifies planned rest days without presenting them as workouts');
