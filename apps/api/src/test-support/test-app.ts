import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hashPassword } from '@qafe/auth';
import { startTestDatabase, type TestDatabase } from '@qafe/db/testing';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import pg from 'pg';
import { createApp } from '../bootstrap.js';
import { MemoryStorage, STORAGE } from '../common/storage/storage.js';
import type { AppConfig } from '../config/config.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDatabase;
  /** Superuser connection for fixtures and assertions. */
  admin: pg.Client;
  storage: MemoryStorage;
  close(): Promise<void>;
}

/** The whole API against a fresh Postgres (Testcontainers), with in-memory file storage. */
export async function startTestApp(): Promise<TestApp> {
  const db = await startTestDatabase();
  const admin = new pg.Client({ connectionString: db.adminUrl });
  await admin.connect();

  const keys = await generateKeyPair('EdDSA', { extractable: true });
  const core = db.connection('core');
  const config: AppConfig = {
    env: 'test',
    port: 0,
    db: {
      host: core.host,
      port: core.port,
      database: core.database,
      corePassword: core.password,
      auditPassword: db.connection('audit').password,
      catalogPassword: db.connection('catalog').password,
    },
    storage: { driver: 'memory' },
    auth: {
      privateKeyPem: await exportPKCS8(keys.privateKey),
      publicKeyPem: await exportSPKI(keys.publicKey),
      issuer: 'https://api.test',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 30,
      cookiePath: '/auth',
      cookieSecure: true,
      adminMfaRequired: false,
    },
    corsOrigins: [],
  };
  const app = await createApp(config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    db,
    admin,
    storage: app.get<MemoryStorage>(STORAGE),
    close: async () => {
      await app.close();
      await admin.end();
      await db.stop();
    },
  };
}

/** A venue with init_venue() roles and one member per given role name. */
export async function createVenue(
  admin: pg.Client,
  slug: string,
  members: { username: string; role: 'Šef' | 'Konobar'; password: string; fullName?: string }[],
  status: 'pending' | 'active' | 'suspended' | 'closed' = 'active',
): Promise<string> {
  const venue = await admin.query<{ id: string }>(
    `INSERT INTO core.venues (slug, name, status) VALUES ($1, $2, $3) RETURNING id`,
    [slug, `Venue ${slug}`, status],
  );
  const venueId = venue.rows[0]!.id;
  await admin.query('SELECT core.init_venue($1)', [venueId]);
  for (const m of members) {
    const user = await admin.query<{ id: string }>(
      `INSERT INTO core.users (password_hash, full_name) VALUES ($1, $2) RETURNING id`,
      [await hashPassword(m.password), m.fullName ?? m.username],
    );
    await admin.query(
      `INSERT INTO core.venue_members (venue_id, user_id, role_id, username)
       SELECT $1, $2, id, $3 FROM core.venue_roles WHERE venue_id = $1 AND name = $4`,
      [venueId, user.rows[0]!.id, m.username, m.role],
    );
  }
  return venueId;
}
