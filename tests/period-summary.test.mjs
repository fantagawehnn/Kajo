import assert from 'node:assert/strict';
import { calculatePeriodSummary } from '../js/period-summary.js';

const result = calculatePeriodSummary({
  from: '2026-01-01', to: '2026-01-31',
  activities: [
    { date: '2026-01-01T08:00:00', duration: 60 },
    { date: '2026-01-01T17:00:00', duration: 45 },
    { date: '2026-01-12', duration: null },
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
console.log('Period summary tests passed.');
