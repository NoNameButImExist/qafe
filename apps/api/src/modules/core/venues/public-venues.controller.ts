import { Controller, Get, Param } from '@nestjs/common';
import { VenueSlug, type PublicVenue } from '@qafe/contracts';
import { notFound } from '../../../common/errors.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { VenueDirectory } from '../venue-directory.js';

@Controller('venues')
export class PublicVenuesController {
  constructor(private readonly venues: VenueDirectory) {}

  /** What a guest may see before the venue is known (tenant from the subdomain). */
  @Get(':slug/public')
  async bySlug(@Param('slug', new ZodPipe(VenueSlug)) slug: string): Promise<PublicVenue> {
    const venue = await this.venues.resolveVenue(slug);
    if (!venue || venue.status === 'pending') throw notFound('Venue not found');
    return {
      slug: venue.slug,
      name: venue.name,
      status: venue.status,
      logoUrl: venue.logoUrl,
      primaryColor: venue.primaryColor,
      defaultLanguage: venue.defaultLanguage,
      currency: venue.currency,
      guestOrderingEnabled: venue.guestOrderingEnabled,
    };
  }
}
