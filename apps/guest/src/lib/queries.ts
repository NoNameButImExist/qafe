import type { GuestMenu, GuestSessionState, GuestVenue } from '@qafe/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const venueQuery = queryOptions({
  queryKey: ['venue'],
  queryFn: () => api<GuestVenue>('GET', '/guest/venue'),
  staleTime: 60_000,
});

export const menuQuery = queryOptions({
  queryKey: ['menu'],
  queryFn: () => api<GuestMenu>('GET', '/guest/menu'),
  staleTime: 60_000,
});

/** The device's table session, or null when it has none (scan a QR code first). */
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    try {
      return await api<GuestSessionState>('GET', '/guest/session');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'no_session') return null;
      throw error;
    }
  },
  // Realtime pushes changes; polling only covers a dropped socket.
  refetchInterval: 30_000,
  staleTime: 5_000,
});
