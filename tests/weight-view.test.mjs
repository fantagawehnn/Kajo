import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWeightViewData } from '../js/weight-view.js';

test('weight trend uses real manual measurements and keeps Garmin values separate', () => {
    const data = buildWeightViewData({
        '2026-11-12': { weight: 72 },
        '2026-11-18': { weight: 71 },
        '2026-11-19': { weight: 70, garminWeight: 69.5 }
    }, '2026-11-19', 14);

    assert.equal(data.latestManual.date, '2026-11-19');
    assert.equal(data.latestManual.value, 70);
    assert.equal(data.currentWeekCount, 2);
    assert.equal(data.currentWeekAverage, 70.5);
    assert.equal(data.previousWeekCount, 1);
    assert.equal(data.previousWeekAverage, 72);
    assert.equal(data.manualCount, 3);
    assert.equal(data.garminCount, 1);
    assert.equal(data.movingAverage.at(-1), 70.5);
});

test('missing weight days remain null and are not treated as zero', () => {
    const data = buildWeightViewData({
        '2026-11-19': { weight: 68.4 }
    }, '2026-11-19', 7);

    assert.deepEqual(data.manual.slice(0, 6), [null, null, null, null, null, null]);
    assert.equal(data.movingAverage.at(-1), 68.4);
    assert.equal(data.currentWeekAverage, 68.4);
    assert.equal(data.previousWeekAverage, null);
});
