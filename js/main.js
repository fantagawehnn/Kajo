/* ============================================================
 * main.js – EINSTIEGSPUNKT der Anwendung (wird in index.html per
 *           <script type="module" src="js/main.js"> geladen)
 *
 * Aufgaben:
 *   1. Module laden
 *   2. Gespeicherte Daten aus dem localStorage lesen
 *   3. Navigation (switchTab) und Gesamt-Aktualisierung (initEngine)
 *   4. Inline-Handler-Bridge für onclick="..."-Attribute im HTML
 * ============================================================ */

import { state, setRefreshHandler } from './state.js';
import { createActivationGuard } from './activation-guard.js?v=1';
import { renderSeasonPlanEditor, addSeasonPlanPhase, removeSeasonPlanPhase, saveSeasonPlanEditor, generateSeasonPlanProposal, applySeasonPlanProposal, discardSeasonPlanProposal, generateWeeklyPlanProposal, applyWeeklyPlanProposal, approveWeeklyPlan, discardWeeklyPlanProposal, transferWeeklyPlanToCalendar, reviewApprovedWeeklyPlan, setManualActivityLink, setManualSessionStatus, generateAdaptiveWeekProposal, discardAdaptiveWeekProposal, applyAdaptiveWeekProposal } from './season-plan-editor.js?v=10';
import { renderAthleteProfile, openAthleteProfileSection, closeAthleteProfileSection, editAthleteProfileSection, cancelAthleteProfileEdit, saveAthleteProfileSection } from './profile.js?v=5';
import { initializeKajoTheme, setKajoTheme } from './theme.js?v=1';
import { renderKajoPushSettings, enableKajoPush, sendKajoPushTest, saveKajoReminder, deleteKajoReminder, editKajoReminder, resetKajoReminderForm, toggleKajoReminder, disableKajoPush } from './push-notifications.js?v=1';
import { supabase } from './supabase-client.js';
import { syncPendingActivityDeletionTombstones, fetchActivityDeletionTombstones } from './activity-deletions.js?v=2';
import { loadGarminActivityPages } from './garmin-activity-pagination.js?v=1';
import { parseGarminActivitySeenMap, getGarminActivityRowsNeedingPayload, mergeGarminActivitySeenMap } from './garmin-activity-cloud-delta.js?v=1';
import { loadGarminSyncHistoryData } from './garmin-sync-history.js?v=1';
import { normalizeGarminWeight, countGarminMetricUpdates, classifyGarminMetricUpdate } from './garmin-health-normalize.js';
import { uploadGarminExportArchive, renderGarminExportArchiveHistory, analyzeGarminExportArchive } from './garmin-export-archive.js?v=6';
import { importGarminExportArchive } from './garmin-export-import.js?v=3';
import { mergeProfileSnapshots } from './profile-merge.js?v=1';
import { fetchCloudSnapshot, fetchCloudSnapshotMetadata, saveCloudSnapshot, saveCloudSnapshotPatch } from './cloud-sync.js?v=2';
import { mergeCloudSnapshots, cloudSnapshotsEqual, withCloudActivityIds, createCloudSnapshotPatch } from './cloud-merge.js?v=2';
import { fetchCloudActivities, fetchCloudActivityDelta, getCloudActivityWatermark, mergeCloudActivityRows, getCloudActivityIds, getActivityConflictLabel, mergeCloudActivities, syncCloudActivities } from './cloud-activities.js?v=4';
import { computePerformanceTimeline } from './calculations.js?v=1';
import { sanitizeGarminActivityTelemetry, getGarminHeartRateSeries } from './data-source.js';
import { buildGarminActivityAnalysis, getAdaptiveRestingHr } from './training-load.js?v=7';
import { renderAnalysisInsights } from './analysis-insights.js';
import { groupHealthEpisodes } from './period-summary.js?v=2';
import { renderAnalysisPageUI } from './analysis-ui.js?v=22';
import { renderAnalysisOverview, setAnalysisOverviewMetric, setAnalysisOverviewActivityMeasure } from './analysis-overview.js?v=24';
import { renderTrainingLoadView, openTrainingLoadMetric, closeTrainingLoadMetric, setTrainingLoadChartMetric, setTrainingLoadModel, setTrainingLoadDailyMeasure, setTrainingLoadSportFilter, setTrainingLoadVolumeMeasure, setTrainingLoadZoneDisplayMode, toggleTrainingLoadPeriodMenu, setTrainingLoadPeriod } from './training-load-view.js?v=20';
import { renderSummaryKPICards, generateAutomatedNarrative, inspectDay, renderDashboardNextRace, renderReadinessDashboard, renderSelectedDashboardDay, renderHomeTrainingWeek, changeDashboardDay, goToDashboardToday, selectDashboardDate, openDailyNote, closeDailyNote, saveDailyNote, renderMetricHistory, setHistoryMetric, setHistoryRange, applyHistoryCustomRange, openHealthMetric, openTrainingMetric } from './dashboard.js?v=21';
import { navigateCalendarPeriod, openCalendarPeriodPicker, applyCalendarPeriodDate, renderCalendar, setCalendarFormat, setCalendarDisplayMode, setActivitySportFilter, clearActivitySportFilter, openDayEditor, openHomeSelfMonitoring, closeDayEditor, saveDayEditor, toggleDayCycleFields, toggleDaySickFields, updateSelfMonitoringSlider, toggleCalendarAddMenu, closeCalendarAddMenu, toggleCalendarFormatMenu, closeCalendarFormatMenu, openCalendarHealthCreate, openCalendarPeriodCreate, closeCalendarPeriodCreate, saveCalendarPeriod, removeCalendarPeriodRange, openCalendarDay, openCalendarWeek, selectCalendarWeekDay, openPlannedCalendarDetail, closePlannedCalendarDetail, openCalendarTrainingCreate, openCalendarRaceCreate, confirmCalendarSeasonPhase, dismissCalendarSeasonPhase, deleteCalendarSeasonPhase, openCalendarPhaseEditor, closeCalendarPhaseEditor, saveCalendarPhaseEditor } from './calendar.js?v=51';
import { applyCanoeDateRange, applyCustomDateRange, renderMainLoadChart, renderHeartRateZoneDistribution, renderCanoeTrainingHours, resetCanoeDateRange, setTimeframe, toggleCustomDatePicker, setActivityTelemetryMetric } from './charts.js?v=15';
import { closeCSVDetailsModal, deleteSelectedActivity, inferCategory, inferSport, openCSVDetailsModal, saveManualSportCorrection, saveActivityWaterConditions, saveActivityTrainingPartner, toggleActivityCanoeFields, toggleActivityEdit, updateActivityRPE, focusActivityLap, addActivityStrengthSet, removeActivityStrengthSet, updateActivityStrengthSet, updateActivityStrengthExerciseName, toggleActivityStrengthSection } from './activities.js?v=28';
import { closeDailyCheckinModal, discardDailyCheckin, openDailyCheckinModal, closeHealthLogModal, loadCheckinInputs, openHealthLogForDate, openHealthLogModal, saveCheckin, saveRetroactiveHealthLog, renderManagedPeriods, editPeriodRange, cancelPeriodEdit, saveManagedPeriod, deleteManagedPeriod, toggleCheckinOptionalFields, toggleCycleFields, updateCheckin } from './health.js?v=82';
import { closeIntervalsSyncModal, handleMultipleFileSelect, initializeImportDropZone, openIntervalsSyncModal, performIntervalsLiveSync, renderImportHistory, deactivateIntervalsActivities } from './import.js?v=6';
import { closePlannedWorkoutModal, deletePlannedWorkout, openPlannedWorkoutModal, renderPlannedWorkouts, savePlannedWorkout, setPlannedWorkoutKind, addPlannedStrengthExercise, removePlannedStrengthExercise } from './planning.js?v=9';
import { openManualActivityModal, closeManualActivityModal, updateManualActivityFields, addManualActivityExerciseSet, removeManualActivityExerciseSet, saveManualActivity } from './manual-activity.js?v=5';
import { openDailyHrActivityModal, closeDailyHrActivityModal, previewDailyHrActivity, attachDailyHrSeriesToActivity, invalidateDailyHrActivityPreview } from './daily-hr-activity.js?v=1';
import { addRace, deleteRace, renderRaces, toggleRaceModal, openNextRaceDetail, closeRaceDetail, toggleRaceResultsForm, addRaceResult, deleteRaceResult } from './competitions.js?v=7';
import { closeStrengthModal, deleteStrengthLog, openStrengthModal, renderStrengthView, saveStrengthWorkout } from './strength.js?v=5';
import { initializeSettings, openSettingsModal, closeSettingsModal, addCustomSport, addCustomCategory, saveSettings, saveTelemetrySettings, selectSettingsColor, previewHeartRateZones, renderCalendarSeasonSettings, saveCalendarSeason, deleteCalendarSeason, newCalendarSeason, editCalendarSeason, setCalendarSeasonActive } from './settings.js?v=14';
import { exportDatabaseBackup, inspectDatabaseBackup, importDatabaseBackup, loadStateForUser, deactivateUserStorage, saveDataToLocalStorage, saveActivitiesToLocalStorage, getUserLocalSetting, setUserLocalSetting, getUserDataSnapshot, applyCloudDataSnapshot, loadCloudSyncBaseline, saveCloudSyncBaseline, getPendingLocalSync, clearPendingLocalSync, flushLocalPersistence, getGarminTelemetryRecordsForCloud, mergeGarminTelemetryRecords, clearLocalGarminTelemetryCache, loadDeferredStateForUser } from './storage.js?v=8';
import { analyzeSnapshotSizes } from './storage-diagnostics.js?v=1';
import { renderRoutesView, saveTrainingRoute, editTrainingRoute, deleteTrainingRoute, resetTrainingRouteForm, setActivityRoute, setActivityRouteAssignment, setActivityRouteRuns, saveTrainingWaterSection, renameTrainingWater, deleteTrainingWater, renameTrainingSection, deleteTrainingSection, setTrainingRouteFilter, toggleTrainingRouteForm, toggleTrainingWatersManager } from './routes.js?v=5';
import { extractGarminTelemetryRecords, syncGarminTelemetryToCloud, uploadMissingGarminTelemetry, loadGarminTelemetryForActivityIds, loadGarminTelemetryMetadataForActivityIds } from './garmin-cloud-telemetry.js?v=6';
import { shouldRefreshUnavailableGarminAnalysis } from './garmin-analysis-cache.js?v=1';
import { countValidHeartRateSamples, shouldSkipHeartRateRetry } from './garmin-heart-rate-sync.js?v=1';

/* Selten genutzte Bereiche werden erst bei Bedarf geladen.
   Die Promise-Caches verhindern parallele Mehrfachimporte. */
let coachModulePromise = null;
let healthDataModulePromise = null;
let nutritionModulePromise = null;

function loadCoachModule() {
    if (!coachModulePromise) coachModulePromise = import('./coach.js?v=2');
    return coachModulePromise;
}
function loadHealthDataModule() {
    if (!healthDataModulePromise) healthDataModulePromise = import('./health-data.js?v=4');
    return healthDataModulePromise;
}
function loadNutritionModule() {
    if (!nutritionModulePromise) nutritionModulePromise = import('./nutrition.js?v=3');
    return nutritionModulePromise;
}

async function sendAICoachMessage(...args) {
    const module = await loadCoachModule();
    return module.sendAICoachMessage(...args);
}
function renderGarminHealthData() {
    void loadHealthDataModule().then(module => module.renderGarminHealthData())
        .catch(error => console.error('Garmin-Gesundheitsdaten konnten nicht geladen werden:', error));
}
async function openGarminHealthMetric(...args) {
    const module = await loadHealthDataModule();
    return module.openGarminHealthMetric(...args);
}
async function closeGarminHealthMetric(...args) {
    const module = await loadHealthDataModule();
    return module.closeGarminHealthMetric(...args);
}
async function setGarminHealthRange(...args) {
    const module = await loadHealthDataModule();
    return module.setGarminHealthRange(...args);
}
async function applyGarminHealthCustomRange(...args) {
    const module = await loadHealthDataModule();
    return module.applyGarminHealthCustomRange(...args);
}
function renderNutritionView() {
    void loadNutritionModule().then(module => module.renderNutritionView())
        .catch(error => console.error('Ernährungsbereich konnte nicht geladen werden:', error));
}

// Die Archivübersicht erst nach abgeschlossener Kontoaktivierung laden.
window.addEventListener('endurance:user-ready', () => {
    void renderGarminExportArchiveHistory();
});
async function openSupplementModal(...args) {
    const module = await loadNutritionModule();
    return module.openSupplementModal(...args);
}
async function closeSupplementModal(...args) {
    const module = await loadNutritionModule();
    return module.closeSupplementModal(...args);
}
async function saveSupplement(...args) {
    const module = await loadNutritionModule();
    return module.saveSupplement(...args);
}
async function deleteSupplement(...args) {
    const module = await loadNutritionModule();
    return module.deleteSupplement(...args);
}
async function toggleSupplementTaken(...args) {
    const module = await loadNutritionModule();
    return module.toggleSupplementTaken(...args);
}
async function enableNutritionNotifications(...args) {
    const module = await loadNutritionModule();
    return module.enableNutritionNotifications(...args);
}
function initializeNutritionRemindersWhenIdle() {
    const start = () => {
        void loadNutritionModule().then(module => module.initializeNutritionReminders())
            .catch(error => console.error('Supplement-Erinnerungen konnten nicht initialisiert werden:', error));
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 2500 });
    else window.setTimeout(start, 1200);
}

// Externe UI-Bibliotheken dürfen die Kontoaktivierung nicht blockieren.
// Insbesondere kann das optionale Lucide-CDN vorübergehend nicht erreichbar sein.
try {
    globalThis.lucide?.createIcons?.();
} catch (error) {
    console.warn('Lucide-Icons konnten nicht initialisiert werden:', error);
}

try {
    initializeImportDropZone();
} catch (error) {
    console.error('Der Dateiimport konnte nicht initialisiert werden:', error);
}

// Persönliche Daten werden erst nach erfolgreicher Authentifizierung geladen.
// Die bisherigen globalen Legacy-Schlüssel werden beim Start nicht gelesen.

// ------------------------------------------------------------
// Navigation
// ------------------------------------------------------------
function openCoach() {
    const current = window.kajoCurrentTab || 'dashboard';
    window.kajoCoachContext = current === 'ai' ? (window.kajoCoachContext || 'dashboard') : current;
    switchTab('ai');
}

