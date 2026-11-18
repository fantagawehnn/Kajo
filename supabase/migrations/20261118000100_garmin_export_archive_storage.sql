-- Preserve complete Garmin exports per authenticated account.
-- The original archive is retained byte-for-byte; the manifest is an index only.
create table if not exists public.garmin_export_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_file_name text not null,
  storage_path text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  content_type text not null default 'application/zip',
  sha256 text,
  status text not null default 'uploaded' check (status in ('uploading','uploaded','indexed','failed')),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  created_at timestamptz not null default now(),
  indexed_at timestamptz,
  unique (user_id, storage_path)
);
create index if not exists garmin_export_imports_user_created_idx
  on public.garmin_export_imports(user_id, created_at desc);
alter table public.garmin_export_imports enable row level security;
create policy "Users can read their Garmin export imports"
  on public.garmin_export_imports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their Garmin export imports"
  on public.garmin_export_imports for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their Garmin export imports"
  on public.garmin_export_imports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garmin-exports', 'garmin-exports', false, 536870912, array['application/zip','application/x-zip-compressed','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 536870912,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload their own Garmin export archives"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'garmin-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can read their own Garmin export archives"
  on storage.objects for select to authenticated
  using (bucket_id = 'garmin-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
