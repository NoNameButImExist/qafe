import { z } from 'zod';
import {
  BillLine,
  GuestStatus,
  OrderLineRequest,
  PaymentMethod,
  PlaceOrderRequest,
  SessionOrder,
  SessionStatus,
} from './ordering.js';

// ---------- Floor: tables with their status (FR-KON-15) ----------

/** free: no session; occupied; needs_service: waiter called, new order or device waiting; bill_requested. */
export const TableStatus = z.enum(['free', 'occupied', 'needs_service', 'bill_requested']);
export type TableStatus = z.infer<typeof TableStatus>;

export const ServiceRequestView = z.object({
  id: z.uuid(),
  type: z.enum(['call_waiter', 'request_bill', 'other']),
  status: z.enum(['open', 'acknowledged', 'done', 'cancelled']),
  paymentMethod: PaymentMethod.nullable(),
  createdAt: z.string(),
  nickname: z.string().nullable(),
});
export type ServiceRequestView = z.infer<typeof ServiceRequestView>;

export const FloorSession = z.object({
  id: z.uuid(),
  status: SessionStatus,
  openedAt: z.string(),
  verified: z.boolean(),
  guests: z.number().int(),
  pendingGuests: z.number().int(),
  newOrders: z.number().int(),
  openOrders: z.number().int(),
  disputes: z.number().int(),
  /** Bill so far (accepted orders without an open dispute). */
  total: z.string(),
  requests: z.array(ServiceRequestView),
});
export type FloorSession = z.infer<typeof FloorSession>;

export const FloorTable = z.object({
  id: z.uuid(),
  label: z.string(),
  areaId: z.uuid().nullable(),
  seats: z.number().int().nullable(),
  status: TableStatus,
  session: FloorSession.nullable(),
});
export type FloorTable = z.infer<typeof FloorTable>;

/** GET /staff/floor */
export const Floor = z.object({
  areas: z.array(z.object({ id: z.uuid(), name: z.string() })),
  tables: z.array(FloorTable),
});
export type Floor = z.infer<typeof Floor>;

// ---------- Orders and sessions for staff ----------

export const StaffOrder = SessionOrder.extend({
  sessionId: z.uuid(),
  tableId: z.uuid(),
  tableLabel: z.string(),
  source: z.enum(['guest_qr', 'staff']),
});
export type StaffOrder = z.infer<typeof StaffOrder>;

/** GET /staff/orders — live orders of the venue, oldest first (FR-KON-04). */
export const StaffOrderList = z.object({ orders: z.array(StaffOrder) });
export type StaffOrderList = z.infer<typeof StaffOrderList>;

export const StaffSessionGuest = z.object({
  id: z.uuid(),
  nickname: z.string(),
  status: GuestStatus,
  isHost: z.boolean(),
  lastSeenAt: z.string(),
});
export type StaffSessionGuest = z.infer<typeof StaffSessionGuest>;

/** GET /staff/sessions/:id — one table in detail. */
export const StaffSessionDetail = z.object({
  id: z.uuid(),
  tableId: z.uuid(),
  tableLabel: z.string(),
  status: SessionStatus,
  verified: z.boolean(),
  /** PIN to tell the guests (PIN mode, until verified). */
  verificationCode: z.string().nullable(),
  verificationMode: z.enum(['waiter', 'pin']),
  openedAt: z.string(),
  guests: z.array(StaffSessionGuest),
  orders: z.array(StaffOrder),
  requests: z.array(ServiceRequestView),
  bill: z.object({ lines: z.array(BillLine), total: z.string(), vatAmount: z.string() }),
  /** Orders that block payment: not yet accepted, or with an open dispute. */
  blockingOrders: z.number().int(),
  paymentMethods: z.array(z.object({ method: PaymentMethod, isDefault: z.boolean() })),
  orderRejectionEnabled: z.boolean(),
});
export type StaffSessionDetail = z.infer<typeof StaffSessionDetail>;

