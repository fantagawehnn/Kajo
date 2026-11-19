import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGarminActivityPages } from '../js/garmin-activity-pagination.js';

test('loads all activity rows in bounded pages until the final partial page', async () => {
    const rows = Array.from({ length: 451 }, (_, id) => ({ id }));
    const calls = [];
    const result = await loadGarminActivityPages(async (offset, limit) => {
        calls.push({ offset, limit });
        return { data: rows.slice(offset, offset + limit), error: null };
    }, { pageSize: 200, retryDelayMs: 0 });
    assert.deepEqual(calls, [{ offset: 0, limit: 200 }, { offset: 200, limit: 200 }, { offset: 400, limit: 200 }]);
    assert.deepEqual(result, rows);
});

test('retries a statement timeout and continues without duplicating rows', async () => {
    let attempts = 0;
    const result = await loadGarminActivityPages(async () => {
        attempts++;
        if (attempts === 1) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
        return { data: [{ id: 1 }], error: null };
    }, { pageSize: 10, retryDelayMs: 0 });
    assert.equal(attempts, 2);
    assert.deepEqual(result, [{ id: 1 }]);
});

test('does not retry permanent query errors', async () => {
    let attempts = 0;
    const failure = { code: '42501', message: 'permission denied' };
    await assert.rejects(loadGarminActivityPages(async () => {
        attempts++;
        return { data: null, error: failure };
    }, { retryDelayMs: 0 }), error => error === failure);
    assert.equal(attempts, 1);
});

test('retries transient failures only up to the configured limit', async () => {
    let attempts = 0;
    const failure = { code: '57014', message: 'statement timeout' };
    await assert.rejects(loadGarminActivityPages(async () => {
        attempts++;
        return { data: null, error: failure };
    }, { maxRetries: 2, retryDelayMs: 0 }), error => error === failure);
    assert.equal(attempts, 3);
});
