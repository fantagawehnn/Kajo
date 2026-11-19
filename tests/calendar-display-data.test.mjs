import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisiblePlannedActivities } from '../js/calendar-display-data.js';

test('planned activities remain visible on their date and in the future', () => {
  const rows = [{id:'yesterday',date:'2026-11-18'},{id:'today',date:'2026-11-19'},{id:'tomorrow',date:'2026-11-20'}];
  assert.deepEqual(getVisiblePlannedActivities(rows,'2026-11-19').map(x=>x.id),['today','tomorrow']);
});
test('hiding past planned activities does not mutate stored planning data', () => {
  const rows = [{id:'past',date:'2026-11-18'},{id:'future',date:'2026-11-20'}];
  const snapshot = structuredClone(rows);
  getVisiblePlannedActivities(rows,'2026-11-19');
  assert.deepEqual(rows,snapshot);
});
test('activities without valid dates are omitted', () => {
  assert.deepEqual(getVisiblePlannedActivities([{id:'missing'},{id:'empty',date:''},{id:'ok',date:'2026-11-20'}],'2026-11-19').map(x=>x.id),['ok']);
});
