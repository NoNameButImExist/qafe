-- RLS that indexes can serve. The policies were
--   venue_id = app.current_venue_id() OR app.is_super_admin()
-- and the OR keeps Postgres from using any venue_id index: every query read the rows of every
-- venue and filtered them (the load test found it). Now:
--   tenant_isolation: venue_id = app.current_venue_id()          (indexable)
-- and platform-level work (admin screens, worker jobs) runs as svc_<module>_platform, a role
-- with BYPASSRLS and exactly the privileges of svc_<module>. TenantDatabase.withTenant switches
-- to it with SET LOCAL ROLE only when the context says isSuperAdmin, so the trust boundary is
-- the same as before (the app.is_super_admin setting), but tenant queries become index scans.
-- The platform roles cannot log in; only their module role may switch to them.

-- migrate:up

DO $$
DECLARE
  m text;
  svc text;
  platform text;
  r record;
BEGIN
  FOREACH m IN ARRAY ARRAY['core', 'catalog', 'ordering', 'billing', 'audit', 'reporting'] LOOP
    svc := 'svc_' || m;
    platform := svc || '_platform';
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = platform) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN BYPASSRLS', platform);
    END IF;
    -- The module role may switch to it (SET ROLE) but does not inherit BYPASSRLS: role
    -- attributes are never inherited, they apply only after SET ROLE.
    EXECUTE format('GRANT %I TO %I', platform, svc);

    -- Same privileges as the module role, object by object.
    FOR r IN SELECT n.nspname FROM pg_namespace n
             WHERE has_schema_privilege(svc, n.oid, 'USAGE') AND n.nspname NOT LIKE 'pg_%'
               AND n.nspname <> 'information_schema' LOOP
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.nspname, platform);
    END LOOP;
    FOR r IN SELECT c.oid::regclass AS rel, p.priv
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
             WHERE c.relkind IN ('r', 'p', 'v')
               AND n.nspname IN ('core', 'catalog', 'ordering', 'billing', 'audit', 'reporting', 'app')
               AND has_table_privilege(svc, c.oid, p.priv) LOOP
      EXECUTE format('GRANT %s ON %s TO %I', r.priv, r.rel, platform);
    END LOOP;
    FOR r IN SELECT c.oid::regclass AS rel FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'S' AND n.nspname IN ('core', 'catalog', 'ordering', 'billing', 'audit', 'reporting')
               -- CASE: the check raises an error for anything that is not a sequence.
               AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(svc, c.oid, 'USAGE') ELSE false END LOOP
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO %I', r.rel, platform);
    END LOOP;
    FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname IN ('core', 'catalog', 'ordering', 'billing', 'audit', 'reporting', 'app')
               AND has_function_privilege(svc, p.oid, 'EXECUTE') LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', r.fn, platform);
    END LOOP;

    -- And for objects later migrations create (same rule as the module role: audit append-only).
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT %s ON TABLES TO %I', m,
                   CASE WHEN m = 'audit' THEN 'SELECT, INSERT' ELSE 'SELECT, INSERT, UPDATE, DELETE' END,
                   platform);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE ON SEQUENCES TO %I', m, platform);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', m, platform);
  END LOOP;
END $$;

-- Policies without the OR. core.venues filters on its own id.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename FROM pg_policies WHERE policyname = 'tenant_isolation' LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %I.%I', p.schemaname, p.tablename);
    IF (p.schemaname, p.tablename) = ('core', 'venues') THEN
      EXECUTE 'CREATE POLICY tenant_isolation ON core.venues
                 USING (id = app.current_venue_id()) WITH CHECK (id = app.current_venue_id())';
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I
                        USING (venue_id = app.current_venue_id())
                        WITH CHECK (venue_id = app.current_venue_id())', p.schemaname, p.tablename);
    END IF;
  END LOOP;
END $$;

-- migrate:down

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename FROM pg_policies WHERE policyname = 'tenant_isolation' LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %I.%I', p.schemaname, p.tablename);
    IF (p.schemaname, p.tablename) = ('core', 'venues') THEN
      EXECUTE 'CREATE POLICY tenant_isolation ON core.venues
                 USING (id = app.current_venue_id() OR app.is_super_admin())
                 WITH CHECK (id = app.current_venue_id() OR app.is_super_admin())';
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I
                        USING (venue_id = app.current_venue_id() OR app.is_super_admin())
                        WITH CHECK (venue_id = app.current_venue_id() OR app.is_super_admin())',
                     p.schemaname, p.tablename);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE m text; platform text;
BEGIN
  FOREACH m IN ARRAY ARRAY['core', 'catalog', 'ordering', 'billing', 'audit', 'reporting'] LOOP
    platform := 'svc_' || m || '_platform';
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', m, platform);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', m, platform);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', m, platform);
    EXECUTE format('DROP OWNED BY %I', platform);
    EXECUTE format('DROP ROLE %I', platform);
  END LOOP;
END $$;
