// Guest ordering over HTTP and Socket.IO against real Postgres and Redis (FR-GOS-01..27).
import type { Floor, GuestMenu, GuestSessionState, GuestVenue, PlacedOrder } from '@qafe/contracts';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deviceHash } from './modules/ordering/guest-identity.js';
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

beforeAll(async () => {
  t = await startTestApp();
  f = await fixture(t, 'kafa');
  await fixture(t, 'druga');
  waiter = await tokenOf(t, 'kafa', 'konobar', 'Konobar-Lozinka-1');
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('tenant from the host and the menu', () => {
  it('knows no venue on unknown or bare hosts', async () => {
    expect((await new Device(t, 'nema').call('GET', '/guest/venue')).statusCode).toBe(404);
    const bare = await t.app.inject({
      method: 'GET',
      url: '/guest/venue',
      headers: { host: 'qafe.test' },
    });
    expect(bare.statusCode).toBe(404);
  });

  it('shows the venue, sets a host-only device cookie, and lists the menu (FR-GOS-04)', async () => {
    const device = new Device(t, 'kafa');
    const res = await device.call('GET', '/guest/venue');
    expect(res.statusCode).toBe(200);
    expect(res.json<GuestVenue>()).toMatchObject({
      slug: 'kafa',
      orderingOpen: true,
      closedReason: null,
      paymentMethods: [{ method: 'cash', isDefault: true }],
    });
    const cookie = res.cookies.find((c) => c.name === 'qafe_gd')!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(cookie.domain).toBeUndefined();

    const menu = (await device.call('GET', '/guest/menu')).json<GuestMenu>();
    expect(menu.categories.map((c) => c.name)).toEqual(['Topli napici']);
    expect(menu.categories[0]!.items.map((i) => [i.name, i.isAvailable])).toEqual([
      ['Espresso', true],
      ['Čaj', false],
    ]);
    expect(menu.modifierGroups[0]!.options.map((o) => o.name)).toEqual(['Kravlje', 'Zobeno']);
  });

  it('serves a changed menu right after the change (cache invalidation)', async () => {
    const device = new Device(t, 'kafa');
    await device.call('GET', '/guest/menu'); // warms the cache
    const owner = await tokenOf(t, 'kafa', 'sef', 'Sef-Lozinka-1');
    const res = await staffCall(t, owner, 'PATCH', `/catalog/items/${f.sold}/availability`, {
      available: true,
    });
    expect(res.statusCode).toBe(200);
    const menu = (await device.call('GET', '/guest/menu')).json<GuestMenu>();
    expect(menu.categories[0]!.items.find((i) => i.id === f.sold)!.isAvailable).toBe(true);
    await staffCall(t, owner, 'PATCH', `/catalog/items/${f.sold}/availability`, {
      available: false,
    });
  });
});

describe('table sessions (FR-GOS-01, 02, 20..23)', () => {
  it('rejects unknown QR codes and codes of another venue', async () => {
    const device = new Device(t, 'kafa');
    expect(errorCode(await device.join('x'.repeat(32)))).toBe('table_not_found');
    const other = await t.admin.query<{ qr_token: string }>(
      `SELECT qr_token FROM core.tables t JOIN core.venues v ON v.id = t.venue_id
        WHERE v.slug = 'druga' LIMIT 1`,
    );
    expect(errorCode(await device.join(other.rows[0]!.qr_token))).toBe('table_not_found');
    expect(errorCode(await device.call('GET', '/guest/session'))).toBe('no_session');
  });

  it('makes the first device the host and lets the host approve the next one', async () => {
    const a = new Device(t, 'kafa');
    const b = new Device(t, 'kafa');
    const first = await a.join(f.tables.T1!, { nickname: 'Ana' });
    expect(first.statusCode).toBe(200);
    const sa = first.json<GuestSessionState>();
    expect(sa.session).toMatchObject({
      tableLabel: 'T1',
      verified: false,
      verificationMode: 'waiter',
    });
    expect(sa.me).toMatchObject({ nickname: 'Ana', status: 'approved', isHost: true });

    const sb = (await b.join(f.tables.T1!)).json<GuestSessionState>();
    expect(sb.session.id).toBe(sa.session.id);
    expect(sb.me).toMatchObject({ nickname: 'Gost 2', status: 'pending_approval', isHost: false });
    expect(errorCode(await b.order([{ itemId: f.espresso, quantity: 1 }]))).toBe(
      'approval_required',
    );

    // Only the host approves.
    expect(errorCode(await b.call('POST', `/guest/session/guests/${sa.me.id}/approve`))).toBe(
      'host_only',
    );
    const approved = await a.call('POST', `/guest/session/guests/${sb.me.id}/approve`);
    expect(approved.json<GuestSessionState>().guests.map((g) => g.status)).toEqual([
      'approved',
      'approved',
    ]);

    // Scanning the same table again keeps the place.
    const again = (await b.join(f.tables.T1!)).json<GuestSessionState>();
    expect(again.me.id).toBe(sb.me.id);
  });

  it('asks before moving a device to another table, then hands over the host role', async () => {
    const a = new Device(t, 'kafa');
    const b = new Device(t, 'kafa');
    const sa = (await a.join(f.tables.T2!)).json<GuestSessionState>();
    const sb = (await b.join(f.tables.T2!)).json<GuestSessionState>();
    await a.call('POST', `/guest/session/guests/${sb.me.id}/approve`);

    const conflict = await a.join(f.tables.T3!);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<{ error: { code: string; details: unknown } }>().error).toMatchObject({
      code: 'active_elsewhere',
      details: { tableLabel: 'T2' },
    });
    const moved = (await a.join(f.tables.T3!, { leaveCurrent: true })).json<GuestSessionState>();
    expect(moved.session.tableLabel).toBe('T3');
    expect(moved.session.id).not.toBe(sa.session.id);

    const left = await b.state();
    expect(left.me.isHost).toBe(true);
    expect(left.guests).toHaveLength(1);

    // Clean up: everyone leaves, the empty sessions are abandoned.
    expect((await a.call('DELETE', '/guest/session')).statusCode).toBe(204);
    await b.call('DELETE', '/guest/session');
    const active = await t.admin.query(
      `SELECT 1 FROM ordering.table_sessions WHERE id = ANY($1) AND status = 'open'`,
      [[sa.session.id, moved.session.id]],
    );
    expect(active.rowCount).toBe(0);
  });

  it('keeps a blocked device out (FR-GOS-26)', async () => {
    const device = new Device(t, 'kafa');
    await device.call('GET', '/guest/venue');
    const member = await t.admin.query<{ id: string }>(
      `SELECT m.id FROM core.venue_members m WHERE m.venue_id = $1 LIMIT 1`,
      [f.venueId],
    );
    await t.admin.query(
      `INSERT INTO ordering.device_blocks (venue_id, device_hash, blocked_by_member_id, blocked_until)
       VALUES ($1, $2, $3, now() + interval '12 hours')`,
      [f.venueId, deviceHash(device.cookie!, t.config.guest.deviceSecret), member.rows[0]!.id],
    );
    const res = await device.join(f.tables.T3!);
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('device_blocked');
  });
});

describe('orders (FR-GOS-09..16, 25, 27, NFR-06)', () => {
  let a: Device;
  let b: Device;
  let session: GuestSessionState;

  beforeAll(async () => {
    a = new Device(t, 'kafa');
    b = new Device(t, 'kafa');
    session = (await a.join(f.tables.T1!, { leaveCurrent: true })).json<GuestSessionState>();
    // T1 already has its host from the earlier test; approve this device through the waiter.
    if (session.me.status !== 'approved') {
      const res = await staffCall(
        t,
        waiter,
        'POST',
        `/staff/sessions/${session.session.id}/guests/${session.me.id}/approve`,
      );
      expect(res.statusCode).toBe(204);
    }
    await b.join(f.tables.T1!);
    const sb = await b.state();
    if (sb.me.status !== 'approved') {
      await staffCall(
        t,
        waiter,
        'POST',
        `/staff/sessions/${sb.session.id}/guests/${sb.me.id}/approve`,
      );
    }
  });

  it('prices from the database with modifier snapshots', async () => {
    const key = randomUUID();
    const res = await a.order(
      [{ itemId: f.espresso, quantity: 2, note: 'vruće', modifierOptionIds: [f.milk] }],
      key,
    );
    expect(res.statusCode).toBe(201);
    const { order } = res.json<PlacedOrder>();
    expect(order).toMatchObject({ number: 1, status: 'new', total: '5.00', orderedBy: 'Gost 3' });
    expect(order.items[0]).toMatchObject({
      name: 'Espresso',
      quantity: 2,
      unitPrice: '2.50',
      lineTotal: '5.00',
      note: 'vruće',
      modifiers: [{ group: 'Mlijeko', option: 'Kravlje', priceDelta: '0.50' }],
    });
    const vat = await t.admin.query<{ vat_amount: string; vat_rate: string }>(
      `SELECT vat_amount, vat_rate FROM ordering.orders WHERE id = $1`,
      [order.id],
    );
    expect(vat.rows[0]).toEqual({ vat_amount: '0.73', vat_rate: '17.00' });

    // A retry with the same key returns the same order (NFR-06); another device may not reuse it.
    const retry = await a.order([{ itemId: f.espresso, quantity: 9 }], key);
    expect(retry.statusCode).toBe(200);
    expect(retry.json<PlacedOrder>().order.id).toBe(order.id);
    expect(errorCode(await b.order([{ itemId: f.espresso, quantity: 1 }], key))).toBe(
      'idempotency_conflict',
    );
    const count = await t.admin.query(`SELECT 1 FROM ordering.orders WHERE idempotency_key = $1`, [
      key,
    ]);
    expect(count.rowCount).toBe(1);
  });

  it('refuses sold-out items, foreign options and too many options', async () => {
    expect(errorCode(await a.order([{ itemId: f.sold, quantity: 1 }]))).toBe('item_unavailable');
    expect(errorCode(await a.order([{ itemId: randomUUID(), quantity: 1 }]))).toBe(
      'item_unavailable',
    );
    expect(
      errorCode(
        await a.order([{ itemId: f.espresso, quantity: 1, modifierOptionIds: [f.milk, f.oat] }]),
      ),
    ).toBe('invalid_modifiers');
    expect(
      errorCode(
        await a.order([{ itemId: f.espresso, quantity: 1, modifierOptionIds: [randomUUID()] }]),
      ),
    ).toBe('invalid_modifiers');
  });

  it('allows two unconfirmed orders per device (FR-GOS-27)', async () => {
    expect((await a.order([{ itemId: f.espresso, quantity: 1 }])).statusCode).toBe(201);
    const third = await a.order([{ itemId: f.espresso, quantity: 1 }]);
    expect(third.statusCode).toBe(429);
    expect(errorCode(third)).toBe('too_many_pending');
  });

  it('lets the waiter accept; the first accepted order verifies the table (FR-GOS-21)', async () => {
    const floor = (await staffCall(t, waiter, 'GET', '/staff/floor')).json<Floor>();
    const table = floor.tables.find((t) => t.label === 'T1')!;
    expect(table.status).toBe('needs_service');
    expect(table.session).toMatchObject({ verified: false, openOrders: 2, newOrders: 2 });

    const state = await a.state();
    for (const order of state.orders) {
      expect(
        (await staffCall(t, waiter, 'POST', `/staff/orders/${order.id}/accept`)).statusCode,
      ).toBe(204);
    }
    const after = await a.state();
    expect(after.session.verified).toBe(true);
    expect(after.orders.every((o) => o.status === 'accepted')).toBe(true);
    expect(after.bill).toEqual({
      lines: [
        { name: 'Espresso', quantity: 1, unitPrice: '2.00', total: '2.00' },
        { name: 'Espresso (Kravlje)', quantity: 2, unitPrice: '2.50', total: '5.00' },
      ],
      total: '7.00',
      vatAmount: '1.02',
      paid: '0.00',
      remaining: '7.00',
    });
    // Accepting twice is a conflict, not a second history row.
    const again = await staffCall(t, waiter, 'POST', `/staff/orders/${after.orders[0]!.id}/accept`);
    expect(again.statusCode).toBe(409);
  });

  it('shows every order of the table with its nickname (FR-GOS-24)', async () => {
    const sb = await b.state();
    expect(sb.orders).toHaveLength(2);
    expect(sb.orders.every((o) => o.orderedBy === 'Gost 3')).toBe(true);
  });

  it('keeps a disputed order off the bill (FR-GOS-25)', async () => {
    const sb = await b.state();
    const disputed = sb.orders.find((o) => o.total === '2.00')!;
    const res = await b.call('POST', `/guest/orders/${disputed.id}/dispute`);
    expect(res.statusCode).toBe(200);
    const state = res.json<GuestSessionState>();
    expect(state.orders.find((o) => o.id === disputed.id)!.dispute).toBe('open');
    expect(state.bill.total).toBe('5.00');
  });

  it('lets a device correct or withdraw a returned order (FR-GOS-12)', async () => {
    const placed = (await a.order([{ itemId: f.espresso, quantity: 1 }])).json<PlacedOrder>().order;
    await t.admin.query(
      `UPDATE ordering.orders SET status = 'returned', staff_message = 'Nema mlijeka' WHERE id = $1`,
      [placed.id],
    );
    expect(errorCode(await b.call('POST', `/guest/orders/${placed.id}/withdraw`))).toBe(
      'forbidden',
    );

    const fixed = await a.call('PUT', `/guest/orders/${placed.id}`, {
      items: [{ itemId: f.espresso, quantity: 3 }],
    });
    expect(fixed.statusCode).toBe(200);
    const order = fixed.json<GuestSessionState>().orders.find((o) => o.id === placed.id)!;
    expect(order).toMatchObject({ status: 'new', total: '6.00', staffMessage: 'Nema mlijeka' });
    expect(order.items.map((i) => i.quantity)).toEqual([3]);

    expect(errorCode(await a.call('POST', `/guest/orders/${placed.id}/withdraw`))).toBe(
      'invalid_state',
    );
    await t.admin.query(
      `UPDATE ordering.orders SET status = 'returned', staff_message = 'Opet' WHERE id = $1`,
      [placed.id],
    );
    const withdrawn = await a.call('POST', `/guest/orders/${placed.id}/withdraw`);
    expect(withdrawn.json<GuestSessionState>().orders.find((o) => o.id === placed.id)!.status).toBe(
      'withdrawn',
    );
  });

  it('calls the waiter at most once a minute (FR-GOS-14)', async () => {
    const first = await b.call('POST', '/guest/requests', { type: 'call_waiter' });
    expect(first.statusCode).toBe(200);
    expect(first.json<GuestSessionState>().callWaiterAvailableAt).not.toBeNull();
    const second = await a.call('POST', '/guest/requests', { type: 'call_waiter' });
    expect(second.statusCode).toBe(429);
    expect(errorCode(second)).toBe('cooldown');
  });

  it('asks for the bill with a payment method the venue takes (FR-GOS-15)', async () => {
    const card = await a.call('POST', '/guest/requests', {
      type: 'request_bill',
      paymentMethod: 'card',
    });
    expect(errorCode(card)).toBe('payment_method_unavailable');
    const cash = await a.call('POST', '/guest/requests', {
      type: 'request_bill',
      paymentMethod: 'cash',
    });
    expect(cash.json<GuestSessionState>().session).toMatchObject({
      status: 'bill_requested',
      requestedPaymentMethod: 'cash',
    });
  });

  it('stops orders when the venue turns guest ordering off (FR-GOS-03)', async () => {
    await t.admin.query(`UPDATE core.venues SET guest_ordering_enabled = false WHERE id = $1`, [
      f.venueId,
    ]);
    try {
      expect((await a.call('GET', '/guest/venue')).json<GuestVenue>()).toMatchObject({
        orderingOpen: false,
        closedReason: 'ordering_disabled',
      });
      expect(errorCode(await b.order([{ itemId: f.espresso, quantity: 1 }]))).toBe(
        'ordering_closed',
      );
    } finally {
      await t.admin.query(`UPDATE core.venues SET guest_ordering_enabled = true WHERE id = $1`, [
        f.venueId,
      ]);
    }
  });

  it('allows five orders a minute per table (FR-GOS-27)', async () => {
    const devices = [new Device(t, 'kafa'), new Device(t, 'kafa'), new Device(t, 'kafa')];
    const host = (await devices[0]!.join(f.tables.T2!)).json<GuestSessionState>();
    for (const d of devices.slice(1)) {
      const s = (await d.join(f.tables.T2!)).json<GuestSessionState>();
      await devices[0]!.call('POST', `/guest/session/guests/${s.me.id}/approve`);
    }
    const codes: number[] = [];
    for (const d of devices) {
      codes.push((await d.order([{ itemId: f.espresso, quantity: 1 }])).statusCode);
      codes.push((await d.order([{ itemId: f.espresso, quantity: 1 }])).statusCode);
    }
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
    expect(host.session.tableLabel).toBe('T2');
  });
});

describe('PIN mode (FR-GOS-21)', () => {
  it('needs the waiter PIN before the first order, with limited attempts', async () => {
    const p = await fixture(t, 'pin-kafa', 'pin');
    const device = new Device(t, 'pin-kafa');
    const state = (await device.join(p.tables.T1!)).json<GuestSessionState>();
    expect(state.session).toMatchObject({ verified: false, verificationMode: 'pin' });
    expect(errorCode(await device.order([{ itemId: p.espresso, quantity: 1 }]))).toBe(
      'verification_required',
    );

    const { rows } = await t.admin.query<{ verification_code: string }>(
      `SELECT verification_code FROM ordering.table_sessions WHERE id = $1`,
      [state.session.id],
    );
    const code = rows[0]!.verification_code;
    const wrong = code === '0000' ? '1111' : '0000';
    expect(errorCode(await device.call('POST', '/guest/session/verify', { code: wrong }))).toBe(
      'invalid_code',
    );
    const ok = await device.call('POST', '/guest/session/verify', { code });
    expect(ok.json<GuestSessionState>().session.verified).toBe(true);
    expect((await device.order([{ itemId: p.espresso, quantity: 1 }])).statusCode).toBe(201);

    // Five tries per session in ten minutes.
    const other = new Device(t, 'pin-kafa');
    await other.join(p.tables.T2!);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await other.call('POST', '/guest/session/verify', { code: wrong })).statusCode,
      );
    }
    expect(statuses.slice(-1)).toEqual([429]);
  });
});

