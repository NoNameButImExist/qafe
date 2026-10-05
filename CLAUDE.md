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
- `apps/worker`: outbox relay (all outboxes → audit log, Web Push) and, later, BullMQ jobs.
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
  Policies are plain `venue_id = app.current_venue_id()` (indexable; never add `OR ...` to a policy:
  the load test showed it turns every query into a scan of all venues). Platform contexts
  (`isSuperAdmin: true`) run as `svc_<module>_platform` (NOLOGIN, BYPASSRLS, same privileges,
  `SET LOCAL ROLE` in `withTenant`). Tables read per venue need an index that starts with `venue_id`.
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
  `SameSite=Strict` cookie (`qafe_rt`, path `AUTH_COOKIE_PATH`). Login is throttled in Redis
  (`LoginThrottle`: 5 failures per account+IP, 20 per IP, 15 min; fails open if Redis is down).
- **PIN sign-in on a shared device (FR-KON-01)**: an owner links a device (`POST /auth/staff/devices`,
  `staff.manage`; httpOnly cookie `qafe_sdev`, only its sha256 in `core.staff_devices`, found via
  `core.resolve_staff_device`). `GET /auth/staff/device` lists members with a PIN,
  `POST /auth/staff/pin-login` signs in (throttled per device+member and per device). The staff
  app locks a PIN session after 5 min idle; the panel lists and revokes devices.
- **Staff sign-in**: `POST /auth/staff/login` (venue slug + username + password), `/auth/staff/refresh`,
  `/auth/staff/logout`, `/auth/staff/me`. Its refresh cookie is `qafe_srt` (admin: `qafe_rt`), and a
  staff session row carries `venue_id`/`member_id`, so refreshing runs in that venue's RLS context.
  Staff tokens carry the role's permission codes; `StaffGuard` + `@RequirePermission('menu.edit')`.
  Access tokens also carry `name` (the actor label for audit entries).
- **Two-factor sign-in (FR-ADM-01)**: each admin turns TOTP on or off in "Moj nalog"
  (`/auth/mfa`, `/setup`, `/enable`, `/disable`; RFC 6238 in `@qafe/auth`, no library). Secrets
  are AES-256-GCM encrypted with `MFA_ENCRYPTION_KEY`; a code works once (Redis
  `qafe:core:totp-used:*`). Login answers 401 `mfa_required` until `totp` is sent.
  `ADMIN_MFA_REQUIRED=true` refuses admins who have not turned it on.
- **Temporary passwords (FR-SEF-01)**: `must_change_password` travels in the access token
  (`pwc`); `AuthGuard` answers 403 `password_change_required` except on routes marked
  `@AllowTemporaryPassword()` (me, `POST /auth/password`). Whoever sets someone else's password
  (admin: new venue owner, reset; owner: new staff, new password) chooses with
  `requirePasswordChange` (default on). Admin, panel and staff show `ChangePasswordForm`
  (`@qafe/ui`, i18n keys `password.*`) until it is changed. A PIN sign-in does not demand the
  change (the password was not used). The seed admin password is for development only.
- **Idempotency**: `ordering.orders.idempotency_key` + `UNIQUE (venue_id, idempotency_key)`; on conflict
  return the existing order (200). Redis is only a cache in front of it.
- Redis is never a source of truth. Keys are prefixed `qafe:<module>:...`.
- **Closed by default**: the global guard `RequireSignIn` (APP_GUARD) demands a valid access token
  on every HTTP route; only routes marked `@Public()` are open (health, sign-in/refresh/logout,
  JWKS, `GET /venues/:slug/public`, `/guest/*`). `route-protection.integration.test.ts` walks
  every registered route (`registeredRoutes(app)` from `bootstrap.ts`) and fails if one outside
  its public list answers anything but 401 without a token. Controllers still add StaffGuard /
  PlatformAdminGuard for roles and permissions.
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
  web/          public landing page qafe.ba (5177), for venue owners and guests
packages/
  config/       shared tsconfig (base, node, react), ESLint flat config, Prettier
  contracts/    Zod schemas: API DTOs and events
  db/           migrations (dbmate), Kysely types, RLS helper
  auth/         JWT verification, can('orders.cancel')
  observability/ OpenTelemetry setup
  redis/        ioredis client, key prefixes (redisKey), fixed-window rate limit
  ui/           shared React components
  menu-editor/  the menu editor, used by panel and admin (FR-SEF-17..19, FR-ADM-07)
