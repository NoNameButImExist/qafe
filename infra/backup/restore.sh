#!/bin/sh
# Restores a backup into a database.
#   restore.sh                      newest daily backup into $RESTORE_DATABASE (default qafe_restore)
#   restore.sh daily/qafe-....enc   that file
# The target database is dropped and created again. Restoring over the live database is
# refused unless RESTORE_INTO_LIVE=yes (stop api and worker first).
set -eu

: "${BACKUP_BUCKET:?}" "${BACKUP_PASSPHRASE:?}"
S3="aws s3 --endpoint-url ${S3_ENDPOINT:?}"
target="${RESTORE_DATABASE:-qafe_restore}"
if [ "$target" = "${PGDATABASE}" ] && [ "${RESTORE_INTO_LIVE:-no}" != yes ]; then
  echo "[restore] refusing to overwrite the live database ${target} (set RESTORE_INTO_LIVE=yes)"
  exit 1
fi

key="${1:-}"
if [ -z "$key" ]; then
  latest="$($S3 ls "s3://${BACKUP_BUCKET}/daily/" | awk '{print $4}' | grep '^qafe-' | sort | tail -n 1)"
  [ -n "$latest" ] || { echo "[restore] no backups found"; exit 1; }
  key="daily/${latest}"
fi

echo "[restore] ${key} → ${target}"
$S3 cp --only-show-errors "s3://${BACKUP_BUCKET}/${key}" /tmp/restore.enc
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in /tmp/restore.enc -out /tmp/restore.dump
rm -f /tmp/restore.enc
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS \"${target}\" WITH (FORCE)" -c "CREATE DATABASE \"${target}\""
pg_restore --no-owner --exit-on-error -d "$target" /tmp/restore.dump
rm -f /tmp/restore.dump

# A quick look that it is a real database: venues, users and orders are there.
psql -d "$target" -At -c "SELECT 'venues=' || count(*) FROM core.venues" \
  -c "SELECT 'users=' || count(*) FROM core.users" \
  -c "SELECT 'orders=' || count(*) FROM ordering.orders"
echo "[restore] done"
