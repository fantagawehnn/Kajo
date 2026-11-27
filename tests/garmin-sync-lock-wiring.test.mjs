import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url), 'utf8');

test('Garmin sync lock uses a renewable 15-minute lease', () => {
  assert.match(source, /try_acquire_garmin_sync_lock/);
  assert.match(source, /p_lease_seconds:\s*900/);
  assert.match(source, /renew_garmin_sync_lock/);
  assert.match(source, /setInterval\([\s\S]*?60_000\)/);
  assert.match(source, /release_garmin_sync_lock/);
});

test('all user-facing Garmin sync actions are serialized', () => {
  for (const action of ['sync-today', 'sync-range', 'sync-health-history-batch', 'sync-activities']) {
    const start = source.indexOf(`if (action === "${action}")`);
    assert.notEqual(start, -1, `missing action handler: ${action}`);
    const next = source.indexOf('\n    if (action === "', start + 1);
    const handler = source.slice(start, next === -1 ? undefined : next);
    assert.match(handler, /withGarminSyncLock/, `${action} is not protected by a lock`);
    assert.match(handler, /garmin_sync_already_running/, `${action} does not handle an active lock`);
  }
});

test('background sync also acquires a per-account lock', () => {
  const start = source.indexOf('if (action === "background-sync")');
  const end = source.indexOf('\n    const authHeader', start);
  const handler = source.slice(start, end);
  assert.match(handler, /withGarminSyncLock/);
  assert.match(handler, /sync_already_running/);
});

test('long-running activity and health batches check lock ownership at safe checkpoints', () => {
  assert.match(source, /assertSyncLock: \(\) => void = \(\) => \{\}/);
  assert.match(source, /syncGarminHealthDay\(admin, userId, cursorDate, forceRefresh, assertSyncLock\)/);
  assert.match(source, /assertSyncLock\(\);[\s\S]{0,800}garminGet/);
  assert.match(source, /assertSyncLock\(\);[\s\S]{0,180}upsert\(records/);
});

test('sync-today isolates activity and health failures while preserving lock-loss safety', () => {
  const start = source.indexOf('if (action === "sync-today")');
  const end = source.indexOf('if (action === "sync-range")', start);
  const handler = source.slice(start, end);
  assert.match(handler, /try\s*\{[\s\S]*?syncGarminActivitiesAutomaticBatch/);
  assert.match(handler, /catch \(error\)\s*\{\s*activitySync = captureSyncError\(error\)/);
  assert.match(handler, /try\s*\{[\s\S]*?syncGarminHealthAutomaticBatch/);
  assert.match(handler, /catch \(error\)\s*\{\s*healthSync = captureSyncError\(error\)/);
  assert.match(handler, /Synchronisierungssperre/i);
  assert.match(handler, /status: rateLimited \? "rate_limited" : "error"/);
});
