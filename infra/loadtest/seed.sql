-- Load test data: :venues venues "lt-001".. with :tables tables each, a 12-item menu and an
-- owner account "lt.sef" (password hash in :hash). Remove with cleanup.sql.
--   psql -v venues=20 -v tables=10 -v hash='$argon2id$...' -f seed.sql
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.is_super_admin', 'true', true);

CREATE TEMP TABLE lt AS
SELECT gen_random_uuid() AS id, 'lt-' || lpad(n::text, 3, '0') AS slug, n
FROM generate_series(1, :venues) n;

INSERT INTO core.venues (id, slug, name, status)
SELECT id, slug, 'Load test ' || n, 'active' FROM lt;
SELECT core.init_venue(id) FROM lt;

WITH u AS (
  INSERT INTO core.users (password_hash, full_name, must_change_password)
  SELECT :'hash', 'LT Šef ' || n, false FROM lt RETURNING id, full_name
)
INSERT INTO core.venue_members (venue_id, user_id, role_id, username, display_name)
SELECT lt.id, u.id, r.id, 'lt.sef', 'LT'
FROM lt JOIN u ON u.full_name = 'LT Šef ' || lt.n
JOIN core.venue_roles r ON r.venue_id = lt.id AND r.name = 'Šef';

WITH a AS (INSERT INTO core.areas (venue_id, name) SELECT id, 'Sala' FROM lt RETURNING id, venue_id)
INSERT INTO core.tables (venue_id, area_id, label, seats, qr_token)
SELECT a.venue_id, a.id, t::text, 4, lt.slug || '-table-' || lpad(t::text, 3, '0') || '-loadtest'
FROM a JOIN lt ON lt.id = a.venue_id, generate_series(1, :tables) t;

WITH m AS (INSERT INTO catalog.menus (venue_id, name) SELECT id, 'Meni' FROM lt RETURNING id, venue_id),
c AS (
  INSERT INTO catalog.categories (venue_id, menu_id, name, sort_order)
  SELECT m.venue_id, m.id, x.name, x.ord FROM m, (VALUES ('Kafe', 1), ('Sokovi', 2), ('Kolači', 3)) x(name, ord)
  RETURNING id, venue_id, name
)
INSERT INTO catalog.items (venue_id, category_id, name, price, sort_order, is_available)
SELECT c.venue_id, c.id, c.name || ' ' || i, (1.5 + i * 0.5)::numeric(10,2), i, true
FROM c, generate_series(1, 4) i;

COMMIT;
SELECT count(*) || ' venues, ' || :tables || ' tables each' FROM core.venues WHERE slug LIKE 'lt-%';
