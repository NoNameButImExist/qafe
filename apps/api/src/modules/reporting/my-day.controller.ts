import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MyDayQuery, type MyDay } from '@qafe/contracts';
import { sql } from 'kysely';
import { CurrentStaff, StaffGuard, type StaffClaims } from '../../common/auth/auth.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { VenueDirectory } from '../core/index.js';
import { ReportingDatabase } from './reporting.database.js';

/**
 * A member's own turnover for a business day (FR-KON-23): every member may see their own,
 * no reports permission needed. Counted from paid tables (the report facts), by the member
 * who accepted each order.
 */
@Controller('reports')
@UseGuards(StaffGuard)
export class MyDayController {
  constructor(
    private readonly db: ReportingDatabase,
    private readonly venues: VenueDirectory,
  ) {}

  @Get('me')
  async myDay(
    @CurrentStaff() staff: StaffClaims,
    @Query(new ZodPipe(MyDayQuery)) query: MyDayQuery,
  ): Promise<MyDay> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, async (trx) => {
      const date =
        query.date ??
        (
          await sql<{ d: string }>`
            select (((now() at time zone ${settings?.timezone ?? 'Europe/Sarajevo'})
                     - ${settings?.businessDayStartsAt ?? '00:00'}::interval)::date)::text as d
          `.execute(trx)
        ).rows[0]!.d;
      const mine = sql`business_date = ${date}::date and member_id = ${staff.memberId}::uuid`;
      const [totals, byMethod, top] = await Promise.all([
        sql<{ revenue: string; orders: number; items: number }>`
          select coalesce(sum(revenue), 0)::numeric(12,2)::text as revenue,
                 count(distinct order_id)::int as orders,
                 coalesce(sum(quantity), 0)::int as items
            from reporting.order_item_facts where ${mine}
        `.execute(trx),
        sql<{ method: string; revenue: string }>`
          select coalesce(payment_method::text, 'cash') as method,
                 sum(revenue)::numeric(12,2)::text as revenue
            from reporting.order_item_facts where ${mine}
           group by 1 order by sum(revenue) desc
        `.execute(trx),
        sql<{ name: string; quantity: number; revenue: string }>`
          select item_name as name, sum(quantity)::int as quantity,
                 sum(revenue)::numeric(12,2)::text as revenue
            from reporting.order_item_facts where ${mine}
           group by item_name order by sum(quantity) desc, item_name limit 5
        `.execute(trx),
      ]);
      const t = totals.rows[0]!;
      return {
        date,
        revenue: t.revenue,
        orders: t.orders,
        items: t.items,
        byMethod: byMethod.rows,
        topItems: top.rows,
      };
    });
  }
}
