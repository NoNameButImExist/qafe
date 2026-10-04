import type { TenantDatabase } from '@qafe/db';
import { sql } from 'kysely';

/**
 * Housekeeping that no request triggers. Every task works across venues, so it runs with the
 * super-admin RLS context of the module's own role (it still sees only its own schema).
 */
const ALL_VENUES = { venueId: null, isSuperAdmin: true } as const;

export interface MaintenanceDbs {
  core: TenantDatabase;
  catalog: TenantDatabase;
  ordering: TenantDatabase;
  billing: TenantDatabase;
  audit: TenantDatabase;
  reporting: TenantDatabase;
}

/** Months created ahead, so the DEFAULT partition stays empty (adding a month then works). */
const MONTHS_AHEAD = 4;

/**
 * The audit log and the sales facts are split by month: create the partitions for this
 * month and the next ones. Safe to run any number of times.
 */
export async function ensurePartitions(
  dbs: Pick<MaintenanceDbs, 'audit' | 'reporting'>,
): Promise<number> {
  const create = (db: TenantDatabase, table: string) =>
    db.withTenant(ALL_VENUES, async (trx) => {
      const { rows } = await sql<{
        created: number;
      }>`select app.ensure_month_partitions(${table}::regclass, current_date, ${MONTHS_AHEAD}) as created`.execute(
        trx,
      );
      return rows[0]?.created ?? 0;
    });
  return (
    (await create(dbs.audit, 'audit.audit_logs')) +
    (await create(dbs.reporting, 'reporting.order_item_facts'))
  );
}

/**
 * Tables someone opened and left: no order to pay or to prepare, and no device seen for
 * `idleMinutes`. They are abandoned (the trigger releases the devices, so they can scan again)
 * and their open requests are cancelled. A table with an unpaid bill is never closed here:
 * that is the waiter's job.
 */
export async function closeAbandonedSessions(
  db: TenantDatabase,
  idleMinutes: number,
): Promise<number> {
  return db.withTenant(ALL_VENUES, async (trx) => {
    const { rows } = await sql<{ id: string }>`
      with idle as (
        select s.id
          from ordering.table_sessions s
         where s.status in ('open', 'bill_requested')
           and s.opened_at < now() - make_interval(mins => ${idleMinutes})
           and not exists (
             select 1 from ordering.orders o
              where o.session_id = s.id
                and o.status not in ('cancelled', 'rejected', 'withdrawn')
           )
           and not exists (
             select 1 from ordering.session_guests g
              where g.session_id = s.id
                and g.last_seen_at > now() - make_interval(mins => ${idleMinutes})
           )
         for update skip locked
      )
      update ordering.table_sessions s
         set status = 'abandoned', closed_at = now()
        from idle
       where s.id = idle.id
      returning s.id
    `.execute(trx);
    if (rows.length > 0) {
      await trx
        .updateTable('ordering.service_requests')
        .set({ status: 'cancelled', handled_at: new Date() })
        .where(
          'session_id',
          'in',
          rows.map((r) => r.id),
        )
        .where('status', 'in', ['open', 'acknowledged'])
        .execute();
    }
    return rows.length;
  });
}

export interface PurgeResult {
  deviceBlocks: number;
  authSessions: number;
  outbox: number;
}

/**
 * Removes what is no longer needed: device blocks that ended a week ago, sign-in sessions that
 * expired or were revoked a month ago, and outbox events relayed a month ago (the audit log,
 * reports and pushes already have them).
 */
export async function purgeExpired(dbs: MaintenanceDbs): Promise<PurgeResult> {
  const deviceBlocks = await dbs.ordering.withTenant(ALL_VENUES, async (trx) => {
    const r = await trx
      .deleteFrom('ordering.device_blocks')
      .where('blocked_until', '<', sql<Date>`now() - interval '7 days'`)
      .executeTakeFirst();
    return Number(r.numDeletedRows);
  });
  const authSessions = await dbs.core.withTenant(ALL_VENUES, async (trx) => {
    const r = await trx
      .deleteFrom('core.auth_sessions')
      .where((eb) =>
        eb.or([
          eb('expires_at', '<', sql<Date>`now() - interval '30 days'`),
          eb('revoked_at', '<', sql<Date>`now() - interval '30 days'`),
        ]),
      )
      .executeTakeFirst();
    return Number(r.numDeletedRows);
  });
  let outbox = 0;
  for (const [schema, db] of Object.entries({
    core: dbs.core,
    catalog: dbs.catalog,
    ordering: dbs.ordering,
    billing: dbs.billing,
  })) {
    outbox += await db.withTenant(ALL_VENUES, async (trx) => {
      const { numAffectedRows } = await sql`
        delete from ${sql.table(`${schema}.outbox`)}
         where published_at < now() - interval '30 days'
      `.execute(trx);
      return Number(numAffectedRows ?? 0);
    });
  }
  return { deviceBlocks, authSessions, outbox };
}
