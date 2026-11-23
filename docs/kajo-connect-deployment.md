# KAJO Connect – Deployment and test checklist

## 1. Production deployment status

Last deployment: 2026-11-23  
Supabase project: `zgvargkfzgekokuisarv`

- [x] Database migration `20261123000000_kajo_connect_pairing_schema` applied.
- [x] Database migration `20261123000100_kajo_connect_device_limit` applied.
- [x] Database migration `20261123000200_kajo_connect_pairing_fk_indexes` applied (indexes for pairing-request foreign keys).
- [x] Edge Function `kajo-connect` deployed and reported ACTIVE (version 1).
- [x] Edge Function deployed with `verify_jwt = false`; authentication is checked per action in the handler.
- [x] User confirmed that both custom Edge Function secrets have been added.
- [x] Web UI wiring reviewed: device settings page, pairing-code claim button, device list, and revoke action are connected to the exported module functions.
- [ ] Runtime secret availability and a real pairing request have not yet been smoke-tested.
- [ ] End-to-end watch pairing and sync have not yet been tested on a physical Venu 3S.

The deployment is live, but this does not mean the end-to-end flow has been proven. Do not mark the remaining checks complete without the tests below.

## 2. Database migrations

Apply the migrations in timestamp order:

1. `20261123000000_kajo_connect_pairing_schema.sql`
   - Creates the device registry, pairing requests, and rate-limit tables.
   - Enables RLS and grants table access only to `service_role`.
   - Creates the atomic fixed-window rate-limit RPC.
2. `20261123000100_kajo_connect_device_limit.sql`
   - Creates the atomic device-registration RPC.
   - Enforces a maximum of five active devices per account.
3. `20261123000200_kajo_connect_pairing_fk_indexes.sql`
   - Adds indexes for the pairing-request user and device foreign keys.

All three migrations are already applied to the production project.

## 3. Edge Function secrets

The user configured these two custom secrets in the Supabase project:

- `KAJO_CONNECT_PAIRING_PEPPER`: a cryptographically random value of at least 32 characters.
- `KAJO_CONNECT_TOKEN_ENCRYPTION_KEY`: Base64 encoding of exactly 32 cryptographically random bytes.

The function also reads the standard Supabase runtime variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The standard runtime variables are expected from Supabase; their presence has not been independently verified by a successful live pairing request. The service-role key must remain server-side.

Never commit either custom secret, put it in frontend code, or send it in chat.

## 4. Edge Function configuration

The deployed function is named `kajo-connect`.

Keep `verify_jwt = false` for this function: it supports multiple credential types and validates them in the handler itself:
- logged-in KAJO user JWT for `claim-pairing`, `list-devices`, and `revoke-device`;
- device bearer token for `sync`;
- pairing code plus private poll secret for `poll-pairing`;
- IP-based rate limiting for `create-pairing`.

Do not remove the per-action authentication checks when changing the gateway JWT setting.

The current CORS allow-origin is `https://kajo.fantagawehn.workers.dev`. Recheck this value if the production frontend domain changes.

## 5. End-to-end smoke test

Use a dedicated test account first. Do not test with production user data until the flow passes.

1. [ ] The Venu 3S can request a pairing code.
2. [ ] An authenticated KAJO user can claim that code.
3. [ ] The watch can poll with its private poll secret and store the returned device token.
4. [ ] The watch can sync planned sessions, heart-rate zones, and display layouts.
5. [ ] The KAJO web app lists the paired watch.
6. [ ] Revoking the watch prevents subsequent sync requests.
7. [ ] A sixth active device is rejected for the same account.
8. [ ] A pending pairing is resumed after closing and reopening the pairing view or restarting the app.
9. [ ] If the app is reopened during an active FIT recording, the existing Garmin session is reused rather than discarded or replaced.
10. [ ] If FIT saving fails after stopping, the activity view blocks accidental exit and allows a save retry.

A successful deployment or compilation alone is not proof of these behaviors.

## 6. Current functional boundary

The current sync endpoint sends planned sessions, heart-rate zones, and watch display layouts from the KAJO user snapshot to the watch. The watch records activities locally as Garmin FIT activities.

Uploading recorded FIT activities from the watch back into KAJO is not implemented in this version and must not be described as available.

## 7. Watch build

The Venu 3S Monkey C build has been compiled successfully on the developer's Windows machine. The generated `.prg` is a local build artifact; it is not included in the repository and is not proof of an end-to-end pairing or device test.
