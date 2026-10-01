// Fixtures for ordering tests: a guest phone (keeps its cookie) and a venue with tables and a menu.
import type { GuestSessionState, StaffSession } from '@qafe/contracts';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createVenue, type TestApp } from './test-app.js';

let ip = 0;

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** One phone: keeps its device cookie like a browser on <slug>.qafe.test would. */
export class Device {
  cookie: string | undefined;
  constructor(
    readonly t: TestApp,
    readonly slug: string,
  ) {}

  async call(method: Method, url: string, payload?: object) {
    const res = await this.t.app.inject({
      method,
      url,
      payload,
      headers: {
        host: `${this.slug}.qafe.test`,
        ...(this.cookie ? { cookie: `qafe_gd=${this.cookie}` } : {}),
      },
    });
    const set = res.cookies.find((c) => c.name === 'qafe_gd');
    if (set) this.cookie = set.value;
    return res;
  }

  join(token: string, body: object = {}) {
    return this.call('POST', `/guest/tables/${token}/join`, body);
  }

  order(items: object[], key: string = randomUUID()) {
    return this.call('POST', '/guest/orders', { idempotencyKey: key, items });
  }

  async state(): Promise<GuestSessionState> {
    const res = await this.call('GET', '/guest/session');
    expect(res.statusCode).toBe(200);
    return res.json<GuestSessionState>();
  }
}

export const staffCall = (
  t: TestApp,
  token: string,
  method: Method,
  url: string,
  payload?: object,
) => t.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

export async function tokenOf(
  t: TestApp,
  venueSlug: string,
  username: string,
  password: string,
): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/auth/staff/login',
    payload: { venueSlug, username, password },
    remoteAddress: `10.3.${Math.floor(ip / 200)}.${ip++ % 200}`,
  });
  expect(res.statusCode).toBe(200);
  return res.json<StaffSession>().accessToken;
}

export const errorCode = (res: { json: <T>() => T }) =>
  res.json<{ error: { code: string } }>().error.code;

export interface Fixture {
  venueId: string;
  tables: Record<string, string>;
  espresso: string;
  sold: string;
  milkGroup: string;
  milk: string;
  oat: string;
}

/** A venue with tables T1..T3, a menu with an espresso (milk options) and a sold-out item. */
export async function fixture(
  t: TestApp,
  slug: string,
  mode: 'waiter' | 'pin' = 'waiter',
): Promise<Fixture> {
  const venueId = await createVenue(t.admin, slug, [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-1', fullName: 'Šef' },
    { username: 'konobar', role: 'Konobar', password: 'Konobar-Lozinka-1', fullName: 'Amra' },
  ]);
  await t.admin.query(`UPDATE core.venues SET session_verification_mode = $2 WHERE id = $1`, [
    venueId,
    mode,
  ]);
  const tables: Record<string, string> = {};
  for (const label of ['T1', 'T2', 'T3']) {
    const token = randomUUID().replaceAll('-', '');
    await t.admin.query(`INSERT INTO core.tables (venue_id, label, qr_token) VALUES ($1, $2, $3)`, [
      venueId,
      label,
      token,
    ]);
    tables[label] = token;
  }
  const one = async (query: string, params: unknown[]) =>
    (await t.admin.query<{ id: string }>(query, params)).rows[0]!.id;
  const menu = await one(
    `INSERT INTO catalog.menus (venue_id, name) VALUES ($1, 'Meni') RETURNING id`,
    [venueId],
  );
  const hot = await one(
    `INSERT INTO catalog.categories (venue_id, menu_id, name, sort_order)
     VALUES ($1, $2, 'Topli napici', 1) RETURNING id`,
    [venueId, menu],
  );
  const hidden = await one(
    `INSERT INTO catalog.categories (venue_id, menu_id, name, sort_order, is_active)
     VALUES ($1, $2, 'Skriveno', 2, false) RETURNING id`,
    [venueId, menu],
  );
  const espresso = await one(
    `INSERT INTO catalog.items (venue_id, category_id, name, price) VALUES ($1, $2, 'Espresso', 2.00)
     RETURNING id`,
    [venueId, hot],
  );
  const sold = await one(
    `INSERT INTO catalog.items (venue_id, category_id, name, price, is_available)
     VALUES ($1, $2, 'Čaj', 1.50, false) RETURNING id`,
    [venueId, hot],
  );
  await one(
    `INSERT INTO catalog.items (venue_id, category_id, name, price) VALUES ($1, $2, 'Tajna', 9)
     RETURNING id`,
    [venueId, hidden],
  );
  const milkGroup = await one(
    `INSERT INTO catalog.modifier_groups (venue_id, name, min_select, max_select)
     VALUES ($1, 'Mlijeko', 0, 1) RETURNING id`,
    [venueId],
  );
  const milk = await one(
    `INSERT INTO catalog.modifier_options (venue_id, group_id, name, price_delta)
     VALUES ($1, $2, 'Kravlje', 0.50) RETURNING id`,
    [venueId, milkGroup],
  );
  const oat = await one(
    `INSERT INTO catalog.modifier_options (venue_id, group_id, name, price_delta)
     VALUES ($1, $2, 'Zobeno', 0.80) RETURNING id`,
    [venueId, milkGroup],
  );
  await t.admin.query(
    `INSERT INTO catalog.item_modifier_groups (venue_id, item_id, group_id) VALUES ($1, $2, $3)`,
    [venueId, espresso, milkGroup],
  );
  return { venueId, tables, espresso, sold, milkGroup, milk, oat };
}
