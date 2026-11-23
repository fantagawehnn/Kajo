-- Atomically enforce the maximum number of active KAJO Connect devices per user.
-- The per-user transaction advisory lock serializes concurrent registrations.
-- This migration is intentionally committed to the development branch only.

create or replace function public.kajo_connect_register_device(
  p_device_id uuid,
  p_user_id uuid,
  p_device_label text,
  p_token_hash text,
  p_max_devices integer default 5
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  active_count integer;
begin
  if p_device_id is null or p_user_id is null then
    raise exception 'Device ID and user ID are required';
  end if;

  if p_device_label is null
     or char_length(p_device_label) < 1
     or char_length(p_device_label) > 80 then
    raise exception 'Invalid device label';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid device token hash';
  end if;

  if p_max_devices < 1 or p_max_devices > 20 then
    raise exception 'Invalid maximum device count';
  end if;

  -- Serialize registrations for this user until the surrounding transaction ends.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*)::integer
    into active_count
    from public.kajo_connect_devices
   where user_id = p_user_id
     and revoked_at is null;

  if active_count >= p_max_devices then
    return false;
  end if;

  insert into public.kajo_connect_devices (
    id, user_id, device_label, token_hash
  ) values (
    p_device_id, p_user_id, p_device_label, p_token_hash
  );

  return true;
end;
$$;

revoke all on function public.kajo_connect_register_device(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.kajo_connect_register_device(uuid, uuid, text, text, integer)
  to service_role;
