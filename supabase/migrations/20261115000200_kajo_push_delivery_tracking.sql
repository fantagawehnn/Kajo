-- Track one successful reminder delivery per schedule and local calendar day.
alter table public.kajo_notification_schedules
  add column if not exists last_sent_local_date date;
