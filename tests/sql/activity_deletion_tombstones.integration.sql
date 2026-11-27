-- Integration test for immutable, account-scoped activity deletion markers.
-- The workflow creates the minimal Supabase roles and auth.users table.

\set ON_ERROR_STOP on

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select null::uuid $$;

create table public.activities (
    user_id uuid not null,
    record_id text not null,
    payload jsonb not null default '{}'::jsonb,
    constraint activities_user_record_key unique (user_id, record_id)
);

create table public.garmin_activities (
    user_id uuid not null,
    garmin_activity_id text not null,
    activity jsonb not null default '{}'::jsonb,
    constraint garmin_activities_user_activity_key unique (user_id, garmin_activity_id)
);

\echo 'Applying activity deletion tombstone migration'
\i supabase/migrations/20261127000100_activity_deletion_tombstones.sql

-- Seed rows before the tombstones: existing copies are retained as historical
-- storage, but updates and new upserts must not resurrect them.
insert into public.activities (user_id, record_id, payload) values
    ('00000000-0000-0000-0000-000000000001', 'garmin-123', '{"name":"old local copy"}'),
    ('00000000-0000-0000-0000-000000000002', 'garmin-123', '{"name":"other account"}');

insert into public.garmin_activities (user_id, garmin_activity_id, activity) values
    ('00000000-0000-0000-0000-000000000001', '123', '{"activityName":"old Garmin copy"}'),
    ('00000000-0000-0000-0000-000000000002', '123', '{"activityName":"other account"}');

insert into public.activity_deletions (user_id, record_id, garmin_activity_id, activity_date)
values ('00000000-0000-0000-0000-000000000001', 'garmin-123', '123', '2026-11-20');

-- Exercise the optional Realtime notification path too. The first marker
-- above was inserted without this function/table and therefore had to succeed
-- without Realtime support.
create table public.kajo_sync_state (
    user_id uuid not null,
    scope text not null,
    version bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (user_id, scope)
);

create or replace function public.touch_kajo_sync_state(
    p_user_id uuid,
    p_scope text,
    p_version bigint
)
returns void
language plpgsql
as $fn$
begin
    insert into public.kajo_sync_state (user_id, scope, version, updated_at)
    values (p_user_id, p_scope, p_version, now())
    on conflict (user_id, scope) do update
       set version = public.kajo_sync_state.version + 1,
           updated_at = excluded.updated_at;
end;
$fn$;

insert into public.activity_deletions (user_id, record_id, garmin_activity_id, activity_date)
values ('00000000-0000-0000-0000-000000000001', 'garmin-456', '456', '2026-11-21');

-- The same user's old rows cannot be updated or inserted again.
update public.activities
   set payload = '{"name":"resurrected"}'
 where user_id = '00000000-0000-0000-0000-000000000001'
   and record_id = 'garmin-123';

insert into public.activities (user_id, record_id, payload)
values ('00000000-0000-0000-0000-000000000001', 'garmin-123', '{"name":"upsert resurrected"}')
on conflict (user_id, record_id)
do update set payload = excluded.payload;

insert into public.activities (user_id, record_id, payload)
values ('00000000-0000-0000-0000-000000000001', 'garmin-123', '{"name":"resurrected insert"}');

update public.garmin_activities
   set activity = '{"activityName":"resurrected"}'
 where user_id = '00000000-0000-0000-0000-000000000001'
   and garmin_activity_id = '123';

insert into public.garmin_activities (user_id, garmin_activity_id, activity)
values ('00000000-0000-0000-0000-000000000001', '123', '{"activityName":"upsert resurrected"}')
on conflict (user_id, garmin_activity_id)
do update set activity = excluded.activity;

insert into public.garmin_activities (user_id, garmin_activity_id, activity)
values ('00000000-0000-0000-0000-000000000001', '123', '{"activityName":"resurrected insert"}');

do $$
begin
    if (select payload->>'name' from public.activities
        where user_id = '00000000-0000-0000-0000-000000000001' and record_id = 'garmin-123')
       <> 'old local copy' then
        raise exception 'Deleted KAJO activity was modified or resurrected';
    end if;

    if (select activity->>'activityName' from public.garmin_activities
        where user_id = '00000000-0000-0000-0000-000000000001' and garmin_activity_id = '123')
       <> 'old Garmin copy' then
        raise exception 'Deleted Garmin activity was modified or resurrected';
    end if;

    if (select count(*) from public.activities
        where user_id = '00000000-0000-0000-0000-000000000002' and record_id = 'garmin-123') <> 1 then
        raise exception 'Tombstone incorrectly affected another user activity';
    end if;

    if (select count(*) from public.garmin_activities
        where user_id = '00000000-0000-0000-0000-000000000002' and garmin_activity_id = '123') <> 1 then
        raise exception 'Garmin tombstone incorrectly affected another user activity';
    end if;

    if has_table_privilege('authenticated', 'public.activity_deletions', 'UPDATE')
       or has_table_privilege('authenticated', 'public.activity_deletions', 'DELETE') then
        raise exception 'Authenticated users can mutate immutable activity tombstones';
    end if;

    if (select count(*) from public.kajo_sync_state
        where user_id = '00000000-0000-0000-0000-000000000001'
          and scope = 'activities' and version = 0) <> 1 then
        raise exception 'Activity tombstone did not emit the optional Realtime sync watermark';
    end if;
end;
$$;

\echo 'Activity deletion tombstone integration test passed'
