import { describe, expect, it } from 'vitest';
import type { OutboxEvent } from './outbox-relay.js';
import { toPushPayload } from './push-notifier.js';

const VENUE = '22222222-2222-4222-8222-222222222222';
const TABLE = '66666666-6666-4666-8666-666666666666';

const event = (type: string, actorKind: 'guest' | 'staff', extra: object = {}): OutboxEvent => ({
  source: 'ordering',
  id: '1',
  venueId: VENUE,
  type,
  aggregateId: TABLE,
  createdAt: new Date(),
  payload: {
    type,
    venueId: VENUE,
    sessionId: '55555555-5555-4555-8555-555555555555',
    tableId: TABLE,
    tableLabel: 'T4',
    entityId: '77777777-7777-4777-8777-777777777777',
    actor: { id: '11111111-1111-4111-8111-111111111111', label: 'Gost 1 (sto T4)' },
    actorKind,
    ...extra,
  },
});

describe('toPushPayload', () => {
  it('wakes staff for guest orders, calls, bill requests and waiting devices', () => {
    expect(toPushPayload(event('order.created', 'guest', { orderNumber: 7 }))).toEqual({
      venueId: VENUE,
      payload: { type: 'order.created', tableLabel: 'T4', orderNumber: 7, url: `/table/${TABLE}` },
    });
    expect(toPushPayload(event('service.requested', 'guest'))?.payload.type).toBe('call_waiter');
    expect(toPushPayload(event('session.bill_requested', 'guest'))?.payload.type).toBe(
      'request_bill',
    );
    expect(
      toPushPayload(event('guest.joined', 'guest', { details: { status: 'pending_approval' } }))
        ?.payload.type,
    ).toBe('guest.waiting');
  });

  it('stays quiet for staff actions, approved joins and other modules', () => {
    expect(toPushPayload(event('order.created', 'staff'))).toBeNull();
    expect(
      toPushPayload(event('guest.joined', 'guest', { details: { status: 'approved' } })),
    ).toBeNull();
    expect(toPushPayload({ ...event('order.created', 'guest'), source: 'core' })).toBeNull();
  });
});
