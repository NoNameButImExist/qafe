import type { Floor, KdsView, Menu, StaffOrderList, StaffSessionDetail } from '@qafe/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

// Realtime invalidates these on every change; polling only covers a dropped socket.
const live = { staleTime: 5_000, refetchInterval: 30_000 } as const;

export const floorQuery = queryOptions({
  queryKey: ['floor'],
  queryFn: () => api<Floor>('/staff/floor'),
  ...live,
});

export const ordersQuery = queryOptions({
  queryKey: ['orders'],
  queryFn: () => api<StaffOrderList>('/staff/orders'),
  ...live,
});

export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ['session', id],
    queryFn: () => api<StaffSessionDetail>(`/staff/sessions/${id}`),
    ...live,
  });

export const menuQuery = queryOptions({
  queryKey: ['menu'],
  queryFn: () => api<Menu>('/catalog/menu'),
  staleTime: 60_000,
});

/** KDS screen of one station (or all); realtime refetches it, polling covers a dropped socket. */
export const kdsQuery = (station?: string) =>
  queryOptions({
    queryKey: ['kds', station ?? 'all'],
    queryFn: () => api<KdsView>('/staff/kds', { query: { station } }),
    staleTime: 2_000,
    refetchInterval: 15_000,
  });
