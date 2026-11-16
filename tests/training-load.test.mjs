import test from 'node:test';
import assert from 'node:assert/strict';
import { computePerformanceTimeline } from '../js/calculations.js';
import { calculateGarminZoneLoad, getTrainingLoadData, getHeartRateZoneAnalysis, getAdaptiveRestingHr, calculateHeartRateReserveZones } from '../js/training-load.js';
import { getGarminTelemetry, getGarminHeartRateSeries, summarizeTimeAxis } from '../js/data-source.js';
import { calculateReadiness } from '../js/recovery-calculations.js';

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

test('duplicate activity identity is counted once in daily load and activity coverage', () => {
    const activity = {
        id: 'duplicate-load', source: 'garmin', date: completedDay,
        startTime: completedDay + 'T08:00:00Z', garminTrainingLoad: 35
    };
    const duplicate = { ...activity };
    const day = entryOn(completedDay, [activity, duplicate], {
        garminActivityCoverageRanges: [covered(completedDay)]
    });
    assert.equal(day.load, 35);
    assert.equal(day.activityCount, 1);
    assert.equal(day.loadActivityCount, 1);
    assert.equal(day.dataStatus, 'complete');
});

test('same activity ID with a different date or start time remains a distinct session', () => {
    const firstDate = offsetDate(today, -2);
    const secondDate = completedDay;
    const records = [
        { id: 'reused-id', source: 'garmin', date: firstDate,
          startTime: firstDate + 'T08:00:00Z', garminTrainingLoad: 20 },
        { id: 'reused-id', source: 'garmin', date: secondDate,
          startTime: secondDate + 'T08:00:00Z', garminTrainingLoad: 30 },
        { id: 'same-day-distinct-start', source: 'garmin', date: secondDate,
          startTime: secondDate + 'T10:00:00Z', garminTrainingLoad: 15 }
    ];
    const timeline = computePerformanceTimeline(records, {
        garminActivityCoverageRanges: [covered(firstDate, secondDate)]
    }, {});
    const first = timeline.find(day => day.date === firstDate);
    const second = timeline.find(day => day.date === secondDate);
    assert.equal(first.activityCount, 1);
    assert.equal(first.load, 20);
    assert.equal(second.activityCount, 2);
    assert.equal(second.load, 45);
    assert.equal(second.loadActivityCount, 2);
});

test('repeated reference without an activity ID is counted once but separate anonymous sessions remain', () => {
    const activity = {
        source: 'garmin', date: completedDay, garminTrainingLoad: 12
    };
    const separate = {
        source: 'garmin', date: completedDay, garminTrainingLoad: 18
    };
    const day = entryOn(completedDay, [activity, activity, separate], {
        garminActivityCoverageRanges: [covered(completedDay)]
    });
    assert.equal(day.activityCount, 2);
    assert.equal(day.load, 30);
    assert.equal(day.loadActivityCount, 2);
});

test('Garmin native training load is used when available', () => {
    const records = [{ id: 'g-2', source: 'garmin', date: completedDay, garminTrainingLoad: 35 }];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, 35);
    assert.equal(day.dataStatus, 'complete');
    assert.equal(day.loadMode, 'garmin-native');
});

test('CTL and ATL leave the provisional phase after 126 fully covered days', () => {
    const startDay = offsetDate(today, -127);
    const lastCoveredDay = offsetDate(today, -2);
    const timeline = computePerformanceTimeline([], {
        garminActivityCoverageRanges: [covered(startDay, lastCoveredDay)]
    }, {});
    const last = timeline.find(day => day.date === lastCoveredDay);
    assert.equal(last.dataStatus, 'confirmed-rest');
    assert.equal(last.isProvisional, false);
});

