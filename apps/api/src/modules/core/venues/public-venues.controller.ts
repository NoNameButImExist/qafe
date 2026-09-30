import { Controller, Get, Param } from '@nestjs/common';
import { VenueSlug, type PublicVenue } from '@qafe/contracts';
import { sql } from 'kysely';
import { notFound } from '../../../common/errors.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { CoreDatabase } from '../core.database.js';

interface ResolvedVenue {
  slug: string;
  name: string;
  status: PublicVenue['status'];
  logo_url: string | null;
  primary_color: string | null;
  default_language: string;
  currency: string;
  guest_ordering_enabled: boolean;
}

@Controller('venues')
export class PublicVenuesController {
  constructor(private readonly db: CoreDatabase) {}

  /** What a guest may see before the venue is known (tenant from the subdomain). */
  @Get(':slug/public')
  async bySlug(@Param('slug', new ZodPipe(VenueSlug)) slug: string): Promise<PublicVenue> {
    // RLS hides venues until venue_id is set, so the lookup goes through core.resolve_venue.
    const venue = await this.db.withTenant({ venueId: null, isSuperAdmin: false }, async (trx) => {
      const { rows } = await sql<ResolvedVenue>`select * from core.resolve_venue(${slug})`.execute(
        trx,
      );
      return rows[0];
    });
    if (!venue || venue.status === 'pending') throw notFound('Venue not found');
    return {
      slug: venue.slug,
      name: venue.name,
      status: venue.status,
      logoUrl: venue.logo_url,
      primaryColor: venue.primary_color?.trim() ?? null,
      defaultLanguage: venue.default_language,
      currency: venue.currency.trim(),
      guestOrderingEnabled: venue.guest_ordering_enabled,
    };
  }
}