function getHealthAnalysisRange() {
    const today = new Date();
    const todayKey = [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if (state.activeTimeframe === 'custom') {
        const from = document.getElementById('date-from')?.value || document.getElementById('health-summary-from')?.value;
        const to = document.getElementById('date-to')?.value || document.getElementById('health-summary-to')?.value;
        if (from && to && from <= to && to <= todayKey) return { from, to };
    }
    const days = ({'7d':7,'28d':28,'3m':90,'6m':180,'1y':365})[state.activeTimeframe] || 90;
    const start = new Date(todayKey + 'T12:00:00');
    start.setDate(start.getDate() - days + 1);
    const from = [start.getFullYear(),String(start.getMonth()+1).padStart(2,'0'),String(start.getDate()).padStart(2,'0')].join('-');
    return { from, to:todayKey };
}
function renderHealthAnalysis() {
    const list = document.getElementById('health-event-list');
    const summaryRoot = document.getElementById('health-event-summary');
    const count = document.getElementById('health-event-count');
    const status = document.getElementById('health-availability-status');
    if (!list) return;
    const range = getHealthAnalysisRange();
    const summary = groupHealthEpisodes(state.healthLogs || {}, range.from, range.to);
    const formatDate = date => new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
    const rangeLabel = episode => episode.start === episode.end ? formatDate(episode.start) : formatDate(episode.start) + ' – ' + formatDate(episode.end);
    if (count) count.textContent = summary.episodes.length
        ? summary.episodes.length + ' Phasen · ' + summary.totalDays + ' dokumentierte Tage' : 'Keine dokumentierten Phasen';
    if (summaryRoot) {
        const cards = [
            ['Krankheitstage',summary.sickDays,summary.sickEpisodes+' Krankheitsphasen'],
            ['Krankheitsphasen',summary.sickEpisodes,'Zusammenhängende dokumentierte Zeiträume'],
            ['Verletzungstage',summary.injuredDays,summary.injuredEpisodes+' Verletzungsphasen'],
            ['Verletzungsphasen',summary.injuredEpisodes,'Zusammenhängende dokumentierte Zeiträume']
        ];
        summaryRoot.innerHTML = cards.map(([label,value,detail]) =>
            '<div class="kajo-insight-metric"><span>'+label+'</span><strong>'+value+'</strong><small>'+detail+'</small></div>'
        ).join('');
    }
    list.replaceChildren();
    if (!summary.episodes.length) {
        const empty=document.createElement('p');empty.className='text-xs text-slate-500';
        empty.textContent='Im gewählten Zeitraum sind keine Krankheits- oder Verletzungsphasen dokumentiert.';
        list.appendChild(empty);
    } else {
        [...summary.episodes].reverse().forEach(episode => {
            const row=document.createElement('div');
            row.className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3';
            const label=document.createElement('strong');label.className='text-sm text-slate-200';
            // Bei Erkrankungen die konkret dokumentierte Diagnose links anzeigen.
            // Fehlt eine Angabe, bleibt die allgemeine Bezeichnung als Fallback erhalten.
            label.textContent=episode.status==='sick'?(episode.diagnosis||'Krankheit'):'Verletzung';
            const detail=document.createElement('span');detail.className='text-xs text-slate-400 text-right';
            detail.textContent=[rangeLabel(episode),episode.days+(episode.days===1?' dokumentierter Tag':' dokumentierte Tage')].join(' · ');
            row.append(label,detail);list.appendChild(row);
        });
    }
    document.querySelectorAll('[data-health-range]').forEach(button=>button.classList.toggle('is-active',button.dataset.healthRange===state.activeTimeframe));
    document.getElementById('health-summary-custom-range')?.classList.toggle('hidden',state.activeTimeframe!=='custom');
    if (status) status.textContent='Trainingsverfügbarkeit bleibt nicht berechenbar, solange Gesundheits- und Planungsdaten nicht vollständig für denselben Zeitraum verknüpft sind.';
}

function switchTab(requestedTab) {
    const route = {
        dashboard: { parent: 'today', view: 'dashboard' },
        today: { parent: 'today', view: 'dashboard' },
        'dashboard-details': { parent: 'today', view: 'dashboard-details' },
        calendar: { parent: 'calendar', view: 'calendar' },
        training: { parent: 'training', view: 'calendar', sub: 'activities' },
        'training-activities': { parent: 'training', view: 'calendar', sub: 'activities' },
        'training-planning': { parent: 'training', view: 'races', sub: 'planning' },
        'training-competitions': { parent: 'training', view: 'races', sub: 'competitions' },
        races: { parent: 'training', view: 'races', sub: 'competitions' },
        strength: { parent: 'training', view: 'strength', sub: 'strength' },
        analyses: { parent: 'analysis', view: 'analyses', sub: 'overview' },
        'analysis-overview': { parent: 'analysis', view: 'analyses', sub: 'overview' },
        'analysis-load': { parent: 'analysis', view: 'analyses', sub: 'load' },
        'analysis-recovery': { parent: 'analysis', view: 'analyses', sub: 'recovery' },
        'health-data': { parent: 'analysis', view: 'analyses', sub: 'recovery' },
        'analysis-performance': { parent: 'analysis', view: 'analyses', sub: 'performance' },
        'training-analysis': { parent: 'analysis', view: 'analyses', sub: 'performance' },
        'analysis-health': { parent: 'analysis', view: 'analyses', sub: 'health' },
        more: { parent: 'more', view: 'more' },
        profile: { parent: 'more', view: 'profile' },
        data: { parent: 'more', view: 'data' },
        'garmin-health': { parent: 'more', view: 'garmin-health' },
        backup: { parent: 'more', view: 'backup' },
        upload: { parent: 'more', view: 'upload' },
        methods: { parent: 'more', view: 'methods' },
        routes: { parent: 'more', view: 'routes' },
        nutrition: { parent: 'more', view: 'nutrition' },
        ai: { parent: 'more', view: 'ai' }
    };
    const destination = route[requestedTab] || { parent: 'more', view: 'more' };
    const { parent, view, sub } = destination;
    document.body.classList.toggle('kajo-home-active', view === 'dashboard');
    document.body.classList.toggle('kajo-training-planning-view', parent === 'training' && sub === 'planning');
    document.body.classList.toggle('kajo-training-competitions-view', parent === 'training' && sub === 'competitions');
    window.kajoCurrentTab = requestedTab;
    if (requestedTab !== 'health-data' && requestedTab !== 'training-analysis') state.metricHistoryDate = null;

    const viewIds = ['more', 'routes', 'dashboard', 'analyses', 'dashboard-details', 'calendar', 'races', 'strength', 'nutrition', 'upload', 'methods', 'data', 'garmin-health', 'backup', 'ai', 'profile'];
    viewIds.forEach(id => {
        const el = document.getElementById('view-' + id);
        if (el) el.classList.toggle('hidden', id !== view);
    });

    document.getElementById('training-subnav')?.classList.toggle('hidden', parent !== 'training');
    document.getElementById('analysis-subnav')?.classList.toggle('hidden', parent !== 'analysis' || sub === 'overview');
    ['overview', 'load', 'recovery', 'performance', 'health'].forEach(id => {
        const page = document.getElementById('analysis-subpage-' + id);
        if (page) page.classList.toggle('hidden', view !== 'analyses' || sub !== id);
    });
    document.getElementById('area-back-link')?.classList.toggle('hidden', parent !== 'more' || view === 'more');

    ['today', 'calendar', 'training', 'analysis', 'more'].forEach(id => {
        const active = parent === id;
        ['nav-' + id, 'mobile-nav-' + id].forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (!button) return;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    });
    ['activities', 'planning', 'competitions', 'strength'].forEach(id => {
        const button = document.getElementById('training-subnav-' + id);
        if (button) button.classList.toggle('is-active', sub === id);
    });
    ['load', 'recovery', 'performance', 'health'].forEach(id => {
        const button = document.getElementById('analysis-subnav-' + id);
        if (button) button.classList.toggle('is-active', sub === id);
    });

    const calendarView = document.getElementById('view-calendar');
    if (calendarView) {
        const wasActivityMode = calendarView.classList.contains('kajo-training-activity-mode');
        const activityMode = parent === 'training' && sub === 'activities';
        if (activityMode) {
            if (!wasActivityMode && state.activeCalendarFormat !== 'activities') {
                window.kajoCalendarFormatBeforeActivities = state.activeCalendarFormat;
            }
            calendarView.classList.add('kajo-training-activity-mode');
            if (state.activeCalendarFormat !== 'activities') setCalendarFormat('activities');
        } else {
            calendarView.classList.remove('kajo-training-activity-mode');
            if (wasActivityMode && state.activeCalendarFormat === 'activities') {
                setCalendarFormat(window.kajoCalendarFormatBeforeActivities || 'month');
                window.kajoCalendarFormatBeforeActivities = null;
            } else if (parent === 'calendar' && state.activeCalendarFormat !== 'month') {
                setCalendarFormat('month');
            }
        }
    }

    const coachFab = document.getElementById('coach-fab');
    if (coachFab) coachFab.classList.toggle('hidden', requestedTab === 'ai');
    const coachContext = document.getElementById('coach-context-hint');
    if (coachContext && requestedTab === 'ai') {
        const labels = { dashboard: 'deiner Tagesübersicht', calendar: 'deinem Trainingskalender', races: 'deiner Trainingsplanung', analyses: 'deiner Leistungsanalyse', 'health-data': 'deiner Regeneration', 'training-analysis': 'deiner Performance', 'analysis-health': 'deinen Health-Daten', data: 'deinen Datenverbindungen' };
        coachContext.textContent = 'Kontext: ' + (labels[window.kajoCoachContext] || 'deinem Training');
    }

    if (view === 'analyses') { renderMainLoadChart(state.dailyTimeline, state.activeTimeframe); renderAnalysisInsights(); }
    if (view === 'analyses') { renderAnalysisPageUI(sub || 'overview'); if (sub === 'recovery') renderMetricHistory('health'); }
    const overviewContent = document.getElementById('analysis-overview-content');
    if (overviewContent) overviewContent.classList.toggle('hidden', view !== 'analyses' || sub !== 'overview');
    if (view === 'analyses' && sub === 'overview') renderAnalysisOverview();
    if (view === 'analyses' && sub === 'load') renderTrainingLoadView();
    if (view === 'races') { renderPlannedWorkouts(); renderRaces(); if (sub === 'planning') renderSeasonPlanEditor(); }
    if (view === 'strength') renderStrengthView();
    if (view === 'nutrition') renderNutritionView();
    if (view === 'garmin-health') { renderGarminHealthData(); renderManagedPeriods(); }
    if (view === 'data') void renderGarminExportArchiveHistory();
    if (view === 'upload') renderImportHistory();
    if (view === 'health-data') renderMetricHistory('health');
    if (view === 'training-analysis') renderMetricHistory('training');
    if (view === 'routes') renderRoutesView();
    if (view === 'profile') renderAthleteProfile();
    if (view === 'analyses' && sub === 'health') renderHealthAnalysis();
    if (parent === 'calendar' || (parent === 'training' && sub === 'activities')) renderCalendar();
}
function switchMoreTab(tab) {
    switchTab(tab);
}

// ------------------------------------------------------------
// Gesamt-Aktualisierung der Oberfläche (im Original: initEngine)
// ------------------------------------------------------------
function refreshSportAnalytics() {
    const overviewContent = document.getElementById('analysis-overview-content');
    if (overviewContent && !overviewContent.classList.contains('hidden')) renderAnalysisOverview();
}

function openGarminConnectionModal() {
    const modal = document.getElementById('garmin-connection-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
    const keyInput = document.getElementById('garmin-api-key');
    if (keyInput) keyInput.value = '';
    const endInput = document.getElementById('garmin-preview-end-date');
    const startInput = document.getElementById('garmin-preview-start-date');
    const today = new Date();
    const iso = date => {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    };
    if (endInput && !endInput.value) endInput.value = iso(today);
    if (startInput && !startInput.value) {
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        startInput.value = iso(yearAgo);
    }
    refreshGarminConnectionStatus();
    loadGarminSyncHistory();
}

function closeGarminConnectionModal() {
    const modal = document.getElementById('garmin-connection-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    const keyInput = document.getElementById('garmin-api-key');
    if (keyInput) keyInput.value = '';
}

async function callGarminFunction(body) {
    if (!appUserReady || !activeAppUserId) throw new Error('Bitte melde dich zuerst an.');

    const readInvocationError = async error => {
        const response = error?.context;
        let detail = '';
        let code = '';
        if (response && typeof response.clone === 'function') {
            try {
                const payload = await response.clone().json();
                detail = payload?.error || payload?.message || '';
                code = payload?.code || '';
            } catch (_) {
                try { detail = (await response.clone().text()).slice(0, 500); } catch (_) {}
            }
        }
        return { detail, code, status: Number(response?.status || error?.status || 0) };
    };

    let result = await supabase.functions.invoke('garmin-personal', { body });
    if (result.error) {
        const firstError = await readInvocationError(result.error);
        if (body?.action === 'sync-today' && firstError.status === 409 && firstError.code === 'garmin_sync_already_running') {
            return { ok: true, busy: true };
        }
        const isSessionError = firstError.status === 401
            || /Sitzung ungültig|Anmeldung erforderlich|Invalid JWT|invalid claim/i.test(firstError.detail);
        if (isSessionError) {
            // Ein abgelaufenes Access-Token einmal über den gespeicherten Refresh-Token erneuern.
            let refreshResult;
            try {
                refreshResult = await supabase.auth.refreshSession();
            } catch (_) {
                throw new Error('Die Supabase-Sitzung konnte nicht automatisch erneuert werden. Bitte prüfe die Verbindung und melde dich gegebenenfalls erneut an.');
            }
            const refreshed = refreshResult?.data;
            const refreshError = refreshResult?.error;
            const refreshedUserId = refreshed?.session?.user?.id || null;
            if (refreshError || !refreshed?.session || refreshedUserId !== activeAppUserId) {
                throw new Error('Die Supabase-Sitzung konnte nicht automatisch erneuert werden. Bitte melde dich erneut an.');
            }
            result = await supabase.functions.invoke('garmin-personal', { body });
            if (result.error) {
                const retryError = await readInvocationError(result.error);
                throw new Error(retryError.detail || 'Die Sitzung ist weiterhin ungültig. Bitte melde dich erneut an.');
            }
        } else {
            throw new Error(firstError.detail || result.error.message || 'Die Garmin-Serverfunktion konnte nicht erreicht werden.');
        }
    }
    if (!result.data?.ok) throw new Error(result.data?.error || 'Die Garmin-Anfrage ist fehlgeschlagen.');
    return result.data;
}

async function createGarminArchivePartLinks() {
    const button = document.getElementById('garmin-archive-parts-button');
    const status = document.getElementById('garmin-archive-parts-status');
    const list = document.getElementById('garmin-archive-parts-links');
    if (!button || !status || !list) return;

    button.disabled = true;
    button.textContent = 'Links werden erstellt …';
    status.textContent = 'Prüfe Anmeldung und Archivzugriff …';
    status.className = 'text-xs text-slate-400';
    list.replaceChildren();

    try {
        const result = await callGarminFunction({ action: 'read-export-archive-parts' });
        if (!Array.isArray(result.parts) || result.parts.length !== 6) {
            throw new Error('Die Serverfunktion hat nicht genau sechs Archivteile zurückgegeben.');
        }

        const fragment = document.createDocumentFragment();
        for (const part of [...result.parts].sort((a, b) => Number(a.part) - Number(b.part))) {
            const url = new URL(part.signedUrl);
            if (url.protocol !== 'https:'
                || url.hostname !== 'zgvargkfzgekokuisarv.supabase.co'
                || !url.pathname.startsWith('/storage/v1/object/sign/garmin-exports/')) {
                throw new Error('Ein Archiv-Link hat ein unerwartetes URL-Format und wurde nicht angezeigt.');
            }

            const row = document.createElement('li');
            row.className = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2';
            const label = document.createElement('span');
            label.className = 'text-xs text-slate-300';
            label.textContent = `Archivteil ${String(part.part).padStart(2, '0')} · ${(Number(part.sizeBytes) / 1024 / 1024).toFixed(1)} MB`;

            const link = document.createElement('a');
            link.href = part.signedUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'text-xs font-semibold text-cyan-300 underline underline-offset-2';
            link.textContent = 'Herunterladen';

            row.append(label, link);
            fragment.append(row);
        }

        list.replaceChildren(fragment);
        const minutes = Math.max(1, Math.round(Number(result.expiresInSeconds || 300) / 60));
        status.textContent = `Sechs Download-Links erstellt. Sie sind ungefähr ${minutes} Minuten gültig. Die sechs Archivteile werden einzeln heruntergeladen.`;
        status.className = 'text-xs text-emerald-300';
    } catch (error) {
        list.replaceChildren();
        status.textContent = error?.message || 'Die Archiv-Links konnten nicht erstellt werden.';
        status.className = 'text-xs text-rose-300';
    } finally {
        button.disabled = false;
        button.textContent = 'Sechs Archiv-Download-Links erzeugen';
    }
}

function collectGarminSummaryActivityIds(value, ids, audit, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return;
    if (Array.isArray(value)) {
        for (const item of value) collectGarminSummaryActivityIds(item, ids, audit, depth + 1);
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        if (key.toLowerCase() === 'summarizedactivitiesexport' && Array.isArray(item)) {
            for (const activity of item) {
                if (!activity || typeof activity !== 'object' || Array.isArray(activity)) continue;
                audit.records++;
                const id = activity.activityId ?? activity.id;
                if (id !== null && id !== undefined && /^\d+$/.test(String(id))) {
                    ids.add(String(id));
                    audit.withValidId++;
                } else {
                    audit.withoutValidId++;
                }
                if (activity.startTimeGmt != null || activity.startTimeGMT != null || activity.startTimeLocal != null) audit.withStart++;
                if (activity.duration != null || activity.elapsedDuration != null) audit.withDuration++;
                if (activity.distance != null) audit.withDistance++;
                if (Array.isArray(activity.splits) && activity.splits.length) audit.withSplits++;
            }
        } else if (item && typeof item === 'object') {
            collectGarminSummaryActivityIds(item, ids, audit, depth + 1);
        }
    }
}

function getKajoGarminActivityId(activity) {
    const explicit = activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId;
    if (explicit !== null && explicit !== undefined) {
        const id = String(explicit).replace(/^garmin-/, '');
        return /^\d+$/.test(id) ? id : null;
    }
    if (activity?.source === 'garmin' || (Array.isArray(activity?.sources) && activity.sources.includes('garmin'))) {
        const id = String(activity?.id ?? '').replace(/^garmin-/, '');
        return /^\d+$/.test(id) ? id : null;
    }
    return null;
}

async function diagnoseGarminSummaryJson() {
    const button = document.getElementById('garmin-summary-diagnose-button');
    const status = document.getElementById('garmin-summary-diagnose-status');
    const results = document.getElementById('garmin-summary-diagnose-results');
    if (!button || !status || !results) return;

    button.disabled = true;
    button.textContent = 'Zusammenfassungen werden gelesen …';
    status.textContent = 'Prüfe Anmeldung und suche gespeicherte Garmin-JSON-Dateien …';
    status.className = 'text-xs text-slate-400';
    results.replaceChildren();
    results.classList.add('hidden');

    try {
        if (!Array.isArray(state.rawActivities)) {
            throw new Error('Die KAJO-Aktivitäten sind noch nicht geladen. Bitte lade die App neu und versuche es erneut.');
        }
        const listed = await callGarminFunction({ action: 'list-export-summary-json' });
        if (!Array.isArray(listed.files) || !listed.files.length) {
            throw new Error('Im Garmin-Archiv wurden keine lesbaren summarizedActivities-JSON-Dateien gefunden.');
        }

        const archiveIds = new Set();
        const audit = { records: 0, withValidId: 0, withoutValidId: 0, withStart: 0, withDuration: 0, withDistance: 0, withSplits: 0 };
        const fileSummaries = [];

        for (let index = 0; index < listed.files.length; index++) {
            const file = listed.files[index];
            status.textContent = 'Lese Datei ' + (index + 1) + ' von ' + listed.files.length + ': ' + String(file.name || 'Garmin-Zusammenfassung');
            const response = await callGarminFunction({ action: 'read-export-summary-json', fileId: file.id });
            if (typeof response.content !== 'string') {
                throw new Error('Die Datei ' + String(file.name || '') + ' wurde nicht als JSON-Text zurückgegeben.');
            }
            let parsed;
            try {
                parsed = JSON.parse(response.content);
            } catch (_) {
                throw new Error('Die Datei ' + String(file.name || '') + ' enthält kein gültiges JSON.');
            }
            const beforeRecords = audit.records;
            const beforeIds = archiveIds.size;
            const beforeValid = audit.withValidId;
            collectGarminSummaryActivityIds(parsed, archiveIds, audit);
            fileSummaries.push({
                name: String(response.file?.name || file.name || 'Garmin-Zusammenfassung'),
                records: audit.records - beforeRecords,
                uniqueIdsAdded: archiveIds.size - beforeIds,
                validIds: audit.withValidId - beforeValid,
                dateFrom: response.file?.dateFrom || file.dateFrom || null,
                dateTo: response.file?.dateTo || file.dateTo || null
            });
            parsed = null;
        }

        const kajoIds = new Set();
        for (const activity of state.rawActivities) {
            const id = getKajoGarminActivityId(activity);
            if (id) kajoIds.add(id);
        }
        let matched = 0;
        for (const id of archiveIds) if (kajoIds.has(id)) matched++;
        const archiveOnly = [...archiveIds].filter(id => !kajoIds.has(id));
        const kajoOnly = [...kajoIds].filter(id => !archiveIds.has(id));

        const summary = document.createElement('div');
        summary.className = 'rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2';
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-slate-200';
        heading.textContent = 'Abgleich abgeschlossen – ausschließlich lesend';
        const stats = document.createElement('div');
        stats.className = 'grid grid-cols-2 gap-2 sm:grid-cols-3';
        const statItems = [
            ['JSON-Dateien', String(fileSummaries.length)],
            ['Aktivitätsdatensätze', audit.records.toLocaleString('de-DE')],
            ['Eindeutige Garmin-IDs', archiveIds.size.toLocaleString('de-DE')],
            ['In KAJO gefunden', matched.toLocaleString('de-DE')],
            ['Nicht in KAJO gefunden', archiveOnly.length.toLocaleString('de-DE')],
            ['KAJO-Garmin-IDs ohne Archivtreffer', kajoOnly.length.toLocaleString('de-DE')]
        ];
        for (const [label, value] of statItems) {
            const cell = document.createElement('div');
            cell.className = 'rounded-md bg-slate-900 p-2';
            const valueNode = document.createElement('div');
            valueNode.className = 'text-base font-bold text-cyan-200';
            valueNode.textContent = value;
            const labelNode = document.createElement('div');
            labelNode.className = 'text-[10px] text-slate-400';
            labelNode.textContent = label;
            cell.append(valueNode, labelNode);
            stats.append(cell);
        }
        const detail = document.createElement('p');
        detail.className = 'text-[11px] text-slate-400';
        detail.textContent = 'Zusätzlich erkannte Felder: Startzeit ' + audit.withStart.toLocaleString('de-DE')
            + ', Dauer ' + audit.withDuration.toLocaleString('de-DE')
            + ', Distanz ' + audit.withDistance.toLocaleString('de-DE')
            + ', Splits ' + audit.withSplits.toLocaleString('de-DE')
            + '. Datensätze ohne numerische Aktivitäts-ID: ' + audit.withoutValidId.toLocaleString('de-DE') + '.';
        const fileList = document.createElement('ul');
        fileList.className = 'space-y-1 text-[10px] text-slate-400';
        for (const file of fileSummaries) {
            const item = document.createElement('li');
            item.textContent = file.name + ' · ' + file.records.toLocaleString('de-DE') + ' Datensätze · '
                + file.uniqueIdsAdded.toLocaleString('de-DE') + ' neue eindeutige IDs'
                + (file.dateFrom || file.dateTo ? ' · ' + (file.dateFrom || '—') + ' bis ' + (file.dateTo || '—') : '');
            fileList.append(item);
        }
        summary.append(heading, stats, detail, fileList);

        if (archiveOnly.length) {
            const examplesTitle = document.createElement('p');
            examplesTitle.className = 'text-[11px] font-semibold text-slate-300';
            examplesTitle.textContent = 'Beispiele für IDs, die aktuell nicht in KAJO gefunden wurden';
            const examples = document.createElement('p');
            examples.className = 'break-all text-[10px] text-slate-400';
            examples.textContent = archiveOnly.slice(0, 15).join(', ') + (archiveOnly.length > 15 ? ' …' : '');
            summary.append(examplesTitle, examples);
        }
        results.replaceChildren(summary);
        results.classList.remove('hidden');
        status.textContent = 'Abgleich erfolgreich. Es wurden ' + archiveIds.size.toLocaleString('de-DE')
            + ' eindeutige Garmin-Aktivitäts-IDs mit ' + kajoIds.size.toLocaleString('de-DE')
            + ' in KAJO geladenen Garmin-Aktivitäts-IDs verglichen.';
        status.className = 'text-xs text-emerald-300';
    } catch (error) {
        status.textContent = error?.message || 'Die Garmin-Zusammenfassungen konnten nicht geprüft werden.';
        status.className = 'text-xs text-rose-300';
    } finally {
        button.disabled = false;
        button.textContent = 'Zusammenfassungsdateien prüfen';
    }
}

// Verhindert doppelte parallele Garmin-Vorschauabrufe pro Benutzer.
const garminActivityCloudLoadsInFlight = new Map();

async function loadGarminActivitiesFromCloud(expectedUserId = activeAppUserId, expectedActivationSequence = activationSequence) {
    const userId = expectedUserId;
    const requestActivationSequence = expectedActivationSequence;
    if (!userId) throw new Error('Für den Garmin-Aktivitätsabgleich ist kein aktiver Benutzer angemeldet.');
    const requestKey = userId + ':' + requestActivationSequence;

    const existingLoad = garminActivityCloudLoadsInFlight.get(requestKey);
    if (existingLoad) return existingLoad;

    const loadPromise = (async () => {
        const savedCursor = getUserLocalSetting('garminActivityCloudReadThrough');
        const seenAtById = parseGarminActivitySeenMap(
            getUserLocalSetting('garminActivityCloudSeenAtById')
        );
        // Ohne lokalen Änderungsindex wird die Metadatenliste einmal vollständig
        // gelesen. So werden auf einem neuen Gerät auch ältere, lokal fehlende
        // Aktivitäten erkannt und geladen.
        const validCursor = Object.keys(seenAtById).length > 0
            && typeof savedCursor === 'string'
            && Number.isFinite(Date.parse(savedCursor));
        const overlapStart = validCursor
            ? new Date(Math.max(0, Date.parse(savedCursor) - 24 * 60 * 60 * 1000)).toISOString()
            : null;

        // Zuerst nur IDs und Änderungszeitpunkte laden; vollständige JSON-Payloads
        // werden anschließend ausschließlich für neue/geänderte Aktivitäten geladen.
        const metadata = await loadGarminActivityPages((offset, limit) => {
            let query = supabase.from('garmin_activities')
                .select('garmin_activity_id, updated_at')
                .eq('user_id', userId);
            if (overlapStart) {
                // Incremental reads require a usable timestamp; the initial
                // full scan below also includes legacy rows with updated_at = null.
                query = query.not('updated_at', 'is', null)
                    .gte('updated_at', overlapStart)
                    .order('updated_at', { ascending: true })
                    .order('garmin_activity_id', { ascending: true });
            } else {
                query = query.order('start_time', { ascending: true })
                    .order('garmin_activity_id', { ascending: true });
            }
            return query.range(offset, offset + limit - 1);
        });

        const deletionRows = await loadAccountActivityDeletionRows(userId);
        const deletedGarminIds = new Set(deletionRows
            .map(row => row?.garmin_activity_id)
            .filter(value => value != null)
            .map(String));
        const locallyAvailableGarminIds = new Set();
        let removedDeletedActivities = 0;
        state.rawActivities = (Array.isArray(state.rawActivities) ? state.rawActivities : []).filter(activity => {
            const sourceId = getKajoGarminActivityId(activity);
            if (sourceId != null && deletedGarminIds.has(String(sourceId))) {
                removedDeletedActivities++;
                return false;
            }
            if (sourceId != null) locallyAvailableGarminIds.add(String(sourceId));
            return true;
        });
        if (removedDeletedActivities) {
            saveDataToLocalStorage();
            console.info('KAJO: kontoübergreifend gelöschte Garmin-Aktivitäten lokal entfernt:', removedDeletedActivities);
        }

        // Löschkennzeichnungen haben Vorrang vor älteren Garmin-Metadaten.
        const activeMetadata = metadata.filter(row => !deletedGarminIds.has(String(row?.garmin_activity_id ?? '')));
        const rowsNeedingPayload = getGarminActivityRowsNeedingPayload(
            activeMetadata,
            seenAtById,
            locallyAvailableGarminIds
        );
        const changedIds = rowsNeedingPayload
            .map(row => String(row.garmin_activity_id))
            .filter(Boolean);
        const data = [];

        // Begrenzte IN-Abfragen vermeiden große Filter und wiederholte JSON-Transfers.
        for (let offset = 0; offset < changedIds.length; offset += 100) {
            const ids = changedIds.slice(offset, offset + 100);
            const { data: batch, error } = await supabase
                .from('garmin_activities')
                .select('garmin_activity_id, activity, updated_at')
                .eq('user_id', userId)
                .in('garmin_activity_id', ids)
                .order('updated_at', { ascending: true })
                .order('garmin_activity_id', { ascending: true });
            if (error) throw error;
            data.push(...(batch || []));
        }

        if (activeAppUserId !== userId || !appUserReady || activationSequence !== requestActivationSequence) {
            return { added: 0, merged: 0, ambiguous: 0, sanitized: 0, stale: true };
        }

        let added = 0, merged = 0, ambiguous = 0;
        for (const row of data) {
            const candidate = garminCandidateFromPreview(row.activity);
            if (!candidate) continue;
            const matches = findGarminDuplicates(candidate);
            if (matches.length === 1) {
                mergeGarminActivity(matches[0], candidate);
                merged++;
            } else if (matches.length === 0) {
                state.rawActivities.push(candidate);
                added++;
            } else {
                ambiguous++;
            }
        }
        const sanitized = data.length
            ? state.rawActivities.reduce((count, activity) => count + (sanitizeGarminActivityTelemetry(activity) ? 1 : 0), 0)
            : 0;
        if (added || merged || sanitized) {
            if (saveDataToLocalStorage() === false) {
                throw new Error('Garmin-Aktivitätsvorschauen wurden geladen, konnten aber nicht lokal gespeichert werden.');
            }
            initEngine();
        }

        const latestUpdatedAt = metadata.map(row => row?.updated_at)
            .filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
            .sort()
            .at(-1);
        if (latestUpdatedAt) {
            if (activeAppUserId !== userId || !appUserReady || activationSequence !== requestActivationSequence) {
                return { added, merged, ambiguous, sanitized, stale: true };
            }
            const nextSeenAtById = mergeGarminActivitySeenMap(seenAtById, metadata, latestUpdatedAt);
            setUserLocalSetting('garminActivityCloudSeenAtById', JSON.stringify(nextSeenAtById));
            setUserLocalSetting('garminActivityCloudReadThrough', latestUpdatedAt);
        }
        return { added, merged, ambiguous, sanitized, stale: false, checked: metadata.length, downloaded: data.length };
    })();

    garminActivityCloudLoadsInFlight.set(requestKey, loadPromise);
    try {
        return await loadPromise;
    } finally {
        if (garminActivityCloudLoadsInFlight.get(requestKey) === loadPromise) {
            garminActivityCloudLoadsInFlight.delete(requestKey);
        }
    }
}


function findGarminNumber(payload, aliases) {
    const wanted = new Set(aliases.map(key => key.toLowerCase()));
    const visited = new Set();
    function walk(value) {
        if (!value || typeof value !== 'object' || visited.has(value)) return null;
        visited.add(value);
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = walk(item);
                if (found !== null) return found;
            }
            return null;
        }
        for (const [key, raw] of Object.entries(value)) {
            if (wanted.has(key.toLowerCase()) && raw !== null && raw !== '' && Number.isFinite(Number(raw))) {
                return Number(raw);
            }
        }
        for (const raw of Object.values(value)) {
            const found = walk(raw);
            if (found !== null) return found;
        }
        return null;
    }
    return walk(payload);
}

function findGarminSleepScore(payload) {
    const direct = findGarminNumber(payload, ['overallSleepScore', 'sleepScore', 'overallScore']);
    if (direct !== null) return direct;
    const visited = new Set();
    function walk(value) {
        if (!value || typeof value !== 'object' || visited.has(value)) return null;
        visited.add(value);
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = walk(item);
                if (found !== null) return found;
            }
            return null;
        }
        for (const [key, child] of Object.entries(value)) {
            if (key.toLowerCase() === 'overall' && child && typeof child === 'object' &&
                child.value !== undefined && Number.isFinite(Number(child.value))) return Number(child.value);
        }
        for (const child of Object.values(value)) {
            const found = walk(child);
            if (found !== null) return found;
        }
        return null;
    }
    return walk(payload);
}

function findGarminNumberInNamedSection(payload, sectionName, aliases) {
    const visited = new Set();
    function walk(value) {
        if (!value || typeof value !== 'object' || visited.has(value)) return null;
        visited.add(value);
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = walk(item);
                if (found !== null) return found;
            }
            return null;
        }
        for (const [key, child] of Object.entries(value)) {
            if (key.toLowerCase() === sectionName.toLowerCase()) {
                const found = findGarminNumber(child, aliases);
                if (found !== null) return found;
            }
        }
        for (const child of Object.values(value)) {
            const found = walk(child);
            if (found !== null) return found;
        }
        return null;
    }
    return walk(payload);
}

async function loadGarminHealthRecordsIntoCheckins(startDate, endDate, options = {}) {
    const dryRun = options.dryRun === true;
    if (!appUserReady || !activeAppUserId) throw new Error('Bitte melde dich an, bevor du Garmin-Gesundheitsdaten wiederherstellst.');
    if (!supabase) throw new Error('Die Verbindung zur Garmin-Datenbank ist nicht verfügbar.');

    const userId = activeAppUserId;
    const expectedActivationSequence = activationSequence;
    const ensureCurrentUser = createActivationGuard(
        () => appUserReady && activeAppUserId === userId && activationSequence === expectedActivationSequence,
        'Der Garmin-Gesundheitsdatenimport wurde wegen eines Konto- oder Sitzungswechsels abgebrochen.'
    );
    const { count, error: countError } = await supabase.from('garmin_health_records')
        .select('record_date', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('record_date', startDate)
        .lte('record_date', endDate);
    if (countError) throw countError;
    ensureCurrentUser();

    const rows = await loadGarminActivityPages((offset, limit) => supabase.from('garmin_health_records')
        .select('data_type, record_date, payload')
        .eq('user_id', userId)
        .gte('record_date', startDate)
        .lte('record_date', endDate)
        .order('record_date', { ascending: true })
        .range(offset, offset + limit - 1), {
            pageSize: 1000,
            totalCount: Number.isFinite(count) ? count : undefined,
            concurrency: 3
        });
    ensureCurrentUser();

    const byDate = new Map();
    for (const row of rows) {
        if (!byDate.has(row.record_date)) byDate.set(row.record_date, {});
        byDate.get(row.record_date)[row.data_type] = row.payload;
    }

    let importedValues = 0;
    let changedDays = 0;
    const metricSummary = {};
    for (const [date, records] of byDate) {
        const existing = state.dailyCheckins[date] || {};
        const updates = {};
        const hrvPayload = records.hrv_daily ?? records.hrv_detail;
        const heartPayload = records.heart_rate ?? records.daily_summary;
        const sleepPayload = records.sleep_detail ?? records.sleep_summaries;
        const summaryPayload = records.daily_summary;

        const weightMeasurement = normalizeGarminWeight(records.weight);
        const candidates = {
            garminHrv: findGarminNumber(hrvPayload, ['lastNightAvg', 'lastNightAverage', 'averageHrv', 'avgHrv', 'hrv']),
            garminRhr: findGarminNumber(heartPayload, ['restingHeartRate', 'restingHr', 'restingHR']),
            garminSleepDuration: findGarminNumber(sleepPayload, ['sleepTimeSeconds', 'totalSleepSeconds', 'sleepDurationSeconds']),
            garminSleepScore: findGarminSleepScore(sleepPayload),
            garminRespiration: findGarminNumber(sleepPayload, ['averageRespiration', 'avgRespiration', 'avgRespirationValue', 'averageRespirationValue', 'respirationRate']),
            garminStress: findGarminNumber(records.stress, ['overallStressLevel', 'averageStressLevel', 'avgStressLevel', 'averageStress', 'avgStress', 'stressLevel']),
            garminWeight: weightMeasurement?.value ?? findGarminNumber(records.weight, ['weightInKilograms', 'weightKg']),
            garminBodyBattery: findGarminNumberInNamedSection(summaryPayload, 'bodyBattery', ['latestValue']),
            garminSpo2: findGarminNumber(records.spo2, ['averageSpO2', 'avgSleepSpO2', 'latestSpO2']),
            garminSteps: findGarminNumber(records.steps, ['totalSteps']),
            garminFitnessAge: findGarminNumber(records.fitness_age, ['fitnessAge'])
        };
        if (candidates.garminRhr === null) candidates.garminRhr = findGarminNumber(summaryPayload, ['restingHeartRate', 'restingHr', 'restingHR']);
        if (candidates.garminRespiration === null) candidates.garminRespiration = findGarminNumber(summaryPayload, ['averageRespiration', 'avgRespiration', 'avgRespirationValue', 'averageRespirationValue']);
        if (candidates.garminStress === null) candidates.garminStress = findGarminNumber(summaryPayload, ['avgLevel']);
        if (candidates.garminBodyBattery === null) candidates.garminBodyBattery = findGarminNumber(records.body_battery, ['latestValue', 'bodyBatteryLevelValue']);
        if (candidates.garminSpo2 === null) candidates.garminSpo2 = findGarminNumber(summaryPayload, ['avgValue']);
        if (candidates.garminSteps === null) candidates.garminSteps = findGarminNumber(summaryPayload, ['value']);
        if (candidates.garminSleepDuration !== null) candidates.garminSleepDuration /= 3600;
        const sourceMetadata = {
            garminHrv: { source: 'garmin', metric: 'overnight_hrv_average', unit: 'ms' },
            garminRhr: { source: 'garmin', metric: 'resting_heart_rate', unit: 'bpm' },
            garminSleepDuration: { source: 'garmin', metric: 'sleep_duration', unit: 'h' },
            garminSleepScore: { source: 'garmin', metric: 'sleep_score', unit: 'points' },
            garminRespiration: { source: 'garmin', metric: 'respiration_rate', unit: 'breaths/min' },
            garminStress: { source: 'garmin', metric: 'daily_average_stress', unit: 'points' },
            garminWeight: {
                source: 'garmin', metric: 'body_weight', unit: 'kg',
                ...(weightMeasurement?.sourceType ? { sourceType: weightMeasurement.sourceType } : {})
            },
            garminBodyBattery: { source: 'garmin', metric: 'body_battery', unit: 'points' },
            garminSpo2: { source: 'garmin', metric: 'oxygen_saturation', unit: '%' },
            garminSteps: { source: 'garmin', metric: 'steps', unit: 'steps' },
            garminFitnessAge: { source: 'garmin', metric: 'fitness_age', unit: 'years' }
        };
        for (const [key, value] of Object.entries(candidates)) {
            if (value === null || !Number.isFinite(value)) continue;
            if (key === 'garminHrv' && value <= 0) continue;
            if (key === 'garminRhr' && (value <= 0 || value > 250)) continue;
            if (key === 'garminSleepDuration' && (value <= 0 || value > 24)) continue;
            if (key === 'garminSleepScore' && (value < 0 || value > 100)) continue;
            if (key === 'garminRespiration' && (value < 4 || value > 60)) continue;
            if (key === 'garminStress' && (value < 0 || value > 100)) continue;
            if (key === 'garminWeight' && (value <= 0 || value > 400)) continue;
            if (key === 'garminBodyBattery' && (value < 0 || value > 100)) continue;
            if (key === 'garminSpo2' && (value < 50 || value > 100)) continue;
            if (key === 'garminSteps' && (value < 0 || value > 200000)) continue;
            if (key === 'garminFitnessAge' && (value <= 0 || value > 120)) continue;
            // Garmin-eigene Felder werden aktualisiert; manuelle Check-ins bleiben getrennt.
            const normalizedValue = key === 'garminSleepDuration' ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10;
            const classification = classifyGarminMetricUpdate(existing[key], normalizedValue);
            if (!metricSummary[key]) metricSummary[key] = { added: 0, updated: 0, unchanged: 0 };
            metricSummary[key][classification]++;
            updates[key] = normalizedValue;
            updates.measurementSources = {
                ...(updates.measurementSources || existing.measurementSources || {}),
                [key]: sourceMetadata[key]
            };
        }
        const metricCount = countGarminMetricUpdates(updates);
        if (!metricCount) continue;
        if (!dryRun) state.dailyCheckins[date] = { ...existing, ...updates };
        importedValues += metricCount;
        changedDays++;
    }

    ensureCurrentUser();
    if (!dryRun && importedValues > 0) {
        if (saveDataToLocalStorage() === false) {
            throw new Error('Die Werte wurden ermittelt, konnten aber nicht gespeichert werden. Bitte Kontoanmeldung prüfen.');
        }
        initEngine();
    }
    return { days: changedDays, values: importedValues, records: rows.length, dates: byDate.size, metrics: metricSummary };
}

function formatGarminHealthPreview(result) {
    const labels = {
        garminHrv: 'HRV', garminRhr: 'Ruheherzfrequenz', garminSleepDuration: 'Schlafdauer',
        garminSleepScore: 'Schlafscore', garminRespiration: 'Atemfrequenz', garminStress: 'Stress',
        garminWeight: 'Gewicht', garminBodyBattery: 'Body Battery', garminSpo2: 'SpO₂',
        garminSteps: 'Schritte', garminFitnessAge: 'Fitnessalter'
    };
    const lines = Object.entries(result.metrics || {}).map(([key, counts]) =>
        (labels[key] || key) + ': neu ' + counts.added + ' · aktualisiert ' + counts.updated + ' · unverändert ' + counts.unchanged
    );
    return 'Vorschau: ' + result.values + ' Garmin-Werte an ' + result.days + ' Tagen.\n' +
        'Geprüft: ' + result.records + ' Rohdatensätze an ' + result.dates + ' Tagen.\n\n' +
        'Aufschlüsselung:\n' + lines.join('\n') + '\n\nEs wurde noch nichts verändert.';
}

async function previewGarminHealthRange() {
    const startDate = document.getElementById('garmin-preview-start-date')?.value;
    const endDate = document.getElementById('garmin-preview-end-date')?.value;
    const button = document.getElementById('garmin-health-preview-button');
    const status = document.getElementById('garmin-health-restore-status');
    const today = new Date().toISOString().slice(0, 10);
    if (!button || !status) return;
    if (!startDate || !endDate || startDate > endDate || endDate > today) {
        status.textContent = 'Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';
        return;
    }
    if (!appUserReady || !activeAppUserId) {
        status.textContent = 'Bitte melde dich an, bevor du die Vorschau startest.';
        return;
    }
    button.disabled = true;
    button.textContent = 'Vorschau wird erstellt …';
    status.textContent = 'Prüfe die vorhandenen Rohdaten, ohne Check-ins zu verändern …';
    try {
        const result = await loadGarminHealthRecordsIntoCheckins(startDate, endDate, { dryRun: true });
        status.textContent = result.records === 0
            ? 'Vorschau: Für den gewählten Zeitraum wurden keine gespeicherten Garmin-Rohdatensätze gefunden.'
            : formatGarminHealthPreview(result);
    } catch (error) {
        status.textContent = 'Vorschau fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler');
    } finally {
        button.disabled = false;
        button.textContent = 'Vorschau berechnen';
    }
}

