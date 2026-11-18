-- Audit trail for Garmin synchronization attempts.
-- Rows are written by the trusted garmin-personal Edge Function only.
create table if not exists public.garmin_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('manual_range', 'daily_sync', 'manual_activities', 'background')),
  sync_type text not null check (sync_type in ('activity_list', 'health_history', 'health_day')),
  status text not null check (status in ('running', 'complete', 'partial', 'in_progress', 'error', 'skipped')),
  start_date date,
  end_date date,
  timezone_basis text not null check (timezone_basis in ('client_offset', 'client_local_date', 'utc')),
  timezone_offset_minutes integer check (
    timezone_offset_minutes is null or timezone_offset_minutes between -840 and 840
  ),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  scanned_days integer check (scanned_days is null or scanned_days >= 0),
  skipped_days integer check (skipped_days is null or skipped_days >= 0),
  fetched_count integer check (fetched_count is null or fetched_count >= 0),
  stored_count integer check (stored_count is null or stored_count >= 0),
  processed_days integer check (processed_days is null or processed_days >= 0),
  remaining_days integer check (remaining_days is null or remaining_days >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint garmin_sync_events_date_range_check
    check (start_date is null or end_date is null or start_date <= end_date),
  constraint garmin_sync_events_finish_check
    check (finished_at is null or finished_at >= started_at)
);

create index if not exists garmin_sync_events_user_started_idx
  on public.garmin_sync_events (user_id, started_at desc);

create index if not exists garmin_sync_events_user_type_started_idx
  on public.garmin_sync_events (user_id, sync_type, started_at desc);

alter table public.garmin_sync_events enable row level security;

-- The browser must not read or write this audit log directly.
-- Only the service-role Edge Function may access it.
revoke all on table public.garmin_sync_events from anon, authenticated;
grant select, insert, update on table public.garmin_sync_events to service_role;

comment on table public.garmin_sync_events is
  'Per-user Garmin synchronization attempt log. Written by the trusted Edge Function; contains no Garmin payloads or credentials.';
