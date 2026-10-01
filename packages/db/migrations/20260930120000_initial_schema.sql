-- =====================================================================
--  qafe.ba – PostgreSQL šema baze (v2)
--  Usklađeno sa: "qafe.ba – Specifikacija zahtjeva"
--
--  Arhitektura: mikroservisi, jedan PostgreSQL klaster, jedna šema po servisu.
--    core      -> lokali, moduli, postavke, osoblje, uloge, prostor, smjene
--    catalog   -> meni, artikli, dodaci, prevodi, alergeni
--    ordering  -> sesije stolova, gosti, zaštita sesije, narudžbe, zahtjevi
--    billing   -> plaćanja
--    audit     -> audit log
--    reporting -> činjenice za izvještaje (puni se iz događaja)
--
--  Pravila:
--    * Strani ključevi (FK) postoje samo UNUTAR jedne šeme.
--    * Veza prema drugom servisu = samo uuid kolona (bez FK) + snapshot podataka.
--    * Svaki servis ima svoj DB role i vidi samo svoju šemu.
--    * Svaka tabela sa podacima lokala ima venue_id i Row Level Security.
--    * Događaji između servisa idu preko outbox tabele (transactional outbox).
--    * Lokal se prije poznatog venue_id određuje samo kroz core.resolve_venue
--      i core.resolve_table (SECURITY DEFINER, vlasnik role "resolver").
--
--  Migraciju pokreće admin role (superuser), jer kreira role sa BYPASSRLS
--  i mijenja vlasnika funkcija. ALTER DEFAULT PRIVILEGES važi za objekte
--  koje kreira taj isti role, pa sve buduće migracije pokreće on.
--
--  PostgreSQL 16
-- =====================================================================

-- migrate:up

CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA app;        -- zajednički tipovi i funkcije
CREATE SCHEMA core;
CREATE SCHEMA catalog;
CREATE SCHEMA ordering;
CREATE SCHEMA billing;
CREATE SCHEMA audit;
CREATE SCHEMA reporting;

-- =====================================================================
-- 0. ZAJEDNIČKO (app)
-- =====================================================================
CREATE TYPE app.platform_role     AS ENUM ('super_admin', 'support', 'none');
CREATE TYPE app.venue_status      AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE app.payment_method    AS ENUM ('cash', 'card', 'online');
CREATE TYPE app.station_type      AS ENUM ('bar', 'kitchen', 'other');
CREATE TYPE app.verification_mode AS ENUM ('waiter', 'pin');

CREATE TYPE app.session_status    AS ENUM ('open', 'bill_requested', 'closed', 'abandoned');
CREATE TYPE app.guest_status      AS ENUM ('pending_approval', 'approved', 'removed', 'left');
CREATE TYPE app.order_status      AS ENUM (
  'new',        -- poslano
  'returned',   -- vraćeno gostu na izmjenu
  'accepted',   -- prihvaćeno (ako ima order_changes -> gost vidi "Izmijenjeno")
  'preparing',  -- samo uz KDS modul
  'ready',      -- samo uz KDS modul
  'served',     -- posluženo
  'cancelled',  -- otkazalo osoblje
  'rejected',   -- odbijeno (samo ako lokal dozvoljava)
  'withdrawn'   -- gost povukao vraćenu narudžbu
);
CREATE TYPE app.order_item_status AS ENUM ('pending', 'preparing', 'ready', 'served', 'removed', 'cancelled');
CREATE TYPE app.order_source      AS ENUM ('guest_qr', 'staff');
CREATE TYPE app.order_change_type AS ENUM ('item_added', 'item_removed', 'item_replaced', 'quantity_changed', 'returned_to_guest');
CREATE TYPE app.dispute_status    AS ENUM ('open', 'confirmed', 'cancelled');
CREATE TYPE app.request_type      AS ENUM ('call_waiter', 'request_bill', 'other');
CREATE TYPE app.request_status    AS ENUM ('open', 'acknowledged', 'done', 'cancelled');
CREATE TYPE app.payment_status    AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE app.fiscal_status     AS ENUM ('not_required', 'pending', 'fiscalized', 'failed');

CREATE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- Servis na početku transakcije postavlja:
--   SET LOCAL app.venue_id = '<uuid>';  SET LOCAL app.is_super_admin = 'true'|'false';
CREATE FUNCTION app.current_venue_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.venue_id', true), '')::uuid $$;

CREATE FUNCTION app.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.is_super_admin', true), ''), 'false')::boolean $$;

-- =====================================================================
-- 1. CORE: platforma, lokali, osoblje, prostor
-- =====================================================================
CREATE TABLE core.users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext UNIQUE,                    -- obavezno samo za platformu (vidi CHECK)
  password_hash        text          NOT NULL,           -- argon2id
  full_name            varchar(120)  NOT NULL,
  phone                varchar(30),
  platform_role        app.platform_role NOT NULL DEFAULT 'none',
  must_change_password boolean       NOT NULL DEFAULT true,  -- FR-SEF-01
  mfa_enabled          boolean       NOT NULL DEFAULT false, -- FR-ADM-01
  mfa_secret_enc       text,                                 -- TOTP tajna, šifrovana
  preferred_language   varchar(5)    NOT NULL DEFAULT 'bs',
  is_active            boolean       NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CHECK (platform_role = 'none' OR email IS NOT NULL)
);

CREATE TABLE core.auth_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  refresh_token_hash text        NOT NULL UNIQUE,
  user_agent         text,
  ip_address         inet,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_sessions_user ON core.auth_sessions(user_id);

