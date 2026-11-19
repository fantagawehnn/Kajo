import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultActivityTelemetryMetrics, normalizeFitSpeed, normalizeMetricSpeed } from '../js/activity-telemetry-core.js';

test('paddling defaults prioritize heart rate, speed and stroke rate when available', () => {
    assert.deepEqual(
        getDefaultActivityTelemetryMetrics('C1', ['hr', 'speed', 'strokeRate', 'altitude']),
        ['hr', 'speed', 'strokeRate']
    );
});

test('paddling defaults accept the normalized cadence alias as stroke rate', () => {
    assert.deepEqual(
        getDefaultActivityTelemetryMetrics('Kayaking', ['hr', 'speed', 'cadence']),
        ['hr', 'speed', 'cadence']
    );
});

test('running and cycling receive sport-specific default metrics', () => {
    assert.deepEqual(
        getDefaultActivityTelemetryMetrics('Run', ['hr', 'pace', 'speed', 'cadence']),
        ['hr', 'pace', 'speed', 'cadence']
    );
    assert.deepEqual(
        getDefaultActivityTelemetryMetrics('Ride', ['hr', 'speed', 'power', 'cadence']),
        ['hr', 'speed', 'power', 'cadence']
    );
});

test('FIT speed in metres per second is converted to km/h without changing missing values', () => {
    assert.deepEqual(normalizeFitSpeed([0, 1, 2.5, null, '']).values, [0, 3.6, 9, null, null]);
    assert.equal(normalizeFitSpeed([1]).unit, 'km/h');
});

test('metric-series speed respects its declared unit and does not guess missing units', () => {
    assert.deepEqual(normalizeMetricSpeed([1, 2, null], 'm/s'), {
        values: [3.6, 7.2, null], unit: 'km/h', sourceUnit: 'm/s'
    });
    assert.deepEqual(normalizeMetricSpeed([10, 20], 'km/h').values, [10, 20]);
    assert.deepEqual(normalizeMetricSpeed([1, 2], null), {
        values: [1, 2], unit: '', sourceUnit: null
    });
});
