-- Tracks successful Garmin activity-list coverage per calendar day.
-- Zero-activity days are stored explicitly to avoid repeatedly querying Garmin.
create table if not exists public.garmin_activity_sync_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_date date not null,
  activity_count integer not null default 0 check (activity_count >= 0),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, sync_date)
);

alter table public.garmin_activity_sync_days enable row level security;

comment on table public.garmin_activity_sync_days is
  'Per-user Garmin activity-list coverage. Written only by trusted Edge Functions; zero-activity days are recorded explicitly.';
