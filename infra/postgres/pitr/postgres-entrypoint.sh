#!/bin/sh
# Postgres with continuous WAL archiving to pgBackRest (point-in-time recovery, NFR-24).
set -eu
pgbackrest-config.sh
chown -R postgres:postgres /etc/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest /var/run/postgresql
exec docker-entrypoint.sh "$@"
