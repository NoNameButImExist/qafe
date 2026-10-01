// Outbox relay against real Postgres: core.outbox (as svc_core) → audit.audit_logs (as svc_audit).
import { TenantDatabase } from '@qafe/db';
import { startTestDatabase, type TestDatabase } from '@qafe/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditWriter } from './audit-writer.js';
import { OutboxRelay } from './outbox-relay.js';

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
