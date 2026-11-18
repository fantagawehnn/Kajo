import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyGarminExportFile,
    collectGarminSummaryActivities,
    mapGarminExportActivity,
    collectGarminActivityNames
} from '../js/garmin-export-import-core.js';

test('classifies Garmin export files by source path', () => {
    assert.equal(classifyGarminExportFile('DI_CONNECT/DI-Connect-Fitness/Activities/SummarizedActivities.json'), 'activities');
    assert.equal(classifyGarminExportFile('DI_CONNECT/DI-Connect-Wellness/Sleep.json'), 'recovery');
    assert.equal(classifyGarminExportFile('DI_CONNECT/DI-Connect-Fitness/MetricsMaxMetData.json'), 'performance');
    assert.equal(classifyGarminExportFile('unknown.json'), 'other');
});

test('collects summarized activity records from nested export objects', () => {
    const source = { bundle: { summarizedActivitiesExport: [{ activityId: 123 }, { activityId: 456 }] } };
    assert.deepEqual(collectGarminSummaryActivities(source).map(item => item.activityId), [123, 456]);
});

test('maps Garmin activity summary without trusting Garmin profile as actual sport', () => {
    const raw = {
        activityId: 123,
        activityName: 'Morgentraining',
        activityType: { typeKey: 'RUNNING' },
        startTimeLocal: '2025-04-01T08:30:00',
        startTimeGmt: '2025-04-01T06:30:00',
        duration: 3600,
        distance: 10000,
        avgHr: 145,
        maxHr: 178
    };
    const mapped = mapGarminExportActivity(raw, name => name === 'Morgentraining' ? 'Workout' : 'Run', () => 'training');
    assert.equal(mapped.id, 'garmin-123');
    assert.equal(mapped.type, 'Workout');
    assert.equal(mapped.garminSportLabel, 'RUNNING');
    assert.equal(mapped.duration, 60);
    assert.equal(mapped.distance, 10);
    assert.equal(mapped.hr, 145);
    assert.equal(mapped.maxHr, 178);
    assert.equal(mapped.garminTrainingLoad, null);
    assert.equal(mapped.garminSportLabel, 'RUNNING');
    assert.equal(mapped.garminExportImported, true);
    assert.equal(mapped.sourceRefs.garminActivityId, '123');
    assert.equal(mapped.garminData, undefined);
});

test('does not choose arbitrary VO2max values when a day has conflicting profiles', async () => {
    const { selectGarminVo2MaxDailyRecords } = await import('../js/garmin-export-import-core.js');
    const result = selectGarminVo2MaxDailyRecords([
        { date: '2025-01-01', value: 50, sport: 'RUNNING' },
        { date: '2025-01-01', value: 51, sport: 'WALKING' },
        { date: '2025-01-02', value: 49, sport: 'RUNNING' },
        { date: '2025-01-02', value: 49, sport: 'CYCLING' },
        { date: '2025-01-03', value: 52, sport: 'RUNNING', updateTimestamp: '2025-01-03T10:00:00Z' },
        { date: '2025-01-03', value: 51, sport: 'WALKING', updateTimestamp: '2025-01-02T10:00:00Z' }
    ]);
    assert.deepEqual(result.ambiguousDates, ['2025-01-01']);
    assert.deepEqual(result.selected.map(record => [record.date, record.value]), [
        ['2025-01-02', 49],
        ['2025-01-03', 52]
    ]);
});

test('collects explicit activity names by Garmin activity ID', () => {
    const names = collectGarminActivityNames({
        activityDetails: [
            { activityId: 123, activityName: 'K1 Training' },
            { activityId: 456, activityName: 'C1 Classic' }
        ]
    });
    assert.equal(names.get('123'), 'K1 Training');
    assert.equal(names.get('456'), 'C1 Classic');
});
