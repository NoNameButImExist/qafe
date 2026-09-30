import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { DbConnectionOptions } from '../index.js';
import { readUpMigrations } from '../migrations.js';

export const SERVICE_MODULES = [
  'core',
  'catalog',
  'ordering',
  'billing',
  'audit',
  'reporting',
] as const;
export type ServiceModule = (typeof SERVICE_MODULES)[number];

const SERVICE_PASSWORD = 'test';

export interface TestDatabase {
  /** Superuser connection string (migrations, fixtures). */
  adminUrl: string;
  /** Connection options for a module role, e.g. connection('core') logs in as svc_core. */
  connection(module: ServiceModule): DbConnectionOptions;
  stop(): Promise<void>;
}

/**
 * Starts Postgres 16 in Docker, creates the svc_* roles (as infra/postgres/init does)
 * and applies all migrations. For integration tests only.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('qafe')
    .withUsername('qafe_admin')
    .withPassword('admin')
    .start();

  const adminUrl = container.getConnectionUri();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const module of SERVICE_MODULES) {
      await admin.query(`CREATE ROLE svc_${module} LOGIN PASSWORD '${SERVICE_PASSWORD}'`);
    }
    for (const up of await readUpMigrations()) {
      await admin.query(up);
    }
  } finally {
    await admin.end();
  }

  return {
    adminUrl,
    connection: (module) => ({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: `svc_${module}`,
      password: SERVICE_PASSWORD,
      max: 4,
    }),
    stop: async () => {
      await container.stop();
    },
  };
}
