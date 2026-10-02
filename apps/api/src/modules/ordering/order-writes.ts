import type { OrderStatus } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import type { PricedLine } from '../catalog/index.js';
import type { OrderingSettings } from '../core/index.js';

const cents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);

/** VAT contained in a price that includes it. */
export const vatOf = (total: string, rate: string) =>
  fromCents(Math.round((cents(total) * Number(rate)) / (100 + Number(rate))));

export const sumLines = (lines: { lineTotal: string }[]) =>
  fromCents(lines.reduce((sum, l) => sum + cents(l.lineTotal), 0));

/** Items that still count in an order's total. */
export const LIVE_ITEM_STATUSES = ['pending', 'preparing', 'ready', 'served'] as const;

export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}

/** Business date in the venue's timezone (before business_day_starts_at = the day before) and its next order number. */
export async function nextOrderNumber(
  trx: Tx,
  venueId: string,
  settings: Pick<OrderingSettings, 'timezone' | 'businessDayStartsAt'>,
): Promise<{ businessDate: string; orderNumber: number }> {
  const { rows } = await sql<{ business_date: string; order_number: number }>`
    with d as (
      select ((now() at time zone ${settings.timezone})
              - ${settings.businessDayStartsAt}::interval)::date as business_date
    )
    select d.business_date::text as business_date,
           ordering.next_order_number(${venueId}::uuid, d.business_date) as order_number
      from d
  `.execute(trx);
  return { businessDate: rows[0]!.business_date, orderNumber: rows[0]!.order_number };
}

/** Writes priced lines (snapshots) with their options; returns the new item ids. */
export async function insertLines(
  trx: Tx,
  venueId: string,
  orderId: string,
  lines: PricedLine[],
  extra: { addedByMemberId?: string; replacesOrderItemId?: string } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (const line of lines) {
    const item = await trx
      .insertInto('ordering.order_items')
      .values({
        venue_id: venueId,
        order_id: orderId,
        item_id: line.itemId,
        item_name: line.itemName,
        category_name: line.categoryName,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        line_total: line.lineTotal,
        note: line.note,
        prep_station_id: line.prepStationId,
        added_by_member_id: extra.addedByMemberId ?? null,
        replaces_order_item_id: extra.replacesOrderItemId ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    ids.push(item.id);
    if (line.modifiers.length) {
      await trx
        .insertInto('ordering.order_item_modifiers')
        .values(
          line.modifiers.map((m) => ({
            venue_id: venueId,
            order_item_id: item.id,
            modifier_option_id: m.optionId,
            group_name: m.groupName,
            option_name: m.optionName,
            price_delta: m.priceDelta,
          })),
        )
        .execute();
    }
  }
  return ids;
}

export async function addHistory(
  trx: Tx,
  venueId: string,
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  memberId: string | null = null,
): Promise<void> {
  await trx
    .insertInto('ordering.order_status_history')
    .values({
      venue_id: venueId,
      order_id: orderId,
      from_status: from,
      to_status: to,
      changed_by_member_id: memberId,
    })
    .execute();
}

/** Total and VAT of an order from its live items, after staff changed them. */
export async function recalculate(trx: Tx, orderId: string): Promise<string> {
  const order = await trx
    .selectFrom('ordering.orders')
    .select('vat_rate')
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  const items = await trx
    .selectFrom('ordering.order_items')
    .select('line_total')
    .where('order_id', '=', orderId)
    .where('status', 'in', [...LIVE_ITEM_STATUSES])
    .execute();
  const total = sumLines(items.map((i) => ({ lineTotal: i.line_total })));
  await trx
    .updateTable('ordering.orders')
    .set({ total, vat_amount: vatOf(total, order.vat_rate), modified_at: new Date() })
    .where('id', '=', orderId)
    .execute();
  return total;
}
