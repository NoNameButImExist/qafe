// End-to-end over HTTP against a real Postgres (Testcontainers): admin login, refresh-token
// rotation and reuse detection, admin venue management, public venue lookup.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hashPassword } from '@qafe/auth';
import type {
  AdminUserList,
  AuditFacets,
  AuditList,
  AuthSession,
  CreateVenueRequest,
  PlatformModule,
  VenueDetail,
  VenueList,
  VenueModuleState,
} from '@qafe/contracts';
import { startTestDatabase, type TestDatabase } from '@qafe/db/testing';
import type { StartedRedisContainer } from '@testcontainers/redis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './bootstrap.js';
import { startTestRedis, testConfig } from './test-support/test-app.js';

const ADMIN = { email: 'admin@qafe.ba', password: 'Admin123!' };
const SUPPORT = { email: 'support@qafe.ba', password: 'Support123!' };

let testDb: TestDatabase;
let admin: pg.Client;
let app: NestFastifyApplication;
let redis: StartedRedisContainer;

type Res = Awaited<ReturnType<NestFastifyApplication['inject']>>;

function refreshCookie(res: Res): string {
  const cookie = res.cookies.find((c) => c.name === 'qafe_rt');
  if (!cookie?.value) throw new Error('no refresh cookie');
  return cookie.value;
}

const login = (body: { email: string; password: string }, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: '/auth/admin/login', payload: body, remoteAddress: ip });

const refresh = (token: string) =>
  app.inject({ method: 'POST', url: '/auth/refresh', cookies: { qafe_rt: token } });

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const count = async (sql: string) => Number((await admin.query<{ n: string }>(sql)).rows[0]?.n);

beforeAll(async () => {
  testDb = await startTestDatabase();
  admin = new pg.Client({ connectionString: testDb.adminUrl });
  await admin.connect();
  for (const [user, role] of [
    [ADMIN, 'super_admin'],
    [SUPPORT, 'support'],
  ] as const) {
    await admin.query(
      `INSERT INTO core.users (email, password_hash, full_name, platform_role, must_change_password)
       VALUES ($1, $2, 'Test', $3, false)`,
      [user.email, await hashPassword(user.password), role],
    );
  }

  redis = await startTestRedis();
  const config = await testConfig(testDb, redis);
  app = await createApp(config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
  await testDb?.stop();
  await redis?.stop();
});

describe('admin login', () => {
  it('rejects a wrong password and an unknown email the same way', async () => {
    for (const body of [
      { email: ADMIN.email, password: 'wrong' },
      { email: 'nobody@qafe.ba', password: 'wrong' },
    ]) {
      const res = await login(body, '10.0.1.1');
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'invalid_credentials' } });
    }
  });

  it('rejects invalid input with validation_failed', async () => {
    const res = await login({ email: 'not-an-email', password: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('logs in, sets a strict httpOnly refresh cookie and returns the user', async () => {
    const res = await login(ADMIN);
    expect(res.statusCode).toBe(200);
    const body = res.json<AuthSession>();
    expect(body.user).toMatchObject({ email: ADMIN.email, role: 'super_admin', kind: 'platform' });
    expect(body.expiresIn).toBe(900);
    const cookie = res.cookies.find((c) => c.name === 'qafe_rt');
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/auth',
    });
    expect(JSON.stringify(body)).not.toContain(cookie!.value);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: bearer(body.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: ADMIN.email });
  });

  it('refuses /auth/me without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('locks an account+IP after 5 failed attempts', async () => {
    const ip = '10.0.2.2';
    for (let i = 0; i < 5; i++) {
      expect((await login({ email: ADMIN.email, password: 'wrong' }, ip)).statusCode).toBe(401);
    }
    const blocked = await login(ADMIN, ip);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: 'too_many_attempts' } });
    // Other IPs are not affected.
    expect((await login(ADMIN, '10.0.2.3')).statusCode).toBe(200);
  });
});

