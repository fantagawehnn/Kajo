/* ============================================================
 * storage.js – Lokale Datenspeicherung (localStorage) und Backup
 * localStorage-Schlüssel (unverändert gegenüber dem Original):
 *   endurance_activities, endurance_planned, endurance_checkins,
 *   endurance_health, endurance_races, endurance_strength
 *   (+ icu_athlete_id, icu_api_key in import.js)
 * ============================================================ */

import { state } from './state.js';
import { toLocalDateString } from './utils.js';
import { createUserStorage } from './user-storage.js';

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

    state.rawActivities = Array.isArray(loaded.rawActivities) ? loaded.rawActivities : [];
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

export function getUserDataSnapshot() {
    return {
        activities: state.rawActivities, planned: state.plannedActivities,
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

export function saveDataToLocalStorage() {
    if (!activeUserStorage || !activeUserId) {
        console.warn('Speichern übersprungen: Es ist kein authentifizierter Benutzer-Speicher aktiv.');
        return false;
    }

    const snapshot = getUserDataSnapshot();

    for (const [collection, value] of Object.entries(snapshot)) {
        activeUserStorage.setItem(collection, JSON.stringify(value));
    }

    const storageForThisSave = activeUserStorage;
    indexedDbWriteQueue = indexedDbWriteQueue
        .then(() => storageForThisSave.saveCollections(snapshot))
        .catch(error => console.error('Benutzerbezogene IndexedDB-Sicherung fehlgeschlagen:', error));

    // Zentraler Hinweis für die Cloud-Synchronisierung. Die App prüft zusätzlich,
    // ob der angemeldete Nutzer bereits vollständig aktiviert ist.
    window.dispatchEvent(new CustomEvent('endurance:data-saved', { detail: { userId: activeUserId } }));
    return true;
}

export function exportDatabaseBackup() {
    const db = {
        activities: state.rawActivities,
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
