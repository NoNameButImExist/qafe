// Route protection: every route is closed unless it must be public (OWASP ASVS L1, V4).
// The list below is the whole public surface; a new public route has to be added here on
// purpose, and any route someone forgets to guard fails this test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registeredRoutes } from './bootstrap.js';
import { startTestApp, type TestApp } from './test-support/test-app.js';

const PUBLIC = new Set([
  'GET /health/live',
  'GET /health/ready',
  'POST /auth/admin/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/staff/login',
  'POST /auth/staff/refresh',
  'POST /auth/staff/logout',
  'GET /.well-known/jwks.json',
  'GET /venues/:slug/public',
  // Guests have no account: GuestGuard takes the venue from the host and the device cookie.
  'GET /guest/venue',
  'GET /guest/menu',
  'POST /guest/tables/:token/join',
  'GET /guest/session',
  'DELETE /guest/session',
  'POST /guest/session/verify',
  'PUT /guest/session/nickname',
  'POST /guest/session/guests/:id/approve',
  'POST /guest/session/guests/:id/decline',
  'POST /guest/session/host',
  'POST /guest/orders',
  'PUT /guest/orders/:id',
  'POST /guest/orders/:id/withdraw',
  'POST /guest/orders/:id/dispute',
  'POST /guest/requests',
]);

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('route protection', () => {
  it('opens only the listed routes; every other route needs a valid token', async () => {
    const routes = registeredRoutes(t.app).filter(
      (r) => !['HEAD', 'OPTIONS'].includes(r.method) && !r.url.startsWith('/socket.io'),
    );
    expect(routes.length).toBeGreaterThan(60);

    const open: string[] = [];
    for (const route of routes) {
      const key = `${route.method} ${route.url}`;
      if (PUBLIC.has(key)) continue;
      const url = route.url.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
      for (const authorization of [undefined, 'Bearer not-a-token']) {
        const res = await t.app.inject({
          method: route.method as 'GET',
          url,
          headers: authorization ? { authorization } : {},
          payload: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
        });
        if (res.statusCode !== 401) open.push(`${key} -> ${res.statusCode}`);
      }
    }
    expect(open).toEqual([]);
  });

  it('lists only routes that still exist', () => {
    const existing = new Set(registeredRoutes(t.app).map((r) => `${r.method} ${r.url}`));
    expect([...PUBLIC].filter((key) => !existing.has(key))).toEqual([]);
  });
});
