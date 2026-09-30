import { Injectable } from '@nestjs/common';
import { CoreDatabase } from './core.database.js';

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
}
