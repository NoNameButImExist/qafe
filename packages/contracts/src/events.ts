import { z } from 'zod';

/**
 * Events written to <schema>.outbox in the same transaction as the state change.
 * The worker relays them to subscribers (the audit log first). Every event names its
 * actor with a label snapshot, so the audit log stays readable after users are deleted.
 */
export const Actor = z.object({ id: z.uuid(), label: z.string() });
export type Actor = z.infer<typeof Actor>;

const venueRef = { venueId: z.uuid(), venueName: z.string() };

export const VenueCreatedEvent = z.object({
  type: z.literal('venue.created'),
  ...venueRef,
  slug: z.string(),
  actor: Actor,
});
export type VenueCreatedEvent = z.infer<typeof VenueCreatedEvent>;

export const VenueUpdatedEvent = z.object({
  type: z.literal('venue.updated'),
  ...venueRef,
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  actor: Actor,
});
export type VenueUpdatedEvent = z.infer<typeof VenueUpdatedEvent>;

export const VenueStatusChangedEvent = z.object({
  type: z.literal('venue.status_changed'),
  ...venueRef,
  from: z.string(),
  to: z.string(),
  actor: Actor,
});
export type VenueStatusChangedEvent = z.infer<typeof VenueStatusChangedEvent>;

export const VenueModuleChangedEvent = z.object({
  type: z.enum(['venue.module_enabled', 'venue.module_disabled']),
  ...venueRef,
  module: z.string(),
  actor: Actor,
});
export type VenueModuleChangedEvent = z.infer<typeof VenueModuleChangedEvent>;

export const UserLoggedInEvent = z.object({
  type: z.literal('user.logged_in'),
  userId: z.uuid(),
  sessionId: z.uuid(),
  ip: z.string().nullable(),
  /** Set for venue staff: the venue they signed in to. */
  venueId: z.uuid().optional(),
  venueName: z.string().optional(),
  actor: Actor,
});
export type UserLoggedInEvent = z.infer<typeof UserLoggedInEvent>;

export const UserAdminEvent = z.object({
  type: z.enum(['user.blocked', 'user.unblocked', 'user.password_reset']),
  userId: z.uuid(),
  userLabel: z.string(),
  actor: Actor,
});
export type UserAdminEvent = z.infer<typeof UserAdminEvent>;

export const CoreEvent = z.discriminatedUnion('type', [
  VenueCreatedEvent,
  VenueUpdatedEvent,
  VenueStatusChangedEvent,
  VenueModuleChangedEvent,
  UserLoggedInEvent,
  UserAdminEvent,
]);
export type CoreEvent = z.infer<typeof CoreEvent>;

/**
 * Menu changes (catalog.outbox). Price changes appear as "item.updated" with the old and
 * new price in before/after, which is what NFR-25 asks the audit log to keep.
 */
export const CatalogEvent = z.object({
  type: z.enum([
    'category.created',
    'category.updated',
    'category.deleted',
    'item.created',
    'item.updated',
    'item.deleted',
    'item.availability_changed',
    'modifier_group.saved',
    'modifier_group.deleted',
  ]),
  venueId: z.uuid(),
  entityId: z.uuid(),
  entityName: z.string(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  actor: Actor,
});
export type CatalogEvent = z.infer<typeof CatalogEvent>;
