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
    payload jsonb not null default '{}'::jsonb
);

create table public.garmin_activities (
    user_id uuid not null,
    garmin_activity_id text not null,
    activity jsonb not null default '{}'::jsonb
);

\echo 'Applying activity deletion tombstone migration'
