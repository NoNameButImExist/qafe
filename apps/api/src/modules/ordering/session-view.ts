import type { BillLine, GuestSessionState, SessionOrder, VerificationMode } from '@qafe/contracts';
import type { Tx } from '@qafe/db';

/** "Pozovi konobara" can be pressed again after this long (FR-GOS-14). */
export const CALL_WAITER_COOLDOWN_SECONDS = 60;

/** Orders that count toward the bill (FR-GOS-16). */
const BILLABLE = ['accepted', 'preparing', 'ready', 'served'] as const;
/** Items that count toward an order's bill. */
const LIVE_ITEMS = ['pending', 'preparing', 'ready', 'served'] as const;

const cents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);

/** An order as loaded from the database; guest and staff views pick from it. */
export type LoadedOrder = SessionOrder & {
  vatRate: string;
  sessionId: string;
  tableId: string;
  tableLabel: string;
  source: 'guest_qr' | 'staff';
};

export interface OrderFilter {
  sessionId?: string;
  orderIds?: string[];
  statuses?: SessionOrder['status'][];
  /** Oldest first (staff queue) instead of newest first. */
  oldestFirst?: boolean;
  /** Only orders of open tables (a paid or abandoned table drops out of the queue). */
  activeSessionsOnly?: boolean;
}

/** Orders with items, modifiers and staff changes; newest first unless asked otherwise. */
export async function loadOrders(
  trx: Tx,
  sessionIdOrFilter: string | OrderFilter,
  orderIds?: string[],
): Promise<LoadedOrder[]> {
  const filter =
    typeof sessionIdOrFilter === 'string'
      ? { sessionId: sessionIdOrFilter, ...(orderIds ? { orderIds } : {}) }
      : sessionIdOrFilter;
  let query = trx
    .selectFrom('ordering.orders as o')
    .innerJoin('ordering.table_sessions as s', 's.id', 'o.session_id')
    .leftJoin('ordering.session_guests as g', 'g.id', 'o.guest_id')
    .select([
      'o.id',
      'o.session_id',
      'o.table_id',
      's.table_label',
      'o.source',
      'o.order_number',
      'o.status',
      'o.created_at',
      'o.guest_id',
      'g.nickname',
      'o.total',
      'o.vat_rate',
      'o.guest_note',
      'o.staff_message',
      'o.dispute_status',
    ]);
  if (filter.sessionId) query = query.where('o.session_id', '=', filter.sessionId);
  if (filter.orderIds) query = query.where('o.id', 'in', filter.orderIds);
  if (filter.statuses) query = query.where('o.status', 'in', filter.statuses);
  if (filter.activeSessionsOnly) query = query.where('s.status', 'in', ['open', 'bill_requested']);
  const orders = await query.orderBy('o.created_at', filter.oldestFirst ? 'asc' : 'desc').execute();
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const items = await trx
    .selectFrom('ordering.order_items')
    .select([
      'id',
      'order_id',
      'item_id',
      'item_name',
      'quantity',
      'unit_price',
      'line_total',
      'note',
      'status',
    ])
    .where('order_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const modifiers = items.length
    ? await trx
        .selectFrom('ordering.order_item_modifiers')
        .select(['order_item_id', 'modifier_option_id', 'group_name', 'option_name', 'price_delta'])
        .where(
          'order_item_id',
          'in',
          items.map((i) => i.id),
        )
        .execute()
    : [];
  const changes = await trx
    .selectFrom('ordering.order_changes')
    .select(['order_id', 'change_type', 'message', 'created_at'])
    .where('order_id', 'in', ids)
    .orderBy('created_at')
    .execute();

  return orders.map((o) => ({
    id: o.id,
    number: o.order_number,
    status: o.status,
    createdAt: o.created_at.toISOString(),
    guestId: o.guest_id,
    orderedBy: o.nickname,
    total: o.total,
    vatRate: o.vat_rate,
    sessionId: o.session_id,
    tableId: o.table_id,
    tableLabel: o.table_label,
    source: o.source,
    note: o.guest_note,
    staffMessage: o.staff_message,
    dispute: o.dispute_status,
    items: items
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        id: i.id,
        itemId: i.item_id,
        name: i.item_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
        note: i.note,
        status: i.status,
        modifiers: modifiers
          .filter((m) => m.order_item_id === i.id)
          .map((m) => ({
            optionId: m.modifier_option_id,
            group: m.group_name,
            option: m.option_name,
            priceDelta: m.price_delta,
          })),
      })),
    changes: changes
      .filter((c) => c.order_id === o.id)
      .map((c) => ({
        type: c.change_type,
        message: c.message,
        createdAt: c.created_at.toISOString(),
      })),
  }));
}

