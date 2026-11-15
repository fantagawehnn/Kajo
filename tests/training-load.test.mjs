import test from 'node:test';
import assert from 'node:assert/strict';
import { computePerformanceTimeline } from '../js/calculations.js';
import { getTrainingLoadData } from '../js/training-load.js';
import { getGarminTelemetry, getGarminHeartRateSeries, summarizeTimeAxis } from '../js/data-source.js';

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function offsetDate(key, offset) {
    const date = new Date(key + 'T12:00:00');
    date.setDate(date.getDate() + offset);
    return dateKey(date);
}

function covered(startDate, endDate = startDate) {
    return { startDate, endDate, status: 'complete', source: 'garmin_activity_list' };
}

function entryOn(date, records, settings) {
    const timeline = computePerformanceTimeline(records, settings, {});
    return timeline.find(day => day.date === date);
}

const today = dateKey(new Date());
const completedDay = offsetDate(today, -1);

test('generic telemetry is never used as a Garmin fallback', () => {
    const activity = {
        source: 'garmin',
        telemetry: { hr: [120, 130], time: [0, 1] }
    };
    assert.equal(getGarminTelemetry(activity), null);
});

test('only the separated Garmin telemetry field is exposed for Garmin activities', () => {
    const telemetry = { hr: [120, 130], time: [0, 1] };
    const activity = { source: 'garmin', telemetry: { hr: [90, 100] }, garminTelemetry: telemetry };
    assert.equal(getGarminTelemetry(activity), telemetry);
});

test('a non-Garmin activity cannot expose telemetry through the Garmin accessor', () => {
    const activity = {
        source: 'csv',
        telemetry: { hr: [90, 100] },
        garminTelemetry: { hr: [120, 130] }
    };
    assert.equal(getGarminTelemetry(activity), null);
});

test('successfully synchronized day without activities is a confirmed rest day', () => {
    const day = entryOn(completedDay, [], { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.ok(day);
    assert.equal(day.load, 0);
    assert.equal(day.dataStatus, 'confirmed-rest');
});

test('Garmin activity without a calculable load remains unknown', () => {
    const records = [{ id: 'g-1', source: 'garmin', date: completedDay, duration: 60 }];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
});

test('non-Garmin activity prevents a false confirmed-rest day', () => {
    const records = [{ id: 'csv-1', source: 'csv', date: completedDay, duration: 60, tss: 80 }];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
    assert.equal(day.loadMode, 'garmin-unavailable');
});

test('Garmin native training load is used when available', () => {
    const records = [{ id: 'g-2', source: 'garmin', date: completedDay, garminTrainingLoad: 35 }];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, 35);
    assert.equal(day.dataStatus, 'complete');
    assert.equal(day.loadMode, 'garmin-native');
});

test('manual session-RPE load is calculated as duration in minutes times RPE', () => {
    const records = [{ id: 'manual-1', source: 'manual', date: completedDay, duration: 60, perceivedEffort: 6 }];
    const settings = {
        trainingLoadSource: 'srpe',
        garminActivityCoverageRanges: [covered(completedDay)]
    };
    const day = entryOn(completedDay, records, settings);
    assert.equal(day.load, 360);
    assert.equal(day.dataStatus, 'complete');
    assert.equal(day.loadMode, 'srpe');
});

test('a day with multiple activities is incomplete if any activity lacks the selected load', () => {
    const records = [
        { id: 'g-3', source: 'garmin', date: completedDay, garminTrainingLoad: 30 },
        { id: 'g-4', source: 'garmin', date: completedDay, duration: 45 }
    ];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, null);
    assert.equal(day.activityCount, 2);
    assert.equal(day.loadActivityCount, 1);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
});

test('without confirmed activity-list coverage measured activity loads remain visible', () => {
    const records = [{ id: 'g-no-coverage', source: 'garmin', date: completedDay, garminTrainingLoad: 25 }];
    const timeline = computePerformanceTimeline(records, {}, {});
    const day = timeline.find(item => item.date === completedDay);
    assert.equal(day.load, 25);
    assert.equal(day.dataStatus, 'activity-load-only');
    assert.equal(day.ctl, null);
});

