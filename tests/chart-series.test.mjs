import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareAdaptiveSeriesGroup,
  carryForwardForDisplay,
  countValidSeriesValues
} from '../js/chart-series.js';

const dates = Array.from({ length: 14 }, (_, index) => {
  const date = new Date('2026-01-05T12:00:00');
  date.setDate(date.getDate() + index);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
});

test('keeps daily resolution when every series has at least 70 percent coverage', () => {
  const result = prepareAdaptiveSeriesGroup(dates, [
    { key: 'load', values: Array(14).fill(10) },
    { key: 'hrv', values: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, null, null, null, null] }
  ]);
  assert.equal(result.mode, 'daily');
  assert.equal(result.series[0].available, true);
  assert.equal(result.series[1].available, true);
  assert.equal(result.labels.length, 14);
});

test('switches to weekly averages when coverage is below 70 percent', () => {
  const result = prepareAdaptiveSeriesGroup(dates, [
    { key: 'load', values: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
    { key: 'vo2', values: [50, null, null, null, 51, null, null, null, 52, null, null, null, 53, null] }
  ]);
  assert.equal(result.mode, 'weekly');
  assert.equal(result.series[0].chartType, 'line');
  assert.equal(result.series[1].chartType, 'bar');
  assert.deepEqual(result.series[1].values, [50.5, 52.5]);
  assert.equal(result.series[1].available, true, 'four measurements remain visible as two weekly averages');
});

test('hides a metric with fewer than three measurements', () => {
  const result = prepareAdaptiveSeriesGroup(dates, [
    { key: 'rare', values: [50, null, null, null, null, null, null, null, null, null, null, null, 51, null] }
  ]);
  assert.equal(result.series[0].available, false);
});

test('carry-forward is display-only and exposes a mask for missing spans', () => {
  const source = [10, null, null, 14, null];
  const result = carryForwardForDisplay(source);
  assert.deepEqual(result.values, [10, 10, 10, 14, 14]);
  assert.deepEqual(result.carried, [false, true, true, false, true]);
  assert.deepEqual(source, [10, null, null, 14, null]);
  assert.deepEqual(carryForwardForDisplay([0, null, 2]).values, [0, 0, 2], 'a confirmed zero remains a measured value, not a missing value');
});

test('counts only finite, explicitly present values', () => {
  assert.equal(countValidSeriesValues([0, 2, null, undefined, '', '3', NaN]), 3);
});
