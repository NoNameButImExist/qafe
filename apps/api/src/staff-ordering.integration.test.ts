// The waiter's side of ordering and paying a table, over HTTP against real Postgres and Redis
// (FR-KON-04..21, FR-GOS-11, 12, 25, 26).
import type {
  Floor,
  GuestSessionState,
  KdsView,
  PaymentResult,
  PlacedOrder,
  StaffOrder,
  StaffOrderList,
  StaffSessionDetail,
  VenueSettings,
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
let owner: string;

const as = (token: string) => ({
  get: <T>(url: string) =>
    staffCall(t, token, 'GET', url).then((r) => {
      expect(r.statusCode, r.body).toBe(200);
      return r.json<T>();
    }),
  post: (url: string, payload: object = {}) => staffCall(t, token, 'POST', url, payload),
});

/** A guest at a table with one accepted order of `quantity` espressos (2.00 each). */
async function tableWithOrder(table: string, quantity = 1) {
  const guest = new Device(t, 'konobar-kafa');
  const state = (await guest.join(table)).json<GuestSessionState>();
  const placed = (await guest.order([{ itemId: f.espresso, quantity }])).json<PlacedOrder>();
  return { guest, sessionId: state.session.id, orderId: placed.order.id };
}

beforeAll(async () => {
  t = await startTestApp();
  f = await fixture(t, 'konobar-kafa');
  for (let i = 4; i <= 9; i++) {
    await t.admin.query(`INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, $2, $3)`, [
      f.venueId,
      `T${i}`,
      randomUUID().replaceAll('-', ''),
    ]);
  }
  const tokens = await t.admin.query<{ label: string; qr_token: string }>(
    `SELECT label, qr_token FROM core.tables WHERE venue_id = $1`,
    [f.venueId],
  );
  for (const row of tokens.rows) f.tables[row.label] = row.qr_token;
  waiter = await tokenOf(t, 'konobar-kafa', 'konobar', 'Konobar-Lozinka-1');
  owner = await tokenOf(t, 'konobar-kafa', 'sef', 'Sef-Lozinka-1');
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('floor and requests (FR-KON-15, 18)', () => {
  it('lists every table with its status', async () => {
    const before = await as(waiter).get<Floor>('/staff/floor');
    expect(before.tables.map((x) => x.label)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'T8',
      'T9',
    ]);
    expect(before.tables.every((x) => x.status === 'free' && x.session === null)).toBe(true);

    const guest = new Device(t, 'konobar-kafa');
    await guest.join(f.tables.T1!);
    expect((await as(waiter).get<Floor>('/staff/floor')).tables[0]).toMatchObject({
      status: 'occupied',
      session: { guests: 1, newOrders: 0, total: '0.00' },
    });

    await guest.call('POST', '/guest/requests', { type: 'call_waiter' });
    const called = (await as(waiter).get<Floor>('/staff/floor')).tables[0]!;
    expect(called.status).toBe('needs_service');
    const request = called.session!.requests[0]!;
    expect(request).toMatchObject({ type: 'call_waiter', status: 'open', nickname: 'Gost 1' });

    expect((await as(waiter).post(`/staff/requests/${request.id}/acknowledge`)).statusCode).toBe(
      204,
    );
    expect((await as(waiter).get<Floor>('/staff/floor')).tables[0]).toMatchObject({
      status: 'occupied',
      session: { requests: [{ status: 'acknowledged' }] },
    });
    expect((await as(waiter).post(`/staff/requests/${request.id}/done`)).statusCode).toBe(204);
    expect((await as(waiter).get<Floor>('/staff/floor')).tables[0]!.session!.requests).toEqual([]);
    expect((await as(waiter).post(`/staff/requests/${request.id}/done`)).statusCode).toBe(404);

    // Nothing ordered: the waiter can free the table.
    const sessionId = (await guest.state()).session.id;
    expect((await as(waiter).post(`/staff/sessions/${sessionId}/close`)).statusCode).toBe(204);
    expect(errorCode(await guest.call('GET', '/guest/session'))).toBe('no_session');
  });
});

describe('working an order (FR-KON-04, 06..11, 13, FR-GOS-11, 12)', () => {
  it('queues new orders and accepts, changes and serves them', async () => {
    const { guest, orderId } = await tableWithOrder(f.tables.T2!, 2);
    const queue = await as(waiter).get<StaffOrderList>('/staff/orders');
    expect(queue.orders.map((o) => [o.tableLabel, o.status, o.total])).toEqual([
      ['T2', 'new', '4.00'],
    ]);

    expect(errorCode(await as(waiter).post(`/staff/orders/${orderId}/serve`))).toBe(
      'invalid_state',
    );
    expect((await as(waiter).post(`/staff/orders/${orderId}/accept`)).statusCode).toBe(204);

    // More items, a replacement and a removal; the guest sees what changed (FR-GOS-11).
    expect(
      (
        await as(waiter).post(`/staff/orders/${orderId}/items`, {
          items: [{ itemId: f.espresso, quantity: 1, modifierOptionIds: [f.oat] }],
        })
      ).statusCode,
    ).toBe(204);
    let order = (await guest.state()).orders.find((o) => o.id === orderId)!;
    expect(order.total).toBe('6.80');
    const [first, added] = order.items;
    expect(
      (
        await as(waiter).post(`/staff/orders/${orderId}/items/${first!.id}/replace`, {
          itemId: f.espresso,
          quantity: 1,
          modifierOptionIds: [f.milk],
          message: 'Samo jedna, druga sa mlijekom',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await as(waiter).post(`/staff/orders/${orderId}/items/${added!.id}/remove`, {
          message: 'Nema zobenog',
        })
      ).statusCode,
    ).toBe(204);

    order = (await guest.state()).orders.find((o) => o.id === orderId)!;
    expect(order.status).toBe('accepted');
    expect(order.total).toBe('2.50');
    expect(order.items.map((i) => [i.name, i.quantity, i.status])).toEqual([
      ['Espresso', 2, 'removed'],
      ['Espresso', 1, 'removed'],
      ['Espresso', 1, 'pending'],
    ]);
    expect(order.changes.map((c) => [c.type, c.message])).toEqual([
      ['item_added', null],
      ['item_replaced', 'Samo jedna, druga sa mlijekom'],
      ['item_removed', 'Nema zobenog'],
    ]);

    expect((await as(waiter).post(`/staff/orders/${orderId}/serve`)).statusCode).toBe(204);
    order = (await guest.state()).orders.find((o) => o.id === orderId)!;
    expect(order.status).toBe('served');
    expect(order.items.find((i) => i.status !== 'removed')!.status).toBe('served');
    // Served orders are not changed any more.
    expect(
      errorCode(
        await as(waiter).post(`/staff/orders/${orderId}/items`, {
          items: [{ itemId: f.espresso, quantity: 1 }],
        }),
      ),
    ).toBe('invalid_state');
    expect((await as(waiter).get<StaffOrderList>('/staff/orders')).orders).toEqual([]);
  });

  it('returns an order to the guest, who corrects and resends it (FR-KON-08)', async () => {
    const { guest, orderId } = await tableWithOrder(f.tables.T3!);
    expect(
      (await as(waiter).post(`/staff/orders/${orderId}/return`, { message: '' })).statusCode,
    ).toBe(400);
    expect(
      (await as(waiter).post(`/staff/orders/${orderId}/return`, { message: 'Koliko šećera?' }))
        .statusCode,
    ).toBe(204);
    let order = (await guest.state()).orders[0]!;
    expect(order).toMatchObject({ status: 'returned', staffMessage: 'Koliko šećera?' });
    expect(order.changes[0]).toMatchObject({ type: 'returned_to_guest' });

    const fixed = await guest.call('PUT', `/guest/orders/${orderId}`, {
      items: [{ itemId: f.espresso, quantity: 3 }],
      note: 'Bez šećera',
    });
    expect(fixed.statusCode).toBe(200);
    order = fixed.json<GuestSessionState>().orders[0]!;
    expect(order).toMatchObject({ status: 'new', total: '6.00', note: 'Bez šećera' });
  });

  it('rejects only when the venue allows it, and cancels only with the permission (FR-KON-09, 13)', async () => {
    const { orderId } = await tableWithOrder(f.tables.T4!);
    // Off by default (FR-SEF-04): not even the waiter or the owner may reject.
    expect(
      errorCode(await as(waiter).post(`/staff/orders/${orderId}/reject`, { reason: 'Zatvaramo' })),
    ).toBe('rejection_disabled');
    expect(
      errorCode(await as(owner).post(`/staff/orders/${orderId}/reject`, { reason: 'Zatvaramo' })),
    ).toBe('rejection_disabled');
    expect((await as(waiter).get<StaffOrderList>('/staff/orders')).orderRejectionEnabled).toBe(
      false,
    );
    await t.admin.query(`UPDATE core.venues SET order_rejection_enabled = true WHERE id = $1`, [
      f.venueId,
    ]);
    // On: the waiter sees it and may reject.
    expect((await as(waiter).get<StaffOrderList>('/staff/orders')).orderRejectionEnabled).toBe(
      true,
    );
    expect(
      (await as(waiter).post(`/staff/orders/${orderId}/reject`, { reason: 'Zatvaramo' }))
        .statusCode,
    ).toBe(204);
    await t.admin.query(`UPDATE core.venues SET order_rejection_enabled = false WHERE id = $1`, [
      f.venueId,
    ]);

    const second = await tableWithOrder(f.tables.T9!);
    expect((await as(waiter).post(`/staff/orders/${second.orderId}/cancel`)).statusCode).toBe(403);
    expect(
      (await as(owner).post(`/staff/orders/${second.orderId}/cancel`, { reason: 'Duplo' }))
        .statusCode,
    ).toBe(204);
    const state = await second.guest.state();
    expect(state.orders.map((o) => o.status)).toEqual(['cancelled']);
    const rejected = await t.admin.query<{ status: string; staff_message: string }>(
      `SELECT status, staff_message FROM ordering.orders WHERE id = $1`,
      [orderId],
    );
    expect(rejected.rows[0]).toEqual({ status: 'rejected', staff_message: 'Zatvaramo' });
  });

  it('lets the owner settle "Nije naše" (FR-GOS-25)', async () => {
    const { guest, orderId } = await tableWithOrder(f.tables.T5!);
    await as(waiter).post(`/staff/orders/${orderId}/accept`);
    const other = new Device(t, 'konobar-kafa');
    const joined = (await other.join(f.tables.T5!)).json<GuestSessionState>();
    await guest.call('POST', `/guest/session/guests/${joined.me.id}/approve`);
    await other.call('POST', `/guest/orders/${orderId}/dispute`);

    const detail = await as(waiter).get<StaffSessionDetail>(`/staff/sessions/${joined.session.id}`);
    expect(detail).toMatchObject({ blockingOrders: 1, bill: { total: '0.00' } });
    expect(
      (await as(waiter).post(`/staff/orders/${orderId}/dispute`, { action: 'confirm' })).statusCode,
    ).toBe(403);
    expect(
      (await as(owner).post(`/staff/orders/${orderId}/dispute`, { action: 'confirm' })).statusCode,
    ).toBe(204);
    expect((await guest.state()).bill.total).toBe('2.00');
    expect(
      errorCode(await as(owner).post(`/staff/orders/${orderId}/dispute`, { action: 'cancel' })),
    ).toBe('invalid_state');
  });
});

describe('manual orders (FR-KON-12)', () => {
  it('opens a verified session and accepts the order at once; a resend returns it', async () => {
    const key = randomUUID();
    const tableId = (await as(waiter).get<Floor>('/staff/floor')).tables.find(
      (x) => x.label === 'T6',
    )!.id;
    const body = { idempotencyKey: key, items: [{ itemId: f.espresso, quantity: 2 }] };
    const res = await as(waiter).post(`/staff/tables/${tableId}/orders`, body);
    expect(res.statusCode).toBe(201);
    const order = res.json<StaffOrder>();
    expect(order).toMatchObject({
      status: 'accepted',
      source: 'staff',
      orderedBy: null,
      total: '4.00',
      tableLabel: 'T6',
    });

    const again = await as(waiter).post(`/staff/tables/${tableId}/orders`, body);
    expect(again.json<StaffOrder>().id).toBe(order.id);

    const detail = await as(waiter).get<StaffSessionDetail>(`/staff/sessions/${order.sessionId}`);
    expect(detail).toMatchObject({ verified: true, guests: [], bill: { total: '4.00' } });

    // A guest who scans the table later joins the same session.
    const guest = new Device(t, 'konobar-kafa');
    const state = (await guest.join(f.tables.T6!)).json<GuestSessionState>();
    expect(state.session.id).toBe(order.sessionId);
    expect(state.orders[0]).toMatchObject({ orderedBy: null, status: 'accepted' });
  });
});

describe('devices (FR-KON-16, 17, FR-GOS-26)', () => {
  it('removes a device, cancels its unconfirmed orders and blocks it', async () => {
    const host = new Device(t, 'konobar-kafa');
    const intruder = new Device(t, 'konobar-kafa');
    const hostState = (await host.join(f.tables.T7!)).json<GuestSessionState>();
    const joined = (await intruder.join(f.tables.T7!)).json<GuestSessionState>();
    expect(
      (
        await as(waiter).post(
          `/staff/sessions/${hostState.session.id}/guests/${joined.me.id}/approve`,
        )
      ).statusCode,
    ).toBe(204);
    await intruder.order([{ itemId: f.espresso, quantity: 5 }]);

    expect(
      (
        await as(waiter).post(
          `/staff/sessions/${hostState.session.id}/guests/${joined.me.id}/remove`,
          { reason: 'Nije za stolom' },
        )
      ).statusCode,
    ).toBe(204);
    expect(errorCode(await intruder.call('GET', '/guest/session'))).toBe('device_blocked');
    expect(errorCode(await intruder.join(f.tables.T8!))).toBe('device_blocked');
    const state = await host.state();
    expect(state.guests.map((g) => g.nickname)).toEqual(['Gost 1']);
    expect(state.orders[0]!.status).toBe('cancelled');
  });
});

describe('paying and closing a table (FR-KON-19, 21)', () => {
  it('waits for open orders, takes only enabled methods, and closes the table', async () => {
    const { guest, sessionId, orderId } = await tableWithOrder(f.tables.T8!, 2);
    expect(
      errorCode(await as(waiter).post(`/staff/sessions/${sessionId}/pay`, { method: 'cash' })),
    ).toBe('open_orders');
    await as(waiter).post(`/staff/orders/${orderId}/accept`);
    expect(errorCode(await as(waiter).post(`/staff/sessions/${sessionId}/close`))).toBe(
      'bill_unpaid',
    );
    expect(
      errorCode(await as(waiter).post(`/staff/sessions/${sessionId}/pay`, { method: 'card' })),
    ).toBe('payment_method_unavailable');

    const paid = await as(waiter).post(`/staff/sessions/${sessionId}/pay`, { method: 'cash' });
    expect(paid.statusCode).toBe(201);
    expect(paid.json<PaymentResult>()).toMatchObject({
      amount: '4.00',
      vatAmount: '0.58',
      method: 'cash',
    });

    const payment = await t.admin.query<{
      status: string;
      amount: string;
      completed_at: Date | null;
    }>(`SELECT status, amount, completed_at FROM billing.payments WHERE session_id = $1`, [
      sessionId,
    ]);
    expect(payment.rows.map((p) => [p.status, p.amount, p.completed_at instanceof Date])).toEqual([
      ['completed', '4.00', true],
    ]);
    const outbox = await t.admin.query(
      `SELECT event_type FROM billing.outbox WHERE payload->>'sessionId' = $1`,
      [sessionId],
    );
    expect(outbox.rows).toEqual([{ event_type: 'payment.completed' }]);

    expect(errorCode(await guest.call('GET', '/guest/session'))).toBe('no_session');
    expect(
      (await as(waiter).get<Floor>('/staff/floor')).tables.find((x) => x.label === 'T8')!.status,
    ).toBe('free');
    // A paid table's accepted orders leave the waiter's queue.
    const queue = await as(waiter).get<StaffOrderList>('/staff/orders');
    expect(queue.orders.some((o) => o.sessionId === sessionId)).toBe(false);
    expect(
      (await as(waiter).post(`/staff/sessions/${sessionId}/pay`, { method: 'cash' })).statusCode,
    ).toBe(404);
  });
});

describe('web push subscriptions (FR-KON-05)', () => {
  it('stores one subscription per browser endpoint', async () => {
    expect(await as(waiter).get('/staff/push')).toEqual({ publicKey: 'test-vapid-public-key' });
    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'key', auth: 'auth' } };
    expect((await as(waiter).post('/staff/push/subscriptions', sub)).statusCode).toBe(204);
    expect((await as(owner).post('/staff/push/subscriptions', sub)).statusCode).toBe(204);
    const rows = await t.admin.query(
      `SELECT member_id FROM ordering.push_subscriptions WHERE endpoint = $1`,
      [sub.endpoint],
    );
    expect(rows.rowCount).toBe(1);
    const del = await staffCall(t, owner, 'DELETE', '/staff/push/subscriptions', {
      endpoint: sub.endpoint,
    });
    expect(del.statusCode).toBe(204);
    expect((await t.admin.query(`SELECT 1 FROM ordering.push_subscriptions`)).rowCount).toBe(0);
  });
});

describe('table PIN set by staff (FR-GOS-21)', () => {
  it('shows the PIN, lets staff change it, and guests confirm the table with it in waiter mode too', async () => {
    const guest = new Device(t, 'konobar-kafa');
    const state = (await guest.join(f.tables.T3!)).json<GuestSessionState>();
    expect(state.session).toMatchObject({ verified: false, verificationMode: 'waiter' });

    const detail = await as(waiter).get<StaffSessionDetail>(`/staff/sessions/${state.session.id}`);
    expect(detail.verificationCode).toMatch(/^\d{4}$/);

    const random = await as(waiter).post(`/staff/sessions/${state.session.id}/pin`);
    expect(random.statusCode).toBe(200);
    expect(random.json<{ code: string }>().code).toMatch(/^\d{4}$/);
    expect(
      (await as(waiter).post(`/staff/sessions/${state.session.id}/pin`, { code: '12a4' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await as(waiter).post(`/staff/sessions/${state.session.id}/pin`, { code: '4321' })).json(),
    ).toEqual({
      code: '4321',
    });

    expect(errorCode(await guest.call('POST', '/guest/session/verify', { code: '1111' }))).toBe(
      'invalid_code',
    );
    const ok = await guest.call('POST', '/guest/session/verify', { code: '4321' });
    expect(ok.json<GuestSessionState>().session.verified).toBe(true);
    // Staff still see the PIN after the table is confirmed, to tell it to the next guests.
    expect(
      (await as(waiter).get<StaffSessionDetail>(`/staff/sessions/${state.session.id}`))
        .verificationCode,
    ).toBe('4321');
  });
});

describe('the host comes back (FR-GOS-20)', () => {
  it('keeps the host role when the same phone scans again after closing the browser', async () => {
    const host = new Device(t, 'konobar-kafa');
    const first = (await host.join(f.tables.T8!)).json<GuestSessionState>();
    // A reopened browser still has the device cookie (it lasts a year), nothing else.
    const reopened = new Device(t, 'konobar-kafa');
    reopened.cookie = host.cookie;
    const again = (await reopened.join(f.tables.T8!)).json<GuestSessionState>();
    expect(again.session.id).toBe(first.session.id);
    expect(again.me).toMatchObject({ id: first.me.id, isHost: true, status: 'approved' });

    // Anyone else still waits for the host or a waiter.
    const other = (
      await new Device(t, 'konobar-kafa').join(f.tables.T8!)
    ).json<GuestSessionState>();
    expect(other.me.status).toBe('pending_approval');
  });

  it('sets a long-lived, host-only device cookie', async () => {
    const res = await new Device(t, 'konobar-kafa').call('GET', '/guest/venue');
    const cookie = res.cookies.find((c) => c.name === 'qafe_gd')!;
    expect(cookie.maxAge).toBe(365 * 24 * 60 * 60);
    expect(cookie).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax' });
    expect(cookie.domain).toBeUndefined();
  });
});

describe('Wi-Fi verification (FR-GOS-28)', () => {
  const VENUE_IP = '203.0.113.7';

  it('confirms the table for a guest on the venue network, only when turned on', async () => {
    const table = async (label: string) => {
      const token = randomUUID().replaceAll('-', '');
      await t.admin.query(
        `INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, $2, $3)`,
        [f.venueId, label, token],
      );
      return token;
    };
    const [w1, w2] = [await table('W1'), await table('W2')];
    const venueCall = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: object,
    ) =>
      t.app.inject({
        method,
        url,
        payload,
        headers: { authorization: `Bearer ${owner}` },
        remoteAddress: VENUE_IP,
      });

    // The owner, on the venue Wi-Fi, adds "this network" and a range.
    expect((await venueCall('GET', '/venue/network')).json()).toEqual({ ip: VENUE_IP });
    let settings = (
      await venueCall('POST', '/venue/networks', { label: 'Wi-Fi sala' })
    ).json<VenueSettings>();
    expect(settings.networks.map((n) => [n.network, n.label])).toEqual([[VENUE_IP, 'Wi-Fi sala']]);
    settings = (
      await venueCall('POST', '/venue/networks', { network: '192.0.2.77/24' })
    ).json<VenueSettings>();
    expect(settings.networks.map((n) => n.network)).toEqual([VENUE_IP, '192.0.2.0/24']);
    expect((await venueCall('POST', '/venue/networks', { network: '999.1.1.1' })).statusCode).toBe(
      400,
    );

    // Off by default: a guest on the venue network still needs the waiter.
    const first = new Device(t, 'konobar-kafa');
    first.ip = VENUE_IP;
    const off = (await first.join(w1, { leaveCurrent: true })).json<GuestSessionState>();
    expect(off.session).toMatchObject({ verified: false, wifiVerification: false });
    await first.call('DELETE', '/guest/session');

    settings = (
      await venueCall('PATCH', '/venue', { ordering: { wifiVerificationEnabled: true } })
    ).json<VenueSettings>();
    expect(settings.ordering.wifiVerificationEnabled).toBe(true);

    // Mobile data: not confirmed.
    const mobile = new Device(t, 'konobar-kafa');
    const outside = (await mobile.join(w2, { leaveCurrent: true })).json<GuestSessionState>();
    expect(outside.session).toMatchObject({ verified: false, wifiVerification: true });

    // The same phone joins the venue Wi-Fi (a range address): confirmed on the next request.
    mobile.ip = '192.0.2.15';
    expect((await mobile.state()).session.verified).toBe(true);
    const verified = await t.admin.query<{ details: { by: string } }>(
      `SELECT payload->'details' AS details FROM ordering.outbox
        WHERE event_type = 'session.verified' AND aggregate_id = $1`,
      [outside.session.id],
    );
    expect(verified.rows.map((r) => r.details.by)).toEqual(['wifi']);

    // A second device on the Wi-Fi still waits for the host: only the table is confirmed.
    const friend = new Device(t, 'konobar-kafa');
    friend.ip = VENUE_IP;
    expect((await friend.join(w2)).json<GuestSessionState>().me.status).toBe('pending_approval');

    // Removing the network stops it again.
    const id = settings.networks.find((n) => n.network === VENUE_IP)!.id;
    expect(
      (await venueCall('DELETE', `/venue/networks/${id}`)).json<VenueSettings>().networks,
    ).toHaveLength(1);
    await venueCall('PATCH', '/venue', { ordering: { wifiVerificationEnabled: false } });
  });
});

describe('kitchen and bar screens (KDS module, FR-KON-24..29)', () => {
  it('shows accepted items per station, marks them ready, undoes, and readies the order', async () => {
    // Off until the admin enables the module.
    expect(errorCode(await staffCall(t, waiter, 'GET', '/staff/kds'))).toBe('module_disabled');
    await t.admin.query(
      `INSERT INTO core.venue_modules (venue_id, module_code) VALUES ($1, 'kds')`,
      [f.venueId],
    );

    const stations = await staffCall(t, owner, 'POST', '/venue/stations', {
      name: 'Šank',
      type: 'bar',
    });
    expect(stations.statusCode).toBe(201);
    const bar = stations.json<VenueSettings>().stations[0]!;
    expect(bar).toMatchObject({ name: 'Šank', type: 'bar', isActive: true });
    expect(errorCode(await staffCall(t, owner, 'POST', '/venue/stations', { name: 'Šank' }))).toBe(
      'label_taken',
    );
    const item = await staffCall(t, owner, 'PATCH', `/catalog/items/${f.espresso}`, {
      prepStationId: bar.id,
    });
    expect(item.statusCode).toBe(200);

    const token = randomUUID().replaceAll('-', '');
    await t.admin.query(
      `INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, 'K1', $2)`,
      [f.venueId, token],
    );
    const guest = new Device(t, 'konobar-kafa');
    await guest.join(token, { leaveCurrent: true });
    const order = (
      await guest.order([{ itemId: f.espresso, quantity: 2, modifierOptionIds: [f.milk] }])
    ).json<{
      order: { id: string };
    }>().order;

    // Not accepted yet: nothing on the screen.
    let view = (await staffCall(t, waiter, 'GET', `/staff/kds?station=${bar.id}`)).json<KdsView>();
    expect(view.open).toEqual([]);
    expect(view).toMatchObject({ warningMinutes: 5, criticalMinutes: 10 });

    await staffCall(t, waiter, 'POST', `/staff/orders/${order.id}/accept`);
    view = (await staffCall(t, waiter, 'GET', `/staff/kds?station=${bar.id}`)).json<KdsView>();
    expect(view.open).toHaveLength(1);
    expect(view.open[0]).toMatchObject({ tableLabel: 'K1' });
    expect(view.open[0]!.items[0]).toMatchObject({
      name: 'Espresso',
      quantity: 2,
      modifiers: ['Kravlje'],
      status: 'pending',
    });
    const itemId = view.open[0]!.items[0]!.id;

    expect(
      (await staffCall(t, waiter, 'POST', `/staff/kds/orders/${order.id}/start?station=${bar.id}`))
        .statusCode,
    ).toBe(204);
    expect((await guest.state()).orders[0]!.status).toBe('preparing');

    expect(
      (await staffCall(t, waiter, 'POST', `/staff/kds/items/${itemId}/ready`)).statusCode,
    ).toBe(204);
    expect((await guest.state()).orders[0]!.status).toBe('ready');
    view = (await staffCall(t, waiter, 'GET', `/staff/kds?station=${bar.id}`)).json<KdsView>();
    expect(view.open).toEqual([]);
    expect(view.done[0]!.items[0]).toMatchObject({ id: itemId, status: 'ready' });

    // Undo within seconds brings it back; a second "ready" readies the order again.
    expect((await staffCall(t, waiter, 'POST', `/staff/kds/items/${itemId}/undo`)).statusCode).toBe(
      204,
    );
    expect((await guest.state()).orders[0]!.status).toBe('preparing');
    await staffCall(t, waiter, 'POST', `/staff/kds/items/${itemId}/ready`);
    // The updated_at trigger would reset the time, so it is paused for this one update.
    await t.admin.query(`ALTER TABLE ordering.order_items DISABLE TRIGGER trg_updated_at`);
    await t.admin.query(
      `UPDATE ordering.order_items SET updated_at = now() - interval '1 minute' WHERE id = $1`,
      [itemId],
    );
    await t.admin.query(`ALTER TABLE ordering.order_items ENABLE TRIGGER trg_updated_at`);
    expect(errorCode(await staffCall(t, waiter, 'POST', `/staff/kds/items/${itemId}/undo`))).toBe(
      'undo_expired',
    );

    // The waiter serves it; the order leaves the screen's open list for good.
    expect((await staffCall(t, waiter, 'POST', `/staff/orders/${order.id}/serve`)).statusCode).toBe(
      204,
    );
    expect((await guest.state()).orders[0]!.status).toBe('served');
    const ready = await t.admin.query(
      `SELECT 1 FROM ordering.outbox WHERE event_type = 'order.ready' AND aggregate_id = $1`,
      [order.id],
    );
    expect(ready.rowCount).toBe(2);
  });
});
