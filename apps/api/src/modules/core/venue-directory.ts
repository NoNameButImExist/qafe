import { Injectable } from '@nestjs/common';
import type { PaymentMethod, VenueStatus, VerificationMode } from '@qafe/contracts';
import { sql } from 'kysely';
import { CoreDatabase } from './core.database.js';

/** Public data of a venue, found by slug before the tenant is known. */
export interface ResolvedVenue {
  venueId: string;
  slug: string;
  name: string;
  status: VenueStatus;
  logoUrl: string | null;
  primaryColor: string | null;
  defaultLanguage: string;
  currency: string;
  timezone: string;
  guestOrderingEnabled: boolean;
}

/** A table found by its QR token (FR-GOS-01). Rotated tokens no longer resolve (FR-GOS-02). */
export interface ResolvedTable {
  tableId: string;
  venueId: string;
  venueSlug: string;
  tableLabel: string;
}

/** Venue settings the ordering module works with (FR-SEF-03..07, FR-GOS-21, 22, 26). */
export interface OrderingSettings {
  status: VenueStatus;
  guestOrderingEnabled: boolean;
  vatRate: string;
  timezone: string;
  /** "06:00:00": orders before this time belong to the previous business day. */
  businessDayStartsAt: string;
  verificationMode: VerificationMode;
  deviceApprovalRequired: boolean;
  deviceBlockHours: number;
  orderRejectionEnabled: boolean;
  paymentMethods: { method: PaymentMethod; isDefault: boolean }[];
}

/** Areas and active tables of a venue, in display order (FR-KON-15). */
export interface FloorPlan {
  areas: { id: string; name: string }[];
  tables: { id: string; label: string; areaId: string | null; seats: number | null }[];
}

interface ResolveVenueRow {
  venue_id: string;
  slug: string;
  name: string;
  status: VenueStatus;
  logo_url: string | null;
  primary_color: string | null;
  default_language: string;
  currency: string;
  timezone: string;
  guest_ordering_enabled: boolean;
}

interface ResolveTableRow {
  table_id: string;
  venue_id: string;
  venue_slug: string;
  table_label: string;
}

/** What other modules may ask the core module about venues (public interface). */
@Injectable()
export class VenueDirectory {
  constructor(private readonly db: CoreDatabase) {}

  /** True when the venue exists and is not deleted. For admin routes that take a venue id. */
  async exists(venueId: string): Promise<boolean> {
    const row = await this.db.withTenant({ venueId, isSuperAdmin: false }, (trx) =>
      trx
        .selectFrom('core.venues')
        .select('id')
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst(),
    );
    return row !== undefined;
  }

  /**
   * The venue of a subdomain. RLS hides venues until venue_id is set, so the lookup goes
   * through core.resolve_venue (SECURITY DEFINER, public columns only).
   */
  async resolveVenue(slug: string): Promise<ResolvedVenue | null> {
    const row = await this.db.withTenant({ venueId: null, isSuperAdmin: false }, async (trx) => {
      const { rows } =
        await sql<ResolveVenueRow>`select * from core.resolve_venue(${slug})`.execute(trx);
      return rows[0];
    });
    if (!row) return null;
    return {
      venueId: row.venue_id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color?.trim() ?? null,
      defaultLanguage: row.default_language,
      currency: row.currency.trim(),
      timezone: row.timezone,
      guestOrderingEnabled: row.guest_ordering_enabled,
    };
  }

  /** The active table with this QR token, through core.resolve_table. */
  async resolveTable(qrToken: string): Promise<ResolvedTable | null> {
    const row = await this.db.withTenant({ venueId: null, isSuperAdmin: false }, async (trx) => {
      const { rows } = await sql<ResolveTableRow>`
        select table_id, venue_id, venue_slug, table_label from core.resolve_table(${qrToken})
      `.execute(trx);
      return rows[0];
    });
    return row
      ? {
          tableId: row.table_id,
          venueId: row.venue_id,
          venueSlug: row.venue_slug,
          tableLabel: row.table_label,
        }
      : null;
  }

  async orderingSettings(venueId: string): Promise<OrderingSettings | null> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const venue = await trx
        .selectFrom('core.venues')
        .select([
          'status',
          'guest_ordering_enabled',
          'vat_rate',
          'timezone',
          'business_day_starts_at',
          'session_verification_mode',
          'device_approval_required',
          'device_block_hours',
          'order_rejection_enabled',
        ])
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!venue) return null;
      const methods = await trx
        .selectFrom('core.venue_payment_methods')
        .select(['method', 'is_default'])
        .where('venue_id', '=', venueId)
        .where('is_enabled', '=', true)
        .orderBy('sort_order')
        .execute();
      return {
        status: venue.status,
        guestOrderingEnabled: venue.guest_ordering_enabled,
        vatRate: venue.vat_rate,
        timezone: venue.timezone,
        businessDayStartsAt: venue.business_day_starts_at,
        verificationMode: venue.session_verification_mode,
        deviceApprovalRequired: venue.device_approval_required,
        deviceBlockHours: venue.device_block_hours,
        orderRejectionEnabled: venue.order_rejection_enabled,
        paymentMethods: methods.map((m) => ({ method: m.method, isDefault: m.is_default })),
      };
    });
  }

  async floorPlan(venueId: string): Promise<FloorPlan> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const areas = await trx
        .selectFrom('core.areas')
        .select(['id', 'name'])
        .where('is_active', '=', true)
        .orderBy('sort_order')
        .orderBy('name')
        .execute();
      const tables = await trx
        .selectFrom('core.tables')
        .select(['id', 'label', 'area_id', 'seats'])
        .where('is_active', '=', true)
        .execute();
      // Natural order: 2 before 10.
      const collator = new Intl.Collator('bs', { numeric: true });
      tables.sort((a, b) => collator.compare(a.label, b.label));
      return {
        areas,
        tables: tables.map((t) => ({
          id: t.id,
          label: t.label,
          areaId: t.area_id,
          seats: t.seats,
        })),
      };
    });
  }

  /** One active table of the venue, or null. */
  async table(venueId: string, tableId: string): Promise<{ id: string; label: string } | null> {
    const row = await this.db.withTenant({ venueId, isSuperAdmin: false }, (trx) =>
      trx
        .selectFrom('core.tables')
        .select(['id', 'label'])
        .where('id', '=', tableId)
        .where('is_active', '=', true)
        .executeTakeFirst(),
    );
    return row ?? null;
  }
}