CREATE TABLE core.venues (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      varchar(40)  NOT NULL UNIQUE
                            CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name                      varchar(120) NOT NULL,
  legal_name                varchar(200),
  tax_id                    varchar(20),                     -- JIB
  vat_number                varchar(20),                     -- PDV broj
  address                   varchar(200),
  city                      varchar(80),
  postal_code               varchar(10),
  country_code              char(2)      NOT NULL DEFAULT 'BA',
  phone                     varchar(30),
  email                     citext,
  timezone                  varchar(50)  NOT NULL DEFAULT 'Europe/Sarajevo',
  currency                  char(3)      NOT NULL DEFAULT 'BAM',
  default_language          varchar(5)   NOT NULL DEFAULT 'bs',
  logo_url                  text,
  primary_color             char(7)      CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  status                    app.venue_status NOT NULL DEFAULT 'pending',
  -- PDV: jedna stopa za cijeli lokal, cijene uključuju PDV (FR-SEF-07)
  vat_rate                  numeric(5,2) NOT NULL DEFAULT 17.00 CHECK (vat_rate BETWEEN 0 AND 100),
  -- postavke šefa (FR-SEF-03..06, FR-SEF-13)
  guest_ordering_enabled    boolean      NOT NULL DEFAULT true,
  session_verification_mode app.verification_mode NOT NULL DEFAULT 'waiter', -- FR-GOS-21
  device_approval_required  boolean      NOT NULL DEFAULT true,              -- FR-GOS-22
  order_rejection_enabled   boolean      NOT NULL DEFAULT false,             -- FR-SEF-04
  shifts_enabled            boolean      NOT NULL DEFAULT false,             -- FR-SEF-06
  zone_assignment_enabled   boolean      NOT NULL DEFAULT false,             -- FR-SEF-13
  device_block_hours        smallint     NOT NULL DEFAULT 12 CHECK (device_block_hours > 0),
  kds_warning_minutes       smallint     NOT NULL DEFAULT 5,                 -- FR-KON-25
  kds_critical_minutes      smallint     NOT NULL DEFAULT 10,
  business_day_starts_at    time         NOT NULL DEFAULT '06:00',
  created_by                uuid REFERENCES core.users(id),
  created_at                timestamptz  NOT NULL DEFAULT now(),
  updated_at                timestamptz  NOT NULL DEFAULT now(),
  deleted_at                timestamptz,
  CHECK (kds_critical_minutes > kds_warning_minutes)
);

-- Katalog modula koje admin može uključiti (FR-ADM-06)
CREATE TABLE core.modules (
  code        varchar(40) PRIMARY KEY,
  name        varchar(80) NOT NULL,
  description varchar(200)
);

-- Postojanje reda = modul uključen za lokal
CREATE TABLE core.venue_modules (
  venue_id    uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  module_code varchar(40) NOT NULL REFERENCES core.modules(code),
  enabled_by  uuid        REFERENCES core.users(id),
  enabled_at  timestamptz NOT NULL DEFAULT now(),
  config      jsonb       NOT NULL DEFAULT '{}',
  PRIMARY KEY (venue_id, module_code)
);

-- Načini plaćanja po lokalu (FR-SEF-05)
CREATE TABLE core.venue_payment_methods (
  venue_id    uuid               NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  method      app.payment_method NOT NULL,
  is_enabled  boolean            NOT NULL DEFAULT true,
  is_default  boolean            NOT NULL DEFAULT false,
  sort_order  smallint           NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, method),
  CHECK (NOT is_default OR is_enabled)            -- default mora biti omogućen
);
CREATE UNIQUE INDEX uq_venue_default_payment
  ON core.venue_payment_methods(venue_id) WHERE is_default;  -- tačno jedan default

CREATE TABLE core.venue_opening_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid     NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  opens_at    time     NOT NULL,
  closes_at   time     NOT NULL,
  UNIQUE (venue_id, day_of_week, opens_at)
);

-- ---------- Uloge i ovlasti ----------
CREATE TABLE core.permissions (
  code        varchar(60) PRIMARY KEY,
  module      varchar(30) NOT NULL,
  description varchar(200) NOT NULL
);

CREATE TABLE core.venue_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  name        varchar(50) NOT NULL,
  description varchar(200),
  is_owner    boolean     NOT NULL DEFAULT false,
  is_system   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name),
  UNIQUE (id, venue_id)
);

CREATE TABLE core.role_permissions (
  role_id         uuid        NOT NULL REFERENCES core.venue_roles(id) ON DELETE CASCADE,
  permission_code varchar(60) NOT NULL REFERENCES core.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- Osoblje: nalog kreira šef, bez emaila (FR-SEF-08). Prijava: slug lokala + username.
CREATE TABLE core.venue_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  role_id      uuid        NOT NULL,
  username     citext      NOT NULL CHECK (username ~ '^[a-zA-Z0-9._-]{3,30}$'),
  display_name varchar(60),
  pin_hash     text,                          -- prijava na zajedničkom uređaju
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES core.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id),
  UNIQUE (venue_id, username),
  UNIQUE (id, venue_id),
  FOREIGN KEY (role_id, venue_id) REFERENCES core.venue_roles(id, venue_id)
);

-- Smjene: koriste se samo ako je venues.shifts_enabled (FR-KON-03)
CREATE TABLE core.shifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid          NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  member_id    uuid          NOT NULL,
  started_at   timestamptz   NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  cash_opening numeric(12,2),
  cash_closing numeric(12,2),
  note         text,
  FOREIGN KEY (member_id, venue_id) REFERENCES core.venue_members(id, venue_id),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE UNIQUE INDEX uq_shifts_open ON core.shifts(member_id) WHERE ended_at IS NULL;

