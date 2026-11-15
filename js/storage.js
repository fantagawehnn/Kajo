/* ============================================================
 * storage.js – Lokale Datenspeicherung (localStorage) und Backup
 * localStorage-Schlüssel (unverändert gegenüber dem Original):
 *   endurance_activities, endurance_planned, endurance_checkins,
 *   endurance_health, endurance_races, endurance_strength
 *   (+ icu_athlete_id, icu_api_key in import.js)
 * ============================================================ */

import { state } from './state.js';
import { toLocalDateString } from './utils.js';
import { createUserStorage } from './user-storage.js?v=3';

let activeUserStorage = null;
let activeUserId = null;
let indexedDbWriteQueue = Promise.resolve();

/**
 * Legacy-Daten werden hier ausdrücklich nicht mehr automatisch migriert.
 * Die bisherige globale Ablage bleibt unangetastet, bis sie auf dem
 * Ursprungsgerät gesichert und eindeutig einem Account zugeordnet wurde.
 */
export function initializeIndexedDBPersistence() {
    return Promise.resolve(false);
}

const COLLECTION_KEYS = {
    activities: 'rawActivities',
    disabledIntervals: 'disabledIntervalsActivities',
    garminTelemetry: 'garminTelemetryStore',
    planned: 'plannedActivities',
    checkins: 'dailyCheckins',
    health: 'healthLogs',
    races: 'races',
    strength: 'strengthLogs',
    strengthPBs: 'strengthPBs',
    supplements: 'supplements',
    profile: 'profile',
    settings: 'settings'
};

function getGarminActivityStorageId(activity) {
    const rawId = activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId ?? activity?.id;
    const id = String(rawId ?? '').replace(/^garmin-/, '');
    return /^\d+$/.test(id) ? id : null;
}

/**
 * Große Garmin-Rohzeitreihen werden separat gespeichert, damit die
 * Aktivitäten-Sammlung und ihr localStorage-Fallback kompakt bleiben.
 */
function splitGarminTelemetry(activities) {
    const telemetryStore = {};
    const compactActivities = (Array.isArray(activities) ? activities : []).map(activity => {
        const telemetry = activity?.garminTelemetry;
        const metricSeries = telemetry?.metricSeries && typeof telemetry.metricSeries === 'object'
            ? telemetry.metricSeries : null;
        const id = getGarminActivityStorageId(activity);
        if (!id || !metricSeries || !Object.keys(metricSeries).length) return activity;

        telemetryStore[id] = {
            metricSeries,
            metricSeriesTime: Array.isArray(telemetry.metricSeriesTime) ? telemetry.metricSeriesTime : null
        };
        const compactTelemetry = { ...telemetry };
        delete compactTelemetry.metricSeries;
        delete compactTelemetry.metricSeriesTime;
        return { ...activity, garminTelemetry: compactTelemetry };
    });
    return { activities: compactActivities, telemetryStore };
}

function restoreGarminTelemetry(activities, telemetryStore) {
    if (!Array.isArray(activities)) return [];
    const stored = telemetryStore && typeof telemetryStore === 'object' ? telemetryStore : {};
    return activities.map(activity => {
        const id = getGarminActivityStorageId(activity);
        const record = id ? stored[id] : null;
        if (!record || typeof record !== 'object') return activity;
        const current = activity?.garminTelemetry && typeof activity.garminTelemetry === 'object'
            ? activity.garminTelemetry : {};
        const currentSeries = current.metricSeries && typeof current.metricSeries === 'object'
            ? current.metricSeries : {};
        return {
            ...activity,
            garminTelemetry: {
                ...current,
                metricSeries: { ...(record.metricSeries || {}), ...currentSeries },
                metricSeriesTime: current.metricSeriesTime || record.metricSeriesTime || undefined
            }
        };
    });
}

/**
 * Liefert alle derzeit vorhandenen Garmin-Telemetriedatensätze aus dem
 * aktiven Kontozustand einschließlich der bisher separat gespeicherten Reihen.
 * Wird für den einmaligen, verlustfreien Cloud-Transfer verwendet.
 */
