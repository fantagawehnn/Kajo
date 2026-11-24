import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCloudActivities } from '../js/cloud-activities.js';

function createPagedClient(rows, options = {}) {
    let active = 0;
    let maxActive = 0;
    const pageSize = options.pageSize || 500;
    const client = {
        from(table) {
            assert.equal(table, 'activities');
            const query = {
                head: false,
                offset: 0,
                limit: rows.length,
                select(_columns, config = {}) { this.head = config.head === true; return this; },
                eq() { return this; },
                order() { return this; },
                range(offset, end) { this.offset = offset; this.limit = end - offset + 1; return this; },
                then(resolve, reject) {
                    if (this.head) return Promise.resolve({ count: rows.length, data: null, error: null }).then(resolve, reject);
                    active++;
                    maxActive = Math.max(maxActive, active);
                    return new Promise(done => setTimeout(() => {
                        const data = rows.slice(this.offset, this.offset + this.limit);
                        active--;
                        done({ count: null, data, error: null });
                    }, 5)).then(resolve, reject);
                }
            };
            return query;
        }
    };
    return { client, getMaxActive: () => maxActive, pageSize };
}

test('fetches all activity pages with bounded parallelism and stable ordering', async () => {
    const rows = Array.from({ length: 1203 }, (_, index) => ({
        record_id: String(index).padStart(4, '0'),
        payload: { id: String(index), duration: index + 1 }
    }));
    const fixture = createPagedClient(rows);
    const loaded = await fetchCloudActivities(fixture.client, 'user-1');
    assert.equal(loaded.length, rows.length);
    assert.equal(loaded[0].record_id, '0000');
    assert.equal(loaded.at(-1).record_id, '1202');
    assert.ok(fixture.getMaxActive() > 1);
    assert.ok(fixture.getMaxActive() <= 3);
});

test('does not return a partial result when page count and rows disagree', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
        record_id: String(index),
        payload: { id: String(index) }
    }));
    const fixture = createPagedClient(rows);
    const originalFrom = fixture.client.from.bind(fixture.client);
    fixture.client.from = table => {
        const query = originalFrom(table);
        const originalThen = query.then.bind(query);
        query.then = (resolve, reject) => originalThen(result => {
            if (!query.head && query.offset === 0) result.data = result.data.slice(0, 2);
            return resolve(result);
        }, reject);
        return query;
    };
    await assert.rejects(
        fetchCloudActivities(fixture.client, 'user-1', { pageSize: 5 }),
        /nicht konsistent/
    );
});
