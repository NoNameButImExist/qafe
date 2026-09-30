import { Injectable } from '@nestjs/common';
import type { AuditFacets, AuditList, AuditParams } from '@qafe/contracts';
import { sql } from 'kysely';
import { AuditDatabase } from './audit.database.js';

// audit.audit_logs has no RLS; platform-level reads.
const PLATFORM = { venueId: null, isSuperAdmin: true } as const;

@Injectable()
export class AuditService {
  constructor(private readonly db: AuditDatabase) {}

  /** FR-ADM-10: newest first, filtered by venue, actor, action and day range. */
  list(query: AuditParams): Promise<AuditList> {
    return this.db.withTenant(PLATFORM, async (trx) => {
      let base = trx.selectFrom('audit.audit_logs as a');
      if (query.venueId) base = base.where('a.venue_id', '=', query.venueId);
      if (query.actorId) base = base.where('a.actor_id', '=', query.actorId);
      if (query.action) base = base.where('a.action', '=', query.action);
      if (query.from) base = base.where('a.created_at', '>=', new Date(`${query.from}T00:00:00`));
      if (query.to)
        base = base.where('a.created_at', '<', sql<Date>`${query.to}::date + interval '1 day'`);

      const { total } = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow();
      const rows = await base
        .selectAll('a')
        // Menu events carry no venue name: use the latest name known for that venue.
        .select((eb) =>
          eb
            .selectFrom('audit.audit_logs as l')
            .select('l.venue_label')
            .whereRef('l.venue_id', '=', 'a.venue_id')
            .where('l.venue_label', 'is not', null)
            .orderBy('l.id', 'desc')
            .limit(1)
            .as('known_venue_label'),
        )
        .orderBy('a.created_at', 'desc')
        .orderBy('a.id', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute();

      return {
        items: rows.map((r) => ({
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
        total: Number(total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** The values that occur in the log, for the filter dropdowns. */
  facets(): Promise<AuditFacets> {
    return this.db.withTenant(PLATFORM, async (trx) => {
      const actions = await trx
        .selectFrom('audit.audit_logs')
        .select('action')
        .distinct()
        .orderBy('action')
        .execute();
      // The latest label per actor / venue (names can change over time).
      const actors = await trx
        .selectFrom('audit.audit_logs')
        .select(['actor_id', 'actor_label'])
        .distinctOn('actor_id')
        .where('actor_id', 'is not', null)
        .where('actor_label', 'is not', null)
        .orderBy('actor_id')
        .orderBy('created_at', 'desc')
        .execute();
      const venues = await trx
        .selectFrom('audit.audit_logs')
        .select(['venue_id', 'venue_label'])
        .distinctOn('venue_id')
        .where('venue_id', 'is not', null)
        .where('venue_label', 'is not', null)
        .orderBy('venue_id')
        .orderBy('created_at', 'desc')
        .execute();
      const byLabel = (a: { label: string }, b: { label: string }) =>
        a.label.localeCompare(b.label);
      return {
        actions: actions.map((a) => a.action),
        actors: actors
          .map((a) => ({ id: a.actor_id!, label: a.actor_label ?? a.actor_id! }))
          .sort(byLabel),
        venues: venues
          .map((v) => ({ id: v.venue_id!, label: v.venue_label ?? v.venue_id! }))
          .sort(byLabel),
      };
    });
  }
}