export function getGarminTelemetryRecordsForCloud() {
    const records = new Map();
    for (const activity of Array.isArray(state.rawActivities) ? state.rawActivities : []) {
        const id = getGarminActivityStorageId(activity);
        if (!id) continue;
        const current = activity?.garminTelemetry && typeof activity.garminTelemetry === 'object'
            ? activity.garminTelemetry : {};
        const separated = state.garminTelemetryStore?.[id] || {};
        const telemetry = {
            ...current,
            ...(Object.keys(separated).length ? {
                metricSeries: { ...(current.metricSeries || {}), ...(separated.metricSeries || {}) },
                metricSeriesTime: current.metricSeriesTime || separated.metricSeriesTime || undefined
            } : {})
        };
        if (Object.keys(telemetry).length) records.set(id, { garmin_activity_id: id, telemetry });
    }
    for (const [rawId, telemetry] of Object.entries(state.garminTelemetryStore || {})) {
        const id = String(rawId).replace(/^garmin-/, '');
        if (!/^\d+$/.test(id) || records.has(id) || !telemetry || typeof telemetry !== 'object') continue;
        if (Object.keys(telemetry).length) records.set(id, { garmin_activity_id: id, telemetry });
    }
    return Array.from(records.values());
}

/**
 * Ergänzt geladene Cloud-Telemetrie im Arbeitsspeicher. Cloud-Werte haben
 * Vorrang; vorhandene lokale Reihen bleiben erhalten, falls Cloud-Felder fehlen.
 */
export function mergeGarminTelemetryRecords(records) {
    const byId = new Map((Array.isArray(records) ? records : []).map(record => [
        String(record?.garmin_activity_id ?? ''),
        record?.telemetry && typeof record.telemetry === 'object' ? record.telemetry : {}
    ]));
    if (!byId.size) return 0;
    let merged = 0;
    state.rawActivities = (Array.isArray(state.rawActivities) ? state.rawActivities : []).map(activity => {
        const id = getGarminActivityStorageId(activity);
        const cloud = id ? byId.get(id) : null;
        if (!cloud || !Object.keys(cloud).length) return activity;
        const current = activity?.garminTelemetry && typeof activity.garminTelemetry === 'object'
            ? activity.garminTelemetry : {};
        merged += 1;
        return {
            ...activity,
            garminTelemetry: {
                ...current,
                ...cloud,
                metricSeries: { ...(current.metricSeries || {}), ...(cloud.metricSeries || {}) },
                metricSeriesTime: cloud.metricSeriesTime || current.metricSeriesTime || undefined
            }
        };
    });
    return merged;
}

function stripGarminTelemetryFromActivities(activities) {
    return (Array.isArray(activities) ? activities : []).map(activity => {
        if (!activity?.garminTelemetry) return activity;
        const compact = { ...activity };
        delete compact.garminTelemetry;
        return compact;
    });
}

function migrateDailyCheckinScale() {
    const version = Number(state.settings?.dailyCheckinScaleVersion || 1);
    if (version >= 2) return false;
    const convertFiveToTen = value => {
        const number = Number(value);
        return Number.isFinite(number) && number >= 1 && number <= 5
            ? Math.round(1 + (number - 1) * 9 / 4)
            : value;
    };
    const convertZeroToTen = value => {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 && number <= 5
            ? number * 2
            : value;
    };
    Object.values(state.dailyCheckins).forEach(checkin => {
        if (!checkin || typeof checkin !== 'object') return;
        ['sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress'].forEach(key => {
            if (checkin[key] != null) checkin[key] = convertFiveToTen(checkin[key]);
        });
        if (checkin.cycle && checkin.cycle.trainingImpact != null) {
            checkin.cycle.trainingImpact = convertZeroToTen(checkin.cycle.trainingImpact);
        }
    });
    state.settings = { ...(state.settings || {}), dailyCheckinScaleVersion: 2 };
    return true;
}

function defaultUserState() {
    state.rawActivities = [];
    state.disabledIntervalsActivities = [];
    state.garminTelemetryStore = {};
    state.plannedActivities = [];
    state.dailyCheckins = {};
    state.healthLogs = {};
    state.races = [];
    state.strengthLogs = [];
    state.strengthPBs = [];
    state.supplements = [];
    state.profile = {};
    state.settings = { sports: {}, categories: {}, heartRateZones: {} };
    state.dailyTimeline = [];
}

