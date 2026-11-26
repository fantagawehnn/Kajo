#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the CI PostgreSQL service}"

user_id="00000000-0000-0000-0000-000000000001"
token_a="11111111-1111-1111-1111-111111111111"
token_b="22222222-2222-2222-2222-222222222222"
result_a="$(mktemp)"
result_b="$(mktemp)"
trap 'rm -f "$result_a" "$result_b"' EXIT

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 \
  -c "select public.try_acquire_garmin_sync_lock('$user_id', '$token_a', 300)" >"$result_a" &
pid_a=$!
psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 \
  -c "select public.try_acquire_garmin_sync_lock('$user_id', '$token_b', 300)" >"$result_b" &
pid_b=$!

wait "$pid_a"
wait "$pid_b"

a="$(tr -d '[:space:]' < "$result_a")"
b="$(tr -d '[:space:]' < "$result_b")"
if [[ "$a" == "t" && "$b" == "f" ]]; then
  winner="$token_a"
elif [[ "$a" == "f" && "$b" == "t" ]]; then
  winner="$token_b"
else
  printf 'Expected exactly one successful concurrent acquisition; got A=%s B=%s\n' "$a" "$b" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 \
  -c "select public.release_garmin_sync_lock('$user_id', '$winner')" | grep -qx 't'
printf 'Concurrent Garmin sync lock acquisition check passed\n'
