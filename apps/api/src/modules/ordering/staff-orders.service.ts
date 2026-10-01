import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AddItemsInput,
  type DayOrderList,
  type OrderStatus,
  type PlaceOrderInput,
  type ReplaceItemInput,
  type StaffOrder,
  type StaffOrderList,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { GuestMenuService, type PricedLine, type QuoteLine } from '../catalog/index.js';
import { VenueDirectory, type OrderingSettings } from '../core/index.js';
import { fail } from './guest-session.service.js';
import {
  addHistory,
  insertLines,
  isUniqueViolation,
  LIVE_ITEM_STATUSES,
  nextOrderNumber,
  recalculate,
  sumLines,
  vatOf,
} from './order-writes.js';
import { OrderingDatabase } from './ordering.database.js';
import { publish, staffActor } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { activeSession, markVerified } from './staff-sessions.service.js';
import { loadOrders, staffOrder } from './session-view.js';

/** Orders waiting for staff or in progress (FR-KON-04). */
const LIVE: OrderStatus[] = ['new', 'returned', 'accepted', 'preparing', 'ready'];
/** Orders staff may still change (FR-KON-07, 10, 13). */
const CHANGEABLE: OrderStatus[] = ['new', 'accepted', 'preparing', 'ready'];

type ChangeType =
  'item_added' | 'item_removed' | 'item_replaced' | 'quantity_changed' | 'returned_to_guest';

interface LockedOrder {
  id: string;
  session_id: string;
  table_id: string;
  status: OrderStatus;
  order_number: number;
  total: string;
  dispute_status: 'open' | 'confirmed' | 'cancelled' | null;
  table_label: string;
}

/**
 * Orders from the staff side (FR-KON-04, 06..13, FR-GOS-25): accept, serve, return, reject,
 * cancel, change items, enter an order by hand and resolve "Nije naše". Every change is
 * recorded in order_changes (what the guest sees), the status history and the outbox.
 */
