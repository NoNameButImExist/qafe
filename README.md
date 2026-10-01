# qafe.ba

Multi-tenant platform for ordering via a QR code on the table in cafés.

Requirements: [docs/requirements.md](docs/requirements.md) · DB schema: [docs/db/qafe_schema_v2.sql](docs/db/qafe_schema_v2.sql)

## Run locally

Needs Node 24 (`fnm use` / `nvm use` reads `.nvmrc`), `corepack enable pnpm` once, and Docker.

1. `pnpm install`
2. `cp .env.example .env`, then fill in the passwords (any values for local work) and set
   `SEED_ADMIN_PASSWORD`; for the admin app behind the Vite proxy set `AUTH_COOKIE_PATH=/api/auth`
3. `pnpm keys:generate` (JWT signing keys in `secrets/`, git-ignored)
4. `pnpm docker:infra && pnpm db:migrate && pnpm db:seed` (Postgres and MinIO in Docker)
5. `pnpm dev`

| App           | URL                                | Sign in                                                            |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Admin         | http://localhost:5176              | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`                         |
| Panel (venue) | http://localhost:5175              | venue `demo-kafic`, user `sef` or `konobar`, `SEED_STAFF_PASSWORD` |
| API           | http://localhost:3000/health/ready |                                                                    |
| MinIO console | http://localhost:9001              | `S3_ACCESS_KEY` / `S3_SECRET_KEY`                                  |

## Common commands

| Command                                             | What it does                                         |
| --------------------------------------------------- | ---------------------------------------------------- |
| `pnpm check`                                        | lint, typecheck, unit tests and build                |
| `pnpm test:integration`                             | tests against real Postgres (Docker, Testcontainers) |
| `pnpm turbo run test --affected`                    | only packages changed vs `main`                      |
| `pnpm db:migrate` / `db:rollback` / `db:status`     | dbmate migrations in `packages/db/migrations`        |
| `pnpm db:reset`                                     | drop the database and migrate again                  |
| `pnpm db:codegen`                                   | regenerate Kysely types after a migration            |
| `pnpm db:seed`                                      | platform admin + "Demo kafić" (development only)     |
| `pnpm docker:infra` / `docker:down` / `docker:logs` | local Postgres (more services in phase 6)            |
| `pnpm format`                                       | Prettier                                             |

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). On every push to `main`,
release-please updates a release PR. Merging it tags and releases only the changed apps and pushes
their images to `ghcr.io/<owner>/qafe-<app>`. Details in [CLAUDE.md](CLAUDE.md#releases-and-ci).
