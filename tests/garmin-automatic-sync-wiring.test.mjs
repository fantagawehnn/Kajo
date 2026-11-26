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
  assert.match(todayHandler, /json\(200, \{ ok: true, partial: hasError, sync:/);
});

test('sync-today calls automatic cursors while manual range imports keep the history cursor', () => {
  const todayStart = edgeFunction.indexOf('if (action === "sync-today")');
  const rangeStart = edgeFunction.indexOf('if (action === "sync-range")');
  assert.notEqual(todayStart, -1);
  assert.notEqual(rangeStart, -1);
  const todayHandler = edgeFunction.slice(todayStart, rangeStart);
  assert.match(todayHandler, /syncGarminActivitiesAutomaticBatch\(admin, userId, date, assertSyncLock\)/);
  assert.match(todayHandler, /syncGarminHealthAutomaticBatch\(admin, userId, date, assertSyncLock\)/);
  const rangeHandler = edgeFunction.slice(rangeStart);
  assert.match(rangeHandler, /syncGarminHealthHistoryBatch\(admin, userId, startDate, endDate, false, false\)/);
});

test('all sync actions acquire a per-account database lease and reject concurrent runs', () => {
  assert.match(edgeFunction, /action\.startsWith\("sync-"\)/);
  assert.match(edgeFunction, /rpc\("try_acquire_garmin_sync_lock"/);
  assert.match(edgeFunction, /p_lease_seconds: 900/);
  assert.match(edgeFunction, /setInterval\(\(\) =>/);
  assert.match(edgeFunction, /rpc\("renew_garmin_sync_lock"/);
  assert.match(edgeFunction, /clearInterval\(syncLockHeartbeatTimer\)/);
  assert.match(edgeFunction, /acquired !== true/);
  assert.match(edgeFunction, /code: "garmin_sync_already_running"/);
  assert.match(edgeFunction, /finally \{[\s\S]*?rpc\("release_garmin_sync_lock"/);
  assert.match(edgeFunction, /syncLockToken = lockToken/);
});

test('Garmin sync lock uses an expiring atomic lease and token-checked release', () => {
  const migration = readFileSync(
    fileURLToPath(new URL('../supabase/migrations/20261126000100_garmin_sync_lock.sql', import.meta.url)),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.garmin_sync_locks/);
  assert.match(migration, /on conflict \(user_id\) do update/);
  assert.match(migration, /where public\.garmin_sync_locks\.expires_at <= now\(\)/);
  assert.match(migration, /update public\.garmin_sync_locks[\s\S]*?and lock_token = p_lock_token[\s\S]*?and expires_at > now\(\)/);
  assert.match(migration, /grant execute on function public\.renew_garmin_sync_lock[\s\S]*?to service_role/);
  assert.match(migration, /delete from public\.garmin_sync_locks[\s\S]*?and lock_token = p_lock_token/);
  assert.match(migration, /grant execute on function public\.try_acquire_garmin_sync_lock[\s\S]*?to service_role/);
});


test('a lost or unconfirmed Garmin sync lease stops work at safe checkpoints', () => {
  assert.match(edgeFunction, /let syncLockLost = false/);
  assert.match(edgeFunction, /syncLockLost = true/);
  assert.match(edgeFunction, /Date\.now\(\) - syncLockLastRenewedAt >= 12 \* 60 \* 1000/);
  assert.match(edgeFunction, /if \(syncLockLost\) throw new Error/);
  assert.match(edgeFunction, /syncGarminHealthDay\(admin, userId, cursorDate, forceRefresh, assertLock\)/);
  assert.match(edgeFunction, /await garminGet\(token, `\/activitylist-service\/activities\/search\/activities\?\$\{params\.toString\(\)\}`\);\s*assertLock\(\);/);
  assert.match(edgeFunction, /assertLock\(\);\s*const \{ error: coverageError \}/);
  assert.match(edgeFunction, /assertLock\(\);\s*const now = new Date\(\)\.toISOString\(\);\s*const \{ error: stateError \} = await admin\.from\("garmin_sync_state"\)\.upsert/);
  assert.match(edgeFunction, /activityRescanEndDate, 14, assertSyncLock/);
  assert.match(edgeFunction, /"health_history", false, assertSyncLock/);
});
