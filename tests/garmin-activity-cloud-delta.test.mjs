import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseGarminActivitySeenMap,
    getGarminActivityRowsNeedingPayload,
    mergeGarminActivitySeenMap
} from '../js/garmin-activity-cloud-delta.js';

test('parses only valid per-activity cloud timestamps', () => {
    assert.deepEqual(
        parseGarminActivitySeenMap(JSON.stringify({
            '123': '2026-11-25T10:00:00.000Z',
            'bad': 'not-a-date',
            '456': 123
        })),
        { '123': '2026-11-25T10:00:00.000Z' }
    );
    assert.deepEqual(parseGarminActivitySeenMap('{broken'), {});
});

test('only unseen or changed activity timestamps require full preview payloads', () => {
    const metadata = [
        { garmin_activity_id: '1', updated_at: '2026-11-25T10:00:00.000Z' },
        { garmin_activity_id: '2', updated_at: '2026-11-25T11:00:00.000Z' },
        { garmin_activity_id: '3', updated_at: '2026-11-25T12:00:00.000Z' }
    ];
    const seen = {
        '1': '2026-11-25T10:00:00.000Z',
        '2': '2026-11-25T10:30:00.000Z'
    };
    assert.deepEqual(
        getGarminActivityRowsNeedingPayload(metadata, seen, new Set(['1', '2'])).map(row => row.garmin_activity_id),
        ['2', '3']
    );
});

test('seen timestamp map retains only the one-day overlap and adds current metadata', () => {
    const old = {
        'old': '2026-11-20T10:00:00.000Z',
        'recent': '2026-11-25T09:00:00.000Z'
    };
    const metadata = [
        { garmin_activity_id: 'new', updated_at: '2026-11-25T12:00:00.000Z' }
    ];
    assert.deepEqual(
        mergeGarminActivitySeenMap(old, metadata, '2026-11-25T12:00:00.000Z'),
        {
            'recent': '2026-11-25T09:00:00.000Z',
            'new': '2026-11-25T12:00:00.000Z'
        }
    );
});

test('a cloud activity is downloaded again if its local activity is missing', () => {
    const metadata = [
        { garmin_activity_id: '1', updated_at: '2026-11-25T10:00:00.000Z' }
    ];
    const seen = { '1': '2026-11-25T10:00:00.000Z' };
    assert.equal(getGarminActivityRowsNeedingPayload(metadata, seen, new Set()).length, 1);
});
