import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCloudActivities } from '../js/cloud-activities.js';

function createPagedClient(rows, options = {}) {
    let active = 0;
    let maxActive = 0;
    const requestedPageSizes = [];
    const count = options.count ?? rows.length;
    const client = {
        from(table) {
            assert.equal(table, 'activities');
            const query = {
                head: false,
                after: null,
                pageLimit: rows.length,
                select(_columns, config = {}) { this.head = config.head === true; return this; },
                eq() { return this; },
                gt(_column, value) { this.after = String(value); return this; },
                order() { return this; },
                limit(value) { this.pageLimit = value; requestedPageSizes.push(value); return this; },
                then(resolve, reject) {
                    if (this.head) return Promise.resolve({ count, data: null, error: null }).then(resolve, reject);
                    active++;
                    maxActive = Math.max(maxActive, active);
                    return new Promise(done => setTimeout(() => {
                        const eligible = this.after === null
                            ? rows
                            : rows.filter(row => String(row.record_id) > this.after);
                        const data = eligible.slice(0, this.pageLimit);
                        active--;
                        done({ count: null, data, error: null });
                    }, 5)).then(resolve, reject);
                }
            };
            return query;
        }
    };
    return { client, getMaxActive: () => maxActive, getRequestedPageSizes: () => requestedPageSizes };
}

test('fetches all activity pages sequentially with stable keyset ordering', async () => {
    const rows = Array.from({ length: 1203 }, (_, index) => ({
        record_id: String(index).padStart(4, '0'),
        updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        payload: { id: String(index), duration: index + 1 }
    }));
    const fixture = createPagedClient(rows);
    const loaded = await fetchCloudActivities(fixture.client, 'user-1');
    assert.equal(loaded.length, rows.length);
    assert.equal(loaded[0].record_id, '0000');
    assert.equal(loaded.at(-1).record_id, '1202');
    assert.equal(loaded.syncCursor, new Date(Date.UTC(2026, 0, 1, 0, 20, 2)).toISOString());
    assert.equal(fixture.getMaxActive(), 1);
    assert.ok(fixture.getRequestedPageSizes().every(size => size <= 50));
});

test('does not return a partial result when page count and rows disagree', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
        record_id: String(index),
        payload: { id: String(index) }
    }));
    const fixture = createPagedClient(rows, { pageSize: 5, count: 7 });
    await assert.rejects(
        fetchCloudActivities(fixture.client, 'user-1', { pageSize: 5 }),
        /nicht konsistent/
    );
});