-- ---------- Prostor ----------
CREATE TABLE core.areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  name        varchar(60) NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name),
  UNIQUE (id, venue_id)
);

CREATE TABLE core.tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  area_id     uuid,
  label       varchar(20) NOT NULL,
  seats       smallint    CHECK (seats > 0),
  qr_token    varchar(64) NOT NULL UNIQUE,     -- najmanje 128 bita slučajnosti (NFR-10)
  qr_version  int         NOT NULL DEFAULT 1,  -- FR-SEF-16
  pos_x       numeric(6,2),                    -- tlocrt, V3
  pos_y       numeric(6,2),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, label),
  UNIQUE (id, venue_id),
  FOREIGN KEY (area_id, venue_id) REFERENCES core.areas(id, venue_id)
);

-- Opcionalno: samo ako je venues.zone_assignment_enabled
CREATE TABLE core.member_area_assignments (
  venue_id   uuid NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL,
  area_id    uuid NOT NULL,
  PRIMARY KEY (member_id, area_id),
  FOREIGN KEY (member_id, venue_id) REFERENCES core.venue_members(id, venue_id) ON DELETE CASCADE,
  FOREIGN KEY (area_id, venue_id)   REFERENCES core.areas(id, venue_id) ON DELETE CASCADE
);

-- Koristi se samo uz KDS modul
CREATE TABLE core.prep_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid             NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  name        varchar(60)      NOT NULL,
  type        app.station_type NOT NULL DEFAULT 'bar',
  is_active   boolean          NOT NULL DEFAULT true,
  created_at  timestamptz      NOT NULL DEFAULT now(),
  updated_at  timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE TABLE core.outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id     uuid,
  event_type   varchar(80) NOT NULL,          -- 'venue.module_enabled', 'table.qr_rotated'
  aggregate_id uuid        NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX idx_core_outbox_unpublished ON core.outbox(id) WHERE published_at IS NULL;

-- =====================================================================
-- 2. CATALOG: meni
-- =====================================================================
CREATE TABLE catalog.menus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL,
  name        varchar(80) NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, venue_id)
);