async function restoreGarminHealthRange() {
    const startDate = document.getElementById('garmin-preview-start-date')?.value;
    const endDate = document.getElementById('garmin-preview-end-date')?.value;
    const button = document.getElementById('garmin-health-restore-button');
    const status = document.getElementById('garmin-health-restore-status');
    const today = new Date().toISOString().slice(0, 10);
    if (!button || !status) return;
    if (!startDate || !endDate || startDate > endDate || endDate > today) {
        status.textContent = 'Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';
        return;
    }
    if (!appUserReady || !activeAppUserId) {
        status.textContent = 'Bitte melde dich an, bevor du die Wiederherstellung startest.';
        return;
    }
    button.disabled = true;
    button.textContent = 'Gesundheitsdaten werden wiederhergestellt …';
    status.textContent = 'Lese bereits gespeicherte Garmin-Rohdaten. Es werden keine Garmin-API-Aufrufe gestartet …';
    try {
        const result = await loadGarminHealthRecordsIntoCheckins(startDate, endDate);
        status.textContent = result.records === 0
            ? 'Für den gewählten Zeitraum wurden keine gespeicherten Garmin-Rohdatensätze gefunden.'
            : 'Wiederherstellung abgeschlossen: ' + result.values + ' Garmin-Werte an ' + result.days +
                ' Tagen aktualisiert/ergänzt. Geprüft: ' + result.records + ' Rohdatensätze an ' + result.dates +
                ' Tagen. Manuelle Check-in-Angaben bleiben getrennt.';
    } catch (error) {
        console.error('Garmin-Gesundheitsdaten konnten nicht wiederhergestellt werden:', error);
        status.textContent = 'Wiederherstellung fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler');
    } finally {
        button.disabled = false;
        button.textContent = 'Gesundheitsdaten aus Rohdaten wiederherstellen';
    }
}

function setGarminSyncIndicator(state, label) {
    const indicator = document.getElementById('garmin-sync-indicator');
    const dot = document.getElementById('garmin-sync-indicator-dot');
    const text = document.getElementById('garmin-sync-indicator-text');
    if (!indicator || !dot || !text) return;
    const connected = state !== 'error';
    const displayLabel = label || (connected ? 'Verbunden' : 'Nicht verbunden');
    const dotColor = state === 'error' ? 'bg-rose-500'
        : state === 'partial' ? 'bg-amber-400'
        : state === 'syncing' ? 'bg-cyan-400' : 'bg-emerald-400';
    dot.className = 'inline-block h-2.5 w-2.5 rounded-full ' + dotColor;
    text.textContent = displayLabel;
    indicator.title = 'Garmin-Status: ' + displayLabel;
    indicator.setAttribute('aria-label', 'Garmin-Status: ' + displayLabel);
    const settingsStatus = document.getElementById('settings-garmin-status');
    const settingsDot = document.getElementById('settings-garmin-status-dot');
    if (settingsStatus) settingsStatus.textContent = displayLabel;
    if (settingsDot) {
        settingsDot.classList.toggle('is-connected', connected);
        settingsDot.classList.toggle('is-error', !connected);
    }
}

function setGarminSyncResult(message, state = 'info') {
    const node = document.getElementById('garmin-sync-result-status');
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.remove('text-slate-300', 'text-cyan-200', 'text-amber-200', 'text-rose-200');
    node.classList.add(state === 'error' ? 'text-rose-200' : state === 'partial' ? 'text-amber-200' : state === 'syncing' ? 'text-cyan-200' : 'text-slate-300');
    node.dataset.state = state;
}

function renderGarminSyncProgress(completedDays, totalDays, phase = 'Aktivitäts- und Gesundheitsdaten werden abgeglichen') {
    const status = document.getElementById('garmin-sync-result-status');
    if (!status) return;
    const total = Math.max(1, Number(totalDays) || 1);
    const completed = Math.max(0, Math.min(total, Number(completedDays) || 0));
    const percent = Math.round(completed / total * 100);
    status.innerHTML = `
        <div class="mb-2 flex items-center justify-between gap-3 text-xs">
            <span class="font-semibold text-slate-100" id="garmin-sync-progress-message">Garmin-Synchronisierung</span>
            <span class="shrink-0 tabular-nums text-cyan-300" id="garmin-sync-progress-count"></span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label="Garmin-Tagesfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
            <div id="garmin-sync-progress-bar" class="h-full rounded-full bg-cyan-400 transition-all duration-500" style="width:${percent}%"></div>
        </div>
        <p class="mt-2 text-[10px] leading-relaxed text-slate-400" id="garmin-sync-progress-phase"></p>`;
    status.setAttribute('aria-busy', 'true');
    status.querySelector('#garmin-sync-progress-count').textContent = completed + ' / ' + total + ' Tage · ' + percent + '%';
    status.querySelector('#garmin-sync-progress-phase').textContent = phase;
}

function setGarminSyncProgressPhase(phase) {
    const node = document.getElementById('garmin-sync-progress-phase');
    if (node) node.textContent = phase;
}

