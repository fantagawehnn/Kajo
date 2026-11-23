import assert from 'node:assert/strict';
import test from 'node:test';
import { getActivityConflictLabel, mergeCloudActivities, prepareCloudActivityRows } from '../js/cloud-activities.js';

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
