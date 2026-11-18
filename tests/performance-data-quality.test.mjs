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

test('resolves Garmin paddling speed from m/s to km/h without applying metadata scale factor', async () => {
    const { resolvePaddlingPerformanceSeries } = await import('../js/performance-data-quality.js');
    const resolved = resolvePaddlingPerformanceSeries({ type: 'Kayaking' }, [{
        key: 'directSpeed', unit: 'mps', values: [2, 2.5, null], time: [0, 1, 2]
    }], 'speed');
    assert.equal(resolved.unit, 'km/h');
    assert.deepEqual(resolved.values, [7.2, 9, null]);
    assert.equal(resolved.sourceDetail, 'Gerätemesswert');
    assert.match(resolved.conversionNote, /m\/s.*3,6/);
});

test('resolves device-reported power and explicit stroke cadence only from matching source units', async () => {
    const { resolvePaddlingPerformanceSeries } = await import('../js/performance-data-quality.js');
    const power = resolvePaddlingPerformanceSeries({ type: 'C1' }, [{
        key: 'directPower', unit: 'watt', values: [120, 130], time: [0, 1]
    }], 'power');
    assert.equal(power.unit, 'W');
    assert.deepEqual(power.values, [120, 130]);
    assert.equal(power.sourceDetail, 'Gerätemesswert');
    const cadence = resolvePaddlingPerformanceSeries({ type: 'C2' }, [{
        key: 'directStrokeCadence', unit: 'strokesPerMinute', values: [60, 62], time: [0, 1]
    }], 'cadence');
    assert.equal(cadence.unit, '/min');
    assert.deepEqual(cadence.values, [60, 62]);
});

test('prefers normalized FIT series and rejects unknown units or non-paddling activity', async () => {
    const { resolvePaddlingPerformanceSeries } = await import('../js/performance-data-quality.js');
    const standard = resolvePaddlingPerformanceSeries({ type: 'C1' }, [
        { key: 'speed', unit: 'km/h', values: [7, 8], time: [0, 1] },
        { key: 'directSpeed', unit: 'mps', values: [2, 2.2], time: [0, 1] }
    ], 'speed');
    assert.deepEqual(standard.values, [7, 8]);
    assert.equal(standard.unit, 'km/h');
    assert.equal(resolvePaddlingPerformanceSeries({ type: 'C1' }, [
        { key: 'directSpeed', unit: 'unknown', values: [2, 2.2], time: [0, 1] }
    ], 'speed'), null);
    assert.equal(resolvePaddlingPerformanceSeries({ type: 'Run' }, [
        { key: 'directSpeed', unit: 'mps', values: [2, 2.2], time: [0, 1] }
    ], 'speed'), null);
});
