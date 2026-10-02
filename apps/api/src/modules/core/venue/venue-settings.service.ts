import { HttpStatus, Injectable } from '@nestjs/common';
import type { StaffClaims } from '@qafe/auth';
import {
  ErrorCode,
  type SaveStationInput,
  type UpdateVenueSettingsInput,
  type VenueSettings,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import { ApiException, notFound } from '../../../common/errors.js';
import { CoreDatabase } from '../core.database.js';
import { publish } from '../outbox.js';

const venueContext = (venueId: string) => ({ venueId, isSuperAdmin: false });

/** Normalises "17", "17,5" or "17.50" to "17.50". */
const decimal = (value: string) => Number(value.replace(',', '.')).toFixed(2);

/** The owner's settings of their own venue (FR-SEF-02..05, FR-SEF-07). */
@Injectable()
export class VenueSettingsService {
  constructor(private readonly db: CoreDatabase) {}

  get(venueId: string): Promise<VenueSettings> {
    return this.db.withTenant(venueContext(venueId), (trx) => this.load(trx, venueId));
  }

  async update(claims: StaffClaims, input: UpdateVenueSettingsInput): Promise<VenueSettings> {
    const venueId = claims.venueId;
    return this.db.withTenant(venueContext(venueId), async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .selectAll()
        .where('id', '=', venueId)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw notFound('Venue not found');

      const columns = {
        name: input.profile?.name,
        phone: input.profile?.phone,
        email: input.profile?.email,
        address: input.profile?.address,
        city: input.profile?.city,
        postal_code: input.profile?.postalCode,
        primary_color: input.profile?.primaryColor,
        guest_ordering_enabled: input.ordering?.guestOrderingEnabled,
        session_verification_mode: input.ordering?.sessionVerificationMode,
        device_approval_required: input.ordering?.deviceApprovalRequired,
        wifi_verification_enabled: input.ordering?.wifiVerificationEnabled,
        order_rejection_enabled: input.ordering?.orderRejectionEnabled,
        vat_rate: input.vatRate === undefined ? undefined : decimal(input.vatRate),
        kds_warning_minutes: input.kds?.warningMinutes,
        kds_critical_minutes: input.kds?.criticalMinutes,
      } as const;

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};
      for (const [column, value] of Object.entries(columns) as [keyof typeof columns, unknown][]) {
        if (value === undefined) continue;
        const raw = current[column];
        const old = typeof raw === 'string' ? raw.trim() : raw;
        if (old === value) continue;
        before[column] = old;
        after[column] = value;
        changes[column] = value;
      }
      if (Object.keys(changes).length) {
        await trx.updateTable('core.venues').set(changes).where('id', '=', venueId).execute();
      }

      if (input.payments) {
        const old = await this.payments(trx, venueId);
        const next = input.payments;
        if (old.cash !== next.cash || old.card !== next.card || old.default !== next.default) {
          // One default at a time (unique index): clear it first, then set the new state.
          await trx
            .updateTable('core.venue_payment_methods')
            .set({ is_default: false })
            .where('venue_id', '=', venueId)
            .execute();
          for (const method of ['cash', 'card'] as const) {
            await trx
              .insertInto('core.venue_payment_methods')
              .values({
                venue_id: venueId,
                method,
                is_enabled: next[method],
                is_default: next.default === method,
                sort_order: method === 'cash' ? 0 : 1,
              })
              .onConflict((oc) =>
                oc.columns(['venue_id', 'method']).doUpdateSet({
                  is_enabled: next[method],
                  is_default: next.default === method,
                }),
              )
              .execute();
          }
          before.payments = old;
          after.payments = next;
        }
      }

      if (input.openingHours) {
        const old = await this.openingHours(trx);
        const next = [...input.openingHours].sort((a, b) => a.day - b.day);
        if (JSON.stringify(old) !== JSON.stringify(next)) {
          await trx
            .deleteFrom('core.venue_opening_hours')
            .where('venue_id', '=', venueId)
            .execute();
          if (next.length) {
            await trx
              .insertInto('core.venue_opening_hours')
              .values(
                next.map((d) => ({
                  venue_id: venueId,
                  day_of_week: d.day,
                  opens_at: d.opensAt,
                  closes_at: d.closesAt,
                })),
              )
              .execute();
          }
          before.opening_hours = old;
          after.opening_hours = next;
        }
      }

      if (Object.keys(after).length) {
        await publish(trx, {
          type: 'venue.updated',
          venueId,
          venueName: (changes.name as string | undefined) ?? current.name,
          before,
          after,
          actor: { id: claims.userId, label: claims.name },
        });
      }
      return this.load(trx, venueId);
    });
  }

  /** FR-SEF-02: sets or clears the logo (the file is already stored). */
  async setLogo(claims: StaffClaims, url: string | null): Promise<VenueSettings> {
    return this.db.withTenant(venueContext(claims.venueId), async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .select(['name', 'logo_url'])
        .where('id', '=', claims.venueId)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('core.venues')
        .set({ logo_url: url })
        .where('id', '=', claims.venueId)
        .execute();
      await publish(trx, {
        type: 'venue.updated',
        venueId: claims.venueId,
        venueName: current.name,
        before: { logo_url: current.logo_url },
        after: { logo_url: url },
        actor: { id: claims.userId, label: claims.name },
      });
      return this.load(trx, claims.venueId);
    });
  }

  private async load(trx: Tx, venueId: string): Promise<VenueSettings> {
    const v = await trx
      .selectFrom('core.venues')
      .selectAll()
      .where('id', '=', venueId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!v) throw notFound('Venue not found');
    const modules = await trx
      .selectFrom('core.venue_modules')
      .select('module_code')
      .where('venue_id', '=', venueId)
      .orderBy('module_code')
      .execute();
    return {
      id: v.id,
      slug: v.slug,
      status: v.status,
      currency: v.currency.trim(),
      timezone: v.timezone,
      profile: {
        name: v.name,
        phone: v.phone,
        email: v.email,
        address: v.address,
        city: v.city,
        postalCode: v.postal_code,
        primaryColor: v.primary_color?.trim() ?? null,
        logoUrl: v.logo_url,
      },
      ordering: {
        guestOrderingEnabled: v.guest_ordering_enabled,
        sessionVerificationMode: v.session_verification_mode,
        deviceApprovalRequired: v.device_approval_required,
        wifiVerificationEnabled: v.wifi_verification_enabled,
        orderRejectionEnabled: v.order_rejection_enabled,
      },
      vatRate: v.vat_rate,
      payments: await this.payments(trx, venueId),
      modules: modules.map((m) => m.module_code),
      openingHours: await this.openingHours(trx),
      networks: await this.networks(trx),
      stations: await this.stations(trx),
      kds: { warningMinutes: v.kds_warning_minutes, criticalMinutes: v.kds_critical_minutes },
    };
  }

  /** FR-GOS-28: adds a network (the caller's own address when none is given). */
  async addNetwork(
    claims: StaffClaims,
    network: string,
    label: string | undefined,
  ): Promise<VenueSettings> {
    return this.db.withTenant(venueContext(claims.venueId), async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .select('name')
        .where('id', '=', claims.venueId)
        .executeTakeFirstOrThrow();
      // inet → cidr zeroes host bits, so "10.0.0.5/24" is stored as 10.0.0.0/24.
      const valid = await sql<{ ok: boolean }>`
        select ${network}::text ~ '^[0-9a-fA-F:./]+$' and pg_input_is_valid(${network}, 'inet') as ok
      `.execute(trx);
      if (!valid.rows[0]?.ok) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.validationFailed,
          'Invalid network',
        );
      }
      const added = await trx
        .insertInto('core.venue_networks')
        .values({
          venue_id: claims.venueId,
          network: sql<string>`cidr(${network}::inet)`,
          label: label ?? null,
        })
        .onConflict((oc) => oc.columns(['venue_id', 'network']).doNothing())
        .returning('network')
        .executeTakeFirst();
      if (added) {
        await publish(trx, {
          type: 'venue.updated',
          venueId: claims.venueId,
          venueName: current.name,
          before: {},
          after: { network_added: added.network },
          actor: { id: claims.userId, label: claims.name },
        });
      }
      return this.load(trx, claims.venueId);
    });
  }

  async removeNetwork(claims: StaffClaims, id: string): Promise<VenueSettings> {
    return this.db.withTenant(venueContext(claims.venueId), async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .select('name')
        .where('id', '=', claims.venueId)
        .executeTakeFirstOrThrow();
      const removed = await trx
        .deleteFrom('core.venue_networks')
        .where('id', '=', id)
        .returning('network')
        .executeTakeFirst();
      if (!removed) throw notFound('Network not found');
      await publish(trx, {
        type: 'venue.updated',
        venueId: claims.venueId,
        venueName: current.name,
        before: { network_removed: removed.network },
        after: {},
        actor: { id: claims.userId, label: claims.name },
      });
      return this.load(trx, claims.venueId);
    });
  }

  /** FR-SEF-12: preparation stations for the KDS module. */
  async saveStation(
    claims: StaffClaims,
    id: string | null,
    input: SaveStationInput,
  ): Promise<VenueSettings> {
    return this.db.withTenant(venueContext(claims.venueId), async (trx) => {
      const venue = await trx
        .selectFrom('core.venues')
        .select('name')
        .where('id', '=', claims.venueId)
        .executeTakeFirstOrThrow();
      const taken = await trx
        .selectFrom('core.prep_stations')
        .select('id')
        .where('name', '=', input.name)
        .$if(id !== null, (q) => q.where('id', '!=', id!))
        .executeTakeFirst();
      if (taken) throw new ApiException(HttpStatus.CONFLICT, ErrorCode.labelTaken, 'Name taken');
      if (id) {
        const updated = await trx
          .updateTable('core.prep_stations')
          .set({
            name: input.name,
            type: input.type,
            ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
          })
          .where('id', '=', id)
          .returning('id')
          .executeTakeFirst();
        if (!updated) throw notFound('Station not found');
      } else {
        await trx
          .insertInto('core.prep_stations')
          .values({ venue_id: claims.venueId, name: input.name, type: input.type })
          .execute();
      }
      await publish(trx, {
        type: 'venue.updated',
        venueId: claims.venueId,
        venueName: venue.name,
        before: {},
        after: { station: input.name },
        actor: { id: claims.userId, label: claims.name },
      });
      return this.load(trx, claims.venueId);
    });
  }

  private async stations(trx: Tx): Promise<VenueSettings['stations']> {
    const rows = await trx
      .selectFrom('core.prep_stations')
      .select(['id', 'name', 'type', 'is_active'])
      .orderBy('name')
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, isActive: r.is_active }));
  }

  private async networks(trx: Tx): Promise<VenueSettings['networks']> {
    const rows = await trx
      .selectFrom('core.venue_networks')
      .select(['id', 'network', 'label'])
      .orderBy('created_at')
      .execute();
    return rows.map((r) => ({ id: r.id, network: displayNetwork(r.network), label: r.label }));
  }

  private async openingHours(trx: Tx): Promise<VenueSettings['openingHours']> {
    const rows = await trx
      .selectFrom('core.venue_opening_hours')
      .select(['day_of_week', 'opens_at', 'closes_at'])
      .orderBy('day_of_week')
      .orderBy('opens_at')
      .execute();
    return rows.map((r) => ({
      day: r.day_of_week,
      opensAt: r.opens_at.slice(0, 5),
      closesAt: r.closes_at.slice(0, 5),
    }));
  }

  private async payments(trx: Tx, venueId: string): Promise<VenueSettings['payments']> {
    const rows = await trx
      .selectFrom('core.venue_payment_methods')
      .select(['method', 'is_enabled', 'is_default'])
      .where('venue_id', '=', venueId)
      .execute();
    const enabled = (m: string) => rows.some((r) => r.method === m && r.is_enabled);
    const def = rows.find((r) => r.is_default)?.method;
    return {
      cash: enabled('cash'),
      card: enabled('card'),
      default: def === 'card' ? 'card' : 'cash',
    };
  }
}

/** "203.0.113.7/32" reads better as "203.0.113.7"; ranges keep their prefix. */
function displayNetwork(network: string): string {
  return network.replace(/\/(32|128)$/, '');
}
