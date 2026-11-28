import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { indexedDB: true };

const opened = [];
globalThis.indexedDB = {
    open() {
        const index = opened.length;
        const request = {
            result: null,
            onupgradeneeded: null,
            onsuccess: null,
            onerror: null,
            onblocked: null
        };
        opened.push(request);
        if (index === 0) {
            const blockedDb = { closed: false, close() { this.closed = true; }, onversionchange: null };
            setTimeout(() => request.onblocked?.(), 0);
            // Manche Browser können den alten Request nach Ende der Blockade
            // noch erfolgreich abschließen.
            setTimeout(() => {
                request.result = blockedDb;
                request.onsuccess?.();
            }, 30);
            request.blockedDb = blockedDb;
        } else {
            const freshDb = { close() {}, onversionchange: null };
            setTimeout(() => {
                request.result = freshDb;
                request.onsuccess?.();
            }, 0);
            request.freshDb = freshDb;
        }
        return request;
    }
};

const { openLocalDatabase } = await import('../js/local-db.js?blocked-open-retry');

test('a blocked IndexedDB open can be retried and a late old connection is closed', async () => {
    await assert.rejects(openLocalDatabase(), /noch in einem anderen Tab geöffnet/);

    const database = await openLocalDatabase();
    assert.equal(database, opened[1].freshDb);
    assert.equal(opened.length, 2);

    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(opened[0].blockedDb.closed, true);
});
