import assert from 'node:assert/strict';
import test from 'node:test';
import {
    mergeGarminActivityRows,
    selectChangedGarminActivityRows,
    stableJsonStringify
} from '../supabase/functions/garmin-personal/activity-upsert-plan.js';

test('stable JSON comparison ignores object key ordering but preserves array order', () => {
    assert.equal(
        stableJsonStringify({ b: 2, a: { y: 1, x: 0 } }),
        stableJsonStringify({ a: { x: 0, y: 1 }, b: 2 })
    );
    assert.notEqual(stableJsonStringify([1, 2]), stableJsonStringify([2, 1]));
});

test('unchanged Garmin previews are excluded from database upserts', () => {
    const incoming = [{
        garmin_activity_id: '123',
        activity: { activityId: 123, activityName: 'Paddling' },
        start_time: '2026-11-25T09:00:00+00:00',
        activity_type: 'kayaking',
        duration_seconds: 3600,
        distance_meters: 12000,
        updated_at: 'new timestamp'
    }];
    const existing = [{
        garmin_activity_id: '123',
        activity: { activityName: 'Paddling', activityId: 123 },
        start_time: '2026-11-25T09:00:00.000Z',
        activity_type: 'kayaking',
        duration_seconds: 3600,
        distance_meters: 12000
    }];
    assert.deepEqual(selectChangedGarminActivityRows(incoming, existing), []);
});

test('new and actually changed Garmin previews are retained for upsert', () => {
    const existing = [{
        garmin_activity_id: '123',
        activity: { activityId: 123, activityName: 'Paddling' },
        start_time: '2026-11-25T09:00:00.000Z',
        activity_type: 'kayaking',
        duration_seconds: 3600,
        distance_meters: 12000
    }];
    const incoming = [
        { ...existing[0], activity: { activityId: 123, activityName: 'Updated paddling' } },
        { ...existing[0], garmin_activity_id: '456' },
        { ...existing[0], garmin_activity_id: '789', distance_meters: 13000 }
    ];
    assert.deepEqual(
        selectChangedGarminActivityRows(incoming, existing).map(row => row.garmin_activity_id),
        ['123', '456', '789']
    );
});

test('partial Garmin refreshes preserve previously known non-empty fields', () => {
    const existing = [{
        garmin_activity_id: '123',
        activity: {
            activityId: 123,
            activityName: 'Paddling',
            averageHR: 148,
            trainingLoad: 92,
            activityType: 'kayaking'
        },
        start_time: '2026-11-25T09:00:00.000Z',
        activity_type: 'kayaking',
        duration_seconds: 3600,
        distance_meters: 12000
    }];
    const incoming = [{
        garmin_activity_id: '123',
        activity: {
            activityId: 123,
            activityName: 'Paddling updated',
            averageHR: null,
            trainingLoad: undefined,
            activityType: null
        },
        start_time: null,
        activity_type: null,
        duration_seconds: null,
        distance_meters: null
    }];

    const [merged] = mergeGarminActivityRows(incoming, existing);
    assert.equal(merged.activity.activityName, 'Paddling updated');
    assert.equal(merged.activity.averageHR, 148);
    assert.equal(merged.activity.trainingLoad, 92);
    assert.equal(merged.activity.activityType, 'kayaking');
    assert.equal(merged.start_time, existing[0].start_time);
    assert.equal(merged.duration_seconds, 3600);
    assert.equal(merged.distance_meters, 12000);
    assert.equal(selectChangedGarminActivityRows(incoming, existing).length, 1);
});

test('new Garmin activities are not modified by the preservation merge', () => {
    const incoming = [{
        garmin_activity_id: '456',
        activity: { activityId: 456, averageHR: null },
        start_time: null,
        activity_type: null,
        duration_seconds: null,
        distance_meters: null
    }];
    assert.deepEqual(mergeGarminActivityRows(incoming, []), incoming);
});
