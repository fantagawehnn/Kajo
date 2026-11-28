/* ============================================================
 * import.js – Datenimport
 *   - Intervals.icu Live-Sync (Aktivitäten + Wellness)
 *   - CSV-/FIT-Mehrfachimport inkl. Duplikat-Erkennung
 * PapaParse und FitParser werden erst beim tatsächlichen Dateiimport geladen.
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage, getUserLocalSetting, setUserLocalSetting } from './storage.js?v=8';
import { inferSport, inferCategory } from './activities.js';
import { toLocalDateString } from './utils.js';

const importLibraryPromises = new Map();
function ensureImportLibrary(globalName, src) {
    if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    if (!importLibraryPromises.has(globalName)) {
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => globalThis[globalName]
                ? resolve(globalThis[globalName])
                : reject(new Error(globalName + ' wurde geladen, ist aber nicht verfügbar.'));
            script.onerror = () => reject(new Error('Die Import-Bibliothek ' + globalName + ' konnte nicht geladen werden.'));
            document.head.appendChild(script);
        }).catch(error => {
            importLibraryPromises.delete(globalName);
            throw error;
        });
        importLibraryPromises.set(globalName, promise);
    }
    return importLibraryPromises.get(globalName);
}



function crossSourceActivityMatch(a, b) {
    if (!a || !b) return false;
    if (a.type && b.type && a.type !== b.type) return false;

    // Distanzwerte der Quellen können voneinander abweichen.
    // Für die Zuordnung ist deshalb die Dauer maßgeblich; die Garmin-Aktivität
    // bleibt anschließend der kanonische Datensatz und behält ihre Distanz.
    const durationComparable = Number.isFinite(Number(a.duration)) && Number(a.duration) > 0
        && Number.isFinite(Number(b.duration)) && Number(b.duration) > 0;
    if (!durationComparable) return false;

    const aTime = a.startTime ? new Date(a.startTime).getTime() : NaN;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : NaN;
    const timeClose = Number.isFinite(aTime) && Number.isFinite(bTime)
        && Math.abs(aTime - bTime) <= 5 * 60 * 1000;

    if (durationComparable) {
        const tolerance = Math.max(8, Math.max(Number(a.duration), Number(b.duration)) * 0.15);
        if (Math.abs(Number(a.duration) - Number(b.duration)) > tolerance) return false;
    }
    if (timeClose) return true;

    // Sicherer Fallback für dieselbe Einheit, wenn die Quellsysteme
    // unterschiedliche Startzeit-Zeitzonen/Zeitsstempel liefern:
    // gleiches lokales Datum, gleicher Name, nahezu gleiche Dauer und HF-Werte.
    const sameDate = Boolean(a.date && b.date && String(a.date).slice(0, 10) === String(b.date).slice(0, 10));
    const normalizeName = value => String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
    const sameName = normalizeName(a.name) !== '' && normalizeName(a.name) === normalizeName(b.name);
    const hrComparable = Number.isFinite(Number(a.hr)) && Number(a.hr) > 0
        && Number.isFinite(Number(b.hr)) && Number(b.hr) > 0;
    const maxHrComparable = Number.isFinite(Number(a.maxHr)) && Number(a.maxHr) > 0
        && Number.isFinite(Number(b.maxHr)) && Number(b.maxHr) > 0;
    if (!sameDate || !sameName || !durationComparable || !hrComparable || !maxHrComparable) return false;
    if (Math.abs(Number(a.duration) - Number(b.duration)) > 2) return false;
    if (Math.abs(Number(a.hr) - Number(b.hr)) > 3) return false;
    if (Math.abs(Number(a.maxHr) - Number(b.maxHr)) > 3) return false;
    return true;
}

function mergeActivityWithoutOverwrite(target, incoming) {
    if (!target || !incoming || target === incoming) return;
    for (const [key, value] of Object.entries(incoming)) {
        if (['id', 'sourceId', 'source', 'sources', 'sourceRefs'].includes(key) || value == null || value === '') continue;
        const current = target[key];
        const missing = current == null || current === '' || (Array.isArray(current) && current.length === 0);
        if (missing) target[key] = value;
    }
    target.sourceRefs = { ...(incoming.sourceRefs || {}), ...(target.sourceRefs || {}) };
    const sources = new Set([
        ...(Array.isArray(target.sources) ? target.sources : []),
        ...(Array.isArray(incoming.sources) ? incoming.sources : []),
        target.source,
        incoming.source
    ].filter(Boolean));
    if (sources.size) target.sources = [...sources];
}

function isGarminActivity(activity) {
    return activity?.source === 'garmin'
        || activity?.sourceRefs?.garminActivityId != null
        || activity?.garminData?.activityId != null;
}

function isIntervalsActivity(activity) {
    return activity?.source === 'intervals'
        || activity?.sourceRefs?.intervalsActivityId != null
        || (activity?.sourceId != null && String(activity.id) === String(activity.sourceId)
            && /^\d+$/.test(String(activity.sourceId)));
}

function countNearTimeCrossSourcePairs(activities) {
    let count = 0;
    for (let i = 0; i < activities.length; i++) {
        const first = activities[i];
        if (!isGarminActivity(first) || !first.startTime) continue;
        const firstTime = new Date(first.startTime).getTime();
        if (!Number.isFinite(firstTime)) continue;
        for (let j = 0; j < activities.length; j++) {
            if (i === j) continue;
            const other = activities[j];
            if (!isIntervalsActivity(other) || !other.startTime) continue;
            if (first.date && other.date && first.date !== other.date) continue;
            const otherTime = new Date(other.startTime).getTime();
            if (!Number.isFinite(otherTime) || Math.abs(firstTime - otherTime) > 10 * 60 * 1000) continue;
            count++;
        }
    }
    return count;
}

function consolidateVisibleCrossSourceDuplicates() {
    let consolidated = 0;
    const activities = state.rawActivities;
    for (let i = 0; i < activities.length; i++) {
        const first = activities[i];
        if (!isGarminActivity(first)) continue;
        for (let j = activities.length - 1; j > i; j--) {
            const other = activities[j];
            if (!isIntervalsActivity(other) || !crossSourceActivityMatch(first, other)) continue;
            mergeActivityWithoutOverwrite(first, other);
            activities.splice(j, 1);
            consolidated++;
        }
    }
    return consolidated;
}

function isDuplicateImportedActivity(candidate, existingActivities) {
    const candidateId = candidate.sourceId != null ? String(candidate.sourceId) : null;
    return existingActivities.some(existing => {
        // Eindeutige externe IDs sind der stärkste Duplikat-Hinweis.
        if (candidateId && existing.sourceId != null && String(existing.sourceId) === candidateId) return true;
        if (String(existing.id) === String(candidate.id)) return true;

        // Ohne Startzeit niemals allein anhand von Datum und Namen aussortieren:
        // Mehrere gleich benannte Einheiten am selben Tag sind im Leistungssport normal.
        if (!candidate.startTime || !existing.startTime) return false;
        const candidateMs = new Date(candidate.startTime).getTime();
        const existingMs = new Date(existing.startTime).getTime();
        if (!Number.isFinite(candidateMs) || !Number.isFinite(existingMs)) return false;
        if (candidate.date !== existing.date || Math.abs(candidateMs - existingMs) > 120000) return false;

        // Bei nahezu identischer Startzeit müssen Sportart und Dauer plausibel passen.
        if (candidate.type && existing.type && candidate.type !== existing.type) return false;
        if (Number.isFinite(Number(candidate.duration)) && Number.isFinite(Number(existing.duration))
            && Math.abs(Number(candidate.duration) - Number(existing.duration)) > 3) return false;
        return true;
    });
}

// --- INTERVALS.ICU LIVE SYNC ENGINE ---
let intervalsSyncInProgress = false;
let intervalsSyncToast = null;
function updateIntervalsSyncStatus(statusEl, message, className = 'text-xs font-semibold text-sky-400') {
    if (statusEl) { statusEl.textContent = message; statusEl.className = className; }
    if (intervalsSyncToast) {
        const text = intervalsSyncToast.querySelector('[data-sync-message]');
        if (text) text.textContent = message;
        intervalsSyncToast.dataset.state = intervalsSyncInProgress ? 'running' : 'finished';
    }
}
function showIntervalsSyncToast(message = 'Intervals.icu-Synchronisierung läuft weiter …') {
    if (!intervalsSyncToast) {
        intervalsSyncToast = document.createElement('div');
        intervalsSyncToast.id = 'icu-sync-floating-status';
        intervalsSyncToast.className = 'icu-sync-floating-status';
        intervalsSyncToast.setAttribute('role', 'status');
        intervalsSyncToast.setAttribute('aria-live', 'polite');
        intervalsSyncToast.innerHTML = '<span class="icu-sync-indicator" aria-hidden="true"></span><span data-sync-message></span><button type="button" aria-label="Statusmeldung schließen">×</button>';
        intervalsSyncToast.querySelector('button').addEventListener('click', () => intervalsSyncToast?.remove());
        document.body.appendChild(intervalsSyncToast);
    }
    const text = intervalsSyncToast.querySelector('[data-sync-message]');
    if (text) text.textContent = message;
    intervalsSyncToast.hidden = false;
}
function isGarminSyncConfigured() {
    const configured = getUserLocalSetting('garmin_connected');
    return configured !== 'false';
}

function intervalsSyncPauseMessage() {
    return 'Intervals.icu-Aktivitätssynchronisierung ist pausiert, solange Garmin verbunden ist. Garmin bleibt die führende Aktivitätsquelle.';
}

/**
 * Verschiebt reine Intervals.icu-Aktivitäten aus dem aktiven Trainingsbestand.
 * Garmin-Datensätze mit zusätzlichem Intervals-Quellverweis bleiben erhalten.
 * Die verschobenen Datensätze bleiben separat gespeichert und werden nicht gelöscht.
 */
