-- Audit log fed by the outbox relay (FR-ADM-10, NFR-25).
--   event_id     "<schema>:<outbox id>"; unique, so a redelivered event is written once.
--   actor_label  name of the actor at the time of the action (users can be renamed or deleted).
--   venue_label  name of the venue at the time of the action.

-- migrate:up
ALTER TABLE audit.audit_logs
  ADD COLUMN event_id    varchar(80),
  ADD COLUMN actor_label varchar(200),
  ADD COLUMN venue_label varchar(160),
  ADD CONSTRAINT uq_audit_event UNIQUE (event_id);

CREATE INDEX idx_audit_actor  ON audit.audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit.audit_logs(action, created_at DESC);

-- migrate:down
DROP INDEX audit.idx_audit_action;
DROP INDEX audit.idx_audit_actor;
ALTER TABLE audit.audit_logs
  DROP CONSTRAINT uq_audit_event,
  DROP COLUMN venue_label,
  DROP COLUMN actor_label,
  DROP COLUMN event_id;