async function loadGarminSyncHistory() {
    const container = document.getElementById('garmin-sync-history');
    if (!container) return;
    if (!appUserReady || !activeAppUserId) {
        container.textContent = 'Bitte anmelden, um die Synchronisierungshistorie zu sehen.';
        return;
    }
    const requestUserId = activeAppUserId;
    const requestActivationSequence = activationSequence;
    const isCurrentRequest = () => appUserReady
        && activeAppUserId === requestUserId
        && activationSequence === requestActivationSequence;
    container.textContent = 'Synchronisierungshistorie wird geladen …';
    try {
        const { healthRows, activityRows } = await loadGarminSyncHistoryData(supabase, requestUserId);
        if (!isCurrentRequest()) return;

        const groups = new Map();
        for (const row of healthRows) {
            const type = String(row.data_type || 'other');
            const date = String(row.record_date || '').slice(0, 10);
            if (!groups.has(type)) groups.set(type, { count: 0, first: date, last: date });
            const group = groups.get(type);
            group.count++;
            if (date && (!group.first || date < group.first)) group.first = date;
            if (date && (!group.last || date > group.last)) group.last = date;
        }

        const activityDates = activityRows.map(row => String(row.start_time || '').slice(0, 10)).filter(Boolean);
        if (activityDates.length) {
            groups.set('activities', {
                count: activityDates.length,
                first: activityDates[0],
                last: activityDates[activityDates.length - 1]
            });
        }

        if (!groups.size) {
            container.textContent = 'Noch keine Garmin-Daten gespeichert.';
            return;
        }
        const labels = {
            activities: 'Aktivitäten',
            daily_summary: 'Tagesübersicht',
            heart_rate: 'Herzfrequenz',
            hrv_daily: 'HRV – Tageswerte',
            hrv_detail: 'HRV – Details',
            sleep_detail: 'Schlafdetails',
            sleep_summaries: 'Schlafübersichten',
            stress: 'Stress',
            steps: 'Schritte',
            body_battery: 'Body Battery',
            spo2: 'Sauerstoffsättigung',
            weight: 'Körpergewicht',
            hydration: 'Flüssigkeit',
            respiration: 'Atemfrequenz',
            menstrual_cycle_summary: 'Zyklusübersicht',
            menstrual_cycle_day_view: 'Zyklustagesdaten',
            fitness_age: 'Fitnessalter',
            wellness_activity: 'Wellness-Aktivität',
            nutrition: 'Ernährung'
        };
        const rows = [...groups.entries()].sort((a, b) => {
            if (a[0] === 'activities') return -1;
            if (b[0] === 'activities') return 1;
            return a[0].localeCompare(b[0]);
        });
        container.innerHTML = `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-[11px]">
              <thead><tr class="border-b border-slate-800 text-slate-500"><th class="py-2 pr-2 font-medium">Datenfeld</th><th class="py-2 px-2 text-right font-medium">Anzahl</th><th class="py-2 pl-2 text-right font-medium">Zeitraum</th></tr></thead>
              <tbody>${rows.map(([type, item]) => `
                <tr class="border-b border-slate-800/70 last:border-0">
                  <td class="py-2 pr-2 text-slate-200">${String(labels[type] || type.replaceAll('_', ' ')).replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char])}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-white">${item.count.toLocaleString('de-DE')}</td>
                  <td class="py-2 pl-2 text-right whitespace-nowrap text-slate-400">${item.first || '–'} – ${item.last || '–'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="pt-1 text-[10px] text-slate-500">Gezählt werden gespeicherte Garmin-Datensätze, nicht einzelne Messpunkte innerhalb einer Datei.</p>`;
    } catch (error) {
        if (isCurrentRequest()) {
            container.textContent = 'Historie konnte nicht geladen werden: ' + (error.message || 'Unbekannter Fehler');
        }
    }
}

function applyGarminFitDetail(activity, detail) {
    if (!activity || !detail || typeof detail !== 'object') return;
    // Lap-, Set- und Workout-Daten müssen auch dann gespeichert werden, wenn
    // eine FIT-Datei keine verwertbare Messreihe (telemetry) enthält.
    if (detail.telemetry && typeof detail.telemetry === 'object') {
        activity.telemetry = mergeTelemetryData(activity.telemetry, detail.telemetry).value;
        // Garmin-eigene FIT-Daten werden bei einem Parser-Upgrade vollständig neu geschrieben,
        // damit ältere, unvollständige Zeitreihen nicht mit abweichenden Array-Längen blockieren.
        activity.garminTelemetry = Number(activity.garminFitParserVersion || 0) < 3
            ? detail.telemetry
            : mergeTelemetryData(activity.garminTelemetry, detail.telemetry).value;
    }
    if (Array.isArray(detail.exercises) && detail.exercises.length
        && (!Array.isArray(activity.exercises) || activity.exercises.length === 0)) {
        activity.exercises = detail.exercises.map(exercise => ({
            ...exercise,
            sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map(set => ({ ...set }))
        }));
        activity.strengthSource = 'garmin-fit';
        activity.strengthImportedAt = new Date().toISOString();
        if (!activity.type || activity.type === 'Workout') activity.type = 'WeightTraining';
    }
    activity.garminFitData = {
        recordCount: detail.recordCount || 0,
        recordFields: detail.recordFields || {},
        recordFieldCounts: detail.recordFieldCounts || {},
        messageGroups: detail.messageGroups || {},
        lapCount: detail.lapCount || 0,
        // Roh-Lap-Messages bleiben erhalten; die normalisierten Zeiten sind direkt auswertbar.
        laps: Array.isArray(detail.lapSummaries) ? detail.lapSummaries : [],
        setCount: detail.setCount || 0,
        workoutStepCount: detail.workoutStepCount || 0,
        importedAt: new Date().toISOString()
    };
    activity.garminFitImported = true;
    activity.garminFitParserVersion = 3;
    const session = detail.session;
    if (!session) return;
    const durationSec = Number(session.total_timer_time ?? session.total_elapsed_time);
    const distanceKm = Number(session.total_distance);
    const avg = Number(session.avg_heart_rate), max = Number(session.max_heart_rate);
    const nativeLoad = Number(session.training_load);
    const aerobicEffect = Number(session.aerobic_training_effect);
    const anaerobicEffect = Number(session.anaerobic_training_effect);
    if ((!Number.isFinite(Number(activity.duration)) || Number(activity.duration) <= 0) && Number.isFinite(durationSec) && durationSec > 0) activity.duration = Math.round(durationSec / 60);
    if ((!Number.isFinite(Number(activity.distance)) || Number(activity.distance) <= 0) && Number.isFinite(distanceKm) && distanceKm > 0) activity.distance = distanceKm;
    if ((!Number.isFinite(Number(activity.hr)) || Number(activity.hr) <= 0) && Number.isFinite(avg) && avg > 0) activity.hr = Math.round(avg);
    if ((!Number.isFinite(Number(activity.maxHr)) || Number(activity.maxHr) <= 0) && Number.isFinite(max) && max > 0) activity.maxHr = Math.round(max);
    if ((activity.garminTrainingLoad == null || !Number.isFinite(Number(activity.garminTrainingLoad)) || Number(activity.garminTrainingLoad) < 0) && Number.isFinite(nativeLoad) && nativeLoad >= 0) activity.garminTrainingLoad = nativeLoad;
    if ((activity.aerobicTrainingEffect == null || !Number.isFinite(Number(activity.aerobicTrainingEffect)) || Number(activity.aerobicTrainingEffect) < 0) && Number.isFinite(aerobicEffect) && aerobicEffect >= 0) activity.aerobicTrainingEffect = aerobicEffect;
    if ((activity.anaerobicTrainingEffect == null || !Number.isFinite(Number(activity.anaerobicTrainingEffect)) || Number(activity.anaerobicTrainingEffect) < 0) && Number.isFinite(anaerobicEffect) && anaerobicEffect >= 0) activity.anaerobicTrainingEffect = anaerobicEffect;
}

async function persistGarminTelemetryBatch(activities, userId) {
    if (!userId || activeAppUserId !== userId || !appUserReady) {
        throw new Error('Garmin-Telemetrie kann keinem aktiven Benutzerkonto zugeordnet werden.');
    }
    const records = (Array.isArray(activities) ? activities : []).map(activity => {
        const rawId = activity?.sourceRefs?.garminActivityId
            ?? activity?.garminData?.activityId
            ?? activity?.id;
        const activityId = String(rawId ?? '').replace(/^garmin-/, '');
        const telemetry = activity?.garminTelemetry;
        return /^\d+$/.test(activityId) && telemetry && typeof telemetry === 'object'
            && Object.keys(telemetry).length
            ? { garmin_activity_id: activityId, telemetry }
            : null;
    }).filter(Boolean);
    if (!records.length) return { uploaded: 0, candidates: 0, verified: 0 };
    const result = await uploadMissingGarminTelemetry(supabase, userId, records);
    if (result.verified !== records.length) {
        throw new Error('Garmin-Telemetrie wurde nicht vollständig in der Cloud bestätigt.');
    }
    return result;
}

async function syncMissingGarminTelemetry(startDate, endDate, status) {
    const syncUserId = activeAppUserId;
    const syncActivationSequence = activationSequence;
    const isCurrentSync = () => activeAppUserId === syncUserId && appUserReady && activationSequence === syncActivationSequence;
    if (!syncUserId || !appUserReady) throw new Error('Die Garmin-Telemetrie-Synchronisierung benötigt ein angemeldetes Konto.');
    const pending = state.rawActivities.filter(activity => {
        const id = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId;
        const date = String(activity.date || '').slice(0, 10);
        return id != null && /^\d+$/.test(String(id)) && date >= startDate && date <= endDate
            && Number(activity.garminFitParserVersion || 0) < 3;
    });
    let imported = 0, failed = 0, withHr = 0, withSpeed = 0, withCadence = 0;
    let laps = 0, sets = 0, workoutSteps = 0, recordFields = 0;
    const errors = [];
    let persistedThrough = 0;
    for (let index = 0; index < pending.length; index++) {
        if (!isCurrentSync()) {
            return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
        }
        const activity = pending[index];
        const id = String(activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId);
        const message = status?.querySelector('#garmin-sync-progress-message');
        if (message) message.textContent = 'Lade FIT-Aktivität ' + (index + 1) + '/' + pending.length;
        setGarminSyncProgressPhase('FIT-Zeitreihen und strukturierte Runden-/Trainingsdaten werden importiert.');
        try {
            let detail;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    detail = await downloadGarminFitTelemetry(id);
                    if (!isCurrentSync()) {
                        return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
                    }
                    break;
                } catch (error) {
                    if (!isCurrentSync()) {
                        return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
                    }
                    if (attempt > 0 || !/HTTP 429|rate.?limit/i.test(error?.message || '')) throw error;
                    if (message) message.textContent = 'Garmin begrenzt den FIT-Abruf. Aktivität ' + (index + 1) + '/' + pending.length + ' wird nach 30 Sekunden erneut versucht …';
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    if (!isCurrentSync()) {
                        return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
                    }
                }
            }
            applyGarminFitDetail(activity, detail);
            if (Number(detail.hrCount) >= 2) withHr++;
            if (Number(detail.speedCount) >= 2) withSpeed++;
            if (Number(detail.cadenceCount) >= 2) withCadence++;
            laps += Number(detail.lapCount || 0);
            sets += Number(detail.setCount || 0);
            workoutSteps += Number(detail.workoutStepCount || 0);
            recordFields += Object.keys(detail.recordFieldCounts || {}).length;
            imported++;
        } catch (error) {
            if (!isCurrentSync()) {
                return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
            }
            failed++;
            errors.push(id + ': ' + (error?.message || 'FIT-Abruf fehlgeschlagen'));
            console.warn('Garmin-Zeitreihen konnten nicht importiert werden:', id, error);
        }
        if ((index + 1) % 5 === 0 || index === pending.length - 1) {
            if (!isCurrentSync()) {
                return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
            }
            if (saveDataToLocalStorage() === false) throw new Error('Garmin-Zeitreihen konnten nicht im lokalen Datenspeicher gesichert werden.');
            const batch = pending.slice(persistedThrough, index + 1);
            const cloudResult = await persistGarminTelemetryBatch(batch, syncUserId);
            if (!isCurrentSync()) {
                return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors, aborted: true };
            }
            persistedThrough = index + 1;
            if (status) {
                const message = status.querySelector('#garmin-sync-progress-message');
                if (message) message.textContent = 'FIT-Telemetrie in der Cloud gesichert: ' + cloudResult.verified + ' Datensätze bestätigt.';
            }
            // Erst bestätigte FIT-Daten in Load/Performance einrechnen.
            initEngine();
        }
        // Sequential requests with a short gap reduce the risk of triggering Garmin rate limits.
        if (index < pending.length - 1) await new Promise(resolve => setTimeout(resolve, 600));
    }
    if (imported > 0) initEngine();
    return { total: pending.length, imported, failed, withHr, withSpeed, withCadence, laps, sets, workoutSteps, recordFields, errors };
}


/**
 * Lädt alle verfügbaren Garmin-Activity-Details-Zeitreihen ergänzend zu FIT-Daten.
 * Der Abruf läuft konto-authentifiziert und speichert ausschließlich im lokalen
 * Aktivitätsspeicher. Bestehende FIT-/Garmin-Werte und bereits vorhandene Reihen
 * bleiben erhalten; jede JSON-Messreihe behält ihre eigene Zeitachse.
 */
async function syncMissingGarminJsonTelemetry(startDate, endDate, status = null) {
    const syncUserId = activeAppUserId;
    const syncActivationSequence = activationSequence;
    const isCurrentSync = () => activeAppUserId === syncUserId && appUserReady && activationSequence === syncActivationSequence;
    if (!syncUserId || !appUserReady) throw new Error('Die Garmin-Telemetrie-Synchronisierung benötigt ein angemeldetes Konto.');
    const now = Date.now();
    const cooldowns = {
        no_data: 30 * 24 * 60 * 60 * 1000,
        error: 6 * 60 * 60 * 1000,
        rate_limited: 5 * 60 * 1000
    };
    const pending = state.rawActivities.filter(activity => {
        const rawId = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId ?? activity.id;
        const id = String(rawId ?? '').replace(/^garmin-/, '');
        const date = String(activity.date || '').slice(0, 10);
        if (!/^\d+$/.test(id) || date < startDate || date > endDate) return false;
        const existingMetricSeries = activity.garminTelemetry?.metricSeries || {};
        const existingMetricSeriesCount = Object.keys(existingMetricSeries).length;
        const hasMetricTimeAxis = Array.isArray(activity.garminTelemetry?.metricSeriesTime)
            || Object.values(existingMetricSeries).some(metric => Array.isArray(metric?.time));
        // Ältere JSON-Imports ohne vollständige Rohmessreihen-Zeitachse werden
        // einmalig erneut abgerufen und auf das aktuelle Datenmodell erweitert.
        if (activity.garminJsonImportedAt && existingMetricSeriesCount > 0 && hasMetricTimeAxis) return false;
        const lastAttempt = Date.parse(activity.garminJsonSyncAttemptedAt || '');
        const cooldown = cooldowns[activity.garminJsonSyncStatus] || 0;
        return !(Number.isFinite(lastAttempt) && cooldown > 0 && now - lastAttempt < cooldown);
    });

    let imported = 0, noData = 0, failed = 0, rawSeries = 0, rateLimited = false;
    const errors = [];
    let persistedThrough = 0;
    for (let index = 0; index < pending.length; index++) {
        if (!isCurrentSync()) {
            return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors, aborted: true };
        }
        const activity = pending[index];
        const rawId = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId ?? activity.id;
        const id = String(rawId).replace(/^garmin-/, '');
        const message = status?.querySelector('#garmin-sync-progress-message');
        const progress = 'Garmin-Rohtelemetrie: ' + (index + 1) + '/' + pending.length;
        if (message) message.textContent = progress;
        setGarminSyncProgressPhase('Garmin-Rohmessreihen werden ergänzt und anschließend in der Aktivität gespeichert.');
        setGarminSyncIndicator('syncing', progress);

        try {
            let response = null;
            let lastError = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    response = await callGarminFunction({ action: 'import-activity-json', activityId: id });
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (!/HTTP 429|rate.?limit/i.test(error?.message || '') || attempt === 1) break;
                    const match = String(error.message).match(/retryInSeconds["\s:=]+(\d+)/i);
                    const waitSeconds = Math.max(30, Number(match?.[1] || 30));
                    if (message) message.textContent = 'Garmin-Abruflimit: automatische Fortsetzung in ' + waitSeconds + ' Sekunden …';
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                    if (!isCurrentSync()) {
                        return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors, aborted: true };
                    }
                }
            }
            if (!isCurrentSync()) {
                return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors, aborted: true };
            }
            if (lastError) throw lastError;

            const telemetry = response?.telemetry;
            const metricSeries = telemetry?.metricSeries && typeof telemetry.metricSeries === 'object'
                ? telemetry.metricSeries : {};
            const usableSeries = Object.values(metricSeries).filter(metric => Array.isArray(metric?.values)
                && metric.values.filter(value => value !== null && value !== undefined
                    && value !== '' && Number.isFinite(Number(value))).length >= 2).length;
            if (!Array.isArray(telemetry?.time) || telemetry.time.length < 2 || usableSeries < 1) {
                activity.garminJsonSyncStatus = 'no_data';
                activity.garminJsonSyncAttemptedAt = new Date().toISOString();
                noData++;
            } else {
                const previous = activity.garminTelemetry && typeof activity.garminTelemetry === 'object'
                    ? activity.garminTelemetry : {};
                const previousSeries = previous.metricSeries && typeof previous.metricSeries === 'object'
                    ? previous.metricSeries : {};
                const fetchedSeries = {};
                for (const [key, metric] of Object.entries(metricSeries)) {
                    if (!metric || !Array.isArray(metric.values)) continue;
                    fetchedSeries[key] = { ...metric };
                }
                const mergedSeries = { ...fetchedSeries, ...previousSeries };
                // Legacy JSON series may not yet have their own time array. Attach
                // the existing axis only when its length demonstrably matches.
                for (const [key, metric] of Object.entries(mergedSeries)) {
                    if (Array.isArray(metric?.time) || !Array.isArray(metric?.values)) continue;
                    const fetchedAxis = telemetry.metricSeriesTime || telemetry.time;
                    const previousAxis = previous.metricSeriesTime;
                    const matchingAxis = Array.isArray(fetchedAxis) && fetchedAxis.length === metric.values.length
                        ? fetchedAxis
                        : Array.isArray(previousAxis) && previousAxis.length === metric.values.length
                            ? previousAxis : null;
                    if (matchingAxis) mergedSeries[key] = { ...metric, time: matchingAxis };
                }

                activity.garminTelemetry = {
                    ...previous,
                    ...(!Array.isArray(previous.time) || previous.time.length < 2 ? { time: telemetry.time } : {}),
                    ...(Array.isArray(telemetry.metricSeriesTime)
                        ? { metricSeriesTime: telemetry.metricSeriesTime }
                        : Array.isArray(previous.metricSeriesTime) ? { metricSeriesTime: previous.metricSeriesTime } : {}),
                    ...(!Array.isArray(previous.hr) && Array.isArray(telemetry.hr) ? { hr: telemetry.hr } : {}),
                    ...(!Array.isArray(previous.altitude) && Array.isArray(telemetry.altitude) ? { altitude: telemetry.altitude } : {}),
                    ...(!Array.isArray(previous.distance) && Array.isArray(telemetry.distance) ? { distance: telemetry.distance } : {}),
                    ...(!Array.isArray(previous.respirationRate) && Array.isArray(telemetry.respirationRate) ? { respirationRate: telemetry.respirationRate } : {}),
                    ...(!Array.isArray(previous.bodyBattery) && Array.isArray(telemetry.bodyBattery) ? { bodyBattery: telemetry.bodyBattery } : {}),
                    metricSeries: mergedSeries
                };
                activity.garminJsonImportedAt = new Date().toISOString();
                activity.garminJsonSource = 'garmin-activity-details-json';
                activity.garminJsonSyncStatus = 'complete';
                activity.garminJsonSyncAttemptedAt = activity.garminJsonImportedAt;
                activity.garminJsonMetricSeriesCount = Object.keys(mergedSeries).length;
                activity.garminJsonSampleCount = telemetry.sampleCount || telemetry.time.length;
                imported++;
                rawSeries += usableSeries;
            }
        } catch (error) {
            if (!isCurrentSync()) {
                return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors, aborted: true };
            }
            const errorMessage = error?.message || 'Unbekannter Garmin-JSON-Fehler';
            const limited = /HTTP 429|rate.?limit/i.test(errorMessage);
            activity.garminJsonSyncStatus = limited ? 'rate_limited' : 'error';
            activity.garminJsonSyncAttemptedAt = new Date().toISOString();
            failed++;
            errors.push(id + ': ' + errorMessage);
            if (limited) rateLimited = true;
        }

        if ((index + 1) % 5 === 0 || index === pending.length - 1 || rateLimited) {
            if (saveActivitiesToLocalStorage() === false) {
                throw new Error('Garmin-Rohtelemetrie konnte nicht im lokalen Aktivitätsspeicher gesichert werden.');
            }
            const batch = pending.slice(persistedThrough, index + 1);
            const cloudResult = await persistGarminTelemetryBatch(batch, syncUserId);
            if (!isCurrentSync()) {
                return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors, aborted: true };
            }
            persistedThrough = index + 1;
            if (message && cloudResult.verified) {
                message.textContent = 'Rohtelemetrie in der Cloud gesichert: ' + cloudResult.verified + ' Datensätze bestätigt.';
            }
            // Neue Rohmessreihen erst nach bestätigter Cloud-Speicherung übernehmen.
            initEngine();
        }
        if (rateLimited) break;
        if (index < pending.length - 1) await new Promise(resolve => setTimeout(resolve, 650));
    }

    if (imported > 0) initEngine();
    return { total: pending.length, imported, noData, failed, rawSeries, rateLimited, errors };
}

function recordGarminActivityCoverageRange(startDate, endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')
        || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')
        || startDate > endDate) return false;

    // The current local day is still in progress and cannot confirm a rest day.
    const today = getLocalCalendarDate();
    if (endDate > today) return false;
    const lastCompleteDate = new Date(today + 'T12:00:00');
    lastCompleteDate.setDate(lastCompleteDate.getDate() - 1);
    const cutoff = `${lastCompleteDate.getFullYear()}-${String(lastCompleteDate.getMonth() + 1).padStart(2, '0')}-${String(lastCompleteDate.getDate()).padStart(2, '0')}`;
    const completeEndDate = endDate === today ? cutoff : endDate;
    if (startDate > completeEndDate) return false;

    const ranges = Array.isArray(state.settings?.garminActivityCoverageRanges)
        ? state.settings.garminActivityCoverageRanges.filter(range =>
            /^\d{4}-\d{2}-\d{2}$/.test(range?.startDate || '')
            && /^\d{4}-\d{2}-\d{2}$/.test(range?.endDate || '')
            && range.startDate <= range.endDate && range.status === 'complete')
        : [];
    ranges.push({
        startDate, endDate: completeEndDate, status: 'complete',
        source: 'garmin_activity_list', syncedAt: new Date().toISOString()
    });
    ranges.sort((a, b) => a.startDate.localeCompare(b.startDate));

    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        const nextDayAfterLast = last
            ? new Date(new Date(last.endDate + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
            : null;
        if (last && range.startDate <= nextDayAfterLast) {
            if (range.endDate > last.endDate) last.endDate = range.endDate;
            if (range.syncedAt > last.syncedAt) last.syncedAt = range.syncedAt;
        } else {
            merged.push({ ...range });
        }
    }

    state.settings = { ...(state.settings || {}), garminActivityCoverageRanges: merged };
    if (saveDataToLocalStorage() === false) {
        throw new Error('Der erfolgreiche Garmin-Aktivitätszeitraum konnte nicht lokal gespeichert werden.');
    }
    return true;
}


async function syncGarminHeartRateRange(startDate, endDate, status) {
    const syncUserId = activeAppUserId;
    const syncActivationSequence = activationSequence;
    const isCurrentSync = () => activeAppUserId === syncUserId && appUserReady && activationSequence === syncActivationSequence;
    const pending = state.rawActivities.filter(activity => {
        const id = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId;
        const date = String(activity.date || '').slice(0, 10);
        const hr = Array.isArray(activity.garminTelemetry?.hr) ? activity.garminTelemetry.hr : [];
        const time = Array.isArray(activity.garminTelemetry?.time) ? activity.garminTelemetry.time : [];
        return id != null && /^\d+$/.test(String(id))
            && date >= startDate && date <= endDate
            && countValidHeartRateSamples(hr, time) < 2
            && !shouldSkipHeartRateRetry(activity.garminHeartRateImport);
    });

    let imported = 0, failed = 0, noHeartRate = 0, insufficientHeartRate = 0;
    let authFailed = false;
    const errors = [];
    for (let index = 0; index < pending.length; index++) {
        if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
        const activity = pending[index];
        const id = String(activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId);
        const message = status?.querySelector('#garmin-sync-progress-message');
        if (message) message.textContent = 'Lade ausschließlich HF-Zeitreihen: ' + (index + 1) + '/' + pending.length;
        try {
            let detail;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    detail = await downloadGarminFitTelemetry(id);
                    if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
                    break;
                } catch (error) {
                    if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
                    if (attempt >= 2 || !/HTTP 429|rate.?limit/i.test(error?.message || '')) throw error;
                    const waitSeconds = 30 + attempt * 15;
                    if (message) message.textContent = 'Garmin-Abruflimit erreicht. Neuer Versuch in ' + waitSeconds + ' Sekunden …';
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                    if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
                }
            }
            if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
            const hr = Array.isArray(detail?.telemetry?.hr) ? detail.telemetry.hr : [];
            const time = Array.isArray(detail?.telemetry?.time) ? detail.telemetry.time : [];
            const validHrCount = countValidHeartRateSamples(hr, time);
            if (validHrCount < 2) {
                const previousStatus = activity.garminHeartRateImport;
                activity.garminHeartRateImport = {
                    status: validHrCount === 0 ? 'no_hr_data' : 'insufficient_hr_data',
                    checkedAt: new Date().toISOString(),
                    parserVersion: 1,
                    recordCount: Number(detail?.recordCount || hr.length || 0),
                    sampleCount: validHrCount
                };
                if (saveDataToLocalStorage() === false) {
                    activity.garminHeartRateImport = previousStatus;
                    throw new Error('Der Status der fehlenden HF-Zeitreihe konnte nicht lokal gespeichert werden.');
                }
                if (validHrCount === 0) noHeartRate++;
                else insufficientHeartRate++;
            } else {
                const previous = activity.garminTelemetry;
                const previousStatus = activity.garminHeartRateImport;
                activity.garminTelemetry = {
                    ...(previous && typeof previous === 'object' ? previous : {}),
                    hr: [...hr],
                    time: [...time]
                };
                activity.garminHeartRateImport = {
                    status: 'imported',
                    checkedAt: new Date().toISOString(),
                    parserVersion: 1,
                    recordCount: Number(detail?.recordCount || hr.length),
                    sampleCount: validHrCount
                };
                if (saveDataToLocalStorage() === false) {
                    activity.garminTelemetry = previous;
                    activity.garminHeartRateImport = previousStatus;
                    throw new Error('Die HF-Zeitreihe konnte nicht lokal gespeichert werden.');
                }
                imported++;
                initEngine();
            }
        } catch (error) {
            if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
            failed++;
            errors.push(id + ': ' + (error?.message || 'HF-Nachladen fehlgeschlagen'));
            console.warn('Garmin-HF-Zeitreihe konnte nicht nachgeladen werden:', id, error);
            if (/Supabase-Sitzung|Sitzung ungültig|erneut anmelden|Invalid JWT|Anmeldung erforderlich/i.test(error?.message || '')) {
                authFailed = true;
                break;
            }
        }
        if (index < pending.length - 1 && !authFailed) {
            await new Promise(resolve => setTimeout(resolve, 900));
            if (!isCurrentSync()) return { total: pending.length, imported, failed, noHeartRate, insufficientHeartRate, remaining: pending.length - imported - failed - noHeartRate - insufficientHeartRate, authFailed, errors, aborted: true };
        }
    }
    if (imported > 0 && isCurrentSync()) initEngine();
    return {
        total: pending.length, imported, failed, noHeartRate, insufficientHeartRate,
        remaining: Math.max(0, pending.length - imported - failed - noHeartRate - insufficientHeartRate),
        authFailed, errors
    };
}

async function syncGarminSelectedRange() {
    const status = document.getElementById('garmin-sync-result-status');
    const button = document.getElementById('garmin-sync-range-button');
    const startDate = document.getElementById('garmin-preview-start-date')?.value;
    const endDate = document.getElementById('garmin-preview-end-date')?.value;
    if (!status || !button) return;
    const syncUserId = activeAppUserId;
    const syncActivationSequence = activationSequence;
    const isCurrentSync = () => Boolean(syncUserId && activeAppUserId === syncUserId && appUserReady && activationSequence === syncActivationSequence);
    if (!isCurrentSync()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (!startDate || !endDate || startDate > endDate || endDate > today) {
        status.textContent = 'Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';
        return;
    }
    const syncMode = document.getElementById('garmin-sync-mode')?.value || 'all';
    if (syncMode === 'heart-rate-only') {
        button.disabled = true;
        button.textContent = 'HF-Zeitreihen werden geladen …';
        setGarminSyncIndicator('syncing', 'HF-Zeitreihen werden geladen');
        const totalDays = Math.max(1, Math.round((new Date(endDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z')) / 86400000) + 1);
        renderGarminSyncProgress(0, totalDays);
        try {
            const result = await syncGarminHeartRateRange(startDate, endDate, status);
            if (!isCurrentSync() || result.aborted) return;
            status.removeAttribute('aria-busy');
            status.textContent = result.authFailed
                ? 'HF-Nachladen pausiert: Supabase-Sitzung konnte nicht erneuert werden. Bitte melde dich erneut an. ' +
                    result.imported + ' geladen, ' + result.remaining + ' noch nicht versucht.'
                : result.total === 0
                    ? 'Keine Garmin-Aktivitäten mit fehlender oder unvollständiger HF-Zeitreihe im gewählten Zeitraum gefunden.'
                    : 'HF-Nachladen abgeschlossen: ' + result.imported + '/' + result.total + ' Zeitreihen geladen; ' +
                        result.noHeartRate + ' ohne HF-Daten in der FIT-Datei; ' +
                        result.insufficientHeartRate + ' mit zu wenigen HF-Messpunkten; ' +
                        result.failed + ' technische Fehler. Andere Garmin-Daten und Gesundheitsdaten wurden nicht synchronisiert.' +
                        (result.remaining ? ' Noch nicht versucht: ' + result.remaining + '.' : '') +
                        (result.errors.length ? ' Erste Fehler: ' + result.errors.slice(0, 3).join(' | ') : '');
            setGarminSyncIndicator('current', 'Verbunden');
            await refreshGarminConnectionStatus(syncUserId, syncActivationSequence);
            if (!isCurrentSync()) return;
        } catch (error) {
            if (!isCurrentSync()) return;
            status.removeAttribute('aria-busy');
            status.textContent = 'HF-Nachladen pausiert: ' + (error?.message || 'Unbekannter Fehler');
            setGarminSyncIndicator('current', 'Verbunden');
        } finally {
            // Ein alter Sync darf die Schaltfläche einer neu aktivierten Sitzung nicht freigeben.
            if (isCurrentSync()) {
                button.disabled = false;
                button.textContent = 'Daten synchronisieren';
            }
        }
        return;
    }
    button.disabled = true;
    button.textContent = 'Synchronisierung läuft …';
    const totalDays = Math.max(1, Math.round((new Date(endDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z')) / 86400000) + 1);
    setGarminSyncIndicator('syncing', 'Synchronisierung läuft');
    renderGarminSyncProgress(0, totalDays);
    try {
    const addUtcDays = (date, days) => {
        const value = new Date(date + 'T00:00:00Z');
        value.setUTCDate(value.getUTCDate() + days);
        return value.toISOString().slice(0, 10);
    };
    const chunks = [];
    for (let cursor = startDate; cursor <= endDate;) {
        const candidateEnd = addUtcDays(cursor, 6);
        const chunkEnd = candidateEnd < endDate ? candidateEnd : endDate;
        chunks.push({ startDate: cursor, endDate: chunkEnd });
        cursor = addUtcDays(chunkEnd, 1);
    }

    let activitySummary = { status: 'ok', fetched: 0, stored: 0, scannedDays: 0, skippedDays: 0 };
    let healthImportSummary = { days: 0, values: 0 };
    let consecutiveRateLimits = 0;
    let batch = 0;
    let completedBeforeChunk = 0;

    // Each Edge Function request handles at most seven calendar days of activity
    // history. Health history keeps its own three-day cursor inside that chunk.
    // This prevents a long historical range from exhausting the worker time limit.
    for (const chunk of chunks) {
        if (!isCurrentSync()) return;
        let includeActivities = true;
        let remainingDays = null;
        const chunkDays = Math.floor(
            (new Date(chunk.endDate + 'T00:00:00Z').getTime() - new Date(chunk.startDate + 'T00:00:00Z').getTime()) / 86400000
        ) + 1;

        while (remainingDays !== 0) {
            if (batch >= 5000) throw new Error('Sicherheitsgrenze für automatische Teilabrufe erreicht. Der gespeicherte Fortschritt bleibt erhalten.');
            let response;
            try {
                response = await callGarminFunction({
                    action: 'sync-range',
                    startDate: chunk.startDate,
                    endDate: chunk.endDate,
                    activityRescanEndDate: endDate,
                    includeActivities,
                    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
                    onlyMissingDays: true
                });
                if (!isCurrentSync()) return;
            } catch (error) {
                if (!isCurrentSync()) return;
                if (!/HTTP 429|rate.?limit/i.test(error?.message || '') || consecutiveRateLimits >= 8) throw error;
                consecutiveRateLimits++;
                const waitSeconds = 30 + Math.min(30, (consecutiveRateLimits - 1) * 5);
                const message = status.querySelector('#garmin-sync-progress-message');
                if (message) message.textContent = 'Garmin-Abruflimit erreicht. Automatischer neuer Versuch in ' + waitSeconds + ' Sekunden …';
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                if (!isCurrentSync()) return;
                batch++;
                continue;
            }

            includeActivities = false;
            const sync = response.sync || {};
            const health = sync.healthSync || {};
            if (sync.activitySync) {
                for (const key of ['fetched', 'stored', 'scannedDays', 'skippedDays']) {
                    activitySummary[key] += Number(sync.activitySync[key] || 0);
                }
                activitySummary.status = sync.activitySync.status || activitySummary.status;
                await loadGarminActivitiesFromCloud(syncUserId, syncActivationSequence);
                if (!isCurrentSync()) return;
            }

            remainingDays = Number(health.remainingDays ?? 0);
            const completedDays = Math.max(0, Math.min(totalDays, completedBeforeChunk + chunkDays - remainingDays));
            const dayResults = Array.isArray(health.results) ? health.results : [];
            const datesInBatch = dayResults
                .map(day => String(day?.date || day?.record_date || day?.day || '').slice(0, 10))
                .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
            const lastProcessedDate = datesInBatch.length ? datesInBatch[datesInBatch.length - 1] : null;
            const dateLabel = lastProcessedDate
                ? new Date(lastProcessedDate + 'T00:00:00Z').toLocaleDateString('de-DE', { timeZone: 'UTC' })
                : null;
            renderGarminSyncProgress(
                completedDays,
                totalDays,
                dateLabel
                    ? 'Zuletzt verarbeitet: ' + dateLabel + ' · ' + (health.processedDays || datesInBatch.length) + ' Tage in diesem Abruf'
                    : 'Tagesdaten verarbeitet: ' + completedDays + ' von ' + totalDays + ' · weitere Tage werden bei Bedarf automatisch abgerufen'
            );

            if (health.rateLimited || health.status === 'rate_limited') {
                consecutiveRateLimits++;
                if (consecutiveRateLimits > 8) throw new Error('Garmin hat auch nach mehreren automatischen Warte- und Wiederholungsversuchen keine weiteren Abrufe zugelassen.');
                const waitSeconds = Math.max(30, Number(health.retryInSeconds || 30)) + Math.min(30, (consecutiveRateLimits - 1) * 5);
                const message = status.querySelector('#garmin-sync-progress-message');
                if (message) message.textContent = 'Garmin-Abruflimit erreicht. Automatische Fortsetzung in ' + waitSeconds + ' Sekunden (' + completedDays + '/' + totalDays + ' Tage verarbeitet).';
                setGarminSyncProgressPhase('Warte auf Garmin-Freigabe · der bisherige Tagesfortschritt bleibt erhalten.');
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                if (!isCurrentSync()) return;
                batch++;
                continue;
            }
            consecutiveRateLimits = 0;
            if (health.status === 'partial' || Number(health.failed || 0) > 0) {
                const first = (health.results || []).flatMap(day => day.results || [])
                    .find(item => item.status === 'error' || item.status === 'rate_limited');
                throw new Error('Teilimport pausiert: ' + (first?.error || first?.dataType || 'Ein Garmin-Endpunkt konnte nicht vollständig abgerufen werden') + '. Der gespeicherte Fortschritt bleibt erhalten; ein erneuter Start kann fortsetzen.');
            }
            if (remainingDays > 0 && Number(health.processedDays || 0) === 0) {
                throw new Error('Der Garmin-Import hat in diesem Teilzeitraum keinen Fortschritt erzielt. Der gespeicherte Fortschritt bleibt erhalten.');
            }
            batch++;
        }

        completedBeforeChunk += chunkDays;
    }

    if (activitySummary.status === 'ok') {
        recordGarminActivityCoverageRange(startDate, endDate);
        initEngine();
    }
        healthImportSummary = await loadGarminHealthRecordsIntoCheckins(startDate, endDate);
        if (!isCurrentSync()) return;
        const message = status.querySelector('#garmin-sync-progress-message');
        if (message) message.textContent = 'Lade HF- und Geschwindigkeitszeitreihen der Garmin-Aktivitäten …';
        setGarminSyncProgressPhase('Tagesabgleich abgeschlossen · FIT-Dateien und Aktivitätsdetails werden ergänzt.');
        const telemetrySummary = await syncMissingGarminTelemetry(startDate, endDate, status);
        if (!isCurrentSync() || telemetrySummary.aborted) return;
        const jsonTelemetrySummary = await syncMissingGarminJsonTelemetry(startDate, endDate, status);
        if (!isCurrentSync() || jsonTelemetrySummary.aborted) return;
        status.removeAttribute('aria-busy');
        const activitiesText = activitySummary
            ? (activitySummary.stored || 0) + ' Aktivitäten gespeichert'
            : 'Aktivitäten bereits in einem vorherigen Teilabruf verarbeitet';
        const telemetryText = 'FIT-Daten: ' + telemetrySummary.imported + '/' + telemetrySummary.total + ' Aktivitäten; HF in ' + telemetrySummary.withHr + ', Geschwindigkeit in ' + telemetrySummary.withSpeed + ', Kadenz/Schlagfrequenz in ' + telemetrySummary.withCadence + '; ' + telemetrySummary.laps + ' Runden, ' + telemetrySummary.sets + ' Kraft-Sätze, ' + telemetrySummary.workoutSteps + ' Trainingsschritte und ' + telemetrySummary.recordFields + ' Messfeldtypen erfasst' +
            (telemetrySummary.failed ? ', ' + telemetrySummary.failed + ' fehlgeschlagen' : '') +
            '. Garmin-JSON-Rohreihen: ' + jsonTelemetrySummary.imported + '/' + jsonTelemetrySummary.total + ' Aktivitäten, ' + jsonTelemetrySummary.rawSeries + ' Messreihen ergänzt' +
            (jsonTelemetrySummary.noData ? ', ' + jsonTelemetrySummary.noData + ' ohne Zeitreihendaten' : '') +
            (jsonTelemetrySummary.failed ? ', ' + jsonTelemetrySummary.failed + ' fehlgeschlagen' : '');
        status.textContent = 'Synchronisierung abgeschlossen: ' + totalDays + '/' + totalDays + ' Tage. ' +
            activitiesText + '. ' + telemetryText + '. Garmin-Gesundheitswerte in Check-ins übernommen: ' +
            healthImportSummary.values + ' Werte an ' + healthImportSummary.days +
            ' Tagen. Vorhandene Check-in-Werte blieben unverändert.' +
            (telemetrySummary.errors.length ? ' Erste FIT-Fehler: ' + telemetrySummary.errors.slice(0, 3).join(' | ') : '');
        button.textContent = 'Daten synchronisieren';
        await refreshGarminConnectionStatus(syncUserId, syncActivationSequence);
        if (!isCurrentSync()) return;
        await loadGarminSyncHistory();
        if (!isCurrentSync()) return;
    } catch (error) {
        if (!isCurrentSync()) return;
        status.removeAttribute('aria-busy');
        status.textContent = 'Synchronisierung pausiert: ' + (error?.message || 'Unbekannter Fehler') +
            ' Der bereits erreichte Fortschritt bleibt gespeichert. Du kannst denselben Zeitraum erneut starten.';
        setGarminSyncIndicator('current', 'Verbunden');
        await loadGarminSyncHistory();
        if (!isCurrentSync()) return;
    } finally {
        // Ein alter Sync darf die Schaltfläche einer neu aktivierten Sitzung nicht freigeben.
        if (isCurrentSync()) {
            button.disabled = false;
            if (button.textContent === 'Synchronisierung läuft …') button.textContent = 'Erneut versuchen';
        }
    }
}

async function refreshGarminConnectionStatus(expectedUserId = activeAppUserId, expectedActivationSequence = activationSequence) {
    const isCurrentRequest = () => Boolean(expectedUserId && activeAppUserId === expectedUserId && appUserReady && activationSequence === expectedActivationSequence);
    const status = document.getElementById('garmin-connection-status');
    if (status) status.textContent = 'Verbindungsstatus wird geprüft …';
    try {
        const result = await callGarminFunction({ action: 'status' });
        if (!isCurrentRequest()) return;
        const connected = result.connection?.status === 'connected';
        try { setUserLocalSetting('garmin_connected', connected ? 'true' : 'false'); } catch (_) {}
        const apiEntry = document.getElementById('garmin-api-entry');
        const disconnectButton = document.getElementById('garmin-disconnect-button');
        if (apiEntry) apiEntry.classList.toggle('hidden', connected);
        if (disconnectButton) disconnectButton.classList.toggle('hidden', !connected);
        if (connected) {
            setGarminSyncIndicator('current', 'Verbunden');
            if (status) status.textContent = 'Verbunden';
        } else {
            setGarminSyncIndicator('error', 'Nicht verbunden');
            if (status) status.textContent = 'Nicht verbunden';
        }
    } catch (error) {
        if (!isCurrentRequest()) return;
        try { setUserLocalSetting('garmin_connected', 'unknown'); } catch (_) {}
        setGarminSyncIndicator('error', 'Nicht verbunden');
        if (status) status.textContent = 'Verbindungsstatus konnte nicht geprüft werden.';
    }
}

async function connectGarmin() {
    const input = document.getElementById('garmin-api-key');
    const status = document.getElementById('garmin-connection-status');
    const apiKey = input?.value?.trim();
    if (!apiKey) {
        if (status) status.textContent = 'Bitte füge deinen persönlichen Garmin API-Schlüssel ein.';
        return;
    }
    if (status) status.textContent = 'Garmin-Schlüssel wird geprüft und sicher gespeichert …';
    try {
        await callGarminFunction({ action: 'connect', apiKey });
        if (input) input.value = '';
        await refreshGarminConnectionStatus();
    } catch (error) {
        if (status) status.textContent = 'Verbindung fehlgeschlagen: ' + error.message;
    }
}

let latestGarminPreviewActivities = [];
function garminCandidateFromPreview(a) {
    const id = a?.activityId == null ? '' : String(a.activityId), raw = String(a?.startTimeLocal ?? ''), date = raw.slice(0, 10);
    if (!id || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return null;
    const d = new Date(a.startTimeGMT || raw), secs = Number(a.duration), metres = Number(a.distance), avg = Number(a.averageHR), max = Number(a.maxHR);
    const name = String(a.activityName || 'Garmin-Aktivität'), rawType = String(a.activityType || '');
    const nativeLoad = Number(a.trainingLoad ?? a.activityTrainingLoad ?? a.aerobicTrainingLoad);
    return { id: 'garmin-' + id, sourceId: 'garmin:' + id, source: 'garmin', sourceRefs: { garminActivityId: id },
        startTime: Number.isFinite(d.getTime()) ? d.toISOString() : raw, date, name, type: inferSport(name, rawType), tss: null,
        garminTrainingLoad: Number.isFinite(nativeLoad) && nativeLoad >= 0 ? nativeLoad : null,
        aerobicTrainingEffect: a.aerobicTrainingEffect != null && Number.isFinite(Number(a.aerobicTrainingEffect)) ? Number(a.aerobicTrainingEffect) : null,
        anaerobicTrainingEffect: a.anaerobicTrainingEffect != null && Number.isFinite(Number(a.anaerobicTrainingEffect)) ? Number(a.anaerobicTrainingEffect) : null,
        duration: Number.isFinite(secs) && secs > 0 ? Math.round(secs / 60) : null,
        distance: Number.isFinite(metres) && metres > 0 ? metres / 1000 : null,
        hr: Number.isFinite(avg) && avg > 0 ? Math.round(avg) : null, maxHr: Number.isFinite(max) && max > 0 ? Math.round(max) : null,
        category: inferCategory(name, rawType), telemetry: null,
        garminData: { activityId: id, activityName: name, activityType: rawType, startTimeLocal: raw, startTimeGMT: a.startTimeGMT || null,
            durationSeconds: Number.isFinite(secs) && secs > 0 ? secs : null, distanceMeters: Number.isFinite(metres) && metres > 0 ? metres : null,
            averageHR: Number.isFinite(avg) && avg > 0 ? avg : null, maxHR: Number.isFinite(max) && max > 0 ? max : null } };
}
function findGarminDuplicates(c) {
    if (!c) return [];
    return state.rawActivities.filter(e => {
        if (e.sourceId != null && String(e.sourceId) === c.sourceId) return true;
        if (String(e.id) === c.id) return true;
        const priorGarminId = e.sourceRefs?.garminActivityId ?? e.garminData?.activityId;
        // Zwei unterschiedliche Garmin-IDs kennzeichnen unterschiedliche Aktivitäten.
        if (priorGarminId != null) return String(priorGarminId) === String(c.sourceRefs?.garminActivityId);
        if (!c.startTime || !e.startTime || c.date !== e.date) return false;
        const x = new Date(c.startTime).getTime(), y = new Date(e.startTime).getTime();
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - y) > 120000) return false;
        if (c.type && e.type && c.type !== e.type) return false;
        const durationComparable = c.duration != null && e.duration != null
            && Number.isFinite(Number(c.duration)) && Number.isFinite(Number(e.duration));
        const distanceComparable = c.distance != null && e.distance != null
            && Number.isFinite(Number(c.distance)) && Number.isFinite(Number(e.distance));
        if (!durationComparable && !distanceComparable) return false;
        if (durationComparable && Math.abs(Number(c.duration) - Number(e.duration)) > 3) return false;
        if (distanceComparable) {
            const distanceToleranceKm = Math.max(0.1, Math.max(Number(c.distance), Number(e.distance)) * 0.03);
            if (Math.abs(Number(c.distance) - Number(e.distance)) > distanceToleranceKm) return false;
        }
        return true;
    });
}
function findGarminDuplicate(c) { return findGarminDuplicates(c)[0] || null; }
function mergeTelemetryData(current, incoming) {
    if (!incoming || typeof incoming !== 'object') return { value: current, changed: false };
    if (!current || typeof current !== 'object') return { value: incoming, changed: true };
    let changed = false;
    for (const [key, next] of Object.entries(incoming)) {
        const prior = current[key];
        if (prior == null || (Array.isArray(prior) && prior.length === 0)) {
            if (next != null) { current[key] = next; changed = true; }
        } else if (Array.isArray(prior) && Array.isArray(next) && prior.length === next.length) {
            const merged = prior.map((value, index) => {
                if (value == null && next[index] != null) { changed = true; return next[index]; }
                return value;
            });
            if (changed) current[key] = merged;
        }
    }
    return { value: current, changed };
}
function mergeMissingObject(current, incoming) {
    const result = { ...(current && typeof current === 'object' ? current : {}) };
    let changed = false;
    for (const [key, next] of Object.entries(incoming || {})) {
        if (next == null || next === '') continue;
        const prior = result[key];
        const missing = prior == null || prior === '' || (Array.isArray(prior) && prior.length === 0);
        if (missing) { result[key] = next; changed = true; }
    }
    return { value: result, changed };
}
function mergeGarminActivity(existing, incoming) {
    if (!existing || !incoming) return false;
    let changed = false;
    const protectedKeys = new Set(['id','sourceId','source','sources','sourceRefs','garminData','garminFitImported','garminTelemetry','garminHeartRateImport','telemetry']);
    for (const [key, next] of Object.entries(incoming)) {
        if (protectedKeys.has(key) || next == null || next === '') continue;
        const current = existing[key];
        const missing = current == null || current === '' || (typeof current === 'number' && !Number.isFinite(current))
            || (Array.isArray(current) && current.length === 0);
        if (missing) { existing[key] = next; changed = true; }
    }
    const refs = mergeMissingObject(existing.sourceRefs, incoming.sourceRefs);
    existing.sourceRefs = refs.value;
    if (refs.changed) changed = true;
    const garmin = mergeMissingObject(existing.garminData, incoming.garminData);
    existing.garminData = garmin.value;
    if (garmin.changed) changed = true;
    const priorSources = Array.isArray(existing.sources) ? existing.sources : [];
    const nextSources = Array.from(new Set([...priorSources, existing.source || 'local', 'garmin']));
    if (nextSources.length !== priorSources.length) { existing.sources = nextSources; changed = true; }
    if (!existing.source) { existing.source = 'garmin'; changed = true; }
    if (Array.isArray(incoming.exercises) && incoming.exercises.length
        && (!Array.isArray(existing.exercises) || existing.exercises.length === 0)) {
        existing.exercises = incoming.exercises.map(exercise => ({
            ...exercise,
            sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map(set => ({ ...set }))
        }));
        existing.strengthSource = incoming.strengthSource || 'garmin-fit';
        existing.strengthImportedAt = incoming.strengthImportedAt || new Date().toISOString();
        if (!existing.type || existing.type === 'Workout') existing.type = 'WeightTraining';
        changed = true;
    }
    if (incoming.garminFitData && typeof incoming.garminFitData === 'object') {
        const oldFitCount = Number(existing.garminFitData?.recordCount || 0);
        const newFitCount = Number(incoming.garminFitData.recordCount || 0);
        const oldLapCount = Number(existing.garminFitData?.lapCount || 0);
        const newLapCount = Number(incoming.garminFitData.lapCount || 0);
        if (!existing.garminFitData || newFitCount > oldFitCount || newLapCount > oldLapCount) {
            existing.garminFitData = incoming.garminFitData;
            changed = true;
        }
    }
    if (incoming.garminTelemetry) {
        const merged = mergeTelemetryData(existing.garminTelemetry, incoming.garminTelemetry);
        existing.garminTelemetry = merged.value;
        if (merged.changed) changed = true;
        existing.garminFitImported = true;
    }
    if (incoming.telemetry) {
        const merged = mergeTelemetryData(existing.telemetry, incoming.telemetry);
        existing.telemetry = merged.value;
        if (merged.changed) changed = true;
    }
    return changed;
}
function selectAllGarminActivities(){document.querySelectorAll('#garmin-activity-preview [data-garmin-activity-id]:not(:disabled)').forEach(e=>{e.checked=true;});}
let garminFitDependenciesPromise = null;
async function getGarminFitDependencies() {
    if (!garminFitDependenciesPromise) {
        garminFitDependenciesPromise = (async () => {
            // Die frühere jsDelivr-URL zeigte auf eine nicht vorhandene Paketversion
            // (1.19.0). ESM-Imports laden die tatsächlich veröffentlichte 1.9.5-Version
            // und vermeiden eine stille Abhängigkeit von globalen Script-Variablen.
            const [zipModule, fitModule] = await Promise.all([
                window.JSZip ? Promise.resolve(null) : import('https://esm.sh/jszip@3.10.1'),
                import('https://esm.sh/fit-file-parser@1.9.5')
            ]);
            const ZipLibrary = window.JSZip || zipModule?.default || zipModule?.JSZip;
            const FitParserClass = window.FitParser || fitModule?.default?.default || fitModule?.default || fitModule?.FitParser;
            if (typeof ZipLibrary?.loadAsync !== 'function') {
                throw new Error('ZIP-Bibliothek konnte nicht geladen werden (JSZip).');
            }
            if (typeof FitParserClass !== 'function') {
                throw new Error('FIT-Parser konnte nicht geladen werden (fit-file-parser 1.9.5).');
            }
            return { ZipLibrary, FitParserClass };
        })().catch(error => {
            garminFitDependenciesPromise = null;
            throw error;
        });
    }
    return garminFitDependenciesPromise;
}
async function downloadGarminFitTelemetry(activityId) {
    const { ZipLibrary, FitParserClass } = await getGarminFitDependencies();
    const result = await callGarminFunction({ action: 'download-fit', activityId: String(activityId) });
    const binary = atob(result.zipBase64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const zip = await ZipLibrary.loadAsync(bytes);
    const fitFile = Object.values(zip.files).find(file => !file.dir && /\.fit$/i.test(file.name));
    if (!fitFile) throw new Error('In der Garmin-Datei wurde keine FIT-Datei gefunden.');
    const buffer = await fitFile.async('arraybuffer');
    const parser = new FitParserClass({ force: true, speedUnit: 'km/h', lengthUnit: 'km', elapsedRecordField: true, mode: 'both' });
    const fit = await new Promise((resolve, reject) => parser.parse(buffer, (err, data) => err ? reject(err) : resolve(data)));
    const records = Array.isArray(fit.records) ? fit.records : [];
    const parsedMessages = fit.messages && typeof fit.messages === 'object' ? fit.messages : {};
    const valid = records.filter(r => r.timestamp && Number.isFinite(new Date(r.timestamp).getTime()));
    const structuredGroups = ['laps', 'sessions', 'activity', 'events', 'sets', 'workouts', 'workout_steps'];
    const hasStructuredData = structuredGroups.some(key => Array.isArray(fit[key]) ? fit[key].length > 0 : Boolean(fit[key]));
    if (valid.length < 2 && !hasStructuredData) throw new Error('Die FIT-Datei enthält weder ausreichende Messpunkte noch strukturierte Runden-/Trainingsdaten.');
    const numberOrNull = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? Number(value) : null;
    const first = valid.length ? new Date(valid[0].timestamp).getTime() : null;
    const telemetry = {
        hr: [], time: [], speed: [], distance: [], altitude: [], power: [], cadence: [],
        temperature: [], verticalSpeed: [], strokeCount: [], cycles: [],
        groundContactTime: [], groundContactBalance: [], verticalOscillation: [],
        stepLength: [], verticalRatio: [], respirationRate: [], coreTemperature: [],
        muscleOxygen: [], gpsAccuracy: [], grade: []
    };
    const recordFieldNames = new Set();
    valid.forEach(r => Object.keys(r).forEach(key => { if (key !== 'timestamp') recordFieldNames.add(key); }));
    const recordFields = {};
    const recordFieldCounts = {};
    for (const key of recordFieldNames) {
        const values = valid.map(record => record[key] ?? null);
        const count = values.filter(value => value !== null && value !== undefined).length;
        if (count) {
            recordFields[key] = values;
            recordFieldCounts[key] = count;
        }
    }
    valid.forEach(r => {
        const hr = numberOrNull(r.heart_rate);
        const speed = numberOrNull(r.speed ?? r.enhanced_speed);
        telemetry.hr.push(hr !== null && hr >= 30 && hr <= 250 ? hr : null);
        telemetry.time.push((new Date(r.timestamp).getTime() - first) / 1000);
        telemetry.speed.push(speed !== null && speed >= 0 ? speed : null);
        telemetry.distance.push(numberOrNull(r.distance ?? r.cumulative_distance));
        telemetry.altitude.push(numberOrNull(r.enhanced_altitude ?? r.altitude));
        telemetry.power.push(numberOrNull(r.power));
        telemetry.cadence.push(numberOrNull(r.cadence));
        telemetry.temperature.push(numberOrNull(r.temperature));
        telemetry.verticalSpeed.push(numberOrNull(r.vertical_speed));
        telemetry.strokeCount.push(numberOrNull(r.stroke_count));
        telemetry.cycles.push(numberOrNull(r.cycles ?? r.total_cycles));
        telemetry.groundContactTime.push(numberOrNull(r.stance_time));
        telemetry.groundContactBalance.push(numberOrNull(r.stance_time_balance));
        telemetry.verticalOscillation.push(numberOrNull(r.vertical_oscillation));
        telemetry.stepLength.push(numberOrNull(r.step_length));
        telemetry.verticalRatio.push(numberOrNull(r.vertical_ratio));
        telemetry.respirationRate.push(numberOrNull(r.respiration_rate));
        telemetry.coreTemperature.push(numberOrNull(r.core_temperature));
        telemetry.muscleOxygen.push(numberOrNull(r.muscle_oxygen_saturation));
        telemetry.gpsAccuracy.push(numberOrNull(r.gps_accuracy));
        telemetry.grade.push(numberOrNull(r.grade));
    });
    const hrCount = telemetry.hr.filter(value => value !== null).length;
    const speedCount = telemetry.speed.filter(value => value !== null).length;
    const cadenceCount = telemetry.cadence.filter(value => value !== null).length;
    const session = Array.isArray(fit.sessions) ? fit.sessions[0] : null;
    const messageGroups = {};
    for (const [key, value] of Object.entries(fit)) {
        if (['records', 'activity', 'messages'].includes(key) || value == null) continue;
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) messageGroups[key] = value;
    }
    // Einige FIT-Parser liefern Nachrichten nicht als Root-Arrays, sondern gruppiert unter messages.
    for (const [key, value] of Object.entries(parsedMessages)) {
        if (value == null || key === 'record') continue;
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) messageGroups[key] = value;
    }
    const laps = Array.isArray(fit.laps) ? fit.laps : (Array.isArray(parsedMessages.lap) ? parsedMessages.lap : []);
    const sets = Array.isArray(fit.sets) ? fit.sets : (Array.isArray(parsedMessages.set) ? parsedMessages.set : []);
    const exerciseMessages = Array.isArray(fit.exercises) ? fit.exercises
        : (Array.isArray(parsedMessages.exercise) ? parsedMessages.exercise
            : (Array.isArray(parsedMessages.exercise_title) ? parsedMessages.exercise_title : []));
    const workoutSteps = Array.isArray(fit.workout_steps) ? fit.workout_steps
        : (Array.isArray(parsedMessages.workout_step) ? parsedMessages.workout_step : []);
    const strengthExercises = [];
    const getExerciseName = value => {
        const candidates = [value?.exercise_name, value?.exerciseName, value?.exercise_title,
            value?.exerciseTitle, value?.name, value?.title];
        const found = candidates.find(item => typeof item === 'string' && item.trim());
        return found ? found.trim() : '';
    };
    const getNumericField = (...values) => {
        const value = values.find(item => item !== null && item !== undefined && item !== ''
            && Number.isFinite(Number(item)));
        return value === undefined ? null : Number(value);
    };
    sets.forEach((set, index) => {
        const matchedExercise = exerciseMessages.find(item => {
            const setCategory = set?.exercise_category ?? set?.category;
            const exerciseCategory = item?.exercise_category ?? item?.category;
            return setCategory != null && exerciseCategory != null
                && String(setCategory) === String(exerciseCategory);
        });
        const name = getExerciseName(set) || getExerciseName(matchedExercise)
            || 'Garmin-Übung ' + (index + 1);
        let exercise = strengthExercises.find(item => item.name === name);
        if (!exercise) {
            exercise = { name, sets: [], source: 'garmin-fit' };
            strengthExercises.push(exercise);
        }
        exercise.sets.push({
            reps: getNumericField(set?.repetitions, set?.reps, set?.repeat_count),
            weight: getNumericField(set?.weight, set?.weight_kg, set?.weightKg),
            source: 'garmin-fit'
        });
    });
    messageGroups.structured = { laps, sets, exercises: exerciseMessages, workoutSteps };
    const lapSummaries = laps.map((lap, index) => ({
        lapNumber: index + 1,
        startTime: lap.start_time ?? lap.timestamp ?? null,
        totalElapsedTimeSeconds: numberOrNull(lap.total_elapsed_time ?? lap.elapsed_time),
        totalTimerTimeSeconds: numberOrNull(lap.total_timer_time),
        distanceKm: numberOrNull(lap.total_distance),
        averageSpeedKmh: numberOrNull(lap.avg_speed ?? lap.average_speed),
        maxSpeedKmh: numberOrNull(lap.max_speed),
        averageHeartRate: numberOrNull(lap.avg_heart_rate ?? lap.average_heart_rate),
        maxHeartRate: numberOrNull(lap.max_heart_rate),
        calories: numberOrNull(lap.total_calories ?? lap.calories)
    }));
    return {
        telemetry, session, hrCount, speedCount, cadenceCount,
        recordFields, recordFieldCounts, recordCount: valid.length,
        messageGroups, lapSummaries, lapCount: laps.length, setCount: sets.length,
        exercises: strengthExercises,
        workoutStepCount: workoutSteps.length
    };
}


async function importSelectedGarminActivities() {
    const status = document.getElementById('garmin-connection-status');
    const inputs = Array.from(document.querySelectorAll('#garmin-activity-preview [data-garmin-activity-id]:checked'));
    const ids = inputs.map(e => e.getAttribute('data-garmin-activity-id'));
    if (!ids.length) { status.textContent = 'Bitte wähle mindestens eine Aktivität aus.'; return; }
    const selected = latestGarminPreviewActivities.filter(a => ids.includes(String(a.activityId)));
    const operations = selected.map(a => garminCandidateFromPreview(a)).filter(Boolean).map(candidate => ({ candidate, matches: findGarminDuplicates(candidate) }));
    const fresh = operations.filter(x => !x.matches.length), matched = operations.filter(x => x.matches.length);
    if (!operations.length) { status.textContent = 'Keine gültigen Aktivitäten zum Übernehmen gefunden.'; return; }
    const cleanupCount = matched.reduce((sum, x) => sum + Math.max(0, x.matches.length - 1), 0);
    if (!confirm(fresh.length + ' neue Aktivität(en), ' + matched.length + ' vorhandene Aktivität(en) abgleichen und ' + cleanupCount + ' Doppelanlagen zusammenführen. Für ausgewählte Einheiten werden zusätzlich FIT-Dateien mit HF-Zeitreihen abgerufen. Fehlende Informationen werden ergänzt; vorhandene Werte bleiben erhalten. Fortfahren?')) return;
    const snapshot = JSON.parse(JSON.stringify(state.rawActivities));
    let merged = 0, consolidated = 0, fitImported = 0, fitFailed = 0;
    for (const item of operations) {
        status.textContent = 'Garmin-FIT-Daten werden geladen: ' + (fitImported + fitFailed + 1) + ' von ' + operations.length + ' …';
        try {
            const detail = await downloadGarminFitTelemetry(item.candidate.sourceRefs.garminActivityId);
            applyGarminFitDetail(item.candidate, detail);
            fitImported++;
        } catch (error) {
            fitFailed++;
            console.warn('Garmin FIT-Datei konnte nicht verarbeitet werden:', item.candidate.sourceRefs.garminActivityId, error);
        }
    }
    for (const item of matched) {
        const ordered = [...item.matches].sort((a, b) => {
            const score = x => (Array.isArray(x.telemetry?.hr) ? 100 : 0) + (x.tss != null ? 20 : 0) + (x.sRpeLoad != null ? 10 : 0) + (x.source && x.source !== 'garmin' ? 5 : 0);
            return score(b) - score(a);
        });
        const canonical = ordered[0];
        for (const duplicate of ordered.slice(1)) {
            mergeGarminActivity(canonical, duplicate);
            state.rawActivities = state.rawActivities.filter(x => x !== duplicate);
            consolidated++;
        }
        if (mergeGarminActivity(canonical, item.candidate)) merged++;
    }
    state.rawActivities.push(...fresh.map(x => x.candidate));
    const saved = saveDataToLocalStorage();
    if (saved === false) {
        state.rawActivities = snapshot;
        status.textContent = 'Abgleich abgebrochen: Für dieses Konto ist kein aktiver Datenspeicher verfügbar. Es wurden keine Änderungen gespeichert.';
        return;
    }
    initEngine();
    inputs.forEach(e => { e.disabled = true; e.checked = false; const cell = e.closest('td'); if (cell) cell.innerHTML = '<span class="text-[10px] text-emerald-400">Abgeglichen</span>'; });
    status.textContent = 'Garmin-Abgleich: ' + fresh.length + ' neu, ' + matched.length + ' zugeordnet, ' + consolidated + ' Doppelanlagen zusammengeführt. FIT-Zeitreihen: ' + fitImported + ' geladen, ' + fitFailed + ' nicht verfügbar. Vorhandene Werte wurden nicht überschrieben.';
}

function escapeGarminPreview(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

async function previewGarminActivities() {
    const status = document.getElementById('garmin-connection-status');
    const panel = document.getElementById('garmin-activity-preview');
    const startDate = document.getElementById('garmin-preview-start-date')?.value || undefined;
    const endDate = document.getElementById('garmin-preview-end-date')?.value || undefined;
    if (panel) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
    }
    status.textContent = 'Garmin-Aktivitäten werden sicher abgerufen …';
    try {
        const result = await callGarminFunction({ action: 'preview-activities', startDate, endDate });
        const preview = result.preview;
        if (!preview || !Array.isArray(preview.activities)) throw new Error('Die Garmin-Vorschau enthält keine gültige Aktivitätsliste.');
        latestGarminPreviewActivities = preview.activities;
        const rows = preview.activities.map(activity => {
            const candidate=garminCandidateFromPreview(activity), duplicate=Boolean(findGarminDuplicate(candidate));
            const importCell=candidate?'<input type="checkbox" data-garmin-activity-id="'+escapeGarminPreview(activity.activityId)+'" aria-label="Aktivität zum Datenabgleich auswählen" class="accent-sky-500">'+(duplicate?'<span class="block text-[9px] text-emerald-400">Abgleich</span>':''):'<span class="text-[10px] text-amber-300">Prüfen</span>';
            const date = activity.startTimeLocal ? new Date(activity.startTimeLocal).toLocaleString('de-DE') : 'Zeitpunkt unbekannt';
            const duration = Number(activity.duration);
            const durationText = Number.isFinite(duration) && duration > 0 ? Math.round(duration / 60) + ' min' : '–';
            const distance = Number(activity.distance);
            const distanceText = Number.isFinite(distance) && distance > 0
                ? (distance >= 1000 ? (distance / 1000).toFixed(2) + ' km' : distance.toFixed(0) + ' m')
                : '–';
            return `<tr class="border-t border-slate-800">
                <td class="px-2 py-2">${importCell}</td>
                <td class="px-2 py-2 text-slate-300">${escapeGarminPreview(date)}</td>
                <td class="px-2 py-2 text-slate-200">${escapeGarminPreview(activity.activityName)}</td>
                <td class="px-2 py-2 text-slate-400">${escapeGarminPreview(activity.activityType || '–')}</td>
                <td class="px-2 py-2 text-right text-slate-300">${durationText}</td>
                <td class="px-2 py-2 text-right text-slate-300">${distanceText}</td>
            </tr>`;
        }).join('');
        if (panel) {
            panel.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <strong class="text-sm text-white">${preview.count} Aktivitäten gefunden</strong>
                    <span class="text-[10px] text-slate-500">${escapeGarminPreview(preview.startDate)} bis ${escapeGarminPreview(preview.endDate)}</span>
                </div>
                <div class="overflow-x-auto max-h-72 rounded-lg border border-slate-800">
                    <table class="w-full text-left text-[11px]">
                        <thead class="sticky top-0 bg-slate-800 text-slate-400"><tr>
                            <th class="px-2 py-2">Import</th><th class="px-2 py-2">Start</th><th class="px-2 py-2">Aktivität</th><th class="px-2 py-2">Sport</th>
                            <th class="px-2 py-2 text-right">Dauer</th><th class="px-2 py-2 text-right">Distanz</th>
                        </tr></thead>
                        <tbody>${rows || '<tr><td colspan="6" class="p-3 text-slate-500">Keine Aktivitäten im Zeitraum gefunden.</td></tr>'}</tbody>
                    </table>
                </div>
                <div class="flex flex-wrap gap-2 mt-3"><button type="button" onclick="selectAllGarminActivities()" class="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">Alle Aktivitäten zum Abgleich auswählen</button><button type="button" onclick="importSelectedGarminActivities()" class="rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-semibold text-white">Ausgewählte Aktivitäten übernehmen</button></div>
                ${preview.hasMore ? '<p class="mt-2 text-[10px] text-amber-300">Es werden zunächst die ersten 100 Aktivitäten angezeigt. Die vollständige Seitennavigation folgt im nächsten Schritt.</p>' : ''}
                <p class="mt-2 text-[10px] text-amber-300">Dies ist nur eine Vorschau. Es wurden noch keine Daten in dein Trainingstagebuch übernommen.</p>`;
            panel.classList.remove('hidden');
        }
        status.textContent = 'Garmin-Datenabruf erfolgreich. Bitte prüfe die Vorschau.';
    } catch (error) {
        status.textContent = 'Garmin-Abruf fehlgeschlagen: ' + error.message;
    }
}

