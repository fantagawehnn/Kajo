import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyGarminExportFile,
    collectGarminSummaryActivities,
    mapGarminExportActivity
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
});
