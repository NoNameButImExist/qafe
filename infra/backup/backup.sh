#!/bin/sh
# One backup: pg_dump (custom format) → AES-256 encryption → s3://$BACKUP_BUCKET/daily/.
# On Sundays the same file is also kept under weekly/. Old copies are pruned:
# BACKUP_KEEP_DAILY (default 7) and BACKUP_KEEP_WEEKLY (default 4).
set -eu

: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
: "${BACKUP_BUCKET:?}" "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE: without it a backup cannot be read}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
S3="aws s3 --endpoint-url ${S3_ENDPOINT:?}"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
name="qafe-${stamp}.dump.enc"
tmp="/tmp/${name}"

echo "[backup] dumping ${PGDATABASE}"
pg_dump --format=custom --compress=9 --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$tmp"
size="$(wc -c < "$tmp")"
[ "$size" -gt 1000 ] || { echo "[backup] dump is suspiciously small (${size} bytes)"; exit 1; }

$S3 cp --only-show-errors "$tmp" "s3://${BACKUP_BUCKET}/daily/${name}"
if [ "$(date -u +%u)" = 7 ]; then
  $S3 cp --only-show-errors "$tmp" "s3://${BACKUP_BUCKET}/weekly/${name}"
fi
rm -f "$tmp"
echo "[backup] uploaded ${name} (${size} bytes)"

prune() {
  folder="$1"; keep="$2"
  $S3 ls "s3://${BACKUP_BUCKET}/${folder}/" | awk '{print $4}' | grep '^qafe-' | sort -r \
    | tail -n +"$((keep + 1))" | while read -r old; do
      $S3 rm --only-show-errors "s3://${BACKUP_BUCKET}/${folder}/${old}"
      echo "[backup] pruned ${folder}/${old}"
    done
}
prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"