async function disconnectGarmin() {
    const status = document.getElementById('garmin-connection-status');
    if (!confirm('Möchtest du die Garmin-Verbindung für dieses Konto wirklich trennen?')) return;
    status.textContent = 'Verbindung wird getrennt …';
    try {
        await callGarminFunction({ action: 'disconnect' });
        const input = document.getElementById('garmin-api-key');
        if (input) input.value = '';
        const apiEntry = document.getElementById('garmin-api-entry');
        const disconnectButton = document.getElementById('garmin-disconnect-button');
        if (apiEntry) apiEntry.classList.remove('hidden');
        if (disconnectButton) disconnectButton.classList.add('hidden');
        await refreshGarminConnectionStatus();
    } catch (error) {
        status.textContent = 'Trennen fehlgeschlagen: ' + error.message;
    }
}



function runInitStep(label, callback) {
    try {
        return callback();
    } catch (error) {
        console.error('[KAJO] Initialisierungsschritt fehlgeschlagen: ' + label, error);
        return undefined;
    }
}

function initEngine() {
    const startedAt = performance.now();
    runInitStep('Check-in-Formular', () => loadCheckinInputs());

    const timeline = runInitStep('Trainingsbelastung berechnen', () =>
        computePerformanceTimeline(state.rawActivities, state.settings, state.profile, state.dailyCheckins)
    );
    state.dailyTimeline = Array.isArray(timeline) ? timeline : [];

    // Beim Start werden nur Inhalte aufgebaut, die auf dem zuerst sichtbaren
    // Dashboard benötigt werden. Die übrigen Ansichten werden beim Öffnen über
    // switchTab() gerendert. So blockieren versteckte Diagramme und Listen
    // weder den ersten Start noch alltägliche Datenaktualisierungen.
    runInitStep('Belastungs-KPIs', () => renderSummaryKPICards(state.dailyTimeline));
    runInitStep('Readiness', () => renderReadinessDashboard());
    runInitStep('Nächster Wettkampf', () => renderDashboardNextRace());
    runInitStep('Trainingswoche', () => renderHomeTrainingWeek());
    runInitStep('Herzfrequenzzonen', () => renderHeartRateZoneDistribution(state.rawActivities));
    runInitStep('Trainingsnarrativ', () => generateAutomatedNarrative(state.dailyTimeline));
    runInitStep('Home-Tagesübersicht', () => renderSelectedDashboardDay());

    // Aktualisiert zusätzlich genau den Bereich, der gerade geöffnet ist.
    // switchTab() rendert Analysen, Kalender, Wettkämpfe usw. bereits gezielt.
    const activeTab = window.kajoCurrentTab || 'today';
    runInitStep('Aktuell geöffneter Bereich', () => switchTab(activeTab));

    if (window.KAJO_PERFORMANCE_DEBUG === true) {
        console.info('[KAJO Performance] Dashboard- und aktiver Bereich gerendert:', Math.round(performance.now() - startedAt) + ' ms');
    }
}

// Alle Module lösen nach Datenänderungen refreshAll() aus → initEngine()
setRefreshHandler(initEngine);

function toggleMoreMenu() {
    const menu = document.getElementById('more-menu');
    const button = document.getElementById('more-menu-button');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    if (button) button.setAttribute('aria-expanded', String(willOpen));
}
function closeMoreMenu() {
    const menu = document.getElementById('more-menu');
    const button = document.getElementById('more-menu-button');
    if (menu) menu.classList.add('hidden');
    if (button) button.setAttribute('aria-expanded', 'false');
}
function openMoreTab(tab) {
    closeMoreMenu();
    switchTab(tab);
}
let previousProfileTab = 'dashboard';
function openProfileModal() {
    const current = window.kajoCurrentTab || 'dashboard';
    if (current !== 'profile') previousProfileTab = current;
    switchTab('profile');
}
function closeProfileModal() {
    const destination = previousProfileTab && previousProfileTab !== 'profile' ? previousProfileTab : 'dashboard';
    switchTab(destination);
}
function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) { console.error('Einstellungsdialog fehlt.'); return; }
    try {
        openSettingsModal();
        window.kajoSettingsOpenPage?.('menu');
        renderKajoPushSettings();
        const currentGarminStatus = document.getElementById('garmin-sync-indicator-text')?.textContent?.trim();
        const settingsStatus = document.getElementById('settings-garmin-status');
        const settingsDot = document.getElementById('settings-garmin-status-dot');
        if (settingsStatus && currentGarminStatus) settingsStatus.textContent = currentGarminStatus;
        if (settingsDot && currentGarminStatus) {
            const connected = currentGarminStatus.toLowerCase() === 'verbunden';
            settingsDot.classList.toggle('is-connected', connected);
            settingsDot.classList.toggle('is-error', !connected);
        }
    } catch (error) { console.error('Einstellungen konnten nicht vorbereitet werden:', error); }
    modal.classList.remove('hidden', 'flex');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kajo-modal-open');
}
function hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kajo-modal-open');
}
function updateProfileCycleVisibility() {
    const gender = document.getElementById('profile-gender')?.value;
    const section = document.getElementById('profile-cycle-settings');
    if (section) section.classList.toggle('hidden', gender !== 'female');
    if (gender !== 'female') {
        const toggle = document.getElementById('profile-cycle-tracking');
        if (toggle) toggle.checked = false;
    }
}
function loadProfileForm() {
    const p = state.profile || {};
    const fields = {
        'profile-name': 'name', 'profile-birthdate': 'birthDate',
        'profile-gender': 'gender',
        'profile-height': 'heightCm', 'profile-weight': 'weightKg',
        'profile-sport': 'sport', 'profile-discipline': 'discipline',
        'profile-level': 'level', 'profile-max-hr': 'maxHr',
        'profile-threshold-hr': 'thresholdHr'
    };
    Object.entries(fields).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.value = p[key] ?? '';
    });
    const cycleToggle = document.getElementById('profile-cycle-tracking');
    if (cycleToggle) cycleToggle.checked = p.cycleTrackingEnabled === true;
    updateProfileCycleVisibility();
    const message = document.getElementById('profile-message');
    if (message) message.textContent = '';
}
async function saveUserProfile() {
    const read = id => document.getElementById(id)?.value?.trim() ?? '';
    const numberOrNull = id => read(id) === '' ? null : Number(read(id));
    const birthDate = read('profile-birthdate');
    if (birthDate && new Date(birthDate + 'T12:00:00') > new Date()) {
        document.getElementById('profile-message').textContent = 'Das Geburtsdatum darf nicht in der Zukunft liegen.';
        return;
    }
    const gender = read('profile-gender');
    if (!['female', 'male'].includes(gender)) {
        document.getElementById('profile-message').textContent = 'Bitte wähle weiblich oder männlich aus.';
        return;
    }
    const profile = {
        name: read('profile-name'), birthDate, gender,
        cycleTrackingEnabled: gender === 'female' && document.getElementById('profile-cycle-tracking')?.checked === true,
        heightCm: numberOrNull('profile-height'), weightKg: numberOrNull('profile-weight'),
        sport: read('profile-sport'), discipline: read('profile-discipline'),
        level: read('profile-level'), maxHr: numberOrNull('profile-max-hr'),
        thresholdHr: numberOrNull('profile-threshold-hr')
    };
    if (profile.maxHr !== null && profile.thresholdHr !== null && profile.thresholdHr > profile.maxHr) {
        document.getElementById('profile-message').textContent = 'Die Schwellenherzfrequenz kann nicht über der maximalen Herzfrequenz liegen.';
        return;
    }
    state.profile = profile;
    saveDataToLocalStorage();
    const message = document.getElementById('profile-message');
    if (supabase) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            message.textContent = 'Lokal gespeichert; Anmeldung konnte nicht geprüft werden. Bitte später erneut versuchen.';
            return;
        }
        const userId = sessionData?.session?.user?.id;
        if (userId) {
            const { error } = await supabase
                .from('user_profiles')
                .upsert({ user_id: userId, profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
            if (error) {
                console.error('Supabase-Profil-Synchronisierung fehlgeschlagen:', error);
                message.textContent = 'Lokal gespeichert, aber Cloud-Synchronisierung fehlgeschlagen: ' + error.message;
                return;
            }
            message.textContent = 'Profil lokal und in deinem Benutzerkonto gespeichert.';
        } else {
            message.textContent = 'Profil lokal gespeichert. Für die Cloud-Synchronisierung bitte anmelden.';
            return;
        }
    } else {
        message.textContent = 'Profil wurde lokal gespeichert. Supabase ist nicht verfügbar.';
        return;
    }
    setTimeout(closeProfileModal, 900);
}


/* ------------------------------------------------------------
 * Benutzerprofil mit dem angemeldeten Supabase-Konto abgleichen.
 * Ein vorhandenes Cloud-Profil hat Vorrang vor dem lokalen Cache.
 * Fehlt ein Cloud-Profil, bleiben lokale Angaben erhalten; sie
 * werden erst nach erneutem Speichern explizit hochgeladen.
 * ------------------------------------------------------------ */
let activeProfileUserId = null;
let activeAppUserId = null;
let activationSequence = 0;
let activationPromise = null;
let appUserReady = false;
// Das Modul wird als ES-Modul erst nach dem Parsen des HTML ausgeführt.
 // Deshalb reicht "interactive" bereits aus; auf window.load zu warten kann
 // die Kontoaktivierung unnötig blockieren (z. B. bei langsam ladenden Assets).
const domReady = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();

