import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGarminSyncHistoryData } from '../js/garmin-sync-history.js';

function createHistoryClient(healthRows, activityRows) {
    const tables = {
        garmin_health_records: healthRows,
        garmin_activities: activityRows
    };
    const active = { garmin_health_records: 0, garmin_activities: 0 };
    const maxActive = { garmin_health_records: 0, garmin_activities: 0 };
    const calls = [];

    return {
        calls,
        maxActive,
        from(table) {
            const query = {
                table,
                head: false,
                offset: 0,
                limit: tables[table]?.length || 0,
                select(_columns, config = {}) {
                    this.head = config.head === true;
                    return this;
                },
                eq(column, value) {
                    calls.push({ table, column, value });
                    return this;
                },
                order() { return this; },
                range(offset, end) {
                    this.offset = offset;
                    this.limit = end - offset + 1;
                    return this;
                },
                then(resolve, reject) {
                    if (this.head) {
                        return Promise.resolve({ count: tables[table].length, data: null, error: null }).then(resolve, reject);
                    }
                    active[table]++;
                    maxActive[table] = Math.max(maxActive[table], active[table]);
                    return new Promise(done => setTimeout(() => {
                        const data = tables[table].slice(this.offset, this.offset + this.limit);
                        active[table]--;
                        done({ count: null, data, error: null });
                    }, 4)).then(resolve, reject);
                }
            };
            return query;
        }
    };
}

test('loads both Garmin history tables concurrently with complete ordered pagination', async () => {
    const healthRows = Array.from({ length: 2203 }, (_, index) => ({
        data_type: 'sleep', record_date: '2026-01-' + String(index).padStart(4, '0'), index
    }));
    const activityRows = Array.from({ length: 1301 }, (_, index) => ({
        start_time: '2026-01-01T' + String(index).padStart(6, '0'), index
    }));
    const client = createHistoryClient(healthRows, activityRows);
    const result = await loadGarminSyncHistoryData(client, 'athlete-1', { pageSize: 250, concurrency: 3 });

    assert.deepEqual(result.healthRows, healthRows);
    assert.deepEqual(result.activityRows, activityRows);
    assert.ok(client.maxActive.garmin_health_records > 1);
    assert.ok(client.maxActive.garmin_health_records <= 3);
    assert.ok(client.maxActive.garmin_activities > 1);
    assert.ok(client.maxActive.garmin_activities <= 3);
    assert.ok(client.calls.length > 0);
    assert.ok(client.calls.every(call => call.column === 'user_id' && call.value === 'athlete-1'));
});

test('rejects an incomplete Garmin history page instead of returning misleading totals', async () => {
    const client = createHistoryClient(
        Array.from({ length: 11 }, (_, index) => ({ data_type: 'sleep', record_date: '2026-01-01', index })),
        [{ start_time: '2026-01-01T08:00:00' }]
    );
    const originalFrom = client.from.bind(client);
    client.from = table => {
        const query = originalFrom(table);
        const originalThen = query.then.bind(query);
        query.then = (resolve, reject) => originalThen(result => {
            if (!query.head && table === 'garmin_health_records' && query.offset === 0) {
                result.data = result.data.slice(0, 1);
            }
            return resolve(result);
        }, reject);
        return query;
    };
    await assert.rejects(
        loadGarminSyncHistoryData(client, 'athlete-1', { pageSize: 5, concurrency: 2 }),
        /nicht vollständig/
    );
});

test('requires a user ID before querying personal Garmin records', async () => {
    let calls = 0;
    const client = { from() { calls++; throw new Error('must not query'); } };
    await assert.rejects(loadGarminSyncHistoryData(client, '', {}), /Benutzer-ID/);
    assert.equal(calls, 0);
});