export function deactivateUserStorage() {
    activeUserStorage = null;
    activeUserId = null;
    defaultUserState();
}

export async function loadStateForUser(userId) {
    if (!userId) throw new Error('Keine gültige Benutzer-ID für das Laden der Daten.');
    const userStorage = createUserStorage(userId);
    activeUserStorage = userStorage;
    activeUserId = userId;

    const entries = Object.entries(COLLECTION_KEYS);
    const values = await Promise.all(entries.map(async ([collection, stateKey]) => [
        stateKey,
        await userStorage.getCollection(collection)
    ]));
    if (activeUserId !== userId) return null;
    const loaded = Object.fromEntries(values);

    state.garminTelemetryStore = loaded.garminTelemetryStore && typeof loaded.garminTelemetryStore === 'object'
        ? loaded.garminTelemetryStore : {};
    state.rawActivities = restoreGarminTelemetry(
        Array.isArray(loaded.rawActivities) ? loaded.rawActivities : [],
        state.garminTelemetryStore
    );
    state.disabledIntervalsActivities = Array.isArray(loaded.disabledIntervalsActivities) ? loaded.disabledIntervalsActivities : [];
    state.plannedActivities = Array.isArray(loaded.plannedActivities) ? loaded.plannedActivities : [];
    state.dailyCheckins = loaded.dailyCheckins && typeof loaded.dailyCheckins === 'object' ? loaded.dailyCheckins : {};
    state.healthLogs = loaded.healthLogs && typeof loaded.healthLogs === 'object' ? loaded.healthLogs : {};
    state.races = Array.isArray(loaded.races) ? loaded.races : [];
    state.strengthLogs = Array.isArray(loaded.strengthLogs) ? loaded.strengthLogs : [];
    state.strengthPBs = Array.isArray(loaded.strengthPBs) ? loaded.strengthPBs : [];
    state.supplements = Array.isArray(loaded.supplements) ? loaded.supplements : [];
    state.profile = loaded.profile && typeof loaded.profile === 'object' ? loaded.profile : {};
    state.settings = loaded.settings && typeof loaded.settings === 'object'
        ? loaded.settings : { sports: {}, categories: {}, heartRateZones: {} };

    Object.values(state.dailyCheckins).forEach(checkin => {
        if (!checkin || typeof checkin !== 'object') return;
        if (checkin.sleepDuration == null && Number(checkin.sleep) > 5) checkin.sleepDuration = Number(checkin.sleep);
        if (checkin.sleepQuality == null && Number(checkin.sleep) >= 1 && Number(checkin.sleep) < 5) checkin.sleepQuality = Number(checkin.sleep);
        if (checkin.sleepQuality == null && Number(checkin.sleep) === 5 && checkin.sleepDuration == null) checkin.sleepLegacyAmbiguous = true;
    });
    const checkinScaleMigrated = migrateDailyCheckinScale();
    if (checkinScaleMigrated) saveDataToLocalStorage();

    return activeUserId;
}

/** Alte globale Daten werden absichtlich nicht mehr beim App-Start eingelesen. */
export function loadStateFromStorage() {
    deactivateUserStorage();
}

export function getUserLocalSetting(key) {
    return activeUserStorage ? activeUserStorage.getItem(key) : null;
}

export function setUserLocalSetting(key, value) {
    if (!activeUserStorage) throw new Error('Bitte melde dich an, bevor du Kontoeinstellungen speicherst.');
    activeUserStorage.setItem(key, value);
}

export function getUserDataSnapshot(options = {}) {
    const activities = options.includeGarminTelemetry
        ? state.rawActivities
        : stripGarminTelemetryFromActivities(state.rawActivities);
    return {
        activities, disabledIntervals: state.disabledIntervalsActivities || [], planned: state.plannedActivities,
        checkins: state.dailyCheckins, health: state.healthLogs, races: state.races,
        strength: state.strengthLogs, strengthPBs: state.strengthPBs || [],
        supplements: state.supplements || [], profile: state.profile || {},
        settings: state.settings || { sports: {}, categories: {}, heartRateZones: {} }
    };
}

