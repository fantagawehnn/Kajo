import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivityTelemetrySeries } from '../js/charts.js';

test('normalizes Garmin paddling speed, power and stroke cadence for activity charts', () => {
    const activity = {
        source: 'garmin',
        type: 'C1',
        garminTelemetry: {
            metricSeriesTime: [0, 1, 2],
            metricSeries: {
                directSpeed: { label: 'Speed', unit: 'mps', values: [2, 2.5, null] },
                directPower: { label: 'Power', unit: 'watt', values: [100, 120, 140] },
                directStrokeCadence: { label: 'Stroke Cadence', unit: 'strokesPerMinute', values: [60, 62, 64] }
            }
        }
    };

    const series = getActivityTelemetrySeries(activity);
    const speed = series.find(item => item.key === 'speed');
    const power = series.find(item => item.key === 'power');
    const cadence = series.find(item => item.key === 'cadence');

    assert.ok(speed);
    assert.equal(speed.unit, 'km/h');
    assert.deepEqual(speed.values, [7.2, 9, null]);
    assert.match(speed.label, /Gerätemesswert/);
    assert.deepEqual(speed.time, [0, 1, 2]);

    assert.ok(power);
    assert.equal(power.unit, 'W');
    assert.deepEqual(power.values, [100, 120, 140]);
    assert.match(power.label, /Gerätemesswert/);

    assert.ok(cadence);
    assert.equal(cadence.unit, '/min');
    assert.deepEqual(cadence.values, [60, 62, 64]);
    assert.match(cadence.label, /Gerätemesswert/);
});

test('does not apply paddling unit conversions to non-paddling activity types', () => {
    const activity = {
        source: 'garmin',
        type: 'Run',
        garminTelemetry: {
            metricSeriesTime: [0, 1],
            metricSeries: {
                directSpeed: { label: 'Speed', unit: 'mps', values: [2, 3] }
            }
        }
    };
    const speed = getActivityTelemetrySeries(activity).find(item => item.key === 'directSpeed');
    assert.ok(speed);
    assert.equal(speed.unit, 'mps');
    assert.deepEqual(speed.values, [2, 3]);
});
