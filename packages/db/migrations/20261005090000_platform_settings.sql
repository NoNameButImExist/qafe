-- Platform settings the super admin changes in the admin panel: the colour theme of the
-- admin, panel and staff apps, and the SMTP server for e-mail. One row per key; the value is
-- validated by the API (Zod in @qafe/contracts) before it is written. Secrets (the SMTP
-- password) are stored encrypted with SETTINGS_ENCRYPTION_KEY, never in plain text.
-- Not per venue, so no RLS; only svc_core (and its platform role) can read or write it.

-- migrate:up
CREATE TABLE core.platform_settings (
  key        varchar(40) PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        REFERENCES core.users(id) ON DELETE SET NULL
);

INSERT INTO core.platform_settings (key, value) VALUES ('theme', '{"brand": "warm"}');

-- migrate:down
DROP TABLE core.platform_settings;
