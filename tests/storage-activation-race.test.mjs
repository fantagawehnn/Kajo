import test from 'node:test';
import assert from 'node:assert/strict';

const localValues = new Map();
const indexedValues = new Map();
globalThis.localStorage = {
    getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
    setItem(key, value) { localValues.set(key, String(value)); },
    removeItem(key) { localValues.delete(key); }
};

const database = {
    transaction() {
        const transaction = {
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore() {
                return {
                    get(key) {
                        const request = { result: undefined, onsuccess: null, onerror: null };
                        setTimeout(() => {
                            request.result = indexedValues.has(key) ? { key, value: indexedValues.get(key) } : undefined;
                            request.onsuccess?.();
                            setTimeout(() => transaction.oncomplete?.(), 0);
                        }, 30);
                        return request;
                    },
                    put(record) {
                        indexedValues.set(record.key, record.value);
                        setTimeout(() => transaction.oncomplete?.(), 0);
                    }
                };
            }
        };
        return transaction;
    }
};

globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
globalThis.indexedDB = {
    open() {
        const request = { result: database, onsuccess: null, onerror: null };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
    }
};
window.indexedDB = indexedDB;

const { state } = await import('../js/state.js');
const storage = await import('../js/storage.js?storage-generation-race-test');
const userId = 'same-account';
const collections = [
    'activities', 'disabledIntervals', 'garminTelemetry', 'planned', 'checkins',
    'health', 'races', 'seasonPlan', 'strength', 'strengthPBs', 'supplements',
    'profile', 'settings'
];
const keyFor = collection => `endurance:user:${encodeURIComponent(userId)}:${encodeURIComponent(collection)}`;

for (const collection of collections) {
    const oldValue = collection === 'profile'
        ? { name: 'stale activation' }
        : collection === 'settings'
            ? { sports: {}, categories: {}, heartRateZones: {} }
            : ['activities', 'disabledIntervals', 'planned', 'races', 'strength', 'strengthPBs', 'supplements'].includes(collection)
                ? []
                : {};
    indexedValues.set(keyFor(collection), oldValue);
}

test('a delayed previous load cannot overwrite a reactivated session of the same account', async () => {
    const previousLoad = storage.loadStateForUser(userId);

    // Simulate sign-out followed by a fresh sign-in of the same account.
    storage.deactivateUserStorage();
    for (const collection of collections) {
        const newValue = collection === 'profile'
            ? { name: 'fresh activation' }
            : collection === 'settings'
                ? { sports: {}, categories: {}, heartRateZones: {} }
                : ['activities', 'disabledIntervals', 'planned', 'races', 'strength', 'strengthPBs', 'supplements'].includes(collection)
                    ? []
                    : {};
        localValues.set(keyFor(collection), JSON.stringify(newValue));
    }

    const currentLoad = await storage.loadStateForUser(userId);
    assert.equal(currentLoad, userId);
    assert.equal(state.profile.name, 'fresh activation');

    const staleResult = await previousLoad;
    assert.equal(staleResult, null);
    assert.equal(state.profile.name, 'fresh activation');
});
