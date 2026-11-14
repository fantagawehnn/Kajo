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

test('builds season comparisons by year, boat class and race format', async () => {
  const { buildCompetitionSeasonSummary } = await import('../js/race-results.js');
  const summary = buildCompetitionSeasonSummary([
    { date: '2025-05-10', results: [
      { discipline: 'C1', format: 'Classic', placement: 2, timeSeconds: 180 },
      { discipline: 'C1', format: 'Sprint', placement: 4, timeSeconds: 75 }
    ] },
    { date: '2025-06-01', results: [
      { discipline: 'C1', format: 'Classic', placement: 6, timeSeconds: null },
      { discipline: 'C2', format: 'Sprint', placement: 3, timeSeconds: 80 }
    ] },
    { date: '2026-05-01', results: [{ discipline: 'C1', format: 'Classic', placement: 1, timeSeconds: 175 }] },
    { date: '2026-05-02', results: [{ discipline: 'K1', format: 'Sprint', placement: null, timeSeconds: 70 }] },
    { date: 'not-a-date', results: [{ discipline: 'C1', format: 'Classic', placement: 1 }] },
    { date: '2025-05-11' }
  ]);
  assert.equal(summary.racesWithResults, 4);
  assert.equal(summary.totalStarts, 6);
  const c1Classic2025 = summary.rows.find(row => row.season === 2025 && row.discipline === 'C1' && row.format === 'Classic');
  assert.equal(c1Classic2025.starts, 2);
  assert.equal(c1Classic2025.averagePlacement, 4);
  assert.equal(c1Classic2025.bestPlacement, 2);
  assert.equal(c1Classic2025.podiums, 1);
  assert.equal(c1Classic2025.timesRecorded, 1);
  const k1Sprint2026 = summary.rows.find(row => row.season === 2026 && row.discipline === 'K1');
  assert.equal(k1Sprint2026.averagePlacement, null);
  assert.equal(k1Sprint2026.bestPlacement, null);
});

test('does not mix seasons, boat classes or formats', async () => {
  const { buildCompetitionSeasonSummary } = await import('../js/race-results.js');
  const summary = buildCompetitionSeasonSummary([
    { date: '2024-01-01', results: [{ discipline: 'C1', format: 'Classic', placement: 1 }] },
    { date: '2025-01-01', results: [{ discipline: 'C1', format: 'Sprint', placement: 2 }] },
    { date: '2025-01-02', results: [{ discipline: 'C2', format: 'Classic', placement: 3 }] }
  ]);
  assert.equal(summary.rows.length, 3);
  assert.deepEqual(summary.rows.map(row => [row.season, row.discipline, row.format]), [
    [2025, 'C1', 'Sprint'], [2025, 'C2', 'Classic'], [2024, 'C1', 'Classic']
  ]);
});
