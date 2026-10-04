// Areas, tables, QR codes and staff accounts of a venue, over HTTP against a real Postgres.
import type {
  StaffDevice,
  StaffDeviceRoster,
  StaffMe,
  StaffSession,
  VenueSpace,
  VenueStaff,
} from '@qafe/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVenue, startTestApp, type TestApp } from './test-support/test-app.js';

let t: TestApp;
let ip = 0;

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const call = (token: string, method: Method, url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: bearer(token) });

const login = (venueSlug: string, username: string, password: string) =>
  t.app.inject({
    method: 'POST',
    url: '/auth/staff/login',
    payload: { venueSlug, username, password },
    remoteAddress: `10.2.${Math.floor(ip / 200)}.${ip++ % 200}`,
  });

async function tokenOf(venueSlug: string, username: string, password: string): Promise<string> {
  const res = await login(venueSlug, username, password);
  expect(res.statusCode).toBe(200);
  return res.json<StaffSession>().accessToken;
}

let owner: string;
let waiter: string;
let ownerB: string;

beforeAll(async () => {
  t = await startTestApp();
  await createVenue(t.admin, 'kafa-a', [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-1', fullName: 'Sef A' },
    { username: 'konobar', role: 'Konobar', password: 'Konobar-Lozinka-1', fullName: 'Konobar A' },
  ]);
  await createVenue(t.admin, 'kafa-b', [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-B' },
  ]);
  owner = await tokenOf('kafa-a', 'sef', 'Sef-Lozinka-1');
  waiter = await tokenOf('kafa-a', 'konobar', 'Konobar-Lozinka-1');
  ownerB = await tokenOf('kafa-b', 'sef', 'Sef-Lozinka-B');
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('areas, tables and QR codes', () => {
  let space: VenueSpace;

  it('is for the owner only', async () => {
    expect((await call(waiter, 'GET', '/venue/tables')).statusCode).toBe(403);
    expect((await call(owner, 'GET', '/venue/tables')).json<VenueSpace>()).toEqual({
      areas: [],
      tables: [],
    });
  });

  it('creates areas and refuses a duplicate name', async () => {
    await call(owner, 'POST', '/venue/areas', { name: 'Sala' });
    space = (await call(owner, 'POST', '/venue/areas', { name: 'Terasa' })).json<VenueSpace>();
    expect(space.areas.map((a) => a.name)).toEqual(['Sala', 'Terasa']);
    const dup = await call(owner, 'POST', '/venue/areas', { name: 'Terasa' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: 'label_taken' } });
  });

  it('creates a table with an unguessable QR link', async () => {
    const sala = space.areas[0]!.id;
    space = (
      await call(owner, 'POST', '/venue/tables', { label: 'S1', seats: 4, areaId: sala })
    ).json<VenueSpace>();
    const table = space.tables[0]!;
    expect(table).toMatchObject({
      label: 'S1',
      seats: 4,
      areaId: sala,
      qrVersion: 1,
      isActive: true,
    });
    // 24 random bytes = 32 base64url characters (192 bits, NFR-10).
    expect(table.qrUrl).toMatch(/^https:\/\/kafa-a\.qafe\.test\/t\/[A-Za-z0-9_-]{32}$/);
  });

  it('creates tables in bulk, skipping labels that exist, in natural order', async () => {
    space = (
      await call(owner, 'POST', '/venue/tables/bulk', {
        prefix: 'S',
        from: 1,
        to: 10,
        seats: 2,
        areaId: space.areas[0]!.id,
      })
    ).json<VenueSpace>();
    expect(space.tables.map((x) => x.label)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
    ]);
    expect(space.tables[0]!.seats).toBe(4);
    expect(
      (await call(owner, 'POST', '/venue/tables/bulk', { prefix: 'T', from: 5, to: 1 })).statusCode,
    ).toBe(400);
    expect(
      (await call(owner, 'POST', '/venue/tables/bulk', { prefix: 'T', from: 1, to: 500 }))
        .statusCode,
    ).toBe(400);
  });

  it('edits a table and refuses a label that is taken', async () => {
    const s2 = space.tables[1]!;
    const terasa = space.areas[1]!.id;
    space = (
      await call(owner, 'PATCH', `/venue/tables/${s2.id}`, {
        label: 'T1',
        areaId: terasa,
        seats: null,
      })
    ).json<VenueSpace>();
    expect(space.tables.find((x) => x.id === s2.id)).toMatchObject({
      label: 'T1',
      areaId: terasa,
      seats: null,
    });
    const taken = await call(owner, 'PATCH', `/venue/tables/${s2.id}`, { label: 'S1' });
    expect(taken.statusCode).toBe(409);
  });

  it('rotating the QR code makes the old code stop working (FR-SEF-16)', async () => {
    const table = space.tables.find((x) => x.label === 'S1')!;
    const oldToken = table.qrUrl.split('/t/')[1]!;
    space = (await call(owner, 'POST', `/venue/tables/${table.id}/qr`)).json<VenueSpace>();
    const rotated = space.tables.find((x) => x.id === table.id)!;
    const newToken = rotated.qrUrl.split('/t/')[1]!;
    expect(rotated.qrVersion).toBe(2);
    expect(newToken).not.toBe(oldToken);

    const resolve = (token: string) =>
      t.admin.query('SELECT * FROM core.resolve_table($1)', [token]);
    expect((await resolve(oldToken)).rowCount).toBe(0);
    expect((await resolve(newToken)).rows[0]).toMatchObject({
      table_label: 'S1',
      venue_slug: 'kafa-a',
      qr_version: 2,
    });

    const { rows } = await t.admin.query<{ payload: { actor: { label: string } } }>(
      `SELECT payload FROM core.outbox WHERE event_type = 'table.qr_rotated'`,
    );
    expect(rows[0]!.payload.actor.label).toBe('Sef A (@sef)');
  });

  it('keeps tables when their area is deleted', async () => {
    const terasa = space.areas[1]!;
    space = (await call(owner, 'DELETE', `/venue/areas/${terasa.id}`)).json<VenueSpace>();
    expect(space.areas.map((a) => a.name)).toEqual(['Sala']);
    expect(space.tables.find((x) => x.label === 'T1')!.areaId).toBeNull();
  });

  it('deletes a table', async () => {
    const t1 = space.tables.find((x) => x.label === 'T1')!;
    space = (await call(owner, 'DELETE', `/venue/tables/${t1.id}`)).json<VenueSpace>();
    expect(space.tables.some((x) => x.label === 'T1')).toBe(false);
  });

  it('keeps each venue to its own tables (RLS)', async () => {
    expect((await call(ownerB, 'GET', '/venue/tables')).json<VenueSpace>().tables).toEqual([]);
    const table = space.tables[0]!;
    expect(
      (await call(ownerB, 'PATCH', `/venue/tables/${table.id}`, { label: 'X' })).statusCode,
    ).toBe(404);
    expect((await call(ownerB, 'POST', `/venue/tables/${table.id}/qr`)).statusCode).toBe(404);
    expect(
      (await call(ownerB, 'POST', '/venue/tables', { label: 'Z', areaId: space.areas[0]!.id }))
        .statusCode,
    ).toBe(404);
  });
});

