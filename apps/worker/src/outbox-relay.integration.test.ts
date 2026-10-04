// Outbox relay against real Postgres: core.outbox (as svc_core) → audit.audit_logs (as svc_audit).
import { TenantDatabase } from '@qafe/db';
import { startTestDatabase, type TestDatabase } from '@qafe/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditWriter, isAudited } from './audit-writer.js';
import { OutboxRelay } from './outbox-relay.js';
import { closeAbandonedSessions, ensurePartitions, purgeExpired } from './maintenance.js';
import { PushNotifier } from './push-notifier.js';
import { ReportingWriter } from './reporting-writer.js';

const ACTOR = { id: '11111111-1111-4111-8111-111111111111', label: 'Qafe Admin (admin@qafe.ba)' };
const VENUE = '22222222-2222-4222-8222-222222222222';

let testDb: TestDatabase;
let admin: pg.Client;
let core: TenantDatabase;
let audit: TenantDatabase;

beforeAll(async () => {
  testDb = await startTestDatabase();
  admin = new pg.Client({ connectionString: testDb.adminUrl });
  await admin.connect();
  core = new TenantDatabase(testDb.connection('core'));
  audit = new TenantDatabase(testDb.connection('audit'));
});

afterAll(async () => {
  await core?.close();
  await audit?.close();
  await admin?.end();
  await testDb?.stop();
});

beforeEach(async () => {
  await admin.query('TRUNCATE core.outbox');
  // audit_logs refuses DELETE by design; start each test from a clean table.
  await admin.query('TRUNCATE audit.audit_logs');
});

async function emit(n: number) {
  for (let i = 0; i < n; i++) {
    const payload = {
      type: 'venue.status_changed',
      venueId: VENUE,
      venueName: 'Fildžan',
      from: 'pending',
      to: i % 2 ? 'active' : 'suspended',
      actor: ACTOR,
    };
    await admin.query(
      `INSERT INTO core.outbox (venue_id, event_type, aggregate_id, payload) VALUES ($1, $2, $1, $3)`,
      [VENUE, payload.type, JSON.stringify(payload)],
    );
  }
}

const count = async (sql: string) => Number((await admin.query<{ n: string }>(sql)).rows[0]?.n);

