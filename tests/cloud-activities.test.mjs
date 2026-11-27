import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCloudActivities, fetchCloudActivityDelta, getActivityConflictLabel, mergeCloudActivities, mergeCloudActivityRows, prepareCloudActivityRows } from '../js/cloud-activities.js';

test('prepares one stable user-scoped row per activity', () => {
    const rows = prepareCloudActivityRows('user-1', [
        { id: 'activity-1', startTimeLocal: '2026-11-23T08:15:00', name: 'K1' },
        { id: 42, date: '2026-11-22', name: 'C1' }
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].user_id, 'user-1');
    assert.equal(rows[0].record_id, 'activity-1');
    assert.equal(rows[0].activity_date, '2026-11-23');
    assert.equal(rows[0].payload.name, 'K1');
    assert.equal(rows[1].record_id, '42');
});

test('formats a useful activity label with its date for conflict messages', () => {
    assert.equal(
        getActivityConflictLabel({ name: 'K1 Sprint', startTimeLocal: '2026-11-23T08:15:00' }),
        'K1 Sprint · 23.11.2026'
    );
    assert.equal(
        getActivityConflictLabel({ name: 'Training ohne Datum' }),
        'Training ohne Datum · Datum nicht verfügbar'
    );
});

test('rejects activities without stable IDs and duplicate IDs', () => {
    assert.throws(() => prepareCloudActivityRows('user-1', [{ name: 'No ID' }]), /keine stabile ID/);
    assert.throws(() => prepareCloudActivityRows('user-1', [
        { id: 'duplicate' },
        { id: 'duplicate' }
    ]), /kommt mehrfach vor/);
});

test('merges split rows while retaining legacy-only activities', () => {
    const legacy = [
        { id: 'a', name: 'legacy A' },
        { id: 'b', name: 'legacy B' }
    ];
    const cloudRows = [
        { record_id: 'a', payload: { id: 'a', name: 'cloud A' } },
        { record_id: 'c', payload: { id: 'c', name: 'cloud C' } }
    ];
    const merged = mergeCloudActivities(legacy, cloudRows);
    assert.equal(merged.length, 3);
    assert.equal(merged.find(item => item.id === 'a').name, 'cloud A');
    assert.equal(merged.find(item => item.id === 'b').name, 'legacy B');
    assert.equal(merged.find(item => item.id === 'c').name, 'cloud C');
});


test('activity manifest prevents deleted cloud rows from reappearing', () => {
    const merged = mergeCloudActivities([], [
        { record_id: 'kept', payload: { id: 'kept' } },
        { record_id: 'deleted', payload: { id: 'deleted' } }
    ], ['kept']);
    assert.deepEqual(merged, [{ id: 'kept' }]);
});


test('loads cloud activities with sequential keyset pages instead of OFFSET', async () => {
    const source = ['a', 'b', 'c', 'd', 'e'].map(id => ({
        record_id: id,
        payload: { id, name: 'Activity ' + id }
    }));
    const cursors = [];
    const client = {
        from(table) {
            if (table === 'activity_deletions') {
                const query = {
                    select() { return this; },
                    eq() { return this; },
                    order() { return this; },
                    range() { return Promise.resolve({ data: [], error: null }); }
                };
                return query;
            }
            assert.equal(table, 'activities');
            const query = {
                countQuery: false,
                cursor: null,
                pageLimit: 0,
                select(_columns, options) {
                    this.countQuery = options?.head === true;
                    return this;
                },
                eq() { return this; },
                gt(column, value) {
                    assert.equal(column, 'record_id');
                    this.cursor = value;
                    cursors.push(value);
                    return this;
                },
                order(column, options) {
                    assert.equal(column, 'record_id');
                    assert.equal(options.ascending, true);
                    return this;
                },
                limit(value) {
                    this.pageLimit = value;
                    return this;
                },
                range() {
                    throw new Error('OFFSET pagination must not be used');
                },
                then(resolve, reject) {
                    const response = this.countQuery
                        ? { count: source.length, error: null }
                        : {
                            data: source
                                .filter(row => this.cursor === null || row.record_id > this.cursor)
                                .slice(0, this.pageLimit),
                            error: null
                        };
                    return Promise.resolve(response).then(resolve, reject);
                }
            };
            return query;
        }
    };

    const rows = await fetchCloudActivities(client, 'user-1', { pageSize: 2 });
    assert.deepEqual(rows.map(row => row.record_id), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(cursors, ['b', 'd']);
});


test('fetches only changed activity payloads since the persisted watermark', async () => {
    const watermark = '2026-11-25T12:03:00.000Z';
    const source = [
        { record_id: 'a', updated_at: '2026-11-25T11:59:30.000Z', payload: { id: 'a', name: 'A changed' } },
        { record_id: 'b', updated_at: '2026-11-25T12:02:00.000Z', payload: { id: 'b', name: 'B changed' } }
    ];
    const requestedRanges = [];
    const client = {
        from(table) {
            assert.equal(table, 'activities');
            const query = {
                selection: '',
                offset: 0,
                pageSize: 1,
                select(columns) { this.selection = columns; return this; },
                eq(column, value) { assert.equal(column, 'user_id'); assert.equal(value, 'user-1'); return this; },
                order() { return this; },
                limit() { return this; },
                maybeSingle() {
                    assert.equal(this.selection, 'updated_at');
                    return Promise.resolve({ data: { updated_at: watermark }, error: null });
                },
                gte(column, value) { assert.equal(column, 'updated_at'); this.fromDate = value; return this; },
                lte(column, value) { assert.equal(column, 'updated_at'); this.toDate = value; return this; },
                range(from, to) { this.offset = from; this.pageSize = to - from + 1; requestedRanges.push([from, to]); return this; },
                then(resolve, reject) {
                    const data = source.filter(row => row.updated_at >= this.fromDate && row.updated_at <= this.toDate)
                        .slice(this.offset, this.offset + this.pageSize);
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                }
            };
            return query;
        }
    };

    const result = await fetchCloudActivityDelta(client, 'user-1', '2026-11-25T12:00:00.000Z', { pageSize: 1 });
    assert.deepEqual(result.rows.map(row => row.record_id), ['a', 'b']);
    assert.equal(result.cursor, watermark);
    assert.deepEqual(requestedRanges, [[0, 0], [1, 1], [2, 2]]);
});

test('merges delta rows into the confirmed baseline without dropping unchanged activities', () => {
    const rows = mergeCloudActivityRows('user-1', [
        { id: 'a', name: 'A unchanged' },
        { id: 'b', name: 'B old' }
    ], [
        { record_id: 'b', payload: { id: 'b', name: 'B updated' } },
        { record_id: 'c', payload: { id: 'c', name: 'C new' } }
    ]);
    assert.deepEqual(rows.map(row => row.record_id).sort(), ['a', 'b', 'c']);
    assert.equal(rows.find(row => row.record_id === 'a').payload.name, 'A unchanged');
    assert.equal(rows.find(row => row.record_id === 'b').payload.name, 'B updated');
});
