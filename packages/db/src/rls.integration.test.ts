// NFR-09: a venue never sees another venue's data. Runs against real Postgres (Testcontainers).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDatabase } from './index.js';
import { startTestDatabase, type TestDatabase } from './testing/index.js';

const VENUE_A = '00000000-0000-4000-8000-00000000000a';
const VENUE_B = '00000000-0000-4000-8000-00000000000b';

describe('row level security', () => {
  let testDb: TestDatabase;
  let ordering: TenantDatabase;
  let core: TenantDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    // Fixtures as superuser (bypasses RLS): two venues, each with one table session and order.
    const admin = new pg.Client({ connectionString: testDb.adminUrl });
    await admin.connect();
    for (const [venueId, slug] of [
      [VENUE_A, 'venue-a'],
      [VENUE_B, 'venue-b'],
    ] as const) {
      await admin.query(
        `INSERT INTO core.venues (id, slug, name, status) VALUES ($1, $2, $2, 'active')`,
        [venueId, slug],
      );
      const session = await admin.query<{ id: string }>(
        `INSERT INTO ordering.table_sessions (venue_id, table_id, table_label)
         VALUES ($1, gen_random_uuid(), 'T1') RETURNING id`,
        [venueId],
      );
      await admin.query(
        `INSERT INTO ordering.orders (venue_id, session_id, table_id, business_date, order_number,
                                      source, created_by_member_id, vat_rate, idempotency_key)
         VALUES ($1, $2, gen_random_uuid(), current_date, 1, 'staff', gen_random_uuid(), 17, gen_random_uuid())`,
        [venueId, session.rows[0]?.id],
      );
    }
    await admin.end();

    ordering = new TenantDatabase(testDb.connection('ordering'));
    core = new TenantDatabase(testDb.connection('core'));
  }, 120_000);

  afterAll(async () => {
    await ordering?.close();
    await core?.close();
    await testDb?.stop();
  });

  const orderVenues = (db: TenantDatabase, venueId: string | null, isSuperAdmin = false) =>
    db.withTenant({ venueId, isSuperAdmin }, (trx) =>
      trx.selectFrom('ordering.orders').select('venue_id').execute(),
    );

  it('venue A sees only its own orders', async () => {
    const rows = await orderVenues(ordering, VENUE_A);
    expect(rows.map((r) => r.venue_id)).toEqual([VENUE_A]);
  });

  it('venue B sees only its own orders', async () => {
    const rows = await orderVenues(ordering, VENUE_B);
    expect(rows.map((r) => r.venue_id)).toEqual([VENUE_B]);
  });

  it('without tenant context nothing is visible', async () => {
    expect(await orderVenues(ordering, null)).toEqual([]);
  });

  it('super admin sees every venue', async () => {
    const rows = await orderVenues(ordering, null, true);
    expect(rows.map((r) => r.venue_id).sort()).toEqual([VENUE_A, VENUE_B]);
  });

  it('venue A cannot write rows for venue B', async () => {
    await expect(
      ordering.withTenant({ venueId: VENUE_A, isSuperAdmin: false }, (trx) =>
        trx
          .insertInto('ordering.venue_order_counters')
          .values({ venue_id: VENUE_B, business_date: '2026-01-01' })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a module cannot read another module schema', async () => {
    await expect(
      ordering.withTenant({ venueId: VENUE_A, isSuperAdmin: true }, (trx) =>
        trx.selectFrom('core.venues').select('id').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('resolve_venue works before the venue is known, for svc_core only', async () => {
    const run = (db: TenantDatabase) =>
      db.withTenant({ venueId: null, isSuperAdmin: false }, (trx) =>
        trx
          .selectFrom(
            // Table function: the only way to find a venue by slug under RLS.
            (eb) => eb.fn<{ venue_id: string }>('core.resolve_venue', [eb.val('venue-a')]).as('v'),
          )
          .select('v.venue_id')
          .execute(),
      );
    expect(await run(core)).toEqual([{ venue_id: VENUE_A }]);
    await expect(run(ordering)).rejects.toThrow(/permission denied/);
  });
});
