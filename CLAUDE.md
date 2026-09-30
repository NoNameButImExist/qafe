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
- `apps/worker`: outbox relay (core and catalog outboxes → audit log) and, later, BullMQ jobs.
- Every module keeps **its own DB schema and DB role** (`svc_<module>`), never reads another schema.
- A module imports another module **only through its `index.ts`** (ESLint `boundaries/dependencies`
  in `packages/config/eslint.js`). Shared DTOs and event schemas live in `@qafe/contracts`.
- Events: transactional outbox (`<schema>.outbox`). Services write with `publish(trx, event)`
  (`modules/core/outbox.ts`); event schemas are `CoreEvent` in `@qafe/contracts` and carry an
  `actor` label snapshot. The worker's `OutboxRelay` reads each outbox as that module's role
  (`FOR UPDATE SKIP LOCKED`, at-least-once) and hands batches to subscribers; the `AuditWriter`
  appends them to `audit.audit_logs` idempotently (unique `event_id` = `<schema>:<outbox id>`).
  NATS is added when the first module is extracted into its own service.
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
  Built so far: admin login (`POST /auth/admin/login`), `POST /auth/refresh` (rotation; an old token
  reused after 30 s revokes all sessions of that user), `POST /auth/logout`, `GET /auth/me`,
  `GET /.well-known/jwks.json`. Access token in memory on the client, refresh token in an httpOnly,
  `SameSite=Strict` cookie (`qafe_rt`, path `AUTH_COOKIE_PATH`). Login is throttled in memory
  (5 failures per account+IP, 20 per IP, 15 min); moves to Redis in phase 4.
- **Staff sign-in**: `POST /auth/staff/login` (venue slug + username + password), `/auth/staff/refresh`,
  `/auth/staff/logout`, `/auth/staff/me`. Its refresh cookie is `qafe_srt` (admin: `qafe_rt`), and a
  staff session row carries `venue_id`/`member_id`, so refreshing runs in that venue's RLS context.
  Staff tokens carry the role's permission codes; `StaffGuard` + `@RequirePermission('menu.edit')`.
  Access tokens also carry `name` (the actor label for audit entries).
- **Postponed** (see "Odgođene stavke" in `docs/requirements.md`): forced password change at first
  staff sign-in (the `must_change_password` flag is still set), and
- **TOTP (FR-ADM-01) is postponed.** `ADMIN_MFA_REQUIRED=true` makes admin login fail closed
  (`mfa_required`) until the TOTP flow exists. The seed admin password is for development only
  and must change before production.
- **Idempotency**: `ordering.orders.idempotency_key` + `UNIQUE (venue_id, idempotency_key)`; on conflict
  return the existing order (200). Redis is only a cache in front of it.
- Redis is never a source of truth. Keys are prefixed `qafe:<module>:...`.
- **Database access**: modules get a `TenantDatabase` (`@qafe/db`) logged in as their own role; the only
  query entry point is `withTenant({ venueId, isSuperAdmin }, trx => ...)`. Platform admins use
  `{ venueId: null, isSuperAdmin: true }`. Generated Kysely types (`packages/db/src/generated/db.ts`) are
  committed so builds and Docker images do not need a database; run `pnpm db:codegen` after a migration.
- **Errors**: every API error is `{ error: { code, message, details? } }`; codes are in
  `@qafe/contracts` (`ErrorCode`) and translated on the client.
- **Contracts**: request/response schemas are Zod in `@qafe/contracts`, used by the API (`ZodPipe`)
  and the frontends (form validation, types).

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
- `.github/workflows/ci.yml`: on PR and main, runs `lint typecheck test build --affected` and the
  integration tests (`test:integration --affected`, real Postgres via Testcontainers, includes the RLS
  isolation test for NFR-09). On PRs it also builds the Docker images of **affected apps only** (without pushing).
- `.github/workflows/release.yml`: on main, runs release-please. When a release PR is merged, it builds
  and pushes images **only for released apps** to `ghcr.io/<owner>/qafe-<app>` (tags: version,
  major.minor, sha, latest).
