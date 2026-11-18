-- Serialize daily Garmin health imports for the same user and calendar day.
-- The historical cursor lease remains independent; this lease protects shared
-- garmin_health_records rows from concurrent daily refresh and backfill writes.
create table if not exists public.garmin_health_day_sync_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  lock_token uuid,
  lock_expires_at timestamptz,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, record_date),
  constraint garmin_health_day_sync_lease_pair_check
    check ((lock_token is null and lock_expires_at is null) or
           (lock_token is not null and lock_expires_at is not null))
);

create index if not exists garmin_health_day_sync_lease_expiry_idx
  on public.garmin_health_day_sync_leases (lock_expires_at)
  where lock_token is not null;

alter table public.garmin_health_day_sync_leases enable row level security;
revoke all on table public.garmin_health_day_sync_leases from anon, authenticated;
grant select, insert, update, delete on table public.garmin_health_day_sync_leases to service_role;

comment on table public.garmin_health_day_sync_leases is
  'Per-user, per-day expiring lease shared by daily Garmin health refresh and historical backfill; contains no health payloads or credentials.';
