import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHealthDocumentation } from '../js/health-calculations.js';

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
