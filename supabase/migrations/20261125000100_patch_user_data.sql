-- KAJO: version-checked partial updates for the user_data JSON snapshot.
-- This migration is additive. It does not rewrite existing user_data rows.
-- Frontend code must only call this RPC after this migration has been applied.

create or replace function public.patch_user_data(
    p_patch jsonb,
    p_expected_version integer
)
returns table(
    saved boolean,
    current_version bigint,
    current_updated_at timestamptz
)
language plpgsql
set search_path to ''
set statement_timeout to '30s'
as $function$
declare
    v_user_id uuid;
    v_version integer;
    v_updated_at timestamptz;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
        raise exception 'p_patch must be a JSON object' using errcode = '22023';
    end if;

    if p_patch = '{}'::jsonb then
        raise exception 'p_patch must contain at least one key' using errcode = '22023';
    end if;

    if p_expected_version is null or p_expected_version < 1 then
        raise exception 'p_expected_version must be one or greater' using errcode = '22023';
    end if;

    update public.user_data
       set data = coalesce(data, '{}'::jsonb) || p_patch,
           version = version + 1,
           updated_at = now()
     where user_id = v_user_id
       and version = p_expected_version
       and jsonb_typeof(data) = 'object'
    returning version, updated_at into v_version, v_updated_at;

    if found then
        return query select true, v_version::bigint, v_updated_at;
        return;
    end if;

    select ud.version, ud.updated_at
      into v_version, v_updated_at
      from public.user_data ud
     where ud.user_id = v_user_id;

    return query select false, coalesce(v_version, 0)::bigint, v_updated_at;
end;
$function$;

revoke all on function public.patch_user_data(jsonb, integer) from public;
revoke all on function public.patch_user_data(jsonb, integer) from anon;
grant execute on function public.patch_user_data(jsonb, integer) to authenticated;

comment on function public.patch_user_data(jsonb, integer) is
    'Atomically merges selected top-level KAJO user_data keys with optimistic version checking; omitted keys are preserved.';