describe('outbox relay → audit log', () => {
  it('relays every event once and marks it published', async () => {
    await emit(5);
    const relay = new OutboxRelay([{ schema: 'core', db: core }], new AuditWriter(audit).handle, {
      batchSize: 2,
      intervalMs: 1000,
    });
    expect(await relay.drain()).toBe(5);
    expect(await count('SELECT count(*) AS n FROM audit.audit_logs')).toBe(5);
    expect(await count('SELECT count(*) AS n FROM core.outbox WHERE published_at IS NULL')).toBe(0);
    expect(await relay.drain()).toBe(0);

    const { rows } = await admin.query(
      `SELECT actor_label, venue_label, service FROM audit.audit_logs ORDER BY id LIMIT 1`,
    );
    expect(rows[0]).toEqual({ actor_label: ACTOR.label, venue_label: 'Fildžan', service: 'core' });
  });

  it('writes a redelivered event only once (idempotent)', async () => {
    await emit(2);
    const writer = new AuditWriter(audit);
    const relay = new OutboxRelay([{ schema: 'core', db: core }], writer.handle);
    await relay.drain();
    // Simulate a crash after the audit write but before the outbox was marked.
    await admin.query('UPDATE core.outbox SET published_at = NULL');
    expect(await relay.drain()).toBe(2);
    expect(await count('SELECT count(*) AS n FROM audit.audit_logs')).toBe(2);
    // The admin filters come from small tables the writer keeps, not from the log.
    expect(await count('SELECT count(*) AS n FROM audit.actions')).toBeGreaterThanOrEqual(1);
    expect(await count('SELECT count(*) AS n FROM audit.venue_labels')).toBeGreaterThanOrEqual(1);
  });

  it('leaves events unpublished when the handler fails, and retries them', async () => {
    await emit(3);
    const failing = new OutboxRelay([{ schema: 'core', db: core }], () =>
      Promise.reject(new Error('down')),
    );
    await expect(failing.tick()).rejects.toThrow('down');
    expect(await count('SELECT count(*) AS n FROM core.outbox WHERE published_at IS NULL')).toBe(3);

    const relay = new OutboxRelay([{ schema: 'core', db: core }], new AuditWriter(audit).handle);
    expect(await relay.drain()).toBe(3);
  });

  it('the audit role cannot change or delete entries (NFR-25)', async () => {
    await emit(1);
    await new OutboxRelay([{ schema: 'core', db: core }], new AuditWriter(audit).handle).drain();
    await expect(
      audit.withTenant({ venueId: null, isSuperAdmin: false }, (trx) =>
        trx.deleteFrom('audit.audit_logs').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('web push for staff (FR-KON-05)', () => {
  it('notifies every staff device of the venue and forgets gone subscriptions', async () => {
    const ordering = new TenantDatabase(testDb.connection('ordering'));
    try {
      const member = '33333333-3333-4333-8333-333333333333';
      for (const name of ['live', 'gone']) {
        await admin.query(
          `INSERT INTO ordering.push_subscriptions (venue_id, member_id, endpoint, p256dh, auth)
           VALUES ($1, $2, $3, 'key', 'auth')`,
          [VENUE, member, `https://push.example.com/${name}`],
        );
      }
      const sent: { endpoint: string; payload: string }[] = [];
      const notifier = new PushNotifier(ordering, (target, payload) => {
        sent.push({ endpoint: target.endpoint, payload });
        return target.endpoint.endsWith('/gone')
          ? Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 }))
          : Promise.resolve();
      });
      await notifier.handle([
        {
          source: 'ordering',
          id: '1',
          venueId: VENUE,
          type: 'service.requested',
          aggregateId: VENUE,
          createdAt: new Date(),
          payload: {
            type: 'service.requested',
            venueId: VENUE,
            sessionId: '55555555-5555-4555-8555-555555555555',
            tableId: '66666666-6666-4666-8666-666666666666',
            tableLabel: 'T4',
            entityId: '77777777-7777-4777-8777-777777777777',
            actor: { id: ACTOR.id, label: 'Gost 1 (sto T4)' },
            actorKind: 'guest',
          },
        },
      ]);
      expect(sent.map((s) => s.endpoint).sort()).toEqual([
        'https://push.example.com/gone',
        'https://push.example.com/live',
      ]);
      expect(JSON.parse(sent[0]!.payload)).toMatchObject({ type: 'call_waiter', tableLabel: 'T4' });
      const left = await admin.query<{ endpoint: string }>(
        'SELECT endpoint FROM ordering.push_subscriptions',
      );
      expect(left.rows).toEqual([{ endpoint: 'https://push.example.com/live' }]);
    } finally {
      await ordering.close();
    }
  });
});

describe('report facts (FR-SEF-24)', () => {
  it('writes one fact per paid item and ignores a redelivery', async () => {
    const reporting = new TenantDatabase(testDb.connection('reporting'));
    try {
      const item = (n: number) => ({
        orderItemId: `8888888${n}-8888-4888-8888-888888888888`,
        orderId: '99999999-9999-4999-8999-999999999999',
        businessDate: '2026-09-10',
        hourOfDay: 21,
        dayOfWeek: 4,
        servedAt: '2026-09-10T19:30:00.000Z',
        memberId: null,
        memberName: null,
        itemId: '77777777-7777-4777-8777-777777777777',
        itemName: 'Espresso',
        categoryName: 'Topli napici',
        quantity: n,
        revenue: (2 * n).toFixed(2),
        vatAmount: '0.29',
      });
      const event = {
        source: 'ordering',
        id: '10',
        venueId: VENUE,
        type: 'session.settled',
        aggregateId: VENUE,
        createdAt: new Date(),
        payload: {
          type: 'session.settled',
          venueId: VENUE,
          sessionId: '55555555-5555-4555-8555-555555555555',
          paymentId: '66666666-6666-4666-8666-666666666666',
          paymentMethod: 'card',
          tableLabel: 'T4',
          areaName: 'Terasa',
          settledAt: '2026-09-10T20:00:00.000Z',
          items: [item(1), item(2)],
        },
      };
      const writer = new ReportingWriter(reporting);
      await writer.handle([event]);
      await writer.handle([event]);
      const { rows } = await admin.query<{
        quantity: number;
        revenue: string;
        area_name: string;
        payment_method: string;
      }>(
        'SELECT quantity, revenue, area_name, payment_method FROM reporting.order_item_facts ORDER BY quantity',
      );
      expect(rows).toEqual([
        { quantity: 1, revenue: '2.00', area_name: 'Terasa', payment_method: 'card' },
        { quantity: 2, revenue: '4.00', area_name: 'Terasa', payment_method: 'card' },
      ]);
      expect(isAudited(event)).toBe(false);
    } finally {
      await reporting.close();
    }
  });
});

describe('maintenance jobs', () => {
  it('closes only idle tables without orders, and purges old rows', async () => {
    const connect = (m: 'core' | 'catalog' | 'ordering' | 'billing' | 'audit' | 'reporting') =>
      new TenantDatabase(testDb.connection(m));
    const dbs = {
      core: connect('core'),
      catalog: connect('catalog'),
      ordering: connect('ordering'),
      billing: connect('billing'),
      audit: connect('audit'),
      reporting: connect('reporting'),
    };
    try {
      const venue = await admin.query<{ id: string }>(
        `INSERT INTO core.venues (slug, name, status) VALUES ('odrzavanje', 'Odrzavanje', 'active') RETURNING id`,
      );
      const venueId = venue.rows[0]!.id;
      const session = async (label: string, openedAgo: string, seenAgo: string) => {
        const table = await admin.query<{ id: string }>(
          `INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, $2, md5(random()::text)) RETURNING id`,
          [venueId, label],
        );
        const s = await admin.query<{ id: string }>(
          `INSERT INTO ordering.table_sessions (venue_id, table_id, table_label, opened_at)
           VALUES ($1, $2, $3, now() - $4::interval) RETURNING id`,
          [venueId, table.rows[0]!.id, label, openedAgo],
        );
        const g = await admin.query<{ id: string }>(
          `INSERT INTO ordering.session_guests (venue_id, session_id, device_hash, nickname, status, approved_at, last_seen_at)
           VALUES ($1, $2, md5(random()::text), 'Gost 1', 'approved', now(), now() - $3::interval) RETURNING id`,
          [venueId, s.rows[0]!.id, seenAgo],
        );
        await admin.query(`UPDATE ordering.table_sessions SET host_guest_id = $1 WHERE id = $2`, [
          g.rows[0]!.id,
          s.rows[0]!.id,
        ]);
        return { session: s.rows[0]!.id, table: table.rows[0]!.id, guest: g.rows[0]!.id };
      };
      const idle = await session('A1', '2 hours', '1 hour');
      const active = await session('A2', '2 hours', '1 minute');
      const fresh = await session('A3', '5 minutes', '5 minutes');
      const withBill = await session('A4', '3 hours', '2 hours');
      await admin.query(
        `INSERT INTO ordering.orders (venue_id, session_id, table_id, business_date, order_number,
           idempotency_key, status, guest_id, total, vat_rate)
         VALUES ($1, $2, $3, current_date, 1, gen_random_uuid(), 'accepted', $4, 2.00, 17)`,
        [venueId, withBill.session, withBill.table, withBill.guest],
      );
      await admin.query(
        `INSERT INTO ordering.service_requests (venue_id, session_id, table_id, guest_id, type)
         VALUES ($1, $2, $3, $4, 'call_waiter')`,
        [venueId, idle.session, idle.table, idle.guest],
      );

      expect(await closeAbandonedSessions(dbs.ordering, 30)).toBe(1);
      const states = await admin.query<{ id: string; status: string }>(
        `SELECT id, status FROM ordering.table_sessions WHERE venue_id = $1`,
        [venueId],
      );
      const status = (id: string) => states.rows.find((r) => r.id === id)!.status;
      expect(status(idle.session)).toBe('abandoned');
      expect(status(active.session)).toBe('open');
      expect(status(fresh.session)).toBe('open');
      expect(status(withBill.session)).toBe('open');
      const released = await admin.query<{ status: string }>(
        `SELECT status FROM ordering.session_guests WHERE id = $1`,
        [idle.guest],
      );
      expect(released.rows[0]!.status).toBe('left');
      const request = await admin.query<{ status: string }>(
        `SELECT status FROM ordering.service_requests WHERE session_id = $1`,
        [idle.session],
      );
      expect(request.rows[0]!.status).toBe('cancelled');

      // Purge: an old block and an old relayed event go, recent ones stay.
      const member = await admin.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
      await admin.query(
        `INSERT INTO ordering.device_blocks (venue_id, device_hash, blocked_by_member_id, blocked_until)
         VALUES ($1, 'old', $2, now() - interval '8 days'), ($1, 'new', $2, now() + interval '1 hour')`,
        [venueId, member.rows[0]!.id],
      );
      await admin.query(
        `INSERT INTO core.outbox (venue_id, event_type, aggregate_id, payload, published_at)
         VALUES ($1, 'x', $1, '{}', now() - interval '40 days'), ($1, 'y', $1, '{}', now())`,
        [venueId],
      );
      const purged = await purgeExpired(dbs);
      expect(purged.deviceBlocks).toBe(1);
      expect(purged.outbox).toBeGreaterThanOrEqual(1);
      const left = await admin.query<{ device_hash: string }>(
        `SELECT device_hash FROM ordering.device_blocks WHERE venue_id = $1`,
        [venueId],
      );
      expect(left.rows.map((r) => r.device_hash)).toEqual(['new']);
      expect((await admin.query(`SELECT 1 FROM core.outbox WHERE event_type = 'y'`)).rowCount).toBe(
        1,
      );

      // Monthly partitions: this month and the next three exist after one run; a second run
      // creates nothing.
      await ensurePartitions(dbs);
      expect(await ensurePartitions(dbs)).toBe(0);
      const months = await admin.query<{ name: string }>(
        `SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'audit.audit_logs'::regclass
           AND c.relname >= 'audit_logs_' || to_char(now(), 'YYYY_MM')
           AND c.relname <> 'audit_logs_default'`,
      );
      expect(months.rows.length).toBeGreaterThanOrEqual(4);
    } finally {
      await Promise.all(Object.values(dbs).map((d) => d.close()));
    }
  });
});