CREATE TABLE catalog.menu_schedules (             -- FR-SEF-21, V2
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid     NOT NULL,
  menu_id     uuid     NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  from_time   time     NOT NULL,
  to_time     time     NOT NULL,
  FOREIGN KEY (menu_id, venue_id) REFERENCES catalog.menus(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE catalog.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL,
  menu_id     uuid        NOT NULL,
  parent_id   uuid        REFERENCES catalog.categories(id) ON DELETE CASCADE,
  name        varchar(80) NOT NULL,
  description text,
  image_url   text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, venue_id),
  FOREIGN KEY (menu_id, venue_id) REFERENCES catalog.menus(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE catalog.category_translations (      -- V2
  venue_id    uuid        NOT NULL,
  category_id uuid        NOT NULL REFERENCES catalog.categories(id) ON DELETE CASCADE,
  locale      varchar(5)  NOT NULL,
  name        varchar(80) NOT NULL,
  description text,
  PRIMARY KEY (category_id, locale)
);

-- Nema PDV kolone: stopa je na nivou lokala (core.venues.vat_rate)
CREATE TABLE catalog.items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid          NOT NULL,
  category_id     uuid          NOT NULL,
  prep_station_id uuid,                          -- -> core.prep_stations (bez FK), samo uz KDS
  sku             varchar(40),
  name            varchar(120)  NOT NULL,
  description     text,
  image_url       text,
  price           numeric(10,2) NOT NULL CHECK (price >= 0),  -- sa PDV-om
  volume_label    varchar(20),
  is_available    boolean       NOT NULL DEFAULT true,  -- "nestalo"
  is_active       boolean       NOT NULL DEFAULT true,
  sort_order      int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, venue_id),
  FOREIGN KEY (category_id, venue_id) REFERENCES catalog.categories(id, venue_id)
);
CREATE UNIQUE INDEX uq_items_sku ON catalog.items(venue_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE catalog.item_translations (          -- V2
  venue_id    uuid         NOT NULL,
  item_id     uuid         NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
  locale      varchar(5)   NOT NULL,
  name        varchar(120) NOT NULL,
  description text,
  PRIMARY KEY (item_id, locale)
);

CREATE TABLE catalog.allergens (                  -- V3, globalni katalog
  id    smallint PRIMARY KEY,
  code  varchar(30) NOT NULL UNIQUE
);

CREATE TABLE catalog.item_allergens (             -- V3
  venue_id    uuid     NOT NULL,
  item_id     uuid     NOT NULL,
  allergen_id smallint NOT NULL REFERENCES catalog.allergens(id),
  PRIMARY KEY (item_id, allergen_id),
  FOREIGN KEY (item_id, venue_id) REFERENCES catalog.items(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE catalog.modifier_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL,
  name        varchar(60) NOT NULL,
  min_select  smallint    NOT NULL DEFAULT 0,
  max_select  smallint    NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, venue_id),
  CHECK (min_select >= 0 AND max_select >= min_select AND max_select > 0)
);

CREATE TABLE catalog.modifier_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid          NOT NULL,
  group_id     uuid          NOT NULL,
  name         varchar(60)   NOT NULL,
  price_delta  numeric(10,2) NOT NULL DEFAULT 0,
  is_default   boolean       NOT NULL DEFAULT false,
  is_available boolean       NOT NULL DEFAULT true,
  sort_order   int           NOT NULL DEFAULT 0,
  UNIQUE (id, venue_id),
  FOREIGN KEY (group_id, venue_id) REFERENCES catalog.modifier_groups(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE catalog.item_modifier_groups (
  venue_id   uuid NOT NULL,
  item_id    uuid NOT NULL,
  group_id   uuid NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, group_id),
  FOREIGN KEY (item_id, venue_id)  REFERENCES catalog.items(id, venue_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, venue_id) REFERENCES catalog.modifier_groups(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE catalog.outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id     uuid        NOT NULL,
  event_type   varchar(80) NOT NULL,          -- 'item.availability_changed', 'item.price_changed'
  aggregate_id uuid        NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX idx_catalog_outbox_unpublished ON catalog.outbox(id) WHERE published_at IS NULL;

-- =====================================================================
-- 3. ORDERING: sesije, zaštita sesije, narudžbe
-- =====================================================================
CREATE TABLE ordering.table_sessions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                 uuid               NOT NULL,
  table_id                 uuid               NOT NULL,  -- -> core.tables
  table_label              varchar(20)        NOT NULL,  -- snapshot
  status                   app.session_status NOT NULL DEFAULT 'open',
  host_guest_id            uuid,                         -- FR-GOS-20 (FK dodan ispod)
  verification_code        varchar(6),                   -- PIN mod (FR-GOS-21)
  verified_at              timestamptz,
  verified_by_member_id    uuid,                         -- -> core.venue_members
  opened_at                timestamptz        NOT NULL DEFAULT now(),
  bill_requested_at        timestamptz,
  requested_payment_method app.payment_method,
  closed_at                timestamptz,
  closed_by_member_id      uuid,
  UNIQUE (id, venue_id)
);
CREATE UNIQUE INDEX uq_table_sessions_active
  ON ordering.table_sessions(table_id) WHERE status IN ('open', 'bill_requested');

-- Uređaji gostiju u sesiji (FR-GOS-20..26)
CREATE TABLE ordering.session_guests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid             NOT NULL,
  session_id            uuid             NOT NULL,
  device_hash           text             NOT NULL,        -- hash anonimnog ID-a iz cookie-ja
  nickname              varchar(30)      NOT NULL,        -- vidljivo svima za stolom (FR-GOS-24)
  locale                varchar(5),
  status                app.guest_status NOT NULL DEFAULT 'pending_approval',
  approved_by_guest_id  uuid,                             -- domaćin je odobrio
  approved_by_member_id uuid,                             -- ili konobar
  approved_at           timestamptz,
  removed_by_member_id  uuid,
  removed_at            timestamptz,
  created_at            timestamptz      NOT NULL DEFAULT now(),
  last_seen_at          timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (session_id, device_hash),
  UNIQUE (id, venue_id),
  FOREIGN KEY (session_id, venue_id) REFERENCES ordering.table_sessions(id, venue_id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_guest_id) REFERENCES ordering.session_guests(id),
  CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CHECK (status <> 'removed' OR (removed_at IS NOT NULL AND removed_by_member_id IS NOT NULL))
);
-- FR-GOS-23: jedan uređaj = jedna aktivna sesija u lokalu
CREATE UNIQUE INDEX uq_guest_one_active_session
  ON ordering.session_guests(venue_id, device_hash)
  WHERE status IN ('pending_approval', 'approved');

ALTER TABLE ordering.table_sessions
  ADD FOREIGN KEY (host_guest_id, venue_id) REFERENCES ordering.session_guests(id, venue_id);

-- FR-GOS-26 / FR-KON-17: blokada uređaja
CREATE TABLE ordering.device_blocks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             uuid        NOT NULL,
  device_hash          text        NOT NULL,
  session_id           uuid,
  blocked_by_member_id uuid        NOT NULL,
  reason               varchar(200),
  blocked_until        timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, venue_id) REFERENCES ordering.table_sessions(id, venue_id) ON DELETE SET NULL (session_id)
);
CREATE INDEX idx_device_blocks_lookup ON ordering.device_blocks(venue_id, device_hash, blocked_until);

CREATE TABLE ordering.venue_order_counters (
  venue_id      uuid NOT NULL,
  business_date date NOT NULL,
  last_number   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, business_date)
);

