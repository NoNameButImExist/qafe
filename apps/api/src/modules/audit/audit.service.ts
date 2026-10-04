import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuditFacets, AuditList, AuditParams } from '@qafe/contracts';
import { ErrorCode } from '@qafe/contracts';
import { sql } from 'kysely';
import { AuditDatabase } from './audit.database.js';

// audit.audit_logs has no RLS; platform-level reads.
const PLATFORM = { venueId: null, isSuperAdmin: true } as const;

/** Position in the log: the last entry of a page (time, id), base64url-encoded. */
interface Cursor {
  at: string;
  id: string;
}

const encodeCursor = (c: Cursor) => Buffer.from(`${c.at}|${c.id}`).toString('base64url');

function decodeCursor(value: string): Cursor {
  const [at, id] = Buffer.from(value, 'base64url').toString().split('|');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^\d+$/.test(id)) {
    throw new BadRequestException({ code: ErrorCode.validationFailed, message: 'Bad cursor' });
  }
  return { at, id };
}

@Injectable()
export class AuditService {
  constructor(private readonly db: AuditDatabase) {}

  /**
   * FR-ADM-10: newest first, filtered by venue, actor, action and day range. Keyset paging on
   * (created_at, id): every page is an index range on the monthly partitions, however large
   * the log grows.
   */
  list(query: AuditParams): Promise<AuditList> {
    return this.db.withTenant(PLATFORM, async (trx) => {
      let q = trx
        .selectFrom('audit.audit_logs as a')
        // Menu events carry no venue name: use the latest name known for that venue.
        .leftJoin('audit.venue_labels as v', 'v.venue_id', 'a.venue_id')
        .selectAll('a')
        .select('v.label as known_venue_label');
      if (query.venueId) q = q.where('a.venue_id', '=', query.venueId);
      if (query.actorId) q = q.where('a.actor_id', '=', query.actorId);
      if (query.action) q = q.where('a.action', '=', query.action);
      if (query.from) q = q.where('a.created_at', '>=', new Date(`${query.from}T00:00:00`));
      if (query.to)
        q = q.where('a.created_at', '<', sql<Date>`${query.to}::date + interval '1 day'`);
      if (query.cursor) {
        const c = decodeCursor(query.cursor);
        q = q.where(
          sql<boolean>`(a.created_at, a.id) < (${new Date(c.at)}::timestamptz, ${c.id}::bigint)`,
        );
      }
      // One more than asked: tells whether an older page exists.
      const rows = await q
        .orderBy('a.created_at', 'desc')
        .orderBy('a.id', 'desc')
        .limit(query.limit + 1)
        .execute();

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => ({
          id: String(r.id),
          createdAt: r.created_at.toISOString(),
          service: r.service,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          venueId: r.venue_id,
          venueLabel: r.venue_label ?? r.known_venue_label,
          actorId: r.actor_id,
          actorLabel: r.actor_label,
          ip: r.ip_address,
          before: r.old_values,
          after: r.new_values,
        })),
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor({ at: last.created_at.toISOString(), id: String(last.id) })
            : null,
      };
    });
  }

  /** Filter values, from the small lookup tables the worker keeps (never the log itself). */
  facets(): Promise<AuditFacets> {
    return this.db.withTenant(PLATFORM, async (trx) => {
      const [actions, actors, venues] = await Promise.all([
        trx.selectFrom('audit.actions').select('action').orderBy('action').execute(),
        trx
          .selectFrom('audit.actor_labels')
          .select(['actor_id', 'label'])
          .orderBy('label')
          .execute(),
        trx
          .selectFrom('audit.venue_labels')
          .select(['venue_id', 'label'])
          .orderBy('label')
          .execute(),
      ]);
      return {
        actions: actions.map((a) => a.action),
        actors: actors.map((a) => ({ id: a.actor_id, label: a.label })),
        venues: venues.map((v) => ({ id: v.venue_id, label: v.label })),
      };
    });
  }
}
