import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildActivityDeletionTombstone,
    getActivityDeletionDate,
    getActivityDeletionGarminId,
    getActivityDeletionRecordId
} from '../js/activity-deletions.js';

test('creates an account tombstone only for an activity dated before today', () => {
    const activity = {
        id: 'garmin-12345',
        date: '2026-11-25',
        sourceRefs: { garminActivityId: '12345' }
    };
    const tombstone = buildActivityDeletionTombstone(activity, '2026-11-27');
    assert.equal(tombstone.record_id, 'garmin-12345');
    assert.equal(tombstone.activity_date, '2026-11-25');
    assert.equal(tombstone.garmin_activity_id, '12345');
    assert.equal('deleted_at' in tombstone, false);
});

test('does not create a tombstone for today, a future day, or an unknown date', () => {
    assert.equal(buildActivityDeletionTombstone({ id: 'a', date: '2026-11-27' }, '2026-11-27'), null);
    assert.equal(buildActivityDeletionTombstone({ id: 'b', date: '2026-11-28' }, '2026-11-27'), null);
    assert.equal(buildActivityDeletionTombstone({ id: 'c', name: 'No date' }, '2026-11-27'), null);
});

test('extracts stable IDs and local calendar dates from supported activity fields', () => {
    const activity = { activityId: 456, startTimeLocal: '2026-11-20 07:30:00' };
    assert.equal(getActivityDeletionRecordId(activity), '456');
    assert.equal(getActivityDeletionDate(activity), '2026-11-20');
    assert.equal(getActivityDeletionGarminId({ id: 'garmin-456' }), '456');
    assert.equal(getActivityDeletionGarminId({ id: 'manual-456' }), null);
});