test('a day outside confirmed activity-list coverage remains unknown', () => {
    const twoDaysAgo = offsetDate(today, -2);
    const timeline = computePerformanceTimeline([], {
        garminActivityCoverageRanges: [covered(twoDaysAgo)]
    }, {});
    const day = timeline.find(item => item.date === today);
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'unknown');
});

test('current-day activity remains unknown until the day is fully covered', () => {
    const records = [{ id: 'g-current', source: 'garmin', date: today, garminTrainingLoad: 50 }];
    const day = entryOn(today, records, {
        garminActivityCoverageRanges: [covered(completedDay)]
    });
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'unknown');
});

test('an unknown day breaks the CTL model instead of carrying load across the gap', () => {
    const threeDaysAgo = offsetDate(today, -3);
    const gapDate = offsetDate(today, -2);
    const records = [
        { id: 'g-5', source: 'garmin', date: threeDaysAgo, garminTrainingLoad: 50 },
        { id: 'g-6', source: 'garmin', date: completedDay, garminTrainingLoad: 40 }
    ];
    const timeline = computePerformanceTimeline(records, {
        garminActivityCoverageRanges: [covered(threeDaysAgo), covered(completedDay)]
    }, {});
    const gap = timeline.find(day => day.date === gapDate);
    const current = timeline.find(day => day.date === completedDay);
    assert.equal(gap.load, null);
    assert.equal(gap.dataStatus, 'unknown');
    assert.equal(current.load, 40);
    assert.equal(current.ctl, Number((40 * (1 - Math.exp(-1 / 42))).toFixed(1)));
});

test('automatic model uses HR-zone load when native Garmin load is absent', () => {
    const records = [{
        id: 'g-hr-1', source: 'garmin', date: completedDay, duration: 60,
        garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] }
    }];
    const result = getTrainingLoadData(records, {}, { maxHr: 190 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.ok(result.records[0].value > 0);
});

test('automatic model falls back to sRPE when no Garmin load can be calculated', () => {
    const records = [{
        id: 'g-rpe-1', source: 'garmin', date: completedDay,
        duration: 60, perceivedEffort: 7
    }];
    const result = getTrainingLoadData(records, {}, {});
    assert.equal(result.mode, 'srpe');
    assert.equal(result.records[0].value, 420);
});

test('activity-day load remains visible without confirmed Garmin coverage', () => {
    const records = [{
        id: 'manual-rpe-1', source: 'manual', date: completedDay,
        duration: 50, perceivedEffort: 6
    }];
    const timeline = computePerformanceTimeline(records, { trainingLoadSource: 'srpe' }, {});
    const day = timeline.find(item => item.date === completedDay);
    assert.equal(day.load, 300);
    assert.equal(day.dataStatus, 'activity-load-only');
    assert.equal(day.ctl, null);
    assert.equal(day.atl, null);
});

test('automatic fallback never mixes HR-zone and sRPE values', () => {
    const records = [
        { id: 'g-hr-2', source: 'garmin', date: completedDay, duration: 60,
          garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] } },
        { id: 'g-rpe-2', source: 'garmin', date: completedDay, duration: 30, perceivedEffort: 8 }
    ];
    const result = getTrainingLoadData(records, {}, { maxHr: 190 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].activity.id, 'g-hr-2');
});


test('Garmin JSON metricSeries heart rate is normalized for load calculations', () => {
    const activity = {
        source: 'garmin', date: completedDay, duration: 60,
        garminTelemetry: {
            metricSeriesTime: [0, 20, 40, 60],
            metricSeries: {
                directHeartRate: { label: 'Heart Rate', values: [145, 155, 165, 175] }
            }
        }
    };
    const series = getGarminHeartRateSeries(activity);
    assert.deepEqual(series.hr, [145, 155, 165, 175]);
    assert.deepEqual(series.time, [0, 20, 40, 60]);
    assert.equal(series.source, 'metricSeries:directHeartRate');
    const load = getTrainingLoadData([activity], {}, { maxHr: 190 });
    assert.equal(load.mode, 'garmin-zone');
    assert.equal(load.records.length, 1);
    assert.ok(load.records[0].value > 0);
});


