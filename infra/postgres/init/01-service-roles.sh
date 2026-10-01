#!/bin/sh
# Runs once, when the Postgres data volume is first initialised.
# Creates one login role per API module (svc_<module>) with its password from the environment.
# Schemas, grants and RLS come from the migrations (packages/db/migrations), not from here.
set -eu

for module in core catalog ordering billing audit reporting; do
  var="SVC_$(echo "$module" | tr '[:lower:]' '[:upper:]')_PASSWORD"
  eval "password=\${$var:?$var is not set}"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v role="svc_$module" -v password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SQL
done
