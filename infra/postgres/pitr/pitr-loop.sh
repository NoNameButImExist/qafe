#!/bin/sh
# The pitr service: sets up the pgBackRest stanza once, then backs up every day at PITR_AT
# (full on Sundays and whenever no full backup exists yet, differential otherwise). Together
# with the WAL that postgres archives continuously, the database can be restored to any moment
# covered by the kept backups. With an argument, runs that command once instead.
set -eu
pgbackrest-config.sh
if [ "$#" -gt 0 ]; then exec "$@"; fi

until pg_isready -h /var/run/postgresql -q; do sleep 2; done
pgbackrest --stanza=qafe stanza-create
pgbackrest --stanza=qafe check

has_full() { pgbackrest --stanza=qafe info --output=json | grep -q '"type":"full"'; }
backup() {
  type="$1"
  echo "[pitr] ${type} backup"
  pgbackrest --stanza=qafe --type="$type" backup && echo "[pitr] ${type} backup done" \
    || echo "[pitr] ${type} backup FAILED"
}

has_full || backup full

at="${PITR_AT:-03:00}"
echo "[pitr] daily backup at ${at} (${TZ:-UTC}); WAL is archived continuously"
while true; do
  now="$(date +%s)"
  next="$(date -D '%Y-%m-%d %H:%M' -d "$(date +%Y-%m-%d) ${at}" +%s)"
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  sleep $((next - now))
  if [ "$(date +%u)" = 7 ] || ! has_full; then backup full; else backup diff; fi
done
