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
import { renderAthleteProfile, openAthleteProfileSection, closeAthleteProfileSection, editAthleteProfileSection, cancelAthleteProfileEdit, saveAthleteProfileSection } from './profile.js?v=3';
import { initializeKajoTheme, setKajoTheme } from './theme.js?v=1';
import { renderKajoPushSettings, enableKajoPush, sendKajoPushTest, saveKajoReminder, deleteKajoReminder, editKajoReminder, resetKajoReminderForm, toggleKajoReminder, disableKajoPush } from './push-notifications.js?v=1';
import { supabase } from './supabase-client.js';
import { fetchCloudSnapshot, saveCloudSnapshot } from './cloud-sync.js';
import { computePerformanceTimeline } from './calculations.js';
import { sanitizeGarminActivityTelemetry } from './data-source.js';
import { renderAnalysisInsights } from './analysis-insights.js';
import { renderAnalysisPageUI } from './analysis-ui.js?v=5';
import { renderAnalysisOverview, setAnalysisOverviewMetric, setAnalysisOverviewActivityMeasure } from './analysis-overview.js?v=2';
import { renderTrainingLoadView, openTrainingLoadMetric, closeTrainingLoadMetric, setTrainingLoadChartMetric, setTrainingLoadModel, setTrainingLoadDailyMeasure, setTrainingLoadSportFilter, setTrainingLoadVolumeMeasure, setTrainingLoadZoneDisplayMode, toggleTrainingLoadPeriodMenu, setTrainingLoadPeriod } from './training-load-view.js?v=5';
import { renderSummaryKPICards, generateAutomatedNarrative, inspectDay, renderDashboardNextRace, renderReadinessDashboard, renderSelectedDashboardDay, renderHomeTrainingWeek, changeDashboardDay, goToDashboardToday, selectDashboardDate, openDailyNote, closeDailyNote, saveDailyNote, renderMetricHistory, setHistoryMetric, setHistoryRange, applyHistoryCustomRange, openHealthMetric, openTrainingMetric } from './dashboard.js?v=3';
import { navigateCalendarPeriod, openCalendarPeriodPicker, applyCalendarPeriodDate, renderCalendar, setCalendarFormat, setCalendarDisplayMode, setActivitySportFilter, clearActivitySportFilter, openDayEditor, closeDayEditor, saveDayEditor, toggleDayCycleFields, toggleCalendarAddMenu, closeCalendarAddMenu, toggleCalendarFormatMenu, closeCalendarFormatMenu, openCalendarHealthCreate, openCalendarPeriodCreate, openCalendarDay, openCalendarWeek, selectCalendarWeekDay, openPlannedCalendarDetail, closePlannedCalendarDetail, openCalendarTrainingCreate, openCalendarRaceCreate, confirmCalendarSeasonPhase, dismissCalendarSeasonPhase, deleteCalendarSeasonPhase, openCalendarPhaseEditor, closeCalendarPhaseEditor, saveCalendarPhaseEditor } from './calendar.js?v=33';
import { applyCanoeDateRange, applyCustomDateRange, renderMainLoadChart, renderHeartRateZoneDistribution, renderCanoeTrainingHours, resetCanoeDateRange, setTimeframe, toggleCustomDatePicker, setActivityTelemetryMetric } from './charts.js?v=11';
import { closeCSVDetailsModal, deleteSelectedActivity, inferCategory, inferSport, openCSVDetailsModal, saveManualSportCorrection, saveActivityWaterConditions, saveActivityTrainingPartner, toggleActivityCanoeFields, toggleActivityEdit, updateActivityRPE, focusActivityLap, addActivityStrengthSet, removeActivityStrengthSet, toggleActivityStrengthSection } from './activities.js?v=12';
import { closeDailyCheckinModal, discardDailyCheckin, openDailyCheckinModal, closeHealthLogModal, loadCheckinInputs, openHealthLogForDate, openHealthLogModal, saveCheckin, saveRetroactiveHealthLog, toggleCheckinOptionalFields, toggleCycleFields, updateCheckin } from './health.js?v=75';
import { closeIntervalsSyncModal, handleMultipleFileSelect, initializeImportDropZone, openIntervalsSyncModal, performIntervalsLiveSync, renderImportHistory, deactivateIntervalsActivities } from './import.js?v=2';
import { closePlannedWorkoutModal, deletePlannedWorkout, openPlannedWorkoutModal, renderPlannedWorkouts, savePlannedWorkout } from './planning.js?v=1';
import { addRace, deleteRace, renderRaces, toggleRaceModal, openNextRaceDetail, closeRaceDetail, toggleRaceResultsForm, addRaceResult, deleteRaceResult } from './competitions.js?v=4';
import { closeStrengthModal, deleteStrengthLog, openStrengthModal, renderStrengthView, saveStrengthWorkout } from './strength.js?v=1';
import { initializeSettings, openSettingsModal, closeSettingsModal, addCustomSport, addCustomCategory, saveSettings, saveTelemetrySettings, previewHeartRateZones, renderCalendarSeasonSettings, saveCalendarSeason, deleteCalendarSeason } from './settings.js?v=9';
import { exportDatabaseBackup, inspectDatabaseBackup, importDatabaseBackup, loadStateForUser, deactivateUserStorage, saveDataToLocalStorage, saveActivitiesToLocalStorage, getUserLocalSetting, setUserLocalSetting, getUserDataSnapshot, applyCloudDataSnapshot, getGarminTelemetryRecordsForCloud, mergeGarminTelemetryRecords, clearLocalGarminTelemetryCache } from './storage.js?v=4';
import { renderRoutesView, saveTrainingRoute, editTrainingRoute, deleteTrainingRoute, resetTrainingRouteForm, setActivityRoute, setActivityRouteAssignment, setActivityRouteRuns, saveTrainingWaterSection, renameTrainingWater, deleteTrainingWater, renameTrainingSection, deleteTrainingSection, setTrainingRouteFilter, toggleTrainingRouteForm, toggleTrainingWatersManager } from './routes.js?v=3';
import { extractGarminTelemetryRecords, syncGarminTelemetryToCloud, uploadMissingGarminTelemetry } from './garmin-cloud-telemetry.js?v=3';

/* Selten genutzte Bereiche werden erst bei Bedarf geladen.
   Die Promise-Caches verhindern parallele Mehrfachimporte. */
