import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGarminActivityRescanPlan } from '../supabase/functions/garmin-personal/activity-scan-plan.js';

test('rescans days without coverage and days whose stored activity count disagrees', () => {
  const result = buildGarminActivityRescanPlan({
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    coveredRows: [
      { sync_date: '2026-06-01', activity_count: 0 },
      { sync_date: '2026-06-02', activity_count: 1 },
      { sync_date: '2026-06-04', activity_count: 1 },
      { sync_date: '2026-06-05', activity_count: 0 },
    ],
    storedActivities: [
      { activity: { startTimeLocal: '2026-06-01 08:00:00' } },
      { activity: { startTimeLocal: '2026-06-02 08:00:00' } },
      { activity: { startTimeLocal: '2026-06-03 08:00:00' } },
      { activity: { startTimeLocal: '2026-06-04 08:00:00' } },
    ],
    rescanAnchorDate: '2026-06-05',
    scanWindowDays: 1,
  });

  assert.deepEqual(result.ranges, [
    { startDate: '2026-06-01', endDate: '2026-06-01' },
    { startDate: '2026-06-03', endDate: '2026-06-03' },
  ]);
  assert.equal(result.scannedDaysToRetry, 2);
  assert.equal(result.skippedDays, 3);
});

test('keeps matching historical coverage and groups consecutive missing days into 14-day ranges', () => {
  const result = buildGarminActivityRescanPlan({
    startDate: '2025-08-01',
    endDate: '2025-08-20',
    coveredRows: [{ sync_date: '2025-08-01', activity_count: 1 }],
    storedActivities: [{ activity: { startTimeLocal: '2025-08-01 08:00:00' } }],
    rescanAnchorDate: '2025-08-20',
    scanWindowDays: 1,
  });

  assert.deepEqual(result.ranges, [
    { startDate: '2025-08-02', endDate: '2025-08-15' },
    { startDate: '2025-08-16', endDate: '2025-08-20' },
  ]);
  assert.equal(result.skippedDays, 1);
});

test('supports numeric Garmin epoch timestamps in stored activity rows', () => {
  const result = buildGarminActivityRescanPlan({
    startDate: '2026-08-28',
    endDate: '2026-08-28',
    coveredRows: [{ sync_date: '2026-08-28', activity_count: 1 }],
    storedActivities: [{ activity: { startTimeLocal: 1787909585000 } }],
    rescanAnchorDate: '2026-08-01',
  });
  assert.equal(result.ranges.length, 0);
  assert.equal(result.skippedDays, 1);
});