describe('staff accounts', () => {
  let staff: VenueStaff;
  const member = (username: string) => staff.members.find((m) => m.username === username)!;

  it('is for the owner only', async () => {
    expect((await call(waiter, 'GET', '/venue/staff')).statusCode).toBe(403);
    staff = (await call(owner, 'GET', '/venue/staff')).json<VenueStaff>();
    expect(staff.members.map((m) => [m.username, m.role])).toEqual([
      ['sef', 'Šef'],
      ['konobar', 'Konobar'],
    ]);
    expect(staff.roles.map((r) => r.name)).toEqual(['Šef', 'Konobar']);
    expect(staff.roles[1]!.permissions).toContain('orders.view');
  });

  it('creates a waiter who can sign in with the given password', async () => {
    const roleId = staff.roles.find((r) => r.name === 'Konobar')!.id;
    staff = (
      await call(owner, 'POST', '/venue/staff', {
        fullName: 'Ana Anić',
        username: 'ana',
        roleId,
        password: 'AnaLozinka1',
      })
    ).json<VenueStaff>();
    expect(member('ana')).toMatchObject({ role: 'Konobar', isActive: true, hasPin: false });
    expect((await login('kafa-a', 'ana', 'AnaLozinka1')).statusCode).toBe(200);
  });

  it('creates a PIN-only account that cannot use a password', async () => {
    const roleId = staff.roles.find((r) => r.name === 'Konobar')!.id;
    staff = (
      await call(owner, 'POST', '/venue/staff', {
        fullName: 'Bojan Bojić',
        username: 'bojan',
        roleId,
        pin: '1234',
      })
    ).json<VenueStaff>();
    expect(member('bojan').hasPin).toBe(true);
    expect((await login('kafa-a', 'bojan', '1234')).statusCode).toBe(401);
  });

  it('validates input and refuses a username that is taken', async () => {
    const roleId = staff.roles[1]!.id;
    expect(
      (await call(owner, 'POST', '/venue/staff', { fullName: 'X Y', username: 'xy', roleId }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call(owner, 'POST', '/venue/staff', {
          fullName: 'X Y',
          username: 'xy',
          roleId,
          pin: '12',
        })
      ).statusCode,
    ).toBe(400);
    const taken = await call(owner, 'POST', '/venue/staff', {
      fullName: 'Sef 2',
      username: 'SEF',
      roleId,
      password: 'Lozinka-123',
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: 'username_taken' } });
  });

  it('deactivating a member signs them out and blocks sign-in', async () => {
    const session = await login('kafa-a', 'ana', 'AnaLozinka1');
    const cookie = session.cookies.find((c) => c.name === 'qafe_srt')!.value;
    staff = (
      await call(owner, 'PATCH', `/venue/staff/${member('ana').memberId}`, { isActive: false })
    ).json<VenueStaff>();
    expect(member('ana').isActive).toBe(false);
    const refresh = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: cookie },
    });
    expect(refresh.statusCode).toBe(401);
    expect((await login('kafa-a', 'ana', 'AnaLozinka1')).statusCode).toBe(403);
    staff = (
      await call(owner, 'PATCH', `/venue/staff/${member('ana').memberId}`, { isActive: true })
    ).json<VenueStaff>();
  });

  it('does not let the owner change their own role or status', async () => {
    const me = member('sef');
    const waiterRole = staff.roles.find((r) => r.name === 'Konobar')!.id;
    for (const body of [{ isActive: false }, { roleId: waiterRole }]) {
      const res = await call(owner, 'PATCH', `/venue/staff/${me.memberId}`, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'cannot_modify_self' } });
    }
    // Their own name is fine.
    staff = (
      await call(owner, 'PATCH', `/venue/staff/${me.memberId}`, { fullName: 'Sef Ahmić' })
    ).json<VenueStaff>();
    expect(member('sef').fullName).toBe('Sef Ahmić');
  });

  it('only an owner hands out the owner role', async () => {
    // A custom role (V2) may manage staff without being an owner.
    await t.admin.query(
      `INSERT INTO core.role_permissions (role_id, permission_code)
       SELECT id, 'staff.manage' FROM core.venue_roles WHERE name = 'Konobar'
         AND venue_id = (SELECT id FROM core.venues WHERE slug = 'kafa-a')`,
    );
    const manager = await tokenOf('kafa-a', 'konobar', 'Konobar-Lozinka-1');
    const ownerRole = staff.roles.find((r) => r.isOwner)!.id;
    const promote = await call(manager, 'PATCH', `/venue/staff/${member('ana').memberId}`, {
      roleId: ownerRole,
    });
    expect(promote.statusCode).toBe(403);
    const resetOwner = await call(
      manager,
      'POST',
      `/venue/staff/${member('sef').memberId}/password`,
      { password: 'Preuzeto-123' },
    );
    expect(resetOwner.statusCode).toBe(403);

    staff = (
      await call(owner, 'PATCH', `/venue/staff/${member('ana').memberId}`, { roleId: ownerRole })
    ).json<VenueStaff>();
    expect(member('ana')).toMatchObject({ role: 'Šef', isOwner: true });
  });

  it('resets a password: the old one stops working, the member is signed out', async () => {
    const session = await login('kafa-a', 'ana', 'AnaLozinka1');
    const cookie = session.cookies.find((c) => c.name === 'qafe_srt')!.value;
    staff = (
      await call(owner, 'POST', `/venue/staff/${member('ana').memberId}/password`, {
        password: 'NovaLozinka9',
      })
    ).json<VenueStaff>();
    expect((await login('kafa-a', 'ana', 'AnaLozinka1')).statusCode).toBe(401);
    expect((await login('kafa-a', 'ana', 'NovaLozinka9')).statusCode).toBe(200);
    const refresh = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: cookie },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('sets and removes a PIN', async () => {
    const id = member('konobar').memberId;
    staff = (
      await call(owner, 'PUT', `/venue/staff/${id}/pin`, { pin: '4321' })
    ).json<VenueStaff>();
    expect(member('konobar').hasPin).toBe(true);
    staff = (await call(owner, 'DELETE', `/venue/staff/${id}/pin`)).json<VenueStaff>();
    expect(member('konobar').hasPin).toBe(false);
  });

  it('records every change for the audit log', async () => {
    const { rows } = await t.admin.query<{ event_type: string }>(
      `SELECT DISTINCT event_type FROM core.outbox WHERE event_type LIKE 'staff.%' ORDER BY 1`,
    );
    expect(rows.map((r) => r.event_type)).toEqual([
      'staff.created',
      'staff.password_reset',
      'staff.pin_changed',
      'staff.updated',
    ]);
  });

  it('keeps each venue to its own staff (RLS)', async () => {
    expect(
      (await call(ownerB, 'GET', '/venue/staff')).json<VenueStaff>().members.map((m) => m.username),
    ).toEqual(['sef']);
    const res = await call(ownerB, 'PATCH', `/venue/staff/${member('ana').memberId}`, {
      isActive: false,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PIN sign-in on a shared device (FR-KON-01)', () => {
  let device: StaffDevice;
  let cookie: string;
  let waiterId: string;
  const withDevice = (method: Method, url: string, payload?: object, value = cookie) =>
    t.app.inject({
      method,
      url,
      payload,
      headers: { cookie: `qafe_sdev=${value}` },
      remoteAddress: '10.9.9.9',
    });

  it('only the owner links a device; the device gets its token as an httpOnly cookie', async () => {
    expect(
      (await call(waiter, 'POST', '/auth/staff/devices', { name: 'Tablet šank' })).statusCode,
    ).toBe(403);
    const res = await call(owner, 'POST', '/auth/staff/devices', { name: 'Tablet šank' });
    expect(res.statusCode).toBe(201);
    device = res.json<StaffDevice>();
    const set = res.cookies.find((c) => c.name === 'qafe_sdev');
    expect(set).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
    cookie = set!.value;
    expect(cookie.length).toBeGreaterThanOrEqual(40);
  });

  it('lists the members who have a PIN, only on a linked device', async () => {
    const staff = (await call(owner, 'GET', '/venue/staff')).json<VenueStaff>();
    waiterId = staff.members.find((m) => m.username === 'konobar')!.memberId;
    await call(owner, 'PUT', `/venue/staff/${waiterId}/pin`, { pin: '4821' });

    const noDevice = await t.app.inject({ method: 'GET', url: '/auth/staff/device' });
    expect(noDevice.statusCode).toBe(401);
    expect(noDevice.json()).toMatchObject({ error: { code: 'device_not_linked' } });

    const roster = (await withDevice('GET', '/auth/staff/device')).json<StaffDeviceRoster>();
    expect(roster.device.name).toBe('Tablet šank');
    expect(roster.venue.slug).toBe('kafa-a');
    const ids = roster.members.map((m) => m.memberId);
    expect(ids).toContain(waiterId);
    // Members without a PIN (the owner here) are not offered.
    const ownerId = staff.members.find((m) => m.username === 'sef')!.memberId;
    expect(ids).not.toContain(ownerId);
  });

  it('signs a member in with the right PIN and refuses a wrong one', async () => {
    const wrong = await withDevice('POST', '/auth/staff/pin-login', {
      memberId: waiterId,
      pin: '0000',
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ error: { code: 'invalid_credentials' } });

    const ok = await withDevice('POST', '/auth/staff/pin-login', {
      memberId: waiterId,
      pin: '4821',
    });
    expect(ok.statusCode).toBe(200);
    const session = ok.json<StaffSession>();
    const me = (await call(session.accessToken, 'GET', '/auth/staff/me')).json<StaffMe>();
    expect(me).toMatchObject({ memberId: waiterId, username: 'konobar' });
    expect(ok.cookies.some((c) => c.name === 'qafe_srt')).toBe(true);

    // Without the device cookie the PIN alone is worth nothing.
    const bare = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/pin-login',
      payload: { memberId: waiterId, pin: '4821' },
    });
    expect(bare.json()).toMatchObject({ error: { code: 'device_not_linked' } });
  });

  it('limits PIN guesses per device and member', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        (await withDevice('POST', '/auth/staff/pin-login', { memberId: waiterId, pin: '1111' }))
          .statusCode,
      );
    }
    expect(results.at(-1)).toBe(429);
  });

  it('keeps devices per venue, and a revoked device stops working', async () => {
    expect((await call(ownerB, 'GET', '/venue/staff-devices')).json<StaffDevice[]>()).toEqual([]);
    expect((await call(ownerB, 'DELETE', `/venue/staff-devices/${device.id}`)).statusCode).toBe(
      404,
    );

    const list = (await call(owner, 'GET', '/venue/staff-devices')).json<StaffDevice[]>();
    expect(list.map((d) => d.name)).toEqual(['Tablet šank']);
    expect(list[0]!.lastUsedAt).not.toBeNull();
    expect((await call(owner, 'DELETE', `/venue/staff-devices/${device.id}`)).statusCode).toBe(204);
    expect((await withDevice('GET', '/auth/staff/device')).statusCode).toBe(401);
  });
});
