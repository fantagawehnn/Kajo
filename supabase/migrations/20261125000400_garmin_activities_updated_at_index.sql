-- Supports the incremental Garmin activity preview loader.
-- Kept separate from the general KAJO activity delta index because the
-- Garmin preview records live in public.garmin_activities.

create index if not exists garmin_activities_user_updated_at_id_idx
    on public.garmin_activities (user_id, updated_at, garmin_activity_id);
