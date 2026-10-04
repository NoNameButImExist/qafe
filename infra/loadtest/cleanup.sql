-- Removes every load test venue ("lt-*") with everything that belongs to it.
-- (Audit log entries stay: the log is append-only.)
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.is_super_admin', 'true', true);
CREATE TEMP TABLE lt_users AS
SELECT m.user_id FROM core.venue_members m JOIN core.venues v ON v.id = m.venue_id
WHERE v.slug LIKE 'lt-%';
DO $$
DECLARE vid uuid; t record; pass int; left_ int;
BEGIN
  FOR vid IN SELECT id FROM core.venues WHERE slug LIKE 'lt-%' LOOP
    FOR pass IN 1..12 LOOP
      left_ := 0;
      FOR t IN SELECT c.table_schema s, c.table_name n FROM information_schema.columns c
               JOIN information_schema.tables x
                 ON x.table_schema = c.table_schema AND x.table_name = c.table_name
               WHERE c.column_name = 'venue_id' AND x.table_type = 'BASE TABLE'
                 AND c.table_schema IN ('core', 'catalog', 'ordering', 'billing', 'reporting')
                 AND (c.table_schema, c.table_name) <> ('core', 'venues')
                 AND NOT EXISTS (SELECT 1 FROM pg_inherits i
                                 WHERE i.inhrelid = format('%I.%I', c.table_schema, c.table_name)::regclass)
      LOOP
        BEGIN
          EXECUTE format('DELETE FROM %I.%I WHERE venue_id = $1', t.s, t.n) USING vid;
        EXCEPTION WHEN foreign_key_violation THEN left_ := left_ + 1;
        END;
      END LOOP;
      EXIT WHEN left_ = 0;
    END LOOP;
    DELETE FROM core.venues WHERE id = vid;
  END LOOP;
END $$;
DELETE FROM core.auth_sessions WHERE user_id IN (SELECT user_id FROM lt_users);
DELETE FROM core.users WHERE id IN (SELECT user_id FROM lt_users);
COMMIT;