CREATE TABLE ordering.orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id               uuid             NOT NULL,
  session_id             uuid             NOT NULL,
  table_id               uuid             NOT NULL,     -- denormalizovano za brze upite
  business_date          date             NOT NULL,
  order_number           int              NOT NULL,
  source                 app.order_source NOT NULL DEFAULT 'guest_qr',
  idempotency_key        uuid             NOT NULL,     -- NFR-06; kod konflikta vraća se postojeća narudžba
  status                 app.order_status NOT NULL DEFAULT 'new',
  guest_id               uuid,
  created_by_member_id   uuid,                          -- ručni unos (FR-KON-12)
  accepted_by_member_id  uuid,
  guest_note             text,
  staff_message          varchar(300),                  -- poruka gostu kod izmjene/vraćanja
  -- iznosi (cijene uključuju PDV)
  total                  numeric(12,2)    NOT NULL DEFAULT 0 CHECK (total >= 0),
  vat_rate               numeric(5,2)     NOT NULL,     -- snapshot stope lokala
  vat_amount             numeric(12,2)    NOT NULL DEFAULT 0,
  -- sporna narudžba "Nije naše" (FR-GOS-25)
  dispute_status         app.dispute_status,
  disputed_by_guest_id   uuid,
  disputed_at            timestamptz,
  dispute_resolved_by    uuid,
  dispute_resolved_at    timestamptz,
  -- vremena
  created_at             timestamptz      NOT NULL DEFAULT now(),
  accepted_at            timestamptz,
  returned_at            timestamptz,
  modified_at            timestamptz,                   -- zadnja izmjena od osoblja
  ready_at               timestamptz,
  served_at              timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          varchar(200),
  updated_at             timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (venue_id, business_date, order_number),
  UNIQUE (venue_id, idempotency_key),
  UNIQUE (id, venue_id),
  FOREIGN KEY (session_id, venue_id)           REFERENCES ordering.table_sessions(id, venue_id),
  FOREIGN KEY (guest_id, venue_id)             REFERENCES ordering.session_guests(id, venue_id),
  FOREIGN KEY (disputed_by_guest_id, venue_id) REFERENCES ordering.session_guests(id, venue_id),
  CHECK ((source = 'guest_qr' AND guest_id IS NOT NULL)
      OR (source = 'staff' AND created_by_member_id IS NOT NULL)),
  CHECK ((dispute_status IS NULL) = (disputed_at IS NULL)),
  CHECK (status NOT IN ('returned', 'rejected') OR staff_message IS NOT NULL)
);
CREATE INDEX idx_orders_live ON ordering.orders(venue_id, status, created_at)
  WHERE status IN ('new', 'returned', 'accepted', 'preparing', 'ready');
CREATE INDEX idx_orders_session ON ordering.orders(session_id);
CREATE INDEX idx_orders_disputed ON ordering.orders(venue_id) WHERE dispute_status = 'open';

CREATE TABLE ordering.order_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id               uuid                  NOT NULL,
  order_id               uuid                  NOT NULL,
  item_id                uuid                  NOT NULL,  -- -> catalog.items
  prep_station_id        uuid,                            -- -> core.prep_stations, uz KDS
  -- SNAPSHOT iz kataloga u trenutku narudžbe
  item_name              varchar(120)          NOT NULL,
  category_name          varchar(80),
  unit_price             numeric(10,2)         NOT NULL,  -- cijena + dodaci, sa PDV-om
  quantity               smallint              NOT NULL CHECK (quantity > 0),
  line_total             numeric(12,2)         NOT NULL,
  note                   varchar(200),
  status                 app.order_item_status NOT NULL DEFAULT 'pending',
  added_by_member_id     uuid,                            -- FR-KON-10: stavku dodao konobar
  replaces_order_item_id uuid,                            -- FR-KON-07: zamjena
  removed_by_member_id   uuid,
  removed_reason         varchar(200),
  created_at             timestamptz           NOT NULL DEFAULT now(),
  updated_at             timestamptz           NOT NULL DEFAULT now(),
  UNIQUE (id, venue_id),
  FOREIGN KEY (order_id, venue_id) REFERENCES ordering.orders(id, venue_id) ON DELETE CASCADE,
  FOREIGN KEY (replaces_order_item_id, venue_id) REFERENCES ordering.order_items(id, venue_id),
  CHECK (line_total = unit_price * quantity),
  CHECK (status <> 'removed' OR removed_by_member_id IS NOT NULL)
);
CREATE INDEX idx_order_items_order ON ordering.order_items(order_id);
CREATE INDEX idx_order_items_kds ON ordering.order_items(venue_id, prep_station_id, status)
  WHERE status IN ('pending', 'preparing');

CREATE TABLE ordering.order_item_modifiers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id           uuid          NOT NULL,
  order_item_id      uuid          NOT NULL,
  modifier_option_id uuid,                     -- -> catalog.modifier_options
  group_name         varchar(60)   NOT NULL,   -- snapshot
  option_name        varchar(60)   NOT NULL,   -- snapshot
  price_delta        numeric(10,2) NOT NULL,   -- snapshot
  FOREIGN KEY (order_item_id, venue_id) REFERENCES ordering.order_items(id, venue_id) ON DELETE CASCADE
);
CREATE INDEX idx_oim_item ON ordering.order_item_modifiers(order_item_id);

-- Šta je osoblje promijenilo; gost to vidi (FR-GOS-11)
CREATE TABLE ordering.order_changes (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id             uuid                  NOT NULL,
  order_id             uuid                  NOT NULL,
  order_item_id        uuid,
  change_type          app.order_change_type NOT NULL,
  changed_by_member_id uuid                  NOT NULL,
  message              varchar(300),
  old_values           jsonb,
  new_values           jsonb,
  seen_by_guest_at     timestamptz,
  created_at           timestamptz           NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, venue_id)      REFERENCES ordering.orders(id, venue_id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id, venue_id) REFERENCES ordering.order_items(id, venue_id)
);
CREATE INDEX idx_order_changes_order ON ordering.order_changes(order_id);

CREATE TABLE ordering.order_status_history (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id             uuid             NOT NULL,
  order_id             uuid             NOT NULL,
  from_status          app.order_status,
  to_status            app.order_status NOT NULL,
  changed_by_member_id uuid,              -- NULL = gost ili sistem
  changed_at           timestamptz      NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, venue_id) REFERENCES ordering.orders(id, venue_id) ON DELETE CASCADE
);
CREATE INDEX idx_osh_order ON ordering.order_status_history(order_id);

