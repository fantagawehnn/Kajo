-- KAJO – cleanup RPC draft for expired private scientific upload intents
-- STATUS: DESIGN ONLY. NOT A MIGRATION. DO NOT APPLY AS-IS.
--
-- Dependencies:
--   - scientific_documents.upload_intent_expires_at
--   - private scientific_sources / scientific_documents schema
--   - scientific_document_chunks(document_id)
--   - service_role-only invocation from a trusted Edge Function
--
-- This draft deliberately does not delete Storage objects. The Edge Function
-- must first claim rows, remove each exact returned object path from the
-- dedicated private bucket, then call the finalization RPC.
--
-- Fixed policy values in this draft:
--   - 7-day grace period after the 24-hour upload intent expiry
--   - 15-minute claim lease
--   - maximum 25 documents per claim batch
--
-- These are provisional operating values and require approval before use.

begin;

-- 1. Claim state. A claim token prevents a stale worker from finalizing a
--    document after another worker has reclaimed an expired lease.
alter table public.scientific_documents
    add column if not exists upload_cleanup_claimed_at timestamptz,
    add column if not exists upload_cleanup_claim_token uuid;

alter table public.scientific_documents
    add constraint scientific_documents_cleanup_claim_pair_check
    check (
        (upload_cleanup_claimed_at is null and upload_cleanup_claim_token is null)
        or
        (upload_cleanup_claimed_at is not null and upload_cleanup_claim_token is not null)
    );

create index if not exists scientific_documents_expired_upload_cleanup_idx
    on public.scientific_documents (upload_intent_expires_at, upload_cleanup_claimed_at)
    where visibility = 'private'
      and processing_status = 'pending'
      and upload_confirmed_at is null;

