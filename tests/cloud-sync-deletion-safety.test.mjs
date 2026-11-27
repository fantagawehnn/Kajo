import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

test('cloud reconciliation fails closed when deletion tombstones cannot be read', () => {
    const start = main.indexOf('async function loadAccountActivityDeletionRows(userId)');
    const end = main.indexOf('\n}\n', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const loader = main.slice(start, end);
    assert.match(loader, /return await fetchActivityDeletionTombstones\(supabase, userId\)/);
    assert.doesNotMatch(loader, /return \[\]/);
});

test('regular cloud sync stops if pending deletion tombstones cannot be confirmed', () => {
    assert.match(
        main,
        /await flushLocalPersistence\(\);[\s\S]{0,500}await syncPendingActivityDeletionTombstones\(supabase, userId\);[\s\S]{0,300}pendingOutboxRecord/
    );
    assert.doesNotMatch(
        main,
        /try \{\s*await syncPendingActivityDeletionTombstones\(supabase, userId\);\s*\} catch/
    );
});

test('initial cloud transfer uploads pending deletion tombstones before activities', () => {
    const start = main.indexOf('async function performCloudInitialTransfer()');
    const end = main.indexOf('\n}\n', start);
    const transfer = main.slice(start, end);
    const tombstones = transfer.indexOf('await syncPendingActivityDeletionTombstones(supabase, userId)');
    const activities = transfer.indexOf('await syncCloudActivities(supabase, userId');
    assert.ok(tombstones >= 0);
    assert.ok(activities > tombstones);
});