test('CTL and ATL use daily exponential smoothing and TSB is their difference', () => {
    const firstDay = offsetDate(today, -3);
    const secondDay = offsetDate(today, -2);
    const records = [
        { id: 'ewma-1', source: 'garmin', date: firstDay, garminTrainingLoad: 42 },
        { id: 'ewma-2', source: 'garmin', date: secondDay, garminTrainingLoad: 84 }
    ];
    const timeline = computePerformanceTimeline(records, {
        garminActivityCoverageRanges: [covered(firstDay, secondDay)]
    }, {});
    const first = timeline.find(day => day.date === firstDay);
    const second = timeline.find(day => day.date === secondDay);
    const kCtl = 1 - Math.exp(-1 / 42);
    const kAtl = 1 - Math.exp(-1 / 7);
    const expectedCtl1 = 42 * kCtl;
    const expectedAtl1 = 42 * kAtl;
    const expectedCtl2 = expectedCtl1 + (84 - expectedCtl1) * kCtl;
    const expectedAtl2 = expectedAtl1 + (84 - expectedAtl1) * kAtl;
    assert.equal(first.ctl, Number(expectedCtl1.toFixed(1)));
    assert.equal(first.atl, Number(expectedAtl1.toFixed(1)));
    assert.equal(second.ctl, Number(expectedCtl2.toFixed(1)));
    assert.equal(second.atl, Number(expectedAtl2.toFixed(1)));
    assert.equal(second.tsb, Number((expectedCtl2 - expectedAtl2).toFixed(1)));
    assert.equal(second.isProvisional, true);
});

test('changing the selected source recalculates the complete history on one scale', () => {
    const firstDay = offsetDate(today, -3);
    const secondDay = offsetDate(today, -2);
    const records = [
        { id: 'source-1', source: 'garmin', date: firstDay, garminTrainingLoad: 40,
          garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] } },
        { id: 'source-2', source: 'garmin', date: secondDay, garminTrainingLoad: 60,
          garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] } }
    ];
    const settings = { garminActivityCoverageRanges: [covered(firstDay, secondDay)] };
    const native = computePerformanceTimeline(records, { ...settings, trainingLoadSource: 'garmin-native' }, {});
    const zone = computePerformanceTimeline(records, { ...settings, trainingLoadSource: 'kajo-zone' }, { maxHr: 190, restingHr: 50 });
    const nativeDays = native.filter(day => day.dataStatus === 'complete');
    const zoneDays = zone.filter(day => day.dataStatus === 'complete');
    assert.deepEqual(nativeDays.map(day => day.loadMode), ['garmin-native', 'garmin-native']);
    assert.deepEqual(zoneDays.map(day => day.loadMode), ['garmin-zone', 'garmin-zone']);
    assert.notEqual(nativeDays[0].load, zoneDays[0].load);
    assert.notEqual(nativeDays[1].ctl, zoneDays[1].ctl);
});

test('automatic source keeps Garmin Native Load when HR-zone coverage becomes larger', () => {
    const records = [
        { id: 'g-native', source: 'garmin', date: completedDay, garminTrainingLoad: 35 },
        { id: 'g-zone-1', source: 'garmin', date: completedDay, duration: 60,
          garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] } },
        { id: 'g-zone-2', source: 'garmin', date: completedDay, duration: 60,
          garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] } }
    ];
    const result = getTrainingLoadData(records, {}, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-native');
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].value, 35);
    assert.equal(result.coverage.availableZoneActivities, 2);
    assert.equal(result.coverage.availableNativeActivities, 1);
});

test('explicit Garmin Native Load selection never falls back to HR zones or sRPE', () => {
    const activity = {
        id: 'g-native-explicit', source: 'garmin', date: completedDay,
        duration: 60, perceivedEffort: 8,
        garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] }
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'garmin-native' }, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-unavailable');
    assert.equal(result.records.length, 0);
    assert.equal(result.coverage.excludedActivityCount, 1);
});

test('an explicit Garmin training load of zero remains a valid measured value', () => {
    const result = getTrainingLoadData([{
        id: 'g-zero-load', source: 'garmin', date: completedDay, garminTrainingLoad: 0
    }], {}, {});
    assert.equal(result.mode, 'garmin-native');
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].value, 0);
});

