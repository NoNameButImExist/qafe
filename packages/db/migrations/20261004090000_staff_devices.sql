-- PIN sign-in on a shared device of the venue (FR-KON-01). The owner links a device (a tablet
-- at the bar, the kitchen screen) once while signed in; the device keeps a long random token in
-- an httpOnly cookie, and only its hash is stored here. On a linked device staff sign in with
-- their name and PIN (core.venue_members.pin_hash). Revoking the row ends PIN sign-in there.

-- migrate:up
CREATE TABLE core.staff_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  name         varchar(60) NOT NULL,
  -- sha256 of the device token (base64url); the token itself never reaches the database.
  token_hash   varchar(64) NOT NULL UNIQUE,
  created_by   uuid        REFERENCES core.venue_members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX idx_staff_devices_venue ON core.staff_devices (venue_id) WHERE revoked_at IS NULL;

ALTER TABLE core.staff_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.staff_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.staff_devices
  USING (venue_id = app.current_venue_id())
  WITH CHECK (venue_id = app.current_venue_id());

-- A device presents only its token: find its venue before venue_id is known (like
-- core.resolve_venue), as the resolver role, for svc_core only.
CREATE FUNCTION core.resolve_staff_device(p_token_hash text)
RETURNS TABLE (device_id uuid, venue_id uuid, device_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT d.id, d.venue_id, d.name::text
  FROM core.staff_devices d
  WHERE d.token_hash = p_token_hash AND d.revoked_at IS NULL
$$;
GRANT SELECT (id, venue_id, name, token_hash, revoked_at) ON core.staff_devices TO resolver;
ALTER FUNCTION core.resolve_staff_device(text) OWNER TO resolver;
REVOKE EXECUTE ON FUNCTION core.resolve_staff_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.resolve_staff_device(text) TO svc_core, svc_core_platform;

-- migrate:down
DROP FUNCTION core.resolve_staff_device(text);
DROP TABLE core.staff_devices;
