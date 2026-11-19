import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisiblePlannedActivities } from '../js/calendar-display-data.js';

test('planned activities remain visible on their date and in the future', () => {
  const rows = [
    { id: 'yesterday', date: '2026-11-18' },
    { id: 'today', date: '2026-11-19' },
    { id: 'tomorrow', date: '2026-11-20' }
  ];
  assert.deepEqual(
    getVisiblePlannedActivities(rows, '2026-11-19').map(item => item.id),
    ['today', 'tomorrow']
  );
});

test('hiding past planned activities does not mutate the stored list', () => {
  const rows = [{ id: 'past', date: '2026-11-18' }, { id: 'future', date: '2026-11-20' }];
  const snapshot = structuredClone(rows);
  getVisiblePlannedActivities(rows, '2026-11-19');
  assert.deepEqual(rows, snapshot);
});

test('invalid and missing dates are not shown as planned activities', () => {
  assert.deepEqual(
    getVisiblePlannedActivities([{ id: 'missing' }, { id: 'bad', date: '' }, { id: 'ok', date: '2026-11-20' }], '2026-11-19')
      .map(item => item.id),
    ['ok']
  );
});
