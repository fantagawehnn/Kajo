# KAJO Connect – Deployment checklist

Status: preparation only. The steps below have not been applied to the production Supabase project.

## 1. Database migrations

Apply the migrations in timestamp order:

1. \`20261123000000_kajo_connect_pairing_schema.sql\`
   - Creates the device registry, pairing requests, and rate-limit tables.
   - Enables RLS and grants table access only to \`service_role\`.
   - Creates the atomic fixed-window rate-limit RPC.
2. \`20261123000100_kajo_connect_device_limit.sql\`
   - Creates the atomic device-registration RPC.
   - Enforces a maximum of five active devices per account.

Do not apply only the second migration: it depends on the tables created by the first migration.

## 2. Edge Function secrets

Configure these two custom secrets for the \`kajo-connect\` Edge Function:

- \`KAJO_CONNECT_PAIRING_PEPPER\`: a cryptographically random value of at least 32 characters.
- \`KAJO_CONNECT_TOKEN_ENCRYPTION_KEY\`: Base64 encoding of exactly 32 cryptographically random bytes.

Generate each value independently on a trusted local machine. Do not commit either value, put it in frontend code, or send it in chat.

The function also reads the standard Supabase runtime variables \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`, and \`SUPABASE_SERVICE_ROLE_KEY\`. Confirm that these are available to the deployed Edge Function. The service-role key must remain server-side.

## 3. Edge Function deployment

Deploy \`supabase/functions/kajo-connect/index.ts\` as the function named \`kajo-connect\`.

Keep \`verify_jwt = false\` for this function: it supports multiple credential types and validates them in the handler itself:
- logged-in KAJO user JWT for \`claim-pairing\`, \`list-devices\`, and \`revoke-device\`;
- device bearer token for \`sync\`;
- pairing code plus private poll secret for \`poll-pairing\`;
- IP-based rate limiting for \`create-pairing\`.

Do not remove the per-action authentication checks when changing the gateway JWT setting.

## 4. End-to-end smoke test

After the migrations, secrets, and function are deployed, verify in this order:

1. The watch can request a pairing code.
2. An authenticated KAJO user can claim that code.
3. The watch can poll with its private poll secret and store the returned device token.
4. The watch can sync planned sessions, heart-rate zones, and display layouts.
5. The KAJO web app lists the paired watch.
6. Revoking the watch prevents subsequent sync requests.
7. A sixth active device is rejected for the same account.

Use a test account first. Do not test with production user data until the flow passes.

## 5. Current functional boundary

The current sync endpoint sends planned sessions, heart-rate zones, and watch display layouts from the KAJO user snapshot to the watch. The watch records activities locally as Garmin FIT activities.

Uploading recorded FIT activities from the watch back into KAJO is not implemented in this version and must not be described as available.

## 6. Watch build

The Venu 3S Monkey C build has been compiled successfully on the developer's Windows machine. The generated \`.prg\` is a local build artifact; it is not included in the repository and is not proof of an end-to-end pairing or device test.
