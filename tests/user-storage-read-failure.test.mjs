import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
};

// IndexedDB ist vorhanden, aber der Datenbankzugriff schlägt fehl.
globalThis.window = { indexedDB: {} };
globalThis.indexedDB = {
    open() {
        const request = {};
        setTimeout(() => {
            request.error = new Error('Simulierter IndexedDB-Lesefehler');
            request.onerror?.();
        }, 0);
        return request;
    }
};

const { createUserStorage } = await import('../js/user-storage.js?indexeddb-read-fail-closed');

test('an IndexedDB read failure is not silently treated as an empty collection', async () => {
    const storage = createUserStorage('athlete-1');

    await assert.rejects(
        storage.getCollection('activities'),
        error => error?.name === 'UserStorageReadError'
            && /nicht als leer behandelt/.test(error.message)
            && error.cause instanceof Error
    );
});

test('a valid localStorage collection remains readable when IndexedDB fails', async () => {
    const storage = createUserStorage('athlete-2');
    storage.setItem('activities', JSON.stringify([{ id: 'local-1' }]));

    assert.deepEqual(await storage.getCollection('activities'), [{ id: 'local-1' }]);
});

test('a browser without IndexedDB can still use localStorage as its only store', async () => {
    globalThis.window = {};
    const storage = createUserStorage('athlete-3');
    assert.equal(await storage.getCollection('activities'), undefined);
    storage.setItem('activities', JSON.stringify([{ id: 'local-only' }]));
    assert.deepEqual(await storage.getCollection('activities'), [{ id: 'local-only' }]);
});
