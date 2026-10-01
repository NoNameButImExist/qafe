import { OrderingEvent, type PushPayload } from '@qafe/contracts';
import type { TenantDatabase } from '@qafe/db';
import type { OutboxEvent } from './outbox-relay.js';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends one notification; rejects with `statusCode` 404/410 when the subscription is gone. */
export type PushSend = (target: PushTarget, payload: string) => Promise<unknown>;

/**
 * Which ordering events wake the waiter's phone (FR-KON-05): a guest's new order, a waiter
 * call, a bill request and a device waiting for approval. Staff's own actions do not.
 */
export function toPushPayload(
  event: OutboxEvent,
): { venueId: string; payload: PushPayload } | null {
  if (event.source !== 'ordering') return null;
  const parsed = OrderingEvent.safeParse(event.payload);
  if (!parsed.success || parsed.data.actorKind !== 'guest') return null;
  const e = parsed.data;
  const base = { tableLabel: e.tableLabel, url: `/table/${e.tableId}` };
  switch (e.type) {
    case 'order.created':
    case 'order.resubmitted':
      return {
        venueId: e.venueId,
        payload: {
          type: 'order.created',
          ...base,
          ...(e.orderNumber !== undefined ? { orderNumber: e.orderNumber } : {}),
        },
      };
    case 'service.requested':
      return { venueId: e.venueId, payload: { type: 'call_waiter', ...base } };
    case 'session.bill_requested':
      return { venueId: e.venueId, payload: { type: 'request_bill', ...base } };
    case 'guest.joined':
      return e.details?.status === 'pending_approval'
        ? { venueId: e.venueId, payload: { type: 'guest.waiting', ...base } }
        : null;
    default:
      return null;
  }
}

/**
 * Sends Web Push to every staff device of the venue. Failures never fail the outbox batch:
 * a missed notification is not worth redelivering every event. Gone subscriptions are deleted.
 */
export class PushNotifier {
  constructor(
    private readonly db: TenantDatabase,
    private readonly send: PushSend,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  readonly handle = async (events: OutboxEvent[]): Promise<void> => {
    const pushes = events.map(toPushPayload).filter((p) => p !== null);
    for (const { venueId, payload } of pushes) {
      try {
        await this.notifyVenue(venueId, payload);
      } catch (error) {
        this.onError(error);
      }
    }
  };

  private async notifyVenue(venueId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await this.db.withTenant({ venueId, isSuperAdmin: false }, (trx) =>
      trx
        .selectFrom('ordering.push_subscriptions')
        .select(['id', 'endpoint', 'p256dh', 'auth'])
        .where('member_id', 'is not', null)
        .execute(),
    );
    const body = JSON.stringify(payload);
    const gone: string[] = [];
    await Promise.all(
      subscriptions.map(async (s) => {
        try {
          await this.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          else this.onError(error);
        }
      }),
    );
    if (gone.length) {
      await this.db.withTenant({ venueId, isSuperAdmin: false }, (trx) =>
        trx.deleteFrom('ordering.push_subscriptions').where('id', 'in', gone).execute(),
      );
    }
  }
}
