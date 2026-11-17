import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractGarminDailyHeartRateSamples,
    selectGarminDailyHeartRateWindow
} from '../js/daily-heart-rate.js';
import { getActivityTelemetry, getGarminHeartRateSeries, isGarminActivity } from '../js/data-source.js';
import { getTrainingLoadData } from '../js/training-load.js';

const payload = {
    heartRateValueDescriptors: [
        { key: 'timestamp', index: 0 },
        { key: 'heartrate', index: 1 }
    ],
    heartRateValues: [
        [1763337600000, 100],
        [1763337660000, 120],
        [1763337720000, 260],
        [1763337780000, 140]
    ]
};

test('daily Garmin heart-rate parser follows descriptor indexes and rejects implausible values', () => {
    assert.deepEqual(extractGarminDailyHeartRateSamples(payload), [
        { timestampMs: 1763337600000, hr: 100 },
        { timestampMs: 1763337660000, hr: 120 },
        { timestampMs: 1763337780000, hr: 140 }
    ]);
});

test('daily heart-rate window is sorted, deduplicated and inclusive at both boundaries', () => {
    const start = 1763337660000;
    const end = 1763337780000;
    const selected = selectGarminDailyHeartRateWindow([
        { payload },
        { payload: { ...payload, heartRateValues: [[1763337660000, 121]] } }
    ], start, end);
    assert.deepEqual(selected, [
        { timestampMs: 1763337660000, hr: 121 },
        { timestampMs: 1763337780000, hr: 140 }
    ]);
});

test('daily HR series is exposed on the existing Garmin activity without replacing its identity', () => {
    const activity = {
        id: '123456789',
        source: 'garmin',
        date: '2026-11-17',
        duration: 60,
        distance: 8.4,
        name: 'Manuell in Garmin eingetragenes Training',
        dailyHeartRateSeries: {
            hr: [140, 150, 160, 170],
            time: [0, 20, 40, 60],
            source: 'garmin-daily-heart-rate'
        }
    };
    assert.equal(isGarminActivity(activity), true);
    assert.deepEqual(getActivityTelemetry(activity).hr, [140, 150, 160, 170]);
    assert.deepEqual(getGarminHeartRateSeries(activity).time, [0, 20, 40, 60]);
    assert.equal(activity.id, '123456789');
    assert.equal(activity.distance, 8.4);
    assert.equal(activity.duration, 60);
});

test('daily HR series on an existing Garmin activity is eligible for the explicit KAJO HR-zone load model', () => {
    const activity = {
        id: '123456790',
        source: 'garmin',
        date: '2026-11-17',
        duration: 1,
        dailyHeartRateSeries: {
            hr: [140, 150, 160, 170],
            time: [0, 20, 40, 60],
            source: 'garmin-daily-heart-rate'
        }
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'kajo-zone' }, {
        maxHr: 190,
        restingHr: 50
    });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.ok(result.records[0].value > 0);
});

test('sparse daily HR samples on an existing activity are not interpolated into false training load', () => {
    const activity = {
        id: '123456791',
        source: 'garmin',
        date: '2026-11-17',
        duration: 6,
        dailyHeartRateSeries: {
            hr: [140, 150, 160, 170],
            time: [0, 120, 240, 360],
            source: 'garmin-daily-heart-rate'
        }
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'kajo-zone' }, {
        maxHr: 190,
        restingHr: 50
    });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.ok(result.records[0].value > 0);
    assert.equal(result.records[0].dataQuality, 'limited');
    assert.equal(result.records[0].durationSource, 'daily-heart-rate-sample-estimate');
    assert.equal(result.records[0].samplingIntervalSeconds, 120);
});

test('unmarked manual telemetry remains excluded', () => {
    const activity = { source: 'manual', telemetry: { hr: [120, 130], time: [0, 10] } };
    assert.equal(getActivityTelemetry(activity), null);
    assert.equal(getGarminHeartRateSeries(activity), null);
});
