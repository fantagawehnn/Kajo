import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const edgeFunction = readFileSync(
  fileURLToPath(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url)),
  'utf8',
);
const mainJs = readFileSync(
  fileURLToPath(new URL('../js/main.js', import.meta.url)),
  'utf8',
);

test('automatic health sync has a dedicated cursor and one-time legacy seed', () => {
  assert.match(edgeFunction, /\.eq\("sync_type", "health_auto"\)/);
  assert.match(edgeFunction, /\.eq\("sync_type", "health_history"\)/);
  assert.match(edgeFunction, /from\("garmin_health_records"\)/);
  assert.match(edgeFunction, /syncGarminHealthHistoryBatch\([\s\S]*?"health_auto", true, assertLock/);
});

test('automatic activity sync has a separate cursor and uses persisted date coverage', () => {
  assert.match(edgeFunction, /\.eq\("sync_type", "activity_auto"\)/);
  assert.match(edgeFunction, /from\("garmin_activity_sync_days"\)/);
  assert.match(edgeFunction, /syncGarminActivitiesForUser\([\s\S]*?range\.endDate, 2, assertLock/);
  assert.match(edgeFunction, /sync_type: "activity_auto"/);
});

test('sync-today runs both cursor systems independently under the account lock', () => {
  const start = edgeFunction.indexOf('if (action === "sync-today")');
  const end = edgeFunction.indexOf('if (action === "sync-range")', start);
  const handler = edgeFunction.slice(start, end);
  assert.match(handler, /withGarminSyncLock\(admin, userId, async \(assertLock\)/);
  assert.match(handler, /try \{[\s\S]*?syncGarminActivitiesAutomaticBatch\(admin, userId, date, assertLock\)/);
  assert.match(handler, /catch \(error\) \{\s*activitySync = captureSyncError\(error\)/);
  assert.match(handler, /try \{[\s\S]*?syncGarminHealthAutomaticBatch\(admin, userId, date, assertLock\)/);
  assert.match(handler, /catch \(error\) \{\s*healthSync = captureSyncError\(error\)/);
  assert.match(handler, /Synchronisierungssperre/);
});

test('manual history imports retain the separate health_history cursor', () => {
  const start = edgeFunction.indexOf('if (action === "sync-range")');
  const end = edgeFunction.indexOf('if (action === "sync-health-history-batch")', start);
  const handler = edgeFunction.slice(start, end);
  assert.match(handler, /"health_history", false, assertLock/);
});

test('health-day endpoint iteration checks the lock and retries late-arriving no-data records separately', () => {
  assert.match(edgeFunction, /async function syncGarminHealthDay\([\s\S]*?assertLock\(\);[\s\S]*?for \(const endpoint of endpoints\)[\s\S]*?assertLock\(\);/);
  assert.match(edgeFunction, /LATE_ARRIVING_HEALTH_TYPES/);
  assert.match(edgeFunction, /selectLateArrivingHealthRetryDate\(retryMarkers/);
  assert.match(edgeFunction, /lateDataRetryDate,[\s\S]*?processedDays/);
});

test('the client automatically continues unfinished cursor batches and imports late health data locally', () => {
  assert.match(mainJs, /activitySync\.progress\?\.remainingDays/);
  assert.match(mainJs, /health\?\.remainingDays/);
  assert.match(mainJs, /setTimeout\([\s\S]*?syncGarminTodayOnOpen\(userId\)/);
  assert.match(mainJs, /health\?\.lateDataRetryDate/);
  assert.match(mainJs, /loadGarminHealthRecordsIntoCheckins\(lateDataRetryDate, lateDataRetryDate\)/);
  assert.match(mainJs, /firstError\.status === 409 && firstError\.code === 'garmin_sync_already_running'/);
  assert.match(mainJs, /response\.busy === true/);
});
