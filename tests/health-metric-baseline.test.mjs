import test from 'node:test';
import assert from 'node:assert/strict';
import { getPersonalHealthBaseline } from '../js/health-data.js';

function date(offset) {
    const value = new Date('2026-01-13T12:00:00');
    value.setDate(value.getDate() + offset);
    return value.toISOString().slice(0, 10);
}

test('HRV baseline only compares matching source, metric and unit', () => {
    const checkins = {};
    for (let index = 1; index <= 12; index++) {
        const isRmssd = index <= 6;
        checkins[date(-index)] = {
            garminHrv: isRmssd ? 50 + index : 100 + index,
            measurementSources: {
                garminHrv: {
                    source: 'garmin',
                    metric: isRmssd ? 'rmssd' : 'sdnn',
                    unit: 'ms'
                }
            }
        };
    }
    checkins[date(0)] = {
        garminHrv: 55,
        measurementSources: {
            garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' }
        }
    };

    assert.equal(getPersonalHealthBaseline('hrv', date(0), checkins), 53.5);
});

test('HRV baseline stays unavailable when fewer than five matching observations exist', () => {
    const checkins = {};
    for (let index = 1; index <= 6; index++) {
        checkins[date(-index)] = {
            garminHrv: 100 + index,
            measurementSources: {
                garminHrv: { source: 'garmin', metric: 'sdnn', unit: 'ms' }
            }
        };
    }
    checkins[date(0)] = {
        garminHrv: 55,
        measurementSources: {
            garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'ms' }
        }
    };

    assert.equal(getPersonalHealthBaseline('hrv', date(0), checkins), null);
});

test('non-HRV baselines keep their existing date-window behavior', () => {
    const checkins = {};
    for (let index = 1; index <= 5; index++) {
        checkins[date(-index)] = { garminRhr: 48 + index };
    }
    checkins[date(0)] = { garminRhr: 50 };

    assert.equal(getPersonalHealthBaseline('rhr', date(0), checkins), 51);
});