test('a missing Garmin training load remains unavailable instead of becoming zero', () => {
    const result = getTrainingLoadData([{
        id: 'g-missing-load', source: 'garmin', date: completedDay, garminTrainingLoad: null
    }], {}, {});
    assert.equal(result.mode, 'garmin-unavailable');
    assert.equal(result.records.length, 0);
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
    const result = getTrainingLoadData(records, {}, { maxHr: 190, restingHr: 50 });
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
    const result = getTrainingLoadData(records, {}, { maxHr: 190, restingHr: 50 });
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
    const load = getTrainingLoadData([activity], {}, { maxHr: 190, restingHr: 50 });
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
        minInterval: 1, medianInterval: 2, maxInterval: 3, span: 6,
        intervalsAtMost30: 3, intervalsOver30: 0,
        intervalSumAtMost30: 6, intervalSumOver30: 0
    });
});

test('time-axis summary counts intervals accepted and excluded by the current 30-unit load threshold', () => {
    const summary = summarizeTimeAxis([0, 5, 19, 54, 59]);
    assert.equal(summary.intervalsAtMost30, 3);
    assert.equal(summary.intervalsOver30, 1);
    assert.equal(summary.intervalSumAtMost30, 24);
    assert.equal(summary.intervalSumOver30, 35);
});

test('time-axis summary rejects nonnumeric, duplicate, and descending values', () => {
    assert.equal(summarizeTimeAxis([0, 1, 'x']).valid, false);
    assert.equal(summarizeTimeAxis([0, 1, 1]).valid, false);
    assert.equal(summarizeTimeAxis([0, 2, 1]).valid, false);
});

test('time-axis summary does not fabricate statistics for a missing axis', () => {
    assert.deepEqual(summarizeTimeAxis(null), { valid: false, pointCount: 0, intervalCount: 0 });
});


test('Garmin HR-zone load does not invent time after the final timestamp', () => {
    const activity = {
        id: 'g-tail', source: 'garmin', type: 'Kayaking', date: completedDay,
        garminTelemetry: {
            hr: [90, 110, 150, 170, 200],
            time: [0, 20, 40, 60, 80]
        }
    };
    const load = calculateGarminZoneLoad(activity, {
        heartRateZones: { Kayaking: [100, 120, 140, 160] }
    }, { maxHr: 190, restingHr: 50 });
    assert.ok(load);
    assert.equal(load.recordedSeconds, 80);
    assert.equal(load.totalSeconds, 80);
    assert.equal(load.totalSeconds, load.secondsByZone.reduce((sum, value) => sum + value, 0));
    assert.equal(load.value, 3);
    assert.equal(load.excludedIntervalCount, 0);
});


test('legacy global HR zones do not override adaptive Karvonen zones', () => {
    const activity = {
        id: 'g-global-zones', source: 'garmin', type: 'Kayaking', date: completedDay,
        garminTelemetry: { hr: [90, 110, 150, 170, 200], time: [0, 20, 40, 60, 80] }
    };
    const load = calculateGarminZoneLoad(activity, {
        heartRateZones: { global: [100, 120, 140, 160] }
    }, { maxHr: 190, restingHr: 50 });
    assert.ok(load);
    assert.equal(load.zoneSource, 'karvonen-adaptive');
    assert.deepEqual(load.zones, [134, 148, 162, 176]);
    assert.equal(load.totalSeconds, 80);
});

test('legacy sport-specific HR zones do not override adaptive Karvonen zones', () => {
    const activity = {
        id: 'g-sport-zones', source: 'garmin', type: 'Kayaking', date: completedDay,
        garminTelemetry: { hr: [90, 110, 150, 170, 200], time: [0, 20, 40, 60, 80] }
    };
    const load = calculateGarminZoneLoad(activity, {
        heartRateZones: {
            global: [100, 120, 140, 160],
            Kayaking: [105, 125, 145, 165]
        }
    }, { maxHr: 190, restingHr: 50 });
    assert.ok(load);
    assert.equal(load.zoneSource, 'karvonen-adaptive');
    assert.deepEqual(load.zones, [134, 148, 162, 176]);
});


