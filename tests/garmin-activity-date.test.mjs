import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGarminActivityDate } from '../supabase/functions/garmin-personal/activity-date.js';

test('uses the Garmin local calendar date when it is available', () => {
  assert.equal(resolveGarminActivityDate({ startTimeLocal: '2026-06-04 08:35:12' }), '2026-06-04');
  assert.equal(resolveGarminActivityDate({ startTimeLocal: '2025-08-01T23:45:00+02:00' }), '2025-08-01');
});

test('falls back to a valid GMT timestamp when local date is unavailable', () => {
  assert.equal(resolveGarminActivityDate({ startTimeGMT: '2026-06-04T06:35:12Z' }), '2026-06-04');
  assert.equal(resolveGarminActivityDate({ startTimeLocal: 1787909585000 }), '2026-08-28');
  assert.equal(resolveGarminActivityDate({ startTimeLocal: '1787909585000' }), '2026-08-28');
});

test('returns null for missing or invalid timestamps', () => {
  assert.equal(resolveGarminActivityDate({}), null);
  assert.equal(resolveGarminActivityDate({ startTimeLocal: 'not-a-date' }), null);
});