@Injectable()
export class StaffOrdersService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly venues: VenueDirectory,
    private readonly menu: GuestMenuService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Live orders, oldest first: the waiter's queue. */
  async list(staff: StaffClaims): Promise<StaffOrderList> {
    const settings = await this.settings(staff);
    return this.inVenue(staff, async (trx) => ({
      orderRejectionEnabled: settings.orderRejectionEnabled,
      orders: (
        await loadOrders(trx, { statuses: LIVE, oldestFirst: true, activeSessionsOnly: true })
      ).map(staffOrder),
    }));
  }

  /** Every order of one business day, all areas and statuses, newest first (FR-SEF-23). */
  async day(staff: StaffClaims, date?: string): Promise<DayOrderList> {
    const settings = await this.settings(staff);
    return this.inVenue(staff, async (trx) => {
      const businessDate =
        date ??
        (
          await sql<{ d: string }>`
            select ((now() at time zone ${settings.timezone})
                    - ${settings.businessDayStartsAt}::interval)::date::text as d
          `.execute(trx)
        ).rows[0]!.d;
      const orders = await loadOrders(trx, { businessDate });
      return { date: businessDate, orders: orders.map(staffOrder) };
    });
  }

  /** One tap (FR-KON-06); the first accepted order also verifies the table (FR-GOS-21). */
  accept(staff: StaffClaims, orderId: string): Promise<void> {
    return this.change(staff, orderId, ['new'], 'order.accepted', async (trx, order) => {
      await trx
        .updateTable('ordering.orders')
        .set({ status: 'accepted', accepted_at: new Date(), accepted_by_member_id: staff.memberId })
        .where('id', '=', order.id)
        .execute();
      await addHistory(trx, staff.venueId, order.id, order.status, 'accepted', staff.memberId);
      const session = await activeSession(trx, order.session_id);
      if (!session.verified_at) await markVerified(trx, staff, session);
    });
  }

  /** Served (FR-KON-11): the order and its live items. */
  serve(staff: StaffClaims, orderId: string): Promise<void> {
    return this.change(
      staff,
      orderId,
      ['accepted', 'preparing', 'ready'],
      'order.served',
      async (trx, order) => {
        const now = new Date();
        await trx
          .updateTable('ordering.orders')
          .set({ status: 'served', served_at: now })
          .where('id', '=', order.id)
          .execute();
        await trx
          .updateTable('ordering.order_items')
          .set({ status: 'served' })
          .where('order_id', '=', order.id)
          .where('status', 'in', ['pending', 'preparing', 'ready'])
          .execute();
        await addHistory(trx, staff.venueId, order.id, order.status, 'served', staff.memberId);
      },
    );
  }

  /** Back to the guest with a message; the guest corrects and resends it (FR-KON-08). */
  returnToGuest(staff: StaffClaims, orderId: string, message: string): Promise<void> {
    return this.change(
      staff,
      orderId,
      ['new'],
      'order.returned',
      async (trx, order) => {
        await trx
          .updateTable('ordering.orders')
          .set({ status: 'returned', staff_message: message, returned_at: new Date() })
          .where('id', '=', order.id)
          .execute();
        await this.recordChange(trx, staff, order.id, null, 'returned_to_guest', message);
        await addHistory(trx, staff.venueId, order.id, order.status, 'returned', staff.memberId);
      },
      { message },
    );
  }

  /** Only when the owner allows it (FR-KON-09, FR-SEF-04). */
  async reject(staff: StaffClaims, orderId: string, reason: string): Promise<void> {
    const settings = await this.settings(staff);
    if (!settings.orderRejectionEnabled) {
      throw fail(
        HttpStatus.CONFLICT,
        ErrorCode.rejectionDisabled,
        'The venue does not reject orders',
      );
    }
    return this.change(
      staff,
      orderId,
      ['new'],
      'order.rejected',
      async (trx, order) => {
        await trx
          .updateTable('ordering.orders')
          .set({ status: 'rejected', staff_message: reason, cancel_reason: reason })
          .where('id', '=', order.id)
          .execute();
        await addHistory(trx, staff.venueId, order.id, order.status, 'rejected', staff.memberId);
      },
      { reason },
    );
  }

  /** Cancels the whole order (orders.cancel). */
  cancel(staff: StaffClaims, orderId: string, reason?: string): Promise<void> {
    return this.change(
      staff,
      orderId,
      [...LIVE],
      'order.cancelled',
      async (trx, order) => {
        await this.cancelOrder(trx, staff, order, reason);
      },
      reason ? { reason } : {},
    );
  }

  /** An item the venue cannot serve, with a short message to the guest (FR-KON-07). */
  removeItem(
    staff: StaffClaims,
    orderId: string,
    itemId: string,
    message: string | undefined,
    status: 'removed' | 'cancelled' = 'removed',
  ): Promise<void> {
    return this.change(
      staff,
      orderId,
      CHANGEABLE,
      'order.changed',
      async (trx, order) => {
        const item = await this.liveItem(trx, order.id, itemId);
        await trx
          .updateTable('ordering.order_items')
          .set({
            status,
            removed_by_member_id: staff.memberId,
            removed_reason: message ?? null,
          })
          .where('id', '=', item.id)
          .execute();
        await this.recordChange(trx, staff, order.id, item.id, 'item_removed', message, {
          old: { name: item.item_name, quantity: item.quantity },
        });
        await this.afterItemsChanged(trx, staff, order);
      },
      { item: itemId, change: status },
    );
  }

  /** Swaps an item for another one from the menu (FR-KON-07). */
  async replaceItem(
    staff: StaffClaims,
    orderId: string,
    itemId: string,
    input: ReplaceItemInput,
  ): Promise<void> {
    const [line] = await this.price(staff, [input]);
    return this.change(
      staff,
      orderId,
      CHANGEABLE,
      'order.changed',
      async (trx, order) => {
        const item = await this.liveItem(trx, order.id, itemId);
        await trx
          .updateTable('ordering.order_items')
          .set({
            status: 'removed',
            removed_by_member_id: staff.memberId,
            removed_reason: input.message ?? null,
          })
          .where('id', '=', item.id)
          .execute();
        const [newId] = await insertLines(trx, staff.venueId, order.id, [line!], {
          addedByMemberId: staff.memberId,
          replacesOrderItemId: item.id,
        });
        await this.recordChange(trx, staff, order.id, newId!, 'item_replaced', input.message, {
          old: { name: item.item_name, quantity: item.quantity },
          new: { name: line!.itemName, quantity: line!.quantity },
        });
        await recalculate(trx, order.id);
      },
      { item: itemId, change: 'replaced' },
    );
  }

  /** More items on an order that is not served yet (FR-KON-10). */
  async addItems(staff: StaffClaims, orderId: string, input: AddItemsInput): Promise<void> {
    const lines = await this.price(staff, input.items);
    return this.change(
      staff,
      orderId,
      CHANGEABLE,
      'order.changed',
      async (trx, order) => {
        const ids = await insertLines(trx, staff.venueId, order.id, lines, {
          addedByMemberId: staff.memberId,
        });
        for (const [index, id] of ids.entries()) {
          const line = lines[index]!;
          await this.recordChange(trx, staff, order.id, id, 'item_added', undefined, {
            new: { name: line.itemName, quantity: line.quantity },
          });
        }
        await recalculate(trx, order.id);
      },
      { change: 'added', items: lines.length },
    );
  }

  /** "Nije naše" (FR-GOS-25): confirm it belongs to the table, or cancel the order. */
  resolveDispute(staff: StaffClaims, orderId: string, action: 'confirm' | 'cancel'): Promise<void> {
    return this.change(
      staff,
      orderId,
      null,
      'order.dispute_resolved',
      async (trx, order) => {
        if (order.dispute_status !== 'open') {
          throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'No open dispute');
        }
        await trx
          .updateTable('ordering.orders')
          .set({
            dispute_status: action === 'confirm' ? 'confirmed' : 'cancelled',
            dispute_resolved_by: staff.memberId,
            dispute_resolved_at: new Date(),
          })
          .where('id', '=', order.id)
          .execute();
        if (action === 'cancel' && !['cancelled', 'rejected', 'withdrawn'].includes(order.status)) {
          await this.cancelOrder(trx, staff, order, 'dispute');
        }
      },
      { action },
    );
  }

  /**
   * An order entered by staff for guests without a phone (FR-KON-12). It is accepted at once
   * and opens (and verifies) the table session if there is none. The idempotency key makes
   * a resend safe.
   */
  async manual(staff: StaffClaims, tableId: string, input: PlaceOrderInput): Promise<StaffOrder> {
    const table = await this.venues.table(staff.venueId, tableId);
    if (!table) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Table not found');
    const settings = await this.settings(staff);
    const existing = await this.inVenue(staff, (trx) => this.byKey(trx, input.idempotencyKey));
    if (existing) return existing;
    const lines = await this.price(staff, input.items);

    try {
      const result = await this.inVenue(staff, async (trx) => {
        const session = await this.openSession(trx, staff, table);
        const total = sumLines(lines);
        const { businessDate, orderNumber } = await nextOrderNumber(trx, staff.venueId, settings);
        const now = new Date();
        const order = await trx
          .insertInto('ordering.orders')
          .values({
            venue_id: staff.venueId,
            session_id: session.id,
            table_id: table.id,
            business_date: businessDate,
            order_number: orderNumber,
            source: 'staff',
            idempotency_key: input.idempotencyKey,
            status: 'accepted',
            created_by_member_id: staff.memberId,
            accepted_by_member_id: staff.memberId,
            accepted_at: now,
            guest_note: input.note ?? null,
            total,
            vat_rate: settings.vatRate,
            vat_amount: vatOf(total, settings.vatRate),
          })
          .returning(['id', 'order_number'])
          .executeTakeFirstOrThrow();
        await insertLines(trx, staff.venueId, order.id, lines, { addedByMemberId: staff.memberId });
        await addHistory(trx, staff.venueId, order.id, null, 'accepted', staff.memberId);
        await publish(trx, {
          type: 'order.created',
          venueId: staff.venueId,
          sessionId: session.id,
          tableId: table.id,
          tableLabel: table.label,
          entityId: order.id,
          orderNumber: order.order_number,
          total,
          details: { source: 'staff' },
          ...staffActor(staff.memberId, staff.name),
        });
        const [view] = await loadOrders(trx, { orderIds: [order.id] });
        return staffOrder(view!);
      });
      this.realtime.sessionChanged(staff.venueId, result.sessionId, 'order.created');
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const winner = await this.inVenue(staff, (trx) => this.byKey(trx, input.idempotencyKey));
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Locks the order, checks its status, runs the change, writes the event and tells the
   * table and the staff. `allowed` null = any status.
   */
  private async change(
    staff: StaffClaims,
    orderId: string,
    allowed: OrderStatus[] | null,
    eventType:
      | 'order.accepted'
      | 'order.served'
      | 'order.returned'
      | 'order.rejected'
      | 'order.cancelled'
      | 'order.changed'
      | 'order.dispute_resolved',
    fn: (trx: Tx, order: LockedOrder) => Promise<void>,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const sessionId = await this.inVenue(staff, async (trx) => {
      const order = await trx
        .selectFrom('ordering.orders as o')
        .innerJoin('ordering.table_sessions as s', 's.id', 'o.session_id')
        .select([
          'o.id',
          'o.session_id',
          'o.table_id',
          'o.status',
          'o.order_number',
          'o.total',
          'o.dispute_status',
          's.table_label',
          's.status as session_status',
        ])
        .where('o.id', '=', orderId)
        .forUpdate('o')
        .executeTakeFirst();
      if (!order) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Order not found');
      // A paid or closed table is final: nothing on it changes any more.
      if (order.session_status !== 'open' && order.session_status !== 'bill_requested') {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'The table is already closed', {
          sessionStatus: order.session_status,
        });
      }
      if (allowed && !allowed.includes(order.status)) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, `Order is ${order.status}`, {
          status: order.status,
        });
      }
      await fn(trx, order);
      const after = await trx
        .selectFrom('ordering.orders')
        .select('total')
        .where('id', '=', order.id)
        .executeTakeFirstOrThrow();
      await publish(trx, {
        type: eventType,
        venueId: staff.venueId,
        sessionId: order.session_id,
        tableId: order.table_id,
        tableLabel: order.table_label,
        entityId: order.id,
        orderNumber: order.order_number,
        total: after.total,
        ...(Object.keys(details).length ? { details } : {}),
        ...staffActor(staff.memberId, staff.name),
      });
      return order.session_id;
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, eventType);
  }

  private async cancelOrder(
    trx: Tx,
    staff: StaffClaims,
    order: LockedOrder,
    reason: string | undefined,
  ): Promise<void> {
    await trx
      .updateTable('ordering.orders')
      .set({ status: 'cancelled', cancelled_at: new Date(), cancel_reason: reason ?? null })
      .where('id', '=', order.id)
      .execute();
    await trx
      .updateTable('ordering.order_items')
      .set({ status: 'cancelled', removed_by_member_id: staff.memberId })
      .where('order_id', '=', order.id)
      .where('status', 'in', [...LIVE_ITEM_STATUSES])
      .execute();
    await addHistory(trx, staff.venueId, order.id, order.status, 'cancelled', staff.memberId);
  }

  /** New total; an order without live items is cancelled. */
  private async afterItemsChanged(trx: Tx, staff: StaffClaims, order: LockedOrder): Promise<void> {
    await recalculate(trx, order.id);
    const live = await trx
      .selectFrom('ordering.order_items')
      .select('id')
      .where('order_id', '=', order.id)
      .where('status', 'in', [...LIVE_ITEM_STATUSES])
      .executeTakeFirst();
    if (!live) await this.cancelOrder(trx, staff, order, 'no_items');
  }

  private async liveItem(trx: Tx, orderId: string, itemId: string) {
    const item = await trx
      .selectFrom('ordering.order_items')
      .select(['id', 'item_name', 'quantity'])
      .where('id', '=', itemId)
      .where('order_id', '=', orderId)
      .where('status', 'in', [...LIVE_ITEM_STATUSES])
      .executeTakeFirst();
    if (!item) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Item not found');
    return item;
  }

  /** What the guest sees as "Izmijenjeno" (FR-GOS-11). */
  private async recordChange(
    trx: Tx,
    staff: StaffClaims,
    orderId: string,
    itemId: string | null,
    type: ChangeType,
    message: string | undefined,
    values: { old?: object; new?: object } = {},
  ): Promise<void> {
    await trx
      .insertInto('ordering.order_changes')
      .values({
        venue_id: staff.venueId,
        order_id: orderId,
        order_item_id: itemId,
        change_type: type,
        changed_by_member_id: staff.memberId,
        message: message ?? null,
        old_values: values.old ? JSON.stringify(values.old) : null,
        new_values: values.new ? JSON.stringify(values.new) : null,
      })
      .execute();
  }

  /** The table's active session, or a new one opened (and verified) by staff. */
  private async openSession(
    trx: Tx,
    staff: StaffClaims,
    table: { id: string; label: string },
  ): Promise<{ id: string }> {
    const find = () =>
      trx
        .selectFrom('ordering.table_sessions')
        .select('id')
        .where('table_id', '=', table.id)
        .where('status', 'in', ['open', 'bill_requested'])
        .forUpdate()
        .executeTakeFirst();
    const existing = await find();
    if (existing) return existing;
    const now = new Date();
    const inserted = await trx
      .insertInto('ordering.table_sessions')
      .values({
        venue_id: staff.venueId,
        table_id: table.id,
        table_label: table.label,
        verified_at: now,
        verified_by_member_id: staff.memberId,
      })
      .onConflict((oc) =>
        oc.column('table_id').where('status', 'in', ['open', 'bill_requested']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (inserted) {
      await publish(trx, {
        type: 'session.opened',
        venueId: staff.venueId,
        sessionId: inserted.id,
        tableId: table.id,
        tableLabel: table.label,
        entityId: inserted.id,
        details: { by: 'staff' },
        ...staffActor(staff.memberId, staff.name),
      });
      return inserted;
    }
    const raced = await find();
    if (!raced) throw new Error('Table session could not be opened');
    return raced;
  }

  private async byKey(trx: Tx, key: string): Promise<StaffOrder | null> {
    const order = await trx
      .selectFrom('ordering.orders')
      .select(['id', 'source'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    if (!order) return null;
    if (order.source !== 'staff') {
      throw fail(HttpStatus.CONFLICT, ErrorCode.idempotencyConflict, 'Key already used');
    }
    const [view] = await loadOrders(trx, { orderIds: [order.id] });
    return staffOrder(view!);
  }

  private async price(staff: StaffClaims, items: QuoteLine[]): Promise<PricedLine[]> {
    const quote = await this.menu.quote(staff.venueId, items);
    if (!quote.ok) {
      throw fail(
        HttpStatus.UNPROCESSABLE_ENTITY,
        quote.code === 'item_unavailable' ? ErrorCode.itemUnavailable : ErrorCode.invalidModifiers,
        quote.code === 'item_unavailable' ? 'Item is not available' : 'Invalid item options',
        { itemId: quote.itemId },
      );
    }
    return quote.lines;
  }

  private async settings(staff: StaffClaims): Promise<OrderingSettings> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    if (!settings) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Venue not found');
    return settings;
  }

  private inVenue<T>(staff: StaffClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, fn);
  }
}
