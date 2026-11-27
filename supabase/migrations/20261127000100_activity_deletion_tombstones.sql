-- Immutable, account-scoped tombstones for activities deleted from KAJO.
-- A tombstone is created only for a past activity by the application.
-- Keeping the marker separate from the activity payload prevents any later
-- cloud or Garmin upsert from silently resurrecting the deleted activity.

create table if not exists public.activity_deletions (
    user_id uuid not null references auth.users(id) on delete cascade,
    record_id text not null,
    garmin_activity_id text,
    activity_date date not null,
    deleted_at timestamptz not null default now(),
    constraint activity_deletions_pk primary key (user_id, record_id),
    constraint activity_deletions_record_id_check
        check (length(record_id) between 1 and 160),
    constraint activity_deletions_garmin_id_check
        check (garmin_activity_id is null or length(garmin_activity_id) between 1 and 80)
);

create index if not exists activity_deletions_user_garmin_date_idx
    on public.activity_deletions (user_id, garmin_activity_id, activity_date)
    where garmin_activity_id is not null;

create index if not exists activity_deletions_user_deleted_at_idx
    on public.activity_deletions (user_id, deleted_at desc);

alter table public.activity_deletions enable row level security;

-- Override broad default table grants: tombstones are append-only.
revoke all on table public.activity_deletions from public, anon, authenticated, service_role;
grant select, insert on public.activity_deletions to authenticated;
grant select, insert on public.activity_deletions to service_role;

drop policy if exists "Users can read their own activity deletions" on public.activity_deletions;
create policy "Users can read their own activity deletions"
    on public.activity_deletions
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own activity deletions" on public.activity_deletions;
create policy "Users can create their own activity deletions"
    on public.activity_deletions
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

-- Tombstones are immutable: there are deliberately no UPDATE or DELETE grants
-- or policies. A deleted activity cannot be restored by a stale client upload.

create or replace function public.prevent_deleted_activity_resurrection()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if tg_table_name = 'activities' then
        if exists (
            select 1
              from public.activity_deletions d
             where d.user_id = new.user_id
               and d.record_id = new.record_id
        ) then
            return null;
        end if;
    elsif tg_table_name = 'garmin_activities' then
        if exists (
            select 1
              from public.activity_deletions d
             where d.user_id = new.user_id
               and d.garmin_activity_id = new.garmin_activity_id
        ) then
            return null;
        end if;
    end if;

    return new;
end;
$function$;

revoke all on function public.prevent_deleted_activity_resurrection() from public;
revoke all on function public.prevent_deleted_activity_resurrection() from anon, authenticated;

drop trigger if exists prevent_deleted_kajo_activity_resurrection on public.activities;
create trigger prevent_deleted_kajo_activity_resurrection
before insert or update on public.activities
for each row execute function public.prevent_deleted_activity_resurrection();

drop trigger if exists prevent_deleted_garmin_activity_resurrection on public.garmin_activities;
create trigger prevent_deleted_garmin_activity_resurrection
before insert or update on public.garmin_activities
for each row execute function public.prevent_deleted_activity_resurrection();

-- If the lightweight Realtime sync watermark migration is present, publish
-- the deletion immediately to other signed-in devices. Older databases without
-- that optional table/function still accept and enforce tombstones safely.
create or replace function public.on_kajo_activity_deletion_sync_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if pg_catalog.to_regprocedure('public.touch_kajo_sync_state(uuid,text,bigint)') is not null then
        execute 'select public.touch_kajo_sync_state($1, $2, $3)'
            using new.user_id, 'activities', 0;
    end if;
    return new;
end;
$function$;

revoke all on function public.on_kajo_activity_deletion_sync_change() from public;
revoke all on function public.on_kajo_activity_deletion_sync_change() from anon, authenticated;

drop trigger if exists kajo_activity_deletions_sync_state on public.activity_deletions;
create trigger kajo_activity_deletions_sync_state
after insert on public.activity_deletions
for each row execute function public.on_kajo_activity_deletion_sync_change();

comment on table public.activity_deletions is
    'Immutable per-user tombstones. Past activities marked here are hidden from KAJO cloud sync and excluded from future Garmin imports.';
