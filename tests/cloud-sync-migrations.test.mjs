import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = name => readFileSync(
    fileURLToPath(new URL('../supabase/migrations/' + name, import.meta.url)),
    'utf8'
);

test('partial snapshot RPC is authenticated and uses optimistic version checking', () => {
    const sql = migration('20261125000100_patch_user_data.sql');
    assert.match(sql, /v_user_id := auth\.uid\(\)/i);
    assert.match(sql, /version = p_expected_version/i);
    assert.match(sql, /version = version \+ 1/i);
    assert.match(sql, /data = coalesce\(data, '\{\}'::jsonb\) \|\| p_patch/i);
    assert.match(sql, /grant execute on function public\.patch_user_data\(jsonb, integer\) to authenticated/i);
    assert.match(sql, /revoke all on function public\.patch_user_data\(jsonb, integer\) from anon/i);
    assert.doesNotMatch(sql, /delete\s+from|truncate\s+table/i);
});

test('Realtime publishes only compact sync state, not personal snapshot or activity tables', () => {
    const sql = migration('20261125000200_kajo_cloud_sync_realtime.sql');
    assert.match(sql, /create table if not exists public\.kajo_sync_state/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /using \(auth\.uid\(\) = user_id\)/i);
    assert.match(sql, /alter publication supabase_realtime add table public\.kajo_sync_state/i);
    assert.doesNotMatch(sql, /alter publication supabase_realtime add table public\.(user_data|activities)/i);
    assert.match(sql, /after insert or update on public\.user_data/i);
    assert.match(sql, /after insert or update or delete on public\.activities/i);
});

test('Garmin preview delta index follows the user, update timestamp and Garmin activity ID', () => {
    const sql = migration('20261125000400_garmin_activities_updated_at_index.sql');
    assert.match(sql, /on public\.garmin_activities\s*\(user_id, updated_at, garmin_activity_id\)/i);
});

test('activity delta index follows the user, update timestamp and stable record key', () => {
    const sql = migration('20261125000300_kajo_activity_updated_at_index.sql');
    assert.match(sql, /on public\.activities\s*\(user_id, updated_at, record_id\)/i);
});


test('past activity deletion tombstones are immutable, account-scoped, and block resurrection', () => {
    const sql = migration('20261127000100_activity_deletion_tombstones.sql');
    assert.match(sql, /create table if not exists public\.activity_deletions/i);
    assert.match(sql, /primary key \(user_id, record_id\)/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /grant select, insert on public\.activity_deletions to authenticated/i);
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /before insert or update on public\.activities/i);
    assert.match(sql, /before insert or update on public\.garmin_activities/i);
    assert.match(sql, /return null/i);
    assert.match(sql, /after insert on public\.activity_deletions/i);
    assert.doesNotMatch(sql, /grant (?:update|delete).*activity_deletions/i);
});
