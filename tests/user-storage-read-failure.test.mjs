import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
};

// Simuliert einen Browser ohne verfügbares IndexedDB.
globalThis.window = {};

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

test('a valid localStorage collection remains readable without IndexedDB', async () => {
    const storage = createUserStorage('athlete-2');
    storage.setItem('activities', JSON.stringify([{ id: 'local-1' }]));

    assert.deepEqual(await storage.getCollection('activities'), [{ id: 'local-1' }]);
});
