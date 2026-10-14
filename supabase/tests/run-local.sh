#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres (with Supabase stubs)
# and runs every *.test.sql. Nothing touches the real Supabase project.
#   bash supabase/tests/run-local.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
bin=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
dir=$(mktemp -d)

# initdb refuses to run as root; use the postgres OS user in that case.
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$dir"

cleanup() { as_pg "$bin/pg_ctl" -D "$dir/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT

as_pg "$bin/initdb" -D "$dir/data" -U postgres -A trust >/dev/null
as_pg "$bin/pg_ctl" -D "$dir/data" -o "-k $dir -c listen_addresses=''" -l "$dir/log" -w start >/dev/null

psql_run() { psql -X -q -v ON_ERROR_STOP=1 -h "$dir" -U postgres -d postgres "$@"; }

psql_run -f "$here/supabase-stubs.sql"
for f in "$root"/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  psql_run -o /dev/null -f "$f"
done
for f in "$here"/*.test.sql; do
  psql_run -o /dev/null -f "$f"
done
