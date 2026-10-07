# syntax=docker/dockerfile:1.7
# Postgres 16 with pgBackRest: continuous WAL archiving and backups for point-in-time recovery
# (NFR-24). The same image runs the database and the pitr service.
#   docker build -f infra/docker/postgres.Dockerfile .
FROM postgres:18-alpine
RUN apk add --no-cache pgbackrest tzdata \
  && mkdir -p /etc/pgbackrest /var/lib/pgbackrest /var/spool/pgbackrest \
  && chown -R postgres:postgres /etc/pgbackrest /var/lib/pgbackrest /var/spool/pgbackrest
COPY infra/postgres/pitr/*.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/pgbackrest-config.sh /usr/local/bin/postgres-entrypoint.sh \
  /usr/local/bin/pitr-loop.sh /usr/local/bin/pitr-restore-test.sh
ENTRYPOINT ["/usr/local/bin/postgres-entrypoint.sh"]
CMD ["postgres"]
