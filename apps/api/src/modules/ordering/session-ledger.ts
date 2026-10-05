import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type OrderingEvent, type SessionSettledEvent } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { VenueDirectory } from '../core/index.js';
import { fail } from './guest-session.service.js';
import { OrderingDatabase } from './ordering.database.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { vatOf } from './order-writes.js';
import {
  billableItems,
  blockingOrders,
  buildBill,
  loadOrders,
  type BillableItem,
} from './session-view.js';
import { activeSession, closeSession } from './staff-sessions.service.js';

const cents = (value: string) => Math.round(Number(value) * 100);

export interface SessionBillSummary {
  tableLabel: string;
  total: string;
  vatAmount: string;
  /** Covered by partial payments so far (FR-KON-20). */
  paid: string;
  /** What the final payment must cover: total - paid. */
  remaining: string;
  /** Orders not accepted yet or with an open dispute: they block payment. */
  blockingOrders: number;
  /** The items of the bill, for paying them one by one. */
  items: BillableItem[];
}

export type { BillableItem };

/** What billing may ask of ordering (public interface): a table's bill, and closing it. */
@Injectable()
export class SessionLedger {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly realtime: RealtimeGateway,
    private readonly venues: VenueDirectory,
  ) {}

  async summary(venueId: string, sessionId: string): Promise<SessionBillSummary> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const session = await trx
        .selectFrom('ordering.table_sessions')
        .select(['table_label', 'paid_amount'])
        .where('id', '=', sessionId)
        .where('status', 'in', ['open', 'bill_requested'])
        .executeTakeFirst();
      if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
      const orders = await loadOrders(trx, sessionId);
      const bill = buildBill(orders, session.paid_amount);
      return {
        tableLabel: session.table_label,
        total: bill.total,
        vatAmount: bill.vatAmount,
        paid: bill.paid,
        remaining: bill.remaining,
        blockingOrders: blockingOrders(orders),
        items: billableItems(orders),
      };
    });
  }

  /**
   * Closes the table after its payment (FR-KON-21). The bill is checked again under the
   * session lock: if a guest ordered in the meantime, nothing closes (bill_changed).
   */
  async closeAfterPayment(
    staff: StaffClaims,
    sessionId: string,
    payment: { id: string; amount: string; method: string },
    /** Items paid earlier by partial payments and their method, for the report (FR-KON-20). */
    methodsByItem: ReadonlyMap<string, string> = new Map(),
  ): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const orders = await loadOrders(trx, sessionId);
      if (blockingOrders(orders) > 0) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
      }
      // The last payment covers exactly what partial payments left.
      if (buildBill(orders, await this.paidAmount(trx, sessionId)).remaining !== payment.amount) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billChanged, 'The bill changed; check it again');
      }
      await closeSession(trx, staff, session, payment);
      await this.publishSettled(trx, staff, session, payment, methodsByItem);
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'session.closed');
  }

  /**
   * A partial payment (FR-KON-20): the table stays open and its bill shows the payment. Under
   * the session lock the amount may not exceed what is still to pay. Billing keeps which items
   * were paid; ordering keeps only the sum.
   */
  async recordPartialPayment(
    staff: StaffClaims,
    sessionId: string,
    payment: { id: string; amount: string; method: string },
  ): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const orders = await loadOrders(trx, sessionId);
      const bill = buildBill(orders, await this.paidAmount(trx, sessionId));
      if (cents(payment.amount) <= 0 || cents(payment.amount) >= cents(bill.remaining)) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billChanged, 'The bill changed; check it again');
      }
      await trx
        .updateTable('ordering.table_sessions')
        .set((eb) => ({ paid_amount: eb('paid_amount', '+', payment.amount) }))
        .where('id', '=', sessionId)
        .execute();
      await trx
        .insertInto('ordering.outbox')
        .values({
          venue_id: staff.venueId,
          event_type: 'session.partially_paid',
          aggregate_id: sessionId,
          payload: JSON.stringify({
            type: 'session.partially_paid',
            venueId: staff.venueId,
            sessionId,
            tableId: session.table_id,
            tableLabel: session.table_label,
            entityId: sessionId,
            total: payment.amount,
            details: { paymentId: payment.id, method: payment.method },
            actor: { id: staff.memberId, label: staff.name },
            actorKind: 'staff',
          } satisfies OrderingEvent),
        })
        .execute();
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'session.partially_paid');
  }

  private async paidAmount(trx: Tx, sessionId: string): Promise<string> {
    const row = await trx
      .selectFrom('ordering.table_sessions')
      .select('paid_amount')
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();
    return row.paid_amount;
  }

  /**
   * The billed items of a paid table, as reporting needs them (FR-SEF-24). Same transaction
   * as the close, so the report and the bill can never disagree.
   */
  private async publishSettled(
    trx: Tx,
    staff: StaffClaims,
    session: { id: string; table_id: string; table_label: string },
    payment: { id: string; method: string },
    methodsByItem: ReadonlyMap<string, string>,
  ): Promise<void> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    const timezone = settings?.timezone ?? 'Europe/Sarajevo';
    const { rows } = await sql<{
      order_item_id: string;
      order_id: string;
      business_date: string;
      hour_of_day: number;
      day_of_week: number;
      served_at: Date;
      member_id: string | null;
      item_id: string;
      item_name: string;
      category_name: string | null;
      quantity: number;
      line_total: string;
      vat_rate: string;
    }>`
      select oi.id as order_item_id, o.id as order_id, o.business_date::text as business_date,
             extract(hour from o.created_at at time zone ${timezone})::int as hour_of_day,
             extract(isodow from o.created_at at time zone ${timezone})::int as day_of_week,
             coalesce(o.served_at, now()) as served_at,
             coalesce(o.accepted_by_member_id, o.created_by_member_id) as member_id,
             oi.item_id, oi.item_name, oi.category_name, oi.quantity, oi.line_total, o.vat_rate
        from ordering.order_items oi
        join ordering.orders o on o.id = oi.order_id
       where o.session_id = ${session.id}
         and o.status in ('accepted', 'preparing', 'ready', 'served')
         and o.dispute_status is distinct from 'open'
         and oi.status in ('pending', 'preparing', 'ready', 'served')
       order by o.created_at, oi.created_at
    `.execute(trx);
    if (rows.length === 0) return;

    const memberIds = [...new Set(rows.map((r) => r.member_id).filter((id) => id !== null))];
    const [names, plan] = await Promise.all([
      this.venues.memberNames(staff.venueId, memberIds),
      this.venues.floorPlan(staff.venueId),
    ]);
    const areaId = plan.tables.find((t) => t.id === session.table_id)?.areaId;
    const event: SessionSettledEvent = {
      type: 'session.settled',
      venueId: staff.venueId,
      sessionId: session.id,
      paymentId: payment.id,
      paymentMethod: payment.method as SessionSettledEvent['paymentMethod'],
      // Items a guest paid earlier carry that payment's method.
      itemMethods: Object.fromEntries(
        rows
          .filter((r) => methodsByItem.has(r.order_item_id))
          .map((r) => [r.order_item_id, methodsByItem.get(r.order_item_id)!]),
      ) as SessionSettledEvent['itemMethods'],
      tableLabel: session.table_label,
      areaName: plan.areas.find((a) => a.id === areaId)?.name ?? null,
      settledAt: new Date().toISOString(),
      items: rows.map((r) => ({
        orderItemId: r.order_item_id,
        orderId: r.order_id,
        businessDate: r.business_date,
        hourOfDay: r.hour_of_day,
        dayOfWeek: r.day_of_week,
        servedAt: r.served_at.toISOString(),
        memberId: r.member_id,
        memberName: r.member_id ? (names.get(r.member_id) ?? null) : null,
        itemId: r.item_id,
        itemName: r.item_name,
        categoryName: r.category_name,
        quantity: r.quantity,
        revenue: r.line_total,
        vatAmount: vatOf(r.line_total, r.vat_rate),
      })),
    };
    await trx
      .insertInto('ordering.outbox')
      .values({
        venue_id: staff.venueId,
        event_type: event.type,
        aggregate_id: session.id,
        payload: JSON.stringify(event),
      })
      .execute();
  }
}