test('a partial top-level HR array does not mask an aligned metricSeries', () => {
    const activity = {
        source: 'garmin',
        garminTelemetry: {
            hr: [150, 160, 170],
            metricSeries: {
                directHeartRate: { label: 'Heart Rate', values: [140, 150, 160], time: [0, 15, 30] }
            }
        }
    };
    const series = getGarminHeartRateSeries(activity);
    assert.equal(series.source, 'metricSeries:directHeartRate');
    assert.deepEqual(series.hr, [140, 150, 160]);
    assert.deepEqual(series.time, [0, 15, 30]);
});

test('metricSeries accepts its own aligned time axis', () => {
    const activity = {
        source: 'garmin',
        garminTelemetry: {
            metricSeries: {
                heartRate: { label: 'Heart Rate', values: [120, 130, 140], time: [0, 10, 20] }
            }
        }
    };
    const series = getGarminHeartRateSeries(activity);
    assert.deepEqual(series.time, [0, 10, 20]);
});

test('metricSeriesTime is used only when it matches the HR series length', () => {
    const activity = {
        source: 'garmin',
        garminTelemetry: {
            metricSeriesTime: [0, 10, 20],
            metricSeries: {
                directHeartRate: { label: 'Heart Rate', values: [120, 130, 140] }
            }
        }
    };
    assert.deepEqual(getGarminHeartRateSeries(activity).time, [0, 10, 20]);
});

test('missing time axis remains explicit and does not fabricate timestamps', () => {
    const activity = {
        source: 'garmin',
        garminTelemetry: {
            metricSeries: {
                directHeartRate: { label: 'Heart Rate', values: [120, 130, 140] }
            }
        }
    };
    const series = getGarminHeartRateSeries(activity);
    assert.deepEqual(series.hr, [120, 130, 140]);
    assert.equal(series.time, null);
});

test('mismatched and non-monotonic time axes are rejected', () => {
    const mismatched = {
        source: 'garmin',
        garminTelemetry: {
            metricSeriesTime: [0, 10],
            metricSeries: {
                directHeartRate: { label: 'Heart Rate', values: [120, 130, 140] }
            }
        }
    };
    assert.equal(getGarminHeartRateSeries(mismatched).time, null);

    const nonMonotonic = {
        source: 'garmin',
        garminTelemetry: {
            time: [0, 20, 10],
            hr: [120, 130, 140]
        }
    };
    assert.equal(getGarminHeartRateSeries(nonMonotonic).time, null);
});

test('absolute timestamps are not silently converted to relative seconds', () => {
    const activity = {
        source: 'garmin',
        garminTelemetry: {
            time: [1794700000000, 1794700001000, 1794700002000],
            hr: [120, 130, 140]
        }
    };
    const series = getGarminHeartRateSeries(activity);
    assert.deepEqual(series.time, activity.garminTelemetry.time);
    const load = getTrainingLoadData([{
        ...activity, date: completedDay, duration: 60
    }], {}, { maxHr: 190 });
    assert.equal(load.mode, 'garmin-unavailable');
});


test('time-axis summary reports spacing and coverage without inferring units', () => {
    assert.deepEqual(summarizeTimeAxis([100, 101, 103, 106]), {
        valid: true, pointCount: 4, intervalCount: 3,
        minInterval: 1, medianInterval: 2, maxInterval: 3, span: 6
    });
});

test('time-axis summary rejects nonnumeric, duplicate, and descending values', () => {
    assert.equal(summarizeTimeAxis([0, 1, 'x']).valid, false);
    assert.equal(summarizeTimeAxis([0, 1, 1]).valid, false);
    assert.equal(summarizeTimeAxis([0, 2, 1]).valid, false);
});

test('time-axis summary does not fabricate statistics for a missing axis', () => {
    assert.deepEqual(summarizeTimeAxis(null), { valid: false, pointCount: 0, intervalCount: 0 });
});
