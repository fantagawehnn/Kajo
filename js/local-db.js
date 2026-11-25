/**
 * local-db.js
 *
 * IndexedDB-Grundlage für die Local-first-Speicherung von Endurance AI.
 * Dieses Modul wird zunächst isoliert eingeführt: Die bestehende App
 * verwendet weiterhin localStorage, bis die asynchrone Umstellung und
 * ihre Tests abgeschlossen sind.
 */

const DB_NAME = 'endurance-ai-local';
const DB_VERSION = 2;
const COLLECTIONS_STORE = 'collections';
const META_STORE = 'metadata';
const OUTBOX_STORE = 'outbox';

const LEGACY_COLLECTIONS = [
    ['activities', 'endurance_activities'],
    ['planned', 'endurance_planned'],
    ['checkins', 'endurance_checkins'],
    ['health', 'endurance_health'],
    ['races', 'endurance_races'],
    ['strength', 'endurance_strength'],
    ['strengthPBs', 'endurance_strength_pbs'],
    ['supplements', 'endurance_supplements'],
    ['profile', 'endurance_profile']
];

let databasePromise;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB-Anfrage fehlgeschlagen.'));
    });
}

function transactionFinished(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB-Transaktion fehlgeschlagen.'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB-Transaktion abgebrochen.'));
    });
}

/** Öffnet die lokale Datenbank einmalig pro App-Sitzung. */
export function openLocalDatabase() {
    if (!('indexedDB' in window)) {
        const error = new Error('Dieser Browser unterstützt IndexedDB nicht.');
        error.name = 'IndexedDBUnavailableError';
        return Promise.reject(error);
    }

    if (!databasePromise) {
        let blocked = false;
        const openingPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
                    db.createObjectStore(COLLECTIONS_STORE, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
                    db.createObjectStore(OUTBOX_STORE, { keyPath: 'userId' });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                // Ein zuvor blockierter Open-Request kann nach dem Schließen
                // eines anderen Tabs verspätet erfolgreich werden. Er gehört
                // dann nicht mehr zur aktiven Öffnungs-Promise und wird geschlossen.
                if (blocked) {
                    db.close();
                    return;
                }
                db.onversionchange = () => {
                    db.close();
                    if (databasePromise === openingPromise) databasePromise = null;
                };
                resolve(db);
            };

            request.onerror = () => {
                if (databasePromise === openingPromise) databasePromise = null;
                reject(request.error || new Error('Lokale Datenbank konnte nicht geöffnet werden.'));
            };

            request.onblocked = () => {
                blocked = true;
                if (databasePromise === openingPromise) databasePromise = null;
                reject(new Error('Die lokale Datenbank ist noch in einem anderen Tab geöffnet. Bitte schließe weitere Endurance-AI-Tabs und versuche es erneut.'));
            };
        });
        databasePromise = openingPromise;
    }

    return databasePromise;
}

