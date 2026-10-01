import { Injectable } from '@nestjs/common';
import type { ReportSummary, ReportTotals } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql, type RawBuilder } from 'kysely';
import { ReportingDatabase } from './reporting.database.js';

const DAY = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Agg {
  revenue: string;
  orders: number;
  quantity: number;
}

/** Shared columns of every grouped row. */
const AGG = sql`
  coalesce(sum(revenue), 0)::numeric(12,2)::text as revenue,
  count(distinct order_id)::int as orders,
  coalesce(sum(quantity), 0)::int as quantity
`;

/**
 * Sales reports from reporting.order_item_facts (FR-SEF-24): one fact per paid item, written
 * by the worker when a table is paid. Everything runs in the venue's RLS context.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly db: ReportingDatabase) {}

  summary(venueId: string, from: string, to: string): Promise<ReportSummary> {
    const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
    const prevTo = isoDate(Date.parse(from) - DAY);
    const prevFrom = isoDate(Date.parse(from) - days * DAY);

    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const range = sql`business_date between ${from}::date and ${to}::date`;
      const group = <T>(
        select: RawBuilder<unknown>,
        by: RawBuilder<unknown>,
        order: RawBuilder<unknown>,
      ) =>
        sql<T & Agg>`
          select ${select}, ${AGG}
            from reporting.order_item_facts
           where ${range}
           group by ${by}
           order by ${order}
        `
          .execute(trx)
          .then((r) => r.rows);

      const [totals, previous, byDay, byHour, byWeekday, byItem, byCategory, byMember, byPayment] =
        await Promise.all([
          this.totals(trx, from, to),
          this.totals(trx, prevFrom, prevTo),
          group<{ date: string }>(
            sql`business_date::text as date`,
            sql`business_date`,
            sql`business_date`,
          ),
          group<{ hour: number }>(sql`hour_of_day as hour`, sql`hour_of_day`, sql`hour_of_day`),
          group<{ day: number }>(sql`day_of_week as day`, sql`day_of_week`, sql`day_of_week`),
          group<{ itemId: string; name: string; category: string | null }>(
            sql`item_id as "itemId", max(item_name) as name, max(category_name) as category`,
            sql`item_id`,
            sql`sum(revenue) desc, max(item_name)`,
          ),
          group<{ name: string | null }>(
            sql`category_name as name`,
            sql`category_name`,
            sql`sum(revenue) desc`,
          ),
          group<{ memberId: string | null; name: string | null }>(
            sql`member_id as "memberId", max(member_name) as name`,
            sql`member_id`,
            sql`sum(revenue) desc`,
          ),
          group<{ method: 'cash' | 'card' | 'online' | null }>(
            sql`payment_method as method`,
            sql`payment_method`,
            sql`sum(revenue) desc`,
          ),
        ]);

      const zero = { revenue: '0.00', orders: 0, quantity: 0 };
      return {
        from,
        to,
        previous: { from: prevFrom, to: prevTo, totals: previous },
        totals,
        // Every day, hour and weekday is listed, also without sales, so charts have no gaps.
        byDay: Array.from({ length: days }, (_, i) => {
          const date = isoDate(Date.parse(from) + i * DAY);
          return { date, ...zero, ...strip(byDay.find((d) => d.date === date)) };
        }),
        byHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          ...zero,
          ...strip(byHour.find((h) => h.hour === hour)),
        })),
        byWeekday: Array.from({ length: 7 }, (_, i) => ({
          day: i + 1,
          ...zero,
          ...strip(byWeekday.find((d) => d.day === i + 1)),
        })),
        byItem,
        byCategory,
        byMember,
        byPaymentMethod: byPayment,
      };
    });
  }

  private async totals(trx: Tx, from: string, to: string): Promise<ReportTotals> {
    const { rows } = await sql<{ revenue: string; vat: string; orders: number; items: number }>`
      select coalesce(sum(revenue), 0)::numeric(12,2)::text as revenue,
             coalesce(sum(vat_amount), 0)::numeric(12,2)::text as vat,
             count(distinct order_id)::int as orders,
             coalesce(sum(quantity), 0)::int as items
        from reporting.order_item_facts
       where business_date between ${from}::date and ${to}::date
    `.execute(trx);
    const t = rows[0]!;
    return {
      revenue: t.revenue,
      vatAmount: t.vat,
      orders: t.orders,
      items: t.items,
      averageOrder: t.orders ? (Number(t.revenue) / t.orders).toFixed(2) : '0.00',
    };
  }
}

/** Only the aggregate columns of a found row (the key comes from the filled list). */
function strip(row: (Agg & object) | undefined): Partial<Agg> {
  return row ? { revenue: row.revenue, orders: row.orders, quantity: row.quantity } : {};
}
