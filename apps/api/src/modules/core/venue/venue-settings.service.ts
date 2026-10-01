import { Injectable } from '@nestjs/common';
import type { StaffClaims } from '@qafe/auth';
import type { UpdateVenueSettingsInput, VenueSettings } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { notFound } from '../../../common/errors.js';
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
        order_rejection_enabled: input.ordering?.orderRejectionEnabled,
        vat_rate: input.vatRate === undefined ? undefined : decimal(input.vatRate),
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
        orderRejectionEnabled: v.order_rejection_enabled,
      },
      vatRate: v.vat_rate,
      payments: await this.payments(trx, venueId),
      modules: modules.map((m) => m.module_code),
    };
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