test('Edwards TRIMP uses fixed %HRmax bands and excludes time below 50%', () => {
    const activity = {
        id: 'edwards-fixture', source: 'garmin', type: 'Running', date: completedDay,
        garminTelemetry: {
            hr: [90, 110, 130, 150, 170, 190, 190, 190],
            time: [0, 20, 40, 60, 80, 100, 120, 140]
        }
    };
    const result = getHeartRateZoneAnalysis([activity], {
        heartRateZones: { Running: [100, 120, 140, 160] }
    }, { maxHr: 200, restingHr: 50 });
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.records[0].edwards.secondsByZone, [20, 20, 20, 20, 40]);
    assert.equal(result.records[0].edwards.below50Seconds, 20);
    assert.equal(result.records[0].edwards.value, 6.7);
    assert.equal(result.records[0].kajo.value, 6);
    assert.equal(result.coverage.activitiesWithEdwards, 1);
});

test('Edwards TRIMP is unavailable without a valid profile maximum heart rate', () => {
    const activity = {
        id: 'edwards-no-max', source: 'garmin', date: completedDay,
        garminTelemetry: { hr: [120, 130, 140, 150], time: [0, 20, 40, 60] }
    };
    const result = getHeartRateZoneAnalysis([activity], {}, {});
    assert.equal(result.records.length, 0);
    assert.equal(result.coverage.activitiesWithoutUsableEdwardsMaxHr, 1);
});

test('Edwards TRIMP excludes telemetry gaps longer than 30 seconds', () => {
    const activity = {
        id: 'edwards-gap', source: 'garmin', date: completedDay,
        garminTelemetry: {
            hr: [110, 130, 150, 170, 190],
            time: [0, 20, 60, 80, 100]
        }
    };
    const result = getHeartRateZoneAnalysis([activity], {}, { maxHr: 200, restingHr: 50 });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].edwards.excludedIntervalCount, 1);
    assert.equal(result.records[0].edwards.excludedIntervalSeconds, 40);
    assert.equal(result.records[0].edwards.totalSeconds, 60);
});


test('adaptive resting HR uses the median of the trailing window and excludes future readings', () => {
    const checkins = {
        '2026-01-01': { rhr: 48 },
        '2026-01-02': { rhr: 52 },
        '2026-01-03': { rhr: 49 },
        '2026-01-04': { rhr: 90 },
        '2026-01-05': { rhr: 50 },
        '2026-01-06': { rhr: 46 },
        '2026-01-07': { rhr: 44 },
        '2026-01-08': { rhr: 35 }
    };
    const result = getAdaptiveRestingHr(checkins, '2026-01-07', 7, {});
    assert.equal(result.value, 49);
    assert.equal(result.readingCount, 7);
    assert.equal(result.source, 'rolling-median');
    assert.equal(result.quality, 'sufficient');
});

test('Karvonen zones use HR reserve rather than fixed percentages of maximum HR', () => {
    assert.deepEqual(calculateHeartRateReserveZones(200, 50), [140, 155, 170, 185]);
    assert.deepEqual(calculateHeartRateReserveZones(200, 55), [142, 157, 171, 186]);
    assert.equal(calculateHeartRateReserveZones(50, 200), null);
});

test('adaptive resting HR requires at least three readings unless profile fallback exists', () => {
    const checkins = {
        '2026-01-01': { rhr: 50 },
        '2026-01-02': { rhr: 51 }
    };
    assert.equal(getAdaptiveRestingHr(checkins, '2026-01-02', 7, {}).value, null);
    const fallback = getAdaptiveRestingHr(checkins, '2026-01-02', 7, { restingHr: 49 });
    assert.equal(fallback.value, 49);
    assert.equal(fallback.source, 'profile-fallback');
    assert.equal(fallback.quality, 'limited');
});

