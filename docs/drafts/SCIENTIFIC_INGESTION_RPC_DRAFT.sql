-- KAJO Scientific Ingestion – atomic RPC design draft
-- STATUS: DESIGN ONLY. NOT A MIGRATION. DO NOT APPLY AS-IS.
--
-- Purpose:
--   Provide short, authenticated server-to-database operations for the
--   browser-extracted private PDF chunks. The Edge Function validates the
--   caller's JWT and document ownership before invoking these RPCs with its
--   server-side service_role client.
--
-- Security:
--   - SECURITY INVOKER; no SECURITY DEFINER escalation.
--   - Empty search_path; all objects are schema-qualified.
--   - EXECUTE is revoked from PUBLIC/anon/authenticated and granted only
--     to service_role.
--   - These RPCs do not approve or publish shared sources.
--   - The RPCs do not independently authenticate an end user; the Edge
--     Function MUST validate JWT + owner_id + visibility before each call.
--
-- Reconcile the actual remote migration history and review grants before
-- turning this draft into a migration.

begin;

-- 1. Processing checkpoints required for idempotent extraction completion.
alter table public.scientific_documents
    add column if not exists extraction_page_count integer
        check (extraction_page_count is null or extraction_page_count > 0),
    add column if not exists expected_chunk_count integer
        check (expected_chunk_count is null or expected_chunk_count > 0),
    add column if not exists extracted_character_count bigint
        check (extracted_character_count is null or extracted_character_count >= 0),
    add column if not exists extraction_completed_at timestamptz,
    add column if not exists upload_confirmed_at timestamptz;

