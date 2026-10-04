#!/bin/sh
# Restores the database as it was at a moment (default: 2 minutes ago) into a scratch directory
# inside this container, starts it on port 5499, prints row counts and the time of the newest
# order, and removes it again. The live database is not touched.
#   pitr-restore-test.sh ["2026-10-03 14:05:00+02"]
set -eu
export PGUSER="${POSTGRES_USER:-qafe_admin}"
target="${1:-$(date -u -d @$(( $(date +%s) - 120 )) '+%Y-%m-%d %H:%M:%S+00')}"
dir=/tmp/pitr-restore
rm -rf "$dir"; mkdir -p "$dir"; chmod 700 "$dir"

echo "[pitr-test] restoring to ${target}"
pgbackrest --stanza=qafe --pg1-path="$dir" --type=time --target="$target" \
  --target-action=promote --archive-mode=off restore

# The copy must never archive into the live repository.
cat >> "$dir/postgresql.auto.conf" <<CONF
archive_mode = off
port = 5499
listen_addresses = ''
unix_socket_directories = '/tmp'
CONF
pg_ctl -D "$dir" -l /tmp/pitr-restore.log -w -t 300 start >/dev/null
tries=0
until [ "$(psql -h /tmp -p 5499 -d "${POSTGRES_DB:-qafe}" -Atc 'select pg_is_in_recovery()' 2>/dev/null)" = "f" ]; do
  tries=$((tries + 1))
  if [ "$tries" -gt 300 ]; then
    echo "[pitr-test] recovery did not finish in 5 minutes; see /tmp/pitr-restore.log"
    pg_ctl -D "$dir" -m immediate stop >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 1
done
trap 'pg_ctl -D "$dir" -m fast stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
psql -h /tmp -p 5499 -d "${POSTGRES_DB:-qafe}" -At -F ' ' -c "
  select 'venues', count(*)::text from core.venues
  union all select 'users', count(*)::text from core.users
  union all select 'orders', count(*)::text from ordering.orders
  union all select 'newest_order', coalesce(max(created_at)::text, '-') from ordering.orders
  union all select 'audit_entries', count(*)::text from audit.audit_logs
  union all select 'probe', slug from core.venues where slug like 'pitr-%'"
echo "[pitr-test] done"
