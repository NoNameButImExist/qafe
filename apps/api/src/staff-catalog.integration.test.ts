// Staff sign-in, venue settings and the menu, over HTTP against a real Postgres.
import { hashPassword } from '@qafe/auth';
import type { AuthSession, Menu, StaffSession, VenueSettings } from '@qafe/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVenue, startTestApp, type TestApp } from './test-support/test-app.js';

let t: TestApp;
let venueA: string;
let venueB: string;

type Res = Awaited<ReturnType<TestApp['app']['inject']>>;
const cookie = (res: Res, name: string) => res.cookies.find((c) => c.name === name)?.value;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const staffLogin = (venueSlug: string, username: string, password: string, ip = '10.1.0.1') =>
  t.app.inject({
    method: 'POST',
    url: '/auth/staff/login',
    payload: { venueSlug, username, password },
    remoteAddress: ip,
  });

async function tokenOf(venueSlug: string, username: string, password: string): Promise<string> {
  const res = await staffLogin(
    venueSlug,
    username,
    password,
    `10.1.9.${Math.floor(Math.random() * 200)}`,
  );
  expect(res.statusCode).toBe(200);
  return res.json<StaffSession>().accessToken;
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

/** A multipart body with one file, plus the bearer token. */
function multipart(token: string, data: Buffer, filename: string, type: string) {
  const boundary = `----qafe${randomUUID()}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { ...bearer(token), 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

beforeAll(async () => {
  t = await startTestApp();
  venueA = await createVenue(t.admin, 'kafa-a', [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-1', fullName: 'Sef A' },
    { username: 'konobar', role: 'Konobar', password: 'Konobar-Lozinka-1', fullName: 'Konobar A' },
  ]);
  venueB = await createVenue(t.admin, 'kafa-b', [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-B' },
  ]);
  await createVenue(
    t.admin,
    'zatvoren',
    [{ username: 'sef', role: 'Šef', password: 'Sef-Lozinka-C' }],
    'closed',
  );
  await t.admin.query(
    `INSERT INTO core.users (email, password_hash, full_name, platform_role, must_change_password)
     VALUES ('admin@qafe.ba', $1, 'Admin', 'super_admin', false)`,
    [await hashPassword('Admin123!')],
  );
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('staff sign-in', () => {
  it('refuses a wrong venue, username or password the same way', async () => {
    for (const [slug, user, pass] of [
      ['nema-ga', 'sef', 'Sef-Lozinka-1'],
      ['kafa-a', 'nema', 'Sef-Lozinka-1'],
      ['kafa-a', 'sef', 'pogresna'],
    ] as const) {
      const res = await staffLogin(slug, user, pass, '10.1.1.1');
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'invalid_credentials' } });
    }
  });

  it('refuses staff of a closed venue', async () => {
    const res = await staffLogin('zatvoren', 'sef', 'Sef-Lozinka-C');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'venue_closed' } });
  });

  it('signs in with a staff cookie, the venue and the role permissions', async () => {
    const res = await staffLogin('KAFA-A', 'SEF', 'Sef-Lozinka-1');
    expect(res.statusCode).toBe(200);
    const body = res.json<StaffSession>();
    expect(body.user).toMatchObject({
      kind: 'staff',
      username: 'sef',
      role: 'Šef',
      isOwner: true,
      venue: { slug: 'kafa-a', status: 'active', currency: 'BAM' },
      modules: [],
    });
    expect(body.user.permissions).toContain('menu.edit');
    expect(cookie(res, 'qafe_srt')).toBeTruthy();
    expect(cookie(res, 'qafe_rt')).toBeUndefined();

    const me = await t.app.inject({
      method: 'GET',
      url: '/auth/staff/me',
      headers: bearer(body.accessToken),
    });
    expect(me.json()).toMatchObject({ username: 'sef', venue: { slug: 'kafa-a' } });
  });

  it('keeps staff and admin sessions apart', async () => {
    const res = await staffLogin('kafa-a', 'sef', 'Sef-Lozinka-1');
    const { accessToken } = res.json<StaffSession>();
    const staffCookie = cookie(res, 'qafe_srt')!;

    expect(
      (await t.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(accessToken) }))
        .statusCode,
    ).toBe(401);
    expect(
      (await t.app.inject({ method: 'GET', url: '/admin/stats', headers: bearer(accessToken) }))
        .statusCode,
    ).toBe(403);
    // A staff refresh token is refused by the admin refresh endpoint, and the other way round.
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { qafe_rt: staffCookie },
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: staffCookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(cookie(ok, 'qafe_srt')).not.toBe(staffCookie);

    const adminRes = await t.app.inject({
      method: 'POST',
      url: '/auth/admin/login',
      payload: { email: 'admin@qafe.ba', password: 'Admin123!' },
    });
    const adminCookie = cookie(adminRes, 'qafe_rt')!;
    const cross = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: adminCookie },
    });
    expect(cross.statusCode).toBe(401);
  });

  it('ends the session when the member is deactivated', async () => {
    const res = await staffLogin('kafa-a', 'konobar', 'Konobar-Lozinka-1');
    await t.admin.query(
      `UPDATE core.venue_members SET is_active = false WHERE username = 'konobar'`,
    );
    const refresh = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: cookie(res, 'qafe_srt')! },
    });
    expect(refresh.statusCode).toBe(401);
    expect((await staffLogin('kafa-a', 'konobar', 'Konobar-Lozinka-1')).statusCode).toBe(403);
    await t.admin.query(
      `UPDATE core.venue_members SET is_active = true WHERE username = 'konobar'`,
    );
  });
});

describe('venue settings', () => {
  let owner: string;
  let waiter: string;

  beforeAll(async () => {
    owner = await tokenOf('kafa-a', 'sef', 'Sef-Lozinka-1');
    waiter = await tokenOf('kafa-a', 'konobar', 'Konobar-Lozinka-1');
  });

  it('shows the settings to any staff member but only the owner changes them', async () => {
    const view = await t.app.inject({ method: 'GET', url: '/venue', headers: bearer(waiter) });
    expect(view.statusCode).toBe(200);
    expect(view.json<VenueSettings>()).toMatchObject({
      slug: 'kafa-a',
      vatRate: '17.00',
      payments: { cash: true, card: false, default: 'cash' },
      ordering: { guestOrderingEnabled: true, orderRejectionEnabled: false },
    });
    const denied = await t.app.inject({
      method: 'PATCH',
      url: '/venue',
      headers: bearer(waiter),
      payload: { vatRate: '10' },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('updates profile, ordering, VAT and payment methods, and records the change', async () => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/venue',
      headers: bearer(owner),
      payload: {
        profile: { city: 'Tuzla', primaryColor: '#0070e8', phone: '' },
        ordering: { orderRejectionEnabled: true, sessionVerificationMode: 'pin' },
        vatRate: '18,5',
        payments: { cash: true, card: true, default: 'card' },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<VenueSettings>()).toMatchObject({
      profile: { city: 'Tuzla', primaryColor: '#0070E8', phone: null },
      ordering: { orderRejectionEnabled: true, sessionVerificationMode: 'pin' },
      vatRate: '18.50',
      payments: { cash: true, card: true, default: 'card' },
    });
    const { rows } = await t.admin.query<{
      payload: { after: Record<string, unknown>; actor: { label: string } };
    }>(
      `SELECT payload FROM core.outbox WHERE event_type = 'venue.updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows[0]!.payload.after).toMatchObject({
      city: 'Tuzla',
      vat_rate: '18.50',
      payments: { default: 'card' },
    });
    expect(rows[0]!.payload.actor.label).toBe('Sef A (@sef)');
  });

  it('refuses a default payment method that is switched off', async () => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/venue',
      headers: bearer(owner),
      payload: { payments: { cash: true, card: false, default: 'card' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores a logo image and refuses files that are not images', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/venue/logo',
      ...multipart(owner, PNG, 'logo.png', 'image/png'),
    });
    expect(res.statusCode).toBe(201);
    const url = res.json<VenueSettings>().profile.logoUrl!;
    expect(url).toMatch(new RegExp(`^memory://venues/${venueA}/logo/[0-9a-f-]{36}\\.png$`));
    expect(t.storage.files.get(url.replace('memory://', ''))?.contentType).toBe('image/png');

    const fake = await t.app.inject({
      method: 'POST',
      url: '/venue/logo',
      ...multipart(owner, Buffer.from('<svg onload=alert(1)>'), 'x.png', 'image/png'),
    });
    expect(fake.statusCode).toBe(415);
    expect(fake.json()).toMatchObject({ error: { code: 'unsupported_image' } });
  });
});

