// Panel features of block 5 against real Postgres and Redis: the day's orders (FR-SEF-23),
// the settled-table feed and sales reports (FR-SEF-24, 25), opening hours (FR-SEF-02, FR-GOS-03).
import type {
  DayOrderList,
  GuestVenue,
  MyDay,
  ReportSummary,
  SessionSettledEvent,
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
let owner: string;
let waiter: string;

beforeAll(async () => {
  t = await startTestApp();
  f = await fixture(t, 'izvjestaji');
  owner = await tokenOf(t, 'izvjestaji', 'sef', 'Sef-Lozinka-1');
  waiter = await tokenOf(t, 'izvjestaji', 'konobar', 'Konobar-Lozinka-1');
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('a paid table feeds reporting (FR-SEF-24)', () => {
  let event: SessionSettledEvent;

  it('publishes every billed item with its snapshot in the same transaction', async () => {
    const guest = new Device(t, 'izvjestaji');
    const { session } = (await guest.join(f.tables.T1!)).json<{ session: { id: string } }>();
    const placed = await guest.order([
      { itemId: f.espresso, quantity: 2, modifierOptionIds: [f.milk] },
      { itemId: f.espresso, quantity: 1 },
    ]);
    const orderId = placed.json<{ order: { id: string } }>().order.id;
    await staffCall(t, waiter, 'POST', `/staff/orders/${orderId}/accept`);
    // A second order, cancelled: it must not reach the report.
    const second = (await guest.order([{ itemId: f.espresso, quantity: 9 }])).json<{
      order: { id: string };
    }>().order.id;
    await staffCall(t, owner, 'POST', `/staff/orders/${second}/cancel`, { reason: 'Greška' });

    expect(
      (await staffCall(t, waiter, 'POST', `/staff/sessions/${session.id}/pay`, { method: 'cash' }))
        .statusCode,
    ).toBe(201);

    const { rows } = await t.admin.query<{ payload: SessionSettledEvent }>(
      `SELECT payload FROM ordering.outbox WHERE event_type = 'session.settled' AND aggregate_id = $1`,
      [session.id],
    );
    expect(rows).toHaveLength(1);
    event = rows[0]!.payload;
    expect(event).toMatchObject({ paymentMethod: 'cash', tableLabel: 'T1', areaName: null });
    expect(
      event.items.map((i) => [i.itemName, i.quantity, i.revenue, i.vatAmount, i.memberName]),
    ).toEqual([
      ['Espresso', 2, '5.00', '0.73', 'Amra'],
      ['Espresso', 1, '2.00', '0.29', 'Amra'],
    ]);
    expect(event.items[0]!.hourOfDay).toBeGreaterThanOrEqual(0);
    expect(event.items[0]!.dayOfWeek).toBeGreaterThanOrEqual(1);
  });

  it('summarises facts by day, item, waiter, hour and payment, with the previous period', async () => {
    // What the worker writes from the event above, plus one sale in the previous period.
    const insert = (i: SessionSettledEvent['items'][number], date: string, method = 'cash') =>
      t.admin.query(
        `INSERT INTO reporting.order_item_facts (order_item_id, venue_id, order_id, business_date,
           served_at, hour_of_day, day_of_week, table_label, member_id, member_name, item_id,
           item_name, category_name, quantity, revenue, vat_amount, payment_method)
         VALUES ($1, $2, $3, $4, now(), 9, 3, 'T1', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          randomUUID(),
          f.venueId,
          i.orderId,
          date,
          i.memberId,
          i.memberName,
          i.itemId,
          i.itemName,
          i.categoryName,
          i.quantity,
          i.revenue,
          i.vatAmount,
          method,
        ],
      );
    for (const item of event.items) await insert(item, '2026-09-10');
    await insert({ ...event.items[1]!, orderId: randomUUID() }, '2026-09-11', 'card');
    await insert({ ...event.items[1]!, orderId: randomUUID() }, '2026-09-08');

    const res = await staffCall(t, owner, 'GET', '/reports/summary?from=2026-09-10&to=2026-09-11');
    expect(res.statusCode).toBe(200);
    const r = res.json<ReportSummary>();
    expect(r.totals).toEqual({
      revenue: '9.00',
      vatAmount: '1.31',
      orders: 2,
      items: 4,
      averageOrder: '4.50',
    });
    expect(r.previous).toMatchObject({
      from: '2026-09-08',
      to: '2026-09-09',
      totals: { revenue: '2.00', orders: 1 },
    });
    expect(r.byDay).toEqual([
      { date: '2026-09-10', revenue: '7.00', orders: 1, quantity: 3 },
      { date: '2026-09-11', revenue: '2.00', orders: 1, quantity: 1 },
    ]);
    expect(r.byItem).toEqual([
      {
        itemId: f.espresso,
        name: 'Espresso',
        category: 'Topli napici',
        revenue: '9.00',
        orders: 2,
        quantity: 4,
      },
    ]);
    expect(r.byMember).toMatchObject([{ name: 'Amra', revenue: '9.00' }]);
    expect(r.byPaymentMethod).toEqual([
      { method: 'cash', revenue: '7.00', orders: 1, quantity: 3 },
      { method: 'card', revenue: '2.00', orders: 1, quantity: 1 },
    ]);
    expect(r.byHour).toHaveLength(24);
    expect(r.byHour[9]).toMatchObject({ revenue: '9.00' });
    expect(r.byWeekday[2]).toMatchObject({ day: 3, revenue: '9.00' });
  });

  it('exports CSV and Excel, and is for members with reports.view only', async () => {
    const csv = await staffCall(
      t,
      owner,
      'GET',
      '/reports/export?from=2026-09-10&to=2026-09-11&format=csv&dimension=day',
    );
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toBe(
      '﻿Datum;Narudžbe;Količina;Promet (KM)\r\n2026-09-10;1;3;7\r\n2026-09-11;1;1;2\r\n',
    );

    const en = await staffCall(
      t,
      owner,
      'GET',
      '/reports/export?from=2026-09-10&to=2026-09-11&format=csv&dimension=item&lang=en',
    );
    expect(en.body.split('\r\n')[1]).toBe('Espresso,Topli napici,4,2,9');

    const xlsx = await staffCall(
      t,
      owner,
      'GET',
      '/reports/export?from=2026-09-10&to=2026-09-11&format=xlsx',
    );
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-disposition']).toMatch(/\.xlsx"$/);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');

    expect(
      (await staffCall(t, waiter, 'GET', '/reports/summary?from=2026-09-10&to=2026-09-11'))
        .statusCode,
    ).toBe(403);
    expect(
      (await staffCall(t, owner, 'GET', '/reports/summary?from=2026-09-12&to=2026-09-10'))
        .statusCode,
    ).toBe(400);
  });
});

describe("a member's own day (FR-KON-23)", () => {
  it('shows a waiter what the tables they served paid, without reports.view', async () => {
    const res = await staffCall(t, waiter, 'GET', '/reports/me?date=2026-09-10');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<MyDay>()).toEqual({
      date: '2026-09-10',
      revenue: '7.00',
      orders: 1,
      items: 3,
      byMethod: [{ method: 'cash', revenue: '7.00' }],
      topItems: [{ name: 'Espresso', quantity: 3, revenue: '7.00' }],
    });

    // The owner served nothing that day; today defaults to the venue's business day.
    const mine = (await staffCall(t, owner, 'GET', '/reports/me?date=2026-09-10')).json<MyDay>();
    expect(mine).toMatchObject({ revenue: '0.00', orders: 0, byMethod: [], topItems: [] });
    const today = (await staffCall(t, waiter, 'GET', '/reports/me')).json<MyDay>();
    expect(today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await staffCall(t, waiter, 'GET', '/reports/me?date=10.09.2026')).statusCode).toBe(400);
  });
});

describe("the day's orders (FR-SEF-23)", () => {
  it('lists every order of the business day, any status, all tables', async () => {
    const day = await staffCall(t, owner, 'GET', '/staff/orders/day');
    expect(day.statusCode).toBe(200);
    const list = day.json<DayOrderList>();
    expect(list.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(list.orders.map((o) => o.status).sort()).toEqual(['accepted', 'cancelled']);

    // The table was paid: the orders say so, and nothing on them can change any more.
    const accepted = list.orders.find((o) => o.status === 'accepted')!;
    expect(accepted.sessionStatus).toBe('closed');
    const cancel = await staffCall(t, owner, 'POST', `/staff/orders/${accepted.id}/cancel`, {
      reason: 'Kasno',
    });
    expect(cancel.statusCode).toBe(409);
    expect(errorCode(cancel)).toBe('invalid_state');

    const other = await staffCall(t, owner, 'GET', '/staff/orders/day?date=2020-01-01');
    expect(other.json<DayOrderList>()).toEqual({ date: '2020-01-01', orders: [] });
  });
});

describe('opening hours (FR-SEF-02, FR-GOS-03)', () => {
  /** The venue's local weekday (1-7) and time now, from the database clock. */
  async function localNow() {
    const { rows } = await t.admin.query<{ dow: number; minutes: number }>(
      `SELECT extract(isodow FROM now() AT TIME ZONE 'Europe/Sarajevo')::int AS dow,
              (extract(hour FROM now() AT TIME ZONE 'Europe/Sarajevo') * 60
               + extract(minute FROM now() AT TIME ZONE 'Europe/Sarajevo'))::int AS minutes`,
    );
    return rows[0]!;
  }
  const hhmm = (m: number) => {
    const v = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  };
  const setHours = (openingHours: object[]) =>
    staffCall(t, owner, 'PATCH', '/venue', { openingHours });

  it('are saved with the settings and validated', async () => {
    const res = await setHours([{ day: 1, opensAt: '07:00', closesAt: '23:00' }]);
    expect(res.statusCode).toBe(200);
    expect(res.json<VenueSettings>().openingHours).toEqual([
      { day: 1, opensAt: '07:00', closesAt: '23:00' },
    ]);
    expect((await setHours([{ day: 1, opensAt: '07:00', closesAt: '07:00' }])).statusCode).toBe(
      400,
    );
    expect(
      (
        await setHours([
          { day: 2, opensAt: '07:00', closesAt: '09:00' },
          { day: 2, opensAt: '10:00', closesAt: '12:00' },
        ])
      ).statusCode,
    ).toBe(400);
  });

  it('stop guest orders outside the hours and allow them inside, also past midnight', async () => {
    const now = await localNow();
    const guest = new Device(t, 'izvjestaji');
    await guest.join(f.tables.T2!);
    const venue = async () => (await guest.call('GET', '/guest/venue')).json<GuestVenue>();

    // Today, but the interval ended an hour ago.
    await setHours([
      { day: now.dow, opensAt: hhmm(now.minutes - 180), closesAt: hhmm(now.minutes - 60) },
    ]);
    if (now.minutes >= 180) {
      expect(await venue()).toMatchObject({ orderingOpen: false, closedReason: 'outside_hours' });
      expect(errorCode(await guest.order([{ itemId: f.espresso, quantity: 1 }]))).toBe(
        'ordering_closed',
      );
    }

    // Open now.
    await setHours([
      { day: now.dow, opensAt: hhmm(now.minutes - 60), closesAt: hhmm(now.minutes + 60) },
    ]);
    expect(await venue()).toMatchObject({ orderingOpen: true, closedReason: null });

    // Yesterday's interval running past midnight into now.
    const yesterday = now.dow === 1 ? 7 : now.dow - 1;
    await setHours([{ day: yesterday, opensAt: '23:59', closesAt: hhmm(now.minutes + 30) }]);
    if (now.minutes + 30 < 1440 && now.minutes > 0) {
      expect((await venue()).orderingOpen).toBe(true);
    }

    // No schedule: always open.
    await setHours([]);
    expect((await venue()).orderingOpen).toBe(true);
  });
});
