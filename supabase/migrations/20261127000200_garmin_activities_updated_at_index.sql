-- Supports incremental Garmin activity preview reads by account and update time.
-- Kept separate from the general KAJO activity delta index because these
-- records live in public.garmin_activities.

create index if not exists garmin_activities_user_updated_at_id_idx
    on public.garmin_activities (user_id, updated_at, garmin_activity_id);