/** Speichert eine Datensammlung lokal in IndexedDB. */
export async function putLocalCollection(key, value) {
    const db = await openLocalDatabase();
    const transaction = db.transaction(COLLECTIONS_STORE, 'readwrite');
    transaction.objectStore(COLLECTIONS_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await transactionFinished(transaction);
}

/** Liest eine Datensammlung aus IndexedDB; liefert undefined, wenn sie fehlt. */
export async function getLocalCollection(key) {
    const db = await openLocalDatabase();
    const transaction = db.transaction(COLLECTIONS_STORE, 'readonly');
    // Den Abschluss-Listener sofort registrieren. Wird er erst nach
    // requestResult() gesetzt, kann das oncomplete-Ereignis bereits vorbei sein.
    const finished = transactionFinished(transaction);
    const result = await requestResult(transaction.objectStore(COLLECTIONS_STORE).get(key));
    await finished;
    return result?.value;
}

/** Entfernt eine einzelne benutzerbezogene Sammlung aus IndexedDB. */
export async function deleteLocalCollection(key) {
    const db = await openLocalDatabase();
    const transaction = db.transaction(COLLECTIONS_STORE, 'readwrite');
    transaction.objectStore(COLLECTIONS_STORE).delete(key);
    await transactionFinished(transaction);
}

/**
 * Übernimmt vorhandene localStorage-Daten genau einmal nach IndexedDB.
 * Die alten localStorage-Einträge werden absichtlich NICHT gelöscht.
 * Bereits vorhandene IndexedDB-Sammlungen werden nicht überschrieben.
 */
export async function migrateLegacyLocalStorage() {
    const db = await openLocalDatabase();

    const readTransaction = db.transaction([COLLECTIONS_STORE, META_STORE], 'readonly');
    const metaStore = readTransaction.objectStore(META_STORE);
    const collectionsStore = readTransaction.objectStore(COLLECTIONS_STORE);

    const migration = await requestResult(metaStore.get('legacy-localstorage-v1'));
    const existingRecords = await requestResult(collectionsStore.getAll());
    await transactionFinished(readTransaction);

    if (migration?.completed) {
        return { migrated: false, reason: 'already-completed', collections: [] };
    }

    const existingKeys = new Set(existingRecords.map(record => record.key));
    const pending = [];

    for (const [collection, storageKey] of LEGACY_COLLECTIONS) {
        if (existingKeys.has(collection)) continue;

        const raw = localStorage.getItem(storageKey);
        if (raw === null) continue;

        let value;
        try {
            value = JSON.parse(raw);
        } catch {
            throw new Error(`Die vorhandenen lokalen Daten (${storageKey}) sind kein gültiges JSON. Die Migration wurde nicht abgeschlossen; die Originaldaten bleiben unverändert.`);
        }

        pending.push({ key: collection, value, updatedAt: new Date().toISOString() });
    }

    const writeTransaction = db.transaction([COLLECTIONS_STORE, META_STORE], 'readwrite');
    const writeCollections = writeTransaction.objectStore(COLLECTIONS_STORE);

    for (const record of pending) {
        writeCollections.put(record);
    }

    writeTransaction.objectStore(META_STORE).put({
        key: 'legacy-localstorage-v1',
        completed: true,
        completedAt: new Date().toISOString(),
        migratedCollections: pending.map(record => record.key)
    });

    await transactionFinished(writeTransaction);

    return {
        migrated: true,
        collections: pending.map(record => record.key)
    };
}


/**
 * Schreibt mehrere Datensammlungen in einer gemeinsamen Transaktion.
 * Ein Fehler bricht den gesamten Schreibvorgang ab, statt nur einen Teil
 * der Sammlungen zu aktualisieren.
 */
export async function putLocalCollections(collections) {
    const db = await openLocalDatabase();
    const transaction = db.transaction(COLLECTIONS_STORE, 'readwrite');
    const store = transaction.objectStore(COLLECTIONS_STORE);
    const updatedAt = new Date().toISOString();

    for (const [key, value] of Object.entries(collections)) {
        store.put({ key, value, updatedAt });
    }

    await transactionFinished(transaction);
}


/** Atomar gespeicherte Sammlungen plus dauerhafter Sync-Auftrag. */
export async function putLocalCollectionsWithOutbox(userId, collections) {
    if (typeof userId !== 'string' || !userId.trim()) throw new Error('Für den lokalen Synchronisierungsauftrag fehlt die Benutzer-ID.');
    const id = userId.trim();
    const db = await openLocalDatabase();
    const transaction = db.transaction([COLLECTIONS_STORE, OUTBOX_STORE], 'readwrite');
    const collectionStore = transaction.objectStore(COLLECTIONS_STORE);
    const outboxStore = transaction.objectStore(OUTBOX_STORE);
    const updatedAt = new Date().toISOString();
    const entries = Object.entries(collections || {});
    for (const [key, value] of entries) collectionStore.put({ key, value, updatedAt });
    const previousRequest = outboxStore.get(id);
    previousRequest.onsuccess = () => {
        const previous = previousRequest.result;
        outboxStore.put({ userId: id, updatedAt, revision: Number(previous?.revision || 0) + 1, collectionKeys: entries.map(([key]) => key) });
    };
    await transactionFinished(transaction);
    return { userId: id, updatedAt };
}

export async function getLocalOutboxRecord(userId) {
    if (typeof userId !== 'string' || !userId.trim()) return null;
    const db = await openLocalDatabase();
    const transaction = db.transaction(OUTBOX_STORE, 'readonly');
    const finished = transactionFinished(transaction);
    const record = await requestResult(transaction.objectStore(OUTBOX_STORE).get(userId.trim()));
    await finished;
    return record || null;
}

export async function clearLocalOutboxRecord(userId, expectedRecord) {
    if (typeof userId !== 'string' || !userId.trim() || !expectedRecord) return false;
    const id = userId.trim();
    const db = await openLocalDatabase();
    const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = transaction.objectStore(OUTBOX_STORE);
    const request = store.get(id);
    let cleared = false;
    request.onsuccess = () => {
        const current = request.result;
        if (current && current.updatedAt === expectedRecord.updatedAt
            && Number(current.revision) === Number(expectedRecord.revision)) {
            store.delete(id);
            cleared = true;
        }
    };
    await transactionFinished(transaction);
    return cleared;
}
