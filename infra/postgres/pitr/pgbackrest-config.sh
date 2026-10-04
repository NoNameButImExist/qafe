#!/bin/sh
# Writes /etc/pgbackrest/pgbackrest.conf from PITR_* variables. Used by the postgres container
# (archive-push of every WAL segment) and by the pitr service (backups, checks, restores), so
# both see the same repository.
#
#   PITR_REPO_TYPE      posix (a volume, default; local) or s3 (production, needs HTTPS)
#   PITR_PASSPHRASE     repository encryption (AES-256); required
#   PITR_RETENTION_FULL full backups kept (default 2 = about two weeks with weekly fulls)
#   PITR_S3_BUCKET, PITR_S3_ENDPOINT, PITR_S3_REGION, PITR_S3_KEY, PITR_S3_SECRET  (s3 only)
set -eu
: "${PITR_PASSPHRASE:?Set PITR_PASSPHRASE: without it the PITR repository cannot be read}"
mkdir -p /etc/pgbackrest
conf=/etc/pgbackrest/pgbackrest.conf
{
  echo "[global]"
  echo "repo1-type=${PITR_REPO_TYPE:-posix}"
  echo "repo1-path=${PITR_REPO_PATH:-/var/lib/pgbackrest}"
  echo "repo1-cipher-type=aes-256-cbc"
  echo "repo1-cipher-pass=${PITR_PASSPHRASE}"
  echo "repo1-retention-full=${PITR_RETENTION_FULL:-2}"
  if [ "${PITR_REPO_TYPE:-posix}" = "s3" ]; then
    echo "repo1-s3-bucket=${PITR_S3_BUCKET:?}"
    echo "repo1-s3-endpoint=${PITR_S3_ENDPOINT:?}"
    echo "repo1-s3-region=${PITR_S3_REGION:-us-east-1}"
    echo "repo1-s3-key=${PITR_S3_KEY:?}"
    echo "repo1-s3-key-secret=${PITR_S3_SECRET:?}"
    echo "repo1-s3-uri-style=${PITR_S3_URI_STYLE:-path}"
  fi
  echo "compress-type=zst"
  echo "process-max=2"
  echo "log-level-console=info"
  echo "log-level-file=off"
  # WAL leaves through a local queue; if the repository is unreachable for long, old WAL is
  # dropped (and the next backup starts a new chain) instead of filling the database disk.
  echo "archive-async=y"
  echo "spool-path=/var/spool/pgbackrest"
  echo "archive-push-queue-max=${PITR_QUEUE_MAX:-4GiB}"
  echo ""
  # Postgres runs archive-push for every WAL segment: keep its log to warnings.
  echo "[global:archive-push]"
  echo "log-level-console=warn"
  echo ""
  echo "[qafe]"
  echo "pg1-path=/var/lib/postgresql/data"
  echo "pg1-socket-path=/var/run/postgresql"
  echo "pg1-user=${POSTGRES_USER:-${PGUSER:-qafe_admin}}"
} > "$conf"
chmod 600 "$conf"
