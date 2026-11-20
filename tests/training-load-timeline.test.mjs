import test from 'node:test';
import assert from 'node:assert/strict';
import { computePerformanceTimeline } from '../js/calculations.js';

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function shiftDate(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

test('CTL, ATL and TSB follow the documented 42-day and 7-day exponential smoothing', () => {
    const today = new Date();
    const activityDate = localDateKey(shiftDate(today, -1));
    const rangeStart = localDateKey(shiftDate(today, -2));
    const rangeEnd = activityDate;
    const load = 480; // 60 minutes × RPE 8
    const timeline = computePerformanceTimeline([{
        id: 'srpe-reference', date: activityDate, type: 'Kayaking',
        duration: 60, perceivedEffort: 8
    }], {
        trainingLoadSource: 'srpe',
        garminActivityCoverageRanges: [{ startDate: rangeStart, endDate: rangeEnd, status: 'complete' }]
    }, {});
    const day = timeline.find(item => item.date === activityDate);
    const expectedCtl = load * (1 - Math.exp(-1 / 42));
    const expectedAtl = load * (1 - Math.exp(-1 / 7));
    assert.ok(day, 'activity day exists');
    assert.equal(day.load, load);
    assert.equal(day.ctl, Number(expectedCtl.toFixed(1)));
    assert.equal(day.atl, Number(expectedAtl.toFixed(1)));
    assert.equal(day.tsb, Number((Number(expectedCtl.toFixed(1)) - Number(expectedAtl.toFixed(1))).toFixed(1)));
    assert.equal(day.dataStatus, 'complete');
    const todayEntry = timeline.find(item => item.date === localDateKey(today));
    assert.equal(todayEntry?.dataStatus, 'unknown');
    assert.equal(todayEntry?.ctl, null, 'unknown current day must not carry forward CTL');
});

test('an unknown day breaks the CTL/ATL chain instead of being treated as rest', () => {
    const today = new Date();
    const activityDate = localDateKey(shiftDate(today, -2));
    const startDate = activityDate;
    const timeline = computePerformanceTimeline([{
        id: 'srpe-gap-reference', date: activityDate, type: 'Kayaking',
        duration: 60, perceivedEffort: 8
    }], {
        trainingLoadSource: 'srpe',
        garminActivityCoverageRanges: [{ startDate, endDate: activityDate, status: 'complete' }]
    }, {});
    const nextDay = localDateKey(shiftDate(today, -1));
    const gap = timeline.find(item => item.date === nextDay);
    assert.equal(gap?.dataStatus, 'unknown');
    assert.equal(gap?.ctl, null);
    assert.equal(gap?.atl, null);
    assert.equal(gap?.tsb, null);
});
