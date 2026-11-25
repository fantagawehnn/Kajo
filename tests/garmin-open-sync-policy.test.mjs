import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const main = readFileSync(
    fileURLToPath(new URL('../js/main.js', import.meta.url)),
    'utf8'
);

const syncStart = main.indexOf('async function syncGarminTodayOnOpen(userId) {');
assert.notEqual(syncStart, -1, 'Garmin app-open sync function must exist');
const syncEnd = main.indexOf('\n}\n', syncStart);
assert.notEqual(syncEnd, -1, 'Garmin app-open sync function must close');
const syncFunction = main.slice(syncStart, syncEnd + 3);

test('Garmin API is attempted once per app opening without an in-session retry loop', () => {
    assert.equal(
        (syncFunction.match(/callGarminFunction\(\{ action: 'sync-today', date \}\)/g) || []).length,
        1
    );
    assert.doesNotMatch(syncFunction, /for\s*\(\s*let attempt/);
    assert.match(syncFunction, /cloudActivityLoadAttempted/);
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
