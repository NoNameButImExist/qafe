import { z } from 'zod';

// ---------- Shared enums (mirror the app.* enums in the database) ----------

export const PaymentMethod = z.enum(['cash', 'card', 'online']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const SessionStatus = z.enum(['open', 'bill_requested', 'closed', 'abandoned']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const GuestStatus = z.enum(['pending_approval', 'approved', 'removed', 'left']);
export type GuestStatus = z.infer<typeof GuestStatus>;

export const OrderStatus = z.enum([
  'new',
  'returned',
  'accepted',
  'preparing',
  'ready',
  'served',
  'cancelled',
  'rejected',
  'withdrawn',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderItemStatus = z.enum([
  'pending',
  'preparing',
  'ready',
  'served',
  'removed',
  'cancelled',
]);
export type OrderItemStatus = z.infer<typeof OrderItemStatus>;

export const VerificationMode = z.enum(['waiter', 'pin']);
export type VerificationMode = z.infer<typeof VerificationMode>;

export const DisputeStatus = z.enum(['open', 'confirmed', 'cancelled']);
export type DisputeStatus = z.infer<typeof DisputeStatus>;

// ---------- Guest: venue and menu ----------

/** Why a guest can see the menu but not order (FR-GOS-03). */
export const OrderingClosedReason = z.enum(['suspended', 'closed', 'ordering_disabled']);
export type OrderingClosedReason = z.infer<typeof OrderingClosedReason>;

/** GET /guest/venue — the venue of the subdomain the guest is on. */
export const GuestVenue = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  currency: z.string(),
  defaultLanguage: z.string(),
  orderingOpen: z.boolean(),
  closedReason: OrderingClosedReason.nullable(),
  /** Enabled methods for "Zatraži račun"; the default one is preselected (FR-GOS-15). */
  paymentMethods: z.array(z.object({ method: PaymentMethod, isDefault: z.boolean() })),
});
export type GuestVenue = z.infer<typeof GuestVenue>;

export const GuestMenuItem = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  volumeLabel: z.string().nullable(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  modifierGroupIds: z.array(z.uuid()),
});
export type GuestMenuItem = z.infer<typeof GuestMenuItem>;

export const GuestMenuCategory = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  items: z.array(GuestMenuItem),
});
export type GuestMenuCategory = z.infer<typeof GuestMenuCategory>;

export const GuestModifierGroup = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  options: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      priceDelta: z.string(),
      isDefault: z.boolean(),
    }),
  ),
});
export type GuestModifierGroup = z.infer<typeof GuestModifierGroup>;

/** GET /guest/menu — active categories with their items, no hidden data (FR-GOS-04). */
export const GuestMenu = z.object({
  categories: z.array(GuestMenuCategory),
  modifierGroups: z.array(GuestModifierGroup),
});
export type GuestMenu = z.infer<typeof GuestMenu>;

// ---------- Guest: table session ----------

export const Nickname = z.string().trim().min(1).max(30);

/** POST /guest/tables/:token/join (FR-GOS-01, FR-GOS-20..23). */
export const JoinTableRequest = z.object({
  nickname: Nickname.optional(),
  locale: z.enum(['bs', 'en']).optional(),
  /** Confirms leaving the session at another table of this venue (FR-GOS-23). */
  leaveCurrent: z.boolean().optional(),
});
export type JoinTableRequest = z.infer<typeof JoinTableRequest>;

/** PIN the waiter tells the table (FR-GOS-21, PIN mode). */
export const VerifySessionRequest = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/),
});
export type VerifySessionRequest = z.infer<typeof VerifySessionRequest>;

export const GuestRefRequest = z.object({ guestId: z.uuid() });
export type GuestRefRequest = z.infer<typeof GuestRefRequest>;

export const RenameRequest = z.object({ nickname: Nickname });
export type RenameRequest = z.infer<typeof RenameRequest>;

export const OrderLineRequest = z.object({
  itemId: z.uuid(),
  quantity: z.number().int().min(1).max(50),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  modifierOptionIds: z.array(z.uuid()).max(30).default([]),
});
export type OrderLineRequest = z.input<typeof OrderLineRequest>;

