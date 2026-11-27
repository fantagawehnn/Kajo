import assert from 'node:assert/strict';
import test from 'node:test';
import {
    mergeCloudActivityRows,
    mergeCloudActivities,
    syncCloudActivities
} from '../js/cloud-activities.js';

test('a deletion tombstone replaces the baseline row and removes it from the merged activity list', () => {
    const baseline = [
        { id: 'garmin-101', date: '2026-11-20', name: 'Gelöschte Einheit' },
        { id: 'manual-2', date: '2026-11-21', name: 'Behaltene Einheit' }
    ];
    const tombstone = {
        record_id: 'garmin-101',
        payload: null,
        deleted_at: '2026-11-27T08:00:00.000Z',
        activity_date: '2026-11-20',
        garmin_activity_id: '101'
    };
    const cloudRows = mergeCloudActivityRows('user-1', baseline, [tombstone]);
    assert.equal(cloudRows.find(row => row.record_id === 'garmin-101')?.deleted_at, tombstone.deleted_at);
    assert.equal(cloudRows.find(row => row.record_id === 'garmin-101')?.payload, null);

    const merged = mergeCloudActivities(baseline, cloudRows, ['garmin-101', 'manual-2']);
    assert.deepEqual(merged.map(row => row.id), ['manual-2']);
});

test('a stale legacy snapshot cannot reintroduce an activity with a tombstone', () => {
    const legacy = [{ id: 'manual-9', date: '2026-11-19', name: 'Old snapshot' }];
    const tombstones = [{
        record_id: 'manual-9',
        payload: null,
        deleted_at: '2026-11-27T08:00:00.000Z'
    }];
    assert.deepEqual(mergeCloudActivities(legacy, tombstones, ['manual-9']), []);
});

test('cloud activity upload skips rows that already have permanent deletion tombstones', async () => {
    const uploadedBatches = [];
    const client = {
        from(table) {
            const builder = {
                select() { return this; },
                eq() { return this; },
                order() { return this; },
                async range() {
                    return {
                        data: table === 'activity_deletions'
                            ? [{ record_id: 'garmin-101', garmin_activity_id: '101', activity_date: '2026-11-20', deleted_at: '2026-11-27T08:00:00Z' }]
                            : [],
                        error: null
                    };
                },
                upsert(rows) {
                    uploadedBatches.push({ table, rows });
                    return {
                        async select() {
                            return { data: rows.map(row => ({ record_id: row.record_id })), error: null };
                        }
                    };
                }
            };
            return builder;
        }
    };
    const result = await syncCloudActivities(client, 'user-1', [
        { id: 'garmin-101', date: '2026-11-20', name: 'Deleted' },
        { id: 'manual-2', date: '2026-11-21', name: 'Active' }
    ]);
    assert.equal(result.skippedDeleted, 1);
    assert.equal(result.active, 1);
    assert.equal(uploadedBatches.length, 1);
    assert.equal(uploadedBatches[0].table, 'activities');
    assert.deepEqual(uploadedBatches[0].rows.map(row => row.record_id), ['manual-2']);
});
