/**
 * user-storage.js
 *
 * Benutzerbezogene lokale Speicherung als sichere Grundlage für die spätere
 * Supabase-Synchronisierung. Dieses Modul übernimmt KEINE Legacy-Daten und
 * liest niemals die bisherigen globalen endurance_* Schlüssel.
 *
 * Wichtig: Erst nach erfolgreicher Authentifizierung mit einer stabilen
 * Supabase user.id verwenden. Ein Accountwechsel benötigt eine neue Instanz.
 */

import { getLocalCollection, putLocalCollections, putLocalCollectionsWithOutbox, getLocalOutboxRecord, clearLocalOutboxRecord, deleteLocalCollection } from './local-db.js';

function requireUserId(userId) {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('Benutzerbezogene Speicherung benötigt eine gültige Benutzer-ID.');
    }
    return userId.trim();
}

function encodePart(value) {
    return encodeURIComponent(value);
}

export function getUserStorageKey(userId, key) {
    const id = requireUserId(userId);
    if (typeof key !== 'string' || !key.trim()) {
        throw new Error('Der Speicher-Schlüssel darf nicht leer sein.');
    }
    return `endurance:user:${encodePart(id)}:${encodePart(key.trim())}`;
}

/**
 * Erstellt einen ausschließlich für eine angemeldete Benutzer-ID gültigen
 * Speicherzugriff. Es gibt absichtlich keinen Rückgriff auf globale Alt-Daten.
 */
export function createUserStorage(userId) {
    const id = requireUserId(userId);

    return {
        getItem(key) {
            return localStorage.getItem(getUserStorageKey(id, key));
        },

        setItem(key, value) {
            localStorage.setItem(getUserStorageKey(id, key), String(value));
        },

        removeItem(key) {
            localStorage.removeItem(getUserStorageKey(id, key));
        },

        async getCollection(collection) {
            const storageKey = getUserStorageKey(id, collection);
            // localStorage wird synchron aktualisiert und hat Vorrang vor einem
            // eventuell veralteten IndexedDB-Eintrag. IndexedDB bleibt Fallback,
            // wenn localStorage wegen Speicherlimits keinen aktuellen Eintrag hält.
            const raw = localStorage.getItem(storageKey);
            if (raw !== null) {
                try { return JSON.parse(raw); }
                catch { throw new Error('Die benutzerspezifischen lokalen Daten ' + collection + ' sind beschädigt und konnten nicht gelesen werden.'); }
            }
            try {
                return await getLocalCollection(storageKey);
            } catch (error) {
                // Wenn der Browser IndexedDB überhaupt nicht unterstützt, kann
                // dort auch keine frühere Sammlung liegen. localStorage bleibt
                // dann der vollständige verfügbare Speicherweg.
                if (error?.name === 'IndexedDBUnavailableError') return undefined;
                // Ein fehlgeschlagener IndexedDB-Lesezugriff bedeutet nicht,
                // dass die Sammlung leer ist: Sie kann ausschließlich dort liegen,
                // etwa nachdem localStorage sein Speicherlimit erreicht hat.
                // Deshalb muss die Kontoaktivierung sicher abbrechen.
                const wrapped = new Error(
                    'Die lokalen Daten "' + collection + '" konnten weder aus localStorage noch aus IndexedDB gelesen werden. ' +
                    'Die Daten werden nicht als leer behandelt; bitte prüfe den Browser-Speicher und versuche es erneut.'
                );
                wrapped.name = 'UserStorageReadError';
                wrapped.cause = error;
                throw wrapped;
            }
        },

        async saveCollections(collections, options = {}) {
            if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
                throw new Error('Die zu speichernden Datensammlungen müssen als Objekt übergeben werden.');
            }

            const indexedCollections = {};
            for (const [collection, value] of Object.entries(collections)) {
                const storageKey = getUserStorageKey(id, collection);
                const serialized = JSON.stringify(value);
                if (collection === 'garminTelemetry') {
                    // Keep a small fallback copy only; the complete telemetry
                    // collection is stored in IndexedDB to avoid localStorage quotas.
                    try {
                        if (serialized.length <= 1500000) localStorage.setItem(storageKey, serialized);
                        else localStorage.removeItem(storageKey);
                    } catch {
                        try { localStorage.removeItem(storageKey); } catch (_) {}
                    }
                } else {
                    try {
                        localStorage.setItem(storageKey, serialized);
                    } catch (error) {
                        if (error?.name !== 'QuotaExceededError' && error?.name !== 'NS_ERROR_DOM_QUOTA_REACHED') throw error;
                        // localStorage ist nur Fallback; die vollständige Sammlung
                        // wird direkt danach in IndexedDB gespeichert.
                        try { localStorage.removeItem(storageKey); } catch (_) {}
                        console.warn(`localStorage-Quote für "${collection}" erreicht; IndexedDB übernimmt.`);
                    }
                }
                indexedCollections[storageKey] = value;
            }

            if (options.queueCloudSync === false) await putLocalCollections(indexedCollections);
            else await putLocalCollectionsWithOutbox(id, indexedCollections);
        },
        async getPendingSync() { return await getLocalOutboxRecord(id); },
        async clearPendingSync(expectedRecord) { return await clearLocalOutboxRecord(id, expectedRecord); },

        async removeCollection(collection) {
            const storageKey = getUserStorageKey(id, collection);
            localStorage.removeItem(storageKey);
            await deleteLocalCollection(storageKey);
        }
    };
}
