# qafe.ba

Multi-tenant platform for ordering via a QR code on the table in cafés.

Requirements: [docs/requirements.md](docs/requirements.md) · DB schema: [docs/db/qafe_schema_v2.sql](docs/db/qafe_schema_v2.sql)

## Run locally

1. Install Node 24 (`fnm use` or `nvm use` reads `.nvmrc`) and enable pnpm: `corepack enable pnpm`
2. `pnpm install`
3. `cp .env.example .env`
4. `pnpm dev`

API: http://localhost:3000/health/live · guest 5173 · staff 5174 · panel 5175 · admin 5176

The database, Redis and the full Docker stack are added in later phases (see [CLAUDE.md](CLAUDE.md)).

## Common commands

| Command                                                                 | What it does                                |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm check`                                                            | lint, typecheck, test and build             |
| `pnpm turbo run test --affected`                                        | only packages changed vs `main`             |
| `pnpm format`                                                           | format everything with Prettier             |
| `docker build -f infra/docker/service.Dockerfile --build-arg APP=api .` | backend image (`api`, `worker`)             |
| `docker build -f infra/docker/web.Dockerfile --build-arg APP=guest .`   | frontend image (guest, staff, panel, admin) |

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). On every push to `main`,
release-please updates a release PR. Merging it tags and releases only the changed apps and pushes
their images to `ghcr.io/<owner>/qafe-<app>`. Details in [CLAUDE.md](CLAUDE.md#releases-and-ci).
