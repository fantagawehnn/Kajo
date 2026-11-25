import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCloudActivities } from '../js/cloud-activities.js';

function createPagedClient(rows, options = {}) {
    let active = 0;
    let maxActive = 0;
    const requestedPageSizes = [];
    const cursors = [];
    const pageSize = options.pageSize || 25;
    const client = {
        from(table) {
            assert.equal(table, 'activities');
            const query = {
                head: false,
                cursor: null,
                limitValue: null,
                select(_columns, config = {}) { this.head = config.head === true; return this; },
                eq() { return this; },
                gt(_column, value) { this.cursor = String(value); cursors.push(this.cursor); return this; },
                order() { return this; },
                limit(value) { this.limitValue = value; requestedPageSizes.push(value); return this; },
                then(resolve, reject) {
                    if (this.head) {
                        return Promise.resolve({ count: options.countOverride ?? rows.length, data: null, error: null }).then(resolve, reject);
                    }
                    active++;
                    maxActive = Math.max(maxActive, active);
                    return new Promise(done => setTimeout(() => {
                        let eligible = rows;
                        if (this.cursor !== null) {
                            eligible = eligible.filter(row => row.record_id > this.cursor);
                        }
                        if (options.omitRecordId !== undefined) {
                            eligible = eligible.filter(row => row.record_id !== options.omitRecordId);
                        }
                        const data = eligible.slice(0, this.limitValue);
                        active--;
                        done({ count: null, data, error: null });
                    }, 1)).then(resolve, reject);
                }
            };
            return query;
        }
    };
    return {
        client,
        getMaxActive: () => maxActive,
        getRequestedPageSizes: () => requestedPageSizes,
        getCursors: () => cursors,
        pageSize
    };
}

test('fetches all activity pages sequentially with stable keyset ordering', async () => {
    const rows = Array.from({ length: 1203 }, (_, index) => ({
        record_id: String(index).padStart(4, '0'),
        payload: { id: String(index), duration: index + 1 }
    }));
    const fixture = createPagedClient(rows);
    const loaded = await fetchCloudActivities(fixture.client, 'user-1');
    assert.equal(loaded.length, rows.length);
    assert.equal(loaded[0].record_id, '0000');
    assert.equal(loaded.at(-1).record_id, '1202');
    assert.equal(fixture.getMaxActive(), 1);
    assert.ok(fixture.getRequestedPageSizes().every(size => size <= 50));
    assert.ok(fixture.getCursors().length > 0);
    assert.equal(fixture.getCursors()[0], '0024');
});

test('does not return a partial result when count and keyset pages disagree', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
        record_id: String(index),
        payload: { id: String(index) }
    }));
    const fixture = createPagedClient(rows, { omitRecordId: '3' });
    await assert.rejects(
        fetchCloudActivities(fixture.client, 'user-1', { pageSize: 5 }),
        /nicht konsistent/
    );
});
