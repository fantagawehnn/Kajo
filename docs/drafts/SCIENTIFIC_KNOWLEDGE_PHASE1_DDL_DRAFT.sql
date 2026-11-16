-- KAJO Scientific Knowledge Base – Phase 1 DDL draft
-- STATUS: DESIGN ONLY. NOT A SUPABASE MIGRATION. DO NOT APPLY AS-IS.
-- Scope: relational source/document metadata only.
-- Deliberately excludes pgvector, embeddings, chunks, Storage buckets,
-- ingestion functions, and browser write policies.

begin;

create table public.scientific_sources (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid references auth.users(id) on delete cascade,
    visibility text not null check (visibility in ('shared', 'private')),
    review_status text not null default 'draft'
        check (review_status in ('draft', 'approved', 'rejected')),
    title text not null check (length(btrim(title)) > 0),
    authors jsonb not null default '[]'::jsonb
        check (jsonb_typeof(authors) = 'array'),
    publication_year integer check (
        publication_year is null or publication_year between 1500 and 2200
    ),
    journal text,
    doi text,
    source_url text,
    abstract text,
    language text,
    publication_type text check (
        publication_type is null or publication_type in (
            'research_article',
            'systematic_review',
            'meta_analysis',
            'position_statement',
            'methodological',
            'conference_paper',
            'other'
        )
    ),
    access_basis text not null default 'unknown'
        check (access_basis in (
            'open_access',
            'licensed',
            'author_provided',
            'link_only',
            'private_upload',
            'unknown'
        )),
    license_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scientific_sources_visibility_owner_check check (
        (visibility = 'shared' and owner_id is null)
        or
        (visibility = 'private' and owner_id is not null)
    ),
    constraint scientific_sources_private_review_check check (
        visibility <> 'private' or review_status = 'draft'
    )
);

create unique index scientific_sources_doi_unique_idx
    on public.scientific_sources (lower(doi))
    where doi is not null and length(btrim(doi)) > 0;

create index scientific_sources_visibility_status_year_idx
    on public.scientific_sources (visibility, review_status, publication_year desc);

create table public.scientific_documents (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references public.scientific_sources(id) on delete cascade,
    owner_id uuid references auth.users(id) on delete cascade,
    visibility text not null check (visibility in ('shared', 'private')),
    storage_path text,
    mime_type text not null,
    checksum_sha256 text check (
        checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
    ),
    file_size_bytes bigint check (
        file_size_bytes is null or file_size_bytes >= 0
    ),
    document_version integer not null default 1 check (document_version > 0),
    processing_status text not null default 'pending'
        check (processing_status in (
            'pending',
            'uploaded',
            'extracted',
            'failed',
            'rejected'
        )),
    extraction_version text,
    processing_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scientific_documents_visibility_owner_check check (
        (visibility = 'shared' and owner_id is null)
        or
        (visibility = 'private' and owner_id is not null)
    )
);

create index scientific_documents_source_idx
    on public.scientific_documents (source_id, created_at desc);

create unique index scientific_documents_storage_path_unique_idx
    on public.scientific_documents (storage_path)
    where storage_path is not null;

create index scientific_documents_owner_idx
    on public.scientific_documents (owner_id, created_at desc)
    where owner_id is not null;

alter table public.scientific_sources enable row level security;
alter table public.scientific_documents enable row level security;

-- Browser clients can read only approved shared source metadata or their
-- own private source metadata. No browser INSERT/UPDATE/DELETE policies.
revoke all on public.scientific_sources from anon, authenticated;
grant select on public.scientific_sources to authenticated;
grant all on public.scientific_sources to service_role;

create policy "Authenticated users read approved shared or own private sources"
    on public.scientific_sources
    for select
    to authenticated
    using (
        (visibility = 'shared' and review_status = 'approved')
        or
        (visibility = 'private' and owner_id = (select auth.uid()))
    );

-- A document is readable only if its own visibility/owner matches the
-- corresponding source's visibility/owner and the source is readable.
revoke all on public.scientific_documents from anon, authenticated;
grant select on public.scientific_documents to authenticated;
grant all on public.scientific_documents to service_role;

create policy "Authenticated users read documents of readable sources"
    on public.scientific_documents
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.scientific_sources s
            where s.id = scientific_documents.source_id
              and (
                  (
                      scientific_documents.visibility = 'shared'
                      and scientific_documents.owner_id is null
                      and s.visibility = 'shared'
                      and s.review_status = 'approved'
                  )
                  or
                  (
                      scientific_documents.visibility = 'private'
                      and scientific_documents.owner_id = (select auth.uid())
                      and s.visibility = 'private'
                      and s.owner_id = (select auth.uid())
                  )
              )
        )
    );

comment on table public.scientific_sources is
    'Bibliographic metadata for KAJO scientific sources; separate from personal athlete data.';
comment on table public.scientific_documents is
    'Document metadata only; actual files require a separately reviewed private Storage bucket and policies.';

commit;

-- Before turning this draft into a migration:
-- 1. Reconcile the current remote migration history.
-- 2. Confirm the service_role/default-privilege model in this Supabase project.
-- 3. Review RLS and grants against the actual ingestion/admin process.
-- 4. Confirm copyright/licensing and private-upload handling.
-- 5. Create the migration with the Supabase CLI, review it, and obtain approval.
