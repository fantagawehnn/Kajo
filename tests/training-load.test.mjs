import test from 'node:test';
import assert from 'node:assert/strict';
import { computePerformanceTimeline } from '../js/calculations.js';
import { calculateGarminZoneLoad, getTrainingLoadData, getHeartRateZoneAnalysis, getAdaptiveRestingHr, calculateHeartRateReserveZones, getActivityLoadQualityStatus, summarizeTrainingLoadSourceCoverage } from '../js/training-load.js';
import { getGarminTelemetry, getGarminHeartRateSeries, summarizeTimeAxis } from '../js/data-source.js';

test('activity load quality labels distinguish measured, limited, estimated and unavailable values', () => {
    assert.equal(getActivityLoadQualityStatus({}, {
        source: 'heart-rate', dataQuality: 'standard', dataQualityLabel: 'Reguläre HF-Zeitreihe'
    }, 'garmin-zone').status, 'measured');
    assert.equal(getActivityLoadQualityStatus({}, {
        source: 'heart-rate', dataQuality: 'limited', dataQualityLabel: 'Eingeschränkte Näherung aus Garmin-Tagesaufzeichnung'
    }, 'garmin-zone').status, 'limited-measured');
    assert.equal(getActivityLoadQualityStatus({
        garminAnalysis: { kajo: { secondsByZone: [60, 60, 60, 0, 0] } }
    }, {
        source: 'heart-rate', dataQuality: 'standard'
    }, 'garmin-zone').status, 'cached-measured');
    assert.equal(getActivityLoadQualityStatus({}, {
        source: 'manual-estimate', value: 40
    }, 'garmin-unavailable').status, 'manual-estimate');
    assert.equal(getActivityLoadQualityStatus({ source: 'garmin' }, null, 'garmin-unavailable').status, 'unavailable');
});

test('activity load quality distinguishes missing HR data from missing zone prerequisites', () => {
    const noHr = getActivityLoadQualityStatus({ source: 'garmin' }, null, 'garmin-unavailable');
    assert.match(noHr.detail, /keine mindestens zwei plausible/);

    const hrButNoLoad = getActivityLoadQualityStatus({
        source: 'garmin',
        garminTelemetry: { hr: [130, 145, 160], time: [0, 20, 40] }
    }, null, 'garmin-unavailable');
    assert.equal(hrButNoLoad.status, 'unavailable');
    assert.match(hrButNoLoad.label, /HF-Daten vorhanden/);
    assert.match(hrButNoLoad.detail, /HF-Zonen- oder Zeitangaben/);
});

test('sRPE load is explicitly identified as subjective and not as heart-rate load', () => {
    const status = getActivityLoadQualityStatus({}, { value: 35 }, 'srpe');
    assert.equal(status.status, 'subjective');
    assert.match(status.detail, /nicht aus Herzfrequenzdaten/);
    assert.equal(getActivityLoadQualityStatus({}, null, 'srpe').status, 'unavailable');
});

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


test('selected-period load coverage separates measured, manual, missing and non-Garmin activities', () => {
    const records = [
        { id: 'g-manual', source: 'garmin', date: completedDay, manualTrainingLoadEstimate: {
            value: 42, source: 'manual-estimate', unit: 'KAJO-HF-Punkte'
        } },
        { id: 'g-missing', source: 'garmin', date: completedDay, duration: 45 },
        { id: 'g-native', source: 'garmin', date: completedDay, garminTrainingLoad: 30 },
        { id: 'csv', source: 'csv', date: completedDay, duration: 30 }
    ];
    const summary = summarizeTrainingLoadSourceCoverage(records, {}, {});
    assert.equal(summary.activityCount, 4);
    assert.equal(summary.garminEligibleCount, 3);
    assert.equal(summary.nonGarminCount, 1);
    assert.equal(summary.manualEstimateCount, 1);
    assert.equal(summary.missingUsableHeartRateCount, 2);
    assert.equal(summary.nativeLoadAvailableCount, 1);
    assert.equal(summary.currentHeartRateCount, 0);
    assert.equal(summary.heartRateWithoutLoadCount, 0);
});