test('each historical activity uses its own trailing adaptive resting-HR window', () => {
    const checkins = {
        '2026-01-01': { rhr: 50 },
        '2026-01-02': { rhr: 50 },
        '2026-01-03': { rhr: 50 },
        '2026-01-04': { rhr: 60 },
        '2026-01-05': { rhr: 60 },
        '2026-01-06': { rhr: 60 }
    };
    const first = getAdaptiveRestingHr(checkins, '2026-01-03', 3, { maxHr: 200 });
    const later = getAdaptiveRestingHr(checkins, '2026-01-06', 3, { maxHr: 200 });
    assert.equal(first.value, 50);
    assert.equal(later.value, 60);
    assert.notDeepEqual(
        calculateHeartRateReserveZones(200, first.value),
        calculateHeartRateReserveZones(200, later.value)
    );
});

test('Garmin HR-zone load adapts Karvonen boundaries to each activity date RHR window', () => {
    const activity = {
        id: 'adaptive-rhr-load', source: 'garmin', type: 'C1', date: '2026-01-07',
        garminTelemetry: { hr: [145, 150, 160, 170], time: [0, 20, 40, 60] }
    };
    const makeCheckins = value => Object.fromEntries(
        Array.from({ length: 7 }, (_, index) => [offsetDate('2026-01-07', index - 6), { rhr: value }])
    );
    const profile = { maxHr: 200 };
    const settings = { heartRateZoneSettings: { restingHrWindowDays: 7 } };
    const rested = calculateGarminZoneLoad(activity, settings, profile, makeCheckins(50));
    const elevated = calculateGarminZoneLoad(activity, settings, profile, makeCheckins(60));
    assert.deepEqual(rested.zones, [140, 155, 170, 185]);
    assert.equal(rested.adaptiveRestingHr, 50);
    assert.equal(rested.restingHrSource, 'rolling-median');
    assert.deepEqual(elevated.zones, [144, 158, 172, 186]);
    assert.equal(elevated.adaptiveRestingHr, 60);
});



test('adaptive RHR prefers Garmin daily value over a legacy/manual rhr field', () => {
    const checkins = {
        '2026-01-01': { rhr: 62, garminRhr: 49 },
        '2026-01-02': { rhr: 63, garminRhr: 50 },
        '2026-01-03': { rhr: 61, garminRhr: 51 },
        '2026-01-04': { rhr: 64, garminRhr: 48 },
        '2026-01-05': { rhr: 60, garminRhr: 50 },
        '2026-01-06': { rhr: 62, garminRhr: 49 },
        '2026-01-07': { rhr: 63, garminRhr: 50 }
    };
    const result = getAdaptiveRestingHr(checkins, '2026-01-07', 7, {});
    assert.equal(result.value, 50);
    assert.equal(result.source, 'rolling-median');
});


test('default adaptive resting-HR window is 14 days and requires nine readings', () => {
    const eightReadings = Object.fromEntries(
        Array.from({ length: 8 }, (_, index) => [offsetDate('2026-01-14', index - 7), { garminRhr: 50 + (index % 2) }])
    );
    assert.equal(getAdaptiveRestingHr(eightReadings, '2026-01-14').value, null);

    const nineReadings = {
        ...eightReadings,
        '2026-01-06': { garminRhr: 50 }
    };
    const result = getAdaptiveRestingHr(nineReadings, '2026-01-14');
    assert.equal(result.value, 50);
    assert.equal(result.windowDays, 14);
    assert.equal(result.readingCount, 9);
});


test('manual KAJO load source uses weighted adaptive HR-zone load instead of Garmin native load', () => {
    const activity = {
        id: 'g-manual-kajo', source: 'garmin', date: completedDay, duration: 60,
        garminTrainingLoad: 999,
        garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] }
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'kajo-zone' }, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.unit, 'KAJO-HF-Punkte');
    assert.notEqual(result.records[0].value, 999);
    assert.equal(result.coverage.loadedActivityCount, 1);
});

