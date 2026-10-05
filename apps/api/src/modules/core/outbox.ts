import type { Actor, CoreEvent } from '@qafe/contracts';
import type { Tx } from '@qafe/db';

/** Queries shared by the core services. Platform admins act across venues. */
export const SUPER_ADMIN = { venueId: null, isSuperAdmin: true } as const;

/** Escapes LIKE wildcards in user input. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** "Full Name (email)" snapshot of a user, for events and the audit log. */
export async function actorOf(trx: Tx, userId: string): Promise<Actor> {
  const user = await trx
    .selectFrom('core.users')
    .select(['full_name', 'email'])
    .where('id', '=', userId)
    .executeTakeFirst();
  return { id: userId, label: user ? userLabel(user.full_name, user.email) : userId };
}

export function userLabel(fullName: string, email: string | null): string {
  return email ? `${fullName} (${email})` : fullName;
}

/**
 * Writes an event to core.outbox in the caller's transaction (transactional outbox):
 * the event exists if and only if the change was committed.
 */
export async function publish(trx: Tx, event: CoreEvent): Promise<void> {
  const venueId = 'venueId' in event ? (event.venueId ?? null) : null;
  // Platform settings belong to no venue or entity: the admin who changed them stands in.
  const aggregateId =
    'entityId' in event
      ? event.entityId
      : 'userId' in event
        ? event.userId
        : 'venueId' in event
          ? event.venueId
          : event.actor.id;
  await trx
    .insertInto('core.outbox')
    .values({
      venue_id: venueId,
      event_type: event.type,
      aggregate_id: aggregateId,
      payload: JSON.stringify(event),
    })
    .execute();
}
