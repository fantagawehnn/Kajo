-- Expiring ownership leases for per-user Garmin sync state rows.
-- sync_type separates health_history and activity_list; only the current token may mutate a leased operation.
alter table public.garmin_sync_state
  add column if not exists lock_token uuid,
  add column if not exists lock_expires_at timestamptz;

create index if not exists garmin_sync_state_lock_expiry_idx
  on public.garmin_sync_state (lock_expires_at)
  where lock_token is not null;

comment on column public.garmin_sync_state.lock_token is
  'Ephemeral owner token for one Garmin sync invocation (health_history or activity_list); null when no invocation owns the state row.';

comment on column public.garmin_sync_state.lock_expires_at is
  'Lease expiry for the current Garmin sync owner; expired leases may be reclaimed after interrupted invocations.';


-- Separate lease table for activity-list imports. This avoids coupling the
-- activity-list lock to the health-history cursor or its existing constraints.
create table if not exists public.garmin_activity_sync_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lock_token uuid,
  lock_expires_at timestamptz,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint garmin_activity_sync_lease_pair_check
    check ((lock_token is null and lock_expires_at is null) or
           (lock_token is not null and lock_expires_at is not null))
);

create index if not exists garmin_activity_sync_lease_expiry_idx
  on public.garmin_activity_sync_leases (lock_expires_at)
  where lock_token is not null;

alter table public.garmin_activity_sync_leases enable row level security;
revoke all on table public.garmin_activity_sync_leases from anon, authenticated;
grant select, insert, update, delete on table public.garmin_activity_sync_leases to service_role;

comment on table public.garmin_activity_sync_leases is
  'Per-user expiring lease for Garmin activity-list imports; no activity data or credentials are stored.';
