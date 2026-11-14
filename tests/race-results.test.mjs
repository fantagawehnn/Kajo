import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRaceResults, formatRaceResultTime } from '../js/race-results.js';

test('normalizes multiple starts without changing their disciplines or formats', () => {
  const results = normalizeRaceResults([
    { id: 'a', discipline: 'C1', format: 'Classic', placement: 2, timeSeconds: 183.42 },
    { id: 'b', discipline: 'C2', format: 'Sprint', placement: 3, timeSeconds: 74.8 }
  ]);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(item => [item.discipline, item.format, item.placement]), [
    ['C1', 'Classic', 2], ['C2', 'Sprint', 3]
  ]);
});

test('keeps optional placement or time but drops empty and invalid result rows', () => {
  const results = normalizeRaceResults([
    { discipline: 'K1', format: 'Sprint', placement: 1, timeSeconds: null },
    { discipline: 'C1', format: 'Classic', placement: null, timeSeconds: 91.25 },
    { discipline: 'C2', format: 'Sprint', placement: null, timeSeconds: null },
    { discipline: 'K4', format: 'Sprint', placement: 2, timeSeconds: 90 },
    { discipline: 'K1', format: 'Sprint', placement: 0, timeSeconds: 90 },
    { discipline: 'K1', format: 'Sprint', placement: 2.5, timeSeconds: 90 },
    { discipline: 'K1', format: 'Sprint', placement: 2, timeSeconds: -1 }
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].timeSeconds, null);
  assert.equal(results[1].placement, null);
});

test('legacy races without results remain an empty result collection', () => {
  assert.deepEqual(normalizeRaceResults(undefined), []);
  assert.deepEqual(normalizeRaceResults(null), []);
});

test('formats result times in seconds and minutes', () => {
  assert.equal(formatRaceResultTime(92.45), '1:32.45');
  assert.equal(formatRaceResultTime(59.2), '59.20 s');
  assert.equal(formatRaceResultTime(null), '');
});
