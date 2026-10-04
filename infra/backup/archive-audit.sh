#!/bin/sh
# Audit log retention (NFR-25: at least 12 months in the database). Months older than
# AUDIT_RETENTION_MONTHS (default 24) leave the database whole: the month's partition is
# exported (CSV, gzip, AES-256 with BACKUP_PASSPHRASE) to s3://$BACKUP_BUCKET/audit/, the upload
# is checked, and only then the partition is detached and dropped. Rows are never deleted one
# by one, so the append-only rule holds. Safe to run every night: it acts only on old months.
set -eu

: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
: "${BACKUP_BUCKET:?}" "${BACKUP_PASSPHRASE:?}"
KEEP="${AUDIT_RETENTION_MONTHS:-24}"
[ "$KEEP" -ge 12 ] || { echo "[audit-archive] AUDIT_RETENTION_MONTHS must be at least 12 (NFR-25)"; exit 1; }
S3="aws s3 --endpoint-url ${S3_ENDPOINT:?}"

# Monthly partitions (audit_logs_YYYY_MM) that ended before the retention window.
old="$(psql -At -v ON_ERROR_STOP=1 -c "
  SELECT c.relname FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'audit.audit_logs'::regclass
    AND c.relname ~ '^audit_logs_[0-9]{4}_[0-9]{2}\$'
    AND to_date(substr(c.relname, 12), 'YYYY_MM')
        < date_trunc('month', now()) - make_interval(months => ${KEEP})
  ORDER BY 1")"

[ -n "$old" ] || { echo "[audit-archive] nothing older than ${KEEP} months"; exit 0; }

for part in $old; do
  key="audit/${part}.csv.gz.enc"
  tmp="/tmp/${part}.csv.gz.enc"
  rows="$(psql -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM audit.${part}")"
  psql -v ON_ERROR_STOP=1 -c "\\copy (SELECT * FROM audit.${part} ORDER BY created_at, id) TO STDOUT WITH (FORMAT csv, HEADER)" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$tmp"
  $S3 cp --only-show-errors "$tmp" "s3://${BACKUP_BUCKET}/${key}"
  # Only a copy that is really there (same size) allows dropping the month.
  local_size="$(wc -c < "$tmp" | tr -d ' ')"
  remote_size="$($S3 ls "s3://${BACKUP_BUCKET}/${key}" | awk '{print $3}')"
  rm -f "$tmp"
  if [ "$local_size" != "$remote_size" ]; then
    echo "[audit-archive] upload check failed for ${part}; partition kept"
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 -c "ALTER TABLE audit.audit_logs DETACH PARTITION audit.${part}" \
    -c "DROP TABLE audit.${part}"
  echo "[audit-archive] ${part}: ${rows} rows archived to ${key}, partition dropped"
done
