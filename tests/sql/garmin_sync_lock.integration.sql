-- Integration checks for the Garmin sync lock migration.
do $$
declare
  v_user uuid := '00000000-0000-0000-0000-000000000002';
  v_token_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_token_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_result boolean;
begin
  select public.try_acquire_garmin_sync_lock(v_user, v_token_a, 300) into v_result;
  if v_result is distinct from true then
    raise exception 'First lock acquisition should succeed';
  end if;

  select public.try_acquire_garmin_sync_lock(v_user, v_token_b, 300) into v_result;
  if v_result is distinct from false then
    raise exception 'A second active lock must not replace the first token';
  end if;

  select public.release_garmin_sync_lock(v_user, v_token_b) into v_result;
  if v_result is distinct from false then
    raise exception 'A different token must not release the active lock';
  end if;

  select public.release_garmin_sync_lock(v_user, v_token_a) into v_result;
  if v_result is distinct from true then
    raise exception 'The owning token should release the lock';
  end if;

  select public.try_acquire_garmin_sync_lock(v_user, v_token_b, 300) into v_result;
  if v_result is distinct from true then
    raise exception 'Lock should be acquirable after release';
  end if;

  select public.renew_garmin_sync_lock(v_user, v_token_a, 900) into v_result;
  if v_result is distinct from false then
    raise exception 'A different token must not renew the active lock';
  end if;
  select public.renew_garmin_sync_lock(v_user, v_token_b, 900) into v_result;
  if v_result is distinct from true then
    raise exception 'The owning token should renew the active lock';
  end if;

  update public.garmin_sync_locks
     set expires_at = now() - interval '1 second'
   where user_id = v_user;

  select public.renew_garmin_sync_lock(v_user, v_token_b, 900) into v_result;
  if v_result is distinct from false then
    raise exception 'An expired lock must not be renewed';
  end if;

  select public.try_acquire_garmin_sync_lock(v_user, v_token_a, 300) into v_result;
  if v_result is distinct from true then
    raise exception 'An expired lock should be replaceable';
  end if;

  begin
    perform public.try_acquire_garmin_sync_lock(v_user, v_token_b, 29);
    raise exception 'Lease shorter than 30 seconds should be rejected';
  exception when others then
    if sqlerrm not like 'Garmin sync lock lease must be between 30 and 900 seconds' then
      raise;
    end if;
  end;

  if not (select relrowsecurity from pg_class where oid = 'public.garmin_sync_locks'::regclass) then
    raise exception 'RLS must be enabled on the lock table';
  end if;
  if has_table_privilege('anon', 'public.garmin_sync_locks', 'SELECT')
     or has_table_privilege('authenticated', 'public.garmin_sync_locks', 'SELECT') then
    raise exception 'Client roles must not read the lock table directly';
  end if;
  if has_function_privilege('anon', 'public.try_acquire_garmin_sync_lock(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.try_acquire_garmin_sync_lock(uuid,uuid,integer)', 'EXECUTE') then
    raise exception 'Client roles must not execute lock RPCs';
  end if;
  if not has_function_privilege('service_role', 'public.try_acquire_garmin_sync_lock(uuid,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.renew_garmin_sync_lock(uuid,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.release_garmin_sync_lock(uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must be able to execute both lock RPCs';
  end if;
end;
$$;

select 'Garmin sync lock integration checks passed' as result;
