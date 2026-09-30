# CLAUDE.md

qafe.ba: multi-tenant QR ordering platform for cafés. Requirements in `docs/requirements.md`
(FR-ADM, FR-SEF, FR-KON, FR-GOS, NFR). The DB schema in `docs/db/qafe_schema_v2.sql` is the
source of truth for the database; never change it without asking.

## Working rules

- **Never `git commit`, `git push`, tag or open PRs.** Work in phases; end each phase with a report
  (what changed, checks run and their output, open questions, suggested commit message). The user
  reviews, commits and pushes.
- Ask before any larger decision not covered here: new library, structural change, schema change.
- Small steps; after each: `pnpm install`, `pnpm check` (lint, typecheck, test, build).
- Code, names, comments and commit messages in **English**. UI text goes through i18n (`bs`, `en`).
- Conventional Commits (enforced by commitlint): `feat:`, `fix:`, `perf:`, `refactor:`, `deps:`,
  `docs:`, `chore:`, `test:`, `build:`, `ci:`. Scope = app or package, e.g. `feat(api): ...`.
- No secrets in the repo. Only `.env.example` with placeholder values.

## Architecture (decided)

**Modular monolith**, not microservices (for now):

- `apps/api`: one NestJS (Fastify) process with modules in `apps/api/src/modules/<name>`:
  `core`, `catalog`, `ordering`, `billing`, `audit`, `reporting`.
- `apps/worker`: outbox relay and BullMQ jobs (reports, QR PDFs, push).
- Every module keeps **its own DB schema and DB role** (`svc_<module>`), never reads another schema.
- A module imports another module **only through its `index.ts`** (ESLint `boundaries/dependencies`
  in `packages/config/eslint.js`). Shared DTOs and event schemas live in `@qafe/contracts`.
- Events: transactional outbox (`<schema>.outbox`) plus an in-process event bus. NATS is added
  when the first module is extracted into its own service.
- OpenTelemetry attribute `module` on all spans and metrics.

Tenant, auth and data rules:

- **RLS**: every transaction runs `set_config('app.venue_id', $1, true)` and
  `set_config('app.is_super_admin', $2, true)` via the helper in `packages/db`; no query runs without it.
- Before `venue_id` is known, use only `core.resolve_venue(slug)` and `core.resolve_table(qr_token)`:
  `SECURITY DEFINER`, owned by the `resolver` role (NOLOGIN, BYPASSRLS), executable only by `svc_core`.
- **Routing**: `{slug}.qafe.ba/api/*` goes to the api, and the tenant comes from the host. The guest
  cookie is host-only, `HttpOnly; Secure; SameSite=Lax`. `api.qafe.ba` serves staff, panel and
  admin, and there the tenant comes from the JWT (staff login requires the venue slug).
- **Auth** lives in `core`: login, refresh (rotating), TOTP, PIN, argon2id. JWTs are signed asymmetrically
  (EdDSA), with JWKS exposed. Verification uses the public key; the refresh denylist is in Redis.
- **Idempotency**: `ordering.orders.idempotency_key` + `UNIQUE (venue_id, idempotency_key)`; on conflict
  return the existing order (200). Redis is only a cache in front of it.
- Redis is never a source of truth. Keys are prefixed `qafe:<module>:...`.

## Structure

```
apps/
  api/          NestJS modular monolith (port 3000)
  worker/       outbox relay + BullMQ (health on 3001 locally)
  guest/        guest PWA (5173), must stay light: < 200 KB JS gzip (NFR-01)
  staff/        waiter PWA + /kds (5174)
  panel/        venue owner panel (5175)
  admin/        platform admin + monitoring (5176)
packages/
  config/       shared tsconfig (base, node, react), ESLint flat config, Prettier
  contracts/    Zod schemas: API DTOs and events
  db/           migrations (dbmate), Kysely types, RLS helper
  auth/         JWT verification, can('orders.cancel')
  observability/ OpenTelemetry setup
  redis/        ioredis client, key prefixes, BullMQ queues
  ui/           shared React components
infra/docker/   service.Dockerfile (api, worker), web.Dockerfile + nginx.conf (frontends)
docs/           requirements, DB schema + ERD, original start prompt
```

Workspace packages are ESM, compiled with `tsc` to `dist/` (`tsconfig.build.json`); `tsconfig.json`
is for typechecking only. Apps depend on them with `workspace:*`.

## Commands

| Command                             | What it does                                                    |
| ----------------------------------- | --------------------------------------------------------------- |
| `pnpm install`                      | install (pnpm 12 via corepack; run `corepack enable pnpm` once) |
| `pnpm dev`                          | all apps in watch mode                                          |
| `pnpm check`                        | lint, typecheck, test, build (turbo, cached)                    |
| `pnpm turbo run <task> --affected`  | only packages changed vs `main` and their dependents            |
| `pnpm format` / `pnpm format:check` | Prettier                                                        |
| `pnpm --filter @qafe/api test`      | one package                                                     |

## Versions and tooling notes

- Node 24 LTS, pnpm 12, TypeScript **6.0** (not 7: typescript-eslint supports `<6.1`), NestJS 12 (ESM only),
  Vite 8, React 19, Tailwind 4, Vitest 5, ESLint 10.
- API tests compile with SWC (`unplugin-swc`) because Nest DI needs decorator metadata.
- pnpm 12 blocks install scripts unless allowed in `pnpm-workspace.yaml` (`allowBuilds`) and rejects
  very fresh versions (`minimumReleaseAge`); exceptions are listed there on purpose.

## Releases and CI

- **release-please** (manifest mode): `release-please-config.json`, `.release-please-manifest.json`.
  Every app and package is a component with its own version, `CHANGELOG.md` and tag (`api-v0.2.0`).
  The `node-workspace` plugin bumps dependents, so a change in `packages/contracts` also releases `api`.
- Releasable commit types: `feat` (minor), `fix`, `perf`, `revert`, `refactor`, `deps` (patch). Hidden
  types (`chore`, `docs`, `test`, `build`, `ci`, `style`) do not release. Before 1.0, breaking changes bump minor.
- `.github/workflows/ci.yml`: on PR and main, runs `lint typecheck test build --affected`. On PRs it
  also builds the Docker images of **affected apps only** (without pushing).
- `.github/workflows/release.yml`: on main, runs release-please. When a release PR is merged, it builds
  and pushes images **only for released apps** to `ghcr.io/<owner>/qafe-<app>` (tags: version,
  major.minor, sha, latest).
- `.github/scripts/image-matrix.mjs` maps apps to Dockerfiles and computes both matrices. A change in
  `infra/docker/*` rebuilds the images using that file.

## Phases

1. Monorepo, tooling, root files, CI, release-please, Dockerfiles ← **done**
2. `packages/db`: Postgres in Docker, migration, RLS helper, RLS isolation test, seed
3. `api` with `core` module: health (live, ready), OTel, auth skeleton, `GET /venues/:slug/public`
4. Remaining modules, `worker`, `redis`, `contracts`, a BullMQ example job
5. Frontends: routing, i18n (bs, en), PWA for guest and staff
6. Full Docker: compose (infra, observability, apps, tools), Traefik, prod compose, Makefile

Not yet: orders, menu, payments, UI screens. Those follow `docs/requirements.md` after the scaffold.
