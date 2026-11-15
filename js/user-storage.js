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

import { getLocalCollection, putLocalCollections, deleteLocalCollection } from './local-db.js';

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
            try {
                // Ein blockierter oder festhängender IndexedDB-Zugriff darf den
                // Login nicht endlos aufhalten. Nach 3 Sekunden wird ausschließlich
                // auf den gleichnamigen, kontogebundenen localStorage-Eintrag
                // zurückgegriffen; es werden keine globalen Legacy-Daten gelesen.
                const indexedRead = getLocalCollection(storageKey);
                const timeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('IndexedDB-Lesezeitüberschreitung')), 3000);
                });
                const indexedValue = await Promise.race([indexedRead, timeout]);
                if (indexedValue !== undefined) return indexedValue;
            } catch (error) {
                console.warn('IndexedDB nicht verfügbar; benutzerspezifisches localStorage wird verwendet:', error);
            }

            const raw = localStorage.getItem(storageKey);
            if (raw === null) return undefined;

            try {
                return JSON.parse(raw);
            } catch {
                throw new Error(`Die benutzerspezifischen lokalen Daten "${collection}" sind beschädigt und konnten nicht gelesen werden.`);
            }
        },

        async saveCollections(collections) {
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

            await putLocalCollections(indexedCollections);
        },

        async removeCollection(collection) {
            const storageKey = getUserStorageKey(id, collection);
            localStorage.removeItem(storageKey);
            await deleteLocalCollection(storageKey);
        }
    };
}
