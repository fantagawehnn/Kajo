import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHealthDocumentation, summarizeHealthEpisodes } from '../js/health-calculations.js';

test('counts documented sick and injured days and activities on those days', () => {
  const result = summarizeHealthDocumentation(
    {
      '2026-11-10': { status: 'sick', diagnosis: 'Infekt' },
      '2026-11-11': { status: 'sick' },
      '2026-11-12': { status: 'injured' },
      '2026-11-13': { status: 'healthy' }
    },
    [
      { date: '2026-11-10', duration: 30 },
      { date: '2026-11-12', duration: 45 },
      { date: '2026-11-13', duration: 60 }
    ],
    [],
    '2026-11-01',
    '2026-11-30'
  );
  assert.equal(result.documentedHealthDays, 3);
  assert.equal(result.sickDays, 2);
  assert.equal(result.injuredDays, 1);
  assert.equal(result.activitiesOnSickDays, 1);
  assert.equal(result.activitiesOnInjuredDays, 1);
  assert.equal(result.availability, null);
});

test('reports planned days without same-day activities without calling them missed sessions', () => {
  const result = summarizeHealthDocumentation(
    {
      '2026-11-10': { status: 'sick' },
      '2026-11-11': { status: 'injured' }
    },
    [{ date: '2026-11-10', name: 'Training' }],
    [
      { date: '2026-11-10', name: 'Session A' },
      { date: '2026-11-11', name: 'Session B' },
      { date: '2026-11-11', name: 'Session C' }
    ],
    '2026-11-01',
    '2026-11-30'
  );
  assert.equal(result.plannedSessionsOnSickDays, 1);
  assert.equal(result.plannedSessionsOnInjuredDays, 2);
  assert.equal(result.plannedSickDaysWithoutActivity, 0);
  assert.equal(result.plannedInjuredDaysWithoutActivity, 1);
});

test('does not infer healthy days or count records outside the selected range', () => {
  const result = summarizeHealthDocumentation(
    { '2026-10-31': { status: 'sick' }, '2026-11-02': { status: 'injured' } },
    [],
    [],
    '2026-11-01',
    '2026-11-30'
  );
  assert.equal(result.documentedHealthDays, 1);
  assert.equal(result.sickDays, 0);
  assert.equal(result.injuredDays, 1);
  assert.equal(result.availability, null);
});

test('returns null for an invalid date range', () => {
  assert.equal(summarizeHealthDocumentation({}, [], [], '2026-02-30', '2026-03-01'), null);
  assert.equal(summarizeHealthDocumentation({}, [], [], '2026-11-20', '2026-11-01'), null);
});

test('groups consecutive documented days with the same status into episodes', () => {
  const episodes = summarizeHealthEpisodes({
    '2026-11-01': { status: 'sick', diagnosis: 'Infekt' },
    '2026-11-02': { status: 'sick' },
    '2026-11-03': { status: 'sick', diagnosis: 'Infekt' },
    '2026-11-04': { status: 'injured', diagnosis: 'Schulter' },
    '2026-11-06': { status: 'injured', diagnosis: 'Schulter' }
  }, '2026-11-01', '2026-11-30');
  assert.equal(episodes.length, 3);
  assert.deepEqual(episodes.map(item => [item.status, item.startDate, item.endDate, item.documentedDays]), [
    ['sick', '2026-11-01', '2026-11-03', 3],
    ['injured', '2026-11-04', '2026-11-04', 1],
    ['injured', '2026-11-06', '2026-11-06', 1]
  ]);
  assert.deepEqual(episodes[0].diagnoses, ['Infekt']);
});

test('keeps full episode boundaries when the selected window starts mid-episode', () => {
  const episodes = summarizeHealthEpisodes({
    '2026-10-30': { status: 'sick' },
    '2026-10-31': { status: 'sick' },
    '2026-11-01': { status: 'sick' },
    '2026-11-02': { status: 'sick' }
  }, '2026-11-01', '2026-11-30');
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].startDate, '2026-10-30');
  assert.equal(episodes[0].documentedDays, 4);
  assert.equal(episodes[0].daysInWindow, 2);
});

test('does not infer an episode across missing days or healthy-status gaps', () => {
  const episodes = summarizeHealthEpisodes({
    '2026-11-01': { status: 'sick' },
    '2026-11-02': { status: 'healthy' },
    '2026-11-03': { status: 'sick' },
    '2026-11-05': { status: 'sick' }
  }, '2026-11-01', '2026-11-30');
  assert.deepEqual(episodes.map(item => [item.startDate, item.endDate]), [
    ['2026-11-01', '2026-11-01'],
    ['2026-11-03', '2026-11-03'],
    ['2026-11-05', '2026-11-05']
  ]);
});

test('counts explicitly documented training impact separately from missing impact data', () => {
  const result = summarizeHealthDocumentation({
    '2026-11-01': { status: 'sick', trainingAvailability: 'unavailable' },
    '2026-11-02': { status: 'sick', trainingAvailability: 'reduced' },
    '2026-11-03': { status: 'injured', trainingAvailability: 'unrestricted' },
    '2026-11-04': { status: 'injured' },
    '2026-11-05': { status: 'healthy', trainingAvailability: 'unavailable' }
  }, [], [], '2026-11-01', '2026-11-30');
  assert.deepEqual(result.trainingAvailability, {
    unrestricted: 1,
    reduced: 1,
    unavailable: 1,
    undocumented: 1
  });
});

test('does not count training impact attached to healthy days', () => {
  const result = summarizeHealthDocumentation({
    '2026-11-01': { status: 'healthy', trainingAvailability: 'unavailable' }
  }, [], [], '2026-11-01', '2026-11-30');
  assert.deepEqual(result.trainingAvailability, {
    unrestricted: 0,
    reduced: 0,
    unavailable: 0,
    undocumented: 0
  });
});
