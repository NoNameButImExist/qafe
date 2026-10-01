export interface PublicVenue {
  slug: string;
  name: string;
  city: string;
}

// Venues shown in "Where you can order with qafe". Empty until the first venues go live.
// TODO(phase 3+): load from the public venue list in the api instead of this file.
export const venues: PublicVenue[] = [];
