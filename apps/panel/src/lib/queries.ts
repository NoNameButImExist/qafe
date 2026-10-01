import type {
  DayOrderList,
  Menu,
  ReportSummary,
  VenueSettings,
  VenueSpace,
  VenueStaff,
} from '@qafe/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const menuQuery = queryOptions({
  queryKey: ['menu'],
  queryFn: () => api<Menu>('/catalog/menu'),
});

export const settingsQuery = queryOptions({
  queryKey: ['venue'],
  queryFn: () => api<VenueSettings>('/venue'),
});

export const spaceQuery = queryOptions({
  queryKey: ['space'],
  queryFn: () => api<VenueSpace>('/venue/tables'),
});

export const staffQuery = queryOptions({
  queryKey: ['staff'],
  queryFn: () => api<VenueStaff>('/venue/staff'),
});

/** All orders of a business day (FR-SEF-23); today's when no date is given. */
export const dayOrdersQuery = (date?: string) =>
  queryOptions({
    queryKey: ['orders', 'day', date ?? 'today'],
    queryFn: () => api<DayOrderList>('/staff/orders/day', { query: { date } }),
    refetchInterval: 15_000,
  });

export const reportQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ['reports', from, to],
    queryFn: () => api<ReportSummary>('/reports/summary', { query: { from, to } }),
    staleTime: 60_000,
  });
