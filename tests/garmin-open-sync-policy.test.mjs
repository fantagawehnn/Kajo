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


test('Garmin API is attempted once per app opening without an in-session retry loop', () => {
    assert.equal(
        (syncFunction.match(/callGarminFunction\(\{ action: 'sync-today', date \}\)/g) || []).length,
        1
    );
    assert.doesNotMatch(syncFunction, /for\s*\(\s*let attempt/);
    assert.match(syncFunction, /cloudActivityLoadAttempted/);
});

test('multi-day activity catch-up is not reported as fully synchronized', () => {
    assert.match(syncFunction, /Number\(activitySync\.progress\?\.remainingDays \|\| 0\) > 0/);
});

test('rate-limited and unfinished health syncs remain eligible for the next app opening', () => {
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
