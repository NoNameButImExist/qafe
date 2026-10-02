// Sign-in security against real Postgres and Redis: two-factor sign-in for admins (FR-ADM-01),
// temporary passwords (FR-SEF-01) and the login throttle in Redis (OWASP ASVS L1).
import { hashPassword, totpCode } from '@qafe/auth';
import type {
  AuthSession,
  Me,
  MfaSetup,
  MfaStatus,
  StaffSession,
  VenueStaff,
} from '@qafe/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVenue, startTestApp, type TestApp } from './test-support/test-app.js';

let t: TestApp;
let ip = 0;
const nextIp = () => `10.9.${Math.floor(ip / 200)}.${ip++ % 200}`;

type Res = Awaited<ReturnType<TestApp['app']['inject']>>;
const code = (res: Res) => res.json<{ error: { code: string } }>().error.code;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const cookie = (res: Res, name: string) => res.cookies.find((c) => c.name === name)!.value;

const ADMIN = { email: 'mfa-admin@qafe.ba', password: 'Admin-Lozinka-1' };

const adminLogin = (totp?: string, remoteAddress = nextIp()) =>
  t.app.inject({
    method: 'POST',
    url: '/auth/admin/login',
    payload: { ...ADMIN, ...(totp ? { totp } : {}) },
    remoteAddress,
  });

const staffLogin = (username: string, password: string) =>
  t.app.inject({
    method: 'POST',
    url: '/auth/staff/login',
    payload: { venueSlug: 'sigurnost', username, password },
    remoteAddress: nextIp(),
  });

/** The code of the step after the current one: valid now, and not used yet. */
const freshCode = (secret: string, offset = 1) =>
  totpCode(secret, Math.floor(Date.now() / 30_000) + offset);

beforeAll(async () => {
  t = await startTestApp();
  await t.admin.query(
    `INSERT INTO core.users (email, password_hash, full_name, platform_role, must_change_password)
     VALUES ($1, $2, 'MFA Admin', 'super_admin', false)`,
    [ADMIN.email, await hashPassword(ADMIN.password)],
  );
  await createVenue(t.admin, 'sigurnost', [
    { username: 'sef', role: 'Šef', password: 'Sef-Lozinka-1', fullName: 'Šef' },
  ]);
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('two-factor sign-in for admins (FR-ADM-01)', () => {
  let secret: string;

  it('is off until the admin turns it on with a correct code', async () => {
    const token = (await adminLogin()).json<AuthSession>().accessToken;
    const status = await t.app.inject({ method: 'GET', url: '/auth/mfa', headers: bearer(token) });
    expect(status.json<MfaStatus>()).toEqual({ enabled: false, available: true });

    const setup = await t.app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: bearer(token),
    });
    expect(setup.statusCode).toBe(200);
    ({ secret } = setup.json<MfaSetup>());
    expect(setup.json<MfaSetup>().otpauthUrl).toContain(
      'otpauth://totp/qafe.ba%3Amfa-admin%40qafe.ba',
    );

    const wrong = await t.app.inject({
      method: 'POST',
      url: '/auth/mfa/enable',
      headers: bearer(token),
      payload: { code: '000000' === freshCode(secret, 0) ? '111111' : '000000' },
    });
    expect(code(wrong)).toBe('invalid_code');
    const ok = await t.app.inject({
      method: 'POST',
      url: '/auth/mfa/enable',
      headers: bearer(token),
      payload: { code: freshCode(secret, 0) },
    });
    expect(ok.statusCode).toBe(204);

    const stored = await t.admin.query<{ mfa_enabled: boolean; mfa_secret_enc: string }>(
      `SELECT mfa_enabled, mfa_secret_enc FROM core.users WHERE email = $1`,
      [ADMIN.email],
    );
    expect(stored.rows[0]!.mfa_enabled).toBe(true);
    expect(stored.rows[0]!.mfa_secret_enc).toMatch(/^v1\./);
    expect(stored.rows[0]!.mfa_secret_enc).not.toContain(secret);
  });

  it('then asks for the code, accepts it once and refuses a replay', async () => {
    const noCode = await adminLogin();
    expect(noCode.statusCode).toBe(401);
    expect(code(noCode)).toBe('mfa_required');

    const totp = freshCode(secret);
    const ok = await adminLogin(totp);
    expect(ok.statusCode).toBe(200);
    expect(ok.json<AuthSession>().user.mfaEnabled).toBe(true);

    const replay = await adminLogin(totp);
    expect(code(replay)).toBe('invalid_code');
  });

  it('turns off only with a current code', async () => {
    const token = (await adminLogin(freshCode(secret, -1))).json<AuthSession>().accessToken;
    const disable = (payloadCode: string) =>
      t.app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: bearer(token),
        payload: { code: payloadCode },
      });
    expect(code(await disable('123456' === freshCode(secret, 0) ? '654321' : '123456'))).toBe(
      'invalid_code',
    );
    // Every code of the current window was used above (enable, sign-ins); each works only
    // once, so forget the used ones to have a fresh code without waiting 30 seconds.
    await t.redis.exec(['redis-cli', '--scan', '--pattern', 'qafe:core:totp-used:*']).then((r) =>
      Promise.all(
        r.output
          .split('\n')
          .filter(Boolean)
          .map((key) => t.redis.exec(['redis-cli', 'DEL', key])),
      ),
    );
    expect((await disable(freshCode(secret, 0))).statusCode).toBe(204);
    expect((await adminLogin()).statusCode).toBe(200);
  });
});