async function loadCloudProfile(session, expectedActivationSequence = activationSequence) {
    const userId = session?.user?.id;
    const isCurrentProfileLoad = () => Boolean(userId && activeAppUserId === userId
        && activationSequence === expectedActivationSequence);
    if (!userId || !supabase || activeProfileUserId === userId || !isCurrentProfileLoad()) return;

    const { data, error } = await supabase
        .from('user_profiles')
        .select('profile')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        if (!isCurrentProfileLoad()) return;
        console.error('Cloud-Profil konnte nicht geladen werden:', error, {
            kajoStage: 'Cloud-Profil: user_profiles-Datensatz lesen',
            code: error?.code ?? null,
            details: error?.details ?? null,
            hint: error?.hint ?? null
        });
        return;
    }
    if (!isCurrentProfileLoad()) return;

    activeProfileUserId = userId;
    if (!data?.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) return;

    const localProfile = state.profile && typeof state.profile === 'object' && !Array.isArray(state.profile)
        ? state.profile
        : {};
    const { profile: mergedProfile, conflicts, cloudNeedsUpdate } = mergeProfileSnapshots(localProfile, data.profile);

    // Fehlende lokale Felder werden aus der Cloud ergänzt. Bei echten
    // Feldkonflikten behalten explizit vorhandene lokale Werte Vorrang.
    const sameProfile = (left, right) => {
        const stable = value => Array.isArray(value) ? value.map(stable)
            : value && typeof value === 'object'
                ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
                : value;
        return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
    };
    if (sameProfile(localProfile, mergedProfile)) return;

    const previousProfile = state.profile;
    state.profile = mergedProfile;
    if (saveDataToLocalStorage() !== true) {
        state.profile = previousProfile;
        console.error('Profilabgleich abgebrochen: Der zusammengeführte lokale Profilstand konnte nicht gespeichert werden.');
        return;
    }

    if (cloudNeedsUpdate) {
        try {
            const { error: profileSaveError } = await supabase.from('user_profiles')
                .upsert({ user_id: userId, profile: mergedProfile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
            if (profileSaveError) throw profileSaveError;
            if (!isCurrentProfileLoad()) return;
        } catch (profileSaveError) {
            if (!isCurrentProfileLoad()) return;
            console.error('Zusammengeführtes Athletenprofil konnte nicht in der Cloud aktualisiert werden:', profileSaveError);
            const indicator = document.getElementById('sync-status-indicator');
            if (indicator) indicator.textContent = 'Lokales Profil wurde geschützt gespeichert; die Cloud-Profilangleichung muss erneut versucht werden.';
            return;
        }
    }

    loadProfileForm();
    initEngine();

    const indicator = document.getElementById('sync-status-indicator');
    if (indicator) {
        indicator.textContent = conflicts.length
            ? 'Profil abgeglichen. Bei ' + conflicts.length + ' abweichenden Feldern hatten lokale Angaben Vorrang.'
            : 'Lokales und Cloud-Profil wurden ohne Datenverlust zusammengeführt.';
    }
    if (conflicts.length) {
        console.warn('KAJO: Profilfelder unterschieden sich; lokale Werte hatten Vorrang:', conflicts);
    }
}

let cloudInitialTransferState = 'unknown';
let cloudInitialTransferBusy = false;

// Versionsgeschützte automatische Cloud-Synchronisierung.
// Lokale Änderungen werden gebündelt; bei Versionskonflikten wird nicht überschrieben.
let cloudSyncVersion = 0;
let cloudSyncUserId = null;
let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let localDataRevision = 0;
let cloudSyncPending = false;
let cloudSyncBlocked = false;
let cloudSyncApplyingRemote = false;
let cloudSyncWaiters = [];
// Änderungen, die während der Kontoaktivierung gespeichert werden, werden
// vorgemerkt und nach dem Ereignis endurance:user-ready erneut synchronisiert.
let cloudSyncAwaitingReadyUserId = null;

/**
 * Übernimmt einen abgeglichenen Datenstand, ohne dadurch einen erneuten
 * Cloud-Upload auszulösen.
 */
function applyReconciledCloudSnapshot(snapshot) {
    cloudSyncApplyingRemote = true;
    try {
        applyCloudDataSnapshot(snapshot);
    } finally {
        cloudSyncApplyingRemote = false;
    }
}

/**
 * Lädt den vollständigen Cloud-Aktivitätsstand aus der letzten bestätigten
 * Basis plus Delta. Nur beim Erstabgleich oder fehlender Basis wird vollständig
 * gelesen. Der Cursor wird erst nach erfolgreicher Reconciliation gespeichert.
 */
async function loadAccountActivityDeletionRows(userId) {
    // Deletion history is a safety boundary, not optional metadata. If it cannot
    // be read, abort reconciliation rather than treating missing tombstones as
    // proof that every activity is active.
    return await fetchActivityDeletionTombstones(supabase, userId);
}

async function fetchCloudActivityState(userId, baselineSnapshot, syncState = {}) {
    const deletionRows = await loadAccountActivityDeletionRows(userId);
    const savedCursor = syncState.cursor || getUserLocalSetting('cloudActivityCursor');
    if (savedCursor && baselineSnapshot && Array.isArray(baselineSnapshot.activities)) {
        const delta = await fetchCloudActivityDelta(supabase, userId, savedCursor);
        syncState.cursor = delta.cursor || savedCursor;
        syncState.incremental = true;
        const rows = mergeCloudActivityRows(userId, baselineSnapshot.activities, delta.rows);
        Object.defineProperty(rows, 'deletionRows', { value: deletionRows, enumerable: false });
        return rows;
    }

    const fullRows = await fetchCloudActivities(supabase, userId);
    syncState.cursor = fullRows.syncCursor || null;
    syncState.incremental = false;
    Object.defineProperty(fullRows, 'deletionRows', { value: deletionRows, enumerable: false });
    return fullRows;
}

function persistCloudActivityCursor(syncState) {
    if (syncState?.cursor) setUserLocalSetting('cloudActivityCursor', syncState.cursor);
}

/**
 * Baut aus dem letzten bestätigten lokalen Basisstand die kompakte Form auf,
 * die user_data in der Cloud tatsächlich speichert (Aktivitäten nur als IDs).
 */
function createCloudSnapshotFromBaseline(userId, baseline, metadata) {
    if (!baseline || !Array.isArray(baseline.activities)
        || metadata?.userId !== userId || !Number.isSafeInteger(metadata.version)
        || metadata.version < 1) return null;
    const withIds = withCloudActivityIds(
        baseline,
        getCloudActivityIds(userId, baseline.activities)
    );
    return {
        userId,
        data: { ...withIds, activities: [] },
        version: metadata.version,
        updatedAt: metadata.updatedAt || null
    };
}

/**
 * Führt lokale und zentrale Datenstände zusammen. Aktivitäten bleiben in der
 * separaten activities-Tabelle; der user_data-Snapshot enthält nur ihre IDs.
 * Bei Versionskonflikten wird der aktuelle Cloud-Stand erneut geladen und
 * derselbe Drei-Wege-Abgleich wiederholt.
 */
async function reconcileCloudState(userId, initialCloudSnapshot, initialCloudActivities, baselineSnapshot = null, isCurrent = () => activeAppUserId === userId, activitySyncState = {}) {
    const ensureCurrent = createActivationGuard(
        isCurrent,
        'Der Kontoabgleich wurde wegen eines Konto- oder Sitzungswechsels abgebrochen.'
    );
    let cloud = initialCloudSnapshot;
    let cloudActivities = initialCloudActivities;
    const deletionRows = Array.isArray(cloudActivities?.deletionRows) ? cloudActivities.deletionRows : [];
    const deletedRecordIds = new Set(deletionRows.map(row => String(row?.record_id ?? '')).filter(Boolean));
    const deletedGarminIds = new Set(deletionRows.map(row => String(row?.garmin_activity_id ?? '')).filter(Boolean));
    const isDeletedActivity = activity => {
        const rawId = activity?.id ?? activity?.activityId ?? activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId;
        const recordId = rawId == null ? '' : String(rawId);
        const garminId = String(activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId
            ?? activity?.garminTelemetry?.activityId ?? '').replace(/^garmin-/, '');
        return deletedRecordIds.has(recordId) || (garminId && deletedGarminIds.has(garminId))
            || (recordId.startsWith('garmin-') && deletedGarminIds.has(recordId.slice(7)));
    };
    const safeBaselineSnapshot = baselineSnapshot && Array.isArray(baselineSnapshot.activities)
        ? { ...baselineSnapshot, activities: baselineSnapshot.activities.filter(activity => !isDeletedActivity(activity)) }
        : baselineSnapshot;
    cloudActivities = (Array.isArray(cloudActivities) ? cloudActivities : []).filter(row =>
        !deletedRecordIds.has(String(row?.record_id ?? '')) && !deletedGarminIds.has(String(row?.record_id ?? '').replace(/^garmin-/, ''))
    );

    for (let attempt = 0; attempt < 4; attempt += 1) {
        ensureCurrent();
        if (!cloud || cloud.userId !== userId) {
            throw new Error('Der Cloud-Datenstand gehört nicht zum aktuell angemeldeten Konto.');
        }
        if (cloud.data === null) {
            return { ok: false, empty: true, version: cloud.version, conflicts: [] };
        }

        const localData = JSON.parse(JSON.stringify(getUserDataSnapshot()));
        if (Array.isArray(localData.activities)) localData.activities = localData.activities.filter(activity => !isDeletedActivity(activity));
        // activityIds ist abgeleitetes Cloud-Metadatum und wird für jeden
        // Snapshot-Vergleich einheitlich aus den lokalen Aktivitäten ergänzt.
        const local = withCloudActivityIds(
            localData,
            getCloudActivityIds(userId, Array.isArray(localData.activities) ? localData.activities : [])
        );
        const safeCloudData = {
            ...cloud.data,
            activityIds: Array.isArray(cloud.data.activityIds) ? cloud.data.activityIds.filter(id =>
                !deletedRecordIds.has(String(id)) && !deletedGarminIds.has(String(id).replace(/^garmin-/, ''))
            ) : cloud.data.activityIds
        };
        const legacyActivities = (Array.isArray(safeCloudData.activities) ? safeCloudData.activities : []).filter(activity => !isDeletedActivity(activity)).map(activity => {
            if (!activity || typeof activity !== 'object') return activity;
            const compact = { ...activity };
            delete compact.garminTelemetry;
            return compact;
        });
        const expandedCloud = {
            ...safeCloudData,
            activities: mergeCloudActivities(
                legacyActivities,
                cloudActivities,
                Array.isArray(cloud.data.activityIds) ? cloud.data.activityIds : null
            ).map(activity => {
                if (!activity || typeof activity !== 'object') return activity;
                const compact = { ...activity };
                delete compact.garminTelemetry;
                return compact;
            })
        };
        const merged = mergeCloudSnapshots(safeBaselineSnapshot, local, expandedCloud);
        if (merged.conflicts.length) {
            const localActivitiesById = new Map(
                (Array.isArray(local.activities) ? local.activities : []).map(activity => {
                    const id = activity?.id ?? activity?.activityId
                        ?? activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId;
                    return id == null ? null : [String(id), activity];
                }).filter(Boolean)
            );
            const cloudActivitiesById = new Map(
                (Array.isArray(cloudActivities) ? cloudActivities : [])
                    .filter(row => row?.record_id != null && row?.payload && typeof row.payload === 'object')
                    .map(row => [String(row.record_id), row.payload])
            );
            const readableConflicts = merged.conflicts.map(conflict => {
                const match = conflict.match(/activities\[(?:id:)?([^\]]+)\]/);
                if (!match) return conflict;
                const activityId = match[1];
                const activity = localActivitiesById.get(activityId) || cloudActivitiesById.get(activityId);
                return getActivityConflictLabel(activity) + ' – ' + conflict;
            });
            return { ok: false, conflict: true, version: cloud.version, conflicts: readableConflicts };
        }

        const mergedSnapshot = merged.snapshot;
        const mergedActivities = Array.isArray(mergedSnapshot.activities) ? mergedSnapshot.activities : [];

        // Bereits vorhandene Aktivitätszeilen werden nicht blind überschrieben:
        // die separate activities-Tabelle besitzt keine Compare-and-Swap-Version.
        // Abweichende lokale Änderungen an einer bestehenden Aktivität pausieren
        // deshalb den Abgleich, statt einen parallelen Geräte-Edit zu verlieren.
        const cloudActivityRowsById = new Map(
            (Array.isArray(cloudActivities) ? cloudActivities : [])
                .filter(row => row?.record_id != null && row?.payload && typeof row.payload === 'object')
                .map(row => {
                    const compact = { ...row.payload };
                    delete compact.garminTelemetry;
                    return [String(row.record_id), compact];
                })
        );
        const activityConflicts = [];
        const activitiesToUpload = [];
        for (const activity of mergedActivities) {
            const rawId = activity?.id
                ?? activity?.activityId
                ?? activity?.sourceRefs?.garminActivityId
                ?? activity?.garminData?.activityId;
            const activityId = rawId == null ? null : String(rawId);
            if (!activityId) {
                activityConflicts.push('activities (Aktivität ohne stabile ID)');
                continue;
            }
            if (cloudActivityRowsById.has(activityId)) {
                // Der Drei-Wege-Abgleich oben hat bereits geprüft, ob lokale und
                // Cloud-Änderungen auf denselben Feldern kollidieren. Wenn er eine
                // konfliktfreie kombinierte Aktivität liefert, muss genau diese
                // Version auch in die separate activities-Tabelle geschrieben
                // werden. Ein zweiter Vollobjektvergleich würde selbst harmlose,
                // unabhängige Änderungen fälschlich als Konflikt blockieren.
                if (!cloudSnapshotsEqual(activity, cloudActivityRowsById.get(activityId))) {
                    activitiesToUpload.push(activity);
                }
            } else {
                activitiesToUpload.push(activity);
            }
        }
        if (activityConflicts.length) {
            return {
                ok: false,
                conflict: true,
                version: cloud.version,
                conflicts: activityConflicts
            };
        }

        // Nur neue bzw. noch nicht separat gespeicherte Legacy-Aktivitäten
        // werden hochgeladen. Bestehende Cloud-Zeilen bleiben unverändert.
        const activityUpload = await syncCloudActivities(supabase, userId, activitiesToUpload);
        ensureCurrent();
        const cloudPayload = {
            ...mergedSnapshot,
            activityIds: getCloudActivityIds(userId, mergedActivities),
            activities: []
        };

        // Neue Konten besitzen noch keinen user_data-Datensatz (Version 0).
        // Für den Erst-Upload bleibt deshalb der bestehende Insert-/CAS-Pfad aktiv.
        const cloudPatch = createCloudSnapshotPatch(cloudPayload, cloud.data || {});
        if (!Object.keys(cloudPatch).length) {
            // Aktivitätszeilen können bereits übertragen worden sein, auch wenn
            // der JSON-Snapshot keine weiteren Änderungen benötigt.
            const latestLocalData = JSON.parse(JSON.stringify(getUserDataSnapshot()));
            const latestLocal = withCloudActivityIds(
                latestLocalData,
                getCloudActivityIds(userId, Array.isArray(latestLocalData.activities) ? latestLocalData.activities : [])
            );
            if (!cloudSnapshotsEqual(latestLocal, local)) {
                baselineSnapshot = mergedSnapshot;
                cloud = await fetchCloudSnapshot();
                ensureCurrent();
                cloudActivities = await fetchCloudActivityState(userId, baselineSnapshot, activitySyncState);
                ensureCurrent();
                continue;
            }
            applyReconciledCloudSnapshot(mergedSnapshot);
            await saveCloudSyncBaseline(mergedSnapshot);
            ensureCurrent();
            persistCloudActivityCursor(activitySyncState);
            return { ok: true, version: cloud.version, snapshot: mergedSnapshot, activityUpload, uploaded: false };
        }

        const saved = cloud.version < 1
            ? await saveCloudSnapshot(cloudPayload, cloud.version, userId)
            : await saveCloudSnapshotPatch(cloudPatch, cloud.version, userId);
        ensureCurrent();
        if (saved.saved) {
            const latestLocalData = JSON.parse(JSON.stringify(getUserDataSnapshot()));
            const latestLocal = withCloudActivityIds(
                latestLocalData,
                getCloudActivityIds(userId, Array.isArray(latestLocalData.activities) ? latestLocalData.activities : [])
            );
            if (!cloudSnapshotsEqual(latestLocal, local)) {
                baselineSnapshot = mergedSnapshot;
                try { await saveCloudSyncBaseline(mergedSnapshot); }
                catch (error) { console.warn('Synchronisierungsbasis konnte nicht aktualisiert werden:', error); }
                ensureCurrent();
                cloud = await fetchCloudSnapshot();
                ensureCurrent();
                cloudActivities = await fetchCloudActivityState(userId, baselineSnapshot, activitySyncState);
                ensureCurrent();
                continue;
            }
            ensureCurrent();
            applyReconciledCloudSnapshot(mergedSnapshot);
            await saveCloudSyncBaseline(mergedSnapshot);
            ensureCurrent();
            persistCloudActivityCursor(activitySyncState);
            return {
                ok: true,
                version: saved.currentVersion,
                snapshot: mergedSnapshot,
                activityUpload,
                uploaded: true
            };
        }

        cloud = await fetchCloudSnapshot();
        ensureCurrent();
        if (cloud.userId !== userId) {
            throw new Error('Das angemeldete Konto hat sich während des Datenabgleichs geändert.');
        }
        cloudActivities = await fetchCloudActivityState(userId, baselineSnapshot, activitySyncState);
        ensureCurrent();
    }

    return { ok: false, retryLimit: true, version: cloud?.version || 0, conflicts: [] };
}

function setCloudSyncStatus(message) {
    const indicator = document.getElementById('cloud-sync-status');
    if (indicator) indicator.textContent = message;
}

function scheduleCloudSync(userId) {
    if (!appUserReady) {
        if (userId && userId === activeAppUserId) {
            cloudSyncAwaitingReadyUserId = userId;
        }
        setCloudSyncStatus('Änderung vorgemerkt – Synchronisierung startet nach Abschluss der Kontoaktivierung.');
        console.info('Cloud-Synchronisierung vorgemerkt, bis das Benutzerkonto bereit ist.');
        return;
    }
    if (!userId) {
        setCloudSyncStatus('Synchronisierung nicht gestartet: Benutzer-ID fehlt.');
        console.warn('Cloud-Synchronisierung übersprungen: Ereignis enthält keine userId.');
        return;
    }
    if (userId !== activeAppUserId || userId !== cloudSyncUserId) {
        setCloudSyncStatus('Synchronisierung gestoppt: angemeldetes Konto stimmt nicht überein.');
        console.warn('Cloud-Synchronisierung wegen abweichender Benutzer-ID übersprungen.', {
            eventUserId: userId,
            activeAppUserId,
            cloudSyncUserId
        });
        return;
    }
    if (cloudSyncBlocked) {
        setCloudSyncStatus('Synchronisierung angehalten: zuerst muss ein Cloud-Konflikt geklärt werden.');
        return;
    }
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
        cloudSyncTimer = null;
        void flushCloudSync();
    }, 900);
}

async function flushCloudSync(options = {}) {
    if (cloudSyncApplyingRemote) return false;
    if (!appUserReady || !activeAppUserId || activeAppUserId !== cloudSyncUserId || cloudSyncBlocked) return false;
    if (cloudSyncInFlight) {
        cloudSyncPending = true;
        return await new Promise(resolve => cloudSyncWaiters.push(resolve));
    }

    const userId = activeAppUserId;
    const syncActivationSequence = activationSequence;
    const syncDataRevision = localDataRevision;
    const isCurrentSync = () => activeAppUserId === userId && cloudSyncUserId === userId
        && appUserReady && activationSequence === syncActivationSequence
        && localDataRevision === syncDataRevision;
    cloudSyncInFlight = true;
    cloudSyncPending = false;
    let saveSucceeded = false;
    let pendingOutboxRecord = null;
    setCloudSyncStatus('Cloud-Speicherung läuft …');

    try {
        // Erst sicherstellen, dass alle zuvor lokal angenommenen Änderungen
        // dauerhaft in IndexedDB liegen, bevor der Cloud-Stand bestätigt wird.
        await flushLocalPersistence();
        if (!isCurrentSync()) return;
        // Deletion markers are mandatory before any cloud activity reconciliation.
        // If upload or read-back fails, stop here: continuing could resurrect a
        // locally deleted activity from a stale cloud/device snapshot.
        await syncPendingActivityDeletionTombstones(supabase, userId);
        if (!isCurrentSync()) return;
        pendingOutboxRecord = await getPendingLocalSync(userId);
        if (!isCurrentSync()) return;
        // Rohtelemetrie wird getrennt übertragen. Reine Hintergrund-Pulls
        // überspringen diesen Upload, damit sie keine unnötigen Garmin-Requests auslösen.
        let telemetryUpload = { uploaded: 0, failed: false };
        if (!options.skipTelemetry) {
            try {
                telemetryUpload = await uploadMissingGarminTelemetry(
                    supabase,
                    userId,
                    getGarminTelemetryRecordsForCloud()
                );
            } catch (telemetryError) {
                telemetryUpload = { uploaded: 0, failed: true };
                console.warn('Garmin-Telemetrie konnte nicht separat in der Cloud gesichert werden; lokale Daten bleiben erhalten:', telemetryError);
            }
        }

        if (!isCurrentSync()) return;
        const [cloudMetadata, baseline] = await Promise.all([
            fetchCloudSnapshotMetadata(),
            loadCloudSyncBaseline()
        ]);
        if (!isCurrentSync()) return;
        let latestCloud = cloudSyncVersion > 0
            ? createCloudSnapshotFromBaseline(userId, baseline, cloudMetadata)
            : null;
        if (!latestCloud) latestCloud = await fetchCloudSnapshot();
        if (!isCurrentSync()) return;
        const activitySyncState = { cursor: getUserLocalSetting('cloudActivityCursor') || null };
        const latestActivities = await fetchCloudActivityState(userId, baseline, activitySyncState);
        if (!isCurrentSync()) return;
        const reconciliation = await reconcileCloudState(
            userId, latestCloud, latestActivities, baseline, isCurrentSync, activitySyncState
        );
        if (!isCurrentSync()) return;
        if (!reconciliation.ok) {
            if (reconciliation.empty) {
                cloudSyncBlocked = true;
                setCloudSyncStatus('Synchronisierung pausiert: Der zentrale Cloud-Datensatz fehlt. Bitte prüfe den Ersttransfer.');
                return;
            }
            cloudSyncBlocked = true;
            cloudInitialTransferState = 'exists';
            const details = reconciliation.conflicts?.length
                ? ' Betroffene Bereiche: ' + reconciliation.conflicts.slice(0, 5).join('; ') + (reconciliation.conflicts.length > 5 ? ' …' : '')
                : '';
            if (reconciliation.retryLimit) {
                setCloudSyncStatus('Synchronisierung pausiert – der Datenstand hat sich während mehrerer Abgleichversuche verändert. Bitte erneut versuchen.');
                setCloudTransferMessage('Der Cloud-Abgleich konnte nach mehreren Versuchen nicht abgeschlossen werden. Lokale und zentrale Daten wurden nicht automatisch überschrieben.');
                console.warn('Cloud-Abgleich nach ausgeschöpften Wiederholungsversuchen pausiert:', reconciliation);
            } else {
                setCloudSyncStatus('Synchronisierung pausiert – gleichzeitige Änderungen müssen geprüft werden.');
                setCloudTransferMessage('KAJO hat abweichende Änderungen erkannt und keine davon automatisch überschrieben.' + details);
                console.warn('Cloud-Abgleich benötigt eine Konfliktentscheidung:', reconciliation);
            }
            return;
        }

        cloudSyncVersion = reconciliation.version;
        cloudSyncBlocked = false;
        saveSucceeded = true;
        if (pendingOutboxRecord && isCurrentSync() && !options.skipTelemetry && !telemetryUpload.failed) {
            try {
                await clearPendingLocalSync(pendingOutboxRecord, userId);
            } catch (outboxError) {
                // Ein nicht gelöschter Marker führt höchstens zu einem erneuten
                // sicheren Abgleich; lokale Daten bleiben unangetastet.
                console.warn('Bestätigter lokaler Sync-Auftrag konnte nicht entfernt werden:', outboxError);
            }
        } else if (pendingOutboxRecord && isCurrentSync() && options.skipTelemetry) {
            // Ein reiner Cloud-Pull hat Garmin-Telemetrie bewusst ausgelassen.
            // Den Auftrag danach einmal vollständig (inkl. Telemetrie) abgleichen.
            scheduleCloudSync(userId);
        }
        if (!isCurrentSync()) return;
        const activityUpload = reconciliation.activityUpload || { uploaded: 0 };
        setCloudSyncStatus(telemetryUpload.failed
            ? 'App-Daten abgeglichen; Garmin-Telemetrie wartet auf erneuten Versuch.'
            : 'Geräte abgeglichen (Cloud-Version ' + cloudSyncVersion + ')' + (activityUpload.uploaded ? ' · ' + activityUpload.uploaded + ' Aktivitäten geprüft' : '') + (telemetryUpload.uploaded ? ' · ' + telemetryUpload.uploaded + ' neue Telemetrie-Datensätze' : ''));
        if (reconciliation.uploaded) {
            setCloudTransferMessage('Lokale und Cloud-Daten wurden automatisch abgeglichen. Neue Einträge wurden ergänzt; widersprüchliche Änderungen wurden nicht überschrieben.');
        }
    } catch (error) {
        if (isCurrentSync()) {
            setCloudSyncStatus('Cloud-Speicherung fehlgeschlagen – lokale Daten bleiben erhalten.');
            console.error('Automatische Cloud-Synchronisierung fehlgeschlagen:', error);
        }
    } finally {
        cloudSyncInFlight = false;
        if (cloudSyncPending && !cloudSyncBlocked && activeAppUserId === cloudSyncUserId) {
            cloudSyncPending = false;
            const pendingResult = await flushCloudSync();
            cloudSyncWaiters.splice(0).forEach(resolve => resolve(pendingResult));
        } else {
            cloudSyncWaiters.splice(0).forEach(resolve => resolve(saveSucceeded));
        }
    }
    return saveSucceeded;
}

window.addEventListener('endurance:data-saved', event => {
    if (cloudSyncApplyingRemote) return;
    localDataRevision += 1;
    scheduleCloudSync(event.detail?.userId || null);
});

window.addEventListener('endurance:data-save-immediate', async event => {
    if (cloudSyncTimer) {
        clearTimeout(cloudSyncTimer);
        cloudSyncTimer = null;
    }
    const saved = await flushCloudSync();
    event.detail?.resolve?.(saved === true);
});

window.addEventListener('endurance:user-ready', event => {
    const userId = event.detail?.userId || null;
    if (!userId || userId !== activeAppUserId || cloudSyncAwaitingReadyUserId !== userId) return;
    cloudSyncAwaitingReadyUserId = null;
    scheduleCloudSync(userId);
});

let cloudPullInFlight = false;

async function pullCloudChanges(options = {}) {
    if (!appUserReady || !activeAppUserId || activeAppUserId !== cloudSyncUserId ||
        cloudSyncBlocked || cloudSyncInFlight || cloudPullInFlight) return;
    cloudPullInFlight = true;
    const userId = activeAppUserId;
    const pullSequence = activationSequence;
    try {
        // Snapshot-Version und den kleinen Aktivitäts-Wasserstand prüfen.
        // Aktivitätsänderungen erhöhen nicht zwingend user_data.version.
        const [latestCloudMetadata, activityWatermark] = await Promise.all([
            fetchCloudSnapshotMetadata(),
            getCloudActivityWatermark(supabase, userId)
        ]);
        if (activeAppUserId !== userId || cloudSyncUserId !== userId ||
            !appUserReady || activationSequence !== pullSequence) return;
        if (latestCloudMetadata.userId !== userId) {
            throw new Error('Das angemeldete Konto stimmt beim Cloud-Pull nicht überein.');
        }
        const activityCursor = getUserLocalSetting('cloudActivityCursor');
        const watermarkTime = Date.parse(activityWatermark);
        const cursorTime = Date.parse(activityCursor);
        // Der Watermark-Vergleich löst nur bei einem tatsächlich neueren
        // Zeitstempel einen Abruf aus. Der Delta-Query selbst überlappt 60 s,
        // damit verspätet sichtbare Commits trotzdem mitgeladen werden.
        const activityChanged = Boolean(activityWatermark && (
            !Number.isFinite(cursorTime) || watermarkTime > cursorTime
        ));
        const snapshotChanged = Number(latestCloudMetadata.version || 0) !== Number(cloudSyncVersion || 0);
        if (!snapshotChanged && !activityChanged && !options.forceActivity) return;

        await flushCloudSync({ skipTelemetry: true });
    } catch (error) {
        if (activeAppUserId === userId && activationSequence === pullSequence) {
            console.warn('Hintergrundprüfung der Cloud-Version fehlgeschlagen:', error);
        }
    } finally {
        cloudPullInFlight = false;
    }
}

let cloudRealtimeChannel = null;
let cloudRealtimeUserId = null;

function stopCloudRealtime() {
    const channel = cloudRealtimeChannel;
    cloudRealtimeChannel = null;
    cloudRealtimeUserId = null;
    if (channel && supabase?.removeChannel) {
        Promise.resolve(supabase.removeChannel(channel)).catch(error => {
            console.warn('KAJO Realtime-Kanal konnte nicht sauber beendet werden:', error);
        });
    }
}

function startCloudRealtime(userId) {
    if (!supabase?.channel || !userId || !appUserReady || activeAppUserId !== userId) return;
    if (cloudRealtimeChannel && cloudRealtimeUserId === userId) return;
    stopCloudRealtime();

    const isCurrentChannel = () => cloudRealtimeUserId === userId
        && activeAppUserId === userId && appUserReady;
    const channel = supabase.channel('kajo-cloud-sync:' + userId)
        // Nur kompakte Sync-Metadaten abonnieren. user_data und activities
        // enthalten persönliche Daten und werden niemals per Realtime gestreamt.
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'kajo_sync_state',
            filter: 'user_id=eq.' + userId
        }, payload => {
            if (!isCurrentChannel()) return;
            const change = payload?.new?.user_id ? payload.new : payload?.old;
            if (change?.user_id !== userId) return;
            if (change.scope === 'snapshot'
                && Number(change.version || 0) > Number(cloudSyncVersion || 0)) {
                void pullCloudChanges();
            } else if (change.scope === 'activities') {
                void pullCloudChanges({ forceActivity: true });
            }
        })
        .subscribe((status, error) => {
            if (!isCurrentChannel()) return;
            if (status === 'SUBSCRIBED') {
                console.info('KAJO: Realtime-Cloudbenachrichtigungen für das aktive Konto verbunden.');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                // Der bestehende 60-Sekunden-Watermark-Poll bleibt als Fallback aktiv.
                console.warn('KAJO Realtime ist derzeit nicht verfügbar; der automatische Hintergrundabgleich bleibt über die regelmäßige Prüfung aktiv.', error || status);
            }
        });

    cloudRealtimeChannel = channel;
    cloudRealtimeUserId = userId;
}

window.addEventListener('endurance:user-ready', event => {
    const userId = event.detail?.userId;
    if (userId) startCloudRealtime(userId);
});

// Lokale Check-ins und andere Änderungen bleiben als Sync-Auftrag vorgemerkt.
// Sobald die Verbindung zurückkehrt oder KAJO wieder in den Vordergrund kommt,
// wird ein ausstehender Auftrag erneut an die Cloud übergeben.
async function resumePendingLocalCloudSync() {
    const userId = activeAppUserId;
    if (!userId || !appUserReady || userId !== cloudSyncUserId || cloudSyncBlocked) return;
    try {
        const pending = await getPendingLocalSync(userId);
        if (pending && activeAppUserId === userId) scheduleCloudSync(userId);
    } catch (error) {
        console.warn('Ausstehender lokaler Sync-Auftrag konnte nicht geprüft werden:', error);
    }
}
window.addEventListener('online', () => { void resumePendingLocalCloudSync(); });
window.addEventListener('focus', () => { void resumePendingLocalCloudSync(); });

// Erkennt Änderungen eines zweiten Geräts auch dann, wenn auf diesem Gerät
// gerade keine neue Eingabe erfolgt.
window.addEventListener('focus', () => { void pullCloudChanges(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        void pullCloudChanges();
        void resumePendingLocalCloudSync();
    }
});
setInterval(() => { void pullCloudChanges(); }, 60000);

async function startManualCloudSync() {
    const button = document.getElementById('cloud-sync-manual-button');
    if (cloudSyncInFlight || button?.disabled) return;

    if (!appUserReady || !activeAppUserId || activeAppUserId !== cloudSyncUserId) {
        setCloudSyncStatus('Manuelle Synchronisierung nicht möglich: Das angemeldete Konto ist noch nicht vollständig bereit.');
        return;
    }
    if (cloudInitialTransferState !== 'exists') {
        setCloudSyncStatus('Manuelle Synchronisierung noch nicht möglich: Bitte zuerst den Cloud-Status prüfen. Ein erstmaliger Upload bleibt separat bestätigungspflichtig.');
        return;
    }
    if (cloudSyncBlocked) {
        setCloudSyncStatus('Manuelle Synchronisierung angehalten: Bitte lade KAJO neu, damit der aktuelle Cloud-Stand erneut geladen und geprüft wird. Es wurde nichts überschrieben.');
        return;
    }

    if (cloudSyncTimer) {
        clearTimeout(cloudSyncTimer);
        cloudSyncTimer = null;
    }

    if (button) {
        button.disabled = true;
        button.textContent = 'Synchronisierung läuft …';
    }
    setCloudSyncStatus('Manuelle Cloud-Synchronisierung wird gestartet …');
    try {
        await flushCloudSync();
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Jetzt synchronisieren';
        }
    }
}

function setCloudTransferMessage(message, showButton = false) {
    const transferMessage = document.getElementById('cloud-transfer-message');
    const button = document.getElementById('cloud-sync-initial-button');
    if (transferMessage) transferMessage.textContent = message;
    if (button) button.classList.toggle('hidden', !showButton);
}

