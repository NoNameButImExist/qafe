-- Staff sign-in (FR-SEF-01, FR-KON-01): a refresh session belongs to one venue membership,
-- so refreshing can set the venue's RLS context without looking the member up first.
-- Platform admin sessions leave both columns NULL.

-- migrate:up
ALTER TABLE core.auth_sessions
  ADD COLUMN venue_id  uuid,
  ADD COLUMN member_id uuid,
  ADD CONSTRAINT fk_auth_sessions_member
    FOREIGN KEY (member_id, venue_id) REFERENCES core.venue_members(id, venue_id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_auth_sessions_member CHECK ((venue_id IS NULL) = (member_id IS NULL));

CREATE INDEX idx_auth_sessions_member ON core.auth_sessions(member_id) WHERE member_id IS NOT NULL;

-- migrate:down
DROP INDEX core.idx_auth_sessions_member;
ALTER TABLE core.auth_sessions
  DROP CONSTRAINT ck_auth_sessions_member,
  DROP CONSTRAINT fk_auth_sessions_member,
  DROP COLUMN member_id,
  DROP COLUMN venue_id;
