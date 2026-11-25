import test from 'node:test';
import assert from 'node:assert/strict';
import { getGarminHrvMeasurementIdentity, getComparableGarminHrvSeries } from '../js/garmin-metric-access.js';

test('HRV identity includes source, metric and unit', () => {
    assert.equal(getGarminHrvMeasurementIdentity({
        garminHrv: 52,
        measurementSources: { garminHrv: { source: 'Garmin', metric: 'RMSSD', unit: 'ms' } }
    }), 'garmin:rmssd:ms');
});

test('HRV identity treats dedicated legacy Garmin values as unspecified', () => {
    assert.equal(getGarminHrvMeasurementIdentity({ garminHrv: 52 }), 'garmin:unspecified:ms');
    assert.equal(getGarminHrvMeasurementIdentity({
        hrv: 52,
        measurementSources: { hrv: { source: 'manual', metric: 'rmssd', unit: 'ms' } }
    }), null);
});

test('comparable HRV series excludes different metrics and units', () => {
    const checkins = {
        '2026-01-01': { garminHrv: 48, measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' } } },
        '2026-01-02': { garminHrv: 50, measurementSources: { garminHrv: { source: 'garmin', metric: 'sdnn', unit: 'ms' } } },
        '2026-01-03': { garminHrv: 51, measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' } } },
        '2026-01-04': { garminHrv: 0, measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' } } }
    };
    const result = getComparableGarminHrvSeries(checkins, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    assert.equal(result.identity, 'garmin:rmssd:ms');
    assert.deepEqual(result.values, [48, null, 51, null]);
});

test('comparable HRV series returns no values when no valid Garmin HRV is available', () => {
    const result = getComparableGarminHrvSeries({
        '2026-01-01': { hrv: 55, measurementSources: { hrv: { source: 'manual', metric: 'rmssd', unit: 'ms' } } }
    }, ['2026-01-01']);
    assert.equal(result.identity, null);
    assert.deepEqual(result.values, [null]);
});

test('comparable HRV series also excludes a different unit for the same metric', () => {
    const checkins = {
        '2026-02-01': { garminHrv: 48, measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' } } },
        '2026-02-02': { garminHrv: 0.05, measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 's' } } }
    };
    const result = getComparableGarminHrvSeries(checkins, ['2026-02-01', '2026-02-02']);
    assert.equal(result.identity, 'garmin:rmssd:s');
    assert.deepEqual(result.values, [null, 0.05]);
});
