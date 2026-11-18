import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaddlingPerformanceActivity } from '../js/performance-data-quality.js';

test('includes the canonical kayak, canoe and paddle-ergometer activity types', () => {
    for (const type of ['Kayaking', 'C1', 'C2', 'PaddleErgo']) {
        assert.equal(isPaddlingPerformanceActivity({ type }), true, type + ' is paddling');
    }
});

test('excludes non-paddling and unknown activity types from paddling performance', () => {
    for (const type of ['Run', 'Ride', 'Swim', 'WeightTraining', 'Workout', 'RunningTrail', '']) {
        assert.equal(isPaddlingPerformanceActivity({ type }), false, type + ' is not paddling');
    }
    assert.equal(isPaddlingPerformanceActivity(null), false);
    assert.equal(isPaddlingPerformanceActivity({}), false);
});

test('accepts only complete, finite, nonnegative and strictly increasing elapsed-time axes', async () => {
    const { isValidElapsedTimeAxis } = await import('../js/performance-data-quality.js');
    assert.equal(isValidElapsedTimeAxis([0, 1, 2], 3), true);
    assert.equal(isValidElapsedTimeAxis(['0', '0.5', '1'], 3), true);
    assert.equal(isValidElapsedTimeAxis([0, 1], 3), false);
    assert.equal(isValidElapsedTimeAxis([0, 1, 1], 3), false);
    assert.equal(isValidElapsedTimeAxis([0, -1, 2], 3), false);
    assert.equal(isValidElapsedTimeAxis([0, null, 2], 3), false);
    assert.equal(isValidElapsedTimeAxis([0, '', 2], 3), false);
    assert.equal(isValidElapsedTimeAxis([0, 'not-a-time', 2], 3), false);
    assert.equal(isValidElapsedTimeAxis([0], 1), false);
});

test('prefers the explicit metric-series elapsed-time axis and rejects invalid axes', async () => {
    const { getValidatedElapsedTimeAxis } = await import('../js/performance-data-quality.js');
    assert.deepEqual(getValidatedElapsedTimeAxis({
        metricSeriesTime: [0, 2, 4],
        time: [0, 1, 2]
    }, 3), [0, 2, 4]);
    assert.deepEqual(getValidatedElapsedTimeAxis({
        metricSeriesTime: [0, 1, 1],
        time: [0, 1, 2]
    }, 3), [0, 1, 2]);
    assert.equal(getValidatedElapsedTimeAxis({ time: [0, 1] }, 3), null);
});
