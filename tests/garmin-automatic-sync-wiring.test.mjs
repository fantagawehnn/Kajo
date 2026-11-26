import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const edgeFunction = readFileSync(
  fileURLToPath(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url)),
  'utf8',
);

test('automatic health sync uses a separate cursor and preserves its progress across date changes', () => {
  assert.match(edgeFunction, /\.eq\("sync_type", "health_auto"\)/);
  assert.match(edgeFunction, /\.eq\("sync_type", "health_history"\)/);
  assert.match(edgeFunction, /from\("garmin_health_records"\)/);
  assert.match(edgeFunction, /syncGarminHealthHistoryBatch\(\s*admin, userId, range\.startDate, today, true, false, 2, "health_auto", true/);
  assert.match(edgeFunction, /else if \(!preserveCursor && \(state\.range_start_date !== startDate \|\| state\.range_end_date !== endDate\)\)/);
});

test('automatic activity sync uses its own cursor and coverage-aware batches', () => {
  assert.match(edgeFunction, /\.eq\("sync_type", "activity_auto"\)/);
  assert.match(edgeFunction, /from\("garmin_activity_sync_days"\)/);
  assert.match(edgeFunction, /range\.startDate, range\.endDate, true, range\.endDate, 2/);
  assert.match(edgeFunction, /sync_type: "activity_auto"/);
});

test('activity sync failure does not prevent the independent health sync', () => {
  const todayStart = edgeFunction.indexOf('if (action === "sync-today")');
  const rangeStart = edgeFunction.indexOf('if (action === "sync-range")');
  const todayHandler = edgeFunction.slice(todayStart, rangeStart);
  assert.match(todayHandler, /try \{\s*activitySync = await syncGarminActivitiesAutomaticBatch/);
  assert.match(todayHandler, /catch \(error\) \{[\s\S]*?activitySync = \{\s*status: "error"/);
  assert.match(todayHandler, /try \{\s*healthSync = await syncGarminHealthAutomaticBatch/);
  assert.match(todayHandler, /catch \(error\) \{[\s\S]*?healthSync = \{\s*status: "error"/);
  assert.match(todayHandler, /activitySync\.status === "error" \|\| healthSync\.status === "error"/);
});

test('sync-today calls automatic cursors while manual range imports keep the history cursor', () => {
  const todayStart = edgeFunction.indexOf('if (action === "sync-today")');
  const rangeStart = edgeFunction.indexOf('if (action === "sync-range")');
  assert.notEqual(todayStart, -1);
  assert.notEqual(rangeStart, -1);
  const todayHandler = edgeFunction.slice(todayStart, rangeStart);
  assert.match(todayHandler, /syncGarminActivitiesAutomaticBatch\(admin, userId, date\)/);
  assert.match(todayHandler, /syncGarminHealthAutomaticBatch\(admin, userId, date\)/);
  const rangeHandler = edgeFunction.slice(rangeStart);
  assert.match(rangeHandler, /syncGarminHealthHistoryBatch\(admin, userId, startDate, endDate, false, false\)/);
});