export function deactivateIntervalsActivities() {
    const isGarmin = activity => activity?.source === 'garmin'
        || activity?.sourceRefs?.garminActivityId != null
        || activity?.garminData?.activityId != null
        || activity?.sources?.includes?.('garmin');
    const isIntervals = activity => activity?.source === 'intervals'
        || activity?.sourceRefs?.intervalsActivityId != null
        || activity?.sources?.includes?.('intervals');
    const disabled = [];
    state.rawActivities = (Array.isArray(state.rawActivities) ? state.rawActivities : []).filter(activity => {
        if (isIntervals(activity) && !isGarmin(activity)) {
            disabled.push(activity);
            return false;
        }
        return true;
    });
    const prior = Array.isArray(state.disabledIntervalsActivities) ? state.disabledIntervalsActivities : [];
    const byId = new Map(prior.map(activity => [String(activity.sourceRefs?.intervalsActivityId ?? activity.id), activity]));
    disabled.forEach(activity => byId.set(String(activity.sourceRefs?.intervalsActivityId ?? activity.id), activity));
    state.disabledIntervalsActivities = Array.from(byId.values());
    if (disabled.length) saveDataToLocalStorage();
    return { deactivated: disabled.length, retained: state.disabledIntervalsActivities.length };
}

export function openIntervalsSyncModal() {
    document.getElementById('intervals-sync-modal').classList.remove('hidden');
    const status = document.getElementById('icu-sync-status');
    if (isGarminSyncConfigured() && status) {
        status.textContent = intervalsSyncPauseMessage();
        status.className = 'text-xs font-semibold text-amber-400';
    }
    if (getUserLocalSetting('icu_athlete_id')) {
        document.getElementById('icu-athlete-id').value = getUserLocalSetting('icu_athlete_id') || '';
    }
    if (getUserLocalSetting('icu_api_key')) {
        document.getElementById('icu-api-key').value = getUserLocalSetting('icu_api_key') || '';
    }
}

export function closeIntervalsSyncModal() {
    document.getElementById('intervals-sync-modal')?.classList.add('hidden');
    if (intervalsSyncInProgress) showIntervalsSyncToast('Intervals.icu-Synchronisierung läuft im Hintergrund weiter …');
}

