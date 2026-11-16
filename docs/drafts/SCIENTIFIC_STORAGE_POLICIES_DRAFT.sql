-- KAJO Scientific Documents – Supabase Storage policy draft
-- STATUS: DESIGN ONLY. NOT A MIGRATION. DO NOT APPLY AS-IS.
--
-- Dedicated bucket: kajo-scientific-documents
-- Scope: private PDF uploads created through a server-side upload intent.
-- This draft does NOT touch the existing garmin-fit bucket.
--
-- IMPORTANT OPEN DECISION:
-- Set an explicit bucket-level file_size_limit (bytes) before creating/enabling
-- the bucket. Do not leave it unlimited in production. The limit must be
-- selected together with the Edge Function/parser memory and runtime limits.
--
-- SECURITY MODEL:
-- - authenticated users may INSERT exactly one pre-authorized object path
-- - no browser SELECT/LIST, UPDATE, or DELETE policy is defined here
-- - private downloads/deletion are mediated by a future ownership-checking
--   Edge Function (short-lived signed URLs for downloads)
-- - service_role is used only server-side and is not granted to browser users
--
-- PRECONDITIONS:
-- 1. The Phase 1 schema draft has been reviewed and applied through a proper
--    migration (scientific_sources and scientific_documents exist).
-- 2. scientific_documents has the owner SELECT policy described in that draft.
-- 3. The create-upload-intent Edge Function creates a pending private document
--    row and its exact storage_path before the browser uploads.
-- 4. The chosen maximum file size is configured at bucket level.
--
-- The bucket creation below is intentionally a template. Replace
-- <SET_FILE_SIZE_LIMIT_BYTES> with a reviewed positive integer before use.
-- Do not execute this file unchanged.

begin;

-- Template only; deliberately not executable until the size limit is chosen:
--
-- insert into storage.buckets (
--     id,
--     name,
--     public,
--     file_size_limit,
--     allowed_mime_types
-- )
-- values (
--     'kajo-scientific-documents',
--     'kajo-scientific-documents',
--     false,
--     <SET_FILE_SIZE_LIMIT_BYTES>,
--     array['application/pdf']::text[]
-- );

-- Before enabling the policies, create/verify the bucket separately and confirm:
--   public = false
--   allowed_mime_types includes application/pdf and no unneeded types
--   file_size_limit is the explicitly approved positive byte limit
--
-- Do not silently accept an existing bucket with a different configuration.

-- Upload permission is bound to an exact, server-created document path.
-- The document row must still be pending, private, and owned by auth.uid().
-- No folder-prefix-only authorization is used.
create policy "KAJO users upload only their pending private document intent"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'kajo-scientific-documents'
        and exists (
            select 1
            from public.scientific_documents d
            where d.storage_path = name
              and d.owner_id = (select auth.uid())
              and d.visibility = 'private'
              and d.processing_status = 'pending'
        )
    );

-- Intentionally no policies are created for:
--   SELECT: no direct browser download or object listing
--   UPDATE: no overwrite/replace through browser clients
--   DELETE: deletion is handled by a future server-side lifecycle action
--
-- Upload clients must use upsert=false. The INSERT-only policy also prevents
-- an authenticated browser client from replacing an existing object.
--
-- The Edge Function must independently verify actual object size, PDF
-- signature, MIME/parser consistency, ownership, bucket ID, and exact path.
-- Browser-supplied size and MIME metadata are never authoritative.

commit;

-- REVIEW CHECKLIST BEFORE CONVERTING THIS DRAFT INTO A MIGRATION:
-- [ ] Choose and document the positive bucket file_size_limit in bytes.
-- [ ] Confirm Storage upload behavior and the app's upload method (standard
--     upload vs TUS/resumable) against that limit.
-- [ ] Confirm the scientific_documents SELECT grant/RLS policy is in place;
--     Storage's EXISTS subquery relies on authenticated users being able to
--     see their own pending document row.
-- [ ] Confirm no pre-existing policy grants broader INSERT/SELECT/UPDATE/
--     DELETE access to this bucket.
-- [ ] Confirm policy name does not already exist; do not drop/replace policies
--     blindly as part of an initial migration.
-- [ ] Add server-side signed-download and deletion actions only after their
--     ownership checks and short URL lifetime are specified.
-- [ ] Review upload-intent expiry/cleanup so abandoned pending paths cannot
--     remain indefinitely usable.
-- [ ] Review migration history before applying any schema/storage change.
--
-- NOTHING IN THIS FILE HAS BEEN EXECUTED AGAINST THE LIVE DATABASE.
