import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const start = main.indexOf('async function syncGarminTodayOnOpen(userId) {');
const end = main.indexOf('\n}\n', start);
assert.notEqual(start, -1, 'Garmin app-open sync function must exist');
assert.notEqual(end, -1, 'Garmin app-open sync function must close');
const sync = main.slice(start, end + 3);

test('stored Garmin activities are loaded even when Garmin is not connected', () => {
    assert.match(sync, /connection\.connection\?\.status !== 'connected'[\s\S]*?await loadCloudActivitiesOnce\(\);[\s\S]*?return;/);
});

test('stored Garmin activities are loaded when another device owns the sync lock', () => {
    assert.match(sync, /if \(response\.busy === true\) \{\s*await loadCloudActivitiesOnce\(\);/);
});

test('stored Garmin activities are loaded after a live Garmin sync error', () => {
    assert.match(sync, /catch \(error\) \{[\s\S]*?await loadCloudActivitiesOnce\(\);[\s\S]*?Automatischer Tagesabgleich fehlgeschlagen/);
});

test('cloud activity loading is guarded so one app-open sync cannot load it repeatedly', () => {
    assert.match(sync, /let cloudActivityLoadAttempted = false/);
    assert.match(sync, /const loadCloudActivitiesOnce = async \(\) => \{\s*if \(cloudActivityLoadAttempted\) return null;\s*cloudActivityLoadAttempted = true;/);
    assert.equal((sync.match(/loadGarminActivitiesFromCloud\(userId, syncActivationSequence\)/g) || []).length, 1);
});

test('new cloud activities still trigger analysis backfill after activation checks', () => {
    assert.match(sync, /if \(cloudActivities\.added > 0 \|\| cloudActivities\.merged > 0\) \{\s*void backfillGarminAnalysisOnOpen\(userId, syncActivationSequence\);/);
    assert.match(sync, /if \(!isCurrentSync\(\)\) return null;\s*if \(cloudActivities\.added/);
});