describe('temporary passwords (FR-SEF-01)', () => {
  let owner: string;

  beforeAll(async () => {
    owner = (await staffLogin('sef', 'Sef-Lozinka-1')).json<StaffSession>().accessToken;
  });

  const createStaff = async (username: string, requirePasswordChange?: boolean) => {
    const staff = await t.app.inject({
      method: 'GET',
      url: '/venue/staff',
      headers: bearer(owner),
    });
    const waiterRole = staff.json<VenueStaff>().roles.find((r) => !r.isOwner)!.id;
    const res = await t.app.inject({
      method: 'POST',
      url: '/venue/staff',
      headers: bearer(owner),
      payload: {
        fullName: `Konobar ${username}`,
        username,
        roleId: waiterRole,
        password: 'Privremena-1',
        ...(requirePasswordChange === undefined ? {} : { requirePasswordChange }),
      },
    });
    expect(res.statusCode).toBe(201);
  };

  it('allow only changing the password, then everything works', async () => {
    await createStaff('novi');
    const login = await staffLogin('novi', 'Privremena-1');
    expect(login.json<StaffSession>().user.mustChangePassword).toBe(true);
    const token = login.json<StaffSession>().accessToken;

    const blocked = await t.app.inject({
      method: 'GET',
      url: '/staff/floor',
      headers: bearer(token),
    });
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('password_change_required');
    expect(
      (await t.app.inject({ method: 'GET', url: '/auth/staff/me', headers: bearer(token) }))
        .statusCode,
    ).toBe(200);

    const change = (currentPassword: string, newPassword: string) =>
      t.app.inject({
        method: 'POST',
        url: '/auth/password',
        headers: bearer(token),
        payload: { currentPassword, newPassword },
        remoteAddress: nextIp(),
      });
    expect(code(await change('Pogresna-1', 'Nova-Lozinka-1'))).toBe('invalid_credentials');
    expect((await change('Privremena-1', 'Privremena-1')).statusCode).toBe(400);
    expect((await change('Privremena-1', 'Nova-Lozinka-1')).statusCode).toBe(204);

    // A refreshed token no longer carries the flag.
    const refreshed = await t.app.inject({
      method: 'POST',
      url: '/auth/staff/refresh',
      cookies: { qafe_srt: cookie(login, 'qafe_srt') },
    });
    expect(refreshed.json<StaffSession>().user.mustChangePassword).toBe(false);
    const fresh = refreshed.json<StaffSession>().accessToken;
    expect(
      (await t.app.inject({ method: 'GET', url: '/staff/floor', headers: bearer(fresh) }))
        .statusCode,
    ).toBe(200);
    expect(
      (await staffLogin('novi', 'Nova-Lozinka-1')).json<StaffSession>().user.mustChangePassword,
    ).toBe(false);
  });

  it('can be skipped when the owner turns the option off', async () => {
    await createStaff('bezpromjene', false);
    const login = await staffLogin('bezpromjene', 'Privremena-1');
    expect(login.json<StaffSession>().user.mustChangePassword).toBe(false);
  });

  it('are set by an admin reset unless turned off', async () => {
    const adminToken = (await adminLogin()).json<AuthSession>().accessToken;
    const { rows } = await t.admin.query<{ id: string }>(
      `SELECT u.id FROM core.users u JOIN core.venue_members m ON m.user_id = u.id WHERE m.username = 'bezpromjene'`,
    );
    const reset = (requirePasswordChange?: boolean) =>
      t.app.inject({
        method: 'POST',
        url: `/admin/users/${rows[0]!.id}/password`,
        headers: bearer(adminToken),
        payload: {
          temporaryPassword: 'Reset-Lozinka-1',
          ...(requirePasswordChange === undefined ? {} : { requirePasswordChange }),
        },
      });
    expect((await reset(false)).statusCode).toBe(204);
    expect(
      (await staffLogin('bezpromjene', 'Reset-Lozinka-1')).json<StaffSession>().user
        .mustChangePassword,
    ).toBe(false);
    expect((await reset()).statusCode).toBe(204);
    expect(
      (await staffLogin('bezpromjene', 'Reset-Lozinka-1')).json<StaffSession>().user
        .mustChangePassword,
    ).toBe(true);
  });

  it('apply to admins too', async () => {
    await t.admin.query(`UPDATE core.users SET must_change_password = true WHERE email = $1`, [
      ADMIN.email,
    ]);
    const token = (await adminLogin()).json<AuthSession>().accessToken;
    const me = await t.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    expect(me.json<Me>().mustChangePassword).toBe(true);
    expect(
      code(await t.app.inject({ method: 'GET', url: '/admin/venues', headers: bearer(token) })),
    ).toBe('password_change_required');
    await t.admin.query(`UPDATE core.users SET must_change_password = false WHERE email = $1`, [
      ADMIN.email,
    ]);
  });
});

describe('login throttle in Redis', () => {
  it('blocks after five failures per account and IP, for every api instance', async () => {
    const from = '10.99.0.1';
    const attempt = () =>
      t.app.inject({
        method: 'POST',
        url: '/auth/admin/login',
        payload: { email: ADMIN.email, password: 'pogresna' },
        remoteAddress: from,
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(code(blocked)).toBe('too_many_attempts');
    // Another address is not affected.
    expect((await adminLogin()).statusCode).toBe(200);
  });
});
