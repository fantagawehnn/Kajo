import assert from 'node:assert/strict';
import { calculatePeriodSummary, groupHealthEpisodes } from '../js/period-summary.js';
import { getVisibleActivities } from '../js/activity-groups.js';

const result = calculatePeriodSummary({
  from: '2026-01-01', to: '2026-01-31',
  activities: [
    { date: '2026-01-01T08:00:00', duration: 60, type: 'C1' },
    { date: '2026-01-01T17:00:00', duration: 45, type: 'Kayaking', raceFormat: 'classic', waterType: 'flatwater' },
    { date: '2026-01-12', duration: null, type: 'C2', raceFormat: 'sprint', waterConditions: { type: 'wildwater' } },
    { date: '2025-12-31', duration: 30 },
    { date: '2026-02-01', duration: 30 }
  ],
  races: [
    { date: '2026-01-20', results: [{ rank: 1 }, { rank: 3 }, { rank: 'DNS' }] },
    { date: '2025-12-20', results: [{ rank: 2 }] }
  ],
  healthLogs: {
    '2026-01-05': { status: 'sick' },
    '2026-01-06': { status: 'injured' },
    '2026-01-07': { status: 'other' },
    '2026-02-01': { status: 'sick' }
  }
});
assert.deepEqual(result, {
  validRange: true, activityCount: 3, trainingDays: 2, durationMinutes: 105, durationCount: 2,
  canoeCount: 3,
  canoeClasses: { K1: 1, C1: 1, C2: 1 },
  canoeFormats: { classic: 1, sprint: 1 },
  canoeFormatUnspecifiedCount: 1,
  canoeWaterTypes: { wildwater: 1, flatwater: 1 },
  canoeWaterTypeUnspecifiedCount: 1,
  raceCount: 1, resultCount: 2, podiumCount: 2, winCount: 1,
  sickDays: 1, injuredDays: 1, healthEntryCount: 3
});
const empty = calculatePeriodSummary({ from: '2026-01-01', to: '2026-01-01' });
assert.equal(empty.activityCount, 0);
assert.equal(empty.durationMinutes, null);
assert.equal(empty.trainingDays, 0);
const invalid = calculatePeriodSummary({ from: '2026-02-01', to: '2026-01-01' });
assert.equal(invalid.validRange, false);
assert.equal(invalid.durationMinutes, null);

const mergedActivities = getVisibleActivities([
  { id: 'a', date: '2026-01-10', duration: 30, type: 'C1', mergedGroupId: 'group-1', mergedGroupRole: 'primary' },
  { id: 'b', date: '2026-01-10', duration: 45, type: 'C1', mergedGroupId: 'group-1', mergedGroupRole: 'segment' }
]);
const mergedSummary = calculatePeriodSummary({
  from: '2026-01-01', to: '2026-01-31', activities: mergedActivities
});
assert.equal(mergedSummary.activityCount, 1);
assert.equal(mergedSummary.trainingDays, 1);
assert.equal(mergedSummary.durationMinutes, 75);
assert.equal(mergedSummary.canoeClasses.C1, 1);

const healthEpisodes = groupHealthEpisodes({
  '2026-01-02': { status:'sick', diagnosis:'Erkältung' },
  '2026-01-03': { status:'sick', diagnosis:'Erkältung' },
  '2026-01-04': { status:'sick', diagnosis:'Erkältung' },
  '2026-01-07': { status:'sick', diagnosis:'Erkältung' },
  '2026-01-08': { status:'injured', diagnosis:'Schulter' },
  '2026-01-09': { status:'injured', diagnosis:'Schulter' },
  '2025-12-31': { status:'sick', diagnosis:'Außerhalb' }
}, '2026-01-01', '2026-01-31');
assert.deepEqual(healthEpisodes, {
  validRange:true, totalDays:6, sickDays:4, injuredDays:2, sickEpisodes:2, injuredEpisodes:1,
  episodes:[
    { status:'sick', diagnosis:'Erkältung', start:'2026-01-02', end:'2026-01-04', days:3 },
    { status:'sick', diagnosis:'Erkältung', start:'2026-01-07', end:'2026-01-07', days:1 },
    { status:'injured', diagnosis:'Schulter', start:'2026-01-08', end:'2026-01-09', days:2 }
  ]
});
assert.equal(groupHealthEpisodes({}, '2026-02-01', '2026-01-01').validRange, false);

console.log('Period summary tests passed.');