// ---------- Requests ----------

/** Return to guest (FR-KON-08): the guest sees the message. */
export const StaffMessageRequest = z.object({ message: z.string().trim().min(1).max(300) });
export type StaffMessageRequest = z.infer<typeof StaffMessageRequest>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/** Reject (FR-KON-09) needs a reason; cancel and removals may have one. */
export const ReasonRequest = z.object({ reason: optionalText(200) });
export type ReasonRequest = z.input<typeof ReasonRequest>;

export const RejectRequest = z.object({ reason: z.string().trim().min(1).max(200) });
export type RejectRequest = z.infer<typeof RejectRequest>;

/** Remove an unavailable item, with a short message to the guest (FR-KON-07). */
export const RemoveItemRequest = z.object({ message: optionalText(300) });
export type RemoveItemRequest = z.input<typeof RemoveItemRequest>;

/** Replace an item with another one (FR-KON-07). */
export const ReplaceItemRequest = OrderLineRequest.extend({ message: optionalText(300) });
export type ReplaceItemRequest = z.input<typeof ReplaceItemRequest>;
export type ReplaceItemInput = z.output<typeof ReplaceItemRequest>;

/** Add items to an order that is not served yet (FR-KON-10). */
export const AddItemsRequest = z.object({ items: z.array(OrderLineRequest).min(1).max(50) });
export type AddItemsRequest = z.input<typeof AddItemsRequest>;
export type AddItemsInput = z.output<typeof AddItemsRequest>;

/** Manual order for a table (FR-KON-12); same shape as a guest order. */
export const ManualOrderRequest = PlaceOrderRequest;
export type ManualOrderRequest = z.input<typeof ManualOrderRequest>;

/** Remove a device from the table, blocking it for the venue's block hours (FR-KON-17). */
export const RemoveGuestRequest = z.object({
  block: z.boolean().default(true),
  reason: optionalText(200),
});
export type RemoveGuestRequest = z.input<typeof RemoveGuestRequest>;
export type RemoveGuestInput = z.output<typeof RemoveGuestRequest>;

/** "Nije naše": confirm the order belongs to the table, or cancel it (FR-GOS-25). */
export const ResolveDisputeRequest = z.object({ action: z.enum(['confirm', 'cancel']) });
export type ResolveDisputeRequest = z.infer<typeof ResolveDisputeRequest>;

/** Pay the whole table and close it (FR-KON-19, FR-KON-21). */
export const PayRequest = z.object({ method: z.enum(['cash', 'card']) });
export type PayRequest = z.infer<typeof PayRequest>;

export const PaymentResult = z.object({
  id: z.uuid(),
  amount: z.string(),
  vatAmount: z.string(),
  method: PaymentMethod,
});
export type PaymentResult = z.infer<typeof PaymentResult>;

// ---------- Web Push (FR-KON-05) ----------

export const PushConfig = z.object({ publicKey: z.string().nullable() });
export type PushConfig = z.infer<typeof PushConfig>;

export const PushSubscriptionRequest = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;

export const PushUnsubscribeRequest = z.object({ endpoint: z.url().max(1000) });
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequest>;

/** What the service worker gets; it builds the text in the member's language. */
export const PushPayload = z.object({
  type: z.enum(['order.created', 'call_waiter', 'request_bill', 'guest.waiting']),
  tableLabel: z.string(),
  orderNumber: z.number().int().optional(),
  url: z.string(),
});
export type PushPayload = z.infer<typeof PushPayload>;

// ---------- Events (billing.outbox) ----------

export const BillingEvent = z.object({
  type: z.enum(['payment.completed', 'payment.failed']),
  venueId: z.uuid(),
  sessionId: z.uuid(),
  tableLabel: z.string(),
  entityId: z.uuid(),
  method: PaymentMethod,
  amount: z.string(),
  actor: z.object({ id: z.uuid(), label: z.string() }),
});
export type BillingEvent = z.infer<typeof BillingEvent>;