test('selected-period sRPE coverage stays separate from Garmin heart-rate load', () => {
    const records = [
        { id: 'rpe-ok', source: 'manual', date: completedDay, duration: 60, perceivedEffort: 6 },
        { id: 'rpe-missing', source: 'manual', date: completedDay, duration: 45 }
    ];
    const summary = summarizeTrainingLoadSourceCoverage(records, { trainingLoadSource: 'srpe' }, {});
    assert.equal(summary.model, 'srpe');
    assert.equal(summary.srpeCount, 1);
    assert.equal(summary.missingSrpeCount, 1);
    assert.equal(summary.currentHeartRateCount, 0);
});

test('manual estimated KAJO load fills a missing-HR activity without treating it as zero', () => {
    const activity = {
        id: 'g-estimated-load', source: 'garmin', date: completedDay, duration: 60,
        manualTrainingLoadEstimate: {
            value: 42.5, source: 'manual-estimate', unit: 'KAJO-HF-Punkte'
        }
    };
    const result = getTrainingLoadData([activity], {}, {});
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.unit, 'KAJO-Load-Punkte (HF + Schätzung)');
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].value, 42.5);
    assert.equal(result.records[0].source, 'manual-estimate');
    assert.equal(result.records[0].dataQuality, 'estimated');
    const timeline = computePerformanceTimeline([activity], {
        garminActivityCoverageRanges: [covered(completedDay)]
    }, {});
    const day = timeline.find(item => item.date === completedDay);
    assert.equal(day.load, 42.5);
    assert.equal(day.estimatedLoadCount, 1);
    assert.equal(day.isProvisional, true);
    assert.match(day.statusLabel, /manuelle Load-Schätzung/);
});

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