describe('refresh token rotation', () => {
  it('rotates the token and refuses the old one', async () => {
    const first = refreshCookie(await login(ADMIN));
    const rotated = await refresh(first);
    expect(rotated.statusCode).toBe(200);
    const second = refreshCookie(rotated);
    expect(second).not.toBe(first);

    // Reused within the grace period (e.g. two tabs): refused, other sessions untouched.
    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(200);
  });

  it('revokes every session when an old token comes back later (theft)', async () => {
    const stolen = refreshCookie(await login(ADMIN));
    const current = refreshCookie(await refresh(stolen));
    const other = refreshCookie(await login(ADMIN));
    // Pretend the rotation happened a minute ago.
    await admin.query(
      `UPDATE core.auth_sessions SET revoked_at = now() - interval '1 minute'
       WHERE revoked_at IS NOT NULL AND revoked_at > now() - interval '10 seconds'`,
    );

    expect((await refresh(stolen)).statusCode).toBe(401);
    expect((await refresh(current)).statusCode).toBe(401);
    expect((await refresh(other)).statusCode).toBe(401);
  });

  it('logout ends the session', async () => {
    const token = refreshCookie(await login(ADMIN));
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { qafe_rt: token },
    });
    expect(res.statusCode).toBe(204);
    expect((await refresh(token)).statusCode).toBe(401);
  });
});

describe('admin venues', () => {
  let token: string;
  const venue: CreateVenueRequest = {
    name: 'Kafić Fildžan',
    slug: 'fildzan',
    city: 'Sarajevo',
    taxId: '4200000000001',
    owner: { fullName: 'Selma Begić', username: 'selma', temporaryPassword: 'Privremena123' },
  };

  beforeAll(async () => {
    token = (await login(ADMIN, '10.0.3.1')).json<AuthSession>().accessToken;
  });

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: bearer(token) });

  it('creates a venue with default roles and an owner who must change the password', async () => {
    const res = await call('POST', '/admin/venues', venue);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      venue: { slug: 'fildzan', status: 'pending', staffCount: 1, tableCount: 0 },
      owner: { username: 'selma' },
    });

    const { rows } = await admin.query<{ role: string; must_change_password: boolean }>(
      `SELECT r.name AS role, u.must_change_password
         FROM core.venue_members m
         JOIN core.venue_roles r ON r.id = m.role_id
         JOIN core.users u ON u.id = m.user_id
         JOIN core.venues v ON v.id = m.venue_id
        WHERE v.slug = 'fildzan'`,
    );
    expect(rows).toEqual([{ role: 'Šef', must_change_password: true }]);

    const events = await admin.query(
      `SELECT event_type FROM core.outbox WHERE event_type = 'venue.created'`,
    );
    expect(events.rowCount).toBe(1);
  });

  it('refuses a duplicate slug', async () => {
    const res = await call('POST', '/admin/venues', venue);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'slug_taken' } });
  });

  it('validates the slug format', async () => {
    const res = await call('POST', '/admin/venues', { ...venue, slug: 'Loš Slug' });
    expect(res.statusCode).toBe(400);
  });

  it('lists, searches and filters venues', async () => {
    const all = (await call('GET', '/admin/venues')).json<VenueList>();
    expect(all.total).toBe(1);
    expect((await call('GET', '/admin/venues?search=fild')).json<VenueList>().total).toBe(1);
    expect((await call('GET', '/admin/venues?search=nema')).json<VenueList>().total).toBe(0);
    expect((await call('GET', '/admin/venues?status=active')).json<VenueList>().total).toBe(0);
    expect((await call('GET', '/admin/venues?city=sarajevo')).json<VenueList>().total).toBe(1);
    expect((await call('GET', '/admin/venues/cities')).json()).toEqual(['Sarajevo']);
  });

  it('hides a pending venue from guests until it is activated', async () => {
    expect((await app.inject({ method: 'GET', url: '/venues/fildzan/public' })).statusCode).toBe(
      404,
    );

    const id = (await call('GET', '/admin/venues')).json<VenueList>().items[0]!.id;
    const res = await call('PATCH', `/admin/venues/${id}/status`, { status: 'active' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'active' });

    const pub = await app.inject({ method: 'GET', url: '/venues/fildzan/public' });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ slug: 'fildzan', name: 'Kafić Fildžan', currency: 'BAM' });
  });

  it('reports stats', async () => {
    const res = await call('GET', '/admin/stats');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      venues: { total: 1, active: 1, pending: 0 },
      venueStaff: 1,
      recentVenues: [{ slug: 'fildzan' }],
    });
  });

  it('is closed to non-admins', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/stats' })).statusCode).toBe(401);
    const support = (await login(SUPPORT, '10.0.3.2')).json<AuthSession>().accessToken;
    const res = await app.inject({ method: 'GET', url: '/admin/stats', headers: bearer(support) });
    expect(res.statusCode).toBe(403);
  });
});

