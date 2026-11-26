import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';


const edgeFunction = readFileSync(
    fileURLToPath(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url)),
    'utf8'
);

const healthDayStart = edgeFunction.indexOf('async function syncGarminHealthDay(');
assert.notEqual(healthDayStart, -1, 'Garmin health-day sync function must exist');
const healthDayEnd = edgeFunction.indexOf('\nfunction addUtcDays', healthDayStart);
assert.notEqual(healthDayEnd, -1, 'Garmin health-day sync function must close');
const healthDayFunction = edgeFunction.slice(healthDayStart, healthDayEnd);

const main = readFileSync(
    fileURLToPath(new URL('../js/main.js', import.meta.url)),
    'utf8'
);

const syncStart = main.indexOf('async function syncGarminTodayOnOpen(userId) {');
assert.notEqual(syncStart, -1, 'Garmin app-open sync function must exist');
const syncEnd = main.indexOf('\n}\n', syncStart);
assert.notEqual(syncEnd, -1, 'Garmin app-open sync function must close');
const syncFunction = main.slice(syncStart, syncEnd + 3);

const cloudLoaderStart = main.indexOf('async function loadGarminActivitiesFromCloud(');
assert.notEqual(cloudLoaderStart, -1, 'Garmin cloud preview loader must exist');
const cloudLoaderEnd = main.indexOf('\n\nfunction findGarminNumber', cloudLoaderStart);
assert.notEqual(cloudLoaderEnd, -1, 'Garmin cloud preview loader must close');
const cloudLoader = main.slice(cloudLoaderStart, cloudLoaderEnd);


test('Garmin app-open sync automatically resumes after rate limits with a bounded retry loop', () => {
    assert.equal(
        (syncFunction.match(/callGarminFunction\(\{ action: 'sync-today', date \}\)/g) || []).length,
        1
    );
    assert.match(syncFunction, /let consecutiveRateLimits = 0/);
    assert.match(syncFunction, /while \(true\)/);
    assert.match(syncFunction, /consecutiveRateLimits >= 8/);
    assert.match(syncFunction, /healthAttempt\.status === 'rate_limited'/);
    assert.match(syncFunction, /HTTP 429\|rate\.\?limit\/i\.test\(healthError\)/);
    assert.match(syncFunction, /activityError/);
    assert.match(syncFunction, /setTimeout\(resolve, waitSeconds \* 1000\)/);
    assert.match(syncFunction, /if \(!isCurrentSync\(\)\) return/);
    assert.match(syncFunction, /syncAttempted = true;\s*let response/);
    assert.match(syncFunction, /finally\s*\{\s*if \(syncAttempted\) garminDailySyncCompleted\.add\(runKey\)/);
});

test('partial results from independent Garmin syncs are shown instead of treated as request failures', () => {
    assert.match(syncFunction, /response\.partial === true/);
    assert.match(syncFunction, /activitySync\.status === 'error'/);
    assert.match(syncFunction, /health\?\.status === 'error'/);
});

test('multi-day activity catch-up is not reported as fully synchronized', () => {
    assert.match(syncFunction, /Number\(activitySync\.progress\?\.remainingDays \|\| 0\) > 0/);
});

test('rate-limited and unfinished health syncs are surfaced as partial states after retry exhaustion', () => {
    assert.match(syncFunction, /health\?\.status === 'rate_limited'/);
    assert.match(syncFunction, /health\?\.status === 'in_progress'/);
    assert.match(syncFunction, /health\?\.rateLimited === true/);
});

test('cloud Garmin activity previews are not preloaded separately before the daily sync', () => {
    assert.doesNotMatch(main, /void loadGarminActivitiesFromCloud\(userId, sequence\)/);
    assert.match(syncFunction, /loadGarminActivitiesFromCloud\(userId, syncActivationSequence\)/);
});

test('Garmin health endpoints are not retried inside the same app-open attempt', () => {
    assert.equal(
        (healthDayFunction.match(/garminGet\(token, endpoint\.path\)/g) || []).length,
        1
    );
    assert.doesNotMatch(healthDayFunction, /setTimeout|firstError|HTTP 520/);
});

test('Garmin cloud preview payloads are fetched only for new or changed activity IDs', () => {
    assert.match(cloudLoader, /select\('garmin_activity_id, updated_at'\)/);
    assert.match(cloudLoader, /getGarminActivityRowsNeedingPayload\(\s*metadata,\s*seenAtById,\s*locallyAvailableGarminIds\s*\)/);
    assert.match(cloudLoader, /\.in\('garmin_activity_id', ids\)/);
    assert.match(cloudLoader, /setUserLocalSetting\('garminActivityCloudSeenAtById'/);
});


test('a concurrent Garmin sync lock is handled as a neutral busy state', () => {
    const callStart = main.indexOf('async function callGarminFunction(body) {');
    const callEnd = main.indexOf('\n}\n', callStart);
    assert.notEqual(callStart, -1, 'Garmin function caller must exist');
    assert.notEqual(callEnd, -1, 'Garmin function caller must close');
    const callFunction = main.slice(callStart, callEnd + 3);
    assert.match(callFunction, /code = payload\?\.code/);
    assert.match(callFunction, /firstError\.code === 'garmin_sync_already_running'/);
    assert.match(callFunction, /return \{ ok: true, busy: true \}/);
    assert.match(syncFunction, /if \(response\.busy === true\)/);
    assert.match(syncFunction, /setGarminSyncIndicator\('current', 'Verbunden'\)/);
    assert.match(syncFunction, /läuft bereits eine Synchronisierung auf einem anderen Gerät/);
    assert.match(syncFunction, /if \(response\.busy === true\)[\s\S]*?return;/);
});
