import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecoveryTrends, summarizeSleepDeficit } from '../js/recovery-calculations.js';

test('compares the latest seven days with the preceding seven days', () => {
  const data = {
    '2026-11-03': { sleepDuration: 7 },
    '2026-11-04': { sleepDuration: 8 },
    '2026-11-10': { sleepDuration: 6 },
    '2026-11-11': { sleepDuration: 7 }
  };
  const result = summarizeRecoveryTrends(data, '2026-11-16');
  const sleep = result.metrics.find(item => item.key === 'sleepDuration');
  assert.equal(result.from, '2026-11-10');
  assert.equal(result.to, '2026-11-16');
  assert.equal(result.previousFrom, '2026-11-03');
  assert.equal(result.previousTo, '2026-11-09');
  assert.equal(sleep.currentAverage, 6.5);
  assert.equal(sleep.previousAverage, 7.5);
  assert.equal(sleep.delta, -1);
  assert.equal(sleep.currentCount, 2);
  assert.equal(sleep.previousCount, 2);
});

test('does not treat missing days or invalid values as zero', () => {
  const data = {
    '2026-11-10': { sleepScore: 80 },
    '2026-11-11': { sleepScore: null },
    '2026-11-12': { sleepScore: '' },
    '2026-11-13': { sleepScore: 150 }
  };
  const result = summarizeRecoveryTrends(data, '2026-11-16');
  const score = result.metrics.find(item => item.key === 'sleepScore');
  assert.equal(score.currentAverage, 80);
  assert.equal(score.currentCount, 1);
  assert.equal(score.previousAverage, null);
  assert.equal(score.delta, null);
  assert.equal(score.previousCount, 0);
});

test('supports legacy sleep duration and Garmin resting-heart-rate fields', () => {
  const data = {
    '2026-11-10': { sleep: 7.5, garminRhr: 48 },
    '2026-11-11': { sleepDuration: 8, rhr: 50 }
  };
  const result = summarizeRecoveryTrends(data, '2026-11-16');
  assert.equal(result.metrics.find(item => item.key === 'sleepDuration').currentAverage, 7.75);
  assert.equal(result.metrics.find(item => item.key === 'rhr').currentAverage, 49);
});

test('returns an empty result for an invalid date', () => {
  const result = summarizeRecoveryTrends({}, '2026-02-30');
  assert.equal(result.from, null);
  assert.deepEqual(result.metrics, []);
});


test('calculates accumulated shortfall against the personal target only for measured nights', () => {
  const data = {
    '2026-11-10': { sleepDuration: 7.5 },
    '2026-11-11': { sleepDuration: 8.5 },
    '2026-11-12': { sleepDuration: 6 },
    '2026-11-13': { sleepDuration: null },
    '2026-11-14': { sleepDuration: 20 }
  };
  const result = summarizeSleepDeficit(data, 8, '2026-11-16', 7);
  assert.equal(result.target, 8);
  assert.equal(result.measuredNights, 3);
  assert.equal(result.nightsBelowTarget, 2);
  assert.equal(result.cumulativeShortfall, 2.5);
  assert.equal(result.averageDuration, 7.33);
});

test('does not estimate sleep deficit without a configured personal target or valid sleep data', () => {
  const noTarget = summarizeSleepDeficit({ '2026-11-10': { sleepDuration: 6 } }, null, '2026-11-16');
  assert.equal(noTarget.target, null);
  assert.equal(noTarget.cumulativeShortfall, null);
  const noSleep = summarizeSleepDeficit({}, 8, '2026-11-16');
  assert.equal(noSleep.target, 8);
  assert.equal(noSleep.measuredNights, 0);
  assert.equal(noSleep.cumulativeShortfall, null);
});


test('calculates a 90-day personal baseline for HRV and resting heart rate only with five readings', () => {
  const data = {};
  for (let day = 1; day <= 90; day++) {
    const date = new Date(2026, 10, 7 - 7 - day, 12);
    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    data[key] = { hrv: 50, garminRhr: 48 };
  }
  for (let day = 1; day <= 7; day++) {
    const date = new Date(2026, 10, day, 12);
    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    data[key] = { hrv: 55, garminRhr: 46 };
  }
  const result = summarizeRecoveryTrends(data, '2026-11-07');
  const hrv = result.metrics.find(item => item.key === 'hrv');
  const rhr = result.metrics.find(item => item.key === 'rhr');
  assert.equal(hrv.baselineMedian, 50);
  assert.equal(hrv.baselineCount, 90);
  assert.equal(hrv.baselineDeltaPercent, 10);
  assert.equal(rhr.baselineMedian, 48);
  assert.equal(rhr.baselineDeltaPercent, -4.2);
});

test('does not present a personal baseline with fewer than five valid readings', () => {
  const data = {
    '2026-11-01': { hrv: 50 },
    '2026-11-02': { hrv: 52 },
    '2026-11-03': { hrv: null },
    '2026-11-04': { hrv: 48 },
    '2026-11-05': { hrv: 51 }
  };
  const result = summarizeRecoveryTrends(data, '2026-11-16');
  const hrv = result.metrics.find(item => item.key === 'hrv');
  assert.equal(hrv.baselineMedian, null);
  assert.equal(hrv.baselineCount, 4);
  assert.equal(hrv.baselineDeltaPercent, null);
});
