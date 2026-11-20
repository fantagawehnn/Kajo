import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PERSONAL_PREFERENCES_KEY,
    createDefaultPersonalPreferences,
    normalizePersonalPreferences,
    createPersonalPreferencesStore
} from '../js/personal-preferences.js';

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        values
    };
}

test('creates neutral, versioned defaults without preselecting UI options', () => {
    assert.deepEqual(createDefaultPersonalPreferences(), {
        version: 1, dashboard: {}, analysis: {}, views: {}, appearance: {}
    });
});

test('normalizes malformed and unsupported preference payloads safely', () => {
    assert.deepEqual(normalizePersonalPreferences(null), createDefaultPersonalPreferences());
    assert.deepEqual(normalizePersonalPreferences([]), createDefaultPersonalPreferences());
    assert.deepEqual(normalizePersonalPreferences({ version: 99, dashboard: { hidden: true } }), createDefaultPersonalPreferences());
});

test('loads valid account preferences and ignores invalid section shapes', () => {
    const storage = memoryStorage({
        [PERSONAL_PREFERENCES_KEY]: JSON.stringify({
            version: 1,
            dashboard: { order: ['readiness'] },
            analysis: [],
            views: { home: { compact: true } },
            appearance: null
        })
    });
    const store = createPersonalPreferencesStore(storage);
    assert.deepEqual(store.load(), {
        version: 1,
        dashboard: { order: ['readiness'] },
        analysis: {},
        views: { home: { compact: true } },
        appearance: {}
    });
});

test('corrupt stored JSON falls back to defaults without deleting the original value', () => {
    const raw = '{broken';
    const storage = memoryStorage({ [PERSONAL_PREFERENCES_KEY]: raw });
    assert.deepEqual(createPersonalPreferencesStore(storage).load(), createDefaultPersonalPreferences());
    assert.equal(storage.getItem(PERSONAL_PREFERENCES_KEY), raw);
});

test('saves and resets only the personal-preferences key', () => {
    const storage = memoryStorage({ unrelated: 'keep' });
    const store = createPersonalPreferencesStore(storage);
    const saved = store.save({ dashboard: { order: ['readiness'] }, unknown: true });
    assert.deepEqual(saved, {
        version: 1, dashboard: { order: ['readiness'] }, analysis: {}, views: {}, appearance: {}
    });
    assert.equal(storage.getItem('unrelated'), 'keep');
    assert.deepEqual(store.reset(), createDefaultPersonalPreferences());
    assert.equal(storage.getItem('unrelated'), 'keep');
});