-- 2. Claim extraction. A repeated call is accepted only if it repeats the
--    exact same extraction version and expected totals.
create or replace function public.kajo_begin_scientific_extraction(
    p_document_id uuid,
    p_extraction_version text,
    p_page_count integer,
    p_expected_chunk_count integer,
    p_extracted_character_count bigint
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_document public.scientific_documents%rowtype;
begin
    if p_document_id is null
       or p_extraction_version is null
       or length(btrim(p_extraction_version)) = 0
       or length(p_extraction_version) > 100
       or p_page_count is null or p_page_count <= 0
       or p_expected_chunk_count is null or p_expected_chunk_count <= 0
       or p_extracted_character_count is null
       or p_extracted_character_count <= 0 then
        raise exception 'invalid extraction metadata' using errcode = '22023';
    end if;

    select d.*
      into v_document
      from public.scientific_documents d
     where d.id = p_document_id
       and d.visibility = 'private'
     for update;

    if not found then
        raise exception 'document not found' using errcode = 'P0002';
    end if;

    if v_document.processing_status = 'extracting'
       and v_document.extraction_version = p_extraction_version
       and v_document.extraction_page_count = p_page_count
       and v_document.expected_chunk_count = p_expected_chunk_count
       and v_document.extracted_character_count = p_extracted_character_count then
        return 'extracting';
    end if;

    if v_document.processing_status <> 'uploaded' then
        raise exception 'document is not ready for extraction' using errcode = '55000';
    end if;

    update public.scientific_documents
       set processing_status = 'extracting',
           extraction_version = p_extraction_version,
           extraction_page_count = p_page_count,
           expected_chunk_count = p_expected_chunk_count,
           extracted_character_count = p_extracted_character_count,
           extraction_completed_at = null,
           processing_error = null,
           updated_at = now()
     where id = p_document_id;

    return 'extracting';
end;
$function$;

-- 3. Persist one small chunk batch atomically. Duplicate retries are accepted
--    only when the existing row has byte-for-byte identical content/metadata.
create or replace function public.kajo_submit_scientific_chunk_batch(
    p_document_id uuid,
    p_extraction_version text,
    p_chunks jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_document public.scientific_documents%rowtype;
    v_input_count integer;
    v_distinct_count integer;
    v_inserted_count integer;
    v_mismatch_count integer;
begin
    if p_document_id is null
       or p_extraction_version is null
       or jsonb_typeof(p_chunks) <> 'array'
       or jsonb_array_length(p_chunks) < 1
       or jsonb_array_length(p_chunks) > 50 then
        raise exception 'invalid chunk batch' using errcode = '22023';
    end if;

    select d.*
      into v_document
      from public.scientific_documents d
     where d.id = p_document_id
       and d.visibility = 'private'
     for update;

    if not found
       or v_document.processing_status <> 'extracting'
       or v_document.extraction_version <> p_extraction_version
       or v_document.expected_chunk_count is null
       or v_document.extraction_page_count is null then
        raise exception 'document is not accepting chunks' using errcode = '55000';
    end if;

    select count(*), count(distinct x.chunk_index)
      into v_input_count, v_distinct_count
      from jsonb_to_recordset(p_chunks) as x(
          chunk_index integer,
          page_start integer,
          page_end integer,
          section_heading text,
          language text,
          content_text text
      );

    if v_input_count <> v_distinct_count then
        raise exception 'duplicate chunk indexes in batch' using errcode = '22023';
    end if;

    if exists (
        select 1
          from jsonb_to_recordset(p_chunks) as x(
              chunk_index integer,
              page_start integer,
              page_end integer,
              section_heading text,
              language text,
              content_text text
          )
         where x.chunk_index is null
            or x.chunk_index < 0
            or x.chunk_index >= v_document.expected_chunk_count
            or x.page_start is null
            or x.page_start <= 0
            or x.page_end is null
            or x.page_end < x.page_start
            or x.page_end > v_document.extraction_page_count
            or x.content_text is null
            or length(btrim(x.content_text)) = 0
            or length(x.content_text) > 12000
            or (x.section_heading is not null and length(x.section_heading) > 500)
            or (x.language is not null and length(x.language) > 20)
    ) then
        raise exception 'chunk fields exceed accepted limits' using errcode = '22023';
    end if;

    insert into public.scientific_document_chunks (
        document_id,
        chunk_index,
        page_start,
        page_end,
        section_heading,
        language,
        content_text,
        extraction_version
    )
    select
        p_document_id,
        x.chunk_index,
        x.page_start,
        x.page_end,
        x.section_heading,
        x.language,
        x.content_text,
        p_extraction_version
    from jsonb_to_recordset(p_chunks) as x(
        chunk_index integer,
        page_start integer,
        page_end integer,
        section_heading text,
        language text,
        content_text text
    )
    on conflict (document_id, extraction_version, chunk_index) do nothing;

    get diagnostics v_inserted_count = row_count;

    -- An idempotent retry must match every persisted field. Conflicting
    -- content under an already-used index is rejected, never overwritten.
    select count(*)
      into v_mismatch_count
      from jsonb_to_recordset(p_chunks) as x(
          chunk_index integer,
          page_start integer,
          page_end integer,
          section_heading text,
          language text,
          content_text text
      )
      left join public.scientific_document_chunks c
        on c.document_id = p_document_id
       and c.extraction_version = p_extraction_version
       and c.chunk_index = x.chunk_index
     where c.id is null
        or c.page_start is distinct from x.page_start
        or c.page_end is distinct from x.page_end
        or c.section_heading is distinct from x.section_heading
        or c.language is distinct from x.language
        or c.content_text is distinct from x.content_text;

    if v_mismatch_count > 0 then
        raise exception 'chunk retry conflicts with persisted content' using errcode = '23505';
    end if;

    return v_inserted_count;
end;
$function$;

-- 4. Finalize only when every index from 0 to expected_chunk_count - 1 exists.
--    This single transaction makes private_ready visible only after the full
--    set has been persisted. No intermediate/partial chunks are retrievable.
create or replace function public.kajo_complete_scientific_extraction(
    p_document_id uuid,
    p_extraction_version text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_document public.scientific_documents%rowtype;
    v_chunk_count integer;
    v_min_index integer;
    v_max_index integer;
begin
    if p_document_id is null or p_extraction_version is null then
        raise exception 'invalid completion request' using errcode = '22023';
    end if;

    select d.*
      into v_document
      from public.scientific_documents d
     where d.id = p_document_id
       and d.visibility = 'private'
     for update;

    if not found then
        raise exception 'document not found' using errcode = 'P0002';
    end if;

    if v_document.processing_status = 'private_ready'
       and v_document.extraction_version = p_extraction_version then
        return 'private_ready';
    end if;

    if v_document.processing_status <> 'extracting'
       or v_document.extraction_version <> p_extraction_version
       or v_document.expected_chunk_count is null then
        raise exception 'document is not ready to complete' using errcode = '55000';
    end if;

    select count(*), min(c.chunk_index), max(c.chunk_index)
      into v_chunk_count, v_min_index, v_max_index
      from public.scientific_document_chunks c
     where c.document_id = p_document_id
       and c.extraction_version = p_extraction_version;

    if v_chunk_count <> v_document.expected_chunk_count
       or v_min_index <> 0
       or v_max_index <> v_document.expected_chunk_count - 1 then
        raise exception 'chunk set is incomplete' using errcode = '55000';
    end if;

    update public.scientific_documents
       set processing_status = 'private_ready',
           extraction_completed_at = now(),
           updated_at = now()
     where id = p_document_id;

    return 'private_ready';
end;
$function$;

revoke all on function public.kajo_begin_scientific_extraction(uuid, text, integer, integer, bigint)
    from public, anon, authenticated;
revoke all on function public.kajo_submit_scientific_chunk_batch(uuid, text, jsonb)
    from public, anon, authenticated;
revoke all on function public.kajo_complete_scientific_extraction(uuid, text)
    from public, anon, authenticated;

grant execute on function public.kajo_begin_scientific_extraction(uuid, text, integer, integer, bigint)
    to service_role;
grant execute on function public.kajo_submit_scientific_chunk_batch(uuid, text, jsonb)
    to service_role;
grant execute on function public.kajo_complete_scientific_extraction(uuid, text)
    to service_role;

comment on function public.kajo_begin_scientific_extraction(uuid, text, integer, integer, bigint) is
    'Claims a private uploaded document for a specific browser extraction version.';
comment on function public.kajo_submit_scientific_chunk_batch(uuid, text, jsonb) is
    'Atomically stores an idempotent batch of private PDF text chunks.';
comment on function public.kajo_complete_scientific_extraction(uuid, text) is
    'Makes a private document retrieval-visible only after its complete contiguous chunk set exists.';

commit;

-- Review before migration:
-- - Ensure service_role is the only role with EXECUTE after default privileges.
-- - Confirm the deployed Edge Function validates JWT, owner_id and private
--   visibility before every RPC call; RPCs intentionally trust that boundary.
-- - Add per-user rate/size limits at the Edge Function boundary.
-- - Decide how to mark zero-text/scanned PDFs as manual_review_required.
-- - Decide retry cleanup/version replacement; this draft intentionally blocks
--   a different extraction version while a document is already extracting.
-- - Validate this draft against the reconciled remote schema and migration
--   history. No SQL in this file has been executed.