CREATE TABLE ordering.service_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                 uuid               NOT NULL,
  session_id               uuid               NOT NULL,
  table_id                 uuid               NOT NULL,
  guest_id                 uuid,
  type                     app.request_type   NOT NULL,
  status                   app.request_status NOT NULL DEFAULT 'open',
  requested_payment_method app.payment_method,   -- samo za request_bill (FR-GOS-15)
  note                     varchar(200),
  handled_by_member_id     uuid,
  created_at               timestamptz        NOT NULL DEFAULT now(),
  handled_at               timestamptz,
  FOREIGN KEY (session_id, venue_id) REFERENCES ordering.table_sessions(id, venue_id),
  FOREIGN KEY (guest_id, venue_id)   REFERENCES ordering.session_guests(id, venue_id),
  CHECK (requested_payment_method IS NULL OR type = 'request_bill')
);
CREATE INDEX idx_service_requests_open ON ordering.service_requests(venue_id, created_at)
  WHERE status IN ('open', 'acknowledged');

CREATE TABLE ordering.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL,
  member_id  uuid,
  guest_id   uuid,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guest_id, venue_id) REFERENCES ordering.session_guests(id, venue_id) ON DELETE CASCADE,
  CHECK (num_nonnulls(member_id, guest_id) = 1)
);

CREATE TABLE ordering.outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id     uuid        NOT NULL,
  event_type   varchar(80) NOT NULL,          -- 'order.created', 'order.served', 'session.closed'
  aggregate_id uuid        NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX idx_ordering_outbox_unpublished ON ordering.outbox(id) WHERE published_at IS NULL;

-- Zatvaranje sesije oslobađa uređaje gostiju (da mogu skenirati drugi sto)
CREATE FUNCTION ordering.release_guests_on_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('closed', 'abandoned') AND OLD.status NOT IN ('closed', 'abandoned') THEN
    UPDATE ordering.session_guests
       SET status = 'left'
     WHERE session_id = NEW.id AND status IN ('pending_approval', 'approved');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_release_guests AFTER UPDATE OF status ON ordering.table_sessions
  FOR EACH ROW EXECUTE FUNCTION ordering.release_guests_on_close();

CREATE FUNCTION ordering.next_order_number(p_venue_id uuid, p_date date) RETURNS int
LANGUAGE sql AS $$
  INSERT INTO ordering.venue_order_counters (venue_id, business_date, last_number)
  VALUES (p_venue_id, p_date, 1)
  ON CONFLICT (venue_id, business_date)
  DO UPDATE SET last_number = ordering.venue_order_counters.last_number + 1
  RETURNING last_number;
$$;

-- =====================================================================
-- 4. BILLING: plaćanja (bez napojnica)
-- =====================================================================
CREATE TABLE billing.payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid               NOT NULL,
  session_id            uuid               NOT NULL,  -- -> ordering.table_sessions
  method                app.payment_method NOT NULL,
  status                app.payment_status NOT NULL DEFAULT 'pending',
  amount                numeric(12,2)      NOT NULL CHECK (amount >= 0),
  vat_amount            numeric(12,2)      NOT NULL DEFAULT 0,
  currency              char(3)            NOT NULL DEFAULT 'BAM',
  provider              varchar(30),                  -- online plaćanje, V2
  provider_reference    varchar(120),
  -- fiskalizacija: V3, kolone spremne (NFR-16)
  fiscal_status         app.fiscal_status  NOT NULL DEFAULT 'not_required',
  fiscal_receipt_number varchar(60),
  fiscalized_at         timestamptz,
  processed_by_member_id uuid,
  shift_id              uuid,                          -- samo ako su smjene uključene
  refunded_by_member_id uuid,
  refund_reason         varchar(200),
  created_at            timestamptz        NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  refunded_at           timestamptz,
  UNIQUE (id, venue_id),
  CHECK (status <> 'refunded' OR (refunded_at IS NOT NULL AND refunded_by_member_id IS NOT NULL))
);
CREATE INDEX idx_payments_session ON billing.payments(session_id);
CREATE INDEX idx_payments_date    ON billing.payments(venue_id, created_at);

CREATE TABLE billing.payment_items (             -- djelimična naplata, V2
  venue_id      uuid          NOT NULL,
  payment_id    uuid          NOT NULL,
  order_item_id uuid          NOT NULL,          -- -> ordering.order_items
  quantity      smallint      NOT NULL CHECK (quantity > 0),
  amount        numeric(12,2) NOT NULL,
  PRIMARY KEY (payment_id, order_item_id),
  FOREIGN KEY (payment_id, venue_id) REFERENCES billing.payments(id, venue_id) ON DELETE CASCADE
);

CREATE TABLE billing.outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id     uuid        NOT NULL,
  event_type   varchar(80) NOT NULL,          -- 'payment.completed', 'payment.refunded'
  aggregate_id uuid        NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX idx_billing_outbox_unpublished ON billing.outbox(id) WHERE published_at IS NULL;

-- =====================================================================
-- 5. AUDIT
-- =====================================================================
CREATE TABLE audit.audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id    uuid,                            -- NULL = akcija na nivou platforme
  actor_id    uuid,                            -- -> core.users
  service     varchar(30) NOT NULL,            -- koji servis je poslao događaj
  action      varchar(60) NOT NULL,            -- 'item.price_changed', 'order.cancelled'
  entity_type varchar(40) NOT NULL,
  entity_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_venue ON audit.audit_logs(venue_id, created_at DESC);

