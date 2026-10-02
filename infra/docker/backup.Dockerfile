# syntax=docker/dockerfile:1.7
# Nightly database backups: pg_dump, encrypted with openssl, uploaded to S3 (MinIO locally).
#   docker build -f infra/docker/backup.Dockerfile .
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli openssl tzdata
COPY infra/backup/*.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/backup-loop.sh
ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]