test('manual KAJO load source does not fall back to Garmin native load or sRPE when HR zones are unavailable', () => {
    const activity = {
        id: 'g-manual-kajo-no-hr', source: 'garmin', date: completedDay,
        duration: 60, perceivedEffort: 8, garminTrainingLoad: 35
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'kajo-zone' }, {});
    assert.equal(result.mode, 'garmin-unavailable');
    assert.equal(result.records.length, 0);
    assert.equal(result.coverage.excludedActivityCount, 1);
});


test('cached compact KAJO zone analysis supports load without raw telemetry', () => {
    const cached = {
        version: 1, durationMinutes: 60, maxHr: 190, restingHr: 50,
        restingHrWindowDays: 14,
        kajo: { value: 123.4, unit: 'Punkte', method: 'Gewichtete HF-Zonenzeit',
            zoneSource: 'karvonen-adaptive', zones: [134, 148, 162, 176],
            secondsByZone: [600, 600, 600, 600, 600], totalSeconds: 3000 }
    };
    const activity = {
        id: 'g-cached-zone', source: 'garmin', date: completedDay, duration: 60,
        garminAnalysis: cached
    };
    const load = calculateGarminZoneLoad(activity, {}, { maxHr: 190, restingHr: 50 });
    assert.equal(load.value, 123.4);
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'kajo-zone' }, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records[0].value, 123.4);
});

test('cached Edwards zone analysis remains available without raw telemetry', () => {
    const edwards = { value: 80, secondsByZone: [60, 120, 180, 240, 300],
        totalSeconds: 900, below50Seconds: 0, maxHr: 190,
        durationSource: 'heart-rate-time-axis', boundaries: [50, 60, 70, 80, 90] };
    const activity = {
        id: 'g-cached-edwards', source: 'garmin', date: completedDay, duration: 60,
        garminAnalysis: { version: 1, durationMinutes: 60, maxHr: 190,
            restingHr: 50, restingHrWindowDays: 14, edwards }
    };
    const result = getHeartRateZoneAnalysis([activity], {}, { maxHr: 190, restingHr: 50 });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].edwards.value, 80);
});


test('readiness calculation is independent of the dashboard and reports insufficient data', () => {
    const result = calculateReadiness({}, '2026-01-10');
    assert.equal(result.score, null);
    assert.equal(result.enoughData, false);
    assert.equal(result.totalCount, 0);
});

test('readiness calculation uses personal recovery baselines without mixing training load', () => {
    const checkins = {
        '2026-01-01': { hrv: 70, rhr: 50, sleepDuration: 8 },
        '2026-01-02': { hrv: 72, rhr: 49, sleepDuration: 8 },
        '2026-01-03': { hrv: 68, rhr: 51, sleepDuration: 7.5 },
        '2026-01-04': { hrv: 71, rhr: 50, sleepDuration: 8 },
        '2026-01-05': { hrv: 69, rhr: 50, sleepDuration: 8 },
        '2026-01-06': { hrv: 75, rhr: 48, sleepDuration: 8.5, sleepScore: 90, fatigue: 2 },
        '2026-01-07': { hrv: 72, rhr: 49, sleepDuration: 8, sleepScore: 85, fatigue: 3 },
        '2026-01-08': { hrv: 70, rhr: 50, sleepDuration: 8, sleepScore: 88, fatigue: 2 },
        '2026-01-09': { hrv: 73, rhr: 49, sleepDuration: 8.2, sleepScore: 92, fatigue: 2 },
        '2026-01-10': { hrv: 74, rhr: 48, sleepDuration: 8.1, sleepScore: 91, fatigue: 2 }
    };
    const result = calculateReadiness(checkins, '2026-01-10');
    assert.equal(result.enoughData, true);
    assert.equal(result.objective.some(item => item.key === 'hrv'), true);
    assert.equal(result.objective.some(item => item.key === 'rhr'), true);
    assert.equal(result.objective.some(item => item.key === 'sleepDuration'), true);
    assert.equal(result.objective.some(item => item.key === 'trainingLoad'), false);
    assert.equal(result.objectiveCount, 4);
    assert.equal(result.subjective.some(item => item.key === 'fatigue'), true);
    assert.ok(result.score >= 0 && result.score <= 100);
});
