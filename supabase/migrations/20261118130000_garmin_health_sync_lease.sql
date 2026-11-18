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
