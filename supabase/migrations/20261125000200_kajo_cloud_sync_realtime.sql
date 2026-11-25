-- KAJO: publish lightweight per-account sync watermarks, never personal payloads.
-- Realtime clients receive only user_id/scope/version/updated_at. The user_data
-- JSON snapshot and activity payloads are deliberately NOT added to publication.

create table if not exists public.kajo_sync_state (
    user_id uuid not null references auth.users(id) on delete cascade,
    scope text not null check (scope in ('snapshot', 'activities')),
    version bigint not null default 0,
    updated_at timestamptz not null default now(),
    constraint kajo_sync_state_pk primary key (user_id, scope)
);

create index if not exists kajo_sync_state_updated_idx
    on public.kajo_sync_state (user_id, updated_at desc);

alter table public.kajo_sync_state enable row level security;

grant select on public.kajo_sync_state to authenticated;

drop policy if exists "Users can read their own KAJO sync state" on public.kajo_sync_state;
create policy "Users can read their own KAJO sync state"
    on public.kajo_sync_state
    for select
    to authenticated
    using (auth.uid() = user_id);

create or replace function public.touch_kajo_sync_state(
    p_user_id uuid,
    p_scope text,
    p_version bigint
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if p_user_id is null or p_scope not in ('snapshot', 'activities') then
        return;
    end if;

    insert into public.kajo_sync_state (user_id, scope, version, updated_at)
    values (p_user_id, p_scope, coalesce(p_version, 0), now())
    on conflict (user_id, scope)
    do update set
        version = case
            when p_scope = 'snapshot' then excluded.version
            else public.kajo_sync_state.version + 1
        end,
        updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.touch_kajo_sync_state(uuid, text, bigint) from public;
revoke all on function public.touch_kajo_sync_state(uuid, text, bigint) from anon, authenticated;

create or replace function public.on_kajo_user_data_sync_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    perform public.touch_kajo_sync_state(new.user_id, 'snapshot', new.version);
    return new;
end;
$function$;

create or replace function public.on_kajo_activity_sync_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_user_id uuid;
begin
    if tg_op = 'DELETE' then
        v_user_id := old.user_id;
        perform public.touch_kajo_sync_state(v_user_id, 'activities', 0);
        return old;
    end if;

    v_user_id := new.user_id;
    perform public.touch_kajo_sync_state(v_user_id, 'activities', 0);
    return new;
end;
$function$;

revoke all on function public.on_kajo_user_data_sync_change() from public;
revoke all on function public.on_kajo_user_data_sync_change() from anon, authenticated;
revoke all on function public.on_kajo_activity_sync_change() from public;
revoke all on function public.on_kajo_activity_sync_change() from anon, authenticated;

drop trigger if exists kajo_user_data_sync_state on public.user_data;
create trigger kajo_user_data_sync_state
after insert or update on public.user_data
for each row execute function public.on_kajo_user_data_sync_change();

drop trigger if exists kajo_activities_sync_state on public.activities;
create trigger kajo_activities_sync_state
after insert or update or delete on public.activities
for each row execute function public.on_kajo_activity_sync_change();

do $migration$
begin
    if not exists (
        select 1
          from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'kajo_sync_state'
    ) then
        alter publication supabase_realtime add table public.kajo_sync_state;
    end if;
end;
$migration$;