describe('venue detail, update and modules', () => {
  let token: string;
  let venueId: string;
  const call = (method: 'GET' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: bearer(token) });

  beforeAll(async () => {
    token = (await login(ADMIN, '10.0.4.1')).json<AuthSession>().accessToken;
    venueId = (await call('GET', '/admin/venues?search=fildzan')).json<VenueList>().items[0]!.id;
  });

  it('returns the full venue with modules and staff', async () => {
    const res = await call('GET', `/admin/venues/${venueId}`);
    expect(res.statusCode).toBe(200);
    const detail = res.json<VenueDetail>();
    expect(detail).toMatchObject({ slug: 'fildzan', taxId: '4200000000001', currency: 'BAM' });
    expect(detail.staff).toEqual([
      expect.objectContaining({ username: 'selma', role: 'Šef', isOwner: true }),
    ]);
    expect(detail.modules.map((m) => m.code).sort()).toEqual([
      'kds',
      'online_payments',
      'translations',
    ]);
    expect(detail.modules.every((m) => !m.enabled)).toBe(true);
  });

  it('updates only changed fields, clears empty ones and emits one event', async () => {
    const before = await count(
      `SELECT count(*) AS n FROM core.outbox WHERE event_type = 'venue.updated'`,
    );
    const res = await call('PATCH', `/admin/venues/${venueId}`, {
      city: 'Mostar',
      taxId: '',
      name: 'Kafić Fildžan',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<VenueDetail>()).toMatchObject({
      city: 'Mostar',
      taxId: null,
      name: 'Kafić Fildžan',
    });

    const { rows } = await admin.query<{ payload: { before: object; after: object } }>(
      `SELECT payload FROM core.outbox WHERE event_type = 'venue.updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows[0]!.payload.before).toEqual({ city: 'Sarajevo', tax_id: '4200000000001' });
    expect(rows[0]!.payload.after).toEqual({ city: 'Mostar', tax_id: null });

    // Same values again: nothing to record.
    await call('PATCH', `/admin/venues/${venueId}`, { city: 'Mostar' });
    expect(
      await count(`SELECT count(*) AS n FROM core.outbox WHERE event_type = 'venue.updated'`),
    ).toBe(before + 1);
  });

  it('refuses to change the slug', async () => {
    await call('PATCH', `/admin/venues/${venueId}`, { slug: 'drugi' });
    expect((await call('GET', `/admin/venues/${venueId}`)).json<VenueDetail>().slug).toBe(
      'fildzan',
    );
  });

  it('enables and disables a module', async () => {
    const on = await call('PUT', `/admin/venues/${venueId}/modules/kds`);
    expect(on.statusCode).toBe(200);
    expect(on.json<VenueModuleState[]>().find((m) => m.code === 'kds')?.enabled).toBe(true);
    // Enabling twice is a no-op, not an error.
    expect((await call('PUT', `/admin/venues/${venueId}/modules/kds`)).statusCode).toBe(200);

    const catalog = (await call('GET', '/admin/modules')).json<PlatformModule[]>();
    expect(catalog.find((m) => m.code === 'kds')?.venues.map((v) => v.slug)).toEqual(['fildzan']);

    const off = await call('DELETE', `/admin/venues/${venueId}/modules/kds`);
    expect(off.json<VenueModuleState[]>().find((m) => m.code === 'kds')?.enabled).toBe(false);
    expect(
      await count(`SELECT count(*) AS n FROM core.outbox WHERE event_type LIKE 'venue.module_%'`),
    ).toBe(2);
    expect((await call('PUT', `/admin/venues/${venueId}/modules/nope`)).statusCode).toBe(404);
  });

  it('returns 404 for an unknown venue', async () => {
    expect(
      (await call('GET', '/admin/venues/00000000-0000-4000-8000-000000000000')).statusCode,
    ).toBe(404);
  });
});

describe('admin users', () => {
  let token: string;
  let adminId: string;
  const call = (method: 'GET' | 'PATCH' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: bearer(token) });
  const selma = async () =>
    (await call('GET', '/admin/users?search=selma')).json<AdminUserList>().items[0]!;

  beforeAll(async () => {
    const session = (await login(ADMIN, '10.0.5.1')).json<AuthSession>();
    token = session.accessToken;
    adminId = session.user.id;
  });

  it('lists platform users and venue staff with their venues', async () => {
    const all = (await call('GET', '/admin/users')).json<AdminUserList>();
    expect(all.total).toBe(3);
    const staff = (await call('GET', '/admin/users?kind=staff')).json<AdminUserList>();
    expect(staff.items).toEqual([
      expect.objectContaining({
        fullName: 'Selma Begić',
        kind: 'staff',
        email: null,
        memberships: [
          expect.objectContaining({ venueSlug: 'fildzan', username: 'selma', role: 'Šef' }),
        ],
      }),
    ]);
    expect((await call('GET', '/admin/users?kind=platform')).json<AdminUserList>().total).toBe(2);
  });

  it('blocks a user, which ends their sessions, and unblocks again', async () => {
    const support = refreshCookie(await login(SUPPORT, '10.0.5.2'));
    const supportId = (await call('GET', '/admin/users?search=support')).json<AdminUserList>()
      .items[0]!.id;

    expect(
      (await call('PATCH', `/admin/users/${supportId}/status`, { active: false })).statusCode,
    ).toBe(204);
    expect((await refresh(support)).statusCode).toBe(401);
    expect((await login(SUPPORT, '10.0.5.3')).statusCode).toBe(403);
    expect((await call('GET', '/admin/users?status=blocked')).json<AdminUserList>().total).toBe(1);

    await call('PATCH', `/admin/users/${supportId}/status`, { active: true });
    expect((await login(SUPPORT, '10.0.5.4')).statusCode).toBe(200);
  });

  it('resets a password and forces a change at the next sign-in', async () => {
    const user = await selma();
    const res = await call('POST', `/admin/users/${user.id}/password`, {
      temporaryPassword: 'NovaLozinka123',
    });
    expect(res.statusCode).toBe(204);
    expect((await selma()).mustChangePassword).toBe(true);
    expect(
      (await call('POST', `/admin/users/${user.id}/password`, { temporaryPassword: 'short' }))
        .statusCode,
    ).toBe(400);
  });

  it('does not let an admin block or reset themselves', async () => {
    const res = await call('PATCH', `/admin/users/${adminId}/status`, { active: false });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'cannot_modify_self' } });
  });
});

describe('audit log', () => {
  let token: string;
  const call = (url: string) => app.inject({ method: 'GET', url, headers: bearer(token) });

  beforeAll(async () => {
    token = (await login(ADMIN, '10.0.6.1')).json<AuthSession>().accessToken;
    // The worker writes these from the outbox; here they are inserted directly.
    await admin.query(`
      INSERT INTO audit.audit_logs (event_id, venue_id, venue_label, actor_id, actor_label, service, action,
                                    entity_type, entity_id, old_values, new_values, created_at)
      VALUES ('t:1', '00000000-0000-4000-8000-00000000000a', 'Venue A', '00000000-0000-4000-8000-0000000000aa',
              'Ana (ana@qafe.ba)', 'core', 'venue.status_changed', 'venue', '00000000-0000-4000-8000-00000000000a',
              '{"status":"pending"}', '{"status":"active"}', '2026-09-01T10:00:00Z'),
             ('t:2', NULL, NULL, '00000000-0000-4000-8000-0000000000bb', 'Bo (bo@qafe.ba)', 'core', 'user.logged_in',
              'user', '00000000-0000-4000-8000-0000000000bb', NULL, NULL, '2026-09-02T10:00:00Z')
    `);
    // The worker also keeps the filter values next to the log.
    await admin.query(`
      INSERT INTO audit.actions (action) VALUES ('user.logged_in'), ('venue.status_changed');
      INSERT INTO audit.actor_labels (actor_id, label, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000000aa', 'Ana (ana@qafe.ba)', '2026-09-01T10:00:00Z'),
             ('00000000-0000-4000-8000-0000000000bb', 'Bo (bo@qafe.ba)', '2026-09-02T10:00:00Z');
      INSERT INTO audit.venue_labels (venue_id, label, updated_at)
      VALUES ('00000000-0000-4000-8000-00000000000a', 'Venue A', '2026-09-01T10:00:00Z');
    `);
  });

  it('lists entries newest first and filters them', async () => {
    const all = (await call('/admin/audit')).json<AuditList>();
    expect(all.items.map((e) => e.action)).toEqual(['user.logged_in', 'venue.status_changed']);
    expect(all.items[1]).toMatchObject({
      venueLabel: 'Venue A',
      actorLabel: 'Ana (ana@qafe.ba)',
      after: { status: 'active' },
    });

    expect(all.nextCursor).toBeNull();
    const count = async (url: string) => (await call(url)).json<AuditList>().items.length;
    expect(await count('/admin/audit?action=user.logged_in')).toBe(1);
    expect(await count('/admin/audit?venueId=00000000-0000-4000-8000-00000000000a')).toBe(1);
    expect(await count('/admin/audit?actorId=00000000-0000-4000-8000-0000000000bb')).toBe(1);
    expect(await count('/admin/audit?from=2026-09-02&to=2026-09-02')).toBe(1);
    expect((await call('/admin/audit?from=bad')).statusCode).toBe(400);
    expect((await call('/admin/audit?cursor=bad')).statusCode).toBe(400);
  });

  it('pages through older entries with a cursor, never counting the log', async () => {
    const first = (await call('/admin/audit?limit=1')).json<AuditList>();
    expect(first.items.map((e) => e.action)).toEqual(['user.logged_in']);
    expect(typeof first.nextCursor).toBe('string');
    const second = (
      await call(`/admin/audit?limit=1&cursor=${first.nextCursor}`)
    ).json<AuditList>();
    expect(second.items.map((e) => e.action)).toEqual(['venue.status_changed']);
    expect(second.nextCursor).toBeNull();
  });

  it('offers the values present in the log as filters', async () => {
    const facets = (await call('/admin/audit/facets')).json<AuditFacets>();
    expect(facets.actions).toEqual(['user.logged_in', 'venue.status_changed']);
    expect(facets.actors.map((a) => a.label)).toEqual(['Ana (ana@qafe.ba)', 'Bo (bo@qafe.ba)']);
    expect(facets.venues).toEqual([
      { id: '00000000-0000-4000-8000-00000000000a', label: 'Venue A' },
    ]);
  });
});

describe('health', () => {
  it('is ready when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
  });
});
