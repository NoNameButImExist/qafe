-- Wi-Fi verification (FR-GOS-28): a guest whose request comes from the venue's own network
-- (its public IP address, seen by the api) is taken as sitting in the venue, so the table is
-- confirmed without a waiter or a PIN. The owner turns it on and lists the networks.

-- migrate:up
ALTER TABLE core.venues
  ADD COLUMN wifi_verification_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE core.venue_networks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES core.venues(id) ON DELETE CASCADE,
  -- One address (/32, /128) or a range; matched with network >>= client_ip.
  network    cidr        NOT NULL,
  label      varchar(60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, network)
);

ALTER TABLE core.venue_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.venue_networks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.venue_networks
  USING (venue_id = app.current_venue_id() OR app.is_super_admin())
  WITH CHECK (venue_id = app.current_venue_id() OR app.is_super_admin());

-- migrate:down
DROP TABLE core.venue_networks;
ALTER TABLE core.venues DROP COLUMN wifi_verification_enabled;
