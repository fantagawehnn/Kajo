-- KAJO: persist all structured Garmin export files and normalized VO2max history.
-- Original ZIP archives remain untouched in the private garmin-exports bucket.
create unique index if not exists garmin_export_imports_user_id_id_uidx
    on public.garmin_export_imports(user_id, id);

create table if not exists public.garmin_export_data_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    import_id uuid not null references public.garmin_export_imports(id) on delete cascade,
    source_path text not null,
    category text not null default 'other',
    file_extension text,
    file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
    record_count integer,
    date_from date,
    date_to date,
    is_json boolean not null default false,
    payload jsonb,
    storage_path text,
    parse_error text,
    retained_in_original_archive boolean not null default true,
    created_at timestamptz not null default now(),
    constraint garmin_export_data_files_source_unique unique (user_id, import_id, source_path),
    constraint garmin_export_data_files_user_import_fk
        foreign key (user_id, import_id)
        references public.garmin_export_imports(user_id, id)
        on delete cascade,
    constraint garmin_export_data_files_storage_shape check (
        (payload is not null and storage_path is null and retained_in_original_archive = false)
        or (payload is null and storage_path is not null and retained_in_original_archive = false)
        or (payload is null and storage_path is null and retained_in_original_archive = true)
    )
);
create index if not exists garmin_export_data_files_user_category_idx
    on public.garmin_export_data_files(user_id, category, import_id);
alter table public.garmin_export_data_files enable row level security;
grant select, insert on public.garmin_export_data_files to authenticated;
create policy "Users can read their own Garmin export data files"
    on public.garmin_export_data_files for select to authenticated
    using ((select auth.uid()) = user_id);
create policy "Users can insert their own Garmin export data files"
    on public.garmin_export_data_files for insert to authenticated
    with check ((select auth.uid()) = user_id);

create table if not exists public.garmin_export_performance_records (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    import_id uuid not null references public.garmin_export_imports(id) on delete cascade,
    record_key text not null,
    record_date date not null,
    value numeric not null check (value > 0),
    unit text not null default 'ml/kg/min',
    sport_label text,
    sub_sport_label text,
    source text not null,
    source_update_timestamp text,
    source_file text not null,
    created_at timestamptz not null default now(),
    constraint garmin_export_performance_records_unique unique (user_id, import_id, record_key),
    constraint garmin_export_performance_records_user_import_fk
        foreign key (user_id, import_id)
        references public.garmin_export_imports(user_id, id)
        on delete cascade
);
create index if not exists garmin_export_performance_records_user_date_idx
    on public.garmin_export_performance_records(user_id, record_date);
alter table public.garmin_export_performance_records enable row level security;
grant select, insert on public.garmin_export_performance_records to authenticated;
create policy "Users can read their own Garmin export performance records"
    on public.garmin_export_performance_records for select to authenticated
    using ((select auth.uid()) = user_id);
create policy "Users can insert their own Garmin export performance records"
    on public.garmin_export_performance_records for insert to authenticated
    with check ((select auth.uid()) = user_id);

-- Large JSON files are stored as private objects under the importing user's folder.
create policy "Users can replace their own extracted Garmin export files"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'garmin-exports'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'garmin-exports'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