describe('menu', () => {
  let owner: string;
  let waiter: string;
  let ownerB: string;
  let menu: Menu;

  const call = (
    token: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => t.app.inject({ method, url, payload, headers: bearer(token) });

  beforeAll(async () => {
    owner = await tokenOf('kafa-a', 'sef', 'Sef-Lozinka-1');
    waiter = await tokenOf('kafa-a', 'konobar', 'Konobar-Lozinka-1');
    ownerB = await tokenOf('kafa-b', 'sef', 'Sef-Lozinka-B');
  });

  it('starts empty and builds categories, items and modifiers', async () => {
    expect((await call(owner, 'GET', '/catalog/menu')).json<Menu>()).toEqual({
      categories: [],
      modifierGroups: [],
    });

    await call(owner, 'POST', '/catalog/categories', { name: 'Topli napici' });
    menu = (
      await call(owner, 'POST', '/catalog/categories', { name: 'Sokovi', description: '' })
    ).json<Menu>();
    expect(menu.categories.map((c) => [c.name, c.sortOrder])).toEqual([
      ['Topli napici', 1],
      ['Sokovi', 2],
    ]);
    const hot = menu.categories[0]!.id;

    await call(owner, 'POST', '/catalog/items', { categoryId: hot, name: 'Espresso', price: '2' });
    menu = (
      await call(owner, 'POST', '/catalog/items', {
        categoryId: hot,
        name: 'Kafa s mlijekom',
        price: '2,5',
        volumeLabel: '',
      })
    ).json<Menu>();
    expect(menu.categories[0]!.items.map((i) => [i.name, i.price, i.volumeLabel])).toEqual([
      ['Espresso', '2.00', null],
      ['Kafa s mlijekom', '2.50', null],
    ]);

    menu = (
      await call(owner, 'POST', '/catalog/modifier-groups', {
        name: 'Mlijeko',
        minSelect: 0,
        maxSelect: 1,
        options: [
          { name: 'Kravlje', priceDelta: '0', isDefault: true },
          { name: 'Zobeno', priceDelta: '0,50' },
        ],
      })
    ).json<Menu>();
    const group = menu.modifierGroups[0]!;
    expect(group.options.map((o) => [o.name, o.priceDelta, o.isDefault])).toEqual([
      ['Kravlje', '0.00', true],
      ['Zobeno', '0.50', false],
    ]);

    const latte = menu.categories[0]!.items[1]!;
    menu = (
      await call(owner, 'PATCH', `/catalog/items/${latte.id}`, {
        modifierGroupIds: [group.id],
        price: '2.70',
      })
    ).json<Menu>();
    expect(menu.categories[0]!.items[1]).toMatchObject({
      price: '2.70',
      modifierGroupIds: [group.id],
    });
    expect(menu.modifierGroups[0]!.itemCount).toBe(1);
  });

  it('records price changes for the audit log (NFR-25)', async () => {
    const { rows } = await t.admin.query<{
      payload: { before: object; after: object; actor: { label: string } };
    }>(
      `SELECT payload FROM catalog.outbox WHERE event_type = 'item.updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows[0]!.payload.before).toMatchObject({ price: '2.50' });
    expect(rows[0]!.payload.after).toMatchObject({ price: '2.70' });
    expect(rows[0]!.payload.actor.label).toBe('Sef A (@sef)');
  });

  it('edits options in place: kept options keep their id, removed ones go', async () => {
    const group = menu.modifierGroups[0]!;
    const kept = group.options[0]!;
    menu = (
      await call(owner, 'PUT', `/catalog/modifier-groups/${group.id}`, {
        name: 'Vrsta mlijeka',
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: kept.id, name: 'Kravlje', priceDelta: '0', isDefault: true },
          { name: 'Bademovo', priceDelta: '0.60' },
        ],
      })
    ).json<Menu>();
    const saved = menu.modifierGroups[0]!;
    expect(saved.name).toBe('Vrsta mlijeka');
    expect(saved.options.map((o) => o.name)).toEqual(['Kravlje', 'Bademovo']);
    expect(saved.options[0]!.id).toBe(kept.id);
  });

  it('reorders categories and items (drag and drop)', async () => {
    const [hot, cold] = menu.categories;
    menu = (
      await call(owner, 'PUT', '/catalog/categories/order', { ids: [cold!.id, hot!.id] })
    ).json<Menu>();
    expect(menu.categories.map((c) => c.name)).toEqual(['Sokovi', 'Topli napici']);
    const items = menu.categories[1]!.items;
    menu = (
      await call(owner, 'PUT', `/catalog/categories/${hot!.id}/items/order`, {
        ids: [items[1]!.id, items[0]!.id],
      })
    ).json<Menu>();
    expect(menu.categories[1]!.items.map((i) => i.name)).toEqual(['Kafa s mlijekom', 'Espresso']);
  });

  it('lets a waiter mark an item unavailable, but not edit the menu', async () => {
    const item = menu.categories[1]!.items[0]!;
    const off = await call(waiter, 'PATCH', `/catalog/items/${item.id}/availability`, {
      available: false,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json<Menu>().categories[1]!.items[0]!.isAvailable).toBe(false);
    expect((await call(waiter, 'GET', '/catalog/menu')).statusCode).toBe(200);
    expect((await call(waiter, 'POST', '/catalog/categories', { name: 'X' })).statusCode).toBe(403);
    expect(
      (await call(waiter, 'PATCH', `/catalog/items/${item.id}`, { price: '1' })).statusCode,
    ).toBe(403);
  });

  it('keeps each venue to its own menu (RLS)', async () => {
    expect((await call(ownerB, 'GET', '/catalog/menu')).json<Menu>().categories).toEqual([]);
    const item = menu.categories[1]!.items[0]!;
    expect(
      (await call(ownerB, 'PATCH', `/catalog/items/${item.id}`, { price: '0.10' })).statusCode,
    ).toBe(404);
    expect((await call(ownerB, 'DELETE', `/catalog/items/${item.id}`)).statusCode).toBe(404);
    const foreign = await call(ownerB, 'POST', '/catalog/items', {
      categoryId: menu.categories[0]!.id,
      name: 'Uljez',
      price: '1',
    });
    expect(foreign.statusCode).toBe(404);
    expect(
      (await call(owner, 'GET', '/catalog/menu')).json<Menu>().categories[1]!.items[0]!.price,
    ).toBe('2.70');
  });

  it('deletes only an empty category', async () => {
    const hot = menu.categories[1]!;
    const refused = await call(owner, 'DELETE', `/catalog/categories/${hot.id}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'category_not_empty' } });
    for (const item of hot.items) await call(owner, 'DELETE', `/catalog/items/${item.id}`);
    menu = (await call(owner, 'DELETE', `/catalog/categories/${hot.id}`)).json<Menu>();
    expect(menu.categories.map((c) => c.name)).toEqual(['Sokovi']);
  });

  it('uploads item images', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/catalog/images',
      ...multipart(owner, PNG, 'kafa.png', 'image/png'),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ url: string }>().url).toMatch(
      new RegExp(`^memory://venues/${venueA}/items/`),
    );
  });

  it('lets a platform admin edit any venue menu (FR-ADM-07)', async () => {
    const admin = (
      await t.app.inject({
        method: 'POST',
        url: '/auth/admin/login',
        payload: { email: 'admin@qafe.ba', password: 'Admin123!' },
      })
    ).json<AuthSession>().accessToken;
    const res = await call(admin, 'POST', `/admin/venues/${venueB}/catalog/categories`, {
      name: 'Kokteli',
    });
    expect(res.statusCode).toBe(201);
    expect(
      (await call(ownerB, 'GET', '/catalog/menu')).json<Menu>().categories.map((c) => c.name),
    ).toEqual(['Kokteli']);
    const missing = await call(admin, 'GET', `/admin/venues/${randomUUID()}/catalog/menu`);
    expect(missing.statusCode).toBe(404);
    expect((await call(owner, 'GET', `/admin/venues/${venueA}/catalog/menu`)).statusCode).toBe(403);
  });
});