export async function performIntervalsLiveSync() {
    const statusEl = document.getElementById('icu-sync-status');
    if (isGarminSyncConfigured()) {
        if (statusEl) {
            statusEl.textContent = intervalsSyncPauseMessage();
            statusEl.className = 'text-xs font-semibold text-amber-400';
        }
        return;
    }
    const athleteId = document.getElementById('icu-athlete-id').value.trim();
    const apiKey = document.getElementById('icu-api-key').value.trim();
    const loadActivities = document.getElementById('icu-load-activities')?.checked === true;
    const loadStreams = document.getElementById('icu-load-streams')?.checked === true;
    const loadWellness = document.getElementById('icu-load-wellness')?.checked === true;
    const rangeMode = document.getElementById('icu-date-range')?.value || 'all';
    const today = new Date().toISOString().slice(0, 10);
    const presetDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const customFrom = document.getElementById('icu-date-from')?.value || '';
    const customTo = document.getElementById('icu-date-to')?.value || today;
    const oldestDate = rangeMode === 'custom' ? customFrom
        : rangeMode === 'all' ? '2000-01-01'
        : new Date(Date.now() - presetDays[rangeMode] * 86400000).toISOString().slice(0, 10);
    const newestDate = rangeMode === 'custom' ? customTo : today;
    if (rangeMode === 'custom' && (!customFrom || customFrom > customTo)) {
        statusEl.textContent = '❌ Bitte einen gültigen Zeitraum mit Start- und Enddatum auswählen.';
        statusEl.className = 'text-xs font-semibold text-rose-400';
        return;
    }
    if (!loadStreams) document.getElementById('icu-stream-diagnostics')?.classList.add('hidden');
    if (!loadWellness) document.getElementById('icu-wellness-diagnostics')?.classList.add('hidden');

    if (!loadActivities && !loadStreams && !loadWellness) {
        statusEl.textContent = '❌ Bitte wähle mindestens einen Datenbereich aus.';
        statusEl.className = 'text-xs font-semibold text-rose-400';
        return;
    }

    if (!athleteId || !apiKey) {
        statusEl.textContent = '❌ Bitte Athlete ID und API-Key eingeben!';
        statusEl.className = 'text-xs font-semibold text-rose-400';
        return;
    }

    setUserLocalSetting('icu_athlete_id', athleteId);
    setUserLocalSetting('icu_api_key', apiKey);

    intervalsSyncInProgress = true;
    updateIntervalsSyncStatus(statusEl, '🔄 Verbinde mit Intervals.icu und lade Daten...');
    showIntervalsSyncToast('Intervals.icu-Synchronisierung gestartet …');

    const authHeader = 'Basic ' + btoa('API_KEY:' + apiKey);

    try {
        let remoteActivities = [];
        if (loadActivities || loadStreams) {
            const actResponse = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/activities?oldest=${encodeURIComponent(oldestDate)}&newest=${encodeURIComponent(newestDate)}`, {
                headers: { 'Authorization': authHeader }
            });
            if (!actResponse.ok) throw new Error(`Fehler beim Abrufen der Aktivitäten (${actResponse.status})`);
            remoteActivities = (await actResponse.json()).filter(item => {
                const d = (item.start_date_local || item.start_date || '').slice(0, 10);
                return d && d >= oldestDate && d <= newestDate;
            });
        }

        let addedCount = 0;
        let streamCount = 0;
        let crossSourceMatched = 0;
        let crossSourceAmbiguous = 0;
        if (loadActivities) remoteActivities.forEach(item => {
            const dateStr = (item.start_date_local || item.start_date || '').slice(0, 10);
            if (!dateStr) return;

            const actId = String(item.id);
            const name = item.name || 'Intervals Aktivität';
            const type = inferSport(name, item.type || '');
            const durSec = Number(item.moving_time ?? item.elapsed_time ?? 0);
            const duration = Number.isFinite(durSec) && durSec > 0 ? Math.round(durSec / 60) : null;
            const load = item.icu_training_load || item.training_load || null;
            const dist = item.distance ? Number(item.distance) / 1000 : null;
            const hr = item.average_heartrate || null;
            const candidate = {
                id: actId, sourceId: actId, source: 'intervals',
                startTime: item.start_date || item.start_date_local || null,
                date: dateStr, name, type,
                tss: Number.isFinite(Number(load)) ? Number(load) : null,
                duration, distance: dist, hr: hr ? Math.round(hr) : null,
                maxHr: item.max_heartrate ? Math.round(item.max_heartrate) : null,
                category: inferCategory(name, item.type || ''), telemetry: null
            };

            const exact = state.rawActivities.find(a =>
                String(a.id) === actId || (a.sourceId != null && String(a.sourceId) === actId)
            );
            const crossMatches = state.rawActivities.filter(a =>
                isGarminActivity(a) && crossSourceActivityMatch(candidate, a)
            );

            if (crossMatches.length === 1) {
                const canonical = crossMatches[0];
                mergeActivityWithoutOverwrite(canonical, exact || candidate);
                if (exact && exact !== canonical) {
                    mergeActivityWithoutOverwrite(canonical, exact);
                    state.rawActivities = state.rawActivities.filter(a => a !== exact);
                }
                canonical.sourceRefs = { ...(canonical.sourceRefs || {}), intervalsActivityId: actId };
                crossSourceMatched++;
            } else if (crossMatches.length > 1) {
                crossSourceAmbiguous++;
                if (!exact) {
                    // Mehrdeutige Zuordnung: keinen weiteren Datensatz erzeugen.
                    return;
                }
            } else if (exact) {
                if (duration != null && exact.duration == null) exact.duration = duration;
                exact.source = exact.source || 'intervals';
            } else {
                state.rawActivities.push(candidate);
                addedCount++;
            }
        });

        // Bereits sichtbare Garmin-/Intervals-Doppelanlagen konservativ zusammenführen.
        const cleanedCrossSourceDuplicates = consolidateVisibleCrossSourceDuplicates();
        const remainingNearTimeCrossSourcePairs = countNearTimeCrossSourcePairs(state.rawActivities);

        // Herzfrequenz-Zeitreihen für den gesamten verfügbaren Importzeitraum prüfen.
        // Ältere Zeitreihen werden nachgeladen, vorhandene Zeitreihen bleiben unangetastet.
        const streamCutoff = '2000-01-01';
        const streamDiagnostics = { eligible: 0, attempted: 0, imported: 0, missing: 0, failed: 0, garminCandidates: 0, garminUnique: 0, ambiguous: 0, exactMatches: 0, unmatched: 0, alreadyHave: 0, consolidatedDuplicates: cleanedCrossSourceDuplicates, remainingNearTimePairs: remainingNearTimeCrossSourcePairs };
        if (loadStreams) for (const item of remoteActivities) {
            const dateStr = (item.start_date_local || item.start_date || '').slice(0, 10);
            if (!dateStr || dateStr < streamCutoff) continue;
            const streamDurationSeconds = Number(item.moving_time ?? item.elapsed_time ?? 0);
            const streamCandidate = {
                startTime: item.start_date || item.start_date_local || null,
                type: inferSport(item.name || 'Intervals Aktivität', item.type || ''),
                duration: Number.isFinite(streamDurationSeconds) && streamDurationSeconds > 0
                    ? Math.round(streamDurationSeconds / 60) : null,
                distance: Number(item.distance) > 0 ? Number(item.distance) / 1000 : null
            };
            const garminMatches = state.rawActivities.filter(a =>
                isGarminActivity(a) && crossSourceActivityMatch(a, streamCandidate)
            );
            if (garminMatches.length) streamDiagnostics.garminCandidates++;
            let activity = garminMatches.length === 1 ? garminMatches[0] : null;
            if (garminMatches.length === 1) {
                streamDiagnostics.garminUnique++;
                activity.sourceRefs = { ...(activity.sourceRefs || {}), intervalsActivityId: String(item.id) };
            } else if (garminMatches.length > 1) {
                streamDiagnostics.ambiguous++;
            } else {
                activity = state.rawActivities.find(a =>
                    String(a.id) === String(item.id) ||
                    (a.sourceId != null && String(a.sourceId) === String(item.id)) ||
                    (a.sourceRefs?.intervalsActivityId != null &&
                        String(a.sourceRefs.intervalsActivityId) === String(item.id))
                );
                if (activity) streamDiagnostics.exactMatches++;
            }
            if (!activity) {
                streamDiagnostics.unmatched++;
                continue;
            }
            streamDiagnostics.eligible++;
            if (Array.isArray(activity.telemetry?.hr) && activity.telemetry.hr.filter(v => Number.isFinite(Number(v))).length >= 2) {
                streamDiagnostics.alreadyHave++;
                continue;
            }
            streamDiagnostics.attempted++;
            if (streamDiagnostics.attempted % 10 === 0) {
                updateIntervalsSyncStatus(statusEl, `🔄 Lade Herzfrequenz-Zeitreihen: ${streamDiagnostics.attempted} von ${streamDiagnostics.eligible} geprüft...`);
            }
            try {
                const streamResponse = await fetch(`https://intervals.icu/api/v1/activity/${encodeURIComponent(String(item.id))}/streams.json?types=time,heartrate,fixed_heartrate`, {
                    headers: { 'Authorization': authHeader }
                });
                if (!streamResponse.ok) {
                    if (streamResponse.status === 404 || streamResponse.status === 204) streamDiagnostics.missing++;
                    else streamDiagnostics.failed++;
                    continue;
                }
                const streamList = await streamResponse.json();
                const timeStream = streamList.find(s => ['time','elapsed_time'].includes(String(s.type).toLowerCase()));
                const hrStream = streamList.find(s => ['heartrate','fixed_heartrate','heart_rate'].includes(String(s.type).toLowerCase()));
                const rawHr = hrStream?.data;
                if (!Array.isArray(rawHr)) {
                    streamDiagnostics.missing++;
                    continue;
                }
                const rawTime = Array.isArray(timeStream?.data) ? timeStream.data : null;
                const hr = [];
                const time = [];
                rawHr.forEach((value, index) => {
                    const bpm = Number(value);
                    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250) return;
                    hr.push(bpm);
                    if (rawTime && Number.isFinite(Number(rawTime[index]))) time.push(Number(rawTime[index]));
                });
                if (hr.length < 2) {
                    streamDiagnostics.missing++;
                    continue;
                }
                activity.telemetry = {
                    hr,
                    time: time.length === hr.length ? time : null
                };
                streamDiagnostics.imported++;
                streamCount++;
            } catch (streamError) {
                streamDiagnostics.failed++;
                console.warn('HF-Zeitreihe konnte nicht geladen werden:', item.id, streamError);
            }
        }
        if (loadStreams) renderHeartRateStreamDiagnostics(streamDiagnostics, oldestDate, remoteActivities.length, state.rawActivities);

        let wellnessData = [];
        if (loadWellness) {
            const wellnessResponse = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/wellness?oldest=${encodeURIComponent(oldestDate)}&newest=${encodeURIComponent(newestDate)}`, {
                headers: { 'Authorization': authHeader }
            });
            if (!wellnessResponse.ok) throw new Error(`Fehler beim Abrufen der Wellness-Daten (${wellnessResponse.status})`);
            wellnessData = (await wellnessResponse.json()).filter(item => {
                const d = String(item.id || item.date || '').slice(0, 10);
                return d && d >= oldestDate && d <= newestDate;
            });
        }
        const diagnosticFields = [
            ['hrv', 'HRV (RMSSD)'],
            ['hrvSDNN', 'HRV (SDNN)'],
            ['restingHR', 'Ruhepuls'],
            ['avgSleepingHR', 'Schlafpuls'],
            ['sleepSecs', 'Schlafdauer'],
            ['sleepScore', 'Schlafscore'],
            ['sleepQuality', 'Schlafqualität'],
            ['stress', 'Subjektiver Stress'],
            ['baevskySI', 'Physiologischer Stressindex (Baevsky)'],
            ['fatigue', 'Müdigkeit'],
            ['soreness', 'Muskelbeschwerden'],
            ['mood', 'Stimmung'],
            ['motivation', 'Motivation'],
            ['respiration', 'Atemfrequenz'],
            ['vo2max', 'VO₂max'],
            ['weight', 'Gewicht']
        ];
        const diagnosticCounts = Object.fromEntries(diagnosticFields.map(([key]) => [key, 0]));
        const wellnessDates = [];

        wellnessData.forEach(w => {
            if (!w || !w.id) return;
            const dStr = String(w.id).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) wellnessDates.push(dStr);

            diagnosticFields.forEach(([key]) => {
                const value = w[key];
                if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) {
                    diagnosticCounts[key]++;
                }
            });

            const existing = state.dailyCheckins[dStr] || {};
            const incoming = {};
            const sleepDuration = Number(w.sleepSecs);
            const weight = Number(w.weight);
            const rhr = Number(w.restingHR);
            const hrv = Number(w.hrv);
            const sleepScore = Number(w.sleepScore);
            if (Number.isFinite(sleepDuration) && sleepDuration > 0) incoming.sleepDuration = Number((sleepDuration / 3600).toFixed(1));
            if (Number.isFinite(weight) && weight > 0) incoming.weight = weight;
            if (Number.isFinite(rhr) && rhr > 0) incoming.rhr = rhr;
            if (Number.isFinite(hrv) && hrv > 0) {
                incoming.hrv = hrv;
                incoming.measurementSources = {
                    ...(existing.measurementSources || {}),
                    hrv: { source: 'intervals', metric: 'rmssd', unit: 'ms' }
                };
            }
            if (Number.isFinite(sleepScore) && sleepScore >= 0 && sleepScore <= 100) incoming.sleepScore = sleepScore;
            const respiration = Number(w.respiration);
            if (Number.isFinite(respiration) && respiration >= 4 && respiration <= 60) incoming.respiration = respiration;
            ['sleepQuality','fatigue','soreness','stress','motivation'].forEach(key => {
                const value = Number(w[key]);
                if (existing[key] == null && Number.isFinite(value) && value >= 1 && value <= 5) incoming[key] = value;
            });
            // API-Felder ohne gültigen Wert überschreiben keine vorhandenen Angaben.
            state.dailyCheckins[dStr] = { ...existing, ...incoming };
        });

        if (loadWellness) renderWellnessDiagnostics(diagnosticFields, diagnosticCounts, wellnessDates, wellnessData.length);

        saveDataToLocalStorage();
        refreshAll();

        const completed = [];
        if (loadActivities) completed.push(`${addedCount} neue Aktivitäten`);
        if (loadStreams) completed.push(`${streamCount} HF-Zeitreihen synchronisiert`);
        if (loadWellness) completed.push(`${wellnessData.length} Wellness-Tagesdatensätze geprüft`);
        intervalsSyncInProgress = false;
        updateIntervalsSyncStatus(statusEl, `✅ Erfolgreich! ${completed.join(' · ')}.`, 'text-xs font-semibold text-emerald-400');
        if (intervalsSyncToast) {
            const message = intervalsSyncToast.querySelector('[data-sync-message]');
            if (message) message.textContent = `✅ Synchronisierung abgeschlossen: ${completed.join(' · ')}.`;
            intervalsSyncToast.dataset.state = 'finished';
        }

        // Das Modal bleibt offen, damit Diagnosen gelesen werden können; bei geschlossenem Modal bleibt der Status sichtbar.

    } catch (err) {
        console.error(err);
        intervalsSyncInProgress = false;
        updateIntervalsSyncStatus(statusEl, `❌ Fehler: ${err.message}`, 'text-xs font-semibold text-rose-400');
        if (intervalsSyncToast) intervalsSyncToast.dataset.state = 'finished';
    }
}

function renderHeartRateStreamDiagnostics(stats, cutoff, remoteCount, activities) {
    const panel = document.getElementById('icu-stream-diagnostics');
    if (!panel) return;
    const withStreams = activities.filter(a => Array.isArray(a.telemetry?.hr) && a.telemetry.hr.filter(v => Number.isFinite(Number(v))).length >= 2);
    const withoutStreams = activities.filter(a => !Array.isArray(a.telemetry?.hr) || a.telemetry.hr.filter(v => Number.isFinite(Number(v))).length < 2);
    const latest = activities.filter(a => a.date && a.date >= cutoff);
    panel.innerHTML = `
        <div class="text-xs font-semibold text-white mb-1">Herzfrequenz-Zeitreihen · Datenprüfung</div>
        <div class="grid grid-cols-2 gap-2 text-xs mb-2">
            <div class="rounded-lg bg-slate-900 p-2"><span class="text-slate-400">Aktivitäten gesamt</span><div class="font-bold text-white">${activities.length}</div></div>
            <div class="rounded-lg bg-slate-900 p-2"><span class="text-slate-400">Mit HF-Zeitreihe</span><div class="font-bold text-emerald-400">${withStreams.length}</div></div>
            <div class="rounded-lg bg-slate-900 p-2"><span class="text-slate-400">Ohne HF-Zeitreihe</span><div class="font-bold text-amber-300">${withoutStreams.length}</div></div>
            <div class="rounded-lg bg-slate-900 p-2"><span class="text-slate-400">Letzte 90 Tage</span><div class="font-bold text-white">${latest.length}</div></div>
        </div>
        <div class="text-[10px] text-slate-400 space-y-1">
            <div>Importzeitraum ab ${cutoff} · ${remoteCount} Aktivitäten von Intervals.icu erhalten</div>
            <div>Zuordnung: ${stats.garminUnique} eindeutig über Garmin · ${stats.exactMatches} über Intervals-ID · ${stats.ambiguous} mehrdeutig · ${stats.unmatched} ohne Zuordnung</div>
            <div>Duplikatprüfung: ${stats.consolidatedDuplicates} beim Import zusammengeführt · ${stats.remainingNearTimePairs} zeitnahe Garmin/Intervals-Paare noch vorhanden (Prüfkandidaten)</div>
            <div>${stats.alreadyHave} zugeordnete Aktivitäten hatten bereits eine HF-Zeitreihe.</div>
            <div>${stats.attempted} Stream-Abfragen · ${stats.imported} neu übernommen · ${stats.missing} ohne verfügbare HF-Zeitreihe · ${stats.failed} Abruffehler</div>
            <div>Aktivitäten mit Zeitreihe werden gezählt, wenn mindestens zwei gültige HF-Messwerte vorliegen. Ältere Zeitreihen bleiben erhalten.</div>
        </div>`;
    panel.classList.remove('hidden');
}

function renderWellnessDiagnostics(fields, counts, dates, totalRecords) {
    const panel = document.getElementById('icu-wellness-diagnostics');
    if (!panel) return;

    const validDates = dates.filter(Boolean).sort();
    const period = validDates.length
        ? `${validDates[0]} bis ${validDates[validDates.length - 1]}`
        : 'Kein Datumsbereich erkannt';

    const rows = fields.map(([key, label]) => {
        const count = counts[key] || 0;
        return `<div class="flex justify-between gap-3 border-b border-slate-800 py-1.5"><span class="text-slate-300">${label}</span><strong class="${count > 0 ? 'text-emerald-400' : 'text-slate-500'}">${count} / ${totalRecords}</strong></div>`;
    }).join('');

    panel.innerHTML = `
        <div class="text-xs font-semibold text-white mb-1">Wellness-Datenprüfung</div>
        <div class="text-[10px] text-slate-400 mb-2">${totalRecords} Tagesdatensätze · ${period}</div>
        <div class="max-h-56 overflow-y-auto pr-1">${rows}</div>
        <p class="text-[10px] text-slate-500 mt-2">Angezeigt wird nur die Anzahl vorhandener Werte, nicht deren Inhalt. Noch nicht importierte Felder werden zunächst nur geprüft.</p>
    `;
    panel.classList.remove('hidden');
}


const IMPORT_HISTORY_KEY = 'activity_import_history';
const MAX_IMPORT_HISTORY = 30;

function escapeImportHistoryText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
}

export function renderImportHistory() {
    const container = document.getElementById('import-history-list');
    if (!container) return;
    let history = [];
    try {
        const stored = getUserLocalSetting(IMPORT_HISTORY_KEY);
        history = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(history)) history = [];
    } catch { history = []; }
    if (!history.length) {
        container.innerHTML = '<p class="text-xs text-slate-500">Noch keine manuellen Dateiimporte vorhanden.</p>';
        return;
    }
    container.innerHTML = history.map(entry => {
        const date = entry.importedAt ? new Date(entry.importedAt).toLocaleString('de-DE') : 'Zeitpunkt unbekannt';
        const period = entry.dateFrom && entry.dateTo
            ? (entry.dateFrom === entry.dateTo ? entry.dateFrom : entry.dateFrom + ' – ' + entry.dateTo)
            : 'Zeitraum nicht verfügbar';
        const files = (entry.files || []).map(escapeImportHistoryText).join(', ');
        const errors = (entry.errors || []).map(escapeImportHistoryText).join('<br>');
        return `<article class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div class="flex flex-wrap justify-between gap-2"><span class="text-xs font-semibold text-slate-200">${escapeImportHistoryText(date)}</span><span class="text-[10px] text-slate-500">${escapeImportHistoryText(period)}</span></div>
            <p class="text-[11px] text-slate-400 break-words">${files}</p>
            <p class="text-xs text-slate-300"><span class="text-emerald-400">${Number(entry.added)||0} neu</span> · <span class="text-amber-400">${Number(entry.duplicates)||0} Duplikate</span>${entry.failed ? ' · <span class="text-rose-400">' + Number(entry.failed) + ' Fehler</span>' : ''}</p>
            ${errors ? '<p class="text-[10px] text-rose-300">' + errors + '</p>' : ''}
        </article>`;
    }).join('');
}

function saveImportHistory(entry) {
    try {
        const stored = getUserLocalSetting(IMPORT_HISTORY_KEY);
        const history = stored ? JSON.parse(stored) : [];
        const next = [entry, ...(Array.isArray(history) ? history : [])].slice(0, MAX_IMPORT_HISTORY);
        setUserLocalSetting(IMPORT_HISTORY_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn('Importhistorie konnte nicht gespeichert werden:', error);
    }
}

function haversineDistanceKm(a, b) {
    const toRad = degrees => degrees * Math.PI / 180;
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const dLat = lat2 - lat1, dLon = toRad(b.lon - a.lon);
    const value = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function parseGpxActivity(xmlText, fileName) {
    if (typeof DOMParser === 'undefined') throw new Error('GPX kann in dieser Umgebung nicht gelesen werden.');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Die GPX-Datei enthält kein gültiges XML.');
    const points = Array.from(xml.getElementsByTagNameNS('*', 'trkpt')).map(point => {
        const lat = Number(point.getAttribute('lat'));
        const lon = Number(point.getAttribute('lon'));
        const timeNode = point.getElementsByTagNameNS('*', 'time')[0];
        const time = timeNode ? new Date(timeNode.textContent.trim()) : null;
        const hrNode = Array.from(point.getElementsByTagName('*')).find(node => node.localName?.toLowerCase() === 'hr');
        const hr = hrNode ? Number(hrNode.textContent) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !time || !Number.isFinite(time.getTime())) return null;
        return { lat, lon, time, hr: Number.isFinite(hr) && hr > 0 ? hr : null };
    }).filter(Boolean).sort((a, b) => a.time - b.time);

    if (points.length < 2) throw new Error('Die GPX-Datei enthält weniger als zwei gültige Trackpunkte mit Zeitangabe.');
    let distanceKm = 0;
    for (let i = 1; i < points.length; i++) distanceKm += haversineDistanceKm(points[i - 1], points[i]);
    const first = points[0], last = points[points.length - 1];
    const durationSeconds = (last.time - first.time) / 1000;
    if (durationSeconds <= 0) throw new Error('Die Zeitangaben der GPX-Trackpunkte sind nicht plausibel.');
    const heartRates = points.map(point => point.hr).filter(value => value != null);
    const names = Array.from(xml.getElementsByTagNameNS('*', 'name'));
    const name = String(names[0]?.textContent || fileName.replace(/\.gpx$/i, '')).trim() || fileName;
    const labels = points.map(point => point.time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    const telemetry = heartRates.length
        ? { labels: points.filter(point => point.hr != null).map(point => point.time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })), hr: heartRates }
        : null;
    return {
        id: `gpx-${fileName}-${first.time.getTime()}`,
        sourceId: null,
        startTime: first.time.toISOString(),
        date: toLocalDateString(first.time),
        name,
        type: inferSport(name, 'GPX'),
        tss: null,
        duration: Math.round(durationSeconds / 60),
        distance: Number(distanceKm.toFixed(3)),
        hr: heartRates.length ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length) : null,
        maxHr: heartRates.length ? Math.max(...heartRates) : null,
        category: inferCategory(name, 'GPX'),
        telemetry
    };
}

export function initializeImportDropZone() {
    const zone = document.getElementById('import-drop-zone');
    const input = document.getElementById('file-input');
    if (!zone || !input || zone.dataset.dropReady === 'true') return;
    zone.dataset.dropReady = 'true';
    const setActive = active => zone.classList.toggle('border-cyan-400', active);
    zone.addEventListener('dragenter', event => { event.preventDefault(); setActive(true); });
    zone.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; setActive(true); });
    zone.addEventListener('dragleave', event => {
        if (!zone.contains(event.relatedTarget)) setActive(false);
    });
    zone.addEventListener('drop', event => {
        event.preventDefault();
        setActive(false);
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length) handleMultipleFileSelect({ target: { files, value: '' } });
    });
    zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });
}

export async function handleMultipleFileSelect(evt) {
    const files = Array.from(evt.target.files || []);
    if (!files.length) return;
    const statusEl = document.getElementById('upload-status');
    statusEl.textContent = `${files.length} Datei(en) werden eingelesen …`;
    const needsCsv = files.some(file => file.name.split('.').pop().toLowerCase() === 'csv');
    const needsFit = files.some(file => file.name.split('.').pop().toLowerCase() === 'fit');
    try {
        await Promise.all([
            ...(needsCsv ? [ensureImportLibrary('Papa', 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js')] : []),
            ...(needsFit ? [ensureImportLibrary('FitParser', 'https://cdn.jsdelivr.net/npm/fit-file-parser@1.19.0/dist/fit-file-parser.min.js')] : [])
        ]);
    } catch (error) {
        statusEl.textContent = 'Import konnte nicht gestartet werden: ' + (error.message || 'Bibliothek nicht verfügbar.');
        return;
    }
    let added = 0, duplicates = 0, failed = [], importedDates = [];

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        try {
            let parsed = [];
            if (ext === 'csv') {
                const result = await new Promise((resolve,reject)=>Papa.parse(file,{header:true,dynamicTyping:true,skipEmptyLines:true,complete:resolve,error:reject}));
                parsed = result.data.map((row,i)=>{
                    const rawDate = row.start_date_local||row.start_date||row.date||row.start_time; if(!rawDate)return null;
                    const date = String(rawDate).slice(0,10);
                    const parsedStart = new Date(rawDate);
                    const startTime = Number.isFinite(parsedStart.getTime()) && String(rawDate).length > 10 ? parsedStart.toISOString() : null;
                    const durSec = Number(row.moving_time??row.elapsed_time??row.duration_seconds);
                    const duration = normalizeCsvDurationMinutes(durSec);
                    const loadRaw = row.icu_training_load??row.training_load??row.tss??row.hr_load;
                    const load = loadRaw==null||loadRaw===''?null:Number(loadRaw);
                    const name = String(row.name||row.activity_name||file.name.replace(/\.csv$/i,''));
                    const type = inferSport(name,row.type||row.sport_type);
                    return {id:String(row.id||row.activity_id||`${file.name}-${date}-${i}`),sourceId:row.id||row.activity_id||null,startTime,date,name,type,tss:Number.isFinite(load)?load:null,duration,distance:Number(row.distance)>0?Number(row.distance)/1000:null,hr:Number(row.average_heartrate||row.avg_hr)||null,maxHr:Number(row.max_heartrate||row.max_hr)||null,category:inferCategory(name,row.type||''),telemetry:null};
                }).filter(Boolean);
            } else if (ext === 'gpx') {
                parsed = [parseGpxActivity(await file.text(), file.name)];
            } else if (ext === 'fit') {
                const buffer = await file.arrayBuffer();
                if (typeof FitParser === 'undefined') throw new Error('FIT-Parser nicht geladen.');
                const fitParser = new FitParser({force:true, speedUnit:'km/h', lengthUnit:'km', elapsedRecordField:true, mode:'cascade'});
                const fit = await new Promise((resolve,reject)=>fitParser.parse(buffer,(err,data)=>err?reject(err):resolve(data)));
                const sessions = fit.sessions || [];
                parsed = sessions.map((session,i)=>{
                    const start = session.start_time||session.timestamp; if(!start)return null;
                    const date = toLocalDateString(new Date(start));
                    const sportName = String(session.sport||fit.activity?.sport||'');
                    const name = file.name.replace(/\.fit$/i,'');
                    const records = fit.records || [];
                    const allLaps = Array.isArray(fit.laps) ? fit.laps : [];
                    const sessionStartMs = new Date(start).getTime();
                    const explicitEnd = session.end_time ? new Date(session.end_time).getTime() : null;
                    const nextSessionStart = sessions.slice(i + 1).map(next => next.start_time || next.timestamp).find(Boolean);
                    const sessionEndMs = explicitEnd || (nextSessionStart ? new Date(nextSessionStart).getTime() : null);
                    const sessionRecords = records.filter(r => {
                        if (!r.timestamp) return false;
                        const timestamp = new Date(r.timestamp).getTime();
                        return timestamp >= sessionStartMs && (sessionEndMs == null || timestamp <= sessionEndMs);
                    });
                    const labels = sessionRecords.map(r=>new Date(r.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
                    const extractRecordSeries = (...keys) => {
                        const key = keys.find(candidate => sessionRecords.some(record =>
                            record[candidate] !== null && record[candidate] !== undefined && record[candidate] !== ''
                            && Number.isFinite(Number(record[candidate]))
                        ));
                        return key ? sessionRecords.map(record =>
                            record[key] === null || record[key] === undefined || record[key] === ''
                                || !Number.isFinite(Number(record[key])) ? null : Number(record[key])
                        ) : null;
                    };
                    const hrs = extractRecordSeries('heart_rate');
                    const speeds = extractRecordSeries('enhanced_speed', 'speed');
                    const powers = extractRecordSeries('power');
                    const cadences = extractRecordSeries('cadence');
                    const altitudes = extractRecordSeries('enhanced_altitude', 'altitude');
                    const distances = extractRecordSeries('distance');
                    const latitudes = extractRecordSeries('position_lat', 'latitude');
                    const longitudes = extractRecordSeries('position_long', 'longitude');
                    const normalizeFitCoordinate = (value, limit) => {
                        if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
                        let number = Number(value);
                        if (Math.abs(number) > limit) number = number * 180 / 2147483648;
                        return Math.abs(number) <= limit ? number : null;
                    };
                    const gpsPairs = latitudes && longitudes && latitudes.length === longitudes.length
                        ? latitudes.reduce((count, value, index) => count + (normalizeFitCoordinate(value, 90) !== null && normalizeFitCoordinate(longitudes[index], 180) !== null ? 1 : 0), 0) : 0;
                    // Tatsächliche verstrichene Sekunden seit Sessionbeginn; dieselbe Record-Reihenfolge wie HR und Geschwindigkeit.
                    const times = sessionRecords.map(r => (new Date(r.timestamp).getTime() - sessionStartMs) / 1000);
                    const dist = session.total_distance!=null?Number(session.total_distance):null; // FitParser ist oben auf km konfiguriert.
                    const durationSec = Number(session.total_timer_time??session.total_elapsed_time);
                    const sessionLaps = allLaps.filter(lap => {
                        const lapStart = lap.start_time || lap.timestamp;
                        if (!lapStart) return sessions.length === 1;
                        const lapStartMs = new Date(lapStart).getTime();
                        return Number.isFinite(lapStartMs) && lapStartMs >= sessionStartMs
                            && (sessionEndMs == null || lapStartMs <= sessionEndMs);
                    }).map((lap, lapIndex) => {
                        const trigger = String(lap.lap_trigger || lap.trigger || '').toLowerCase();
                        const isManual = trigger.includes('manual');
                        const isAutomatic = ['time', 'distance', 'position', 'heart_rate', 'fitness_equipment'].some(value => trigger.includes(value));
                        const lapDistanceKm = lap.total_distance != null ? Number(lap.total_distance) : null;
                        const lapDuration = Number(lap.total_timer_time ?? lap.total_elapsed_time);
                        const lapStartSeconds = lapStart ? (new Date(lapStart).getTime() - sessionStartMs) / 1000 : null;
                        return {
                            name: isManual ? `Manuelle Runde ${lapIndex + 1}` : isAutomatic ? `Automatische Runde ${lapIndex + 1}` : `Runde ${lapIndex + 1}`,
                            trigger: trigger || null,
                            kind: isManual ? 'manual' : isAutomatic ? 'automatic' : 'unclassified',
                            duration: Number.isFinite(lapDuration) && lapDuration > 0 ? lapDuration : null,
                            durationUnit: 'seconds',
                            ...(Number.isFinite(lapStartSeconds) && Number.isFinite(lapDuration) && lapDuration > 0 ? { startTimeSeconds: lapStartSeconds, endTimeSeconds: lapStartSeconds + lapDuration } : {}),
                            distance: Number.isFinite(lapDistanceKm) && lapDistanceKm > 0 ? lapDistanceKm * 1000 : null,
                            avgHr: Number(lap.avg_heart_rate) || null,
                            maxHr: Number(lap.max_heart_rate) || null,
                            avgPower: Number(lap.avg_power) || null,
                            maxPower: Number(lap.max_power) || null,
                            avgCadence: Number(lap.avg_cadence) || null
                        };
                    });
                    return {id:`fit-${file.name}-${date}-${i}`,source:'fit',sources:['fit'],sourceId:null,startTime:new Date(start).toISOString(),date,name,type:inferSport(name,sportName),tss:Number.isFinite(Number(session.training_load))?Number(session.training_load):null,duration:durationSec>0?Math.round(durationSec/60):null,distance:dist,hr:Number(session.avg_heart_rate)||null,maxHr:Number(session.max_heart_rate)||null,category:inferCategory(name,sportName),laps:sessionLaps,telemetry:labels.length?{
                        labels,
                        ...(hrs && hrs.filter(value => value !== null).length >= 2 ? { hr: hrs } : {}),
                        ...(speeds && speeds.filter(value => value !== null).length >= 2 ? { speed: speeds } : {}),
                        ...(powers && powers.filter(value => value !== null).length >= 2 ? { power: powers } : {}),
                        ...(cadences && cadences.filter(value => value !== null).length >= 2 ? { cadence: cadences } : {}),
                        ...(altitudes && altitudes.filter(value => value !== null).length >= 2 ? { altitude: altitudes } : {}),
                        ...(distances && distances.filter(value => value !== null).length >= 2 ? { distance: distances } : {}),
                        ...(gpsPairs >= 2 ? { latitude: latitudes.map(value => normalizeFitCoordinate(value, 90)), longitude: longitudes.map(value => normalizeFitCoordinate(value, 180)) } : {}),
                        time: times.every(Number.isFinite) ? times : null
                    }:null};
                }).filter(Boolean);
            } else throw new Error('Format nicht unterstützt.');

            for(const act of parsed){
                const exists = isDuplicateImportedActivity(act, state.rawActivities);
                if(exists){duplicates++;continue;}
                state.rawActivities.push(act);added++; if (act.date) importedDates.push(act.date);
            }
        } catch(err){ failed.push(`${file.name}: ${err.message}`); }
    }
    saveDataToLocalStorage(); refreshAll();
    const sortedDates = importedDates.slice().sort();
    saveImportHistory({
        importedAt: new Date().toISOString(),
        files: files.map(file => file.name),
        added,
        duplicates,
        failed: failed.length,
        errors: failed,
        dateFrom: sortedDates[0] || null,
        dateTo: sortedDates[sortedDates.length - 1] || null
    });
    renderImportHistory();
    statusEl.textContent=`Import: ${added} neu, ${duplicates} Duplikate. ${failed.length?failed.join(' | '):'Erfolgreich.'}`;
    evt.target.value='';
}
