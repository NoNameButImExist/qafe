# syntax=docker/dockerfile:1.7
# Database migrations (dbmate) as an image, so a server runs them without the repo:
#   docker build -f infra/docker/migrate.Dockerfile .
#   docker run --rm -e DATABASE_URL=postgres://... ghcr.io/<owner>/qafe-migrate:<version>

FROM ghcr.io/amacneil/dbmate:2.36.0
COPY packages/db/migrations /db/migrations
ENV DBMATE_MIGRATIONS_DIR=/db/migrations \
    DBMATE_NO_DUMP_SCHEMA=true \
    DBMATE_WAIT=true \
    DBMATE_WAIT_TIMEOUT=60s
CMD ["up"]
