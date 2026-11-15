-- KAJO: separate, account-scoped storage for raw Garmin activity telemetry.
-- Apply this migration in the Supabase SQL Editor before deploying frontend code
-- that reads/writes public.garmin_activity_telemetry.
--
-- Existing user_data rows and local telemetry are deliberately NOT modified here.
-- The data transfer is a separate, verified application migration.

create table if not exists public.garmin_activity_telemetry (
    user_id uuid not null references auth.users(id) on delete cascade,
    garmin_activity_id text not null,
    telemetry jsonb not null,
    created_at timestamptz not null default now(),
    constraint garmin_activity_telemetry_pk
        primary key (user_id, garmin_activity_id),
    constraint garmin_activity_telemetry_activity_id_check
        check (length(garmin_activity_id) between 1 and 80),
    constraint garmin_activity_telemetry_object_check
        check (jsonb_typeof(telemetry) = 'object')
);

comment on table public.garmin_activity_telemetry is
    'KAJO raw Garmin activity telemetry, stored separately from the versioned user_data snapshot.';
comment on column public.garmin_activity_telemetry.telemetry is
    'Complete garminTelemetry JSON object for one Garmin activity, including FIT and Activity Details time series.';

create index if not exists garmin_activity_telemetry_user_created_idx
    on public.garmin_activity_telemetry (user_id, created_at);

alter table public.garmin_activity_telemetry enable row level security;

grant select, insert on public.garmin_activity_telemetry to authenticated;

do $policy$
begin
    if not exists (
        select 1
          from pg_policies
         where schemaname = 'public'
           and tablename = 'garmin_activity_telemetry'
           and policyname = 'Users can read their own Garmin activity telemetry'
    ) then
        create policy "Users can read their own Garmin activity telemetry"
            on public.garmin_activity_telemetry
            for select
            to authenticated
            using (auth.uid() = user_id);
    end if;

    if not exists (
        select 1
          from pg_policies
         where schemaname = 'public'
           and tablename = 'garmin_activity_telemetry'
           and policyname = 'Users can insert their own Garmin activity telemetry'
    ) then
        create policy "Users can insert their own Garmin activity telemetry"
            on public.garmin_activity_telemetry
            for insert
            to authenticated
            with check (auth.uid() = user_id);
    end if;
end
$policy$;

-- Intentionally no UPDATE or DELETE policy:
-- telemetry is write-once per user/activity. Existing cloud records are not
-- overwritten by a retry or by a later full-snapshot save.
