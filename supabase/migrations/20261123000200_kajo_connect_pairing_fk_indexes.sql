-- Cover foreign keys used for cascading cleanup of pairing requests.
-- These indexes avoid full scans when a user or registered device is deleted.

create index if not exists kajo_connect_pairing_user_idx
  on public.kajo_connect_pairing_requests(user_id);

create index if not exists kajo_connect_pairing_device_idx
  on public.kajo_connect_pairing_requests(device_id);
