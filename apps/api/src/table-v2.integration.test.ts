// V2 at the table over HTTP against a real Postgres: partial payment (FR-KON-20) and moving or
// merging tables (FR-KON-14).
import type {
  Floor,
  GuestSessionState,
  MoveSessionResult,
  PaymentResult,
  PlacedOrder,
  SessionPayments,
  StaffSessionDetail,
} from '@qafe/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Device,
  errorCode,
  fixture,
  staffCall,
  tokenOf,
  type Fixture,
} from './test-support/ordering-fixtures.js';
import { startTestApp, type TestApp } from './test-support/test-app.js';

let t: TestApp;
let f: Fixture;
let waiter: string;
const tableIds: Record<string, string> = {};

const get = async <T>(url: string): Promise<T> => {
  const res = await staffCall(t, waiter, 'GET', url);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<T>();
};
const post = (url: string, payload: object = {}) => staffCall(t, waiter, 'POST', url, payload);

/** A guest at `table` with one accepted order of `quantity` espressos (2.00 each). */
async function seated(table: string, quantity: number) {
  const guest = new Device(t, 'stolovi-v2');
  const state = (await guest.join(f.tables[table]!)).json<GuestSessionState>();
  const placed = (await guest.order([{ itemId: f.espresso, quantity }])).json<PlacedOrder>();
  expect((await post(`/staff/orders/${placed.order.id}/accept`)).statusCode).toBe(204);
  return {
    guest,
    sessionId: state.session.id,
    orderId: placed.order.id,
    itemId: placed.order.items[0]!.id,
  };
}

beforeAll(async () => {
  t = await startTestApp();
  f = await fixture(t, 'stolovi-v2');
  for (let i = 4; i <= 9; i++) {
    const token = randomUUID().replaceAll('-', '');
    await t.admin.query(`INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, $2, $3)`, [
      f.venueId,
      `T${i}`,
      token,
    ]);
    f.tables[`T${i}`] = token;
  }
  const rows = await t.admin.query<{ id: string; label: string }>(
    `SELECT id, label FROM core.tables WHERE venue_id = $1`,
    [f.venueId],
  );
  for (const r of rows.rows) tableIds[r.label] = r.id;
  waiter = await tokenOf(t, 'stolovi-v2', 'konobar', 'Konobar-Lozinka-1');
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('partial payment (FR-KON-20)', () => {
  it('lets one guest pay some items while the table stays open', async () => {
    const { sessionId, itemId, orderId } = await seated('T1', 3);

    const first = await post(`/staff/sessions/${sessionId}/pay-items`, {
      method: 'cash',
      items: [{ orderItemId: itemId, quantity: 1 }],
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json<PaymentResult>().amount).toBe('2.00');

    const detail = await get<StaffSessionDetail>(`/staff/sessions/${sessionId}`);
    expect(detail.status).toBe('open');
    expect(detail.bill).toMatchObject({ total: '6.00', paid: '2.00', remaining: '4.00' });
    const payments = await get<SessionPayments>(`/staff/sessions/${sessionId}/payments`);
    expect(payments.paidQuantities[itemId]).toBe(1);
    expect(payments.paid).toBe('2.00');

    // Only two espressos are left to pay.
    const tooMany = await post(`/staff/sessions/${sessionId}/pay-items`, {
      method: 'cash',
      items: [{ orderItemId: itemId, quantity: 3 }],
    });
    expect(errorCode(tooMany)).toBe('bill_changed');

    // A partly paid table stays where it is.
    const move = await post(`/staff/orders/${orderId}/move`, { tableId: tableIds.T9 });
    expect(errorCode(move)).toBe('partially_paid');

    // The rest is paid in one go and the table closes.
    const rest = await post(`/staff/sessions/${sessionId}/pay`, { method: 'cash' });
    expect(rest.statusCode, rest.body).toBe(201);
    expect(rest.json<PaymentResult>().amount).toBe('4.00');
    const total = await t.admin.query<{ sum: string; n: string }>(
      `SELECT sum(amount)::text AS sum, count(*)::text AS n FROM billing.payments
        WHERE session_id = $1 AND status = 'completed'`,
      [sessionId],
    );
    expect(total.rows[0]).toEqual({ sum: '6.00', n: '2' });
  });

  it('closes the table when the items paid are the last ones', async () => {
    const { sessionId, itemId } = await seated('T2', 2);
    await post(`/staff/sessions/${sessionId}/pay-items`, {
      method: 'cash',
      items: [{ orderItemId: itemId, quantity: 1 }],
    });
    const last = await post(`/staff/sessions/${sessionId}/pay-items`, {
      method: 'cash',
      items: [{ orderItemId: itemId, quantity: 1 }],
    });
    expect(last.statusCode, last.body).toBe(201);
    const session = await t.admin.query<{ status: string; paid_amount: string }>(
      `SELECT status, paid_amount::text FROM ordering.table_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(session.rows[0]).toEqual({ status: 'closed', paid_amount: '2.00' });
  });
});

describe('moving and merging (FR-KON-14)', () => {
  it('moves one order to another table, opening a session there', async () => {
    const { sessionId, orderId } = await seated('T3', 1);
    const res = await post(`/staff/orders/${orderId}/move`, { tableId: tableIds.T4 });
    expect(res.statusCode, res.body).toBe(204);

    const floor = await get<Floor>('/staff/floor');
    const t4 = floor.tables.find((x) => x.label === 'T4')!;
    expect(t4.session?.total).toBe('2.00');
    const source = await get<StaffSessionDetail>(`/staff/sessions/${sessionId}`);
    expect(source.bill.total).toBe('0.00');
    expect(errorCode(await post(`/staff/orders/${orderId}/move`, { tableId: tableIds.T4 }))).toBe(
      'same_table',
    );
  });

  it('moves the whole table onto a free one', async () => {
    const { guest, sessionId } = await seated('T5', 2);
    const res = await post(`/staff/sessions/${sessionId}/move`, { tableId: tableIds.T6 });
    expect(res.json<MoveSessionResult>()).toEqual({ sessionId, merged: false });
    const state = await guest.state();
    expect(state.session.tableLabel).toBe('T6');
    expect(state.bill.total).toBe('4.00');
    const floor = await get<Floor>('/staff/floor');
    expect(floor.tables.find((x) => x.label === 'T5')!.status).toBe('free');
  });

  it('merges a table into an occupied one', async () => {
    const a = await seated('T7', 1);
    const b = await seated('T8', 2);
    const res = await post(`/staff/sessions/${a.sessionId}/move`, { tableId: tableIds.T8 });
    expect(res.json<MoveSessionResult>()).toEqual({ sessionId: b.sessionId, merged: true });

    // The first guest now sits at T8 with everything ordered at both tables.
    const state = await a.guest.state();
    expect(state.session.id).toBe(b.sessionId);
    expect(state.bill.total).toBe('6.00');
    const closed = await t.admin.query<{ status: string; merged_into_session_id: string }>(
      `SELECT status, merged_into_session_id FROM ordering.table_sessions WHERE id = $1`,
      [a.sessionId],
    );
    expect(closed.rows[0]).toEqual({ status: 'closed', merged_into_session_id: b.sessionId });
    const audit = await t.admin.query<{ event_type: string }>(
      `SELECT event_type FROM ordering.outbox WHERE aggregate_id = $1 AND event_type = 'session.merged'`,
      [a.sessionId],
    );
    expect(audit.rowCount).toBe(1);
  });
});
