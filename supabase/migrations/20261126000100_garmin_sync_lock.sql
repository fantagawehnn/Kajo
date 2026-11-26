-- Prevent concurrent Garmin sync actions for the same account.
-- A short lease makes abandoned locks self-healing after an Edge Function crash.
create table if not exists public.garmin_sync_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lock_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.garmin_sync_locks enable row level security;

revoke all on table public.garmin_sync_locks from anon, authenticated;
grant all on table public.garmin_sync_locks to service_role;

create or replace function public.try_acquire_garmin_sync_lock(
  p_user_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Garmin sync lock lease must be between 30 and 900 seconds';
  end if;

  insert into public.garmin_sync_locks (user_id, lock_token, expires_at)
  values (p_user_id, p_lock_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (user_id) do update
    set lock_token = excluded.lock_token,
        expires_at = excluded.expires_at,
        created_at = now()
    where public.garmin_sync_locks.expires_at <= now();

  return found;
end;
$$;

create or replace function public.renew_garmin_sync_lock(
  p_user_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Garmin sync lock lease must be between 30 and 900 seconds';
  end if;

  update public.garmin_sync_locks
     set expires_at = now() + make_interval(secs => p_lease_seconds)
   where user_id = p_user_id
     and lock_token = p_lock_token
     and expires_at > now();

  return found;
end;
$function$;

create or replace function public.release_garmin_sync_lock(
  p_user_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.garmin_sync_locks
  where user_id = p_user_id
    and lock_token = p_lock_token;

  return found;
end;
$$;

revoke all on function public.try_acquire_garmin_sync_lock(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.renew_garmin_sync_lock(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_garmin_sync_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_acquire_garmin_sync_lock(uuid, uuid, integer) to service_role;
grant execute on function public.renew_garmin_sync_lock(uuid, uuid, integer) to service_role;
grant execute on function public.release_garmin_sync_lock(uuid, uuid) to service_role;
