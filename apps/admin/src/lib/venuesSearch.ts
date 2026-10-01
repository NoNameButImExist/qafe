import type { VenueStatus } from '@qafe/contracts';

export const VENUE_STATUSES: VenueStatus[] = ['active', 'pending', 'suspended', 'closed'];

/** Venues list filters, kept in the URL so they survive reloads and can be shared. */
export interface VenuesSearch {
  q?: string;
  status?: VenueStatus;
  city?: string;
  page?: number;
  create?: boolean;
}

export function validateVenuesSearch(search: Record<string, unknown>): VenuesSearch {
  const status = VENUE_STATUSES.find((s) => s === search.status);
  const page = Number(search.page);
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    status,
    city: typeof search.city === 'string' && search.city ? search.city : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    create: search.create === true || search.create === 'true' ? true : undefined,
  };
}