-- 2. Atomically claim a small batch of expired, never-confirmed private
--    intents. SKIP LOCKED prevents concurrent workers claiming the same row.
create or replace function public.kajo_claim_expired_scientific_uploads(
    p_limit integer default 10
)
returns table (
    document_id uuid,
    source_id uuid,
    storage_path text,
    claim_token uuid,
    lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
    if p_limit is null or p_limit < 1 or p_limit > 25 then
        raise exception 'invalid cleanup batch size' using errcode = '22023';
    end if;

    return query
    with candidates as (
        select d.id
          from public.scientific_documents d
          join public.scientific_sources s
            on s.id = d.source_id
           and s.owner_id = d.owner_id
           and s.visibility = 'private'
         where d.visibility = 'private'
           and d.processing_status = 'pending'
           and d.upload_confirmed_at is null
           and d.storage_path = d.owner_id::text || '/' || d.id::text || '/original.pdf'
           and d.upload_intent_expires_at < now() - interval '7 days'
           and (
               d.upload_cleanup_claimed_at is null
               or d.upload_cleanup_claimed_at < now() - interval '15 minutes'
           )
           and not exists (
               select 1
                 from public.scientific_document_chunks c
                where c.document_id = d.id
           )
         order by d.upload_intent_expires_at, d.id
         for update of d skip locked
         limit p_limit
    ),
    claimed as (
        update public.scientific_documents d
           set upload_cleanup_claimed_at = now(),
               upload_cleanup_claim_token = pg_catalog.gen_random_uuid(),
               updated_at = now()
          from candidates c
         where d.id = c.id
        returning d.id, d.source_id, d.storage_path,
                  d.upload_cleanup_claim_token, d.upload_cleanup_claimed_at
    )
    select c.id,
           c.source_id,
           c.storage_path,
           c.upload_cleanup_claim_token,
           c.upload_cleanup_claimed_at + interval '15 minutes'
      from claimed c;
end;
$function$;

-- 3. Finalize metadata deletion only after the Edge Function has successfully
--    removed the Storage object (or confirmed it was already absent).
--    The claim token and unexpired lease prevent stale workers finalizing.
create or replace function public.kajo_finalize_expired_scientific_upload(
    p_document_id uuid,
    p_claim_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_source_id uuid;
    v_owner_id uuid;
begin
    if p_document_id is null or p_claim_token is null then
        raise exception 'invalid cleanup finalization request' using errcode = '22023';
    end if;

    select d.source_id, d.owner_id
      into v_source_id, v_owner_id
      from public.scientific_documents d
      join public.scientific_sources s
        on s.id = d.source_id
       and s.owner_id = d.owner_id
       and s.visibility = 'private'
     where d.id = p_document_id
       and d.visibility = 'private'
       and d.processing_status = 'pending'
       and d.upload_confirmed_at is null
       and d.storage_path = d.owner_id::text || '/' || d.id::text || '/original.pdf'
       and d.upload_intent_expires_at < now() - interval '7 days'
       and d.upload_cleanup_claim_token = p_claim_token
       and d.upload_cleanup_claimed_at > now() - interval '15 minutes'
       and not exists (
           select 1
             from public.scientific_document_chunks c
            where c.document_id = d.id
       )
     for update of d;

    if not found then
        return false;
    end if;

    -- Lock the parent before checking whether it is safe to remove. This
    -- prevents a concurrent metadata writer from changing its lifecycle.
    perform 1
      from public.scientific_sources s
     where s.id = v_source_id
       and s.owner_id = v_owner_id
       and s.visibility = 'private'
     for update;

    if not found then
        return false;
    end if;

    delete from public.scientific_documents d
     where d.id = p_document_id
       and d.upload_cleanup_claim_token = p_claim_token
       and d.processing_status = 'pending'
       and d.upload_confirmed_at is null;

    if not found then
        return false;
    end if;

    -- A source may be shared by multiple documents in future versions.
    -- Delete it only when no document references it and it remains private
    -- and owned by the same user.
    delete from public.scientific_sources s
     where s.id = v_source_id
       and s.owner_id = v_owner_id
       and s.visibility = 'private'
       and not exists (
           select 1
             from public.scientific_documents d
            where d.source_id = s.id
       );

    return true;
end;
$function$;

revoke all on function public.kajo_claim_expired_scientific_uploads(integer)
    from public, anon, authenticated;
revoke all on function public.kajo_finalize_expired_scientific_upload(uuid, uuid)
    from public, anon, authenticated;

grant execute on function public.kajo_claim_expired_scientific_uploads(integer)
    to service_role;
grant execute on function public.kajo_finalize_expired_scientific_upload(uuid, uuid)
    to service_role;

comment on function public.kajo_claim_expired_scientific_uploads(integer) is
    'Claims only expired, never-confirmed private pending scientific upload intents for server-side cleanup.';
comment on function public.kajo_finalize_expired_scientific_upload(uuid, uuid) is
    'Deletes claimed expired private upload metadata after successful server-side Storage deletion.';

commit;

-- REQUIRED COMPANION CHANGES BEFORE ACTIVATION:
-- 1. The Storage INSERT policy must require
--      d.upload_cleanup_claim_token is null
--    so no new object insert can be authorized after a cleanup claim.
-- 2. confirm-upload must require upload_cleanup_claim_token is null in both
--    its precondition and conditional UPDATE. If the claim wins the row race,
--    confirmation must fail closed; if confirmation wins, the claim predicate
--    no longer matches because the status is uploaded.
-- 3. The Edge Function must use only the returned storage_path and the fixed
--    bucket ID. Treat Storage "object not found" as idempotent success; all
--    other delete errors must stop finalization.
-- 4. The Edge Function must call finalization with the returned claim token.
--    A false result means the lease/token/state no longer matches; do not
--    attempt an alternate metadata deletion.
-- 5. Consider the lease duration against the deployed function's actual
--    maximum runtime. A reclaimed lease may cause duplicate Storage deletes;
--    this is acceptable only because deletion is idempotent.
-- 6. Review default privileges, table grants, schema state, and migration
--    history before converting this draft into a migration.
--
-- No SQL in this file has been executed.
