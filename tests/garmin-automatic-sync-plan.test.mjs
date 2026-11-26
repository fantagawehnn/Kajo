import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutomaticGarminSyncRange } from '../supabase/functions/garmin-personal/automatic-sync-plan.js';

test('starts a new automatic sync with the configured overlap', () => {
  assert.deepEqual(
    buildAutomaticGarminSyncRange({
      today: '2026-11-26',
      maxDays: 2,
      initialOverlapDays: 1,
    }),
    {
      startDate: '2026-11-25',
      endDate: '2026-11-26',
      nextCursorDate: '2026-11-27',
      isComplete: true,
    },
  );
});

test('rechecks the last completed day and caps the next batch', () => {
  assert.deepEqual(
    buildAutomaticGarminSyncRange({
      today: '2026-11-26',
      cursorDate: '2026-11-20',
      status: 'completed',
      maxDays: 3,
    }),
    {
      startDate: '2026-11-19',
      endDate: '2026-11-21',
      nextCursorDate: '2026-11-22',
      isComplete: false,
    },
  );
});

test('continues an interrupted or pending batch from the failed cursor', () => {
  for (const status of ['error', 'running', 'pending']) {
    assert.deepEqual(
      buildAutomaticGarminSyncRange({
        today: '2026-11-26',
        cursorDate: '2026-11-23',
        status,
        maxDays: 2,
      }),
      {
        startDate: '2026-11-23',
        endDate: '2026-11-24',
        nextCursorDate: '2026-11-25',
        isComplete: false,
      },
    );
  }
});

test('catches up a multi-day pause without exceeding the activity batch limit', () => {
  const first = buildAutomaticGarminSyncRange({
    today: '2026-11-26',
    cursorDate: '2026-10-01',
    status: 'running',
    maxDays: 14,
  });
  assert.equal(first.startDate, '2026-10-01');
  assert.equal(first.endDate, '2026-10-14');
  assert.equal(first.nextCursorDate, '2026-10-15');
  assert.equal(first.isComplete, false);
});

test('reopens the current date when the completed cursor is already beyond today', () => {
  const result = buildAutomaticGarminSyncRange({
    today: '2026-11-26',
    cursorDate: '2026-11-27',
    status: 'completed',
    maxDays: 14,
  });
  assert.equal(result.startDate, '2026-11-26');
  assert.equal(result.endDate, '2026-11-26');
  assert.equal(result.isComplete, true);
});

test('rejects malformed dates', () => {
  assert.throws(() => buildAutomaticGarminSyncRange({ today: '26.11.2026' }));
});
