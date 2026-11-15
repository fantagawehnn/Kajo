-- Allow authenticated users to enrich only their own Garmin telemetry rows.
-- Required because the client uses INSERT ... ON CONFLICT DO UPDATE (upsert).

grant update on public.garmin_activity_telemetry to authenticated;

drop policy if exists "Users can update their own Garmin activity telemetry"
    on public.garmin_activity_telemetry;

create policy "Users can update their own Garmin activity telemetry"
    on public.garmin_activity_telemetry
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
