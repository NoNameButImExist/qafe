-- V2 at the table (FR-KON-14, FR-KON-20).
-- merged_into_session_id: a table merged into another one is closed and points to the session
--   that took over its orders, devices and requests (history and audit stay readable).
-- paid_amount: what partial payments have covered so far. Billing keeps the details (which
--   items, which method) in billing.payment_items; ordering keeps only this sum, through its
--   public SessionLedger, so the bill views can show "paid so far" and the remainder without
--   reading another module's schema. The final payment covers exactly total - paid_amount.

-- migrate:up
ALTER TABLE ordering.table_sessions
  ADD COLUMN merged_into_session_id uuid REFERENCES ordering.table_sessions(id),
  ADD COLUMN paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);

-- migrate:down
ALTER TABLE ordering.table_sessions
  DROP COLUMN paid_amount,
  DROP COLUMN merged_into_session_id;
