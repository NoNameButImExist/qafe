-- Indexes that start with venue_id for tables read per venue. With the RLS policies now plain
-- "venue_id = current venue" (20261003100000), these let a venue's query read only its own
-- rows; the load test showed open tables being found by scanning every venue's sessions.
-- Child tables (order changes, item modifiers, status history, payment items) are read by
-- their parent's id and already have that index.

-- migrate:up
CREATE INDEX idx_sessions_venue_open ON ordering.table_sessions (venue_id)
  WHERE status IN ('open', 'bill_requested');
CREATE INDEX idx_sessions_venue_opened ON ordering.table_sessions (venue_id, opened_at DESC);
CREATE INDEX idx_push_subscriptions_venue ON ordering.push_subscriptions (venue_id);
CREATE INDEX idx_menus_venue ON catalog.menus (venue_id);
CREATE INDEX idx_categories_venue ON catalog.categories (venue_id, sort_order);
CREATE INDEX idx_modifier_groups_venue ON catalog.modifier_groups (venue_id);
CREATE INDEX idx_modifier_options_venue ON catalog.modifier_options (venue_id);
CREATE INDEX idx_item_modifier_groups_venue ON catalog.item_modifier_groups (venue_id);
CREATE INDEX idx_shifts_venue ON core.shifts (venue_id);
CREATE INDEX idx_member_areas_venue ON core.member_area_assignments (venue_id);

-- migrate:down
DROP INDEX ordering.idx_sessions_venue_open;
DROP INDEX ordering.idx_sessions_venue_opened;
DROP INDEX ordering.idx_push_subscriptions_venue;
DROP INDEX catalog.idx_menus_venue;
DROP INDEX catalog.idx_categories_venue;
DROP INDEX catalog.idx_modifier_groups_venue;
DROP INDEX catalog.idx_modifier_options_venue;
DROP INDEX catalog.idx_item_modifier_groups_venue;
DROP INDEX core.idx_shifts_venue;
DROP INDEX core.idx_member_areas_venue;
