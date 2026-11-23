-- KAJO Connect pairing, device registry, and rate-limit schema.
-- This migration is the deployable version of docs/kajo-connect-pairing-schema-draft.sql.
-- It is intentionally committed to the development branch only.

create table if not exists public.kajo_connect_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null default 'KAJO Connect'
    check (char_length(device_label) between 1 and 80),
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists kajo_connect_devices_user_idx
  on public.kajo_connect_devices(user_id);

create index if not exists kajo_connect_devices_active_user_idx
  on public.kajo_connect_devices(user_id)
  where revoked_at is null;

create table if not exists public.kajo_connect_pairing_requests (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique
    check (code_hash ~ '^[a-f0-9]{64}$'),
  poll_secret_hash text not null
    check (poll_secret_hash ~ '^[a-f0-9]{64}$'),
  device_label text not null default 'KAJO Connect'
    check (char_length(device_label) between 1 and 80),
  user_id uuid references auth.users(id) on delete cascade,
  device_id uuid references public.kajo_connect_devices(id) on delete cascade,
  token_ciphertext text,
  token_iv text,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  token_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint kajo_connect_pairing_token_pair check (
    (token_ciphertext is null and token_iv is null)
    or (token_ciphertext is not null and token_iv is not null)
  ),
  constraint kajo_connect_pairing_claim_state check (
    (claimed_at is null and user_id is null and device_id is null
      and token_ciphertext is null and token_iv is null)
    or (claimed_at is not null and user_id is not null and device_id is not null
      and token_ciphertext is not null and token_iv is not null)
  )
);

create index if not exists kajo_connect_pairing_expiry_idx
  on public.kajo_connect_pairing_requests(expires_at);

create table if not exists public.kajo_connect_rate_limits (
  bucket_key text primary key
    check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);

create index if not exists kajo_connect_rate_limits_updated_idx
  on public.kajo_connect_rate_limits(updated_at);

alter table public.kajo_connect_devices enable row level security;
alter table public.kajo_connect_pairing_requests enable row level security;
alter table public.kajo_connect_rate_limits enable row level security;

-- The Edge Function accesses these tables only with its service-role client.
revoke all on public.kajo_connect_devices from public, anon, authenticated;
revoke all on public.kajo_connect_pairing_requests from public, anon, authenticated;
revoke all on public.kajo_connect_rate_limits from public, anon, authenticated;

grant all on public.kajo_connect_devices to service_role;
grant all on public.kajo_connect_pairing_requests to service_role;
grant all on public.kajo_connect_rate_limits to service_role;

-- Atomic fixed-window rate limiter. SECURITY INVOKER is intentional:
-- only service_role receives EXECUTE and the underlying table privileges.
create or replace function public.kajo_connect_consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
begin
  if p_bucket_key is null
     or p_bucket_key !~ '^[a-f0-9]{64}$'
     or p_limit is null
     or p_limit < 1
     or p_window_seconds is null
     or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.kajo_connect_rate_limits as existing
    (bucket_key, window_started_at, request_count, updated_at)
  values
    (p_bucket_key, now(), 1, now())
  on conflict (bucket_key) do update set
    window_started_at = case
      when existing.window_started_at + make_interval(secs => p_window_seconds) <= now()
        then now()
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at + make_interval(secs => p_window_seconds) <= now()
        then 1
      else existing.request_count + 1
    end,
    updated_at = now()
  returning request_count <= p_limit into allowed;

  return allowed;
end;
$$;

revoke all on function public.kajo_connect_consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.kajo_connect_consume_rate_limit(text, integer, integer)
  to service_role;