/**
 * Übernimmt einen vollständigen Cloud-Datenstand in den angemeldeten
 * Benutzerzustand und aktualisiert anschließend ausschließlich dessen lokalen Cache.
 * Unvollständige oder falsch typisierte Daten werden vor jeder Änderung abgelehnt.
 */
export function applyCloudDataSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('Der Cloud-Datenstand ist kein gültiges Objekt.');
    }

    const required = ['activities', 'planned', 'checkins', 'health', 'races', 'strength', 'strengthPBs', 'supplements', 'profile', 'settings'];
    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
            throw new Error('Der Cloud-Datenstand ist unvollständig: "' + key + '" fehlt. Der lokale Cache wurde nicht verändert.');
        }
    }

    if (snapshot.disabledIntervals != null && !Array.isArray(snapshot.disabledIntervals)) {
        throw new Error('Der Cloud-Datenstand enthält für "disabledIntervals" keine gültige Liste. Der lokale Cache wurde nicht verändert.');
    }
    for (const key of ['activities', 'planned', 'races', 'strength', 'strengthPBs', 'supplements']) {
        if (!Array.isArray(snapshot[key])) {
            throw new Error('Der Cloud-Datenstand enthält für "' + key + '" keine gültige Liste. Der lokale Cache wurde nicht verändert.');
        }
    }
    for (const key of ['checkins', 'health', 'profile', 'settings']) {
        if (!snapshot[key] || typeof snapshot[key] !== 'object' || Array.isArray(snapshot[key])) {
            throw new Error('Der Cloud-Datenstand enthält für "' + key + '" kein gültiges Objekt. Der lokale Cache wurde nicht verändert.');
        }
    }

    state.rawActivities = snapshot.activities;
    state.disabledIntervalsActivities = Array.isArray(snapshot.disabledIntervals) ? snapshot.disabledIntervals : [];
    state.garminTelemetryStore = {};
    state.plannedActivities = snapshot.planned;
    state.dailyCheckins = snapshot.checkins;
    state.healthLogs = snapshot.health;
    state.races = snapshot.races;
    state.strengthLogs = snapshot.strength;
    state.strengthPBs = snapshot.strengthPBs;
    state.supplements = snapshot.supplements;
    state.profile = snapshot.profile;
    state.settings = snapshot.settings;
    state.dailyTimeline = [];

    Object.values(state.dailyCheckins).forEach(checkin => {
        if (!checkin || typeof checkin !== 'object') return;
        if (checkin.sleepDuration == null && Number(checkin.sleep) > 5) checkin.sleepDuration = Number(checkin.sleep);
        if (checkin.sleepQuality == null && Number(checkin.sleep) >= 1 && Number(checkin.sleep) < 5) checkin.sleepQuality = Number(checkin.sleep);
        if (checkin.sleepQuality == null && Number(checkin.sleep) === 5 && checkin.sleepDuration == null) checkin.sleepLegacyAmbiguous = true;
    });
    migrateDailyCheckinScale();

    if (!saveDataToLocalStorage()) {
        throw new Error('Der Cloud-Datenstand wurde geladen, aber der lokale Cache konnte nicht aktualisiert werden.');
    }
    return true;
}


/** Speichert ausschließlich die Aktivitätssammlung des angemeldeten Nutzers. */
export function saveActivitiesToLocalStorage() {
    if (!activeUserStorage || !activeUserId) {
        console.warn('Aktivitätsspeicherung übersprungen: Es ist kein authentifizierter Benutzer-Speicher aktiv.');
        return false;
    }
    // Garmin-Rohtelemetrie bleibt ausschließlich im Arbeitsspeicher und in Supabase.
    const activities = stripGarminTelemetryFromActivities(state.rawActivities);
    state.garminTelemetryStore = {};
    activeUserStorage.setItem('activities', JSON.stringify(activities));
    const storageForThisSave = activeUserStorage;
    indexedDbWriteQueue = indexedDbWriteQueue
        .then(() => storageForThisSave.saveCollections({ activities }))
        .catch(error => console.error('Benutzerbezogene Aktivitätssicherung fehlgeschlagen:', error));
    window.dispatchEvent(new CustomEvent('endurance:data-saved', { detail: { userId: activeUserId, collection: 'activities' } }));
    return true;
}