/** POST /guest/orders, PUT /guest/orders/:id (FR-GOS-09, FR-GOS-12). */
export const PlaceOrderRequest = z.object({
  /** Generated once per cart on the device; a retry returns the same order (NFR-06). */
  idempotencyKey: z.uuid(),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  items: z.array(OrderLineRequest).min(1).max(50),
});
export type PlaceOrderRequest = z.input<typeof PlaceOrderRequest>;
export type PlaceOrderInput = z.output<typeof PlaceOrderRequest>;

export const ResubmitOrderRequest = PlaceOrderRequest.omit({ idempotencyKey: true });
export type ResubmitOrderRequest = z.input<typeof ResubmitOrderRequest>;
export type ResubmitOrderInput = z.output<typeof ResubmitOrderRequest>;

/** POST /guest/requests (FR-GOS-14, FR-GOS-15). Online payment is V2. */
export const ServiceRequestBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('call_waiter') }),
  z.object({ type: z.literal('request_bill'), paymentMethod: z.enum(['cash', 'card']) }),
]);
export type ServiceRequestBody = z.infer<typeof ServiceRequestBody>;

export const SessionOrderItem = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  note: z.string().nullable(),
  status: OrderItemStatus,
  modifiers: z.array(
    z.object({
      /** The menu option, so a returned order can be corrected; null if it was deleted. */
      optionId: z.uuid().nullable(),
      group: z.string(),
      option: z.string(),
      priceDelta: z.string(),
    }),
  ),
});
export type SessionOrderItem = z.infer<typeof SessionOrderItem>;

/** What staff changed on an order; the guest sees it (FR-GOS-11). */
export const OrderChange = z.object({
  type: z.enum([
    'item_added',
    'item_removed',
    'item_replaced',
    'quantity_changed',
    'returned_to_guest',
  ]),
  message: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderChange = z.infer<typeof OrderChange>;

export const SessionOrder = z.object({
  id: z.uuid(),
  number: z.number().int(),
  status: OrderStatus,
  createdAt: z.string(),
  /** Device that ordered; null when staff entered the order. */
  guestId: z.uuid().nullable(),
  /** Nickname of that device, or null for staff (FR-GOS-24). */
  orderedBy: z.string().nullable(),
  total: z.string(),
  note: z.string().nullable(),
  staffMessage: z.string().nullable(),
  dispute: DisputeStatus.nullable(),
  items: z.array(SessionOrderItem),
  changes: z.array(OrderChange),
});
export type SessionOrder = z.infer<typeof SessionOrder>;

export const SessionGuest = z.object({
  id: z.uuid(),
  nickname: z.string(),
  status: GuestStatus,
  isHost: z.boolean(),
  isMe: z.boolean(),
});
export type SessionGuest = z.infer<typeof SessionGuest>;

export const BillLine = z.object({
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  total: z.string(),
});
export type BillLine = z.infer<typeof BillLine>;

/** GET /guest/session — everything one device sees about its table (FR-GOS-10..16, 24). */
export const GuestSessionState = z.object({
  session: z.object({
    id: z.uuid(),
    tableLabel: z.string(),
    status: SessionStatus,
    /** The waiter confirmed someone sits at the table, or the PIN was entered (FR-GOS-21). */
    verified: z.boolean(),
    verificationMode: VerificationMode,
    requestedPaymentMethod: PaymentMethod.nullable(),
  }),
  me: SessionGuest,
  guests: z.array(SessionGuest),
  orders: z.array(SessionOrder),
  /** Accepted orders without an open dispute (FR-GOS-16, FR-GOS-25). */
  bill: z.object({ lines: z.array(BillLine), total: z.string(), vatAmount: z.string() }),
  /** When "Pozovi konobara" may be pressed again; null = now (FR-GOS-14). */
  callWaiterAvailableAt: z.string().nullable(),
});
export type GuestSessionState = z.infer<typeof GuestSessionState>;

/** Result of POST /guest/orders: 201 when created, 200 for a retry with the same key. */
export const PlacedOrder = z.object({ order: SessionOrder });
export type PlacedOrder = z.infer<typeof PlacedOrder>;

// ---------- Realtime ----------

/**
 * Socket.IO messages. They are hints only: the client refetches over HTTP, so a lost
 * message costs a little delay, never data.
 */
export interface GuestServerEvents {
  'session.changed': (payload: { sessionId: string }) => void;
}
export interface StaffServerEvents {
  'venue.changed': (payload: { sessionId: string; reason: string }) => void;
}
