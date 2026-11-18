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
