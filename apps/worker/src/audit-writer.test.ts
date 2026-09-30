import { describe, expect, it } from 'vitest';
import { toAuditRow } from './audit-writer.js';
import type { OutboxEvent } from './outbox-relay.js';

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', label: 'Qafe Admin (admin@qafe.ba)' };
const VENUE = '22222222-2222-4222-8222-222222222222';
const at = new Date('2026-09-30T10:00:00Z');

const event = (type: string, payload: object, venueId: string | null = VENUE): OutboxEvent => ({
  source: 'core',
  id: '42',
  venueId,
  type,
  aggregateId: venueId ?? ADMIN.id,
  payload: { type, ...payload },
  createdAt: at,
});

describe('toAuditRow', () => {
  it('keeps the event id, time, actor and venue name', () => {
    const row = toAuditRow(
      event('venue.status_changed', {
        venueId: VENUE,
        venueName: 'Fildžan',
        from: 'pending',
        to: 'active',
        actor: ADMIN,
      }),
    );
    expect(row).toMatchObject({
      event_id: 'core:42',
      service: 'core',
      action: 'venue.status_changed',
      entity_type: 'venue',
      entity_id: VENUE,
      venue_id: VENUE,
      venue_label: 'Fildžan',
      actor_id: ADMIN.id,
      actor_label: ADMIN.label,
      old_values: JSON.stringify({ status: 'pending' }),
      new_values: JSON.stringify({ status: 'active' }),
      created_at: at,
    });
  });

  it('records the changed fields of a venue update', () => {
    const row = toAuditRow(
      event('venue.updated', {
        venueId: VENUE,
        venueName: 'Fildžan',
        before: { city: 'Sarajevo' },
        after: { city: 'Mostar' },
        actor: ADMIN,
      }),
    );
    expect(row.old_values).toBe(JSON.stringify({ city: 'Sarajevo' }));
    expect(row.new_values).toBe(JSON.stringify({ city: 'Mostar' }));
  });

  it('records the IP of a login', () => {
    const row = toAuditRow(
      event(
        'user.logged_in',
        {
          userId: ADMIN.id,
          sessionId: '33333333-3333-4333-8333-333333333333',
          ip: '10.0.0.1',
          actor: ADMIN,
        },
        null,
      ),
    );
    expect(row).toMatchObject({
      entity_type: 'user',
      entity_id: ADMIN.id,
      ip_address: '10.0.0.1',
      venue_id: null,
    });
  });

  it('keeps an unknown payload whole instead of dropping it', () => {
    const row = toAuditRow(event('venue.something_new', { foo: 1 }));
    expect(row).toMatchObject({ action: 'venue.something_new', entity_type: 'venue' });
    expect(row.new_values).toContain('"foo":1');
    expect(row.actor_id).toBeUndefined();
  });

  it('maps menu changes with the item name and old and new price', () => {
    const row = toAuditRow({
      ...event('item.updated', {
        venueId: VENUE,
        entityId: '44444444-4444-4444-8444-444444444444',
        entityName: 'Espresso',
        before: { price: '2.00' },
        after: { price: '2.20' },
        actor: ADMIN,
      }),
      source: 'catalog',
    });
    expect(row).toMatchObject({
      event_id: 'catalog:42',
      service: 'catalog',
      entity_type: 'item',
      entity_id: '44444444-4444-4444-8444-444444444444',
      actor_label: ADMIN.label,
      old_values: JSON.stringify({ price: '2.00' }),
      new_values: JSON.stringify({ price: '2.20', name: 'Espresso' }),
    });
  });

  it('records the venue of a staff login', () => {
    const row = toAuditRow(
      event(
        'user.logged_in',
        {
          userId: ADMIN.id,
          sessionId: '33333333-3333-4333-8333-333333333333',
          ip: null,
          venueId: VENUE,
          venueName: 'Fildžan',
          actor: ADMIN,
        },
        VENUE,
      ),
    );
    expect(row).toMatchObject({ venue_id: VENUE, venue_label: 'Fildžan' });
  });
});