-- Audit log se ne može mijenjati ni brisati (NFR-25)
CREATE FUNCTION audit.forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs je samo za upis'; END $$;
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- =====================================================================
-- 6. REPORTING: jedna činjenica po posluženoj stavci (FR-SEF-24, 25)
--    Puni se iz događaja 'order.served' / 'order_item.cancelled'.
-- =====================================================================
CREATE TABLE reporting.order_item_facts (
  order_item_id  uuid PRIMARY KEY,
  venue_id       uuid          NOT NULL,
  order_id       uuid          NOT NULL,
  business_date  date          NOT NULL,
  served_at      timestamptz   NOT NULL,
  hour_of_day    smallint      NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week    smallint      NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  table_label    varchar(20),
  area_name      varchar(60),
  member_id      uuid,
  member_name    varchar(60),
  item_id        uuid          NOT NULL,
  item_name      varchar(120)  NOT NULL,
  category_name  varchar(80),
  quantity       smallint      NOT NULL,
  revenue        numeric(12,2) NOT NULL,
  vat_amount     numeric(12,2) NOT NULL,
  payment_method app.payment_method
);
CREATE INDEX idx_facts_venue_date ON reporting.order_item_facts(venue_id, business_date);
CREATE INDEX idx_facts_item       ON reporting.order_item_facts(venue_id, item_id, business_date);
CREATE INDEX idx_facts_member     ON reporting.order_item_facts(venue_id, member_id, business_date);

-- =====================================================================
-- 7. TRIGGERI updated_at
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'core.users','core.venues','core.venue_roles','core.venue_members','core.areas',
    'core.tables','core.prep_stations','catalog.menus','catalog.categories','catalog.items',
    'catalog.modifier_groups','ordering.orders','ordering.order_items'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %s
                    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()', t);
  END LOOP;
END $$;

-- =====================================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE core.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.venues FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.venues
  USING (id = app.current_venue_id() OR app.is_super_admin())
  WITH CHECK (id = app.current_venue_id() OR app.is_super_admin());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'core.venue_modules','core.venue_payment_methods','core.venue_opening_hours',
    'core.venue_roles','core.venue_members','core.shifts','core.areas','core.tables',
    'core.member_area_assignments','core.prep_stations',
    'catalog.menus','catalog.menu_schedules','catalog.categories','catalog.category_translations',
    'catalog.items','catalog.item_translations','catalog.item_allergens','catalog.modifier_groups',
    'catalog.modifier_options','catalog.item_modifier_groups',
    'ordering.table_sessions','ordering.session_guests','ordering.device_blocks',
    'ordering.venue_order_counters','ordering.orders','ordering.order_items',
    'ordering.order_item_modifiers','ordering.order_changes','ordering.order_status_history',
    'ordering.service_requests','ordering.push_subscriptions',
    'billing.payments','billing.payment_items',
    'reporting.order_item_facts'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s
       USING (venue_id = app.current_venue_id() OR app.is_super_admin())
       WITH CHECK (venue_id = app.current_venue_id() OR app.is_super_admin())', t);
  END LOOP;
END $$;

-- =====================================================================
-- 9. DB ROLE PO SERVISU (svaki vidi samo svoju šemu)
-- =====================================================================
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['core','catalog','ordering','billing','audit','reporting'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'svc_' || s) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', 'svc_' || s);
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA app, %I TO %I', s, 'svc_' || s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', s, 'svc_' || s);
    EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA %I TO %I', s, 'svc_' || s);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app, %I TO %I', s, 'svc_' || s);

    -- Isto i za objekte koje buduće migracije kreiraju (isti admin role)
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT %s ON TABLES TO %I',
                   s, CASE WHEN s = 'audit' THEN 'SELECT, INSERT' ELSE 'SELECT, INSERT, UPDATE, DELETE' END,
                   'svc_' || s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE ON SEQUENCES TO %I', s, 'svc_' || s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', s, 'svc_' || s);
  END LOOP;
END $$;
REVOKE UPDATE, DELETE ON audit.audit_logs FROM svc_audit;

-- =====================================================================
-- 9a. ODREĐIVANJE LOKALA PRIJE POZNATOG venue_id
--     RLS skriva sve redove dok venue_id nije postavljen, pa se slug
--     (subdomen) i QR token razrješavaju kroz ove dvije funkcije.
--     Vlasnik je role "resolver" (NOLOGIN, BYPASSRLS), koji ne posjeduje
--     ništa drugo i čita samo javne kolone. Poziva ih samo svc_core;
--     ostali moduli dobijaju ove podatke preko javnog interfejsa core-a.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resolver') THEN
    CREATE ROLE resolver NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app, core TO resolver;
GRANT SELECT (id, slug, name, status, logo_url, primary_color, default_language,
              currency, timezone, guest_ordering_enabled, deleted_at)
  ON core.venues TO resolver;
GRANT SELECT (id, venue_id, label, qr_token, qr_version, is_active)
  ON core.tables TO resolver;