- `.github/scripts/image-matrix.mjs` maps apps to Dockerfiles and computes both matrices. A change in
  `infra/docker/*` rebuilds the images using that file.

## Modules so far

- `core`: auth (admin + staff), venues, users, modules, venue settings for the owner (`/venue`),
  public venue lookup, `VenueDirectory` (public interface: does a venue exist).
- `catalog`: the menu (`/catalog/*` for staff, `/admin/venues/:venueId/catalog/*` for admins,
  FR-ADM-07). Every call runs in the venue's RLS context; every change goes to `catalog.outbox`.
  Prices are decimal strings ("2.50"); input accepts "2,5". Items are soft-deleted.
- `audit`: read side of the audit log.
- Images: `common/storage` (S3 / MinIO; `STORAGE_DRIVER=memory` in tests). Uploads are checked by
  their first bytes (JPEG, PNG, WebP), max 5 MB, stored as `venues/<id>/<items|logo>/<uuid>.<ext>`.

## Frontend (apps/admin and apps/panel)

- React 19, TanStack Router (code-based routes, filters in the URL) and TanStack Query, Tailwind 4,
  lucide-react icons, i18next (`bs` source of truth in `src/i18n/bs.ts`, `en` must match its shape).
- Shared UI lives in `@qafe/ui`: primitives (Button, Field/Input/Select/Textarea, Card, Sheet, Menu,
  Switch, Segmented, Pagination, ConfirmDialog, Notice, CopyRow, StatusBadge), `AuthBrandPanel`,
  `Brand`, theme and language switches. Apps import `@qafe/ui/theme.css` after Tailwind; it holds
  the brand tokens (navy `#0B1F3F`, blue `#0070E8`, light and dark) and tells Tailwind to scan the
  package. Components use semantic classes (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`,
  `bg-primary`, `text-accent`), never raw hex. Fonts are self-hosted (Poppins headings, Inter text).
  `@qafe/ui` is built to `dist/`; `pnpm dev` runs its tsc watch. Its components use the i18n keys
  `common.*` and `venues.status.*`, which every app must define.
- The logo is a text wordmark in `@qafe/ui` `Brand.tsx` until the final logo arrives.
- `src/lib/api.ts` in each app is its only HTTP client: bearer token from memory, one shared refresh
  on 401 (admin: `/auth/refresh`, panel: `/auth/staff/refresh`).
- Panel: login (venue slug + username), overview with setup checklist, menu editor (drag and drop
  with dnd-kit, also by keyboard), modifier groups, item images, settings. What a member sees and
  may change follows their permissions (`useCan`).
- Dev: Vite proxies `/api/*` to the API (without `/api`), so `AUTH_COOKIE_PATH=/api/auth` locally.
  `API_PROXY_TARGET=http://localhost:3100` points a dev server at another API instance.

## Phases

1. Monorepo, tooling, root files, CI, release-please, Dockerfiles ← **done**
2. `packages/db`: Postgres in Docker, migration, RLS helper, RLS isolation test, seed ← **done**
3. `api` with `core` module ← **partly done**: health live/ready, admin auth, admin venues
   (list, detail, edit, status, modules), admin users (list, block, password reset),
   `GET /venues/:slug/public`; `audit` module (read side). Missing: OTel, staff login
   (slug + username, PIN), password change, TOTP.
4. Remaining modules, `redis`, a BullMQ example job ← **worker started**: outbox relay → audit log.
5. Frontends ← **admin mostly done**, **panel started**: admin has login, overview, venues + venue
   page, modules, users, audit log (missing: menu UI for FR-ADM-07 (API ready), monitoring).
   Panel has login, overview, menu, settings (missing: tables and QR, staff, orders, reports).
   Guest and staff apps and PWA not started.
6. Full Docker: compose (observability, apps, tools), Traefik, prod compose, Makefile

Not yet: orders, menu, payments. Those follow `docs/requirements.md`.
