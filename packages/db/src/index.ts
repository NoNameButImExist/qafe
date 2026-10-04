import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './generated/db.js';

export type * from './generated/db.js';

export interface DbConnectionOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** Pool size per process. */
  max?: number;
  applicationName?: string;
}

/** RLS context for one transaction (see app.current_venue_id() and app.is_super_admin()). */
export interface TenantContext {
  /** The venue whose rows are visible. null = platform-level work (no venue rows visible). */
  venueId: string | null;
  /**
   * Platform-level work (admin screens, worker jobs) across venues: the transaction runs as
   * the module's platform role (`svc_<module>_platform`, BYPASSRLS, same privileges).
   */
  isSuperAdmin: boolean;
}

export type Tx = Transaction<DB>;

/**
 * The only way application code reaches the database. Every query runs inside a transaction
 * that first sets the RLS context, so a query without tenant context cannot happen.
 */
export class TenantDatabase {
  readonly #db: Kysely<DB>;
  /** The role platform contexts switch to; null for logins that are not module roles. */
  readonly #platformRole: string | null;

  constructor(options: DbConnectionOptions) {
    const pool = new pg.Pool({
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.user,
      password: options.password,
      max: options.max ?? 10,
      application_name: options.applicationName,
    });
    this.#db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
    this.#platformRole = /^svc_[a-z]+$/.test(options.user) ? `${options.user}_platform` : null;
  }

  /**
   * Runs `fn` in a transaction with the RLS context set (`set_config(..., is_local => true)`).
   * Venue contexts see only that venue (the policies are `venue_id = app.current_venue_id()`,
   * served by indexes); platform contexts switch to the platform role for this transaction only.
   */
  withTenant<T>(ctx: TenantContext, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.#db.transaction().execute(async (trx) => {
      await sql`
        select set_config('app.venue_id', ${ctx.venueId ?? ''}, true),
               set_config('app.is_super_admin', ${ctx.isSuperAdmin ? 'true' : 'false'}, true)
      `.execute(trx);
      if (ctx.isSuperAdmin && this.#platformRole) {
        await sql`set local role ${sql.id(this.#platformRole)}`.execute(trx);
      }
      return fn(trx);
    });
  }

  /** Readiness probe: true when the database answers. */
  async ping(): Promise<boolean> {
    try {
      await sql`select 1`.execute(this.#db);
      return true;
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    return this.#db.destroy();
  }
}
