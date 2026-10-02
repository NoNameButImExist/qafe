import { BillingEvent, CatalogEvent, CoreEvent, OrderingEvent } from '@qafe/contracts';
import type { AuditAuditLogs, TenantDatabase } from '@qafe/db';
import type { Insertable } from 'kysely';
import type { OutboxEvent } from './outbox-relay.js';

type AuditRow = Insertable<AuditAuditLogs>;

const json = (value: unknown) =>
  value === undefined || value === null ? null : JSON.stringify(value);

/**
 * Which events go to the audit log. Guests place thousands of orders a day; those belong to
 * reporting. The log keeps what staff did with sessions and orders, and "Nije naše" reports.
 */
export function isAudited(event: OutboxEvent): boolean {
  if (event.source !== 'ordering') return true;
  // Item-level sales data for reports; the payment itself is audited from billing.
  if (event.type === 'session.settled') return false;
  const parsed = OrderingEvent.safeParse(event.payload);
  if (!parsed.success) return true;
  return parsed.data.actorKind === 'staff' || parsed.data.type === 'order.disputed';
}

/** Maps an outbox event to an audit log entry (FR-ADM-10). */
export function toAuditRow(event: OutboxEvent): AuditRow {
  const base: AuditRow = {
    event_id: `${event.source}:${event.id}`,
    service: event.source,
    action: event.type,
    entity_type: event.type.split('.')[0] ?? 'unknown',
    entity_id: event.aggregateId,
    venue_id: event.venueId,
    created_at: event.createdAt,
  };

  if (event.source === 'ordering') {
    const ordering = OrderingEvent.safeParse(event.payload);
    if (ordering.success) {
      const e = ordering.data;
      return {
        ...base,
        actor_id: e.actor.id,
        actor_label: e.actor.label,
        entity_type: e.type.split('.')[0] ?? 'ordering',
        entity_id: e.entityId,
        new_values: json({
          table: e.tableLabel,
          ...(e.orderNumber !== undefined ? { number: e.orderNumber } : {}),
          ...(e.total !== undefined ? { total: e.total } : {}),
          ...e.details,
        }),
      };
    }
  }

  if (event.source === 'billing') {
    const billing = BillingEvent.safeParse(event.payload);
    if (billing.success) {
      const e = billing.data;
      return {
        ...base,
        actor_id: e.actor.id,
        actor_label: e.actor.label,
        entity_type: 'payment',
        entity_id: e.entityId,
        new_values: json({ table: e.tableLabel, amount: e.amount, method: e.method }),
      };
    }
  }

  if (event.source === 'catalog') {
    const catalog = CatalogEvent.safeParse(event.payload);
    if (catalog.success) {
      const e = catalog.data;
      return {
        ...base,
        actor_id: e.actor.id,
        actor_label: e.actor.label,
        entity_type: e.type.split('.')[0] ?? 'catalog',
        entity_id: e.entityId,
        old_values: json(e.before),
        // The name is kept with the change, so the entry reads well after the item is gone.
        new_values: json({ ...e.after, name: e.entityName }),
      };
    }
  }

  const parsed = CoreEvent.safeParse(event.payload);
  if (!parsed.success) {
    // Unknown or older payload shape: keep it whole rather than lose the entry.
    return { ...base, new_values: json(event.payload) };
  }
  const e = parsed.data;
  const actor = { actor_id: e.actor.id, actor_label: e.actor.label };

  switch (e.type) {
    case 'venue.created':
      return {
        ...base,
        ...actor,
        entity_type: 'venue',
        venue_label: e.venueName,
        new_values: json({ name: e.venueName, slug: e.slug }),
      };
    case 'venue.updated':
      return {
        ...base,
        ...actor,
        entity_type: 'venue',
        venue_label: e.venueName,
        old_values: json(e.before),
        new_values: json(e.after),
      };
    case 'venue.status_changed':
      return {
        ...base,
        ...actor,
        entity_type: 'venue',
        venue_label: e.venueName,
        old_values: json({ status: e.from }),
        new_values: json({ status: e.to }),
      };
    case 'venue.module_enabled':
    case 'venue.module_disabled':
      return {
        ...base,
        ...actor,
        entity_type: 'venue',
        venue_label: e.venueName,
        [e.type === 'venue.module_enabled' ? 'new_values' : 'old_values']: json({
          module: e.module,
        }),
      };
    case 'user.logged_in':
      return {
        ...base,
        ...actor,
        entity_type: 'user',
        entity_id: e.userId,
        ip_address: e.ip,
        venue_id: e.venueId ?? null,
        venue_label: e.venueName ?? null,
      };
    case 'user.blocked':
    case 'user.unblocked':
    case 'user.password_reset':
    case 'user.password_changed':
    case 'user.mfa_enabled':
    case 'user.mfa_disabled':
      return {
        ...base,
        ...actor,
        entity_type: 'user',
        entity_id: e.userId,
        new_values: json({ user: e.userLabel }),
      };
    case 'area.created':
    case 'area.updated':
    case 'area.deleted':
    case 'table.created':
    case 'table.updated':
    case 'table.deleted':
    case 'table.qr_rotated':
      return {
        ...base,
        ...actor,
        entity_type: e.type.split('.')[0] ?? 'table',
        entity_id: e.entityId,
        venue_label: e.venueName,
        old_values: json(e.before),
        new_values: json({ ...e.after, name: e.entityName }),
      };
    case 'staff.created':
    case 'staff.updated':
    case 'staff.password_reset':
    case 'staff.pin_changed':
      return {
        ...base,
        ...actor,
        entity_type: 'staff',
        entity_id: e.userId,
        venue_label: e.venueName,
        old_values: json(e.before),
        new_values: json({ ...e.after, user: e.memberLabel }),
      };
  }
}

/** Appends events to audit.audit_logs; a redelivered event is skipped (unique event_id). */
export class AuditWriter {
  constructor(private readonly db: TenantDatabase) {}

  readonly handle = async (events: OutboxEvent[]): Promise<void> => {
    const audited = events.filter(isAudited);
    if (audited.length === 0) return;
    await this.db.withTenant({ venueId: null, isSuperAdmin: false }, (trx) =>
      trx
        .insertInto('audit.audit_logs')
        .values(audited.map(toAuditRow))
        .onConflict((oc) => oc.column('event_id').doNothing())
        .execute(),
    );
  };
}