test('timeline retains activity dates when every recorded activity has unavailable load', () => {
    const records = [{ id: 'g-no-load-anchor', source: 'garmin', date: completedDay, duration: 60 }];
    const timeline = computePerformanceTimeline(records, {}, {});
    const day = timeline.find(item => item.date === completedDay);
    assert.ok(day, 'recorded activity date must remain visible');
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
    assert.equal(day.ctl, null);
    assert.equal(day.atl, null);
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

test('Garmin native training load remains separate and is not used for CTL', () => {
    const records = [{ id: 'g-2', source: 'garmin', date: completedDay, garminTrainingLoad: 35 }];
    const result = getTrainingLoadData(records, {}, {});
    assert.equal(result.mode, 'garmin-unavailable');
    assert.equal(result.records.length, 0);
    assert.equal(result.comparisonRecords.length, 1);
    assert.equal(result.comparisonRecords[0].value, 35);
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
    assert.equal(day.loadMode, 'garmin-unavailable');
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

test('explicit RPE zero is a valid rating and produces zero sRPE load', () => {
    const records = [{ id: 'manual-rpe-zero', source: 'manual', date: completedDay, duration: 60, perceivedEffort: 0 }];
    const day = entryOn(completedDay, records, {
        trainingLoadSource: 'srpe',
        garminActivityCoverageRanges: [covered(completedDay)]
    });
    assert.equal(day.load, 0);
    assert.equal(day.dataStatus, 'complete');
    assert.equal(day.loadMode, 'srpe');
});

test('missing or null RPE is not interpreted as a valid zero rating', () => {
    for (const perceivedEffort of [null, undefined, '']) {
        const records = [{ id: 'manual-rpe-missing', source: 'manual', date: completedDay, duration: 60, perceivedEffort }];
        const result = getTrainingLoadData(records, { trainingLoadSource: 'srpe' }, {});
        assert.equal(result.records.length, 0);
        assert.equal(result.coverage.loadedActivityCount, 0);
    }
});

test('a day with multiple activities is incomplete if any activity lacks the selected load', () => {
    const records = [
        { id: 'g-3', source: 'garmin', date: completedDay, garminTrainingLoad: 30 },
        { id: 'g-4', source: 'garmin', date: completedDay, duration: 45 }
    ];
    const day = entryOn(completedDay, records, { garminActivityCoverageRanges: [covered(completedDay)] });
    assert.equal(day.load, null);
    assert.equal(day.activityCount, 2);
    assert.equal(day.loadActivityCount, 0);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
});

test('Garmin native load does not advance CTL or ATL without a KAJO zone load', () => {
    const records = [{ id: 'g-no-coverage', source: 'garmin', date: completedDay, garminTrainingLoad: 25 }];
    const timeline = computePerformanceTimeline(records, {
        garminActivityCoverageRanges: [covered(completedDay)]
    }, {});
    const day = timeline.find(item => item.date === completedDay);
    assert.equal(day.load, null);
    assert.equal(day.dataStatus, 'incomplete-activity-load');
    assert.equal(day.ctl, null);
    assert.equal(day.atl, null);
    assert.equal(day.tsb, null);
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
    assert.equal(day.dataStatus, 'incomplete-activity-load');
});

test('an unknown day breaks the CTL model instead of carrying load across the gap', () => {
    const threeDaysAgo = offsetDate(today, -3);
    const gapDate = offsetDate(today, -2);
    const records = [
        { id: 'manual-5', source: 'manual', date: threeDaysAgo, duration: 60, perceivedEffort: 5 },
        { id: 'manual-6', source: 'manual', date: completedDay, duration: 60, perceivedEffort: 4 }
    ];
    const timeline = computePerformanceTimeline(records, {
        trainingLoadSource: 'srpe',
        garminActivityCoverageRanges: [covered(threeDaysAgo), covered(completedDay)]
    }, {});
    const gap = timeline.find(day => day.date === gapDate);
    const current = timeline.find(day => day.date === completedDay);
    assert.equal(gap.load, null);
    assert.equal(gap.dataStatus, 'unknown');
    assert.equal(current.load, 240);
    assert.equal(current.ctl, Number((240 * (1 - Math.exp(-1 / 42))).toFixed(1)));
});

test('legacy automatic setting maps to the stable KAJO model and retains native load separately', () => {
    const activity = {
        id: 'g-auto-zone', source: 'garmin', date: completedDay, duration: 60,
        garminTrainingLoad: 35,
        garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] }
    };
    const result = getTrainingLoadData([activity], { trainingLoadSource: 'auto' }, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.equal(result.comparisonRecords.length, 1);
    assert.equal(result.comparisonRecords[0].value, 35);
});

test('KAJO primary model calculates HR-zone load when usable HR data exists', () => {
    const records = [{
        id: 'g-hr-1', source: 'garmin', date: completedDay, duration: 60,
        garminTelemetry: { hr: [145, 155, 165, 175], time: [0, 20, 40, 60] }
    }];
    const result = getTrainingLoadData(records, {}, { maxHr: 190, restingHr: 50 });
    assert.equal(result.mode, 'garmin-zone');
    assert.equal(result.records.length, 1);
    assert.ok(result.records[0].value > 0);
});

test('KAJO primary model does not fall back to sRPE when HR data is unavailable', () => {
    const records = [{
        id: 'g-rpe-1', source: 'garmin', date: completedDay,
        duration: 60, perceivedEffort: 7
    }];
    const result = getTrainingLoadData(records, {}, {});
    assert.equal(result.mode, 'garmin-unavailable');
    assert.equal(result.records.length, 0);
    assert.equal(result.comparisonRecords.length, 0);
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

test('KAJO primary model never mixes HR-zone and sRPE values', () => {
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
        '2026-01-01': { garminRhr: 48 },
        '2026-01-02': { garminRhr: 52 },
        '2026-01-03': { garminRhr: 49 },
        '2026-01-04': { garminRhr: 90 },
        '2026-01-05': { garminRhr: 50 },
        '2026-01-06': { garminRhr: 46 },
        '2026-01-07': { garminRhr: 44 },
        '2026-01-08': { garminRhr: 35 }
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
        '2026-01-01': { garminRhr: 50 },
        '2026-01-02': { garminRhr: 51 }
    };
    assert.equal(getAdaptiveRestingHr(checkins, '2026-01-02', 7, {}).value, null);
    const fallback = getAdaptiveRestingHr(checkins, '2026-01-02', 7, { restingHr: 49 });
    assert.equal(fallback.value, 49);
    assert.equal(fallback.source, 'profile-fallback');
    assert.equal(fallback.quality, 'limited');
});

test('each historical activity uses its own trailing adaptive resting-HR window', () => {
    const checkins = {
        '2026-01-01': { garminRhr: 50 },
        '2026-01-02': { garminRhr: 50 },
        '2026-01-03': { garminRhr: 50 },
        '2026-01-04': { garminRhr: 60 },
        '2026-01-05': { garminRhr: 60 },
        '2026-01-06': { garminRhr: 60 }
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
        Array.from({ length: 7 }, (_, index) => [offsetDate('2026-01-07', index - 6), { garminRhr: value }])
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