infra/docker/   service.Dockerfile (api, worker), web.Dockerfile + nginx.conf (frontends)
docs/           requirements, DB schema + ERD, original start prompt
```

Workspace packages are ESM, compiled with `tsc` to `dist/` (`tsconfig.build.json`); `tsconfig.json`
is for typechecking only. Apps depend on them with `workspace:*`.

## Commands

| Command                                     | What it does                                                    |
| ------------------------------------------- | --------------------------------------------------------------- |
| `pnpm install`                              | install (pnpm 12 via corepack; run `corepack enable pnpm` once) |
| `pnpm dev`                                  | all apps in watch mode                                          |
| `pnpm check`                                | lint, typecheck, test, build (turbo, cached)                    |
| `pnpm turbo run <task> --affected`          | only packages changed vs `main` and their dependents            |
| `pnpm format` / `pnpm format:check`         | Prettier                                                        |
| `pnpm --filter @qafe/api test`              | one package                                                     |
| `make up` / `make down` / `make logs s=api` | whole stack in Docker behind Traefik (see "Docker")             |
| `make dev`                                  | data services in Docker, apps on the host with hot reload       |

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
  areas/tables/QR codes (`/venue/areas`, `/venue/tables`, permission `tables.manage`), staff
  accounts (`/venue/staff`, permission `staff.manage`), public venue lookup, `VenueDirectory`.
  QR links come from `GUEST_URL_TEMPLATE` (`{slug}`, `{token}`); rotating a QR code replaces the
  token, so the printed code stops working. Staff rules: nobody changes their own role or status,
  only an owner hands out or changes the owner role, and a venue always keeps an active owner.
- `catalog`: the menu (`/catalog/*` for staff, `/admin/venues/:venueId/catalog/*` for admins,
  FR-ADM-07). The UI is `@qafe/menu-editor` (`<MenuEditor request queryKey errorText currency
canEdit canToggle stations />`, its texts in `menuEditorMessages` under `menu.*`); panel `/menu`
  and admin `/venues/$venueId/menu` only pass the config. Apps import
  `@qafe/menu-editor/styles.css` after the theme so Tailwind sees its classes. Every call runs in the venue's RLS context; every change goes to `catalog.outbox`.
  Prices are decimal strings ("2.50"); input accepts "2,5". Items are soft-deleted.
- `audit`: read side of the audit log. `audit.audit_logs` and `reporting.order_item_facts` are
  partitioned by month (`app.ensure_month_partitions`, worker job nightly, DEFAULT partition as a
  net); idempotency key is `(event_id, created_at)` / `(order_item_id, business_date)`. The admin
  list pages by cursor (`nextCursor`, no count); filters come from `audit.actions`,
  `audit.actor_labels`, `audit.venue_labels` (kept by the worker's AuditWriter). Months older than
  `AUDIT_RETENTION_MONTHS` (24) are archived to S3 and detached by the backup service.
- `ordering`: table sessions and orders. Guest API `/guest/*` (no login): `GuestGuard` takes the
  venue from the host (`<slug>.<DOMAIN>`, `slugFromHost`) and the device from the host-only cookie
  `qafe_gd` (only its HMAC with `GUEST_SESSION_SECRET` is stored as `device_hash`). First device
  at a table is the host; later ones wait for the host or a waiter (`device_approval_required`);
  one active session per device per venue (`active_elsewhere`, `leaveCurrent`); a session nobody
  ordered in or looked at for 30 min is abandoned on the next scan. Verification: waiter mode
  (first accepted order verifies the table) or PIN mode (4 digits, 5 tries / 10 min in Redis).
  Orders are priced by catalog's `GuestMenuService.quote` from the database (snapshots in
  `order_items`), numbered per business day (`next_order_number`, venue timezone and
  `business_day_starts_at`), idempotent (201 new, 200 retry, 409 key of another device), and
  limited to 2 unconfirmed per device and 5 per minute per table (session row lock). The bill counts
  accepted orders without an open "Nije naše" dispute.
- Staff API `/staff/*` (ordering, `StaffGuard` + permissions): `floor` (tables with status free /
  occupied / needs_service / bill_requested), `orders` (live queue of open tables), `sessions/:id`
  (detail with bill and `blockingOrders`), verify, approve / remove device (removal cancels its
  unconfirmed orders and blocks it for `device_block_hours`), close an empty table, requests
  acknowledge / done, order accept / serve / return (message) / reject (only with
  `order_rejection_enabled`) / cancel, items add / remove / replace / cancel (each writes
  `order_changes`, which the guest sees as "Izmijenjeno"), "Nije naše" confirm / cancel
  (`orders.disputes`, owner only by default), manual order for a table (opens a verified session,
  accepted at once, idempotent), push subscriptions. Shared writes are in `order-writes.ts`.
- Wi-Fi table verification (FR-GOS-28): `core.venues.wifi_verification_enabled` + `core.venue_networks`
  (cidr, RLS), managed in the panel (`/venue/network` returns the caller's IP, `/venue/networks`).
  A guest whose IP is in a venue network gets a verified session (join, state, order); orders still
  need waiter acceptance. Client IP comes from `trustProxy` limited to `TRUST_PROXY_HOPS` (default 1).
- KDS (module `kds`): prep stations (`/venue/stations`), `catalog.items.prep_station_id` copied to
  `order_items`; `GET /staff/kds`, item ready / undo (15 s), order start; all items ready → order
  `ready` + `order.ready` event (waiter alert). Staff app `/kds` is a bare full-screen route.
- `billing`: `POST /staff/sessions/:id/pay` pays the whole table (cash or card, only enabled
  methods) and closes it. Payment (billing schema) and session (ordering) are separate: payment
  `pending` → `SessionLedger.closeAfterPayment` (ordering's public interface) re-checks the bill
  under the session lock → `completed`, or `failed` with `bill_changed` / `open_orders`. Events go
  to `billing.outbox`. Partial payment (FR-KON-20): `POST /staff/sessions/:id/pay-items`
  (items + quantities, `billing.payment_items`), `GET /staff/sessions/:id/payments`;
  `SessionLedger.recordPartialPayment` raises `table_sessions.paid_amount`, the bill carries
  `paid` / `remaining`, `/pay` pays the remainder, and paying the last items closes the table.
  `session.settled` carries `itemMethods`, so facts get each item's real method. Fiscalisation
  (V3) is not built.
- Moving (FR-KON-14, `TableMovesService`): `POST /staff/orders/:id/move` and
  `POST /staff/sessions/:id/move` (`orders.update`). Onto a free table the session moves; onto an
  occupied one it merges (orders, requests and guests move, the source closes with
  `merged_into_session_id`). A partly paid session never moves (`partially_paid`).
- `GET /reports/me?date=` (FR-KON-23, `MyDayController`, any staff member): the member's own
  paid turnover for a business day from the report facts; staff app page `/me` ("Moj dan").
- `reporting`: sales reports (FR-SEF-24, 25) from `reporting.order_item_facts`, one row per paid
  item. When a table is paid, `SessionLedger` publishes `session.settled` (ordering.outbox, same
  transaction as the close) with every billed item and its snapshot (prices, VAT, waiter name via
  `VenueDirectory.memberNames`, area, local hour and weekday); the worker's `ReportingWriter`
  writes the facts idempotently. Revenue counts at payment. `GET /reports/summary?from&to`
  (`reports.view`): totals, previous period of the same length, by day / hour / weekday (gaps
  filled with zeros), item, category, waiter, payment method. `GET /reports/export` gives CSV (one
  table; bs uses `;` and a decimal comma, with a BOM) or Excel (`write-excel-file`, a sheet per
  table). PDF is the panel's print page.
- Opening hours (FR-SEF-02): `openingHours` in `GET/PATCH /venue`, one interval per weekday
  (closing at or before opening runs past midnight; no entries = always open).
  `OrderingSettings.openNow` is computed in the venue's timezone; outside the hours guests get
  `closedReason: 'outside_hours'` and orders fail with `ordering_closed`. Staff orders are not limited.
- `GET /staff/orders/day?date=` (FR-SEF-23): every order of a business day (today's by default).
- Table PIN (FR-GOS-21): staff always see the session's PIN on the table page and may set a chosen
  one or a new random one (`POST /staff/sessions/:id/pin`, `sessions.verify`; resets the guests'
  failed tries). Guests can confirm the table with it in both modes (in waiter mode via "Imam PIN").
- The guest device cookie lasts a year, so the host who closes the browser and scans again is back
  in the same session as host; other devices still wait for approval.
- Realtime: Socket.IO gateway in `ordering` with the Redis adapter (`common/redis/redis-io.adapter.ts`).
  Messages are hints (`session.changed`, `venue.changed`); clients refetch over HTTP. Guests are put
  in `session:<id>` from the handshake cookie (the app reconnects after joining a table), staff in
  `venue:<id>` with `auth.token`.
- Redis (`@qafe/redis`, `common/redis`): guest menu cache (`qafe:catalog:guest-menu:<venue>`,
  invalidated after every menu change, 5 min TTL), PIN attempts, Socket.IO fan-out. When Redis is
  down the menu comes from Postgres; `/health/ready` reports Redis.
- Worker jobs (BullMQ, prefix `qafe:jobs`, `apps/worker/src/jobs.ts`): close abandoned sessions every
  5 min (`ABANDON_AFTER_MINUTES`, only sessions without orders), nightly purge of old device
  blocks, auth sessions and published outbox rows (`maintenance.ts`).
- Worker relays `core`, `catalog`, `ordering` and `billing` outboxes. Guest order events are not
  audited; staff actions on sessions and orders, payments and "Nije naše" reports are. The worker
  also sends Web Push (`web-push`, VAPID keys from `pnpm keys:vapid`) to every staff device of the
  venue for a guest's new order, waiter call, bill request or waiting device; gone subscriptions
  (404/410) are deleted. Push never fails an outbox batch.
- Images: `common/storage` (S3 / MinIO; `STORAGE_DRIVER=memory` in tests). Uploads are checked by
  their first bytes (JPEG, PNG, WebP), max 5 MB, stored as `venues/<id>/<items|logo>/<uuid>.<ext>`.

## Frontend (apps/admin and apps/panel)

- React 19, TanStack Router (code-based routes, filters in the URL) and TanStack Query, Tailwind 4,
  lucide-react icons, i18next (`bs` source of truth in `src/i18n/bs.ts`, `en` must match its shape).
- Platform themes (FR-ADM-22): `<html data-brand="warm|ice">` switches the CSS variables in
  `@qafe/ui/theme.css` (no `data-brand` = the classic navy/blue the guest app keeps). The super
  admin sets it in admin "Postavke" (`PUT /admin/settings/theme`, `core.platform_settings`); apps
  call `applyStoredBrand()` before render and `syncPlatformBrand()` (public `GET /platform/theme`,
  no-cache, on focus and every 5 min). Unknown values are ignored. `@qafe/ui` must not import Zod
  at runtime (it would land in the guest bundle): brand names are checked against a plain list.
  A new theme = a CSS block + its name in `THEME_BRANDS`, plus the landing page's own token
  block in `apps/web/src/index.css` (`apps/web/src/brand.ts` syncs it the same way; Traefik
  routes `/api` on the bare `DOMAIN` too, for that).
- SMTP (FR-ADM-23): `/admin/settings/smtp` (+ `/test`, nodemailer); password AES-256-GCM with
  `SETTINGS_ENCRYPTION_KEY`, never returned or audited.
- Shared UI lives in `@qafe/ui`: primitives (Button, Field/Input/Select/Textarea, Card, Sheet, Menu,
  Switch, Segmented, Pagination, ConfirmDialog, Notice, CopyRow, StatusBadge), `AuthBrandPanel`,
  `Brand`, theme and language switches. Apps import `@qafe/ui/theme.css` after Tailwind; it holds
  the brand tokens (per theme, light and dark; "navy-_" = the theme's deep colour, "blue-_" its
  accent) and tells Tailwind to scan the package. Components use semantic classes (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`,
  `bg-primary`, `text-accent`), never raw hex. Fonts are self-hosted (Poppins headings, Inter text).
  `@qafe/ui` is built to `dist/`; `pnpm dev` runs its tsc watch. Its components use the i18n keys
  `common.*` and `venues.status.*`, which every app must define.
- The logo is a text wordmark in `@qafe/ui` `Brand.tsx` until the final logo arrives.
- `src/lib/api.ts` in each app is its only HTTP client: bearer token from memory, one shared refresh
  on 401 (admin: `/auth/refresh`, panel: `/auth/staff/refresh`).
- Panel orders (`/orders`: business day, status groups, search, cancel with a reason) and reports
  (`/reports`: presets and custom range, stat tiles against the previous period, recharts bar
  charts with a table view, ranked tables, Excel / CSV download, `/reports/print` A4 page for PDF).
  The reports page is lazy-loaded (recharts stays out of the main bundle). Chart bars use
  `--chart-bar` (validated for light and dark).
- Panel: login (venue slug + username), overview with setup checklist, menu editor (drag and drop
  with dnd-kit, also by keyboard), modifier groups, item images, settings, space and QR (cards
  printed six per A4 from `/tables/print`; the browser's print dialog saves a PDF), staff accounts
  (password and/or PIN, shown once). What a member sees and may change follows their permissions
  (`useCan`).
- Dev: Vite proxies `/api/*` to the API (without `/api`), so `AUTH_COOKIE_PATH=/api/auth` locally.
  `API_PROXY_TARGET=http://localhost:3100` points a dev server at another API instance.

## Guest app (apps/guest)

- Open `http://<slug>.qafe.localhost:5173/t/<qr token>` (QR codes from the panel point there with the
  local `GUEST_URL_TEMPLATE`). The Vite proxy keeps the Host header (`changeOrigin: false`) and
  proxies WebSockets, as Traefik does in production.
- No router library: `/t/<token>` joins and moves to `/`, which shows the session or the menu to
  browse. TanStack Query for data, i18next (bs/en; English for phones not set to bs/hr/sr), a small
  cart store in localStorage per host (survives refresh, keeps one idempotency key per cart).
- `pnpm --filter @qafe/guest build` fails when the JavaScript is over 200 KB gzip (NFR-01,
  `scripts/check-size.mjs`); currently about 170 KB. PWA: manifest + `public/sw.js` (app shell and
  the last `/api/guest/venue` and `/api/guest/menu`, network first; session and orders never cached).
- Animations: `motion` with `LazyMotion strict` (`src/motion/`): only `m.*` components; the
  features chunk loads after first paint. `BottomSheet` (drag to close, on `<dialog>`) replaces
  the shared `Sheet` in the guest app; `burst()` fires the star burst. Service worker / offline PWA is not added yet.

## Staff app (apps/staff)

- `http://localhost:5174`: sign in with venue slug + username + password, or name + PIN on a
  device the owner linked ("Ovaj uređaj"). Same stack as the panel (TanStack Router and Query,
  i18next, `@qafe/ui`) plus `socket.io-client`.
- "Spreman za rad" after every load unlocks sound (Web Audio beep, no file) and may ask for push
  permission (FR-KON-02, 05). `public/sw.js` is a hand-written service worker for push only; it
  writes the notification text in the app's language (the page posts it).
- Pages: tables (`/`, area filter), orders (`/orders`, live queue), table (`/table/$tableId`:
  verification and PIN, requests, devices, orders with all actions, bill, payment, close), menu
  availability (`/menu`). Actions follow the member's permissions (`useCan`).
- Look: dark top bar with live indicator (`useLive`), sidebar on `lg`, floating bottom nav on
  phones; `motion` (`LazyMotion` with `domMax`) for layout animations.
- Offline (NFR-05, `lib/offline.ts`, `lib/network.ts`): snapshot of floor/orders/session/menu/kds
  in localStorage per venue (TanStack `dehydrate`/`hydrate`); one-tap actions use
  `useQueuedAction` (`networkMode: 'always'`, 8 s timeout, queued and replayed in order).
  Payment and order edits need a connection. `public/sw.js` also caches the app shell; a refresh
  that fails for lack of network keeps the saved profile instead of signing out.
- Realtime: the socket sends the access token on every (re)connect; `venue.changed` refetches and
  rings and vibrates (`navigator.vibrate`, Android only) for guest-caused changes. The guest app
  vibrates briefly when an order changes or the device is let in. Offline mode: see "Offline" above.

## Docker

- `docker-compose.yml` is the whole stack: postgres, redis, minio (+ bucket/policy one-offs),
  `migrate` (dbmate image with `packages/db/migrations`, runs before api and worker), api, worker,
  guest, staff, panel, admin, and Traefik. Profiles: `infra` = data services only (for `pnpm dev`),
  `app` = everything. Images are `${QAFE_IMAGE_PREFIX}-<app>:<tag>` (locally `qafe-api:local`).
- Traefik routes by host: `<slug>.DOMAIN` guest (lowest priority), `staff.`, `panel.`, `admin.`,
  `s3.` (MinIO for menu images), `DOMAIN` and `www.DOMAIN` the landing page (`apps/web`), and `/api/*` on every host to the api with `/api` stripped. So
  every frontend calls its own origin (no CORS, host-only cookies, `AUTH_COOKIE_PATH=/api/auth`),
  and the api reads the venue from the Host header. `RESERVED_SLUGS` (`@qafe/contracts`) keeps
  those subdomains from becoming venue slugs.
- Locally (`make up`): http://qafe.localhost (landing), http://admin.qafe.localhost, http://panel.qafe.localhost,
  http://staff.qafe.localhost, http://<slug>.qafe.localhost; Traefik dashboard on :8081. The dev
  override publishes ports on 127.0.0.1 and sets `COOKIE_SECURE=false` (http). Safari does not
  resolve `*.localhost`: use Chrome or Firefox, or add hosts entries.
- Production (`make prod-pull prod-up` on a server, `docker-compose.prod.yml`): images from GHCR,
  HTTPS with a wildcard Let's Encrypt certificate (DNS challenge), restarts, no build. The release
  workflow publishes `qafe-<app>` images and `qafe-migrate` (when `packages/db` is released).
- Profile `monitoring` (part of `make up`): otel-collector (OTLP 4318 → Prometheus exporter),
  prometheus (also scrapes Traefik :8082), loki + alloy (container logs), grafana on
  `grafana.DOMAIN` (router priority 200, above the `/api` router) with the provisioned
  "qafe.ba – pregled" dashboard (`infra/monitoring/`). API and worker export metrics only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`@qafe/observability` `startTelemetry`).
- `backup` service (`infra/docker/backup.Dockerfile`, `infra/backup/*.sh`): nightly encrypted
  `pg_dump` to `s3://BACKUP_BUCKET/daily|weekly`, 7 + 4 kept; `make backup`,
  `make backup-restore-test` (restores into `qafe_restore`); also `archive-audit.sh`.
- PITR (NFR-24): postgres is `infra/docker/postgres.Dockerfile` (postgres:16-alpine + pgBackRest),
  archiving WAL (`archive_timeout` 60 s); the `pitr` service backs up daily (full on Sundays).
  Repo: a volume locally, S3 (HTTPS) on servers (`PITR_*`). `make pitr-info`, `pitr-backup`,
  `pitr-restore-test at="..."`. `pg_stat_statements` is on.
- Scaling: `API_REPLICAS` (Traefik sticky cookie `qafe_lb`), `DB_POOL_MAX`,
  `POSTGRES_MAX_CONNECTIONS`. Redis runs `volatile-lru` (only keys with a TTL are evicted).
- Load test (`infra/loadtest`, k6 in Docker): `make loadtest-seed`, `make loadtest`,
  `make loadtest-clean` (`LT_VENUES`, `LT_TABLES`, `LT_DURATION`; venues `lt-*`).
- Admin "Nadzor sistema" (`/system`, `GET /admin/monitoring?window=1h|24h|7d`) reads only
  Prometheus (`PROMETHEUS_URL`, `GRAFANA_URL`); metrics carry `service.version` and
  `service.instance.id` and `qafe.process.start_time`.

## Phases

1. Monorepo, tooling, root files, CI, release-please, Dockerfiles ← **done**
2. `packages/db`: Postgres in Docker, migration, RLS helper, RLS isolation test, seed ← **done**
3. `api` with `core` ← **done**: health, admin and staff auth (TOTP, PIN on shared devices,
   temporary passwords), venues, users, modules, settings, audit, OTel metrics.
4. Remaining modules, `redis`, BullMQ ← **done**: catalog, ordering, billing, reporting, KDS, worker
   (outbox relay, audit log, report facts, Web Push, maintenance and partition jobs).
5. Frontends ← **MVP done**: admin (incl. menu of any venue, monitoring, settings), panel, guest,
   staff (offline, PIN), landing page.
6. Full Docker: compose, Traefik, prod compose, Makefile, monitoring, backups, PITR ← **done**
7. V2 (from `docs/requirements.md`, without online payment) ← **in progress**: batch 1 done
   (partial payment, move / merge tables, guest menu search, own turnover)

Not yet: the remaining V2 items and V3. Those follow `docs/requirements.md`.
