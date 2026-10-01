import { SessionSettledEvent } from '@qafe/contracts';
import type { TenantDatabase } from '@qafe/db';
import type { OutboxEvent } from './outbox-relay.js';

/**
 * Turns "session.settled" (a paid table) into reporting.order_item_facts, one row per paid
 * item (FR-SEF-24). Idempotent: an item already written is skipped, so a redelivered batch
 * changes nothing.
 */
export class ReportingWriter {
  constructor(private readonly db: TenantDatabase) {}

  readonly handle = async (events: OutboxEvent[]): Promise<void> => {
    for (const event of events) {
      if (event.source !== 'ordering' || event.type !== 'session.settled') continue;
      const parsed = SessionSettledEvent.safeParse(event.payload);
      if (!parsed.success) continue;
      const e = parsed.data;
      if (e.items.length === 0) continue;
      await this.db.withTenant({ venueId: e.venueId, isSuperAdmin: false }, (trx) =>
        trx
          .insertInto('reporting.order_item_facts')
          .values(
            e.items.map((i) => ({
              order_item_id: i.orderItemId,
              venue_id: e.venueId,
              order_id: i.orderId,
              business_date: i.businessDate,
              served_at: i.servedAt,
              hour_of_day: i.hourOfDay,
              day_of_week: i.dayOfWeek,
              table_label: e.tableLabel,
              area_name: e.areaName,
              member_id: i.memberId,
              member_name: i.memberName?.slice(0, 60) ?? null,
              item_id: i.itemId,
              item_name: i.itemName,
              category_name: i.categoryName,
              quantity: i.quantity,
              revenue: i.revenue,
              vat_amount: i.vatAmount,
              payment_method: e.paymentMethod,
            })),
          )
          .onConflict((oc) => oc.column('order_item_id').doNothing())
          .execute(),
      );
    }
  };
}
