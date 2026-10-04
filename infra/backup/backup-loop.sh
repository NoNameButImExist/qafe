#!/bin/sh
# Runs backup.sh every day at BACKUP_AT (HH:MM, TZ from the environment; default 02:30),
# then archive-audit.sh (moves audit log months past the retention window to S3).
# With an argument, runs that script once instead: backup-loop.sh backup.sh | restore.sh [key]
set -eu
if [ "$#" -gt 0 ]; then exec "$@"; fi

at="${BACKUP_AT:-02:30}"
echo "[backup] scheduled daily at ${at} (${TZ:-UTC})"
while true; do
  now="$(date +%s)"
  next="$(date -d "$(date +%Y-%m-%d) ${at}" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%Y-%m-%d) ${at}" +%s)"
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  sleep $((next - now))
  backup.sh || echo "[backup] FAILED; next try tomorrow"
  archive-audit.sh || echo "[audit-archive] FAILED; next try tomorrow"
done
