-- KAJO: enable account-scoped Realtime notifications for cross-device sync.
-- Existing tables already have RLS policies and primary-key replica identity.
-- This migration only adds the two tables to Supabase's Realtime publication.

do $migration$
begin
    if not exists (
        select 1
          from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'user_data'
    ) then
        alter publication supabase_realtime add table public.user_data;
    end if;

    if not exists (
        select 1
          from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'activities'
    ) then
        alter publication supabase_realtime add table public.activities;
    end if;
end;
$migration$;

comment on table public.user_data is
    'KAJO versioned account snapshot; included in supabase_realtime for authenticated cross-device change notifications.';
