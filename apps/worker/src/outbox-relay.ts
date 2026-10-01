import type { TenantDatabase } from '@qafe/db';
import { sql } from 'kysely';

/** One row of <schema>.outbox. */
export interface OutboxEvent {
  source: string;
  id: string;
  venueId: string | null;
  type: string;
  aggregateId: string;
  payload: unknown;
  createdAt: Date;
}

export type EventHandler = (events: OutboxEvent[]) => Promise<void>;

export interface OutboxSource {
  /** Schema that owns the outbox table, e.g. "core". */
  schema: string;
  /** Connection as that module's role (only it may read its outbox). */
  db: TenantDatabase;
}

interface Row {
  id: string;
  venue_id: string | null;
  event_type: string;
  aggregate_id: string;
  payload: unknown;
  created_at: Date;
}

/**
 * Transactional-outbox relay. Takes unpublished events in id order, hands them to the handler
 * and marks them published in the same transaction. A handler error rolls the batch back, so
 * the events are retried on the next tick: delivery is at-least-once and handlers must be
 * idempotent. FOR UPDATE SKIP LOCKED lets several workers run side by side.
 */
export class OutboxRelay {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly sources: OutboxSource[],
    private readonly handler: EventHandler,
    private readonly options: {
      batchSize: number;
      intervalMs: number;
      onError?: (error: unknown) => void;
    } = {
      batchSize: 100,
      intervalMs: 1000,
    },
  ) {}

  /** Relays one batch per source; returns how many events were published. */
  async tick(): Promise<number> {
    let published = 0;
    for (const source of this.sources) {
      published += await source.db.withTenant(
        { venueId: null, isSuperAdmin: false },
        async (trx) => {
          const table = sql.table(`${source.schema}.outbox`);
          const { rows } = await sql<Row>`
          select id, venue_id, event_type, aggregate_id, payload, created_at
            from ${table}
           where published_at is null
           order by id
           limit ${this.options.batchSize}
             for update skip locked
        `.execute(trx);
          if (rows.length === 0) return 0;

          await this.handler(
            rows.map((r) => ({
              source: source.schema,
              id: String(r.id),
              venueId: r.venue_id,
              type: r.event_type,
              aggregateId: r.aggregate_id,
              payload: r.payload,
              createdAt: r.created_at,
            })),
          );
          await sql`update ${table} set published_at = now() where id = any(${rows.map((r) => r.id)}::bigint[])`.execute(
            trx,
          );
          return rows.length;
        },
      );
    }
    return published;
  }

  /** Relays until every outbox is empty. */
  async drain(): Promise<number> {
    let total = 0;
    for (let n = await this.tick(); n > 0; n = await this.tick()) total += n;
    return total;
  }

  start(): void {
    const loop = () => {
      if (this.stopped) return;
      this.running = this.drain()
        .catch((error: unknown) => this.options.onError?.(error))
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(loop, this.options.intervalMs);
        });
    };
    loop();
  }

  /** Stops polling and waits for the batch in progress. */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
