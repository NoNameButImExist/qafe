-- Growth: with many venues the audit log and the sales facts reach hundreds of millions of
-- rows. Both become tables partitioned by month, so a query for recent days reads only the
-- newest partitions and old months can be archived and detached without deleting rows.
--
-- audit.audit_logs: partition key created_at, the time the event happened in its module (the
-- worker copies it from the outbox row), so a retry of the same event lands in the same
-- partition and UNIQUE (event_id, created_at) still makes writes idempotent.
--
-- reporting.order_item_facts: partition key business_date; the primary key becomes
-- (order_item_id, business_date). The date comes from the settled event, so retries match.
--
-- Small lookup tables give the admin filters without scanning the log:
-- audit.actions, audit.actor_labels, audit.venue_labels (kept current by the worker).
--
-- app.ensure_month_partitions(table, from, months) creates missing monthly partitions; the
-- worker calls it every night for the next 3 months. A DEFAULT partition catches anything
-- outside them, so a write never fails for lack of a partition.

-- migrate:up

-- SECURITY DEFINER: only the owner of a table may add partitions to it, and the module roles
-- do not own their tables. The function therefore accepts only these two tables.
CREATE FUNCTION app.ensure_month_partitions(parent regclass, from_month date, months int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  created int := 0;
  m date;
  part text;
  parent_schema text;
  parent_name text;
BEGIN
  IF parent NOT IN ('audit.audit_logs'::regclass, 'reporting.order_item_facts'::regclass) THEN
    RAISE EXCEPTION 'ensure_month_partitions: % is not a partitioned log table', parent;
  END IF;
  IF months < 1 OR months > 24 THEN
    RAISE EXCEPTION 'ensure_month_partitions: months must be 1..24';
  END IF;
  SELECT n.nspname, c.relname INTO parent_schema, parent_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = parent;
  FOR i IN 0 .. months - 1 LOOP
    m := (date_trunc('month', from_month) + make_interval(months => i))::date;
    part := format('%s_%s', parent_name, to_char(m, 'YYYY_MM'));
    IF to_regclass(format('%I.%I', parent_schema, part)) IS NULL THEN
      EXECUTE format('CREATE TABLE %I.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
                     parent_schema, part, parent, m, (m + interval '1 month')::date);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;

-- ---------------------------------------------------------------- audit.audit_logs

ALTER TABLE audit.audit_logs RENAME TO audit_logs_old;
ALTER INDEX audit.idx_audit_venue RENAME TO idx_audit_venue_old;
ALTER INDEX audit.idx_audit_actor RENAME TO idx_audit_actor_old;
ALTER INDEX audit.idx_audit_action RENAME TO idx_audit_action_old;
ALTER TABLE audit.audit_logs_old RENAME CONSTRAINT uq_audit_event TO uq_audit_event_old;
ALTER TABLE audit.audit_logs_old RENAME CONSTRAINT audit_logs_pkey TO audit_logs_old_pkey;

CREATE TABLE audit.audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  venue_id    uuid,
  actor_id    uuid,
  service     varchar(30) NOT NULL,
  action      varchar(60) NOT NULL,
  entity_type varchar(40) NOT NULL,
  entity_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now(),
  event_id    varchar(80),
  actor_label varchar(200),
  venue_label varchar(160),
  PRIMARY KEY (id, created_at),
  CONSTRAINT uq_audit_event UNIQUE (event_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_created ON audit.audit_logs (created_at DESC, id DESC);
CREATE INDEX idx_audit_venue   ON audit.audit_logs (venue_id, created_at DESC);
CREATE INDEX idx_audit_actor   ON audit.audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit.audit_logs (action, created_at DESC);

CREATE TABLE audit.audit_logs_default PARTITION OF audit.audit_logs DEFAULT;

-- Months that already have entries, and the current one plus the next three.
DO $$
DECLARE first_month date;
BEGIN
  SELECT coalesce(min(created_at), now())::date INTO first_month FROM audit.audit_logs_old;
  PERFORM app.ensure_month_partitions('audit.audit_logs', first_month,
    (extract(year FROM age(date_trunc('month', now()), date_trunc('month', first_month))) * 12
     + extract(month FROM age(date_trunc('month', now()), date_trunc('month', first_month))))::int + 4);
END $$;

INSERT INTO audit.audit_logs (id, venue_id, actor_id, service, action, entity_type, entity_id,
                              old_values, new_values, ip_address, created_at, event_id,
                              actor_label, venue_label)
OVERRIDING SYSTEM VALUE
SELECT id, venue_id, actor_id, service, action, entity_type, entity_id, old_values, new_values,
       ip_address, created_at, event_id, actor_label, venue_label
FROM audit.audit_logs_old;

SELECT setval(pg_get_serial_sequence('audit.audit_logs', 'id'),
              coalesce((SELECT max(id) FROM audit.audit_logs), 0) + 1, false);

-- The log is append-only (NFR-25). Old months leave as whole partitions (archived to S3 and
-- detached by the backup service), never row by row.
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- Filter values for the admin screen; one row each, upserted by the worker.
CREATE TABLE audit.actions (
  action     varchar(60) PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit.actor_labels (
  actor_id   uuid PRIMARY KEY,
  label      varchar(200) NOT NULL,
  updated_at timestamptz  NOT NULL
);
CREATE TABLE audit.venue_labels (
  venue_id   uuid PRIMARY KEY,
  label      varchar(160) NOT NULL,
  updated_at timestamptz  NOT NULL
);

INSERT INTO audit.actions (action, first_seen)
SELECT action, min(created_at) FROM audit.audit_logs GROUP BY action;
INSERT INTO audit.actor_labels (actor_id, label, updated_at)
SELECT DISTINCT ON (actor_id) actor_id, actor_label, created_at FROM audit.audit_logs
WHERE actor_id IS NOT NULL AND actor_label IS NOT NULL ORDER BY actor_id, created_at DESC;
INSERT INTO audit.venue_labels (venue_id, label, updated_at)
SELECT DISTINCT ON (venue_id) venue_id, venue_label, created_at FROM audit.audit_logs
WHERE venue_id IS NOT NULL AND venue_label IS NOT NULL ORDER BY venue_id, created_at DESC;

-- The immutability trigger fires on rows, not on DROP TABLE.
DROP TABLE audit.audit_logs_old;

GRANT SELECT, INSERT ON audit.audit_logs TO svc_audit;
GRANT SELECT, INSERT, UPDATE ON audit.actions, audit.actor_labels, audit.venue_labels TO svc_audit;
REVOKE EXECUTE ON FUNCTION app.ensure_month_partitions(regclass, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_month_partitions(regclass, date, int) TO svc_audit, svc_reporting;

-- ---------------------------------------------------------------- reporting.order_item_facts

ALTER TABLE reporting.order_item_facts RENAME TO order_item_facts_old;
ALTER INDEX reporting.idx_facts_venue_date RENAME TO idx_facts_venue_date_old;
ALTER INDEX reporting.idx_facts_item RENAME TO idx_facts_item_old;
ALTER INDEX reporting.idx_facts_member RENAME TO idx_facts_member_old;
ALTER TABLE reporting.order_item_facts_old
  RENAME CONSTRAINT order_item_facts_pkey TO order_item_facts_old_pkey;
DROP POLICY tenant_isolation ON reporting.order_item_facts_old;

CREATE TABLE reporting.order_item_facts (
  order_item_id  uuid          NOT NULL,
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
  payment_method app.payment_method,
  PRIMARY KEY (order_item_id, business_date)
) PARTITION BY RANGE (business_date);

CREATE INDEX idx_facts_venue_date ON reporting.order_item_facts (venue_id, business_date);
CREATE INDEX idx_facts_item       ON reporting.order_item_facts (venue_id, item_id, business_date);
CREATE INDEX idx_facts_member     ON reporting.order_item_facts (venue_id, member_id, business_date);

CREATE TABLE reporting.order_item_facts_default PARTITION OF reporting.order_item_facts DEFAULT;

DO $$
DECLARE first_month date;
BEGIN
  SELECT coalesce(min(business_date), now()::date) INTO first_month
  FROM reporting.order_item_facts_old;
  PERFORM app.ensure_month_partitions('reporting.order_item_facts', first_month,
    (extract(year FROM age(date_trunc('month', now()), date_trunc('month', first_month))) * 12
     + extract(month FROM age(date_trunc('month', now()), date_trunc('month', first_month))))::int + 4);
END $$;

INSERT INTO reporting.order_item_facts SELECT * FROM reporting.order_item_facts_old;
DROP TABLE reporting.order_item_facts_old;

ALTER TABLE reporting.order_item_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting.order_item_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reporting.order_item_facts
  USING (venue_id = app.current_venue_id() OR app.is_super_admin())
  WITH CHECK (venue_id = app.current_venue_id() OR app.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON reporting.order_item_facts TO svc_reporting;

-- migrate:down

DROP TABLE audit.actions, audit.actor_labels, audit.venue_labels;

ALTER TABLE audit.audit_logs RENAME TO audit_logs_part;
ALTER TABLE audit.audit_logs_part RENAME CONSTRAINT uq_audit_event TO uq_audit_event_part;
ALTER TABLE audit.audit_logs_part RENAME CONSTRAINT audit_logs_pkey TO audit_logs_part_pkey;
CREATE TABLE audit.audit_logs (LIKE audit.audit_logs_part INCLUDING DEFAULTS);
ALTER TABLE audit.audit_logs ALTER COLUMN id DROP DEFAULT;
INSERT INTO audit.audit_logs SELECT * FROM audit.audit_logs_part;
ALTER TABLE audit.audit_logs ADD PRIMARY KEY (id);
ALTER TABLE audit.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
SELECT setval(pg_get_serial_sequence('audit.audit_logs', 'id'),
              coalesce((SELECT max(id) FROM audit.audit_logs), 0) + 1, false);
ALTER TABLE audit.audit_logs ADD CONSTRAINT uq_audit_event UNIQUE (event_id);
DROP TABLE audit.audit_logs_part;
CREATE INDEX idx_audit_venue  ON audit.audit_logs (venue_id, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit.audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit.audit_logs (action, created_at DESC);
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();
GRANT SELECT, INSERT ON audit.audit_logs TO svc_audit;

ALTER TABLE reporting.order_item_facts RENAME TO order_item_facts_part;
ALTER TABLE reporting.order_item_facts_part
  RENAME CONSTRAINT order_item_facts_pkey TO order_item_facts_part_pkey;
CREATE TABLE reporting.order_item_facts (LIKE reporting.order_item_facts_part INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
INSERT INTO reporting.order_item_facts SELECT * FROM reporting.order_item_facts_part;
DROP TABLE reporting.order_item_facts_part;
ALTER TABLE reporting.order_item_facts ADD PRIMARY KEY (order_item_id);
CREATE INDEX idx_facts_venue_date ON reporting.order_item_facts (venue_id, business_date);
CREATE INDEX idx_facts_item       ON reporting.order_item_facts (venue_id, item_id, business_date);
CREATE INDEX idx_facts_member     ON reporting.order_item_facts (venue_id, member_id, business_date);
ALTER TABLE reporting.order_item_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting.order_item_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reporting.order_item_facts
  USING (venue_id = app.current_venue_id() OR app.is_super_admin())
  WITH CHECK (venue_id = app.current_venue_id() OR app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON reporting.order_item_facts TO svc_reporting;

DROP FUNCTION app.ensure_month_partitions(regclass, date, int);