-- Javni podaci lokala po slugu (subdomenu). Status vraća, a odluku o
-- tome da li lokal prima narudžbe donosi servis (FR-ADM-04, FR-GOS-03).
CREATE FUNCTION core.resolve_venue(p_slug text)
RETURNS TABLE (
  venue_id               uuid,
  slug                   varchar,
  name                   varchar,
  status                 app.venue_status,
  logo_url               text,
  primary_color          char(7),
  default_language       varchar,
  currency               char(3),
  timezone               varchar,
  guest_ordering_enabled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT v.id, v.slug, v.name, v.status, v.logo_url, v.primary_color,
         v.default_language, v.currency, v.timezone, v.guest_ordering_enabled
    FROM core.venues v
   WHERE v.slug = p_slug
     AND v.deleted_at IS NULL
$$;

-- Sto po QR tokenu (FR-GOS-01, FR-GOS-02). Poništen token ne postoji više,
-- pa vraća 0 redova. venue_slug služi da se provjeri da QR pripada lokalu
-- sa čijeg subdomena je stigao zahtjev.
CREATE FUNCTION core.resolve_table(p_qr_token text)
RETURNS TABLE (
  table_id     uuid,
  venue_id     uuid,
  venue_slug   varchar,
  venue_status app.venue_status,
  table_label  varchar,
  qr_version   int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT t.id, t.venue_id, v.slug, v.status, t.label, t.qr_version
    FROM core.tables t
    JOIN core.venues v ON v.id = t.venue_id
   WHERE t.qr_token = p_qr_token
     AND t.is_active
     AND v.deleted_at IS NULL
$$;

ALTER FUNCTION core.resolve_venue(text) OWNER TO resolver;
ALTER FUNCTION core.resolve_table(text) OWNER TO resolver;
REVOKE ALL ON FUNCTION core.resolve_venue(text), core.resolve_table(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.resolve_venue(text), core.resolve_table(text) TO svc_core;

-- =====================================================================
-- 10. POČETNI PODACI
-- =====================================================================
INSERT INTO core.modules (code, name, description) VALUES
  ('kds',             'Šank i kuhinja (KDS)', 'Prikaz stavki po stanici pripreme'),
  ('online_payments', 'Online plaćanje',      'Plaćanje karticom preko telefona gosta'),
  ('translations',    'Višejezični meni',     'Prevodi menija za goste');

INSERT INTO core.permissions (code, module, description) VALUES
  ('venue.settings',    'venue',    'Postavke lokala, PDV i načini plaćanja'),
  ('staff.manage',      'staff',    'Kreiranje naloga osoblja i uloga'),
  ('tables.manage',     'tables',   'Zone, stolovi i QR kodovi'),
  ('menu.edit',         'menu',     'Uređivanje menija'),
  ('menu.availability', 'menu',     'Označavanje artikla kao nedostupnog'),
  ('orders.view',       'orders',   'Pregled narudžbi'),
  ('orders.view_all',   'orders',   'Pregled narudžbi svih zona'),
  ('orders.create',     'orders',   'Ručni unos narudžbe'),
  ('orders.update',     'orders',   'Prihvatanje, izmjena i statusi narudžbe'),
  ('orders.add_items',  'orders',   'Dodavanje stavki na postojeću narudžbu'),
  ('orders.return',     'orders',   'Vraćanje narudžbe gostu na izmjenu'),
  ('orders.reject',     'orders',   'Odbijanje narudžbe (ako lokal dozvoljava)'),
  ('orders.cancel',     'orders',   'Otkazivanje narudžbe ili stavke'),
  ('orders.disputes',   'orders',   'Rješavanje spornih narudžbi'),
  ('sessions.verify',   'sessions', 'Potvrda sesije i novih uređaja'),
  ('sessions.remove',   'sessions', 'Uklanjanje i blokada uređaja'),
  ('sessions.close',    'sessions', 'Zatvaranje stola'),
  ('payments.process',  'payments', 'Naplata'),
  ('payments.refund',   'payments', 'Povrat novca'),
  ('reports.view',      'reports',  'Izvještaji i izvoz'),
  ('shifts.manage',     'shifts',   'Pregled tuđih smjena');

INSERT INTO catalog.allergens (id, code) VALUES
  (1,'gluten'),(2,'crustaceans'),(3,'eggs'),(4,'fish'),(5,'peanuts'),(6,'soy'),(7,'milk'),
  (8,'nuts'),(9,'celery'),(10,'mustard'),(11,'sesame'),(12,'sulphites'),(13,'lupin'),(14,'molluscs');

-- Poziva core servis pri kreiranju lokala (FR-ADM-03, FR-SEF-05)
CREATE FUNCTION core.init_venue(p_venue_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_owner uuid; v_waiter uuid;
BEGIN
  INSERT INTO core.venue_roles (venue_id, name, is_owner, is_system)
  VALUES (p_venue_id, 'Šef', true, true) RETURNING id INTO v_owner;
  INSERT INTO core.role_permissions SELECT v_owner, code FROM core.permissions;

  INSERT INTO core.venue_roles (venue_id, name, is_system)
  VALUES (p_venue_id, 'Konobar', true) RETURNING id INTO v_waiter;
  INSERT INTO core.role_permissions
  SELECT v_waiter, unnest(ARRAY[
    'menu.availability','orders.view','orders.create','orders.update','orders.add_items',
    'orders.return','sessions.verify','sessions.remove','sessions.close','payments.process'
  ]);

  INSERT INTO core.venue_payment_methods (venue_id, method, is_enabled, is_default, sort_order)
  VALUES (p_venue_id, 'cash', true, true, 0),
         (p_venue_id, 'card', false, false, 1);
END $$;
GRANT EXECUTE ON FUNCTION core.init_venue(uuid) TO svc_core;
GRANT EXECUTE ON FUNCTION ordering.next_order_number(uuid, date) TO svc_ordering;

-- migrate:down
DROP SCHEMA IF EXISTS reporting, audit, billing, ordering, catalog, core, app CASCADE;
DROP ROLE IF EXISTS resolver;
-- svc_* role kreira infra/postgres/init i ovdje se ne brišu.
