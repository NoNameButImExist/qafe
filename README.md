# qafe.ba

Multi-tenant platform for ordering via a QR code on the table in cafés.

Requirements: [docs/requirements.md](docs/requirements.md) · DB schema: [docs/db/qafe_schema_v2.sql](docs/db/qafe_schema_v2.sql)

## Run locally

Needs Docker, and for development Node 24 (`fnm use` / `nvm use` reads `.nvmrc`) with
`corepack enable pnpm` once.

**First time**

1. `cp .env.example .env` and fill in the passwords (any values for local work), `SEED_ADMIN_PASSWORD`
   and `SEED_STAFF_PASSWORD`
2. `make setup` (installs, creates the JWT keys in `secrets/`), then `pnpm keys:vapid` and put the two
   keys into `.env` (Web Push for staff)

**Whole stack in Docker** (`make help` lists all commands)

3. `make up` builds and starts everything behind Traefik, migrations included
4. `make seed` once for demo data

Use Chrome or Firefox (Safari does not resolve `*.localhost`):

| App          | URL                                  | Sign in                                                       |
| ------------ | ------------------------------------ | ------------------------------------------------------------- |
| Landing page | http://qafe.localhost                |                                                               |
| Admin        | http://admin.qafe.localhost          | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`                    |
| Venue panel  | http://panel.qafe.localhost          | venue `demo-kafic`, user `sef`, `SEED_STAFF_PASSWORD`         |
| Staff app    | http://staff.qafe.localhost          | venue `demo-kafic`, user `konobar`, `SEED_STAFF_PASSWORD`     |
| Guest        | http://demo-kafic.qafe.localhost/t/… | QR codes from the panel ("Prostor i QR") open the right table |
| Traefik      | http://localhost:8081                | dashboard                                                     |
| MinIO        | http://localhost:9001                | `S3_ACCESS_KEY` / `S3_SECRET_KEY`                             |

**Development with hot reload**: `make dev` (Postgres, Redis and MinIO in Docker, apps on the host)

| App     | URL                                       |
| ------- | ----------------------------------------- |
| Guest   | http://demo-kafic.qafe.localhost:5173/t/… |
| Staff   | http://localhost:5174                     |
| Panel   | http://localhost:5175                     |
| Admin   | http://localhost:5176                     |
| Landing | http://localhost:5177                     |
| API     | http://localhost:3000/health/ready        |

For the dev servers set `AUTH_COOKIE_PATH=/api/auth` and
`GUEST_URL_TEMPLATE=http://{slug}.qafe.localhost:5173/t/{token}` in `.env`.

## Common commands

| Command                                         | What it does                                         |
| ----------------------------------------------- | ---------------------------------------------------- |
| `pnpm check`                                    | lint, typecheck, unit tests and build                |
| `pnpm test:integration`                         | tests against real Postgres (Docker, Testcontainers) |
| `pnpm turbo run test --affected`                | only packages changed vs `main`                      |
| `pnpm db:migrate` / `db:rollback` / `db:status` | dbmate migrations in `packages/db/migrations`        |
| `pnpm db:reset`                                 | drop the database and migrate again                  |
| `pnpm db:codegen`                               | regenerate Kysely types after a migration            |
| `pnpm db:seed`                                  | platform admin + "Demo kafić" (development only)     |
| `make up` / `make down` / `make logs s=api`     | whole stack in Docker (see `make help`)              |
| `pnpm docker:infra`                             | only Postgres, Redis and MinIO (for `make dev`)      |
| `pnpm format`                                   | Prettier                                             |

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). On every push to `main`,
release-please updates a release PR. Merging it tags and releases only the changed apps and pushes
their images to `ghcr.io/<owner>/qafe-<app>`. Details in [CLAUDE.md](CLAUDE.md#releases-and-ci).
