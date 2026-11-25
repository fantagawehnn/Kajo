-- Supports the incremental activity delta and lightweight latest-watermark queries.
-- The index is additive and does not modify existing activity rows.

create index if not exists activities_user_updated_at_record_id_idx
    on public.activities (user_id, updated_at, record_id);
