import type { OrderingEvent } from '@qafe/contracts';
import type { Tx } from '@qafe/db';

/** Writes an event to ordering.outbox in the caller's transaction (transactional outbox). */
export async function publish(trx: Tx, event: OrderingEvent): Promise<void> {
  await trx
    .insertInto('ordering.outbox')
    .values({
      venue_id: event.venueId,
      event_type: event.type,
      aggregate_id: event.entityId,
      payload: JSON.stringify(event),
    })
    .execute();
}

/** Guests are anonymous: the actor is the device, labelled with its nickname and table. */
export const guestActor = (guestId: string, nickname: string, tableLabel: string) => ({
  actor: { id: guestId, label: `${nickname} (sto ${tableLabel})` },
  actorKind: 'guest' as const,
});

export const staffActor = (memberId: string, label: string) => ({
  actor: { id: memberId, label },
  actorKind: 'staff' as const,
});