let coachModulePromise = null;
let healthDataModulePromise = null;
let nutritionModulePromise = null;

function loadCoachModule() {
    if (!coachModulePromise) coachModulePromise = import('./coach.js?v=1');
    return coachModulePromise;
}
function loadHealthDataModule() {
    if (!healthDataModulePromise) healthDataModulePromise = import('./health-data.js?v=2');
    return healthDataModulePromise;
}
function loadNutritionModule() {
    if (!nutritionModulePromise) nutritionModulePromise = import('./nutrition.js?v=1');
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

function renderHealthAnalysis() {
    const list = document.getElementById('health-event-list');
    const count = document.getElementById('health-event-count');
    const status = document.getElementById('health-availability-status');
    if (!list) return;
    const entries = Object.entries(state.healthLogs || {})
        .filter(([, value]) => value && (value.status === 'sick' || value.status === 'injured'))
        .sort(([a], [b]) => b.localeCompare(a));
    if (count) count.textContent = entries.length ? String(entries.length) + ' dokumentierte Ereignisse' : 'Keine Einträge';
    list.replaceChildren();
    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-500';
        empty.textContent = 'Noch keine Krankheits- oder Verletzungsereignisse dokumentiert.';
        list.appendChild(empty);
    } else {
        entries.forEach(([date, value]) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2';
            const label = document.createElement('span');
            label.className = 'text-sm text-slate-200';
            label.textContent = value.status === 'sick' ? 'Krankheit' : 'Verletzung';
            const detail = document.createElement('span');
            detail.className = 'text-xs text-slate-400 text-right';
            detail.textContent = [date, value.diagnosis].filter(Boolean).join(' · ');
            row.append(label, detail);
            list.appendChild(row);
        });
    }
    if (status) status.textContent = 'Noch nicht berechenbar – eine vollständige Verknüpfung von Gesundheits- und Planungsdaten für den betrachteten Zeitraum ist nicht nachgewiesen.';
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
                setCalendarFormat(window.kajoCalendarFormatBeforeActivities || 'week');
                window.kajoCalendarFormatBeforeActivities = null;
            } else if (parent === 'calendar' && state.activeCalendarFormat === 'activities') {
                setCalendarFormat('week');
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
    if (view === 'races') { renderPlannedWorkouts(); renderRaces(); }
    if (view === 'strength') renderStrengthView();
    if (view === 'nutrition') renderNutritionView();
    if (view === 'garmin-health') renderGarminHealthData();
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
    const { data, error } = await supabase.functions.invoke('garmin-personal', { body });
    if (error) {
        let detail = '';
        const response = error.context;
        if (response && typeof response.clone === 'function') {
            try {
                const payload = await response.clone().json();
                detail = payload?.error || payload?.message || '';
            } catch (_) {
                try {
                    detail = (await response.clone().text()).slice(0, 500);
                } catch (_) {}
            }
        }
        throw new Error(detail || error.message || 'Die Garmin-Serverfunktion konnte nicht erreicht werden.');
    }
    if (!data?.ok) throw new Error(data?.error || 'Die Garmin-Anfrage ist fehlgeschlagen.');
    return data;
}

