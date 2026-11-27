#!/usr/bin/env bash
# Runs the database migration and access-rule checks on a throwaway local
# Postgres. Needs Postgres installed (initdb/pg_ctl on PATH or PG_BIN set).
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"
RUNAS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUNAS=(sudo -u postgres); fi
"${RUNAS[@]}" "$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p 55432 -c listen_addresses=''" -l "$DIR/log" start >/dev/null
trap '"${RUNAS[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
PSQL=(psql -h "$DIR" -p 55432 -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database phrf" postgres
"${PSQL[@]}" -d phrf -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d phrf -f "$f"; done
"${PSQL[@]}" -d phrf -f supabase/tests/access_rules.sql >/dev/null