export function saveDataToLocalStorage() {
    if (!activeUserStorage || !activeUserId) {
        console.warn('Speichern übersprungen: Es ist kein authentifizierter Benutzer-Speicher aktiv.');
        return false;
    }

    // Alle Garmin-Rohzeitreihen werden aus der dauerhaften lokalen Ablage ausgeschlossen.
    const snapshot = getUserDataSnapshot();
    state.garminTelemetryStore = {};
    for (const [collection, value] of Object.entries(snapshot)) {
        activeUserStorage.setItem(collection, JSON.stringify(value));
    }

    const storageForThisSave = activeUserStorage;
    indexedDbWriteQueue = indexedDbWriteQueue
        .then(() => storageForThisSave.saveCollections(snapshot))
        .catch(error => console.error('Benutzerbezogene IndexedDB-Sicherung fehlgeschlagen:', error));

    window.dispatchEvent(new CustomEvent('endurance:data-saved', { detail: { userId: activeUserId } }));
    return true;
}

/**
 * Entfernt alte lokale Garmin-Rohtelemetrie erst nach erfolgreichem Cloud-Readback.
 * Der aktive Arbeitsspeicher bleibt unangetastet, damit Diagramme weiter funktionieren.
 */
export async function clearLocalGarminTelemetryCache() {
    if (!activeUserStorage || !activeUserId) throw new Error('Kein aktiver Benutzer-Speicher für die Telemetrie-Bereinigung.');
    await indexedDbWriteQueue;
    await activeUserStorage.removeCollection('garminTelemetry');
    const compactActivities = stripGarminTelemetryFromActivities(state.rawActivities);
    activeUserStorage.setItem('activities', JSON.stringify(compactActivities));
    await activeUserStorage.saveCollections({ activities: compactActivities });
    state.garminTelemetryStore = {};
    return true;
}

export function exportDatabaseBackup() {
    const db = {
        activities: state.rawActivities,
        disabledIntervals: state.disabledIntervalsActivities || [],
        planned: state.plannedActivities,
        checkins: state.dailyCheckins,
        health: state.healthLogs,
        races: state.races,
        strength: state.strengthLogs,
        strengthPBs: state.strengthPBs || [],
        supplements: state.supplements || [],
        profile: state.profile || {},
        settings: state.settings || { sports: {}, categories: {}, heartRateZones: {} },
        version: '2.2',
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `endurance_ai_backup_${toLocalDateString()}.json`;
    a.click();
}


/**
 * Liest ein Backup ausschließlich zur Vorschau ein. Der App-Zustand und
 * lokale/cloudbasierte Daten werden dabei nicht verändert.
 */
export async function inspectDatabaseBackup(file) {
    if (!file) throw new Error('Keine Backup-Datei ausgewählt.');
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Ungültiges Backup: JSON-Wurzel muss ein Objekt sein.');
    }

    const requiredKeys = ['activities', 'planned', 'checkins', 'health', 'races', 'strength', 'strengthPBs', 'supplements'];
    if (!requiredKeys.some(key => Object.prototype.hasOwnProperty.call(parsed, key))) {
        throw new Error('Die Datei enthält keine erkennbaren Endurance-AI-Backupdaten.');
    }

    const arrays = ['activities', 'planned', 'races', 'strength', 'strengthPBs', 'supplements'];
    for (const key of arrays) {
        if (parsed[key] != null && !Array.isArray(parsed[key])) {
            throw new Error(`Ungültiges Backup: "${key}" muss eine Liste sein.`);
        }
    }
    for (const key of ['checkins', 'health', 'profile', 'settings']) {
        if (parsed[key] != null && (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]))) {
            throw new Error(`Ungültiges Backup: "${key}" muss ein Objekt sein.`);
        }
    }

    const counts = {
        activities: parsed.activities?.length ?? 0,
        planned: parsed.planned?.length ?? 0,
        checkins: Object.keys(parsed.checkins || {}).length,
        health: Object.keys(parsed.health || {}).length,
        races: parsed.races?.length ?? 0,
        strength: parsed.strength?.length ?? 0,
        strengthPBs: parsed.strengthPBs?.length ?? 0,
        supplements: parsed.supplements?.length ?? 0
    };
    const dateRange = values => {
        const dates = values
            .map(value => typeof value === 'string' ? value : value?.date ?? value?.startDate ?? value?.eventDate ?? value?.timestamp)
            .filter(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
            .map(value => value.slice(0, 10))
            .sort();
        return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
    };
    const activityDateRange = dateRange(parsed.activities || []);
    const checkinDateRange = dateRange(Object.keys(parsed.checkins || {}));
    const healthDateRange = dateRange(Object.keys(parsed.health || {}));
    const raceDateRange = dateRange(parsed.races || []);

    return {
        version: parsed.version ?? 'nicht angegeben',
        exportedAt: parsed.exportedAt ?? null,
        counts,
        hasProfile: Boolean(parsed.profile && Object.keys(parsed.profile).length),
        hasSettings: Boolean(parsed.settings && Object.keys(parsed.settings).length),
        missingSections: requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(parsed, key)),
        activityDateRange,
        checkinDateRange,
        healthDateRange,
        raceDateRange,
        fileSizeBytes: file.size
    };
}

