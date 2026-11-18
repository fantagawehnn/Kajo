import test from 'node:test';
import assert from 'node:assert/strict';
import { getGarminCheckinMetric } from '../js/garmin-metric-access.js';

test('reads Garmin-owned recovery metrics and ignores generic legacy fields', () => {
    const checkin = {
        garminHrv: 58,
        garminRhr: 47,
        garminSleepDuration: 8.25,
        garminSleepScore: 91,
        garminRespiration: 13.5,
        hrv: 42,
        rhr: 55,
        sleepDuration: 6,
        sleepScore: 60,
        respiration: 18
    };
    assert.equal(getGarminCheckinMetric(checkin, 'hrv'), 58);
    assert.equal(getGarminCheckinMetric(checkin, 'rhr'), 47);
    assert.equal(getGarminCheckinMetric(checkin, 'sleepDuration'), 8.25);
    assert.equal(getGarminCheckinMetric(checkin, 'sleepScore'), 91);
    assert.equal(getGarminCheckinMetric(checkin, 'respiration'), 13.5);
});

test('legacy HRV is accepted only with explicit Garmin provenance', () => {
    assert.equal(getGarminCheckinMetric({ hrv: 52 }, 'hrv'), null);
    assert.equal(getGarminCheckinMetric({
        hrv: 52, measurementSources: { hrv: { source: 'manual' } }
    }, 'hrv'), null);
    assert.equal(getGarminCheckinMetric({
        hrv: 52, measurementSources: { hrv: { source: 'garmin' } }
    }, 'hrv'), 52);
});

test('VO2max is displayed only when explicitly marked as a Garmin archive estimate', () => {
    assert.equal(getGarminCheckinMetric({ vo2max: 55 }, 'vo2max'), null);
    assert.equal(getGarminCheckinMetric({
        vo2max: 55, vo2maxSource: 'manual'
    }, 'vo2max'), null);
    assert.equal(getGarminCheckinMetric({
        vo2max: 55, vo2maxSource: 'garmin-estimate'
    }, 'vo2max'), 55);
});

test('missing, empty and non-numeric Garmin metrics remain unavailable', () => {
    assert.equal(getGarminCheckinMetric({}, 'rhr'), null);
    assert.equal(getGarminCheckinMetric({ garminRhr: '' }, 'rhr'), null);
    assert.equal(getGarminCheckinMetric({ garminRhr: 'unknown' }, 'rhr'), null);
    assert.equal(getGarminCheckinMetric({ garminRhr: 0 }, 'rhr'), 0);
    assert.equal(getGarminCheckinMetric({ garminRhr: 48 }, 'unknown'), null);
});
