-- DRAFT ONLY — NOT APPLIED TO THE LIVE SUPABASE PROJECT.
-- These tables are accessed exclusively by the kajo-connect Edge Function
-- using the service-role key. Pairing code hashes are HMAC-SHA-256 with a server pepper.
-- No client-side Supabase access is required.

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

alter table public.kajo_connect_devices enable row level security;
alter table public.kajo_connect_pairing_requests enable row level security;

-- Intentionally no policies for anon/authenticated. Edge Functions use service_role.
revoke all on public.kajo_connect_devices from anon, authenticated;
revoke all on public.kajo_connect_pairing_requests from anon, authenticated;
grant all on public.kajo_connect_devices to service_role;
grant all on public.kajo_connect_pairing_requests to service_role;