/** Stellt ein zuvor exportiertes JSON-Backup wieder her. */
export async function importDatabaseBackup(file, options = {}) {
    if (!file) return false;
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Ungültiges Backup: JSON-Wurzel muss ein Objekt sein.');
    const supported = ['activities', 'planned', 'checkins', 'health', 'races', 'strength', 'strengthPBs', 'supplements', 'profile', 'settings'];
    if (!supported.some(key => Object.prototype.hasOwnProperty.call(parsed, key))) throw new Error('Die Datei enthält keine erkennbaren Endurance-AI-Backupdaten.');
    const arrays = ['activities', 'planned', 'races', 'strength', 'strengthPBs', 'supplements'];
    for (const key of arrays) {
        if (parsed[key] != null && !Array.isArray(parsed[key])) throw new Error(`Ungültiges Backup: "${key}" muss eine Liste sein.`);
    }
    for (const key of ['checkins', 'health', 'profile', 'settings']) {
        if (parsed[key] != null && (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]))) throw new Error(`Ungültiges Backup: "${key}" muss ein Objekt sein.`);
    }
    const selected = Array.isArray(options.categories) ? options.categories : supported;
    const validSelected = selected.filter(key => supported.includes(key) && Object.prototype.hasOwnProperty.call(parsed, key));
    if (!validSelected.length) throw new Error('Bitte wähle mindestens einen enthaltenen Datenbereich aus.');
    if (options.confirmed !== true && !confirm('Ausgewählte Datenbereiche wiederherstellen? Die entsprechenden vorhandenen Bereiche werden ersetzt.')) return false;

    const stateMap = {
        activities: 'rawActivities', planned: 'plannedActivities', checkins: 'dailyCheckins',
        health: 'healthLogs', races: 'races', strength: 'strengthLogs',
        strengthPBs: 'strengthPBs', supplements: 'supplements', profile: 'profile', settings: 'settings'
    };
    for (const key of validSelected) {
        const value = parsed[key];
        if (key === 'profile' || key === 'settings') {
            if (value && typeof value === 'object' && !Array.isArray(value)) state[stateMap[key]] = value;
        } else {
            state[stateMap[key]] = value ?? (['checkins', 'health'].includes(key) ? {} : []);
        }
    }
    if (validSelected.includes('checkins')) {
        Object.values(state.dailyCheckins).forEach(checkin => {
            if (!checkin || typeof checkin !== 'object') return;
            if (checkin.sleepDuration == null && Number(checkin.sleep) > 5) checkin.sleepDuration = Number(checkin.sleep);
            if (checkin.sleepQuality == null && Number(checkin.sleep) >= 1 && Number(checkin.sleep) < 5) checkin.sleepQuality = Number(checkin.sleep);
            if (checkin.sleepQuality == null && Number(checkin.sleep) === 5 && checkin.sleepDuration == null) checkin.sleepLegacyAmbiguous = true;
        });
    }
    saveDataToLocalStorage();
    return { importedCategories: validSelected };
}