function openCloudSyncModal() {
    const modal = document.getElementById('cloud-sync-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCloudSyncModal() {
    const modal = document.getElementById('cloud-sync-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function refreshCloudInitialTransferState(userId = activeAppUserId, expectedActivationSequence = activationSequence) {
    const isCurrentTransferCheck = () => Boolean(userId && activeAppUserId === userId
        && activationSequence === expectedActivationSequence);
    if (!supabase || !userId || !isCurrentTransferCheck()) return;
    cloudInitialTransferState = 'checking';
    setCloudTransferMessage('Prüfe, ob für dieses Konto bereits ein zentraler Cloud-Datensatz existiert …');
    try {
        const cloud = await fetchCloudSnapshot();
        if (!isCurrentTransferCheck()) return;
        if (cloud.userId !== userId) throw new Error('Das angemeldete Konto hat sich während der Prüfung geändert.');
        if (cloud.data !== null) {
            cloudInitialTransferState = 'exists';
            setCloudTransferMessage('Für dieses Konto existiert bereits ein Cloud-Datensatz. Ein Erstupload wird deshalb nicht angeboten und vorhandene Daten werden nicht überschrieben.');
        } else {
            cloudInitialTransferState = 'empty';
            setCloudTransferMessage('Für dieses Konto wurde noch kein zentraler Datensatz gefunden. Deine lokalen Daten bleiben unverändert, bis du den Erstupload ausdrücklich bestätigst.', true);
        }
    } catch (error) {
        if (!isCurrentTransferCheck()) return;
        cloudInitialTransferState = 'error';
        setCloudTransferMessage('Cloud-Status konnte nicht geprüft werden. Es wurde nichts übertragen. ' + error.message);
    }
}

function openCloudInitialTransferConfirmation() {
    if (!appUserReady || cloudInitialTransferState !== 'empty' || cloudInitialTransferBusy) return;
    const snapshot = getUserDataSnapshot();
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    const sizeMb = (bytes / (1024 * 1024)).toFixed(2);
    const activityCount = Array.isArray(snapshot.activities) ? snapshot.activities.length : 0;
    const plannedCount = Array.isArray(snapshot.planned) ? snapshot.planned.length : 0;
    const raceCount = Array.isArray(snapshot.races) ? snapshot.races.length : 0;
    const details = document.getElementById('cloud-sync-confirm-details');
    if (details) details.textContent = activityCount + ' Aktivitäten, ' + plannedCount + ' geplante Einheiten und ' + raceCount + ' Wettkämpfe; insgesamt ca. ' + sizeMb + ' MB JSON-Daten. Die großen Garmin-Rohzeitreihen werden unabhängig davon in der separaten Garmin-Telemetrie-Cloudspeicherung abgelegt. Originale FIT-Dateien sowie separate Garmin-Gesundheitsdatensätze werden nicht in diesen JSON-Snapshot aufgenommen.';
    const modal = document.getElementById('cloud-sync-confirm-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
}

function closeCloudInitialTransferConfirmation() {
    const modal = document.getElementById('cloud-sync-confirm-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
}

async function performCloudInitialTransfer() {
    if (!appUserReady || !activeAppUserId || cloudInitialTransferState !== 'empty' || cloudInitialTransferBusy) return;
    cloudInitialTransferBusy = true;
    const userId = activeAppUserId;
    const transferActivationSequence = activationSequence;
    const isCurrentTransfer = () => activeAppUserId === userId && appUserReady
        && activationSequence === transferActivationSequence;
    const button = document.getElementById('cloud-sync-confirm-button');
    if (button) button.disabled = true;
    setCloudTransferMessage('Cloud-Datenbestand wird nochmals geprüft. Es wurde noch nichts übertragen …');
    try {
        const existing = await fetchCloudSnapshot();
        if (!isCurrentTransfer() || existing.userId !== userId) throw new Error('Das angemeldete Konto hat sich geändert. Bitte starte den Vorgang erneut.');
        if (existing.data !== null || existing.version !== 0) {
            cloudInitialTransferState = 'exists';
            closeCloudInitialTransferConfirmation();
            setCloudTransferMessage('Der Cloud-Datensatz ist inzwischen vorhanden. Zur Sicherheit wurde kein Upload ausgeführt.');
            return;
        }
        // Pending deletions must reach the immutable cloud tombstone table before
        // any activity upload. A failed confirmation aborts the initial transfer.
        await syncPendingActivityDeletionTombstones(supabase, userId);
        if (!isCurrentTransfer()) return;
        // Aktivitäten zuerst separat und vollständig sichern. Der alte
        // user_data-Snapshot bleibt unangetastet, falls ein Paket fehlschlägt.
        const initialSnapshot = JSON.parse(JSON.stringify(getUserDataSnapshot()));
        const initialBaseline = JSON.parse(JSON.stringify(initialSnapshot));
        const activityUpload = await syncCloudActivities(supabase, userId, initialSnapshot.activities || []);
        if (!isCurrentTransfer()) return;
        initialSnapshot.activityIds = getCloudActivityIds(userId, initialSnapshot.activities || []);
        initialSnapshot.activities = [];
        const result = await saveCloudSnapshot(initialSnapshot, 0, userId);
        if (!isCurrentTransfer()) return;
        if (!result.saved) {
            cloudInitialTransferState = 'exists';
            closeCloudInitialTransferConfirmation();
            setCloudTransferMessage('Der Erstupload wurde wegen eines Versionskonflikts abgebrochen. Es wurden keine vorhandenen Cloud-Daten überschrieben.');
            return;
        }
        try {
            const baselineSaved = await saveCloudSyncBaseline(initialBaseline, userId);
            if (!baselineSaved || !isCurrentTransfer()) return;
        } catch (baselineError) {
            if (!isCurrentTransfer()) return;
            console.warn('Erstübertragung erfolgreich, aber die lokale Synchronisierungsbasis konnte nicht gespeichert werden:', baselineError);
        }
        if (!isCurrentTransfer()) return;
        cloudInitialTransferState = 'uploaded';
        cloudSyncUserId = userId;
        cloudSyncVersion = result.currentVersion;
        cloudSyncBlocked = false;
        closeCloudInitialTransferConfirmation();
        setCloudTransferMessage('Erstübertragung erfolgreich gespeichert (Cloud-Version ' + result.currentVersion + '). ' + activityUpload.uploaded + ' Aktivitäten wurden separat geprüft. Lokale Daten wurden nicht gelöscht oder verändert.');
    } catch (error) {
        if (!isCurrentTransfer()) return;
        cloudInitialTransferState = 'error';
        setCloudTransferMessage('Erstübertragung fehlgeschlagen. Der Cloud-Status wird zur Sicherheit erneut geprüft. ' + error.message);
        if (isCurrentTransfer()) await refreshCloudInitialTransferState(userId, transferActivationSequence);
    } finally {
        // Ein älterer Request darf den Zustand eines inzwischen gestarteten
        // Transfers nicht freigeben oder dessen Schaltfläche aktivieren.
        if (isCurrentTransfer()) {
            cloudInitialTransferBusy = false;
            if (button) button.disabled = false;
        }
    }
}

let garminDailySyncInFlight = new Set();
let garminDailySyncCompleted = new Set();
let garminDailySyncContinuationCounts = new Map();

function getLocalCalendarDate(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

/**
 * Stellt für den gesamten Aktivitätsverlauf kompakte Garmin-Analysewerte bereit.
 * Nur Aktivitäten ohne aktuellen Analyse-Cache werden im Hintergrund aus der
 * Cloud-Telemetrie berechnet. Die vollständigen Messreihen bleiben dabei aus
 * dem App-Zustand heraus und werden nicht beim Start dauerhaft geladen.
 */
const garminAnalysisBackfillInFlight = new Set();
const garminAnalysisBackfillPending = new Map();

async function backfillGarminAnalysisOnOpen(userId, sequence) {
    if (!userId) return;
    if (garminAnalysisBackfillInFlight.has(userId)) {
        garminAnalysisBackfillPending.set(userId, sequence);
        return;
    }
    garminAnalysisBackfillInFlight.add(userId);
    try {
        await runGarminAnalysisBackfillOnOpen(userId, sequence);
    } finally {
        garminAnalysisBackfillInFlight.delete(userId);
        if (garminAnalysisBackfillPending.has(userId)) {
            const nextSequence = garminAnalysisBackfillPending.get(userId);
            garminAnalysisBackfillPending.delete(userId);
            if (nextSequence === activationSequence && activeAppUserId === userId) {
                void backfillGarminAnalysisOnOpen(userId, nextSequence);
            }
        }
    }
}

async function runGarminAnalysisBackfillOnOpen(userId, sequence) {
    if (!userId || activeAppUserId !== userId || !appUserReady) return;

    // Historische Analysen erst in Leerlaufzeit starten, damit der erste
    // sichtbare App-Aufbau nicht mit dem Backfill konkurriert.
    await new Promise(resolve => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => resolve(), { timeout: 15000 });
        } else {
            window.setTimeout(resolve, 8000);
        }
    });
    if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;

    const activities = (state.rawActivities || []).filter(activity => {
        const isGarmin = activity?.source === 'garmin'
            || activity?.sourceRefs?.garminActivityId != null
            || activity?.garminData?.activityId != null
            || activity?.garminFitImported === true
            || (Array.isArray(activity?.sources) && activity.sources.includes('garmin'));
        return isGarmin && /^\d{4}-\d{2}-\d{2}$/.test(String(activity?.date || '').slice(0, 10));
    });
    const expectedWindow = Math.min(28, Math.max(3, Number(state.settings?.heartRateZoneSettings?.restingHrWindowDays) || 14));
    const sameOptionalNumber = (left, right) => left == null || left === ''
        ? right == null || right === ''
        : right != null && right !== '' && Number(left) === Number(right);
    const unavailableCacheFor = activity => {
        const adaptive = getAdaptiveRestingHr(
            state.dailyCheckins, String(activity.date).slice(0, 10), expectedWindow, state.profile
        );
        const checkedAt = Date.now();
        return {
            version: 1,
            status: 'unavailable',
            // Fehlende Telemetrie ist kein endgültiger Zustand: nach 24 Stunden
            // erneut prüfen. Neuere Cloud-Telemetrie invalidiert den Cache sofort.
            checkedAt,
            retryAfter: checkedAt + 24 * 60 * 60 * 1000,
            durationMinutes: Number(activity.duration) || null,
            maxHr: Number(state.profile?.maxHr) || null,
            restingHr: adaptive?.value != null && Number.isFinite(Number(adaptive.value)) ? Number(adaptive.value) : null,
            restingHrWindowDays: Number(adaptive?.windowDays) || expectedWindow
        };
    };
    const isCacheCurrent = activity => {
        const cache = activity?.garminAnalysis;
        if (cache?.version !== 1) return false;
        if (!sameOptionalNumber(cache.durationMinutes, activity.duration)
            || !sameOptionalNumber(cache.maxHr, state.profile?.maxHr)
            || Number(cache.restingHrWindowDays) !== expectedWindow) return false;
        const adaptive = getAdaptiveRestingHr(
            state.dailyCheckins, String(activity.date).slice(0, 10), expectedWindow, state.profile
        );
        const expectedResting = adaptive?.value != null && Number.isFinite(Number(adaptive.value)) ? Number(adaptive.value) : null;
        if (cache.restingHr !== expectedResting) return false;
        if (cache.status === 'unavailable') return Number(cache.retryAfter) > Date.now();
        return Boolean(cache.kajo || cache.edwards);
    };
    const pending = [];
    const unavailableCacheCandidates = [];
    let calculated = 0;
    for (let index = 0; index < activities.length; index++) {
        const activity = activities[index];
        if (isCacheCurrent(activity)) {
            if (activity?.garminAnalysis?.status === 'unavailable') {
                const series = getGarminHeartRateSeries(activity);
                if (series?.hr?.length >= 2) {
                    const summary = buildGarminActivityAnalysis(activity, state.settings, state.profile, state.dailyCheckins);
                    activity.garminAnalysis = summary || unavailableCacheFor(activity);
                    calculated++;
                } else {
                    const rawId = activity?.sourceRefs?.garminActivityId
                        ?? activity?.garminData?.activityId ?? activity?.id;
                    const id = String(rawId ?? '').replace(/^garmin-/, '');
                    if (/^\d+$/.test(id)) unavailableCacheCandidates.push({ activity, id });
                }
            }
        } else {
            const series = getGarminHeartRateSeries(activity);
            if (series?.hr?.length >= 2) {
                const summary = buildGarminActivityAnalysis(activity, state.settings, state.profile, state.dailyCheckins);
                activity.garminAnalysis = summary || unavailableCacheFor(activity);
                calculated++;
            } else {
                const rawId = activity?.sourceRefs?.garminActivityId
                    ?? activity?.garminData?.activityId ?? activity?.id;
                const id = String(rawId ?? '').replace(/^garmin-/, '');
                if (/^\d+$/.test(id)) pending.push({ activity, id });
                else activity.garminAnalysis = unavailableCacheFor(activity);
            }
        }
        // Bei langen Verläufen regelmäßig an den Browser zurückgeben.
        if (index > 0 && index % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
        }
    }

    // Prüfe bei noch gültigen Negativ-Caches nur die Cloud-Zeitstempel. Die
    // vollständigen Messreihen werden erst geladen, wenn sie neuer als der
    // Cache sind. So bleiben wiederholte App-Starts daten- und netzwerksparsam.
    if (unavailableCacheCandidates.length) {
        try {
            const metadata = await loadGarminTelemetryMetadataForActivityIds(
                supabase, userId, unavailableCacheCandidates.map(item => item.id)
            );
            if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
            const metadataById = new Map(metadata.map(item => [String(item.garmin_activity_id), item]));
            for (const item of unavailableCacheCandidates) {
                const cloudRecord = metadataById.get(item.id);
                if (shouldRefreshUnavailableGarminAnalysis(item.activity.garminAnalysis, cloudRecord?.created_at)) {
                    pending.push(item);
                }
            }
        } catch (error) {
            console.warn('KAJO: Garmin-Telemetrie-Zeitstempel konnten nicht auf neue Messreihen geprüft werden:', error);
        }
    }

    const BATCH_SIZE = 10;
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
        if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
        const batch = pending.slice(offset, offset + BATCH_SIZE);
        try {
            const records = await loadGarminTelemetryForActivityIds(
                supabase, userId, batch.map(item => item.id)
            );
            if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
            const byId = new Map(records.map(record => [String(record.garmin_activity_id), record.telemetry]));
            for (const item of batch) {
                const telemetry = byId.get(item.id);
                const temporaryActivity = telemetry
                    ? { ...item.activity, garminTelemetry: telemetry }
                    : item.activity;
                const summary = telemetry
                    ? buildGarminActivityAnalysis(temporaryActivity, state.settings, state.profile, state.dailyCheckins)
                    : null;
                item.activity.garminAnalysis = summary || unavailableCacheFor(item.activity);
                calculated++;
            }
            // Nur kompakte Kennzahlen werden dauerhaft gespeichert; Rohtelemetrie
            // wird weder in den Aktivitätsdatensatz kopiert noch lokal gecacht.
            saveDataToLocalStorage();
            // Kleine Pause zwischen Cloud-Abfragen verhindert Lastspitzen.
            await new Promise(resolve => setTimeout(resolve, 300));
            if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
        } catch (error) {
            console.warn('KAJO: Historische Garmin-Analysewerte konnten für einen Datenblock nicht berechnet werden:', error);
        }
    }
    if (sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
    if (calculated > 0) {
        saveDataToLocalStorage();
        initEngine();
    }
    console.info('KAJO: Garmin-Analysewerte für den gesamten Verlauf geprüft:', {
        garminActivities: activities.length,
        calculatedOrChecked: calculated,
        pendingCloudActivities: pending.length
    });
}

async function syncGarminTodayOnOpen(userId) {
    if (!userId || !appUserReady || activeAppUserId !== userId) return;
    const date = getLocalCalendarDate();
    const runKey = userId + ':' + date;
    const syncActivationSequence = activationSequence;
    const inFlightKey = runKey + ':' + syncActivationSequence;
    const isCurrentSync = () => activeAppUserId === userId && appUserReady && activationSequence === syncActivationSequence;
    let cloudActivityLoadAttempted = false;
    const loadCloudActivitiesOnce = async () => {
        if (cloudActivityLoadAttempted) return null;
        cloudActivityLoadAttempted = true;
        try {
            const cloudActivities = await loadGarminActivitiesFromCloud(userId, syncActivationSequence);
            if (!isCurrentSync()) return null;
            if (cloudActivities.added > 0 || cloudActivities.merged > 0) {
                void backfillGarminAnalysisOnOpen(userId, syncActivationSequence);
            }
            return cloudActivities;
        } catch (cloudLoadError) {
            console.warn('KAJO: Bereits gespeicherte Garmin-Cloud-Aktivitäten konnten nicht geladen werden:', cloudLoadError);
            return null;
        }
    };
    if (garminDailySyncCompleted.has(runKey) || garminDailySyncInFlight.has(inFlightKey)) return;
    garminDailySyncInFlight.add(inFlightKey);

    try {
        // Bereits gespeicherte Garmin-Tageswerte und der Live-Verbindungsstatus
        // sind unabhängige Lesevorgänge. Beide parallel starten, den Tagesabgleich
        // aber weiterhin erst nach Abschluss des lokalen Gesundheitsdatenimports beginnen.
        const healthHistoryPromise = (async () => {
            try {
                const activityDates = (state.rawActivities || [])
                    .map(activity => String(activity?.date || activity?.startTime || '').slice(0, 10))
                    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
                    .sort();
                // Personal metric zones need up to 28 prior days; load the full reference window on app open.
                // The earlier 7-day default could leave HRV/RHR baselines permanently unavailable.
                const zoneWindowDays = 28;
                const healthStart = activityDates.length
                    ? new Date(activityDates[0] + 'T12:00:00')
                    : new Date(date + 'T12:00:00');
                healthStart.setDate(healthStart.getDate() - zoneWindowDays + 1);
                const healthStartDate = getLocalCalendarDate(healthStart);
                const healthImport = await loadGarminHealthRecordsIntoCheckins(healthStartDate, date);
                console.info('KAJO: Garmin-Tagesruhe-HF für den Trainingsverlauf geladen:', healthImport);
            } catch (healthHistoryError) {
                console.warn('KAJO: Gespeicherte Garmin-Tagesruhe-HF konnten nicht vollständig geladen werden:', healthHistoryError);
            }
        })();

        const [ , connection ] = await Promise.all([
            healthHistoryPromise,
            callGarminFunction({ action: 'status' })
        ]);
        if (!isCurrentSync()) return;
        if (connection.connection?.status !== 'connected') {
            try { setUserLocalSetting('garmin_connected', 'false'); } catch (_) {}
            // Cloud-Daten sind unabhängig von einer aktiven Garmin-Verbindung
            // verfügbar und sollen auch auf diesem Gerät geladen werden.
            await loadCloudActivitiesOnce();
            return;
        }
        try { setUserLocalSetting('garmin_connected', 'true'); } catch (_) {}

        setGarminSyncIndicator('syncing', 'Tagesabgleich läuft');
        setGarminSyncResult('Der automatische Garmin-Tagesabgleich läuft …', 'syncing');
        let response = null;
        let health = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                response = await callGarminFunction({ action: 'sync-today', date });
                if (!isCurrentSync()) return;
            } catch (syncError) {
                if (!isCurrentSync()) return;
                const rateLimited = /HTTP 429|rate.?limit/i.test(syncError?.message || '');
                if (!rateLimited || attempt === 3) throw syncError;
                const waitSeconds = 30 + attempt * 15;
                console.info('KAJO: Garmin-Aktivitätsabruf wartet wegen API-Limit', waitSeconds, 'Sekunden.');
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                if (!isCurrentSync()) return;
                continue;
            }
            if (response.busy === true) {
                await loadCloudActivitiesOnce();
                if (!isCurrentSync()) return;
                setGarminSyncIndicator('current', 'Verbunden');
                setGarminSyncResult('Auf einem anderen Gerät läuft bereits ein Garmin-Abgleich. Kajo versucht es anschließend erneut.', 'info');
                setTimeout(() => {
                    if (isCurrentSync() && !garminDailySyncCompleted.has(runKey)) {
                        void syncGarminTodayOnOpen(userId);
                    }
                }, 15000);
                return;
            }
            health = response.sync?.healthSync || null;
            const activity = response.sync?.activitySync || null;
            const activityLimited = activity?.rateLimited || activity?.status === 'rate_limited';
            const healthLimited = health?.rateLimited || health?.status === 'rate_limited';
            if (!activityLimited && !healthLimited) break;
            if (attempt === 3) {
                console.warn('KAJO: Garmin begrenzt den Tagesabruf weiterhin; ein erneuter automatischer Versuch wird eingeplant.');
                break;
            }
            const retrySeconds = Math.max(
                Number(activityLimited ? activity.retryInSeconds || 0 : 0),
                Number(healthLimited ? health.retryInSeconds || 0 : 0),
                30
            );
            const waitSeconds = retrySeconds + attempt * 15;
            console.info('KAJO: Garmin-Tagesabgleich wartet wegen API-Limit', waitSeconds, 'Sekunden.');
            await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
            if (!isCurrentSync()) return;
        }

        if (!isCurrentSync()) return;
        const lateDataRetryDate = health?.lateDataRetryDate;
        if (typeof lateDataRetryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lateDataRetryDate)) {
            try {
                await loadGarminHealthRecordsIntoCheckins(lateDataRetryDate, lateDataRetryDate);
            } catch (lateHealthError) {
                console.warn('KAJO: Nachgelieferte Garmin-Gesundheitsdaten konnten lokal noch nicht übernommen werden:', lateHealthError);
            }
        }
        await loadCloudActivitiesOnce();
        if (!isCurrentSync()) return;

        // Rohtelemetrie wird nicht mehr automatisch beim App-Start synchronisiert.
        // Vollständige Messreihen werden erst beim Öffnen der jeweiligen Aktivität geladen.
        const jsonTelemetry = { failed: 0, rateLimited: false };

        let telemetryCloud = { uploaded: 0, failed: false };
        try {
            telemetryCloud = await uploadMissingGarminTelemetry(
                supabase,
                userId,
                getGarminTelemetryRecordsForCloud()
            );
        } catch (telemetryCloudError) {
            telemetryCloud = { uploaded: 0, failed: true };
            console.warn('KAJO: Neue Garmin-Telemetrie konnte noch nicht in die Cloud übertragen werden:', telemetryCloudError);
        }

        if (!isCurrentSync()) return;
        const activitySync = response.sync?.activitySync || null;
        const activityFailed = activitySync?.status === 'error' || activitySync?.status === 'rate_limited' || activitySync?.status === 'partial';
        const healthFailed = health?.status === 'partial' || health?.status === 'error'
            || health?.status === 'rate_limited' || Number(health?.failed || 0) > 0;
        const partial = activityFailed || healthFailed
            || Number(jsonTelemetry.failed || 0) > 0 || jsonTelemetry.rateLimited === true
            || telemetryCloud.failed;
        if (partial) {
            console.warn('KAJO: Garmin-Tagesabgleich teilweise abgeschlossen; fehlende Zeitreihen werden beim nächsten Abgleich erneut versucht.', { health, jsonTelemetry });
            setGarminSyncIndicator('partial', 'Teilweise synchronisiert');
            setGarminSyncResult('Der Tagesabgleich wurde nur teilweise abgeschlossen. Einige Garmin-Daten konnten nicht vollständig übernommen werden; fehlende Daten werden erneut geprüft.', 'partial');
            if (activityFailed || healthFailed || jsonTelemetry.rateLimited || Number(jsonTelemetry.failed || 0) > 0 || telemetryCloud.failed) {
                const rateLimited = activitySync?.status === 'rate_limited' || health?.rateLimited || health?.status === 'rate_limited' || jsonTelemetry.rateLimited;
                const retryDelay = rateLimited ? 5 * 60 * 1000 + 10000 : 6 * 60 * 60 * 1000 + 10000;
                setTimeout(() => {
                    if (isCurrentSync() && !garminDailySyncCompleted.has(runKey)) {
                        void syncGarminTodayOnOpen(userId);
                    }
                }, retryDelay);
            }
        } else {
            garminDailySyncCompleted.add(runKey);
            console.info('KAJO: Garmin-Tagesabgleich abgeschlossen für', date, response.sync?.activitySync, health, jsonTelemetry, telemetryCloud);
            const activitySync = response.sync?.activitySync || {};
            const activityRemaining = Number(activitySync.progress?.remainingDays || 0);
            const healthRemaining = Number(health?.remainingDays || 0);
            if (activityRemaining > 0 || healthRemaining > 0
                || activitySync.status === 'in_progress' || health?.status === 'in_progress') {
                const continuationCount = Number(garminDailySyncContinuationCounts.get(runKey) || 0) + 1;
                const continueSoon = continuationCount < 4;
                garminDailySyncContinuationCounts.set(runKey, continueSoon ? continuationCount : 0);
                const retryDelay = continueSoon ? 3000 : 15 * 60 * 1000;
                setGarminSyncResult(continueSoon
                    ? 'Garmin-Daten werden schrittweise nachgeladen …'
                    : 'Der Garmin-Verlauf wird später automatisch weiter synchronisiert.', 'syncing');
                setGarminSyncIndicator('syncing', 'Synchronisierung läuft');
                setTimeout(() => {
                    if (isCurrentSync() && !garminDailySyncCompleted.has(runKey)) {
                        void syncGarminTodayOnOpen(userId);
                    }
                }, retryDelay);
                return;
            }
            garminDailySyncContinuationCounts.delete(runKey);
            const fetched = Number(activitySync.fetched || 0);
            const stored = Number(activitySync.stored || 0);
            setGarminSyncResult(stored > 0
                ? 'Tagesabgleich abgeschlossen: ' + stored + ' neue Aktivität(en) gespeichert.'
                : fetched > 0
                    ? 'Tagesabgleich abgeschlossen: Garmin hat ' + fetched + ' Aktivität(en) geliefert; es wurden keine neuen Aktivitäten gespeichert.'
                    : 'Tagesabgleich abgeschlossen: Garmin hat für heute keine Aktivitäten geliefert.', 'success');
            setGarminSyncIndicator('current', 'Verbunden');
        }
    } catch (error) {
        console.warn('KAJO: Automatischer Garmin-Tagesabgleich fehlgeschlagen:', error);
        if (isCurrentSync()) {
            // Bereits synchronisierte Cloud-Aktivitäten bleiben auch dann
            // verfügbar, wenn der Live-Abruf von Garmin fehlschlägt.
            await loadCloudActivitiesOnce();
            if (!isCurrentSync()) return;
            setGarminSyncResult('Automatischer Tagesabgleich fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'), 'error');
            setGarminSyncIndicator('current', 'Verbunden');
        }
    } finally {
        garminDailySyncInFlight.delete(inFlightKey);
    }
}

