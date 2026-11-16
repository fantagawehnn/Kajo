import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHealthDocumentation, summarizeHealthEpisodes, summarizeHealthEpisodeTrainingImpact } from '../js/health-calculations.js';

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


test('compares documented activity volume before, during and after a health episode', () => {
  const healthLogs = {
    '2026-11-15': { status: 'sick' },
    '2026-11-16': { status: 'sick' },
    '2026-11-20': { status: 'injured' }
  };
  const episodes = [{
    status: 'sick', startDate: '2026-11-15', endDate: '2026-11-16', documentedDays: 2
  }];
  const activities = [
    { date: '2026-11-01', duration: 60 },
    { date: '2026-11-10', duration: 30 },
    { date: '2026-11-15', duration: 20 },
    { date: '2026-11-16', duration: 25 },
    { date: '2026-11-22', duration: 45 },
    { date: '2026-11-25', duration: null },
    { date: '2026-11-30', duration: 90 }
  ];
  const [result] = summarizeHealthEpisodeTrainingImpact(healthLogs, activities, episodes, 14);
  assert.equal(result.before.activities, 2);
  assert.equal(result.before.totalMinutes, 90);
  assert.equal(result.during.activities, 2);
  assert.equal(result.during.totalMinutes, 45);
  assert.equal(result.after.activities, 3);
  assert.equal(result.after.activitiesWithDuration, 2);
  assert.equal(result.after.activitiesWithoutDuration, 1);
  assert.equal(result.after.totalMinutes, 135);
  assert.equal(result.before.calendarDays, 14);
  assert.equal(result.during.calendarDays, 2);
  assert.equal(result.after.calendarDays, 14);
});

test('excludes other documented health dates from before/after comparison windows', () => {
  const result = summarizeHealthEpisodeTrainingImpact(
    { '2026-11-10': { status: 'injured' }, '2026-11-20': { status: 'sick' } },
    [
      { date: '2026-11-10', duration: 80 },
      { date: '2026-11-12', duration: 40 },
      { date: '2026-11-20', duration: 30 },
      { date: '2026-11-22', duration: 50 }
    ],
    [{ status: 'sick', startDate: '2026-11-20', endDate: '2026-11-20', documentedDays: 1 }],
    14
  )[0];
  assert.equal(result.before.activities, 1);
  assert.equal(result.before.totalMinutes, 40);
  assert.equal(result.during.totalMinutes, 30);
  assert.equal(result.after.activities, 1);
  assert.equal(result.after.totalMinutes, 50);
});

test('rejects invalid comparison windows and skips invalid episodes', () => {
  assert.equal(summarizeHealthEpisodeTrainingImpact({}, [], [], 0), null);
  assert.deepEqual(summarizeHealthEpisodeTrainingImpact({}, [], [
    { status: 'sick', startDate: '2026-02-30', endDate: '2026-03-01' }
  ]), []);
});


test('adds load values from one selected model without treating missing loads as zero', () => {
  const healthLogs = { '2026-11-15': { status: 'sick' } };
  const activities = [
    { id: 'a', date: '2026-11-10', duration: 60 },
    { id: 'b', date: '2026-11-15', duration: 30 },
    { id: 'c', date: '2026-11-22', duration: 45 }
  ];
  const loadRecords = [
    { activity: activities[0], value: 42 },
    { activity: activities[1], value: 15 },
    { activity: activities[2], value: null }
  ];
  const [result] = summarizeHealthEpisodeTrainingImpact(
    healthLogs, activities,
    [{ status: 'sick', startDate: '2026-11-15', endDate: '2026-11-15', documentedDays: 1 }],
    14, loadRecords, 'srpe', 'AU'
  );
  assert.equal(result.before.trainingLoad, 42);
  assert.equal(result.before.trainingLoadActivityCount, 1);
  assert.equal(result.before.trainingLoadMode, 'srpe');
  assert.equal(result.before.trainingLoadUnit, 'AU');
  assert.equal(result.during.trainingLoad, 15);
  assert.equal(result.after.trainingLoad, null);
  assert.equal(result.after.trainingLoadActivityCount, 0);
});


test('summarizes return-to-training in days 1–7, 8–14 and 15–28 against a pre-episode baseline', () => {
  const healthLogs = {
    '2026-11-15': { status: 'sick' },
    '2026-11-16': { status: 'sick' },
    '2026-11-19': { status: 'injured' }
  };
  const activities = [
    { date: '2026-11-05', duration: 60 },
    { date: '2026-11-17', duration: 60 },
    { date: '2026-11-20', duration: 100 },
    { date: '2026-11-22', duration: 30 },
    { date: '2026-11-25', duration: 70 },
    { date: '2026-12-02', duration: 140 }
  ];
  const [result] = summarizeHealthEpisodeTrainingImpact(
    healthLogs, activities,
    [{ status: 'sick', startDate: '2026-11-15', endDate: '2026-11-16', documentedDays: 2 }],
    14
  );
  const [first, second, third] = result.returnToTraining.windows;
  assert.deepEqual([first.from, first.to, second.from, second.to, third.from, third.to], [
    '2026-11-17', '2026-11-23', '2026-11-24', '2026-11-30', '2026-12-01', '2026-12-14'
  ]);
  assert.equal(result.returnToTraining.baseline.totalMinutes, 60);
  assert.equal(first.totalMinutes, 90);
  assert.equal(first.activities, 2);
  assert.equal(first.eligibleCalendarDays, 6);
  assert.equal(first.averageMinutesPerCalendarDay, 15);
  assert.equal(first.averageMinutesChangePercent, 250);
  assert.equal(second.totalMinutes, 70);
  assert.equal(third.totalMinutes, 140);
  assert.match(result.returnToTraining.note, /keine medizinische Freigabe/);
});

test('does not calculate relative return-to-training change when baseline is zero or unavailable', () => {
  const [result] = summarizeHealthEpisodeTrainingImpact(
    {},
    [{ date: '2026-11-18', duration: 30 }],
    [{ status: 'sick', startDate: '2026-11-15', endDate: '2026-11-16', documentedDays: 2 }],
    14
  );
  assert.equal(result.returnToTraining.baseline.averageMinutesPerCalendarDay, 0);
  assert.equal(result.returnToTraining.windows[0].averageMinutesChangePercent, null);
});
