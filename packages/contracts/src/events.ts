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

/** Areas, tables and QR codes (FR-SEF-11, FR-SEF-16). */
export const SpaceEvent = z.object({
  type: z.enum([
    'area.created',
    'area.updated',
    'area.deleted',
    'table.created',
    'table.updated',
    'table.deleted',
    'table.qr_rotated',
  ]),
  ...venueRef,
  entityId: z.uuid(),
  entityName: z.string(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  actor: Actor,
});
export type SpaceEvent = z.infer<typeof SpaceEvent>;

/** Staff accounts managed by the owner (FR-SEF-08, FR-SEF-09). */
export const StaffEvent = z.object({
  type: z.enum(['staff.created', 'staff.updated', 'staff.password_reset', 'staff.pin_changed']),
  ...venueRef,
  memberId: z.uuid(),
  userId: z.uuid(),
  memberLabel: z.string(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  actor: Actor,
});
export type StaffEvent = z.infer<typeof StaffEvent>;

export const CoreEvent = z.discriminatedUnion('type', [
  VenueCreatedEvent,
  VenueUpdatedEvent,
  VenueStatusChangedEvent,
  VenueModuleChangedEvent,
  UserLoggedInEvent,
  UserAdminEvent,
  SpaceEvent,
  StaffEvent,
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

/**
 * Table sessions and orders (ordering.outbox). Guests are anonymous: their actor is the
 * session device with its nickname. Staff actions carry the member as actor.
 */
export const OrderingEvent = z.object({
  type: z.enum([
    'session.opened',
    'session.verified',
    'session.bill_requested',
    'guest.joined',
    'guest.approved',
    'guest.left',
    'order.created',
    'order.resubmitted',
    'order.withdrawn',
    'order.disputed',
    'order.accepted',
    'order.served',
    'order.returned',
    'order.rejected',
    'order.cancelled',
    'order.changed',
    'order.dispute_resolved',
    'guest.removed',
    'session.closed',
    'service.requested',
    'service.handled',
  ]),
  venueId: z.uuid(),
  sessionId: z.uuid(),
  tableId: z.uuid(),
  tableLabel: z.string(),
  /** The order, guest or request the event is about; the session for session events. */
  entityId: z.uuid(),
  orderNumber: z.number().int().optional(),
  total: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  actor: Actor,
  actorKind: z.enum(['guest', 'staff']),
});
export type OrderingEvent = z.infer<typeof OrderingEvent>;

/**
 * A table was paid (ordering.outbox, type "session.settled"): every billed item with the
 * snapshot reporting needs, so the reporting module never reads another schema (FR-SEF-24).
 */
export const SessionSettledEvent = z.object({
  type: z.literal('session.settled'),
  venueId: z.uuid(),
  sessionId: z.uuid(),
  paymentId: z.uuid(),
  paymentMethod: z.enum(['cash', 'card', 'online']),
  tableLabel: z.string(),
  areaName: z.string().nullable(),
  settledAt: z.string(),
  items: z.array(
    z.object({
      orderItemId: z.uuid(),
      orderId: z.uuid(),
      businessDate: z.string(),
      /** When the order was placed, in the venue's local time. */
      hourOfDay: z.number().int().min(0).max(23),
      dayOfWeek: z.number().int().min(1).max(7),
      servedAt: z.string(),
      memberId: z.uuid().nullable(),
      memberName: z.string().nullable(),
      itemId: z.uuid(),
      itemName: z.string(),
      categoryName: z.string().nullable(),
      quantity: z.number().int(),
      revenue: z.string(),
      vatAmount: z.string(),
    }),
  ),
});
export type SessionSettledEvent = z.infer<typeof SessionSettledEvent>;