function withActivationTimeout(promise, label, timeoutMs = 30000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(label + ' dauert zu lange. Bitte lade die Seite neu und versuche es erneut.')), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function handleAuthSession(session, authEvent = null) {
    let userId = session?.user?.id || null;

    // INITIAL_SESSION und SIGNED_OUT sind bereits definitive Zustandsmeldungen
    // des Auth-Clients. Nur bei späteren transienten Null-Events prüfen wir
    // vorsichtshalber erneut; so entsteht beim Start kein zweiter Refresh-Request.
    if (!userId && supabase && authEvent !== 'INITIAL_SESSION' && authEvent !== 'SIGNED_OUT') {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            const currentSession = data?.session || null;
            const currentUserId = currentSession?.user?.id || null;
            if (currentUserId) {
                console.warn('KAJO: Leere Auth-Session wurde durch die aktuelle Supabase-Session korrigiert; der Benutzerspeicher bleibt aktiv.');
                session = currentSession;
                userId = currentUserId;
            }
        } catch (sessionCheckError) {
            // Bei einem vorübergehenden Auth-/Netzwerkfehler lieber den bestehenden
            // Speicher erhalten, statt angemeldete Nutzerdaten zu deaktivieren.
            console.warn('KAJO: Abmeldestatus konnte nicht verifiziert werden; der aktive Benutzerspeicher bleibt vorsorglich erhalten.', sessionCheckError);
            return;
        }
    }

    if (userId && activeAppUserId === userId && (appUserReady || activationPromise)) return;
    const sequence = ++activationSequence;
    stopCloudRealtime();

    // Ein laufender Ersttransfer gehört immer genau zu einer Aktivierung.
    // Beim Konto-/Sitzungswechsel darf er weder die neue UI sperren noch deren
    // Transferstatus oder Schaltfläche später aus seinem finally-Block ändern.
    cloudInitialTransferBusy = false;
    cloudInitialTransferState = 'unknown';
    const transferButtonOnActivation = document.getElementById('cloud-sync-confirm-button');
    if (transferButtonOnActivation) transferButtonOnActivation.disabled = false;
    closeCloudInitialTransferConfirmation();

    if (!userId) {
        activeAppUserId = null;
        activeProfileUserId = null;
        activationPromise = null;
        appUserReady = false;
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        cloudSyncTimer = null;
        cloudSyncUserId = null;
        cloudSyncVersion = 0;
        cloudSyncPending = false;
        cloudSyncBlocked = false;
        cloudSyncAwaitingReadyUserId = null;
        // Ein noch laufender Request darf seinen Status selbst abschließen.
        deactivateUserStorage();
        return;
    }

    // Ausstehende Änderungen des vorherigen Kontos dürfen nicht in das neue Konto laufen.
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    cloudSyncUserId = null;
    cloudSyncVersion = 0;
    cloudSyncPending = false;
    cloudSyncBlocked = false;
    cloudSyncAwaitingReadyUserId = null;

    // Bei einem Accountwechsel zuerst den vorherigen Zustand aus dem Speicher
    // entfernen. Legacy-Daten werden weder gelesen noch automatisch übernommen.
    appUserReady = false;
    activeAppUserId = userId;
    activeProfileUserId = null;
    deactivateUserStorage();

    activationPromise = (async () => {
        let localStateReady = false;
        try {
            // Lokalen Kontospeicher und Cloud-Snapshot parallel laden:
            // Beide Lesevorgänge sind unabhängig. Die Daten werden weiterhin erst
            // nach erfolgreicher Prüfung beider Ergebnisse zusammengeführt.
            // Den lokalen Kontostand zuerst bereitstellen. Die unabhängigen
            // Cloud-/Baseline-Lesevorgänge laufen parallel weiter, blockieren aber
            // nicht mehr die erste lokale Ansicht.
            const localStatePromise = withActivationTimeout(
                loadStateForUser(userId),
                'Das Laden deiner lokalen Kontodaten',
                20000
            );
            const cloudLoadPromise = (async () => {
                const [cloudSnapshot, baseline] = await Promise.all([
                    withActivationTimeout(fetchCloudSnapshot(), 'Das Laden deiner Cloud-Daten', 30000),
                    withActivationTimeout(loadCloudSyncBaseline(), 'Das Laden deiner lokalen Synchronisierungsbasis', 20000)
                ]);
                const activitySyncState = { cursor: getUserLocalSetting('cloudActivityCursor') || null };
                const cloudActivities = await withActivationTimeout(
                    fetchCloudActivityState(userId, baseline, activitySyncState),
                    'Das Laden der geänderten Cloud-Aktivitäten',
                    45000
                );
                return [cloudSnapshot, cloudActivities, baseline, activitySyncState];
            })();
            // Cloud-Fehler werden beim späteren await weitergereicht. Der Handler
            // verhindert eine unhandled rejection, falls der lokale Store länger lädt.
            void cloudLoadPromise.catch(() => {});

            const loadedUserId = await localStatePromise;
            if (sequence !== activationSequence || activeAppUserId !== userId) return;
            if (loadedUserId !== userId) {
                throw new Error('Der lokale Datenspeicher gehört nicht mehr zum angemeldeten Konto.');
            }

            await domReady;
            if (sequence !== activationSequence || activeAppUserId !== userId) return;
            try {
                initializeSettings();
                initEngine();
            } catch (localRenderError) {
                console.error('Die lokale KAJO-Ansicht konnte nicht vollständig aufgebaut werden:', localRenderError);
            }
            localStateReady = true;
            window.dispatchEvent(new CustomEvent('endurance:user-local-ready', { detail: { userId } }));
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            // Erst nach dem ersten sichtbaren Rendern die übrigen lokalen
            // Sammlungen nachladen. Der Cloud-Abruf läuft währenddessen weiter.
            await withActivationTimeout(
                loadDeferredStateForUser(userId),
                'Das Nachladen weiterer lokaler Trainingsdaten',
                30000
            );
            if (sequence !== activationSequence || activeAppUserId !== userId) return;

            const [cloudSnapshot, cloudActivities, baseline, activitySyncState] = await cloudLoadPromise;
            if (sequence !== activationSequence || activeAppUserId !== userId) return;
            // Alle lokalen Garmin-Rohdaten sind nun im Arbeitsspeicher und können
            // vor dem Cloud-Abgleich verlustfrei für die Migration gesichert werden.
            const localTelemetryForMigration = getGarminTelemetryRecordsForCloud();

            // Lokaler und zentraler Datenstand werden anhand der letzten gemeinsamen
            // Synchronisierungsbasis abgeglichen; keiner der beiden wird pauschal ersetzt.
            if (cloudSnapshot.userId !== userId) {
                throw new Error('Das angemeldete Konto stimmt nicht mit dem geladenen Cloud-Datensatz überein.');
            }
            cloudSyncUserId = userId;
            cloudSyncVersion = cloudSnapshot.version;
            cloudSyncBlocked = false;
            cloudSyncPending = false;
            const legacyCloudTelemetry = cloudSnapshot.data?.activities
                ? extractGarminTelemetryRecords(cloudSnapshot.data.activities)
                : [];
            if (cloudSnapshot.data !== null) {
                const reconciliationDataRevision = localDataRevision;
                const reconciliation = await reconcileCloudState(
                    userId,
                    cloudSnapshot,
                    cloudActivities,
                    baseline,
                    () => sequence === activationSequence && activeAppUserId === userId
                        && localDataRevision === reconciliationDataRevision,
                    activitySyncState
                );
                if (!reconciliation.ok) {
                    cloudSyncBlocked = true;
                    const details = reconciliation.conflicts?.length
                        ? ' Betroffene Bereiche: ' + reconciliation.conflicts.slice(0, 5).join('; ') + (reconciliation.conflicts.length > 5 ? ' …' : '')
                        : '';
                    if (reconciliation.retryLimit) {
                        setCloudSyncStatus('Synchronisierung pausiert – der Datenstand hat sich während mehrerer Abgleichversuche verändert. Bitte erneut versuchen.');
                        setCloudTransferMessage('Der Cloud-Abgleich konnte nach mehreren Versuchen nicht abgeschlossen werden. Der lokale Datenbestand wurde nicht durch die Cloud ersetzt.');
                        console.warn('Cloud-Abgleich bei Kontoaktivierung nach ausgeschöpften Wiederholungsversuchen pausiert:', reconciliation);
                    } else {
                        setCloudSyncStatus('Synchronisierung pausiert – lokale und zentrale Änderungen müssen geprüft werden.');
                        setCloudTransferMessage('KAJO hat unterschiedliche Datenstände erkannt. Der lokale Datenbestand wurde nicht durch die Cloud ersetzt.' + details);
                        console.warn('Cloud-Abgleich bei Kontoaktivierung benötigt eine Konfliktentscheidung:', reconciliation);
                    }
                } else {
                    cloudSyncVersion = reconciliation.version;
                    const indicator = document.getElementById('sync-status-indicator');
                    if (indicator) indicator.textContent = 'Cloud-Daten abgeglichen (Version ' + cloudSnapshot.version + ')';
                }
            } else if (cloudActivities.length) {
                throw new Error('Es liegen einzelne Cloud-Aktivitäten ohne zugehörigen Hauptdatensatz vor. Der lokale Zustand wurde nicht überschrieben; der Cloud-Transfer muss geprüft werden.');
            }

            // Reine Intervals.icu-Aktivitäten werden aus dem aktiven Trainingsbestand
            // ausgeblendet und separat aufbewahrt. Garmin-Datensätze mit ergänzendem
            // Intervals-Quellverweis bleiben als Garmin-Aktivitäten erhalten.
            const intervalsDeactivation = deactivateIntervalsActivities();
            if (intervalsDeactivation.deactivated > 0) {
                console.info('KAJO: Intervals.icu-Aktivitäten deaktiviert:', intervalsDeactivation);
            }

            // Lokale und ältere Snapshot-Telemetrie sofort in den Arbeitsspeicher
            // übernehmen. Der zeitintensive Cloud-Abgleich läuft nach dem ersten Rendern.
            const migrationMap = new Map();
            for (const record of [
                ...localTelemetryForMigration,
                ...legacyCloudTelemetry,
                ...getGarminTelemetryRecordsForCloud()
            ]) migrationMap.set(String(record.garmin_activity_id), record);
            const migrationCandidates = Array.from(migrationMap.values());
            mergeGarminTelemetryRecords(migrationCandidates);

            // Den abgeglichenen Datenstand vollständig rendern, bevor die
            // schreibgeschützte lokale Ansicht für Eingaben freigegeben wird.
            try {
                initializeSettings();
                initEngine();
            } catch (renderError) {
                console.error('Die abgeglichene KAJO-Oberfläche konnte nicht vollständig initialisiert werden:', renderError);
                window.dispatchEvent(new CustomEvent('endurance:user-init-error', {
                    detail: { message: renderError?.message || 'Fehler beim Aufbau der App-Oberfläche.' }
                }));
            }

            appUserReady = true;
            window.dispatchEvent(new CustomEvent('endurance:user-ready', { detail: { userId } }));
            void getPendingLocalSync(userId).then(record => {
                if (record && sequence === activationSequence && activeAppUserId === userId
                    && appUserReady && !cloudSyncBlocked) scheduleCloudSync(userId);
            }).catch(error => console.warn('Lokale Sync-Warteschlange konnte nicht geprüft werden:', error));
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            // Garmin-Aktivitätsvorschauen sind für den ersten lokalen App-Aufbau
            // nicht erforderlich. Sie werden nach der Freigabe parallel zum
            // Tagesabgleich geladen; beide Aufrufer teilen einen laufenden Abruf.
            void loadGarminActivitiesFromCloud(userId, sequence).catch(garminLoadError => {
                console.warn('Garmin-Cloud-Aktivitäten konnten im Hintergrund nicht geladen werden:', garminLoadError);
            });
            void syncGarminTodayOnOpen(userId);
            initializeNutritionRemindersWhenIdle();

            // Der erste sichtbare App-Aufbau wartet nicht auf den Telemetrie-Upload.
            // Daten werden erst nach erfolgreichem Cloud-Readback lokal bereinigt.
            void (async () => {
                try {
                    // Ein leerer Kandidatenbestand ist kein Nachweis dafür, dass
                    // vorhandene lokale Telemetrie in der Cloud gesichert wurde.
                    // In diesem Fall darf der lokale Cache keinesfalls gelöscht werden.
                    if (!migrationCandidates.length) {
                        console.info('KAJO: Kein lokaler Garmin-Telemetriebestand für den Cloud-Transfer gefunden; lokaler Cache bleibt unverändert.');
                        void backfillGarminAnalysisOnOpen(userId, sequence);
                        return;
                    }

                    const cloudTelemetry = await withActivationTimeout(
                        syncGarminTelemetryToCloud(supabase, userId, migrationCandidates),
                        'Die Übertragung deiner Garmin-Telemetrie in die Cloud',
                        120000
                    );
                    if (sequence !== activationSequence || activeAppUserId !== userId) return;
                    const cloudIds = new Set(cloudTelemetry.records.map(record => String(record.garmin_activity_id)));
                    const missingAfterReadback = migrationCandidates
                        .map(record => String(record.garmin_activity_id))
                        .filter(activityId => !cloudIds.has(activityId));
                    if (missingAfterReadback.length > 0) {
                        throw new Error('Cloud-Readback unvollständig: ' + missingAfterReadback.length + ' Telemetrie-Datensätze fehlen.');
                    }
                    const cacheCleared = await clearLocalGarminTelemetryCache(userId);
                    if (!cacheCleared || sequence !== activationSequence || activeAppUserId !== userId || !appUserReady) return;
                    // Nach bestätigtem Cloud-Readback die Rohmessreihen auch aus dem
                    // aktiven Aktivitätszustand entfernen. Die Detailansicht lädt sie
                    // später gezielt für die jeweils geöffnete Aktivität.
                    state.rawActivities = (state.rawActivities || []).map(activity => {
                        if (!activity?.garminTelemetry) return activity;
                        const compact = { ...activity };
                        delete compact.garminTelemetry;
                        return compact;
                    });
                    state.garminTelemetryStore = {};
                    saveDataToLocalStorage();
                    void backfillGarminAnalysisOnOpen(userId, sequence);
                    console.info('KAJO: Garmin-Telemetrie-Cloudabgleich abgeschlossen:', {
                        uploaded: cloudTelemetry.uploaded,
                        existing: cloudTelemetry.existing,
                        total: cloudTelemetry.total,
                        localTelemetryCacheCleared: true
                    });
                } catch (telemetryMigrationError) {
                    // Bei Fehlern bleiben lokale und Legacy-Telemetriedaten erhalten.
                    console.warn('KAJO: Garmin-Telemetrie-Cloudabgleich noch nicht vollständig:', telemetryMigrationError);
                    void backfillGarminAnalysisOnOpen(userId, sequence);
                }
            })();

            await refreshCloudInitialTransferState(userId, sequence);
            if (sequence !== activationSequence || activeAppUserId !== userId) return;
            await loadCloudProfile(session, sequence);
        } catch (error) {
            console.error('Benutzerdaten konnten nicht sicher geladen werden:', error, {
                kajoStage: error?.kajoStage || 'nicht zugeordnet – Fehler entstand außerhalb der instrumentierten Cloud-Abfragen',
                code: error?.code ?? null,
                details: error?.details ?? null,
                hint: error?.hint ?? null
            });
            if (sequence === activationSequence) {
                if (appUserReady) {
                    // Nachgelagerte optionale Schritte dürfen einen bereits
                    // aktivierten Benutzer-Speicher nicht deaktivieren.
                    console.warn('Nachgelagerter Kontoabgleich fehlgeschlagen; die aktive Anmeldung und der Benutzerspeicher bleiben erhalten.', error);
                    setCloudSyncStatus('Konto aktiv; ein nachgelagerter Abgleich ist fehlgeschlagen. Deine Einträge können weiterhin gespeichert werden.');
                } else if (localStateReady && activeAppUserId === userId) {
                    // Lokale Daten sind bereits kontogebunden geladen. Ein
                    // fehlgeschlagener Cloud-Start darf sie nicht deaktivieren.
                    appUserReady = true;
                    cloudSyncUserId = userId;
                    cloudSyncVersion = 0;
                    cloudSyncBlocked = false;
                    setCloudSyncStatus('Offline-Modus: Änderungen werden lokal gesichert; der Cloud-Abgleich wird automatisch erneut versucht.');
                    window.dispatchEvent(new CustomEvent('endurance:user-ready', { detail: { userId } }));
                    void pullCloudChanges();
                    console.warn('KAJO bleibt mit lokal geladenen Daten aktiv; der initiale Cloud-Abgleich wird später erneut versucht.', error);
                } else {
                    appUserReady = false;
                    deactivateUserStorage();
                    activeAppUserId = null;
                    window.dispatchEvent(new CustomEvent('endurance:user-load-error', {
                        detail: {
                            userId,
                            message: error?.message || 'Unbekannter Fehler beim Laden deiner Kontodaten.'
                        }
                    }));
                }
            }
        } finally {
            if (sequence === activationSequence) activationPromise = null;
        }
    })();
    await activationPromise;
}

if (supabase) {
    // Supabase liefert beim Abonnieren INITIAL_SESSION mit dem gespeicherten
    // Sitzungszustand. Ein zusätzlicher getSession()-Aufruf ist unnötig und kann
    // bei abgelaufenen Tokens parallele Refresh-Versuche erzeugen.
    supabase.auth.onAuthStateChange((event, session) => {
        // Keine asynchronen Supabase-Aufrufe direkt im Auth-Callback starten.
        setTimeout(() => handleAuthSession(session, event), 0);
    });
} else {
    deactivateUserStorage();
}

// ------------------------------------------------------------
// Inline-Handler-Bridge
// Das HTML (und die per Template-String erzeugten Karten) ruft Funktionen
// per onclick="name(...)" auf. Das funktioniert nur mit globalen Funktionen.
// ES-Module sind nicht global – darum werden genau diese Funktionen hier
// bewusst an `window` gehängt. Neue onclick-Funktionen hier eintragen!
// ------------------------------------------------------------
Object.assign(window, {
    openDailyHrActivityModal,
    closeDailyHrActivityModal,
    previewDailyHrActivity,
    attachDailyHrSeriesToActivity,
    invalidateDailyHrActivityPreview,
    saveTelemetrySettings,
    focusActivityLap,
    setActivityTelemetryMetric,
    switchTab,
    openCoach,
    switchMoreTab,
    openTrainingLoadMetric,
    closeTrainingLoadMetric,
    setTrainingLoadChartMetric,
    setTrainingLoadModel,
    setTrainingLoadDailyMeasure,
    setTrainingLoadSportFilter,
    setTrainingLoadVolumeMeasure,
    setTrainingLoadZoneDisplayMode,
    toggleTrainingLoadPeriodMenu,
    setTrainingLoadPeriod,
    kajoRenderTrainingLoadView: renderTrainingLoadView,
    kajoRenderHealthAnalysis: renderHealthAnalysis,
    renderAnalysisOverview,
    setAnalysisOverviewMetric,
    setAnalysisOverviewActivityMeasure,
    kajoRenderAnalysisOverview: renderAnalysisOverview,
    setHistoryMetric,
    setHistoryRange,
    applyHistoryCustomRange,
    openHealthMetric,
    openTrainingMetric,
    renderGarminHealthData,
    openGarminHealthMetric,
    closeGarminHealthMetric,
    setGarminHealthRange,
    applyGarminHealthCustomRange,
    runKajoStorageDiagnostics: () => {
        const report = analyzeSnapshotSizes(getUserDataSnapshot());
        const output = document.getElementById('kajo-storage-diagnostics-output');
        if (output) {
            output.classList.remove('hidden');
            output.textContent = JSON.stringify(report, null, 2);
        }
        return report;
    },
    openCloudInitialTransferConfirmation,
    openCloudSyncModal,
    closeCloudSyncModal,
    closeCloudInitialTransferConfirmation,
    performCloudInitialTransfer,
    startManualCloudSync,
    openGarminConnectionModal,
    closeGarminConnectionModal,
    connectGarmin,
    previewGarminActivities,
    syncGarminSelectedRange,
    previewGarminHealthRange,
    restoreGarminHealthRange,
    loadGarminSyncHistory,
    selectAllGarminActivities,
    importSelectedGarminActivities,
    disconnectGarmin,
    toggleMoreMenu,
    closeMoreMenu,
    openMoreTab,
    openProfileModal,
    openAthleteProfileSection,
    closeAthleteProfileSection,
    setKajoTheme,
    openSettingsModal: showSettingsModal,
    kajoSettingsOpenPage: (page) => {
        const allowed = ['menu', 'training', 'performance', 'telemetry', 'app', 'notifications', 'calendar'];
        const selected = allowed.includes(page) ? page : 'menu';
        const menu = document.getElementById('kajo-settings-menu');
        const content = document.getElementById('kajo-settings-subpages');
        const footer = document.getElementById('kajo-settings-footer');
        const modal = document.getElementById('settings-modal');
        if (!menu || !content) return;
        const isMenu = selected === 'menu';
        menu.classList.toggle('hidden', !isMenu);
        menu.setAttribute('aria-hidden', String(!isMenu));
        content.classList.toggle('hidden', isMenu);
        content.setAttribute('aria-hidden', String(isMenu));
        modal?.setAttribute('data-settings-page', selected);
        content.querySelectorAll('[data-settings-page]').forEach(section => {
            section.classList.toggle('hidden', section.dataset.settingsPage !== selected);
        });
        footer?.classList.toggle('hidden', !['training', 'performance', 'telemetry'].includes(selected));
        if (!isMenu) {
            if(selected==='calendar')renderCalendarSeasonSettings();
            content.scrollTop = 0;
            document.getElementById('kajo-settings-back')?.focus({ preventScroll: true });
        } else {
            menu.querySelector('button')?.focus({ preventScroll: true });
        }
    },
    renderKajoPushSettings,
    enableKajoPush,
    sendKajoPushTest,
    saveKajoReminder,
    deleteKajoReminder,
    editKajoReminder,
    resetKajoReminderForm,
    toggleKajoReminder,
    disableKajoPush,
    closeSettingsModal: hideSettingsModal,
    addCustomSport,
    addCustomCategory,
    selectSettingsColor,
    saveSettings,
    previewHeartRateZones,
    closeProfileModal,
    editAthleteProfileSection,
    cancelAthleteProfileEdit,
    saveAthleteProfileSection,
    restoreDatabaseBackup,
    uploadGarminExportArchive,
    createGarminArchivePartLinks,
    diagnoseGarminSummaryJson,
    analyzeGarminExportArchive,
    importGarminExportArchive,
    closeBackupPreview,
    confirmBackupRestore,
    addRace,
    toggleRaceResultsForm,
    addRaceResult,
    deleteRaceResult,
    openNextRaceDetail,
    closeRaceDetail,
    saveTrainingRoute,
    setTrainingRouteFilter,
    toggleTrainingRouteForm,
    toggleTrainingWatersManager,
    saveTrainingWaterSection,
    renameTrainingWater,
    deleteTrainingWater,
    renameTrainingSection,
    deleteTrainingSection,
    editTrainingRoute,
    deleteTrainingRoute,
    resetTrainingRouteForm,
    setActivityRoute,
    setActivityRouteAssignment,
    setActivityRouteRuns,
    saveActivityWaterConditions,
    saveActivityTrainingPartner,
    toggleActivityCanoeFields,
    applyCustomDateRange,
    applyCanoeDateRange,
    resetCanoeDateRange,
    closeCSVDetailsModal,
    closeHealthLogModal,
    closeDayEditor,
    closeIntervalsSyncModal,
    closePlannedWorkoutModal,
    openManualActivityModal,
    closeManualActivityModal,
    updateManualActivityFields,
    addManualActivityExerciseSet,
    removeManualActivityExerciseSet,
    saveManualActivity,
    closeStrengthModal,
    deletePlannedWorkout,
    deleteRace,
    deleteSelectedActivity,
    deleteStrengthLog,
    exportDatabaseBackup,
    handleMultipleFileSelect,
    changeDashboardDay,
    goToDashboardToday,
    selectDashboardDate,
    openDailyNote,
    closeDailyNote,
    saveDailyNote,
    navigateCalendarPeriod,
    openCalendarPeriodPicker,
    applyCalendarPeriodDate,
    setCalendarFormat,
    setCalendarDisplayMode,
    setActivitySportFilter,
    clearActivitySportFilter,
    toggleCalendarAddMenu,
    closeCalendarAddMenu,
    toggleCalendarFormatMenu,
    closeCalendarFormatMenu,
    openCalendarHealthCreate,
    openCalendarPeriodCreate,
    closeCalendarPeriodCreate,
    saveCalendarPeriod,
    removeCalendarPeriodRange,
    saveCalendarSeason,
    deleteCalendarSeason,
    newCalendarSeason,
    editCalendarSeason,
    setCalendarSeasonActive,
    openCalendarDay,
    openCalendarWeek,
    selectCalendarWeekDay,
    openPlannedCalendarDetail,
    closePlannedCalendarDetail,
    openCalendarTrainingCreate,
    openCalendarRaceCreate,
    confirmCalendarSeasonPhase,
    dismissCalendarSeasonPhase,
    deleteCalendarSeasonPhase,
    openCalendarPhaseEditor,
    closeCalendarPhaseEditor,
    saveCalendarPhaseEditor,
    openCSVDetailsModal,
    openHealthLogForDate,
    openDailyCheckinModal,
    closeDailyCheckinModal,
    discardDailyCheckin,
    openDayEditor,
    openHomeSelfMonitoring,
    openHealthLogModal,
    openIntervalsSyncModal,
    openPlannedWorkoutModal,
    setPlannedWorkoutKind,
    addPlannedStrengthExercise,
    removePlannedStrengthExercise,
    addSeasonPlanPhase,
    removeSeasonPlanPhase,
    saveSeasonPlanEditor,
    generateSeasonPlanProposal,
    applySeasonPlanProposal,
    discardSeasonPlanProposal,
    generateWeeklyPlanProposal,
    applyWeeklyPlanProposal,
    approveWeeklyPlan,
    discardWeeklyPlanProposal,
    transferWeeklyPlanToCalendar,
    reviewApprovedWeeklyPlan,
    setManualActivityLink,
    setManualSessionStatus,
    generateAdaptiveWeekProposal,
    discardAdaptiveWeekProposal,
    applyAdaptiveWeekProposal,
    openStrengthModal,
    renderStrengthView,
    performIntervalsLiveSync,
    saveCheckin,
    saveDayEditor,
    saveManualSportCorrection,
    addActivityStrengthSet,
    removeActivityStrengthSet,
    updateActivityStrengthSet,
    updateActivityStrengthExerciseName,
    toggleActivityStrengthSection,
    toggleActivityEdit,
    updateActivityRPE,
    savePlannedWorkout,
    saveRetroactiveHealthLog,
    renderManagedPeriods,
    editPeriodRange,
    cancelPeriodEdit,
    saveManagedPeriod,
    deleteManagedPeriod,
    saveStrengthWorkout,
    sendAICoachMessage,
    setTimeframe,
    toggleCustomDatePicker,
    toggleRaceModal,
    toggleCheckinOptionalFields,
    toggleCycleFields,
    toggleDayCycleFields,
    toggleDaySickFields,
    updateSelfMonitoringSlider,
    updateCheckin,
    refreshSportAnalytics,
    openSupplementModal,
    closeSupplementModal,
    saveSupplement,
    deleteSupplement,
    toggleSupplementTaken,
    enableNutritionNotifications,
    switchMoreTab,
});

initializeKajoTheme();

// Profil- und Check-in-Buttons verwenden die unabhängigen Direktaktionen aus ui-actions.js.

// Die Initialisierung erfolgt ausschließlich nach erfolgreicher Anmeldung.


let pendingBackupFile = null;
let pendingBackupPreview = null;

async function restoreDatabaseBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const preview = await inspectDatabaseBackup(file);
        pendingBackupFile = file;
        pendingBackupPreview = preview;
        const labels = [
            ['activities', 'Trainingsaktivitäten'], ['planned', 'Geplante Trainingseinheiten'],
            ['checkins', 'Tägliche Check-ins'], ['health', 'Gesundheitseinträge'],
            ['races', 'Wettkämpfe'], ['strength', 'Krafttraining'],
            ['strengthPBs', 'Kraft-Bestleistungen'], ['supplements', 'Ernährung & Supplements'],
            ['profile', 'Athletenprofil'], ['settings', 'App-Einstellungen'], ['seasonPlan', 'Saisonplan']
        ];
        const count = key => key === 'profile' ? (preview.hasProfile ? 'Vorhanden' : 'Nicht enthalten')
            : key === 'settings' ? (preview.hasSettings ? 'Vorhanden' : 'Nicht enthalten')
            : String(preview.counts[key] ?? 0) + ' Einträge';
        const available = labels.filter(([key]) => Object.prototype.hasOwnProperty.call(preview.counts, key)
            ? preview.counts[key] > 0
            : key === 'profile' ? preview.hasProfile : preview.hasSettings);
        const details = [
            `Backup-Version: ${preview.version}`,
            `Dateigröße: ${preview.fileSizeBytes != null ? (preview.fileSizeBytes / 1024).toFixed(1) + ' KB' : 'nicht verfügbar'}`,
            preview.exportedAt ? `Exportiert am: ${new Date(preview.exportedAt).toLocaleString('de-DE')}` : 'Exportdatum: nicht angegeben',
            '',
            `Aktivitäten: ${preview.activityDateRange ? preview.activityDateRange.from + ' bis ' + preview.activityDateRange.to : 'kein Zeitraum ermittelbar'}`,
            `Check-ins: ${preview.checkinDateRange ? preview.checkinDateRange.from + ' bis ' + preview.checkinDateRange.to : 'kein Zeitraum ermittelbar'}`,
            `Gesundheitsdaten: ${preview.healthDateRange ? preview.healthDateRange.from + ' bis ' + preview.healthDateRange.to : 'kein Zeitraum ermittelbar'}`,
            `Wettkämpfe: ${preview.raceDateRange ? preview.raceDateRange.from + ' bis ' + preview.raceDateRange.to : 'kein Zeitraum ermittelbar'}`
        ];
        const content = document.getElementById('backup-preview-content');
        const selection = document.getElementById('backup-import-categories');
        if (!content || !selection) throw new Error('Die Backup-Vorschau kann nicht geöffnet werden.');
        content.textContent = details.join('\\n');
        selection.innerHTML = available.length ? available.map(([key, label]) => {
            return `<label class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"><input type="checkbox" data-backup-category="${key}" checked class="accent-sky-500"><span class="flex-1">${label}</span><span class="text-xs text-slate-400">${count(key)}</span></label>`;
        }).join('') : '<p class="text-xs text-amber-300">Es wurden keine Datenbereiche mit importierbaren Einträgen gefunden.</p>';
        document.getElementById('backup-preview-modal')?.classList.remove('hidden');
        document.getElementById('backup-preview-modal')?.classList.add('flex');
    } catch (error) {
        console.error(error);
        alert(`Backup konnte nicht geprüft werden: ${error.message}`);
        pendingBackupFile = null;
        pendingBackupPreview = null;
    } finally {
        event.target.value = '';
    }
}
function closeBackupPreview() {
    pendingBackupFile = null;
    pendingBackupPreview = null;
    const modal = document.getElementById('backup-preview-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
}

async function confirmBackupRestore() {
    if (!pendingBackupFile || !pendingBackupPreview) {
        alert('Bitte wähle zuerst eine Backup-Datei aus und prüfe die Vorschau.');
        return;
    }
    const categories = Array.from(document.querySelectorAll('[data-backup-category]:checked'))
        .map(input => input.getAttribute('data-backup-category'));
    if (!categories.length) {
        alert('Bitte wähle mindestens einen Datenbereich aus.');
        return;
    }
    const labels = {
        activities: 'Trainingsaktivitäten', planned: 'geplante Einheiten', checkins: 'Check-ins',
        health: 'Gesundheitseinträge', races: 'Wettkämpfe', strength: 'Krafttraining',
        strengthPBs: 'Kraft-Bestleistungen', supplements: 'Ernährung & Supplements',
        profile: 'Athletenprofil', settings: 'App-Einstellungen', seasonPlan: 'Saisonplan'
    };
    const selectedNames = categories.map(key => labels[key] || key).join(', ');
    const confirmed = confirm(
        `Die folgenden Datenbereiche werden aus dem Backup übernommen und ersetzen jeweils die vorhandenen lokalen Daten in diesen Bereichen:\\n\\n${selectedNames}\\n\\nNicht ausgewählte Bereiche bleiben unverändert. Die Cloud-Synchronisierung wird dadurch nicht gestartet. Möchtest du fortfahren?`
    );
    if (!confirmed) return;
    try {
        const result = await importDatabaseBackup(pendingBackupFile, { confirmed: true, categories });
        if (result) {
            closeBackupPreview();
            initEngine();
            alert(`Backup erfolgreich importiert. Übernommen: ${result.importedCategories.map(key => labels[key] || key).join(', ')}. Nicht ausgewählte Datenbereiche wurden nicht verändert.`);
        }
    } catch (error) {
        console.error(error);
        alert(`Backup konnte nicht wiederhergestellt werden: ${error.message}`);
    }
}