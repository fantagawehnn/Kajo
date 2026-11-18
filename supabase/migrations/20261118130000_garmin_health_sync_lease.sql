-- Expiring ownership lease for the shared Garmin health-history cursor.
-- The Edge Function claims one row atomically and only its token may advance it.
alter table public.garmin_sync_state
  add column if not exists lock_token uuid,
  add column if not exists lock_expires_at timestamptz;

create index if not exists garmin_sync_state_lock_expiry_idx
  on public.garmin_sync_state (lock_expires_at)
  where lock_token is not null;

comment on column public.garmin_sync_state.lock_token is
  'Ephemeral owner token for one health-history sync invocation; null when no invocation owns the cursor.';

comment on column public.garmin_sync_state.lock_expires_at is
  'Lease expiry for the current health-history sync owner; expired leases may be reclaimed after interrupted invocations.';