async function loadGarminActivitiesFromCloud() {
    const { data, error } = await supabase.from('garmin_activities')
        .select('garmin_activity_id, activity')
        .order('start_time', { ascending: true });
    if (error) throw error;
    let added = 0, merged = 0, ambiguous = 0;
    for (const row of data || []) {
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
    const sanitized = state.rawActivities.reduce((count, activity) => count + (sanitizeGarminActivityTelemetry(activity) ? 1 : 0), 0);
    if (added || merged || sanitized) {
        saveDataToLocalStorage();
        initEngine();
    }
    return { added, merged, ambiguous, sanitized };
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

    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('garmin_health_records')
            .select('data_type, record_date, payload')
            .gte('record_date', startDate)
            .lte('record_date', endDate)
            .order('record_date', { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }

    const byDate = new Map();
    for (const row of rows) {
        if (!byDate.has(row.record_date)) byDate.set(row.record_date, {});
        byDate.get(row.record_date)[row.data_type] = row.payload;
    }

    let importedValues = 0;
    let changedDays = 0;
    let recordsWithPayload = 0;
    for (const [date, records] of byDate) {
        const existing = state.dailyCheckins[date] || {};
        const updates = {};
        const hrvPayload = records.hrv_daily ?? records.hrv_detail;
        const heartPayload = records.heart_rate ?? records.daily_summary;
        const sleepPayload = records.sleep_detail ?? records.sleep_summaries;
        const summaryPayload = records.daily_summary;

        const candidates = {
            hrv: findGarminNumber(hrvPayload, ['lastNightAvg', 'lastNightAverage', 'averageHrv', 'avgHrv', 'hrv']),
            rhr: findGarminNumber(heartPayload, ['restingHeartRate', 'restingHr', 'restingHR']),
            sleepDuration: findGarminNumber(sleepPayload, ['sleepTimeSeconds', 'totalSleepSeconds', 'sleepDurationSeconds']),
            sleepScore: findGarminSleepScore(sleepPayload),
            respiration: findGarminNumber(sleepPayload, ['averageRespiration', 'avgRespiration', 'avgRespirationValue', 'averageRespirationValue', 'respirationRate']),
            garminStress: findGarminNumber(records.stress, ['overallStressLevel', 'averageStressLevel', 'avgStressLevel', 'averageStress', 'avgStress', 'stressLevel']),
            weight: findGarminNumber(records.weight, ['weightInKilograms', 'weightKg']),
            bodyBattery: findGarminNumberInNamedSection(summaryPayload, 'bodyBattery', ['latestValue']),
            spo2: findGarminNumber(records.spo2, ['averageSpO2', 'avgSleepSpO2', 'latestSpO2']),
            steps: findGarminNumber(records.steps, ['totalSteps']),
            fitnessAge: findGarminNumber(records.fitness_age, ['fitnessAge'])
        };

        // Fallbacks aus der Tageszusammenfassung, wenn ein spezialisierter Datensatz fehlt.
        if (candidates.rhr === null) candidates.rhr = findGarminNumber(summaryPayload, ['restingHeartRate', 'restingHr', 'restingHR']);
        if (candidates.respiration === null) candidates.respiration = findGarminNumber(summaryPayload, ['averageRespiration', 'avgRespiration', 'avgRespirationValue', 'averageRespirationValue']);
        if (candidates.garminStress === null) candidates.garminStress = findGarminNumber(summaryPayload, ['avgLevel']);
        if (candidates.bodyBattery === null) candidates.bodyBattery = findGarminNumber(records.body_battery, ['latestValue', 'bodyBatteryLevelValue']);
        if (candidates.spo2 === null) candidates.spo2 = findGarminNumber(summaryPayload, ['avgValue']);
        if (candidates.steps === null) candidates.steps = findGarminNumber(summaryPayload, ['value']);

        if (candidates.sleepDuration !== null) candidates.sleepDuration /= 3600;

        for (const [key, value] of Object.entries(candidates)) {
            if (value === null || !Number.isFinite(value)) continue;
            if (key === 'hrv' && value <= 0) continue;
            if (key === 'rhr' && (value <= 0 || value > 250)) continue;
            if (key === 'sleepDuration' && (value <= 0 || value > 24)) continue;
            if (key === 'sleepScore' && (value < 0 || value > 100)) continue;
            if (key === 'respiration' && (value < 4 || value > 60)) continue;
            if (key === 'garminStress' && (value < 0 || value > 100)) continue;
            if (key === 'weight' && (value <= 0 || value > 400)) continue;
            if (key === 'bodyBattery' && (value < 0 || value > 100)) continue;
            if (key === 'spo2' && (value < 50 || value > 100)) continue;
            if (key === 'steps' && (value < 0 || value > 200000)) continue;
            if (key === 'fitnessAge' && (value <= 0 || value > 120)) continue;

            // Garmin-Ruhe-HF separat speichern: manuelle/andere rhr-Werte bleiben unangetastet,
            // während die adaptive Zonenberechnung gezielt den Garmin-Tageswert bevorzugt.
            const targetKey = key === 'rhr' ? 'garminRhr' : key;
            if (existing[targetKey] !== null && existing[targetKey] !== undefined && existing[targetKey] !== '') continue;
            updates[targetKey] = key === 'sleepDuration' ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10;
            if (key === 'rhr') {
                updates.measurementSources = {
                    ...(existing.measurementSources || {}),
                    garminRhr: { source: 'garmin', metric: 'resting_heart_rate', unit: 'bpm' }
                };
            }
            if (key === 'garminStress') {
                updates.measurementSources = {
                    ...(updates.measurementSources || existing.measurementSources || {}),
                    garminStress: { source: 'garmin', metric: 'daily_average_stress', unit: 'points' }
                };
            }
        }

        const keys = Object.keys(updates);
        if (!keys.length) continue;
        if (!dryRun) state.dailyCheckins[date] = { ...existing, ...updates };
        importedValues += keys.length;
        changedDays++;
    }

    if (!dryRun && importedValues > 0) {
        if (saveDataToLocalStorage() === false) {
            throw new Error('Die Werte wurden ermittelt, konnten aber nicht gespeichert werden. Bitte Kontoanmeldung prüfen.');
        }
        initEngine();
    }
    return { days: changedDays, values: importedValues, records: rows.length, dates: byDate.size };
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
            : 'Vorschau: ' + result.values + ' fehlende Werte an ' + result.days +
                ' Tagen könnten ergänzt werden. Geprüft: ' + result.records + ' Rohdatensätze an ' +
                result.dates + ' Tagen. Es wurde noch nichts verändert.';
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
            : 'Wiederherstellung abgeschlossen: ' + result.values + ' Werte an ' + result.days +
                ' Tagen ergänzt. Geprüft: ' + result.records + ' Rohdatensätze an ' + result.dates +
                ' Tagen. Bestehende Check-in-Werte wurden nicht überschrieben.';
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

function renderGarminSyncProgress(completedDays, totalDays, phase = 'Aktivitäts- und Gesundheitsdaten werden abgeglichen') {
    const status = document.getElementById('garmin-connection-status');
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
    container.textContent = 'Synchronisierungshistorie wird geladen …';
    try {
        const healthRows = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase.from('garmin_health_records')
                .select('data_type,record_date')
                .order('record_date', { ascending: true })
                .range(offset, offset + pageSize - 1);
            if (error) throw error;
            healthRows.push(...(data || []));
            if (!data || data.length < pageSize) break;
        }

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

        const { data: activityRows, error: activityError } = await supabase.from('garmin_activities')
            .select('start_time')
            .order('start_time', { ascending: true });
        if (activityError) throw activityError;
        const activityDates = (activityRows || []).map(row => String(row.start_time || '').slice(0, 10)).filter(Boolean);
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
        container.textContent = 'Historie konnte nicht geladen werden: ' + (error.message || 'Unbekannter Fehler');
    }
}

function applyGarminFitDetail(activity, detail) {
    if (!activity || !detail?.telemetry) return;
    activity.telemetry = mergeTelemetryData(activity.telemetry, detail.telemetry).value;
    // Garmin-eigene FIT-Daten werden bei einem Parser-Upgrade vollständig neu geschrieben,
    // damit ältere, unvollständige Zeitreihen nicht mit abweichenden Array-Längen blockieren.
    activity.garminTelemetry = Number(activity.garminFitParserVersion || 0) < 3
        ? detail.telemetry
        : mergeTelemetryData(activity.garminTelemetry, detail.telemetry).value;
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
        if (activeAppUserId !== syncUserId || !appUserReady) {
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
                    break;
                } catch (error) {
                    if (attempt > 0 || !/HTTP 429|rate.?limit/i.test(error?.message || '')) throw error;
                    if (message) message.textContent = 'Garmin begrenzt den FIT-Abruf. Aktivität ' + (index + 1) + '/' + pending.length + ' wird nach 30 Sekunden erneut versucht …';
                    await new Promise(resolve => setTimeout(resolve, 30000));
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
            failed++;
            errors.push(id + ': ' + (error?.message || 'FIT-Abruf fehlgeschlagen'));
            console.warn('Garmin-Zeitreihen konnten nicht importiert werden:', id, error);
        }
        if ((index + 1) % 5 === 0 || index === pending.length - 1) {
            if (saveDataToLocalStorage() === false) throw new Error('Garmin-Zeitreihen konnten nicht im lokalen Datenspeicher gesichert werden.');
            const batch = pending.slice(persistedThrough, index + 1);
            const cloudResult = await persistGarminTelemetryBatch(batch, syncUserId);
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
        if (activeAppUserId !== syncUserId || !appUserReady) {
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
                }
            }
            if (activeAppUserId !== syncUserId || !appUserReady) {
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
            if (activeAppUserId !== syncUserId || !appUserReady) {
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
    const pending = state.rawActivities.filter(activity => {
        const id = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId;
        const date = String(activity.date || '').slice(0, 10);
        const hr = Array.isArray(activity.garminTelemetry?.hr) ? activity.garminTelemetry.hr : [];
        const time = Array.isArray(activity.garminTelemetry?.time) ? activity.garminTelemetry.time : [];
        const validCount = hr.reduce((count, value, index) => {
            const bpm = Number(value), seconds = Number(time[index]);
            return count + (Number.isFinite(bpm) && bpm >= 30 && bpm <= 250
                && Number.isFinite(seconds) && seconds >= 0 ? 1 : 0);
        }, 0);
        return id != null && /^\d+$/.test(String(id))
            && date >= startDate && date <= endDate
            && (hr.length < 2 || time.length !== hr.length || validCount < 2);
    });

    let imported = 0, failed = 0;
    const errors = [];
    for (let index = 0; index < pending.length; index++) {
        const activity = pending[index];
        const id = String(activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId);
        const message = status?.querySelector('#garmin-sync-progress-message');
        if (message) message.textContent = 'Lade ausschließlich HF-Zeitreihen: ' + (index + 1) + '/' + pending.length;
        try {
            let detail;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    detail = await downloadGarminFitTelemetry(id);
                    break;
                } catch (error) {
                    if (attempt >= 2 || !/HTTP 429|rate.?limit/i.test(error?.message || '')) throw error;
                    const waitSeconds = 30 + attempt * 15;
                    if (message) message.textContent = 'Garmin-Abruflimit erreicht. Neuer Versuch in ' + waitSeconds + ' Sekunden …';
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                }
            }
            const hr = Array.isArray(detail?.telemetry?.hr) ? detail.telemetry.hr : [];
            const time = Array.isArray(detail?.telemetry?.time) ? detail.telemetry.time : [];
            const validHrCount = hr.reduce((count, value, pointIndex) => {
                const bpm = Number(value), seconds = Number(time[pointIndex]);
                return count + (Number.isFinite(bpm) && bpm >= 30 && bpm <= 250
                    && Number.isFinite(seconds) && seconds >= 0 ? 1 : 0);
            }, 0);
            if (hr.length < 2 || time.length !== hr.length || validHrCount < 2) {
                throw new Error('Keine ausreichende HF-Zeitreihe in der FIT-Datei gefunden.');
            }

            const previous = activity.garminTelemetry;
            activity.garminTelemetry = {
                ...(previous && typeof previous === 'object' ? previous : {}),
                hr: [...hr],
                time: [...time]
            };
            if (saveDataToLocalStorage() === false) {
                activity.garminTelemetry = previous;
                throw new Error('Die HF-Zeitreihe konnte nicht lokal gespeichert werden.');
            }
            imported++;
            // Jede erfolgreich gespeicherte HF-Zeitreihe aktualisiert die Load-Anzeige.
            initEngine();
        } catch (error) {
            failed++;
            errors.push(id + ': ' + (error?.message || 'HF-Nachladen fehlgeschlagen'));
            console.warn('Garmin-HF-Zeitreihe konnte nicht nachgeladen werden:', id, error);
        }
        if (index < pending.length - 1) await new Promise(resolve => setTimeout(resolve, 900));
    }
    if (imported > 0) initEngine();
    return { total: pending.length, imported, failed, errors };
}

async function syncGarminSelectedRange() {
    const status = document.getElementById('garmin-connection-status');
    const button = document.getElementById('garmin-sync-range-button');
    const startDate = document.getElementById('garmin-preview-start-date')?.value;
    const endDate = document.getElementById('garmin-preview-end-date')?.value;
    if (!status || !button) return;
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
            status.removeAttribute('aria-busy');
            status.textContent = result.total === 0
                ? 'Keine Garmin-Aktivitäten mit fehlender oder unvollständiger HF-Zeitreihe im gewählten Zeitraum gefunden.'
                : 'HF-Nachladen abgeschlossen: ' + result.imported + '/' + result.total + ' Zeitreihen geladen; ' +
                    result.failed + ' fehlgeschlagen. Andere Garmin-Daten und Gesundheitsdaten wurden nicht synchronisiert.' +
                    (result.errors.length ? ' Erste Fehler: ' + result.errors.slice(0, 3).join(' | ') : '');
            setGarminSyncIndicator('current', 'Verbunden');
            await refreshGarminConnectionStatus();
        } catch (error) {
            status.removeAttribute('aria-busy');
            status.textContent = 'HF-Nachladen pausiert: ' + (error?.message || 'Unbekannter Fehler');
            setGarminSyncIndicator('current', 'Verbunden');
        } finally {
            button.disabled = false;
            button.textContent = 'Daten synchronisieren';
        }
        return;
    }
    button.disabled = true;
    button.textContent = 'Synchronisierung läuft …';
    const totalDays = Math.max(1, Math.round((new Date(endDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z')) / 86400000) + 1);
    setGarminSyncIndicator('syncing', 'Synchronisierung läuft');
    renderGarminSyncProgress(0, totalDays);
    let includeActivities = true;
    let remainingDays = null;
    let activitySummary = null;
    let healthImportSummary = { days: 0, values: 0 };
    let batch = 0;
    let consecutiveRateLimits = 0;
    try {
        while (remainingDays !== 0) {
            if (batch >= 1000) throw new Error('Sicherheitsgrenze für automatische Teilabrufe erreicht. Der gespeicherte Fortschritt bleibt erhalten.');
            let response;
            try {
                response = await callGarminFunction({
                    action: 'sync-range', startDate, endDate, includeActivities,
                    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
                    onlyMissingDays: true
                });
            } catch (error) {
                if (!/HTTP 429|rate.?limit/i.test(error?.message || '') || consecutiveRateLimits >= 8) throw error;
                consecutiveRateLimits++;
                const waitSeconds = 30 + Math.min(30, (consecutiveRateLimits - 1) * 5);
                const message = status.querySelector('#garmin-sync-progress-message');
                if (message) message.textContent = 'Garmin-Abruflimit erreicht. Automatischer neuer Versuch in ' + waitSeconds + ' Sekunden …';
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                batch++;
                continue;
            }
            includeActivities = false;
            const sync = response.sync || {};
            const health = sync.healthSync || {};
            if (sync.activitySync) {
                activitySummary = sync.activitySync;
                await loadGarminActivitiesFromCloud();
                if (sync.activitySync.status === 'ok') {
                    recordGarminActivityCoverageRange(startDate, endDate);
                    initEngine();
                }
            }
            remainingDays = Number(health.remainingDays ?? 0);
            const completedDays = Math.max(0, Math.min(totalDays, totalDays - remainingDays));
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
                throw new Error('Der Garmin-Import hat keinen Fortschritt erzielt. Der gespeicherte Fortschritt bleibt erhalten.');
            }
            batch++;
        }

        healthImportSummary = await loadGarminHealthRecordsIntoCheckins(startDate, endDate);
        const message = status.querySelector('#garmin-sync-progress-message');
        if (message) message.textContent = 'Lade HF- und Geschwindigkeitszeitreihen der Garmin-Aktivitäten …';
        setGarminSyncProgressPhase('Tagesabgleich abgeschlossen · FIT-Dateien und Aktivitätsdetails werden ergänzt.');
        const telemetrySummary = await syncMissingGarminTelemetry(startDate, endDate, status);
        const jsonTelemetrySummary = await syncMissingGarminJsonTelemetry(startDate, endDate, status);
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
        await refreshGarminConnectionStatus();
        await loadGarminSyncHistory();
    } catch (error) {
        status.removeAttribute('aria-busy');
        status.textContent = 'Synchronisierung pausiert: ' + (error?.message || 'Unbekannter Fehler') +
            ' Der bereits erreichte Fortschritt bleibt gespeichert. Du kannst denselben Zeitraum erneut starten.';
        setGarminSyncIndicator('current', 'Verbunden');
        await loadGarminSyncHistory();
    } finally {
        button.disabled = false;
        if (button.textContent === 'Synchronisierung läuft …') button.textContent = 'Erneut versuchen';
    }
}

async function refreshGarminConnectionStatus() {
    const status = document.getElementById('garmin-connection-status');
    if (status) status.textContent = 'Verbindungsstatus wird geprüft …';
    try {
        const result = await callGarminFunction({ action: 'status' });
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
    const protectedKeys = new Set(['id','sourceId','source','sources','sourceRefs','garminData','garminFitImported','garminTelemetry','telemetry']);
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
    const workoutSteps = Array.isArray(fit.workout_steps) ? fit.workout_steps
        : (Array.isArray(parsedMessages.workout_step) ? parsedMessages.workout_step : []);
    messageGroups.structured = { laps, sets, workoutSteps };
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
    runInitStep('Check-in-Formular', () => loadCheckinInputs());

    const timeline = runInitStep('Trainingsbelastung berechnen', () =>
        computePerformanceTimeline(state.rawActivities, state.settings, state.profile, state.dailyCheckins)
    );
    state.dailyTimeline = Array.isArray(timeline) ? timeline : [];

    // Jeder Bereich wird unabhängig aufgebaut. Ein Fehler in einem Diagramm
    // oder einer Analyse darf Home, Kalender oder Navigation nicht blockieren.
    runInitStep('Belastungs-KPIs', () => renderSummaryKPICards(state.dailyTimeline));
    runInitStep('Readiness', () => renderReadinessDashboard());
    runInitStep('Nächster Wettkampf', () => renderDashboardNextRace());
    runInitStep('Trainingswoche', () => renderHomeTrainingWeek());
    runInitStep('Belastungsdiagramm', () => renderMainLoadChart(state.dailyTimeline, state.activeTimeframe));
    runInitStep('Analysebereiche', () => renderAnalysisInsights());
    runInitStep('Sportverteilung', () => refreshSportAnalytics());
    runInitStep('Herzfrequenzzonen', () => renderHeartRateZoneDistribution(state.rawActivities));
    runInitStep('Trainingsnarrativ', () => generateAutomatedNarrative(state.dailyTimeline));
    runInitStep('Kalender', () => renderCalendar());
    runInitStep('Wettkämpfe', () => renderRaces());
    runInitStep('Trainingsplanung', () => renderPlannedWorkouts());
    runInitStep('Krafttraining', () => renderStrengthView());
    runInitStep('Home-Tagesübersicht', () => renderSelectedDashboardDay());
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

async function loadCloudProfile(session) {
    const userId = session?.user?.id;
    if (!userId || !supabase || activeProfileUserId === userId) return;

    const { data, error } = await supabase
        .from('user_profiles')
        .select('profile')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Cloud-Profil konnte nicht geladen werden:', error);
        return;
    }
    if (activeAppUserId !== userId) return;

    activeProfileUserId = userId;
    if (!data?.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) return;

    const localProfile = state.profile && typeof state.profile === 'object' && !Array.isArray(state.profile)
        ? state.profile
        : {};
    const localHasProfile = Object.keys(localProfile).length > 0;
    const profilesMatch = JSON.stringify(localProfile) === JSON.stringify(data.profile);

    // Never replace an existing local profile silently with a cloud copy.
    // Cloud data is adopted only when the local profile is still empty.
    if (localHasProfile) {
        if (!profilesMatch) {
            const indicator = document.getElementById('sync-status-indicator');
            if (indicator) {
                indicator.textContent = 'Lokales und Cloud-Profil unterscheiden sich. Lokale Daten wurden geschützt; ein Abgleich ist noch nicht erfolgt.';
            }
            console.warn('Lokales und Cloud-Profil unterscheiden sich. Automatische Übernahme wurde zum Schutz lokaler Daten übersprungen.');
        }
        return;
    }

    state.profile = data.profile;
    saveDataToLocalStorage();
    loadProfileForm();
    initEngine();
}

let cloudInitialTransferState = 'unknown';
let cloudInitialTransferBusy = false;

// Versionsgeschützte automatische Cloud-Synchronisierung.
// Lokale Änderungen werden gebündelt; bei Versionskonflikten wird nicht überschrieben.
let cloudSyncVersion = 0;
let cloudSyncUserId = null;
let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncPending = false;
let cloudSyncBlocked = false;
// Änderungen, die während der Kontoaktivierung gespeichert werden, werden
// vorgemerkt und nach dem Ereignis endurance:user-ready erneut synchronisiert.
let cloudSyncAwaitingReadyUserId = null;

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

async function flushCloudSync() {
    if (!appUserReady || !activeAppUserId || activeAppUserId !== cloudSyncUserId || cloudSyncBlocked) return;
    if (cloudSyncInFlight) {
        cloudSyncPending = true;
        return;
    }

    const userId = activeAppUserId;
    cloudSyncInFlight = true;
    cloudSyncPending = false;
    setCloudSyncStatus('Cloud-Speicherung läuft …');

    try {
        // Rohtelemetrie wird getrennt und nur dann übertragen, wenn die
        // jeweilige Aktivität noch keinen Cloud-Datensatz besitzt.
        let telemetryUpload = { uploaded: 0, failed: false };
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

        // Der versionierte user_data-Snapshot enthält bewusst keine großen
        // Garmin-Rohzeitreihen mehr.
        const snapshot = JSON.parse(JSON.stringify(getUserDataSnapshot()));
        const result = await saveCloudSnapshot(snapshot, cloudSyncVersion, userId);
        if (activeAppUserId !== userId || cloudSyncUserId !== userId) return;

        if (!result.saved) {
            cloudSyncBlocked = true;
            cloudInitialTransferState = 'exists';
            setCloudSyncStatus('Synchronisationskonflikt – Cloud-Daten sind geschützt; es wurde nichts überschrieben.');
            setCloudTransferMessage('Ein anderer Speicherstand wurde zwischenzeitlich geändert. Die automatische Synchronisierung wurde angehalten, damit keine Daten überschrieben werden.');
            console.warn('Cloud-Synchronisierung wegen Versionskonflikt angehalten.', result);
            return;
        }

        cloudSyncVersion = result.currentVersion;
        setCloudSyncStatus(telemetryUpload.failed
            ? 'App-Daten in Cloud gespeichert; Garmin-Telemetrie wartet auf erneuten Versuch.'
            : 'In Cloud gespeichert (Version ' + cloudSyncVersion + ')' + (telemetryUpload.uploaded ? ' · ' + telemetryUpload.uploaded + ' neue Telemetrie-Datensätze' : ''));
        if (cloudInitialTransferState === 'empty') {
            cloudInitialTransferState = 'exists';
            setCloudTransferMessage('Deine Daten wurden automatisch erstmals in der Cloud gespeichert (Version ' + cloudSyncVersion + ').');
        }
    } catch (error) {
        if (activeAppUserId === userId) {
            setCloudSyncStatus('Cloud-Speicherung fehlgeschlagen – lokale Daten bleiben erhalten.');
            console.error('Automatische Cloud-Synchronisierung fehlgeschlagen:', error);
        }
    } finally {
        cloudSyncInFlight = false;
        if (cloudSyncPending && !cloudSyncBlocked && activeAppUserId === cloudSyncUserId) {
            cloudSyncPending = false;
            scheduleCloudSync(cloudSyncUserId);
        }
    }
}

window.addEventListener('endurance:data-saved', event => {
    scheduleCloudSync(event.detail?.userId || null);
});

window.addEventListener('endurance:user-ready', event => {
    const userId = event.detail?.userId || null;
    if (!userId || userId !== activeAppUserId || cloudSyncAwaitingReadyUserId !== userId) return;
    cloudSyncAwaitingReadyUserId = null;
    scheduleCloudSync(userId);
});

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

async function refreshCloudInitialTransferState(userId = activeAppUserId) {
    if (!supabase || !userId || userId !== activeAppUserId) return;
    cloudInitialTransferState = 'checking';
    setCloudTransferMessage('Prüfe, ob für dieses Konto bereits ein zentraler Cloud-Datensatz existiert …');
    try {
        const cloud = await fetchCloudSnapshot();
        if (userId !== activeAppUserId) return;
        if (cloud.userId !== userId) throw new Error('Das angemeldete Konto hat sich während der Prüfung geändert.');
        if (cloud.data !== null) {
            cloudInitialTransferState = 'exists';
            setCloudTransferMessage('Für dieses Konto existiert bereits ein Cloud-Datensatz. Ein Erstupload wird deshalb nicht angeboten und vorhandene Daten werden nicht überschrieben.');
        } else {
            cloudInitialTransferState = 'empty';
            setCloudTransferMessage('Für dieses Konto wurde noch kein zentraler Datensatz gefunden. Deine lokalen Daten bleiben unverändert, bis du den Erstupload ausdrücklich bestätigst.', true);
        }
    } catch (error) {
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
    const button = document.getElementById('cloud-sync-confirm-button');
    if (button) button.disabled = true;
    setCloudTransferMessage('Cloud-Datenbestand wird nochmals geprüft. Es wurde noch nichts übertragen …');
    try {
        const userId = activeAppUserId;
        const existing = await fetchCloudSnapshot();
        if (userId !== activeAppUserId || existing.userId !== userId) throw new Error('Das angemeldete Konto hat sich geändert. Bitte starte den Vorgang erneut.');
        if (existing.data !== null || existing.version !== 0) {
            cloudInitialTransferState = 'exists';
            closeCloudInitialTransferConfirmation();
            setCloudTransferMessage('Der Cloud-Datensatz ist inzwischen vorhanden. Zur Sicherheit wurde kein Upload ausgeführt.');
            return;
        }
        const result = await saveCloudSnapshot(getUserDataSnapshot(), 0, userId);
        if (!result.saved) {
            cloudInitialTransferState = 'exists';
            closeCloudInitialTransferConfirmation();
            setCloudTransferMessage('Der Erstupload wurde wegen eines Versionskonflikts abgebrochen. Es wurden keine vorhandenen Cloud-Daten überschrieben.');
            return;
        }
        cloudInitialTransferState = 'uploaded';
        cloudSyncUserId = userId;
        cloudSyncVersion = result.currentVersion;
        cloudSyncBlocked = false;
        closeCloudInitialTransferConfirmation();
        setCloudTransferMessage('Erstübertragung erfolgreich gespeichert (Cloud-Version ' + result.currentVersion + '). Die lokalen Daten und die separaten Garmin-Speicher wurden nicht gelöscht oder verändert.');
    } catch (error) {
        cloudInitialTransferState = 'error';
        setCloudTransferMessage('Erstübertragung fehlgeschlagen. Der Cloud-Status wird zur Sicherheit erneut geprüft. ' + error.message);
        if (activeAppUserId) await refreshCloudInitialTransferState(activeAppUserId);
    } finally {
        cloudInitialTransferBusy = false;
        if (button) button.disabled = false;
    }
}

let garminDailySyncInFlight = new Set();
let garminDailySyncCompleted = new Set();

function getLocalCalendarDate(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

async function syncGarminTodayOnOpen(userId) {
    if (!userId || !appUserReady || activeAppUserId !== userId) return;
    const date = getLocalCalendarDate();
    const runKey = userId + ':' + date;
    if (garminDailySyncCompleted.has(runKey) || garminDailySyncInFlight.has(runKey)) return;
    garminDailySyncInFlight.add(runKey);

    try {
        // Bereits gespeicherte Garmin-Tageswerte unabhängig vom Live-API-Status
        // laden, damit historische Aktivitäten adaptive Ruhe-HF erhalten.
        try {
            const activityDates = (state.rawActivities || [])
                .map(activity => String(activity?.date || activity?.startTime || '').slice(0, 10))
                .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
                .sort();
            const zoneWindowDays = Math.min(28, Math.max(3, Number(state.settings?.heartRateZoneSettings?.restingHrWindowDays) || 7));
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

        const connection = await callGarminFunction({ action: 'status' });
        if (activeAppUserId !== userId || !appUserReady) return;
        if (connection.connection?.status !== 'connected') {
            try { setUserLocalSetting('garmin_connected', 'false'); } catch (_) {}
            return;
        }
        try { setUserLocalSetting('garmin_connected', 'true'); } catch (_) {}

        setGarminSyncIndicator('syncing', 'Tagesabgleich läuft');
        let response = null;
        let health = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                response = await callGarminFunction({ action: 'sync-today', date });
            } catch (syncError) {
                const rateLimited = /HTTP 429|rate.?limit/i.test(syncError?.message || '');
                if (!rateLimited || attempt === 3) throw syncError;
                const waitSeconds = 30 + attempt * 15;
                console.info('KAJO: Garmin-Aktivitätsabruf wartet wegen API-Limit', waitSeconds, 'Sekunden.');
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                if (activeAppUserId !== userId || !appUserReady) return;
                continue;
            }
            health = response.sync?.healthSync || null;
            const limited = health?.rateLimited || health?.status === 'rate_limited';
            if (!limited) break;
            if (attempt === 3) throw new Error('Garmin hat den Tagesabruf trotz mehrerer Versuche begrenzt.');
            const waitSeconds = Math.max(30, Number(health.retryInSeconds || 30)) + attempt * 15;
            console.info('KAJO: Garmin-Tagesabgleich wartet wegen API-Limit', waitSeconds, 'Sekunden.');
            await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
            if (activeAppUserId !== userId || !appUserReady) return;
        }

        if (activeAppUserId !== userId || !appUserReady) return;
        await loadGarminActivitiesFromCloud();
        if (activeAppUserId !== userId || !appUserReady) return;


        try {
            await syncMissingGarminTelemetry(date, date, null);
        } catch (telemetryError) {
            console.warn('KAJO: FIT-Zeitreihen des heutigen Tages konnten nicht vollständig ergänzt werden:', telemetryError);
        }
        let jsonTelemetry = { failed: 0, rateLimited: false };
        try {
            // Der automatische Tagesabgleich ergänzt ausschließlich Rohtelemetrie
            // für Aktivitäten des aktuellen Tages. Historische Zeitreihen werden
            // nur bei einem ausdrücklich gestarteten Zeitraum-Import nachgeladen.
            jsonTelemetry = await syncMissingGarminJsonTelemetry(date, date, null);
            console.info('KAJO: Automatische Garmin-Rohtelemetrie abgeschlossen:', jsonTelemetry);
        } catch (jsonTelemetryError) {
            jsonTelemetry = { failed: 1, rateLimited: false };
            console.warn('KAJO: Garmin-Rohtelemetrie konnte nicht vollständig ergänzt werden:', jsonTelemetryError);
        }

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

        if (activeAppUserId !== userId || !appUserReady) return;
        const partial = health?.status === 'partial' || Number(health?.failed || 0) > 0
            || Number(jsonTelemetry.failed || 0) > 0 || jsonTelemetry.rateLimited === true
            || telemetryCloud.failed;
        if (partial) {
            console.warn('KAJO: Garmin-Tagesabgleich teilweise abgeschlossen; fehlende Zeitreihen werden beim nächsten Abgleich erneut versucht.', { health, jsonTelemetry });
            setGarminSyncIndicator('partial', 'Teilweise synchronisiert');
            if (jsonTelemetry.rateLimited || Number(jsonTelemetry.failed || 0) > 0 || telemetryCloud.failed) {
                const retryDelay = jsonTelemetry.rateLimited ? 5 * 60 * 1000 + 10000 : 6 * 60 * 60 * 1000 + 10000;
                setTimeout(() => {
                    if (activeAppUserId === userId && appUserReady && !garminDailySyncCompleted.has(runKey)) {
                        void syncGarminTodayOnOpen(userId);
                    }
                }, retryDelay);
            }
        } else {
            garminDailySyncCompleted.add(runKey);
            console.info('KAJO: Garmin-Tagesabgleich abgeschlossen für', date, response.sync?.activitySync, health, jsonTelemetry, telemetryCloud);
            setGarminSyncIndicator('current', 'Verbunden');
        }
    } catch (error) {
        console.warn('KAJO: Automatischer Garmin-Tagesabgleich fehlgeschlagen:', error);
        if (activeAppUserId === userId && appUserReady) setGarminSyncIndicator('current', 'Verbunden');
    } finally {
        garminDailySyncInFlight.delete(runKey);
    }
}

function withActivationTimeout(promise, label, timeoutMs = 30000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(label + ' dauert zu lange. Bitte lade die Seite neu und versuche es erneut.')), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function handleAuthSession(session) {
    const userId = session?.user?.id || null;
    if (userId && activeAppUserId === userId && (appUserReady || activationPromise)) return;
    const sequence = ++activationSequence;

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
        try {
            // Lokalen Kontospeicher und Cloud-Snapshot parallel laden:
            // Beide Lesevorgänge sind unabhängig. Die Daten werden weiterhin erst
            // nach erfolgreicher Prüfung beider Ergebnisse zusammengeführt.
            const [loadedUserId, cloudSnapshot] = await Promise.all([
                withActivationTimeout(loadStateForUser(userId), 'Das Laden deiner lokalen Kontodaten', 20000),
                withActivationTimeout(fetchCloudSnapshot(), 'Das Laden deiner Cloud-Daten', 30000)
            ]);
            if (sequence !== activationSequence || activeAppUserId !== userId) return;
            if (loadedUserId !== userId) {
                throw new Error('Der lokale Datenspeicher gehört nicht mehr zum angemeldeten Konto.');
            }
            // Lokale Rohtelemetrie vor dem Anwenden des maßgeblichen Cloud-Snapshots
            // sichern, damit sie beim einmaligen Transfer nicht verloren geht.
            const localTelemetryForMigration = getGarminTelemetryRecordsForCloud();

            // Ein vorhandener zentraler Datensatz ist die maßgebliche Datenquelle.
            // Der lokale, kontogebundene Speicher dient danach nur als Cache.
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
                applyCloudDataSnapshot(cloudSnapshot.data);
                const indicator = document.getElementById('sync-status-indicator');
                if (indicator) indicator.textContent = 'Cloud-Daten geladen (Version ' + cloudSnapshot.version + ')';
            }

            try { await withActivationTimeout(loadGarminActivitiesFromCloud(), 'Das Laden der Garmin-Daten', 20000); }
            catch (garminLoadError) { console.warn('Garmin-Cloud-Aktivitäten konnten nicht geladen werden:', garminLoadError); }

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

            await domReady;
            if (sequence !== activationSequence || activeAppUserId !== userId) return;

            // Die Anmeldung und das Laden der Kontodaten sind abgeschlossen.
            // Die App wird jetzt sichtbar gemacht, bevor die aufwendige Erst-
            // darstellung startet. So bleibt die Anmeldeseite nicht stehen,
            // während Dashboard und Diagramme initial gerendert werden.
            appUserReady = true;
            window.dispatchEvent(new CustomEvent('endurance:user-ready', { detail: { userId } }));
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            try {
                initializeSettings();
                initEngine();
                // Der Tagesabgleich läuft nach dem ersten Rendern im Hintergrund
                // und hält den App-Start dadurch nicht auf.
                void syncGarminTodayOnOpen(userId);
                initializeNutritionRemindersWhenIdle();
            } catch (renderError) {
                console.error('Die App-Oberfläche konnte nicht vollständig initialisiert werden:', renderError);
                window.dispatchEvent(new CustomEvent('endurance:user-init-error', {
                    detail: { message: renderError?.message || 'Fehler beim Aufbau der App-Oberfläche.' }
                }));
            }

            // Der erste sichtbare App-Aufbau wartet nicht auf den Telemetrie-Upload.
            // Daten werden erst nach erfolgreichem Cloud-Readback lokal bereinigt.
            void (async () => {
                try {
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
                    await clearLocalGarminTelemetryCache();
                    // Nach dem Entfernen des lokalen Caches die bestätigten Cloud-Daten
                    // wieder in den aktiven Arbeitsspeicher übernehmen.
                    mergeGarminTelemetryRecords(cloudTelemetry.records);
                    console.info('KAJO: Garmin-Telemetrie-Cloudabgleich abgeschlossen:', {
                        uploaded: cloudTelemetry.uploaded,
                        existing: cloudTelemetry.existing,
                        total: cloudTelemetry.total,
                        localTelemetryCacheCleared: true
                    });
                } catch (telemetryMigrationError) {
                    // Bei Fehlern bleiben lokale und Legacy-Telemetriedaten erhalten.
                    console.warn('KAJO: Garmin-Telemetrie-Cloudabgleich noch nicht vollständig:', telemetryMigrationError);
                }
            })();

            await refreshCloudInitialTransferState(userId);
            await loadCloudProfile(session);
        } catch (error) {
            console.error('Benutzerdaten konnten nicht sicher geladen werden:', error);
            if (sequence === activationSequence) {
                appUserReady = false;
                deactivateUserStorage();
                activeAppUserId = null;
                window.dispatchEvent(new CustomEvent('endurance:user-load-error', {
                    detail: { message: error?.message || 'Unbekannter Fehler beim Laden deiner Kontodaten.' }
                }));
            }
        } finally {
            if (sequence === activationSequence) activationPromise = null;
        }
    })();
    await activationPromise;
}

if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
        // Keine asynchronen Supabase-Aufrufe direkt im Auth-Callback starten.
        setTimeout(() => handleAuthSession(session), 0);
    });

    supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
            console.error('Anmeldestatus konnte nicht geprüft werden:', error);
            return;
        }
        handleAuthSession(data?.session || null);
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
    openCloudInitialTransferConfirmation,
    openCloudSyncModal,
    closeCloudSyncModal,
    closeCloudInitialTransferConfirmation,
    performCloudInitialTransfer,
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
    saveSettings,
    previewHeartRateZones,
    closeProfileModal,
    editAthleteProfileSection,
    cancelAthleteProfileEdit,
    saveAthleteProfileSection,
    restoreDatabaseBackup,
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
    saveCalendarSeason,
    deleteCalendarSeason,
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
    openHealthLogModal,
    openIntervalsSyncModal,
    openPlannedWorkoutModal,
    openStrengthModal,
    performIntervalsLiveSync,
    saveCheckin,
    saveDayEditor,
    saveManualSportCorrection,
    addActivityStrengthSet,
    removeActivityStrengthSet,
    toggleActivityStrengthSection,
    toggleActivityEdit,
    updateActivityRPE,
    savePlannedWorkout,
    saveRetroactiveHealthLog,
    saveStrengthWorkout,
    sendAICoachMessage,
    setTimeframe,
    toggleCustomDatePicker,
    toggleRaceModal,
    toggleCheckinOptionalFields,
    toggleCycleFields,
    toggleDayCycleFields,
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
            ['profile', 'Athletenprofil'], ['settings', 'App-Einstellungen']
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
        profile: 'Athletenprofil', settings: 'App-Einstellungen'
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