/**
 * The session bill: accepted orders without an open "Nije naše" dispute (FR-GOS-16, 25),
 * live items only, grouped by name and unit price. VAT is included in the prices.
 */
export function buildBill(orders: LoadedOrder[]): GuestSessionState['bill'] {
  const lines = new Map<string, BillLine & { cents: number }>();
  let total = 0;
  let vat = 0;
  for (const order of orders) {
    if (!(BILLABLE as readonly string[]).includes(order.status)) continue;
    if (order.dispute === 'open') continue;
    let orderCents = 0;
    for (const item of order.items) {
      if (!(LIVE_ITEMS as readonly string[]).includes(item.status)) continue;
      const lineCents = cents(item.lineTotal);
      orderCents += lineCents;
      const name = item.modifiers.length
        ? `${item.name} (${item.modifiers.map((m) => m.option).join(', ')})`
        : item.name;
      const key = `${name}|${item.unitPrice}`;
      const line = lines.get(key) ?? {
        name,
        quantity: 0,
        unitPrice: item.unitPrice,
        total: '',
        cents: 0,
      };
      line.quantity += item.quantity;
      line.cents += lineCents;
      lines.set(key, line);
    }
    const rate = Number(order.vatRate);
    vat += (orderCents * rate) / (100 + rate);
    total += orderCents;
  }
  return {
    lines: [...lines.values()].map(({ cents: c, ...line }) => ({ ...line, total: fromCents(c) })),
    total: fromCents(total),
    vatAmount: fromCents(Math.round(vat)),
  };
}

/** Everything one device sees about its table. */
export async function loadSessionState(
  trx: Tx,
  sessionId: string,
  myGuestId: string,
  verificationMode: VerificationMode,
): Promise<GuestSessionState> {
  const session = await trx
    .selectFrom('ordering.table_sessions')
    .select([
      'id',
      'table_label',
      'status',
      'host_guest_id',
      'verified_at',
      'requested_payment_method',
    ])
    .where('id', '=', sessionId)
    .executeTakeFirstOrThrow();
  const guests = await trx
    .selectFrom('ordering.session_guests')
    .select(['id', 'nickname', 'status'])
    .where('session_id', '=', sessionId)
    .where('status', 'in', ['pending_approval', 'approved'])
    .orderBy('created_at')
    .execute();
  const lastCall = await trx
    .selectFrom('ordering.service_requests')
    .select('created_at')
    .where('session_id', '=', sessionId)
    .where('type', '=', 'call_waiter')
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const orders = await loadOrders(trx, sessionId);

  const view = guests.map((g) => ({
    id: g.id,
    nickname: g.nickname,
    status: g.status,
    isHost: g.id === session.host_guest_id,
    isMe: g.id === myGuestId,
  }));
  const me = view.find((g) => g.isMe);
  if (!me) throw new Error('Guest is not active in this session');

  const callAgainAt = lastCall
    ? new Date(lastCall.created_at.getTime() + CALL_WAITER_COOLDOWN_SECONDS * 1000)
    : null;

  return {
    session: {
      id: session.id,
      tableLabel: session.table_label,
      status: session.status,
      verified: session.verified_at !== null,
      verificationMode,
      requestedPaymentMethod: session.requested_payment_method,
    },
    me,
    guests: view,
    orders: orders.map(guestOrder),
    bill: buildBill(orders),
    callWaiterAvailableAt:
      callAgainAt && callAgainAt > new Date() ? callAgainAt.toISOString() : null,
  };
}

/** The guest's view of an order: no internal ids or VAT rate. */
export function guestOrder(order: LoadedOrder): SessionOrder {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: order.createdAt,
    guestId: order.guestId,
    orderedBy: order.orderedBy,
    total: order.total,
    note: order.note,
    staffMessage: order.staffMessage,
    dispute: order.dispute,
    items: order.items,
    changes: order.changes,
  };
}

/** The staff view of an order. */
export function staffOrder(order: LoadedOrder) {
  return {
    ...guestOrder(order),
    sessionId: order.sessionId,
    tableId: order.tableId,
    tableLabel: order.tableLabel,
    source: order.source,
  };
}

/** Orders a table has to settle before paying: not yet accepted, or disputed. */
export function blockingOrders(orders: LoadedOrder[]): number {
  return orders.filter(
    (o) =>
      o.status === 'new' ||
      o.status === 'returned' ||
      (o.dispute === 'open' && !['cancelled', 'rejected', 'withdrawn'].includes(o.status)),
  ).length;
}
