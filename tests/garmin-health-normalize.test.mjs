import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGarminWeight, countGarminMetricUpdates } from '../js/garmin-health-normalize.js';

test('converts Garmin totalAverage weight from grams to kilograms and retains MANUAL source', () => {
    const result = normalizeGarminWeight({
        totalAverage: { weight: 61400 },
        dailyWeightSummaries: [{
            latestWeight: { weight: 61400, sourceType: 'MANUAL' }
        }]
    });
    assert.deepEqual(result, { value: 61.4, sourceType: 'MANUAL' });
});

test('uses nested latestWeight when totalAverage is unavailable', () => {
    const result = normalizeGarminWeight({
        dailyWeightSummaries: [{
            latestWeight: { weight: 61700, sourceType: 'MANUAL' }
        }]
    });
    assert.deepEqual(result, { value: 61.7, sourceType: 'MANUAL' });
});

test('keeps already normalized kilogram fields in kilograms', () => {
    assert.deepEqual(normalizeGarminWeight({ weightKg: 61.4 }), {
        value: 61.4,
        sourceType: null
    });
});

test('rejects missing, zero, and implausible Garmin weight values', () => {
    assert.equal(normalizeGarminWeight(null), null);
    assert.equal(normalizeGarminWeight({ totalAverage: { weight: 0 } }), null);
    assert.equal(normalizeGarminWeight({ totalAverage: { weight: 614000 } }), null);
});

test('counts metric fields without counting measurement source metadata', () => {
    assert.equal(countGarminMetricUpdates({
        garminHrv: 52,
        garminWeight: 61.4,
        measurementSources: {
            garminHrv: { source: 'garmin' },
            garminWeight: { source: 'garmin', sourceType: 'MANUAL' }
        }
    }), 2);
    assert.equal(countGarminMetricUpdates({ measurementSources: {} }), 0);
});