describe('realtime (FR-GOS-10, NFR-02)', () => {
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    await t.app.listen(0, '127.0.0.1');
    url = await t.app.getUrl();
  });

  afterAll(() => {
    for (const s of sockets) s.disconnect();
  });

  const connect = (options: Parameters<typeof io>[1]) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], reconnection: false, ...options });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const next = (socket: Socket, event: string) =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), 5_000);
      socket.once(event, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it('tells the table and the staff when something changes', async () => {
    const device = new Device(t, 'kafa');
    const state = (await device.join(await freeTable())).json<GuestSessionState>();

    const guest = await connect({
      extraHeaders: { host: 'kafa.qafe.test', cookie: `qafe_gd=${device.cookie}` },
    });
    const staff = await connect({ auth: { token: waiter } });
    // Give the server a moment to place the guest in its room.
    await new Promise((r) => setTimeout(r, 200));

    const forStaff = next(staff, 'venue.changed');
    const forGuest = next(guest, 'session.changed');
    const placed = await device.order([{ itemId: f.espresso, quantity: 1 }]);
    expect(placed.statusCode).toBe(201);
    expect(await forStaff).toMatchObject({ sessionId: state.session.id, reason: 'order.created' });
    expect(await forGuest).toEqual({ sessionId: state.session.id });

    const accepted = next(guest, 'session.changed');
    await staffCall(
      t,
      waiter,
      'POST',
      `/staff/orders/${placed.json<PlacedOrder>().order.id}/accept`,
    );
    expect(await accepted).toEqual({ sessionId: state.session.id });
  });

  it('drops sockets of unknown venues and invalid tokens', async () => {
    for (const options of [
      { extraHeaders: { host: 'nema.qafe.test' } },
      { auth: { token: 'not-a-token' } },
    ]) {
      const socket = io(url, { transports: ['websocket'], reconnection: false, ...options });
      sockets.push(socket);
      await next(socket, 'disconnect');
    }
  });

  it('keeps a guest without a table connected, in no room', async () => {
    const socket = await connect({ extraHeaders: { host: 'kafa.qafe.test' } });
    await new Promise((r) => setTimeout(r, 200));
    expect(socket.connected).toBe(true);
  });
});

/** A new table of "kafa", so the realtime test starts with its own session. */
async function freeTable(): Promise<string> {
  const token = randomUUID().replaceAll('-', '');
  await t.admin.query(`INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, 'RT', $2)`, [
    f.venueId,
    token,
  ]);
  return token;
}
