import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SessionSettledEvent } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { VenueDirectory } from '../core/index.js';
import { fail } from './guest-session.service.js';
import { OrderingDatabase } from './ordering.database.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { vatOf } from './order-writes.js';
import { blockingOrders, buildBill, loadOrders } from './session-view.js';
import { activeSession, closeSession } from './staff-sessions.service.js';

export interface SessionBillSummary {
  tableLabel: string;
  total: string;
  vatAmount: string;
  /** Orders not accepted yet or with an open dispute: they block payment. */
  blockingOrders: number;
}

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
        .select('table_label')
        .where('id', '=', sessionId)
        .where('status', 'in', ['open', 'bill_requested'])
        .executeTakeFirst();
      if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
      const orders = await loadOrders(trx, sessionId);
      const bill = buildBill(orders);
      return {
        tableLabel: session.table_label,
        total: bill.total,
        vatAmount: bill.vatAmount,
        blockingOrders: blockingOrders(orders),
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
  ): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const orders = await loadOrders(trx, sessionId);
      if (blockingOrders(orders) > 0) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
      }
      if (buildBill(orders).total !== payment.amount) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billChanged, 'The bill changed; check it again');
      }
      await closeSession(trx, staff, session, payment);
      await this.publishSettled(trx, staff, session, payment);
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'session.closed');
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
